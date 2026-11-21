// Build docs/data/runs.json for the web page from the real run files (no invented values).
// usage: node scripts/build-site-data.mjs
import fs from "node:fs";
import path from "node:path";

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const runs = fs.readdirSync("runs").filter((d) => fs.existsSync(path.join("runs", d, "decision.json"))).sort();
let state = read("demo/state0.json");
const out = {
  policy: read("demo/policy.json"),
  image_id: read(path.join("runs", runs[0], "decision.json")).image_id,
  runs: runs.map((d) => {
    const dec = read(path.join("runs", d, "decision.json"));
    const z = read(path.join("runs", d, "zkverify.json"));
    const pr = read(path.join("demo", "proposals", `${d}.json`));
    const pub = read(path.join("runs", d, "proof.json")).pub_inputs;
    const next = read(path.join("runs", d, "next_state.json"));
    const row = {
      run: d, seq: dec.seq, decision: dec.decision, reason: dec.reason,
      proposal: pr, state_before: state, state_after: next,
      journal: pub, prove_seconds: dec.prove_seconds, proof_bytes: dec.proof_bytes,
      zkverify: { status: z.status, txHash: z.txHash, blockHash: z.blockHash, explorer: z.explorer, network: z.network, finalizedAt: z.finalizedAt, verifier: z.risc0Version },
    };
    state = next;
    return row;
  }),
};
fs.mkdirSync("docs/data", { recursive: true });
fs.writeFileSync("docs/data/runs.json", JSON.stringify(out, null, 1));
console.log("docs/data/runs.json:", out.runs.length, "runs");
