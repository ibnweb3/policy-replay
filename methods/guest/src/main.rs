//! Policy Replay guest: the agent's spending policy, as plain Rust.
//!
//! An AI agent *proposes* a payment. This program *decides* (APPROVE or REJECT
//! with a reason) and commits a 142-byte journal. The Risc0 receipt proves that
//! this exact program (its image ID) produced that decision from those inputs.
//!
//! Private inputs: the policy (limits + allowlist), the running state, the proposal.
//! Public journal: hashes of all three, the next state hash, decision, reason, seq.
//! Because every journal carries state_before and state_after, receipts chain:
//! receipt n+1 must start from the state receipt n ended on.

use risc0_zkvm::guest::env;
use sha2::{Digest, Sha256};

const APPROVE: u8 = 1;
const REJECT: u8 = 0;

// reason codes (journal byte)
const OK: u8 = 0;
const OVER_PER_TRANSFER_CAP: u8 = 1;
const OVER_DAILY_LIMIT: u8 = 2;
const RECIPIENT_NOT_ALLOWLISTED: u8 = 3;
const TOO_SOON_AFTER_LAST: u8 = 4;
const CLOCK_WENT_BACKWARDS: u8 = 5;
const ZERO_AMOUNT: u8 = 6;

fn sha(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

fn state_hash(day: u64, spent: u64, last_ts: u64, seq: u64) -> [u8; 32] {
    let mut b = Vec::with_capacity(40);
    b.extend_from_slice(b"PRst");
    for v in [day, spent, last_ts, seq] {
        b.extend_from_slice(&v.to_le_bytes());
    }
    sha(&b)
}

fn main() {
    // ---- policy (private, committed by hash) ----
    let max_per_transfer: u64 = env::read();
    let daily_limit: u64 = env::read();
    let min_gap_secs: u64 = env::read();
    let allowlist: Vec<String> = env::read();

    // ---- running state (private, committed by hash) ----
    let day: u64 = env::read();
    let spent_today: u64 = env::read();
    let last_ts: u64 = env::read();
    let seq: u64 = env::read();

    // ---- the agent's proposal (private, committed by hash) ----
    let recipient: String = env::read();
    let amount: u64 = env::read();
    let ts: u64 = env::read();
    let memo: String = env::read();

    // canonical encodings for the commitments
    let mut pol = Vec::new();
    pol.extend_from_slice(b"PRpo");
    pol.extend_from_slice(&max_per_transfer.to_le_bytes());
    pol.extend_from_slice(&daily_limit.to_le_bytes());
    pol.extend_from_slice(&min_gap_secs.to_le_bytes());
    for a in &allowlist {
        pol.extend_from_slice(&(a.len() as u64).to_le_bytes());
        pol.extend_from_slice(a.to_lowercase().as_bytes());
    }
    let policy_hash = sha(&pol);

    let mut pr = Vec::new();
    pr.extend_from_slice(b"PRpr");
    pr.extend_from_slice(&(recipient.len() as u64).to_le_bytes());
    pr.extend_from_slice(recipient.to_lowercase().as_bytes());
    pr.extend_from_slice(&amount.to_le_bytes());
    pr.extend_from_slice(&ts.to_le_bytes());
    pr.extend_from_slice(&(memo.len() as u64).to_le_bytes());
    pr.extend_from_slice(memo.as_bytes());
    let proposal_hash = sha(&pr);

    let before = state_hash(day, spent_today, last_ts, seq);

    // ---- the policy itself ----
    let today = ts / 86_400;
    let spent_base = if today == day { spent_today } else { 0 };
    let rcpt = recipient.to_lowercase();

    let reason = if amount == 0 {
        ZERO_AMOUNT
    } else if seq > 0 && ts < last_ts {
        CLOCK_WENT_BACKWARDS
    } else if !allowlist.iter().any(|a| a.to_lowercase() == rcpt) {
        RECIPIENT_NOT_ALLOWLISTED
    } else if amount > max_per_transfer {
        OVER_PER_TRANSFER_CAP
    } else if spent_base.saturating_add(amount) > daily_limit {
        OVER_DAILY_LIMIT
    } else if seq > 0 && ts.saturating_sub(last_ts) < min_gap_secs {
        TOO_SOON_AFTER_LAST
    } else {
        OK
    };
    let decision = if reason == OK { APPROVE } else { REJECT };

    // every decision (approve or reject) advances seq, so the log has no gaps;
    // only approvals move money
    let (n_day, n_spent, n_last) = if decision == APPROVE {
        (today, spent_base + amount, ts)
    } else {
        (day, spent_today, last_ts)
    };
    let after = state_hash(n_day, n_spent, n_last, seq + 1);

    // ---- journal: 4 + 32*4 + 1 + 1 + 8 = 142 bytes ----
    let mut j = Vec::with_capacity(142);
    j.extend_from_slice(b"PRv1");
    j.extend_from_slice(&policy_hash);
    j.extend_from_slice(&proposal_hash);
    j.extend_from_slice(&before);
    j.extend_from_slice(&after);
    j.push(decision);
    j.push(reason);
    j.extend_from_slice(&seq.to_le_bytes());
    env::commit_slice(&j);
}
