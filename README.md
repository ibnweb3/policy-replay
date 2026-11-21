# Policy Replay

**An AI agent proposes a payment. Its spending policy decides. A zero-knowledge proof shows the decision came from that exact policy code, and zkVerify verifies the proof on-chain.**

Built for the Agent Games Creator Track (zkVerify), November 2026. #AgentGames

Web page: **https://ibnweb3.github.io/policy-replay/** (source `docs/`: replay of the five decisions, the log with zkVerify links, and an in-browser check that recomputes every committed hash). Rebuild its data with `node scripts/build-site-data.mjs`.

## The problem

Agents that move money are usually guarded by a "policy": spend caps, allowlists, rate limits. But from the outside you cannot tell whether the policy actually ran, which version ran, or whether someone quietly edited it. The agent's log says "approved under policy", and that is a claim, not a result.

## What this does

1. An agent (any agent or LLM) **proposes** a payment: recipient, amount, time, memo.
2. The policy, written as ordinary Rust, **decides**: `APPROVE`, or `REJECT` with a reason
   (`RECIPIENT_NOT_ALLOWLISTED`, `OVER_PER_TRANSFER_CAP`, `OVER_DAILY_LIMIT`, `TOO_SOON_AFTER_LAST`, ...).
3. The policy runs inside the **RISC Zero zkVM**. The receipt proves that the program with image ID `X`
   produced this decision from these inputs. Change one line of the policy and the image ID changes.
4. The receipt is sent to **zkVerify**, which verifies the Risc0 proof natively and records it on-chain.
5. Every decision commits `state_before` and `state_after`, so the receipts form a **chain**: decision n+1
   must start from the exact state decision n ended on. Rejections are logged too, so a gap or a skipped
   rejection breaks the chain. `scripts/check-chain.mjs` checks this.

What stays private: the allowlist, the limits, the running spend, and the proposal itself. They are committed by hash only.
What is public: the policy program's fingerprint (image ID), the hashes, the decision and the reason.

## Why zkVerify

zkVerify verifies RISC Zero (and SP1, Plonky2) STARK proofs **natively**. On an EVM chain a zkVM receipt has to be
wrapped into a Groth16 proof first, an extra proving step that the zkVerify docs describe as adding significant latency.
Here the receipt goes to zkVerify as-is, via the Kurier API, and comes back with a finalized transaction hash.

## Honest limits

- The proof shows the decision followed the policy **given the inputs**. It does not prove the proposal itself was
  sensible, or that the payment was then executed on a payment rail. Wiring execution to the receipt is the next step.
- The demo addresses and the phishing email are made up for the demo; the proofs and zkVerify transactions are real (Volta testnet).
- Proving takes about 2 to 4 minutes per decision on a laptop CPU, so this is for audit trails, not for gating a payment in real time.
- Policy is deliberately small: per-transfer cap, daily limit, allowlist, minimum gap between payments.

## Demo run

| # | Proposal | Decision | Reason | zkVerify testnet tx (Finalized) |
|---|---|---|---|---|
| 01 | 300 to design contractor (allowlisted) | APPROVE | OK | [0xacb50949…](https://zkverify-testnet.subscan.io/extrinsic/0xacb509499cf59cef65068c0e919a7867e2fc2a4f3df6ca871414cf83793f0084) |
| 02 | 250 to a new address "from an email" | REJECT | RECIPIENT_NOT_ALLOWLISTED | [0xf8f9e9d8…](https://zkverify-testnet.subscan.io/extrinsic/0xf8f9e9d86666223f17d4498de1ae8b1e11a4d857e95247f2911aa490ca329564) |
| 03 | 650 to hosting (allowlisted) | REJECT | OVER_PER_TRANSFER_CAP | [0xe66c89db…](https://zkverify-testnet.subscan.io/extrinsic/0xe66c89db631c57a699cff4fbfe4cdc86707c62ff3f0a36acce8afd50f606bf63) |
| 04 | 450 to hosting | APPROVE | OK | [0x5a486471…](https://zkverify-testnet.subscan.io/extrinsic/0x5a48647106cab5acdf6c37265c6c4b15276a198bb608ef6a66427db8ac25e76e) |
| 05 | 400 to design contractor | REJECT | OVER_DAILY_LIMIT | [0x7b18bdda…](https://zkverify-testnet.subscan.io/extrinsic/0x7b18bddab3e5d79acfa0e48a1839923c1ea73690d84abb32c3760a26dba9d870) |

Policy image ID: `0xec49800da2085a076a300aa47ce95a46f4c4631ddab55e22053cb60df032f698` (registered on zkVerify via Kurier; risc0 2.3.2, verifier `V2_3`).
`node scripts/check-chain.mjs` output: `CHAIN OK: every decision is proven, finalized, and continues from the one before.`

## Run it

Requirements: Linux or WSL, Rust, RISC Zero toolchain 2.3.2 (`rzup install cargo-risczero 2.3.2`, `rzup install r0vm 2.3.2`), Node 20+.

Why 2.3.2, pinned in `Cargo.lock`: zkVerify's Risc0 verifier ([risc0-verifier](https://github.com/zkVerify/risc0-verifier)) has contexts up to v3.0.
Receipts from risc0 3.1 fail it (succinct: `control_id mismatch`, composite: `invalid receipt format`, checked with `tools/zkv-check`).
Every risc0-zkvm 2.x and 3.0.x release is yanked on crates.io, so the lockfile pins 2.3.2, the release that fixed
CVE-2025-61588, with crates.io checksums. Yanked crates still install from a lockfile.

```bash
bash scripts/run-demo.sh                 # proves all five proposals into myruns/ (no dev mode; runs/ is never overwritten)
echo 'KURIER_API_KEY=...' > .env         # testnet key from testnet.kurier.xyz, never commit it
for r in myruns/*; do node scripts/submit.mjs "$r"; done
node scripts/check-chain.mjs myruns          # or with no argument, to check the committed runs/
```

## Layout

- `methods/guest/src/main.rs`: the policy (what is proven)
- `host/src/main.rs`: runs the prover, checks the receipt locally, writes `proof.json` in zkVerify's Risc0 format
- `scripts/submit.mjs`: registers the image ID and submits through Kurier, waits for `Finalized`
- `scripts/check-chain.mjs`: verifies the chain of decisions, that each `decision.json` matches its proven journal,
  and that each `proof.json` is byte-for-byte the proof that was submitted (`proofSha256` in `zkverify.json`)
- `runs/`: the five proofs that were submitted, with their zkVerify receipts
- `vk-ec49800da208-V2_3.json`: Kurier's record of the registered policy image ID
- `tools/zkv-check`: verifies a `proof.json` locally with zkVerify's own `risc0-verifier` crate before submitting
