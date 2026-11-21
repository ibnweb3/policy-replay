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
  catch {
    const msg = 'Could not load data/runs.json. Open the page through a web server, or see the run files on GitHub.';
    $("#logBody").innerHTML = `<tr><td colspan="5" class="memo">${msg}</td></tr>`;
    $("#liveList").innerHTML = `<li><span class="x">!</span><span>${msg}</span></li>`;
    $("#rcptBadge").hidden = true;
    return;
  }
  const runs = D.runs;

  // ---------- hero: real measurements and the real journal on the art ----------
  const heroEl = $(".hero2");
  const labelIt = () => ($("#heroLabel").textContent = `/hero · ${Math.round(heroEl.getBoundingClientRect().width)} × auto · zkVerify Agent Games`);
  labelIt(); addEventListener("resize", labelIt);
  const show2 = runs.find((r) => r.reason === "RECIPIENT_NOT_ALLOWLISTED") || runs[0];
  const jb = show2.journal.replace(/^0x/, "").match(/../g);
  $("#hexov").innerHTML = `<em>byte 132 = <b>${jb[132]}</b> ${show2.decision} · byte 133 = <b>${jb[133]}</b> ${show2.reason.toLowerCase().replaceAll("_", " ")}</em>`
    + jb.map((b, i) => (i === 132 || i === 133 ? `<b>${b}</b>` : b)).join(" ");
  $("#artTag").textContent = `Journal #${show2.seq} · ${jb.length} bytes`;

  // ---------- hero: live proof card (a replay of the recorded receipts) ----------
  const fin = runs.filter((r) => r.zkverify.status === "Finalized").length;
  $("#rcptBadge").textContent = fin;
  $("#liveCount").textContent = `${runs.length} decisions · ${fin} receipts`;
  const dots5 = [...document.querySelectorAll("#liveDots b")];
  function playLive() {
    const list = $("#liveList"); list.innerHTML = ""; $("#liveBar").style.width = "0%"; $("#livePct").textContent = "0%";
    dots5.forEach((d) => (d.style.background = ""));
    runs.forEach((r, i) => setTimeout(() => {
      const ok = r.decision === "APPROVE";
      list.querySelector(".now")?.classList.remove("now");
      const li = document.createElement("li");
      li.innerHTML = `<span class="${ok ? "ck" : "x"}">${ok ? "✓" : "✕"}</span><span>#${r.seq} ${r.decision} · ${ok ? "within policy" : r.reason.toLowerCase().replaceAll("_", " ")}</span>`;
      list.appendChild(li); while (list.children.length > 4) list.firstChild.remove();
      dots5[i].style.background = ok ? "var(--pass)" : "var(--pink)";
      const pct = Math.round(((i + 1) / runs.length) * 100);
      $("#liveBar").style.width = pct + "%"; $("#livePct").textContent = pct + "%";
      if (i === runs.length - 1) setTimeout(() => {
        const done = document.createElement("li"); done.className = "now";
        done.innerHTML = `<span class="ck">●</span><span>${fin}/${runs.length} finalized · chain intact</span>`;
        list.appendChild(done); while (list.children.length > 4) list.firstChild.remove();
      }, 600);
    }, (reduce ? 0 : 700) + i * (reduce ? 0 : 750)));
  }
  playLive();

  // ---------- hero: measured size chip on the framed word ----------
  const fw = $("#frameWord");
  const sizeIt = () => { const r = fw.getBoundingClientRect(); $("#frameSize").textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`; };
  document.fonts?.ready.then(sizeIt); addEventListener("resize", sizeIt); sizeIt();

  // ---------- hero: a magnifier sweeping over "proven" (loops; still under reduced motion) ----------
  const lensWrap = $("#lensWrap"), lensIn = $("#lensIn"), ZOOM = 1.7;
  const textNode = [...fw.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim() === "proven");
  let geo = null;
  function measure() {
    const range = document.createRange(); range.selectNodeContents(textNode);
    const t = range.getBoundingClientRect(), f0 = fw.getBoundingClientRect();
    const d = Math.round(t.height * 0.95);
    lensWrap.style.setProperty("--d", d + "px");
    lensIn.style.transform = `scale(${ZOOM})`;
    geo = { x: t.left - f0.left, y: t.top - f0.top, w: t.width, h: t.height, d };
  }
  function placeLens(p) { // p in 0..1 across the word
    if (!geo) return;
    const cx = geo.x + geo.w * (0.12 + 0.76 * p), cy = geo.y + geo.h * 0.52;
    lensWrap.style.transform = `translate(${cx - geo.d / 2}px,${cy - geo.d / 2}px)`;
    // point (cx,cy) of the word sits under the lens centre, drawn ZOOM times larger
    lensIn.style.left = `${geo.d / 2 - (cx - geo.x) * ZOOM - 3}px`;
    lensIn.style.top = `${geo.d / 2 - (cy - geo.y) * ZOOM - 3}px`;
  }
  let lensOn = true, t0 = performance.now();
  const lensLoop = (now) => {
    if (lensOn) placeLens(0.5 - 0.5 * Math.cos(((now - t0) / 3600) * Math.PI)); // eased back-and-forth, 3.6 s each way
    requestAnimationFrame(lensLoop);
  };
  const startLens = () => { measure(); if (reduce) placeLens(0.5); else requestAnimationFrame(lensLoop); };
  document.fonts?.ready.then(startLens) ?? startLens();
  addEventListener("resize", () => { measure(); if (reduce) placeLens(0.5); });
  new IntersectionObserver((es) => es.forEach((e) => (lensOn = e.isIntersecting))).observe(fw);

  // ---------- hero: cursor swarm (decorative; follows the pointer when it rests) ----------
  const ring = $("#ring"), swarm = $("#swarm"), hero = $(".hero2");
  const colors = ["#ff4f9a", "#5fd39a", "#3d5bff", "#f0c264", "#8f6bff", "#ff8a4c", "#4fd1ff", "#c6f24e"];
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, x = Math.cos(a) * 72, y = Math.sin(a) * 72;
    const deg = (a * 180) / Math.PI + 225; // tip points at the centre
    ring.insertAdjacentHTML("beforeend", `<svg viewBox="0 0 22 22" style="transform:translate(${x}px,${y}px) rotate(${deg}deg)"><path d="M3 3l6.8 15.6 2.3-6.6 6.6-2.3z" fill="${colors[i % colors.length]}" stroke="#0a0a0f" stroke-width="1.3" stroke-linejoin="round"/></svg>`);
  }
  const home = () => { const h = hero.getBoundingClientRect(), c = $(".hero2 .cta .btn.plain").getBoundingClientRect(); return [c.right - h.left + 120, c.top - h.top + c.height / 2 - 14]; };
  const place = ([x, y]) => (swarm.style.transform = `translate(${x}px,${y}px)`);
  place(home()); addEventListener("resize", () => place(home()));
  let idle;
  if (matchMedia("(hover: hover)").matches && !reduce) {
    hero.addEventListener("pointermove", (e) => {
      clearTimeout(idle);
      const h = hero.getBoundingClientRect(), x = e.clientX - h.left, y = e.clientY - h.top;
      idle = setTimeout(() => place([x, y]), 650);
    });
    hero.addEventListener("pointerleave", () => { clearTimeout(idle); place(home()); });
    addEventListener("keydown", (e) => { if (e.key === "Escape") { clearTimeout(idle); place(home()); } });
  }

  // ---------- dock: highlight the section in view ----------
  const dockLinks = [...document.querySelectorAll("#dockNav a")];
  const spy = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    dockLinks.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id));
  }), { rootMargin: "-45% 0px -50% 0px" });
  dockLinks.forEach((a) => { const t = document.querySelector(a.getAttribute("href")); if (t) spy.observe(t); });

  // ---------- log table (rows open into a byte-by-byte journal decode) ----------
  const FIELDS = [["magic", 0, 4, "ascii"], ["policy hash", 4, 36], ["proposal hash", 36, 68], ["state before", 68, 100], ["state after", 100, 132], ["decision", 132, 133, "dec"], ["reason", 133, 134, "reason"], ["seq", 134, 142, "u64"]];
  function decodeHtml(r) {
    const j = hex(r.journal);
    return `<div class="bytemap">${FIELDS.map(([name, a, b, kind]) => {
      const raw = toHex(j.slice(a, b));
      let val = kind === "ascii" ? `"${new TextDecoder().decode(j.slice(a, b))}"` : kind === "dec" ? (j[a] === 1 ? "01 · APPROVE" : "00 · REJECT") : kind === "reason" ? `${raw} · ${REASONS[j[a]]}` : kind === "u64" ? String(Number(new DataView(j.buffer).getBigUint64(a, true))) : `0x${raw.slice(0, 10)}…${raw.slice(-6)}`;
      const hot = kind === "dec" || kind === "reason" ? ` class="hot${r.decision === "APPROVE" ? " ok" : ""}"` : "";
      return `<div${hot}><span>${name} · ${b - a === 1 ? `byte ${a}` : `bytes ${a}–${b - 1}`}</span><code>${val}</code></div>`;
    }).join("")}</div>`;
  }
  $("#logBody").innerHTML = runs.map((r, i) => {
    const ok = r.decision === "APPROVE";
    return `<tr><td class="num mono">${r.seq}</td>
      <td><span class="tag ${ok ? "pass" : "fail"}">${r.decision}</span><div class="hash" style="margin-top:4px">${r.reason}</div></td>
      <td class="num"><span class="mono">${fmt(r.proposal.amount)} → ${short(r.proposal.recipient, 4, 4)}</span><div class="memo">${r.proposal.memo}</div></td>
      <td><div class="hash">${short(hashOf(r, "before"), 6, 4)}</div><div class="hash">→ ${short(hashOf(r, "after"), 6, 4)}</div></td>
      <td><span class="tag ${r.zkverify.status === "Finalized" ? "pass" : "warn"}">${r.zkverify.status}</span><div style="margin-top:4px"><a class="hash" href="${r.zkverify.explorer}" target="_blank" rel="noopener">tx ${short(r.zkverify.txHash, 6, 4)} ↗</a></div></td>
      <td><button class="plain sm rowbtn" type="button" aria-expanded="false" aria-controls="dec${i}" data-i="${i}">Decode</button></td></tr>
      <tr class="decode" id="dec${i}" hidden><td colspan="6">${decodeHtml(r)}</td></tr>`;
  }).join("");
  $("#logBody").addEventListener("click", (e) => {
    const b = e.target.closest(".rowbtn"); if (!b) return;
    const row = document.getElementById("dec" + b.dataset.i), open = b.getAttribute("aria-expanded") === "true";
    row.hidden = open; b.setAttribute("aria-expanded", String(!open)); b.textContent = open ? "Decode" : "Close";
  });
  $("#imgNote").innerHTML = `Policy program image ID <code>${D.image_id}</code>. Same ID on all five receipts.`;
  function hashOf(r, which) { const j = hex(r.journal); return "0x" + toHex(which === "before" ? j.slice(68, 100) : j.slice(100, 132)); }

  // ---------- replay (auto-plays once in view; pause, step, jump, arrow keys) ----------
  const seqs = $("#seqs");
  seqs.innerHTML = runs.map((r, i) => `<button type="button" data-i="${i}" aria-label="Show decision ${r.seq}">#${r.seq}</button>`).join("");
  const chips = [...seqs.querySelectorAll("button")];
  const layers = [...document.querySelectorAll(".layer")];
  const canvas = $("#canvas"), feed = $("#feed"), verdict = $("#verdict"), receipt = $("#receipt"), chip = $("#roundChip");
  const cur = { agent: $("#cAgent"), policy: $("#cPolicy"), zkv: $("#cZkv") };
  const playBtn = $("#playBtn"), stageEl = $("#replay .stage");
  let timers = [], playing = false, idx = -1, started = false;
  const later = (ms, f) => timers.push(setTimeout(f, reduce ? Math.min(ms, 60) : ms));
  const clearT = () => { timers.forEach(clearTimeout); timers = []; };
  const setPlaying = (v) => { playing = v; playBtn.textContent = v ? "Pause" : "Play"; playBtn.setAttribute("aria-label", v ? "Pause" : "Play"); };
  const say = (who, cls, txt) => { const p = document.createElement("p"); p.innerHTML = `<b class="${cls}">${who}</b><span>${txt}</span>`; feed.appendChild(p); while (feed.children.length > 6) feed.firstChild.remove(); };
  const moveTo = (c, el, dx = 0, dy = 0) => { const a = canvas.getBoundingClientRect(), b = el.getBoundingClientRect(); c.classList.remove("hidden"); c.style.transform = `translate(${Math.max(0, Math.min(a.width - 120, b.right - a.left + 10 + dx))}px,${b.top - a.top + b.height * 0.3 + dy}px)`; };

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
  // show one decision; animated when playing, instant when stepping
  function show(i, animate) {
    clearT(); idx = i;
    const r = runs[i], ok = r.decision === "APPROVE";
    const { out, base } = evaluate(r);
    chips.forEach((c, k) => { c.classList.toggle("on", k === i); c.setAttribute("aria-current", k === i ? "true" : "false"); });
    chip.className = "round-chip tag na"; chip.textContent = `Decision ${i + 1} of ${runs.length}`;
    paintLayers(null); verdict.className = "verdict"; receipt.className = "receipt";
    $("#pTitle").textContent = `proposal #${r.seq}`; $("#pTime").textContent = hhmm(r.proposal.ts);
    $("#pTo").textContent = short(r.proposal.recipient, 4, 4); $("#pAmt").textContent = fmt(r.proposal.amount);
    $("#pMemo").textContent = r.proposal.memo; $("#pSpent").textContent = fmt(base);
    const step2 = () => {
      paintLayers(out);
      verdict.textContent = ok ? "APPROVE" : `REJECT · ${r.reason}`; verdict.className = "verdict on " + (ok ? "ok" : "no");
      if (animate) moveTo(cur.policy, verdict);
      say("policy", "policy", `${r.decision} · ${r.reason} · proved in ${Math.round(r.prove_seconds)} s inside the zkVM`);
      chips[i].classList.remove("ok", "no"); chips[i].classList.add(ok ? "ok" : "no");
    };
    const step3 = () => {
      receipt.innerHTML = `receipt · image ${short(D.image_id, 4, 4)} · journal 142 B<br>zkVerify · <span style="color:var(--pass)">${r.zkverify.status}</span> · <a href="${r.zkverify.explorer}" target="_blank" rel="noopener">tx ${short(r.zkverify.txHash, 6, 4)} ↗</a>`;
      receipt.className = "receipt on"; if (animate) moveTo(cur.zkv, receipt);
      say("zkVerify", "zkv", `Risc0 proof verified · ${r.zkverify.status} · tx ${short(r.zkverify.txHash, 6, 4)}`);
    };
    say("agent", "agent", `proposes ${fmt(r.proposal.amount)} → ${short(r.proposal.recipient, 4, 4)} · "${r.proposal.memo}"`);
    if (!animate) { Object.values(cur).forEach((c) => c.classList.add("hidden")); step2(); step3(); return; }
    moveTo(cur.agent, $("#pcard"), 0, 10);
    later(1300, step2);
    later(2700, step3);
    later(4600, () => { if (i + 1 < runs.length) show(i + 1, true); else finish(); });
  }
  function finish() { setPlaying(false); chip.className = "round-chip tag pass"; chip.textContent = "Done · chain intact"; Object.values(cur).forEach((c) => c.classList.add("hidden")); }
  function play(from = 0) { started = true; setPlaying(true); if (from === 0) { feed.innerHTML = ""; chips.forEach((c) => c.classList.remove("ok", "no")); } show(from, true); }
  function pause() { clearT(); setPlaying(false); Object.values(cur).forEach((c) => c.classList.add("hidden")); if (idx >= 0) show(idx, false); chip.textContent = `Paused · ${idx + 1} of ${runs.length}`; }
  const step = (d) => { pause(); const n = Math.max(0, Math.min(runs.length - 1, (idx < 0 ? 0 : idx + d))); show(n, false); chip.textContent = `Decision ${n + 1} of ${runs.length} · paused`; };
  $("#replayBtn").addEventListener("click", () => play(0));
  playBtn.addEventListener("click", () => { if (playing) pause(); else play(idx < 0 || idx >= runs.length - 1 ? 0 : idx + 1); });
  $("#prevBtn").addEventListener("click", () => step(-1));
  $("#nextBtn").addEventListener("click", () => step(1));
  seqs.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; pause(); show(+b.dataset.i, false); chip.textContent = `Decision ${+b.dataset.i + 1} of ${runs.length} · paused`; });
  stageEl.tabIndex = -1;
  stageEl.addEventListener("keydown", (e) => {
    if (e.target.matches("select,input")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === " " && e.target === stageEl) { e.preventDefault(); playing ? pause() : play(idx + 1 >= runs.length ? 0 : idx + 1); }
  });
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting && !started) play(0);
    if (!e.isIntersecting && playing) pause();
  }), { threshold: 0.35 });
  io.observe(stageEl);
  setPlaying(false);

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

  // ---------- tamper lab: edit a copy of the log, then run the same check ----------
  $("#tEntry").innerHTML = runs.map((r, i) => `<option value="${i}"${i === runs.length - 1 ? " selected" : ""}>Entry #${r.seq} · ${r.decision} ${r.reason}</option>`).join("");
  const TAMPER = {
    flip: (t, i) => { const r = t.runs[i]; if (r.decision === "APPROVE") { r.decision = "REJECT"; r.reason = "OVER_DAILY_LIMIT"; } else { r.decision = "APPROVE"; r.reason = "OK"; } return `decision flipped to ${r.decision}`; },
    amount: (t, i) => { const a = t.runs[i].proposal.amount; t.runs[i].proposal.amount = 40; return `amount ${a} → 40`; },
    recipient: (t, i) => { const p = t.runs[i].proposal, al = D.policy.allowlist; p.recipient = al.find((a) => a.toLowerCase() !== p.recipient.toLowerCase()) || al[0]; return `recipient swapped to ${short(p.recipient, 4, 4)}`; },
    drop: (t, i) => { t.runs.splice(i, 1); return "entry deleted"; },
    state: (t, i) => { t.runs[i].state_before = { ...t.runs[i].state_before, spent_today: 0 }; return "spend before it reset to 0"; },
  };
  $("#tBtn").addEventListener("click", async () => {
    const i = +$("#tEntry").value, kind = $("#tKind").value, t = JSON.parse(JSON.stringify(D));
    const what = TAMPER[kind](t, i);
    await verify(t);
    $("#vresult").textContent += ` (Edited a copy: entry #${runs[i].seq}, ${what}. The real log is untouched; press Verify the log to check it again.)`;
  });

  // ---------- playground: the same rules, run live in the browser ----------
  const f = { to: $("#fTo"), amt: $("#fAmt"), spent: $("#fSpent"), gap: $("#fGap"), first: $("#fFirst") };
  const P = D.policy;
  const proven = runs.map((r) => {
    const s = r.state_before, x = r.proposal, today = Math.floor(x.ts / 86400);
    return { r, to: x.recipient.toLowerCase(), amt: x.amount, spent: s.day === today ? s.spent_today : 0, first: s.seq === 0, gap: s.seq === 0 ? null : x.ts - s.last_ts };
  });
  $("#presets").innerHTML = proven.map((p, i) => `<button class="plain sm" type="button" data-i="${i}">#${p.r.seq} ${p.r.decision === "APPROVE" ? "✓" : "✕"}</button>`).join("");
  $("#presets").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return; const p = proven[+b.dataset.i];
    f.to.value = p.to; f.amt.value = p.amt; f.spent.value = p.spent; f.first.checked = p.first;
    f.gap.value = p.gap == null ? f.gap.value : Math.min(+f.gap.max, p.gap);
    run();
  });
  function decide(x) {
    const rows = [
      ["Amount above zero", x.amt > 0, "ZERO_AMOUNT", `amount ${fmt(x.amt)}`],
      ["Recipient on the allowlist", P.allowlist.some((a) => a.toLowerCase() === x.to), "RECIPIENT_NOT_ALLOWLISTED", short(x.to, 4, 4)],
      [`At most ${fmt(P.max_per_transfer)} per transfer`, x.amt <= P.max_per_transfer, "OVER_PER_TRANSFER_CAP", `${fmt(x.amt)} vs ${fmt(P.max_per_transfer)}`],
      [`At most ${fmt(P.daily_limit)} per day`, x.spent + x.amt <= P.daily_limit, "OVER_DAILY_LIMIT", `${fmt(x.spent)} + ${fmt(x.amt)} = ${fmt(x.spent + x.amt)}`],
      [`At least ${P.min_gap_secs} s since the last payment`, x.first || x.gap >= P.min_gap_secs, "TOO_SOON_AFTER_LAST", x.first ? "first in the log" : `${x.gap} s`],
    ];
    let reason = "OK", failed = false;
    const out = rows.map(([label, ok, code, why]) => { const st = failed ? "skip" : ok ? "pass" : "fail"; if (!ok && !failed) { failed = true; reason = code; } return { label, st, why }; });
    return { out, reason, approve: reason === "OK" };
  }
  function run() {
    const x = { to: f.to.value.toLowerCase(), amt: +f.amt.value, spent: +f.spent.value, gap: +f.gap.value, first: f.first.checked };
    f.gap.disabled = x.first;
    $("#oAmt").textContent = fmt(x.amt); $("#oSpent").textContent = fmt(x.spent); $("#oGap").textContent = x.first ? "n/a" : `${x.gap} s`;
    const d = decide(x), v = $("#pVerdict");
    v.className = "pverdict " + (d.approve ? "ok" : "no");
    v.innerHTML = `${d.approve ? "APPROVE" : "REJECT"}<small>reason ${d.reason}</small>`;
    $("#pChecks").innerHTML = d.out.map((c) => `<li><span><b>${c.label}</b><span class="why">${c.why}</span></span><span class="tag ${c.st === "pass" ? "pass" : c.st === "fail" ? "fail" : "na"}">${c.st === "pass" ? "Pass" : c.st === "fail" ? "Fail" : "Skipped"}</span></li>`).join("");
    const code = REASONS.indexOf(d.reason);
    $("#pBytes").innerHTML = `byte 132 = <b>${d.approve ? "01" : "00"}</b> (${d.approve ? "APPROVE" : "REJECT"}) · byte 133 = <b>${code.toString(16).padStart(2, "0")}</b> (${d.reason})`;
    const hit = proven.find((p) => p.to === x.to && p.amt === x.amt && p.spent === x.spent && p.first === x.first && (p.first || p.gap === x.gap));
    const m = $("#pMatch");
    if (hit) { m.className = "pmatch hit"; m.innerHTML = `These inputs are decision <b>#${hit.r.seq}</b>, which was proven in the zkVM and finalized on zkVerify: <a href="${hit.r.zkverify.explorer}" target="_blank" rel="noopener">tx ${short(hit.r.zkverify.txHash, 6, 4)} ↗</a>`; }
    else { m.className = "pmatch"; m.textContent = "Not one of the five proven decisions: this result is computed in your browser, not proven. Load a proven decision above to see its receipt."; }
  }
  Object.values(f).forEach((el) => el.addEventListener("input", run));
  run();

  // ---------- copy buttons ----------
  document.querySelectorAll(".cmd .copy").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.previousElementSibling.textContent); b.textContent = "Copied"; }
    catch { b.textContent = "Select and copy"; }
    setTimeout(() => (b.textContent = "Copy"), 1600);
  }));
})();
