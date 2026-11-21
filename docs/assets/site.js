// Policy Replay page: everything is read from data/runs.json, which scripts/build-site-data.mjs builds from the run files.
(async () => {
  const $ = (s) => document.querySelector(s);
  const REASONS = ["OK", "OVER_PER_TRANSFER_CAP", "OVER_DAILY_LIMIT", "RECIPIENT_NOT_ALLOWLISTED", "TOO_SOON_AFTER_LAST", "CLOCK_WENT_BACKWARDS", "ZERO_AMOUNT"];
  const short = (h, a = 6, b = 4) => (h ? `${h.slice(0, a + 2)}…${h.slice(-b)}` : "–");
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const hhmm = (ts) => new Date(ts * 1000).toISOString().slice(11, 16) + " UTC";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let D;
  try { D = await (await fetch("data/runs.json")).json(); }
  catch { $("#logBody").innerHTML = '<tr><td colspan="5" class="memo">Could not load data/runs.json. Open the page through a web server, or see the run files on GitHub.</td></tr>'; return; }
  const runs = D.runs;

  // ---------- hero proof line ----------
  const fin = runs.filter((r) => r.zkverify.status === "Finalized").length;
  $("#proofline").innerHTML = `<span class="chip"><i></i>${fin} of ${runs.length} receipts finalized on zkVerify</span><span class="chip">image ID ${short(D.image_id, 4, 4)}</span><span class="chip">risc0 2.3.2 · verifier ${runs[0].zkverify.verifier}</span>`;

  // ---------- log table ----------
  $("#logBody").innerHTML = runs.map((r) => {
    const ok = r.decision === "APPROVE";
    return `<tr><td class="num mono">${r.seq}</td>
      <td><span class="tag ${ok ? "pass" : "fail"}">${r.decision}</span><div class="hash" style="margin-top:4px">${r.reason}</div></td>
      <td class="num"><span class="mono">${fmt(r.proposal.amount)} → ${short(r.proposal.recipient, 4, 4)}</span><div class="memo">${r.proposal.memo}</div></td>
      <td><div class="hash">${short(hashOf(r, "before"), 6, 4)}</div><div class="hash">→ ${short(hashOf(r, "after"), 6, 4)}</div></td>
      <td><span class="tag ${r.zkverify.status === "Finalized" ? "pass" : "warn"}">${r.zkverify.status}</span><div style="margin-top:4px"><a class="hash" href="${r.zkverify.explorer}" target="_blank" rel="noopener">tx ${short(r.zkverify.txHash, 6, 4)} ↗</a></div></td></tr>`;
  }).join("");
  $("#imgNote").innerHTML = `Policy program image ID <code>${D.image_id}</code>. Same ID on all five receipts.`;
  function hashOf(r, which) { const j = hex(r.journal); return "0x" + toHex(which === "before" ? j.slice(68, 100) : j.slice(100, 132)); }

  // ---------- replay ----------
  const seqs = $("#seqs");
  seqs.innerHTML = runs.map((r) => `<span data-i="${r.seq}">#${r.seq}</span>`).join("");
  const layers = [...document.querySelectorAll(".layer")];
  const canvas = $("#canvas"), feed = $("#feed"), verdict = $("#verdict"), receipt = $("#receipt"), chip = $("#roundChip");
  const cur = { agent: $("#cAgent"), policy: $("#cPolicy"), zkv: $("#cZkv") };
  let timers = [], playing = false;
  const later = (ms, f) => timers.push(setTimeout(f, reduce ? Math.min(ms, 60) : ms));
  const stop = () => { timers.forEach(clearTimeout); timers = []; playing = false; };
  const say = (who, cls, txt) => { const p = document.createElement("p"); p.innerHTML = `<b class="${cls}">${who}</b><span>${txt}</span>`; feed.appendChild(p); while (feed.children.length > 6) feed.firstChild.remove(); };
  const moveTo = (c, el, dx = 0, dy = 0) => { const a = canvas.getBoundingClientRect(), b = el.getBoundingClientRect(); c.classList.remove("hidden"); c.style.transform = `translate(${Math.min(a.width - 120, b.right - a.left + 10 + dx)}px,${b.top - a.top + b.height * 0.3 + dy}px)`; };

  function evaluate(r) {
    const p = D.policy, s = r.state_before, x = r.proposal, out = {};
    const today = Math.floor(x.ts / 86400), base = s.day === today ? s.spent_today : 0;
    const checks = [
      ["allow", p.allowlist.some((a) => a.toLowerCase() === x.recipient.toLowerCase())],
      ["cap", x.amount <= p.max_per_transfer],
      ["daily", base + x.amount <= p.daily_limit],
      ["gap", s.seq === 0 || x.ts - s.last_ts >= p.min_gap_secs],
    ];
    let failed = false;
    for (const [k, ok] of checks) { out[k] = failed ? "skip" : ok ? "pass" : "fail"; if (!ok) failed = true; }
    return { out, base };
  }
  function paintLayers(res) {
    layers.forEach((l) => {
      const v = res ? res[l.dataset.rule] : null, t = l.querySelector(".tag");
      l.classList.toggle("is-pass", v === "pass"); l.classList.toggle("is-fail", v === "fail");
      t.className = "tag " + (v === "pass" ? "pass" : v === "fail" ? "fail" : "na");
      t.textContent = v === "pass" ? "Pass" : v === "fail" ? "Fail" : v === "skip" ? "Skipped" : "–";
    });
  }
  function show(i) {
    const r = runs[i], ok = r.decision === "APPROVE";
    const { out, base } = evaluate(r);
    seqs.querySelectorAll("span").forEach((s, k) => { s.classList.toggle("on", k === i); });
    chip.className = "round-chip tag na"; chip.textContent = `Decision ${i + 1} of ${runs.length}`;
    paintLayers(null); verdict.className = "verdict"; receipt.className = "receipt";
    $("#pTitle").textContent = `proposal #${r.seq}`; $("#pTime").textContent = hhmm(r.proposal.ts);
    $("#pTo").textContent = short(r.proposal.recipient, 4, 4); $("#pAmt").textContent = fmt(r.proposal.amount);
    $("#pMemo").textContent = r.proposal.memo; $("#pSpent").textContent = fmt(base);
    moveTo(cur.agent, $("#pcard"), 0, 10);
    say("agent", "agent", `proposes ${fmt(r.proposal.amount)} → ${short(r.proposal.recipient, 4, 4)} · "${r.proposal.memo}"`);
    later(1300, () => {
      paintLayers(out);
      verdict.textContent = ok ? "APPROVE" : `REJECT · ${r.reason}`; verdict.className = "verdict on " + (ok ? "ok" : "no");
      moveTo(cur.policy, verdict);
      say("policy", "policy", `${r.decision} · ${r.reason} · proved in ${Math.round(r.prove_seconds)} s inside the zkVM`);
      const s = seqs.querySelectorAll("span")[i]; s.classList.add(ok ? "ok" : "no");
    });
    later(2700, () => {
      receipt.innerHTML = `receipt · image ${short(D.image_id, 4, 4)} · journal 142 B<br>zkVerify · <span style="color:var(--pass)">${r.zkverify.status}</span> · <a href="${r.zkverify.explorer}" target="_blank" rel="noopener">tx ${short(r.zkverify.txHash, 6, 4)} ↗</a>`;
      receipt.className = "receipt on"; moveTo(cur.zkv, receipt);
      say("zkVerify", "zkv", `Risc0 proof verified · ${r.zkverify.status} · tx ${short(r.zkverify.txHash, 6, 4)}`);
    });
  }
  function play() {
    stop(); playing = true; feed.innerHTML = ""; seqs.querySelectorAll("span").forEach((s) => s.classList.remove("ok", "no"));
    runs.forEach((_, i) => later(i * 4600, () => show(i)));
    later(runs.length * 4600, () => { chip.className = "round-chip tag pass"; chip.textContent = "Done · chain intact"; Object.values(cur).forEach((c) => c.classList.add("hidden")); playing = false; });
  }
  $("#replayBtn").addEventListener("click", play);
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && !playing && !feed.children.length) play(); if (!e.isIntersecting && playing) { stop(); chip.textContent = "Paused · press Replay"; } }), { threshold: 0.35 });
  io.observe($("#replay .stage"));

  // ---------- verify in the browser ----------
  function hex(h) { const s = h.replace(/^0x/, ""); const b = new Uint8Array(s.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 2, 2), 16); return b; }
  function toHex(b) { return [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); }
  const enc = new TextEncoder();
  const u64 = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };
  const cat = (...p) => { const n = p.reduce((a, x) => a + x.length, 0), o = new Uint8Array(n); let k = 0; for (const x of p) { o.set(x, k); k += x.length; } return o; };
  const sha = async (b) => toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", b)));
  const policyHash = (p) => sha(cat(enc.encode("PRpo"), u64(p.max_per_transfer), u64(p.daily_limit), u64(p.min_gap_secs), ...p.allowlist.flatMap((a) => { const s = enc.encode(a.toLowerCase()); return [u64(s.length), s]; })));
  const proposalHash = (x) => { const r = enc.encode(x.recipient.toLowerCase()), m = enc.encode(x.memo); return sha(cat(enc.encode("PRpr"), u64(r.length), r, u64(x.amount), u64(x.ts), u64(m.length), m)); };
  const stateHash = (s) => sha(cat(enc.encode("PRst"), u64(s.day), u64(s.spent_today), u64(s.last_ts), u64(s.seq)));

  async function verify(data) {
    const list = $("#vlist"), res = $("#vresult"); list.innerHTML = ""; res.className = ""; res.textContent = "Checking…";
    const items = []; let ok = true;
    const add = (pass, txt) => { items.push([pass, txt]); if (!pass) ok = false; };
    const ph = await policyHash(data.policy);
    let prevAfter = null;
    for (const r of data.runs) {
      const j = hex(r.journal), errs = [];
      if (new TextDecoder().decode(j.slice(0, 4)) !== "PRv1" || j.length !== 142) errs.push("journal format");
      if (toHex(j.slice(4, 36)) !== ph) errs.push("policy hash ≠ published policy");
      if (toHex(j.slice(36, 68)) !== (await proposalHash(r.proposal))) errs.push("proposal hash ≠ logged proposal");
      if (toHex(j.slice(68, 100)) !== (await stateHash(r.state_before))) errs.push("state before ≠ logged state");
      if (toHex(j.slice(100, 132)) !== (await stateHash(r.state_after))) errs.push("state after ≠ logged state");
      if ((j[132] === 1 ? "APPROVE" : "REJECT") !== r.decision || REASONS[j[133]] !== r.reason) errs.push(`logged ${r.decision} ${r.reason}, proven ${j[132] === 1 ? "APPROVE" : "REJECT"} ${REASONS[j[133]]}`);
      const seq = Number(new DataView(j.buffer).getBigUint64(134, true));
      if (seq !== r.seq) errs.push("seq mismatch");
      if (prevAfter && toHex(j.slice(68, 100)) !== prevAfter) errs.push("does not continue from the previous decision");
      if (r.zkverify.status !== "Finalized") errs.push(`zkVerify status ${r.zkverify.status}`);
      prevAfter = toHex(j.slice(100, 132));
      add(!errs.length, `#${r.seq} ${r.decision} ${r.reason}: ${errs.length ? errs.join("; ") : "journal matches the log, chain continues, zkVerify finalized"}`);
    }
    list.innerHTML = items.map(([p, t]) => `<li class="${p ? "ok" : "no"}"><b>${p ? "✓" : "✕"}</b><span>${t}</span></li>`).join("");
    res.className = ok ? "good" : "bad";
    res.textContent = ok ? `Intact: all ${data.runs.length} journals match the published log and chain together.` : "Broken: the log no longer matches what was proven. See the ✕ rows.";
  }
  $("#vBtn").addEventListener("click", () => verify(D));
  $("#tBtn").addEventListener("click", () => {
    const t = JSON.parse(JSON.stringify(D)); const last = t.runs[t.runs.length - 1];
    last.proposal.amount = 40; last.decision = "APPROVE"; last.reason = "OK";
    verify(t).then(() => { $("#vresult").textContent += ` (Edited entry #${last.seq}: amount 400 → 40 and REJECT → APPROVE.)`; });
  });

  // ---------- copy buttons ----------
  document.querySelectorAll(".cmd .copy").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.previousElementSibling.textContent); b.textContent = "Copied"; }
    catch { b.textContent = "Select and copy"; }
    setTimeout(() => (b.textContent = "Copy"), 1600);
  }));
})();
