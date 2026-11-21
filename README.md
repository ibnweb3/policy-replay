# Policy Replay

**An AI agent proposes a payment. Its spending policy decides. A zero-knowledge proof shows the decision came from that exact policy code, and zkVerify verifies the proof on-chain.**

Built for the Agent Games Creator Track (zkVerify), November 2026. #AgentGames

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
- The demo addresses are made up for the demo; the proofs and zkVerify transactions are real (testnet).
- Policy is deliberately small: per-transfer cap, daily limit, allowlist, minimum gap between payments.

## Demo run

| # | Proposal | Decision | Reason |
|---|---|---|---|
| 01 | 300 to design contractor (allowlisted) | APPROVE | OK |
| 02 | 250 to a new address "from an email" | REJECT | RECIPIENT_NOT_ALLOWLISTED |
| 03 | 650 to hosting (allowlisted) | REJECT | OVER_PER_TRANSFER_CAP |
| 04 | 450 to hosting | APPROVE | OK |
| 05 | 400 to design contractor | REJECT | OVER_DAILY_LIMIT (750 + 400 > 1000) |

zkVerify transactions: see `runs/*/zkverify.json` (filled in after submission).

## Run it

Requirements: Linux or WSL, Rust, RISC Zero toolchain 3.1 (`rzup install cargo-risczero 3.1.0`, `rzup install r0vm 3.1.0`), Node 20+.

Why 3.1: every risc0-zkvm 2.x release was yanked from crates.io after CVE-2025-61588 (a guest memory-safety bug).
zkVerify's Risc0 pallet has a `V3_0` proof variant, so the receipt is submitted as V3_0.

```bash
bash scripts/run-demo.sh                 # proves all five proposals, chained (no dev mode)
echo 'KURIER_API_KEY=...' > .env         # testnet key from testnet.kurier.xyz, never commit it
for r in runs/*; do node scripts/submit.mjs "$r"; done
node scripts/check-chain.mjs
```

## Layout

- `methods/guest/src/main.rs`: the policy (what is proven)
- `host/src/main.rs`: runs the prover, checks the receipt locally, writes `proof.json` in zkVerify's Risc0 format
- `scripts/submit.mjs`: registers the image ID and submits through Kurier, waits for `Finalized`
- `scripts/check-chain.mjs`: verifies the chain of decisions
