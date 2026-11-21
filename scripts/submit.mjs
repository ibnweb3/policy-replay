// Submit one Policy Replay proof to zkVerify (testnet by default) through Kurier, wait for Finalized.
// usage: node scripts/submit.mjs runs/01-approve
// needs KURIER_API_KEY in .env (testnet key from https://testnet.kurier.xyz). Never commit .env.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new globalThis.URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
for (const l of (fs.existsSync(path.join(root, ".env")) ? fs.readFileSync(path.join(root, ".env"), "utf8") : "").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const KEY = process.env.KURIER_API_KEY;
const API = process.env.KURIER_API || "https://api-testnet.kurier.xyz/api/v1";
const VERSION = process.env.R0_VERSION || "V3_0";
if (!KEY) { console.error("KURIER_API_KEY missing (put it in .env)"); process.exit(1); }
const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/submit.mjs <run dir>"); process.exit(1); }
const proof = JSON.parse(fs.readFileSync(path.join(dir, "proof.json"), "utf8"));

const post = async (p, body) => {
  const r = await fetch(`${API}/${p}/${KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: r.ok, status: r.status, j };
};

// register the image ID (the policy program's fingerprint) once
const vkFile = path.join(root, `vk-${proof.image_id.slice(2, 14)}-${VERSION}.json`);
let vk = fs.existsSync(vkFile) ? JSON.parse(fs.readFileSync(vkFile, "utf8")) : null;
if (!vk) {
  const r = await post("register-vk", { proofType: "risc0", proofOptions: { version: VERSION }, vk: proof.image_id });
  const hash = r.j.vkHash || r.j?.meta?.vkHash;
  if (!hash) { console.error("register-vk failed", r.status, JSON.stringify(r.j).slice(0, 400)); process.exit(1); }
  vk = { vkHash: hash, image_id: proof.image_id, version: VERSION };
  fs.writeFileSync(vkFile, JSON.stringify(vk, null, 2));
  console.log("registered image ID ->", hash);
}

const sub = await post("submit-proof", {
  proofType: "risc0", vkRegistered: true, proofOptions: { version: VERSION },
  proofData: { proof: proof.proof, publicSignals: proof.pub_inputs, vk: vk.vkHash },
});
if (!sub.ok || !sub.j.jobId) { console.error("submit failed", sub.status, JSON.stringify(sub.j).slice(0, 400)); process.exit(1); }
console.log("job", sub.j.jobId, "optimistic:", sub.j.optimisticVerify);
if (sub.j.optimisticVerify !== "success") { console.error("zkVerify optimistic verification did not pass"); process.exit(1); }

let st;
for (let i = 0; i < 120; i++) {
  const r = await fetch(`${API}/job-status/${KEY}/${sub.j.jobId}`);
  st = await r.json();
  process.stdout.write(`\r${st.status}            `);
  if (st.status === "Finalized") break;
  if (st.status === "Failed") { console.error("\njob failed", JSON.stringify(st).slice(0, 400)); process.exit(1); }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log();
const receipt = {
  network: API.includes("testnet") ? "zkVerify Volta testnet" : "zkVerify mainnet",
  jobId: sub.j.jobId, status: st.status, txHash: st.txHash, blockHash: st.blockHash,
  vkHash: vk.vkHash, risc0Version: VERSION, finalizedAt: st.updatedAt,
  explorer: st.txHash ? (API.includes("testnet") ? `https://zkverify-testnet.subscan.io/extrinsic/${st.txHash}` : `https://zkverify.subscan.io/extrinsic/${st.txHash}`) : null,
};
fs.writeFileSync(path.join(dir, "zkverify.json"), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
