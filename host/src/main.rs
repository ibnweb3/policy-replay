//! policy-replay: run the agent's policy inside the Risc0 zkVM and write a proof
//! in the format zkVerify / Kurier expect.
//!
//! usage: policy-replay <policy.json> <state.json> <proposal.json> <out_dir>
//!
//! Writes into out_dir:
//!   proof.json      { proof, image_id, pub_inputs }   (hex, zkVerify Risc0 format)
//!   decision.json   human-readable decision + the hashes from the journal
//!   next_state.json the state the next proposal must start from
use anyhow::{bail, Context, Result};
use methods::{POLICY_GUEST_ELF, POLICY_GUEST_ID};
use risc0_zkvm::{default_prover, ExecutorEnv, ProverOpts};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

#[derive(Deserialize)]
struct Policy {
    max_per_transfer: u64,
    daily_limit: u64,
    min_gap_secs: u64,
    allowlist: Vec<String>,
}

#[derive(Deserialize, Serialize, Clone, Copy)]
struct State {
    day: u64,
    spent_today: u64,
    last_ts: u64,
    seq: u64,
}

#[derive(Deserialize)]
struct Proposal {
    recipient: String,
    amount: u64,
    ts: u64,
    memo: String,
}

#[derive(Serialize)]
struct ZkvProof {
    proof: String,
    image_id: String,
    pub_inputs: String,
}

const REASONS: [&str; 7] = [
    "OK",
    "OVER_PER_TRANSFER_CAP",
    "OVER_DAILY_LIMIT",
    "RECIPIENT_NOT_ALLOWLISTED",
    "TOO_SOON_AFTER_LAST",
    "CLOCK_WENT_BACKWARDS",
    "ZERO_AMOUNT",
];

fn state_hash(s: &State) -> [u8; 32] {
    let mut b = Vec::with_capacity(36);
    b.extend_from_slice(b"PRst");
    for v in [s.day, s.spent_today, s.last_ts, s.seq] {
        b.extend_from_slice(&v.to_le_bytes());
    }
    Sha256::digest(&b).into()
}

fn read<T: for<'de> Deserialize<'de>>(p: &str) -> Result<T> {
    serde_json::from_str(&fs::read_to_string(p).with_context(|| format!("read {p}"))?)
        .with_context(|| format!("parse {p}"))
}

fn main() -> Result<()> {
    let a: Vec<String> = std::env::args().collect();
    if a.len() != 5 {
        bail!("usage: policy-replay <policy.json> <state.json> <proposal.json> <out_dir>");
    }
    if std::env::var("RISC0_DEV_MODE").map(|v| v != "0").unwrap_or(false) {
        bail!("RISC0_DEV_MODE is set: dev-mode receipts are fake and zkVerify will reject them");
    }
    let pol: Policy = read(&a[1])?;
    let st: State = read(&a[2])?;
    let pr: Proposal = read(&a[3])?;
    let out = Path::new(&a[4]);
    fs::create_dir_all(out)?;

    let env = ExecutorEnv::builder()
        .write(&pol.max_per_transfer)?
        .write(&pol.daily_limit)?
        .write(&pol.min_gap_secs)?
        .write(&pol.allowlist)?
        .write(&st.day)?
        .write(&st.spent_today)?
        .write(&st.last_ts)?
        .write(&st.seq)?
        .write(&pr.recipient)?
        .write(&pr.amount)?
        .write(&pr.ts)?
        .write(&pr.memo)?
        .segment_limit_po2(19)
        .build()?;

    let t0 = std::time::Instant::now();
    let receipt = default_prover()
        .prove_with_opts(env, POLICY_GUEST_ELF, &ProverOpts::succinct())?
        .receipt;
    let secs = t0.elapsed().as_secs_f64();
    receipt.verify(POLICY_GUEST_ID).context("local receipt verification failed")?;

    // ---- decode the journal ----
    let j = receipt.journal.bytes.clone();
    if j.len() != 142 || &j[0..4] != b"PRv1" {
        bail!("unexpected journal ({} bytes)", j.len());
    }
    let h = |o: usize| hex::encode(&j[o..o + 32]);
    let decision = j[132];
    let reason = j[133] as usize;
    let seq = u64::from_le_bytes(j[134..142].try_into()?);

    // ---- next state, recomputed here and checked against the proven hash ----
    if state_hash(&st) != j[68..100] {
        bail!("state.json does not match the state hash the guest committed");
    }
    let today = pr.ts / 86_400;
    let next = if decision == 1 {
        let base = if today == st.day { st.spent_today } else { 0 };
        State { day: today, spent_today: base + pr.amount, last_ts: pr.ts, seq: st.seq + 1 }
    } else {
        State { seq: st.seq + 1, ..st }
    };
    if state_hash(&next) != j[100..132] {
        bail!("host/guest disagree on the next state");
    }

    // ---- zkVerify format: the pallet expects the InnerReceipt serialized with ciborium
    // (docs.zkverify.io/architecture/verification_pallets/risc0), journal bytes as pubs ----
    let mut bin = Vec::new();
    ciborium::into_writer(&receipt.inner, &mut bin)?;
    let image_id = hex::encode(POLICY_GUEST_ID.iter().flat_map(|v| v.to_le_bytes()).collect::<Vec<u8>>());
    let zp = ZkvProof {
        proof: format!("0x{}", hex::encode(&bin)),
        image_id: format!("0x{image_id}"),
        pub_inputs: format!("0x{}", hex::encode(&j)),
    };
    fs::write(out.join("proof.json"), serde_json::to_string_pretty(&zp)?)?;
    fs::write(out.join("next_state.json"), serde_json::to_string_pretty(&next)?)?;
    let dec = serde_json::json!({
        "seq": seq,
        "decision": if decision == 1 { "APPROVE" } else { "REJECT" },
        "reason": REASONS.get(reason).copied().unwrap_or("UNKNOWN"),
        "recipient": pr.recipient,
        "amount": pr.amount,
        "memo": pr.memo,
        "image_id": format!("0x{image_id}"),
        "policy_hash": format!("0x{}", h(4)),
        "proposal_hash": format!("0x{}", h(36)),
        "state_before": format!("0x{}", h(68)),
        "state_after": format!("0x{}", h(100)),
        "prove_seconds": (secs * 10.0).round() / 10.0,
        "proof_bytes": bin.len(),
    });
    fs::write(out.join("decision.json"), serde_json::to_string_pretty(&dec)?)?;
    println!("{}", serde_json::to_string_pretty(&dec)?);
    Ok(())
}
