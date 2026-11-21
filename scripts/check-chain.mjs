// Check the whole log: every run's state_before must equal the previous run's state_after,
// seq must count up with no gaps, every run must use the same policy program (image ID) and policy hash,
// and (if submitted) every proof must be Finalized on zkVerify. Prints a table.
// usage: node scripts/check-chain.mjs [runs]
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] || "runs";
const runs = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "decision.json"))).sort();
let prev = null, ok = true;
const rows = [];
for (const r of runs) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, r, "decision.json"), "utf8"));
  const zf = path.join(dir, r, "zkverify.json");
  const z = fs.existsSync(zf) ? JSON.parse(fs.readFileSync(zf, "utf8")) : null;
  const errs = [];
  if (prev) {
    if (d.state_before !== prev.state_after) errs.push("state does not continue from previous run");
    if (d.seq !== prev.seq + 1) errs.push("seq gap");
    if (d.image_id !== prev.image_id) errs.push("different policy program");
    if (d.policy_hash !== prev.policy_hash) errs.push("different policy settings");
  } else if (d.seq !== 0) errs.push("log does not start at seq 0");
  if (!z) errs.push("not submitted to zkVerify");
  else if (z.status !== "Finalized") errs.push(`zkVerify status ${z.status}`);
  if (errs.length) ok = false;
  rows.push({ run: r, seq: d.seq, decision: d.decision, reason: d.reason, amount: d.amount, zkverify: z?.status || "-", tx: z?.txHash ? z.txHash.slice(0, 12) + "…" : "-", problems: errs.join("; ") || "none" });
  prev = d;
}
console.table(rows);
console.log(ok ? "CHAIN OK: every decision is proven, finalized, and continues from the one before." : "CHAIN BROKEN: see problems column.");
process.exit(ok ? 0 : 1);
