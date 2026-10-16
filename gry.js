/* =====================================================================
   Włoska Robota — gry (ładowane leniwie po otwarciu zakładki „Gry”)
   Trzy rozbudowane gry: Memory Mistrzowskie, Quiz Znawca i Pizzer na gorąco.
   Punkty przyznaje wyłącznie WRGames.award (limity pilnuje też firestore.rules):
   max 3 pkt za nagrodę, odstęp 30 s, max 8 pkt na dobę; z jednej gry max 3 pkt na dobę.
   ===================================================================== */
(function () {
"use strict";
if (!window.WRGames || window.WRGames.__loaded) return;
window.WRGames.__loaded = true;

/* ---------- pomocnicze ---------- */
const GAME_DAY_CAP = 3;       // maks. punktów z jednej gry na dobę (po stronie klienta; globalny limit pilnują reguły)
const LS_KEY = "wr_games_v1";
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function h(tag, attrs) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (let i = 2; i < arguments.length; i++) {
    const c = arguments[i];
    if (c == null) continue;
    if (Array.isArray(c)) c.forEach((x) => x != null && e.append(x.nodeType ? x : document.createTextNode(x)));
    else e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

/* ---------- zapis lokalny (rekordy, dźwięk) ---------- */
const utcDay = () => Math.floor(Date.now() / 86400000);
let S;
try { S = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { S = {}; }
S.best = S.best || {}; S.day = S.day || { d: 0, per: {} }; S.seen = S.seen || {}; S.runs = S.runs || {};
if (S.sound == null) S.sound = true;
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* tryb prywatny — trudno */ } }
function perGameToday(id) { if (S.day.d !== utcDay()) S.day = { d: utcDay(), per: {} }; return S.day.per[id] || 0; }
function addPerGame(id, n) { perGameToday(id); S.day.per[id] = (S.day.per[id] || 0) + n; save(); }
function bumpBest(id, key, val) { const o = (S.best[id] = S.best[id] || {}); if (!(val <= (o[key] || 0))) { o[key] = val; save(); return true; } return false; }
function best(id, key) { return (S.best[id] && S.best[id][key]) || 0; }
function bumpRun(id) { S.runs[id] = (S.runs[id] || 0) + 1; save(); }

/* ---------- rangi (wspólne dla wszystkich gier) ---------- */
const RANKS = [
  { min: 0, name: "Kandydat na pizzaiolo", ic: "🥄" },
  { min: 8, name: "Pomocnik pizzaiola", ic: "🧑‍🍳" },
  { min: 20, name: "Pizzaiolo", ic: "🍕" },
  { min: 35, name: "Starszy pizzaiolo", ic: "🔥" },
  { min: 50, name: "Mistrz pieca", ic: "👑" },
  { min: 64, name: "Maestro Włoskiej Roboty", ic: "🏆" }
];
function rankScore() {
  return best("memory", "level") * 3 + Math.min(20, best("quiz", "correct")) + Math.min(15, best("arcade", "order")) * 2;
}
function rankInfo() {
  const sc = rankScore();
  let i = 0; RANKS.forEach((r, k) => { if (sc >= r.min) i = k; });
  const next = RANKS[i + 1];
  return { score: sc, rank: RANKS[i], next, toNext: next ? next.min - sc : 0, idx: i };
}

/* ---------- dźwięk (WebAudio, krótkie tony; wyciszenie zapamiętane) ---------- */
let AC = null;
function tone(freq, dur, type, vol, when, slideTo) {
  if (!S.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === "suspended") AC.resume();
    const t0 = AC.currentTime + (when || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + dur + 0.03);
  } catch (e) { /* brak dźwięku to nie problem */ }
}
const SFX = {
  flip: () => tone(620, 0.05, "triangle", 0.04),
  match: () => { tone(660, 0.09, "sine", 0.05); tone(990, 0.14, "sine", 0.05, 0.08); },
  miss: () => tone(190, 0.22, "sawtooth", 0.04, 0, 120),
  ok: () => { tone(740, 0.08, "triangle", 0.05); tone(1110, 0.12, "triangle", 0.05, 0.07); },
  bad: () => tone(150, 0.3, "square", 0.04, 0, 90),
  tick: () => tone(900, 0.03, "square", 0.015),
  catch: () => tone(520 + Math.random() * 120, 0.07, "triangle", 0.045),
  done: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, "triangle", 0.05, i * 0.09)),
  hit: () => tone(120, 0.35, "sawtooth", 0.07, 0, 50),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, "triangle", 0.055, i * 0.1)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, "triangle", 0.05, i * 0.14)),
  pts: () => { [880, 1175, 1568].forEach((f, i) => tone(f, 0.12, "sine", 0.05, i * 0.08)); }
};

/* ---------- styl ---------- */
const CSS = `
.wrg{position:relative;border-radius:14px;overflow:hidden;background:#121216;color:#f3f3f5;font-family:inherit;border:1px solid #2c2c34;line-height:1.4;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.wrg *{box-sizing:border-box}
.wrg-bar{display:flex;align-items:center;gap:6px;padding:8px 10px;background:linear-gradient(180deg,#25252d,#1a1a20);border-bottom:1px solid #2c2c34}
.wrg-title{flex:1;min-width:0;font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wrg-ib{width:34px;height:34px;flex:none;border-radius:9px;border:1px solid #3a3a45;background:#1d1d24;color:#eee;font-size:16px;cursor:pointer;display:grid;place-items:center;padding:0;font-family:inherit}
.wrg-ib:hover{background:#2a2a33}
.wrg-body{position:relative;padding:12px}
.wrg-btn{display:inline-block;padding:11px 18px;border:0;border-radius:11px;background:linear-gradient(180deg,#14b866,#0b8a4b);color:#fff;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit;box-shadow:0 3px 0 #06562e,0 6px 14px rgba(0,0,0,.35);transition:transform .08s}
.wrg-btn:active{transform:translateY(2px);box-shadow:0 1px 0 #06562e}
.wrg-btn.gold{background:linear-gradient(180deg,#f1cf6a,#c9961f);color:#2a1d00;box-shadow:0 3px 0 #7a5a10,0 6px 14px rgba(0,0,0,.35)}
.wrg-btn.ghost{background:#24242c;color:#ddd;box-shadow:0 3px 0 #111,0 6px 14px rgba(0,0,0,.3)}
.wrg-btn[disabled]{opacity:.45;cursor:default}
.wrg-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:12px}
.wrg-screen{text-align:center;padding:6px 4px 4px}
.wrg-screen h2{margin:4px 0 6px;font-size:22px;font-family:'Playfair Display',Georgia,serif;color:#f6e7bd}
.wrg-screen p{margin:6px 0;font-size:14px;color:#cfcfd8}
.wrg-hero{font-size:54px;line-height:1.1;margin:2px 0}
.wrg-rules{margin:10px auto 4px;max-width:440px;text-align:left;background:#1b1b22;border:1px solid #2f2f39;border-radius:12px;padding:10px 12px;font-size:13.5px;color:#d8d8e0}
.wrg-rules b{color:#f1cf6a}
.wrg-rules ul{margin:6px 0 0;padding:0 0 0 18px}
.wrg-rules li{margin:3px 0}
.wrg-reward{display:grid;gap:6px;margin:10px auto 0;max-width:440px}
.wrg-reward div{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#1b1b22;border:1px solid #2f2f39;border-radius:10px;padding:7px 11px;font-size:13.5px;text-align:left}
.wrg-reward div.got{border-color:#d4af37;background:#2b2511}
.wrg-reward em{font-style:normal;color:#f1cf6a;font-weight:800;white-space:nowrap}
.wrg-rank{display:inline-flex;gap:8px;align-items:center;margin:10px 0 0;background:#1b1b22;border:1px solid #2f2f39;border-radius:14px;padding:7px 14px;font-size:13px;color:#e7e7ee;text-align:left;max-width:100%}
.wrg-hud{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13.5px;margin-bottom:8px;color:#d8d8e0;flex-wrap:wrap}
.wrg-hud b{color:#fff}
.wrg-pill{background:#1d1d25;border:1px solid #33333f;border-radius:99px;padding:3px 11px;font-weight:600;white-space:nowrap}
.wrg-bar2{height:8px;border-radius:99px;background:#26262e;overflow:hidden}
.wrg-bar2 i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#14b866,#d4af37);transform-origin:left;transition:width .2s linear}
.wrg-bar2.low i{background:linear-gradient(90deg,#e03a3a,#f08a3a)}
.wrg-toast{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:20;max-width:90%;padding:9px 16px;border-radius:12px;font-size:14px;font-weight:700;color:#fff;background:#0b8a4b;box-shadow:0 8px 24px rgba(0,0,0,.45);text-align:center;animation:wrgpop .25s ease-out}
.wrg-toast.err{background:#b3261e}
.wrg-toast.gold{background:linear-gradient(180deg,#f1cf6a,#c9961f);color:#2a1d00}
@keyframes wrgpop{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
.wrg-full{position:fixed;inset:0;z-index:2147483000;border-radius:0;border:0;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top)}
.wrg-full .wrg-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;justify-content:center;max-width:760px;width:100%;margin:0 auto}
html.wrg-lock,html.wrg-lock body{overflow:hidden!important}
@media (prefers-reduced-motion:reduce){.wrg *{animation-duration:.01s!important;transition-duration:.01s!important}}
`;
function injectCss(extra) {
  if (!document.getElementById("wrg-css")) { const s = document.createElement("style"); s.id = "wrg-css"; s.textContent = CSS; document.head.appendChild(s); }
  if (extra && !document.getElementById("wrg-css-" + extra.id)) { const s = document.createElement("style"); s.id = "wrg-css-" + extra.id; s.textContent = extra.css; document.head.appendChild(s); }
}

/* ---------- nagradzanie: limit gry + ponowienie po odstępie ---------- */
async function grant(ctx, id, wanted) {
  const left = GAME_DAY_CAP - perGameToday(id);
  const n = Math.min(Math.floor(wanted), left, 3);
  if (n <= 0) {
    return { ok: false, given: 0, msg: wanted > 0 ? "Z tej gry dziś masz już maksimum punktów (" + GAME_DAY_CAP + "). Spróbuj innej gry albo wróć jutro." : "" };
  }
  let r = await ctx.award(n);
  if (r && r.ok) { addPerGame(id, r.given || n); SFX.pts(); return r; }
  if (r && r.wait) {
    /* odstęp między nagrodami — dopiszemy punkty w tle */
    setTimeout(async () => {
      const r2 = await ctx.award(n);
      if (r2 && r2.ok) { addPerGame(id, r2.given || n); SFX.pts(); }
    }, 31000);
    return { ok: true, pending: true, given: n, msg: "Punkty (+" + n + ") zostaną dopisane za chwilę." };
  }
  return r || { ok: false, msg: "Nie udało się dopisać punktów." };
}

/* ---------- powłoka gry: pasek, tryb powiększony, sprzątanie, ekrany ---------- */
let current = null;
function createShell(stage, ctx, opt) {
  if (current) current.destroy();
  injectCss(opt.css);
  stage.innerHTML = "";
  const st = { timers: [], intervals: [], cleanups: [], dead: false, full: false, ph: null };
  const root = h("div", { class: "wrg wrg-" + opt.id });
  const titleEl = h("div", { class: "wrg-title" }, (opt.icon || "🎮") + " " + opt.title);
  const sndBtn = h("button", { class: "wrg-ib", type: "button", "aria-label": "Dźwięk", title: "Dźwięk", onclick: () => { S.sound = !S.sound; save(); sndBtn.textContent = S.sound ? "🔊" : "🔇"; if (S.sound) SFX.flip(); } }, S.sound ? "🔊" : "🔇");
  const zoomBtn = h("button", { class: "wrg-ib", type: "button", "aria-label": "Powiększ", title: "Powiększ / zmniejsz", onclick: () => api.toggleFull() }, "⛶");
  const closeBtn = h("button", { class: "wrg-ib", type: "button", "aria-label": "Zamknij grę", title: "Zamknij", onclick: () => api.close() }, "✕");
  const bar = h("div", { class: "wrg-bar" }, titleEl, sndBtn, zoomBtn, closeBtn);
  const body = h("div", { class: "wrg-body" });
  root.append(bar, body);
  stage.appendChild(root);

  const onKey = (e) => { if (e.key === "Escape" && st.full) api.toggleFull(); };
  document.addEventListener("keydown", onKey);

  const api = {
    root, body, ctx, stage,
    alive: () => !st.dead && root.isConnected,
    visible: () => !st.dead && root.isConnected && !document.hidden && (st.full || root.getClientRects().length > 0),
    setTitle(t) { titleEl.textContent = (opt.icon || "🎮") + " " + t; },
    every(ms, fn) { const id = setInterval(() => { if (api.visible()) fn(); }, ms); st.intervals.push(id); return id; },
    after(ms, fn) { const id = setTimeout(() => { if (api.alive()) fn(); }, ms); st.timers.push(id); return id; },
    onCleanup(fn) { st.cleanups.push(fn); },
    toast(text, kind, ms) {
      const t = h("div", { class: "wrg-toast" + (kind ? " " + kind : "") }, text);
      root.appendChild(t); setTimeout(() => t.remove(), ms || 2600);
    },
    screen(o) {
      body.innerHTML = "";
      const sc = h("div", { class: "wrg-screen" });
      if (o.hero) sc.append(h("div", { class: "wrg-hero" }, o.hero));
      if (o.title) sc.append(h("h2", null, o.title));
      if (o.html) sc.append(h("div", { html: o.html }));
      const row = h("div", { class: "wrg-row" });
      (o.buttons || []).forEach((b) => row.append(h("button", { class: "wrg-btn " + (b.cls || ""), type: "button", onclick: b.on }, b.label)));
      sc.append(row); body.append(sc);
      return sc;
    },
    toggleFull() {
      if (!st.full) {
        st.ph = document.createComment("wrg"); stage.insertBefore(st.ph, root);
        document.body.appendChild(root); root.classList.add("wrg-full"); document.documentElement.classList.add("wrg-lock"); st.full = true; zoomBtn.textContent = "⤡";
      } else {
        root.classList.remove("wrg-full"); document.documentElement.classList.remove("wrg-lock");
        if (st.ph && st.ph.parentNode) { st.ph.parentNode.insertBefore(root, st.ph); st.ph.remove(); } else stage.appendChild(root);
        st.full = false; zoomBtn.textContent = "⛶";
      }
      window.dispatchEvent(new Event("resize"));
    },
    destroy() {
      if (st.dead) return; st.dead = true;
      st.timers.forEach(clearTimeout); st.intervals.forEach(clearInterval);
      st.cleanups.forEach((f) => { try { f(); } catch (e) { /* ignoruj */ } });
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("wrg-lock");
      if (st.ph && st.ph.parentNode) st.ph.remove();
      root.remove();
      if (current === api) current = null;
    },
    close() { api.destroy(); ctx.close(); }
  };
  current = api;
  return api;
}
/* wspólny blok z rangą i listą nagród */
function rankHtml() {
  const r = rankInfo();
  return '<div class="wrg-rank"><span>' + r.rank.ic + "</span><span>Ranga: <b>" + esc(r.rank.name) + "</b>" + (r.next ? " · do „" + esc(r.next.name) + "”: " + r.toNext + " pkt rangi" : " · najwyższa ranga!") + "</span></div>";
}
function rewardsHtml(rows, got) {
  return '<div class="wrg-reward">' + rows.map((x, i) => '<div class="' + (got && got >= i + 1 ? "got" : "") + '"><span>' + x[0] + "</span><em>" + x[1] + "</em></div>").join("") + "</div>";
}
function dayLeftHtml(id) {
  const left = Math.max(0, GAME_DAY_CAP - perGameToday(id));
  return '<p style="font-size:12.5px;color:#9a9aa8">Z tej gry możesz dziś jeszcze zdobyć: <b style="color:#f1cf6a">' + left + " pkt</b> (limit " + GAME_DAY_CAP + " na dobę). Wszystkie gry razem: 8 pkt na dobę.</p>";
}

const LIB = { rnd, rint, clamp, pick, shuffle, h, esc, fmtTime, S, save, best, bumpBest, bumpRun, perGameToday, grant, SFX, createShell, rankHtml, rewardsHtml, dayLeftHtml, rankInfo, utcDay };
/* =====================================================================
   GRA 1: Memory Mistrzowskie
   7 poziomów (od 12 do 36 kart), limit ruchów poniżej tego, co potrafi idealna pamięć na wyższych poziomach,
   odliczanie czasu, krótki podgląd na starcie. Punkty: poziom 5 (+1), 6 (+1), 7 (+1) — w jednym podejściu.
   ===================================================================== */
(function () {
const { h, esc, shuffle, rint, fmtTime, best, bumpBest, bumpRun, grant, SFX, createShell, rankHtml, rewardsHtml, dayLeftHtml } = LIB;

/* ---- ikony: 18 ręcznie rysowanych składników (SVG 64x64) ---- */
const sh = '<ellipse cx="32" cy="58.5" rx="17" ry="3.4" fill="#000" opacity=".2"/>';
function kernels() {
  let s = "";
  for (let r = 0; r < 9; r++) for (let c = 0; c < 4; c++) {
    const x = 24.6 + c * 4.9 + (r % 2 ? 2.4 : 0), y = 12 + r * 5.2;
    s += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="2.3" ry="2.5" fill="url(#wmKn)" stroke="#c98d0b" stroke-width=".5"/>';
  }
  return s;
}
const ICONS = [
  { id: "pep", name: "Pepperoni", fact: "Włoskie „peperoni” to papryki! Pikantna kiełbasa z pizzy to amerykański pomysł.", svg: sh +
    '<defs><radialGradient id="wmPe" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#f4725c"/><stop offset=".55" stop-color="#c92e28"/><stop offset="1" stop-color="#861918"/></radialGradient></defs>' +
    '<circle cx="32" cy="32" r="25.5" fill="url(#wmPe)"/><circle cx="32" cy="32" r="24.3" fill="none" stroke="#6f1212" stroke-width="2.2"/>' +
    '<g fill="#f9c9b6" opacity=".9"><circle cx="22" cy="24" r="3"/><circle cx="38" cy="20" r="2.4"/><circle cx="44" cy="33" r="3.2"/><circle cx="31" cy="38" r="2.6"/><circle cx="20" cy="40" r="2.2"/><circle cx="36" cy="46" r="2.8"/><circle cx="29" cy="27" r="1.6"/><circle cx="46" cy="44" r="1.8"/></g>' +
    '<ellipse cx="23" cy="17" rx="10" ry="4.4" fill="#fff" opacity=".28" transform="rotate(-28 23 17)"/>' },
  { id: "mush", name: "Pieczarka", fact: "Pieczarka to jeden z najczęściej uprawianych grzybów jadalnych na świecie.", svg: sh +
    '<defs><linearGradient id="wmMc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9b48a"/><stop offset="1" stop-color="#9a6b43"/></linearGradient><linearGradient id="wmMs" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9dcc5"/><stop offset=".5" stop-color="#fbf4e6"/><stop offset="1" stop-color="#cdbb9b"/></linearGradient></defs>' +
    '<path d="M23 36h18l-1.6 15.5q-1 6.5-7.4 6.5t-7.4-6.5z" fill="url(#wmMs)"/>' +
    '<path d="M4.5 36C4.5 17 17 7 32 7s27.5 10 27.5 29q0 4.5-5 4.5H9.5q-5 0-5-4.5z" fill="url(#wmMc)"/>' +
    '<path d="M10 40.5h44q-5-3.6-9-1.6-6 3.4-13 0-7 3.4-13 0-4-2-9 1.6z" fill="#5a3b20" opacity=".55"/>' +
    '<g fill="#f3e3cc" opacity=".6"><circle cx="17" cy="26" r="2"/><circle cx="46" cy="22" r="2.2"/><circle cx="40" cy="31" r="1.6"/><circle cx="26" cy="16" r="1.5"/></g>' +
    '<ellipse cx="22" cy="19" rx="10" ry="4.6" fill="#fff" opacity=".32" transform="rotate(-24 22 19)"/>' },
  { id: "olive", name: "Oliwka", fact: "Zielone i czarne oliwki to ten sam owoc — różni je stopień dojrzałości i sposób obróbki.", svg: sh +
    '<defs><radialGradient id="wmOl" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#b9c84a"/><stop offset=".55" stop-color="#6f8420"/><stop offset="1" stop-color="#3a4a0e"/></radialGradient></defs>' +
    '<g transform="rotate(-24 32 32)"><ellipse cx="32" cy="32" rx="19" ry="25" fill="url(#wmOl)"/><ellipse cx="32" cy="9.5" rx="7.4" ry="4.4" fill="#27330a"/><ellipse cx="32" cy="9.8" rx="5.2" ry="3" fill="#d1352b"/><ellipse cx="31" cy="9" rx="2" ry="1" fill="#f7857a"/><ellipse cx="24.5" cy="29" rx="3.6" ry="10" fill="#fff" opacity=".3"/></g>' },
  { id: "basil", name: "Bazylia", fact: "Bazylię dodaje się zwykle tuż przed albo po wypieku — długo w piecu traci aromat.", svg: sh +
    '<defs><linearGradient id="wmBa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fc457"/><stop offset="1" stop-color="#1f6a2b"/></linearGradient></defs>' +
    '<path d="M32 58C9 50 5 27 32 5c27 22 23 45 0 53z" fill="url(#wmBa)"/><path d="M32 58C20 54 12 44 12 32 16 22 24 12 32 5" fill="none"/>' +
    '<path d="M32 57V11" stroke="#d5efa8" stroke-width="2.4" stroke-linecap="round"/>' +
    '<g stroke="#b6df8a" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".85"><path d="M32 47q-10-3-17-12"/><path d="M32 37q-9-3-15-12"/><path d="M32 27q-6-3-10-10"/><path d="M32 47q10-3 17-12"/><path d="M32 37q9-3 15-12"/><path d="M32 27q6-3 10-10"/></g>' +
    '<ellipse cx="22" cy="24" rx="4" ry="11" fill="#fff" opacity=".16" transform="rotate(18 22 24)"/>' },
  { id: "tom", name: "Pomidor", fact: "Pomidory San Marzano rosną u stóp Wezuwiusza — są słodkie i mają mało pestek.", svg: sh +
    '<defs><radialGradient id="wmTo" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#ff7459"/><stop offset=".55" stop-color="#d82d22"/><stop offset="1" stop-color="#8a1410"/></radialGradient></defs>' +
    '<path d="M32 13C14 10 4 24 6 38c2 14 14 20 26 20s24-6 26-20c2-14-8-28-26-25z" fill="url(#wmTo)"/>' +
    '<path d="M32 18l-6-8 8 2 4-8 4 8 8-2-6 8-4 5z" fill="#3f9a2c"/><path d="M32 18l-6-8 8 2z" fill="#58b83e"/><path d="M32 8v8" stroke="#2e7a1f" stroke-width="2.4" stroke-linecap="round"/>' +
    '<ellipse cx="19" cy="29" rx="6.5" ry="9" fill="#fff" opacity=".3" transform="rotate(24 19 29)"/>' },
  { id: "moz", name: "Mozzarella", fact: "Prawdziwa mozzarella di bufala powstaje z mleka bawołów.", svg: sh +
    '<defs><radialGradient id="wmMo" cx=".36" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f8efd9"/><stop offset="1" stop-color="#dccaa0"/></radialGradient></defs>' +
    '<circle cx="32" cy="33" r="24" fill="url(#wmMo)" stroke="#c4b180" stroke-width="1.6"/><path d="M12 36q10 6 20 3t20-3" fill="none" stroke="#d8c89f" stroke-width="1.4" opacity=".7"/>' +
    '<path d="M44 12q9 7 11 20" fill="none" stroke="#e4d4ac" stroke-width="1.4" opacity=".6"/>' +
    '<ellipse cx="23" cy="20" rx="9" ry="5" fill="#fff" opacity=".85" transform="rotate(-30 23 20)"/>' +
    '<path d="M50 46c2 4 1 8-2 9-3-1-4-5-2-9z" fill="#cfe6f5" opacity=".85"/><ellipse cx="9" cy="54" rx="3" ry="2" fill="#cfe6f5" opacity=".7"/>' },
  { id: "pepper", name: "Papryka", fact: "Papryka ma więcej witaminy C niż cytryna.", svg: sh +
    '<defs><linearGradient id="wmPr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a3d"/><stop offset=".5" stop-color="#e83e24"/><stop offset="1" stop-color="#a51a14"/></linearGradient></defs>' +
    '<path d="M32 15C21 8 7 14 7 33c0 15 8 25 17 25 4 0 6-2 8-2s4 2 8 2c9 0 17-10 17-25 0-19-14-25-25-18z" fill="url(#wmPr)"/>' +
    '<g stroke="#8a1610" stroke-width="1.6" fill="none" opacity=".4" stroke-linecap="round"><path d="M32 16c-3 12-3 28 0 40"/><path d="M20 15c-6 10-6 30 2 42"/><path d="M44 15c6 10 6 30-2 42"/></g>' +
    '<path d="M31 15c-1-7 2-11 8-11 2 0 3 2 2 4-3 0-5 2-5 6z" fill="#3d9a2a"/><ellipse cx="17" cy="28" rx="4" ry="10" fill="#fff" opacity=".3" transform="rotate(12 17 28)"/>' },
  { id: "onion", name: "Cebula", fact: "Czerwona cebula jest łagodniejsza i słodsza od białej, dlatego tak często ląduje na pizzy.", svg: sh +
    '<defs><linearGradient id="wmOn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d98ad0"/><stop offset=".55" stop-color="#a6479d"/><stop offset="1" stop-color="#6a246a"/></linearGradient></defs>' +
    '<path d="M32 5c2 9 21 14 22 32 1 13-10 21-22 21S9 50 10 37C11 19 30 14 32 5z" fill="url(#wmOn)"/>' +
    '<g stroke="#f4d8f0" stroke-width="1.5" fill="none" opacity=".55" stroke-linecap="round"><path d="M32 8C23 22 19 40 24 57"/><path d="M32 8c0 17 0 34 0 50"/><path d="M32 8c9 14 13 32 8 49"/><path d="M32 12C16 24 14 44 22 55"/><path d="M32 12c16 12 18 32 10 43"/></g>' +
    '<path d="M32 5c-1-3 0-4 2-4" stroke="#8b6a3a" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M28 58l-2 3m6-3v4m4-4l2 3" stroke="#c9b48a" stroke-width="1.4" stroke-linecap="round"/>' +
    '<ellipse cx="20" cy="30" rx="4" ry="10" fill="#fff" opacity=".22" transform="rotate(14 20 30)"/>' },
  { id: "corn", name: "Kukurydza", fact: "Pizza z kukurydzą to w Polsce niemal klasyk, ale we Włoszech spotyka się ją rzadko.", svg: sh +
    '<defs><linearGradient id="wmKn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe35c"/><stop offset="1" stop-color="#f0ab14"/></linearGradient><linearGradient id="wmHu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8bcf5a"/><stop offset="1" stop-color="#3b8a2c"/></linearGradient></defs>' +
    '<ellipse cx="32" cy="32" rx="13" ry="27" fill="#f6c62a" stroke="#d99c10" stroke-width="1.2"/>' + kernels() +
    '<path d="M32 58C14 55 6 38 15 24c1 13 9 24 17 34z" fill="url(#wmHu)"/><path d="M32 58C50 55 58 38 49 24c-1 13-9 24-17 34z" fill="url(#wmHu)"/><path d="M32 59C24 50 20 40 20 30c6 8 10 18 12 29z" fill="#58ad3a" opacity=".85"/>' },
  { id: "ham", name: "Szynka", fact: "Prosciutto cotto to szynka gotowana, a crudo — surowa, dojrzewająca.", svg: sh +
    '<defs><linearGradient id="wmHm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3b0"/><stop offset=".6" stop-color="#ee7f84"/><stop offset="1" stop-color="#c24f5a"/></linearGradient></defs>' +
    '<path d="M7 31C6 16 22 9 35 11c15 3 23 13 22 27-1 12-14 19-27 17C16 53 8 45 7 31z" fill="url(#wmHm)" stroke="#f9ddd2" stroke-width="3.6"/>' +
    '<g stroke="#ffe3dc" stroke-width="1.6" fill="none" opacity=".7" stroke-linecap="round"><path d="M16 26q10-6 20 0t18 2"/><path d="M14 38q12-6 22 0t16 0"/><path d="M22 18q8 3 16 0"/></g>' +
    '<ellipse cx="22" cy="20" rx="8" ry="3.6" fill="#fff" opacity=".35" transform="rotate(-25 22 20)"/>' },
  { id: "pine", name: "Ananas", fact: "Pizza hawajska powstała w 1962 roku w Kanadzie — wymyślił ją Sam Panopoulos.", svg: sh +
    '<defs><linearGradient id="wmPi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe05a"/><stop offset="1" stop-color="#d4871a"/></linearGradient><clipPath id="wmPc"><ellipse cx="32" cy="40" rx="17.5" ry="21"/></clipPath><linearGradient id="wmPl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2f8a2c"/><stop offset="1" stop-color="#7cc84e"/></linearGradient></defs>' +
    '<g fill="url(#wmPl)"><path d="M32 22C26 14 22 8 24 2c4 4 7 10 8 20z"/><path d="M32 22c6-8 10-14 8-20-4 4-7 10-8 20z"/><path d="M31 23C20 18 13 14 11 8c8 1 15 6 20 15z"/><path d="M33 23c11-5 18-9 20-15-8 1-15 6-20 15z"/><path d="M32 22c-2-8-1-14 0-19 1 5 2 11 0 19z" opacity=".85"/></g>' +
    '<ellipse cx="32" cy="40" rx="17.5" ry="21" fill="url(#wmPi)"/>' +
    '<g clip-path="url(#wmPc)" stroke="#a45f0c" stroke-width="1.5" opacity=".75"><path d="M10 20l44 44M10 32l32 32M10 44l20 20M22 18l36 36M34 18l24 24M46 18l12 12"/><path d="M54 20L10 64M54 32L22 64M54 44L34 64M42 18L6 54M30 18L6 42M18 18L6 30"/></g>' +
    '<g clip-path="url(#wmPc)" fill="#8a4c06" opacity=".7"><circle cx="32" cy="29" r="1.3"/><circle cx="25" cy="36" r="1.3"/><circle cx="39" cy="36" r="1.3"/><circle cx="32" cy="43" r="1.3"/><circle cx="25" cy="50" r="1.3"/><circle cx="39" cy="50" r="1.3"/></g>' +
    '<ellipse cx="24" cy="32" rx="4" ry="10" fill="#fff" opacity=".28" transform="rotate(14 24 32)"/>' },
  { id: "garlic", name: "Czosnek", fact: "W pizzy marinara czosnek to główny dodatek obok oregano i oliwy.", svg: sh +
    '<defs><linearGradient id="wmGa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf6"/><stop offset=".6" stop-color="#ece1c8"/><stop offset="1" stop-color="#c9b88f"/></linearGradient></defs>' +
    '<path d="M32 13C22 21 9 27 9 42c0 12 10 17 23 17s23-5 23-17c0-15-13-21-23-29z" fill="url(#wmGa)" stroke="#b9a577" stroke-width="1.4"/>' +
    '<g stroke="#bda97c" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"><path d="M32 14C22 28 19 44 25 58"/><path d="M32 14C42 28 45 44 39 58"/><path d="M32 14c0 15 0 30 0 45"/></g>' +
    '<path d="M29 14c-1-6 1-10 3-12 2 2 4 6 3 12z" fill="#e8dcb8" stroke="#bda97c" stroke-width="1.2"/>' +
    '<path d="M26 59l-2 3m8-3v3m6-3l2 3" stroke="#b49e6f" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="20" cy="34" rx="3.6" ry="9" fill="#fff" opacity=".5" transform="rotate(14 20 34)"/>' },
  { id: "chili", name: "Chili", fact: "Peperoncino to znak rozpoznawczy kuchni Kalabrii — „diavola” jest przez nią ostra.", svg: sh +
    '<defs><linearGradient id="wmCh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5a3c"/><stop offset=".6" stop-color="#d4181c"/><stop offset="1" stop-color="#8c0e14"/></linearGradient></defs>' +
    '<path d="M18 19C36 13 53 25 55 45c1 10-4 16-9 13-1-9-8-20-27-27-7-3-7-10-1-12z" fill="url(#wmCh)"/>' +
    '<path d="M14 18C8 15 6 8 12 5c2 5 6 8 11 9z" fill="#3d9a2a"/><path d="M12 17c-2 4 0 8 5 8l3-6z" fill="#2f7d22"/>' +
    '<path d="M24 20c14-1 24 8 27 20" fill="none" stroke="#fff" stroke-width="2.4" opacity=".35" stroke-linecap="round"/>' },
  { id: "fish", name: "Anchois", fact: "Anchois to mała, solona ryba o intensywnym smaku — kilka filecików na pizzę w zupełności wystarczy.", svg: sh +
    '<defs><linearGradient id="wmFi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d86a8"/><stop offset=".45" stop-color="#b4cfe3"/><stop offset=".55" stop-color="#eef5fa"/><stop offset="1" stop-color="#c9d9e6"/></linearGradient></defs>' +
    '<path d="M4 33C12 20 34 17 47 29l11-9v26l-11-9C34 48 12 46 4 33z" fill="url(#wmFi)" stroke="#3f6486" stroke-width="1.6"/>' +
    '<path d="M6 34c14-3 30-3 42-4" stroke="#33597c" stroke-width="2.2" fill="none" opacity=".7"/><path d="M26 20q4-7 10-3" fill="#6d93b5" stroke="#3f6486" stroke-width="1.2"/><path d="M26 47q5 6 11 2" fill="#9fbdd4" stroke="#3f6486" stroke-width="1.2"/>' +
    '<path d="M15 24q-3 9 0 18" stroke="#3f6486" stroke-width="1.5" fill="none"/><circle cx="12" cy="31" r="3.2" fill="#fff" stroke="#27455f" stroke-width="1.2"/><circle cx="11.4" cy="31" r="1.5" fill="#111"/>' +
    '<g stroke="#fff" stroke-width="1" opacity=".5"><path d="M24 28q2 3 0 6M30 27q2 3 0 7M36 27q2 3 0 7M42 29q2 2 0 5"/></g>' },
  { id: "egg", name: "Jajko", fact: "Jajko wbija się na pizzę pod koniec pieczenia, żeby żółtko zostało płynne.", svg: sh +
    '<defs><radialGradient id="wmYo" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#ffe27a"/><stop offset=".6" stop-color="#f7a900"/><stop offset="1" stop-color="#d27800"/></radialGradient></defs>' +
    '<path d="M9 34C6 19 20 6 35 9c14 2 24 12 21 25 3 12-8 24-23 22C19 59 7 50 9 34z" fill="#fffdf7" stroke="#e3dccb" stroke-width="2"/>' +
    '<path d="M16 44q10 8 24 4" fill="none" stroke="#e8e1cf" stroke-width="3" opacity=".7" stroke-linecap="round"/>' +
    '<circle cx="31" cy="32" r="13" fill="url(#wmYo)"/><ellipse cx="26.5" cy="26.5" rx="4.6" ry="3" fill="#fff" opacity=".75" transform="rotate(-30 26.5 26.5)"/>' },
  { id: "bacon", name: "Boczek", fact: "Włoska pancetta to boczek solony i dojrzewający, zwykle niewędzony.", svg: sh +
    '<defs><linearGradient id="wmBc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e5645a"/><stop offset=".5" stop-color="#b9302c"/><stop offset="1" stop-color="#e5645a"/></linearGradient></defs>' +
    '<g transform="rotate(-14 32 32)"><path d="M3 16q9-7 18 0t18 0 18 0v16q-9 7-18 0t-18 0-18 0z" fill="url(#wmBc)" stroke="#8f1f1d" stroke-width="1.4"/>' +
    '<path d="M3 22q9-7 18 0t18 0 18 0" fill="none" stroke="#fbe3d6" stroke-width="3.2" opacity=".9"/><path d="M3 28q9-7 18 0t18 0 18 0" fill="none" stroke="#fbe3d6" stroke-width="2" opacity=".75"/>' +
    '<path d="M6 36q9-7 18 0t18 0 16 -1v15q-9 7-18 0t-18 0-16 1z" fill="url(#wmBc)" stroke="#8f1f1d" stroke-width="1.4"/><path d="M6 43q9-7 18 0t18 0 16 -1" fill="none" stroke="#fbe3d6" stroke-width="3" opacity=".9"/></g>' },
  { id: "arug", name: "Rukola", fact: "Rukolę kładzie się na gorącą pizzę po wypieku, żeby nie zwiędła.", svg: sh +
    '<defs><linearGradient id="wmAr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fd35f"/><stop offset="1" stop-color="#2a7a2c"/></linearGradient></defs>' +
    '<path d="M32 59V16" stroke="#b9e68f" stroke-width="2.6" stroke-linecap="round"/>' +
    '<g fill="url(#wmAr)" stroke="#1f5e22" stroke-width=".9"><ellipse cx="32" cy="12" rx="6.5" ry="10"/>' +
    '<ellipse cx="21" cy="24" rx="10.5" ry="4.6" transform="rotate(-24 21 24)"/><ellipse cx="43" cy="24" rx="10.5" ry="4.6" transform="rotate(24 43 24)"/>' +
    '<ellipse cx="20" cy="36" rx="11.5" ry="4.8" transform="rotate(-18 20 36)"/><ellipse cx="44" cy="36" rx="11.5" ry="4.8" transform="rotate(18 44 36)"/>' +
    '<ellipse cx="22" cy="48" rx="10" ry="4.2" transform="rotate(-12 22 48)"/><ellipse cx="42" cy="48" rx="10" ry="4.2" transform="rotate(12 42 48)"/></g>' +
    '<g stroke="#d9f5b6" stroke-width="1.1" opacity=".7" stroke-linecap="round"><path d="M32 24L14 28M32 24L50 28M32 36L12 40M32 36L52 40M32 48L16 51M32 48L48 51"/></g>' },
  { id: "parm", name: "Parmezan", fact: "Parmigiano Reggiano dojrzewa co najmniej 12 miesięcy.", svg: sh +
    '<defs><linearGradient id="wmPt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffef9a"/><stop offset="1" stop-color="#f2c545"/></linearGradient><linearGradient id="wmPl2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e2ad2e"/><stop offset="1" stop-color="#c98f1a"/></linearGradient><linearGradient id="wmPr2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9a22a"/><stop offset="1" stop-color="#a97012"/></linearGradient></defs>' +
    '<path d="M5 27L40 12l19 14-35 16z" fill="url(#wmPt)"/><path d="M5 27l19 15v17L5 46z" fill="url(#wmPl2)"/><path d="M24 42l35-16v22L24 59z" fill="url(#wmPr2)"/>' +
    '<path d="M24 42l35-16" stroke="#8f5e0b" stroke-width="1.6" fill="none"/><path d="M24 42v17" stroke="#8f5e0b" stroke-width="1.4"/>' +
    '<g fill="#fff6c8" opacity=".85"><circle cx="20" cy="26" r="1.2"/><circle cx="30" cy="24" r="1"/><circle cx="38" cy="19" r="1.2"/><circle cx="26" cy="32" r="1"/><circle cx="14" cy="35" r="1"/><circle cx="16" cy="44" r="1.2"/></g>' +
    '<g fill="#8f5e0b" opacity=".35"><ellipse cx="44" cy="40" rx="2.4" ry="1.4"/><ellipse cx="34" cy="50" rx="2" ry="1.2"/></g>' }
];
const BACK = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="wmBk" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#1f6b3f"/><stop offset="1" stop-color="#0c3a22"/></radialGradient></defs>' +
  '<rect x="3" y="3" width="58" height="58" rx="9" fill="url(#wmBk)"/><rect x="6.5" y="6.5" width="51" height="51" rx="6.5" fill="none" stroke="#d4af37" stroke-width="1.4" opacity=".9"/>' +
  '<circle cx="32" cy="32" r="16" fill="#e9b45f" stroke="#d4af37" stroke-width="1.6"/><circle cx="32" cy="32" r="12" fill="#c92e28"/><g stroke="#f4e3bb" stroke-width="1.2" opacity=".85"><path d="M32 20v24M20 32h24M23.5 23.5l17 17M40.5 23.5l-17 17"/></g><circle cx="32" cy="32" r="3" fill="#f4e3bb"/>' +
  '<g fill="#d4af37"><circle cx="10" cy="10" r="1.6"/><circle cx="54" cy="10" r="1.6"/><circle cx="10" cy="54" r="1.6"/><circle cx="54" cy="54" r="1.6"/></g></svg>';

/* ---- poziomy ---- */
const LV = [
  { pairs: 6,  cols: 4, rows: 3, moves: 12, time: 34,  peek: 2200, wrong: 700, swap: 0, pen: 0 },
  { pairs: 8,  cols: 4, rows: 4, moves: 15, time: 44,  peek: 2100, wrong: 650, swap: 0, pen: 0 },
  { pairs: 10, cols: 5, rows: 4, moves: 19, time: 54,  peek: 1900, wrong: 600, swap: 5, pen: 1 },
  { pairs: 12, cols: 6, rows: 4, moves: 23, time: 64,  peek: 1800, wrong: 560, swap: 4, pen: 2 },
  { pairs: 15, cols: 6, rows: 5, moves: 28, time: 80,  peek: 1600, wrong: 520, swap: 4, pen: 2 },
  { pairs: 18, cols: 6, rows: 6, moves: 34, time: 98,  peek: 1400, wrong: 480, swap: 3, pen: 3 },
  { pairs: 18, cols: 6, rows: 6, moves: 31, time: 86,  peek: 1000, wrong: 450, swap: 3, pen: 3 }
];
const REWARD_AT = { 5: 1, 6: 1, 7: 1 };   // po ukończeniu poziomu: tyle punktów
const REW_ROWS = [["Ukończ poziom 5 (30 kart)", "+1 pkt"], ["Ukończ poziom 6 (36 kart)", "+1 pkt"], ["Ukończ poziom 7 — Legenda (36 kart, 28 ruchów)", "+1 pkt"]];

const CSS = `
.wrg-memory .wm-grid{display:grid;gap:6px;perspective:900px;margin:8px auto 4px;width:100%;max-width:520px}
.wrg-memory .wm-card{position:relative;aspect-ratio:5/6;padding:0;border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent;outline-offset:2px}
.wrg-memory .wm-in{position:absolute;inset:0;transition:transform .38s cubic-bezier(.3,.7,.3,1);transform-style:preserve-3d}
.wrg-memory .wm-card.up .wm-in,.wrg-memory .wm-card.done .wm-in{transform:rotateY(180deg)}
.wrg-memory .wm-f,.wrg-memory .wm-b{position:absolute;inset:0;border-radius:10px;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:grid;place-items:center;overflow:hidden}
.wrg-memory .wm-b{background:#0d3d24;box-shadow:inset 0 0 0 1px rgba(212,175,55,.35),0 2px 5px rgba(0,0,0,.45)}
.wrg-memory .wm-b svg,.wrg-memory .wm-f svg{width:100%;height:100%;display:block}
.wrg-memory .wm-f{transform:rotateY(180deg);background:radial-gradient(circle at 35% 25%,#fffdf5,#f1e6cb 70%,#e2d2ad);box-shadow:inset 0 0 0 1px #cdb98a,0 2px 5px rgba(0,0,0,.45)}
.wrg-memory .wm-f svg{padding:11%}
.wrg-memory .wm-card.done .wm-f{background:radial-gradient(circle at 35% 25%,#fffbe6,#f7e7ac 70%,#ebd07a);box-shadow:inset 0 0 0 2px #d4af37,0 0 14px rgba(212,175,55,.55)}
.wrg-memory .wm-card.done{cursor:default}
.wrg-memory .wm-card.shake .wm-in{animation:wmshake .4s}
@keyframes wmshake{0%,100%{translate:0}25%{translate:-3px}75%{translate:3px}}
.wrg-memory .wm-card:not(.up):not(.done):hover .wm-in{transform:translateY(-2px)}
.wrg-memory .wm-card.swapped{animation:wmswap .7s ease}
@keyframes wmswap{0%{transform:scale(1) rotate(0)}30%{transform:scale(1.18) rotate(-6deg);filter:brightness(1.6)}100%{transform:scale(1) rotate(0)}}
.wrg-memory .wm-peek{text-align:center;font-weight:700;color:#f1cf6a;margin:4px 0 2px;font-size:15px}
.wrg-memory .wm-felt{background:radial-gradient(ellipse at 50% 30%,#14663a,#0a3d23 75%);border-radius:12px;padding:10px 8px 8px;box-shadow:inset 0 0 0 3px #5a3a1c,inset 0 0 22px rgba(0,0,0,.55)}
.wrg-memory .wm-lvls{display:flex;gap:5px;justify-content:center;margin:8px 0 2px}
.wrg-memory .wm-lvls i{width:30px;height:7px;border-radius:99px;background:#2a2a33}
.wrg-memory .wm-lvls i.on{background:linear-gradient(90deg,#14b866,#d4af37)}
.wrg-memory .wm-lvls i.cur{background:#f1cf6a}
.wrg-memory .wm-lvls i.pt{box-shadow:0 0 0 2px #d4af37}
`;

function start(stage, ctx) {
  const shell = createShell(stage, ctx, { id: "memory", icon: "🃏", title: "Memory Mistrzowskie", css: { id: "memory", css: CSS } });
  bumpRun("memory");
  let run = { level: 0, earned: 0 };

  function intro() {
    shell.setTitle("Memory Mistrzowskie");
    shell.screen({
      hero: "🃏", title: "Memory Mistrzowskie",
      html: '<p>Siedem coraz trudniejszych plansz. Zapamiętaj ułożenie składników i znajdź wszystkie pary — ale masz <b>ściśle ograniczoną liczbę ruchów</b> i czas.</p>' +
        '<div class="wrg-rules"><b>Zasady</b><ul><li>Ruch = odkrycie dwóch kart.</li><li>Przed każdą planszą widzisz karty przez chwilę (z każdym poziomem krócej).</li><li>Skończą się ruchy albo czas — koniec podejścia, zaczynasz od poziomu 1.</li><li>Limit ruchów jest tak ustawiony, że na wyższych poziomach nie wystarczy nawet idealnej pamięci bez odrobiny szczęścia.</li></ul></div>' +
        rewardsHtml(REW_ROWS) + rankHtml() +
        '<p style="font-size:12.5px;color:#9a9aa8">Rekord: poziom <b style="color:#f1cf6a">' + best("memory", "level") + '</b> z 7</p>' + dayLeftHtml("memory"),
      buttons: [{ label: "▶ Zagraj", on: () => { run = { level: 0, earned: 0 }; level(); } }, { label: "Zamknij", cls: "ghost", on: () => shell.close() }]
    });
  }

  function level() {
    const L = LV[run.level], lv = run.level + 1;
    shell.setTitle("Poziom " + lv + " / 7");
    const icons = shuffle(ICONS).slice(0, L.pairs);
    const deck = shuffle(icons.concat(icons)).map((ic, i) => ({ i, ic, state: "down" }));
    const b = shell.body; b.innerHTML = "";
    const pill = (t) => h("span", { class: "wrg-pill" }, t);
    const movesEl = h("b", null, "0"), pairsEl = h("b", null, "0"), timeEl = h("b", null, fmtTime(L.time));
    const hud = h("div", { class: "wrg-hud" },
      h("span", { class: "wrg-pill" }, "Ruchy: ", movesEl, " / " + L.moves),
      h("span", { class: "wrg-pill" }, "Pary: ", pairsEl, " / " + L.pairs),
      h("span", { class: "wrg-pill" }, "⏱ ", timeEl));
    const tbar = h("div", { class: "wrg-bar2" }, h("i"));
    const peekEl = h("div", { class: "wm-peek" }, "Zapamiętaj!");
    const grid = h("div", { class: "wm-grid", style: "grid-template-columns:repeat(" + L.cols + ",1fr)" });
    const cards = deck.map((c) => {
      const el = h("button", { class: "wm-card", type: "button", "aria-label": "Karta " + (c.i + 1) },
        h("div", { class: "wm-in" }, h("div", { class: "wm-b", html: BACK }), h("div", { class: "wm-f", html: '<svg viewBox="0 0 64 64" role="img" aria-label="' + esc(c.ic.name) + '">' + c.ic.svg + "</svg>" })));
      c.el = el; grid.append(el); return c;
    });
    const dots = h("div", { class: "wm-lvls" }, LV.map((_, k) => h("i", { class: (k < run.level ? "on " : "") + (k === run.level ? "cur " : "") + (REWARD_AT[k + 1] ? "pt" : "") })));
    b.append(hud, tbar, peekEl, h("div", { class: "wm-felt" }, grid), dots);

    let phase = "peek", moves = 0, pairs = 0, left = L.time, open = [], lock = true, over = false, misses = 0;
    cards.forEach((c) => c.el.classList.add("up"));
    let pk = L.peek / 1000;
    peekEl.textContent = "Zapamiętaj! " + Math.ceil(pk);
    let lastT = performance.now();
    const tick = shell.every(100, () => {
      const now = performance.now(), dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
      if (phase === "peek") {
        pk -= dt; peekEl.textContent = "Zapamiętaj! " + Math.max(1, Math.ceil(pk));
        if (pk <= 0) { phase = "play"; lock = false; cards.forEach((c) => c.el.classList.remove("up")); peekEl.textContent = "Do dzieła! Znajdź wszystkie pary."; }
      } else if (phase === "play" && !over) {
        left -= dt; timeEl.textContent = fmtTime(left);
        const f = Math.max(0, left / L.time); tbar.firstChild.style.width = (f * 100) + "%"; tbar.classList.toggle("low", f < 0.25);
        if (left <= 0) end(false, "Czas minął!");
      }
    });

    function swapTwo() {
      const free = cards.filter((c) => c.state === "down");
      if (free.length < 3) return;
      const [x, y] = shuffle(free).slice(0, 2);
      const ax = x.el, ay = y.el, mx = document.createComment(""), my = document.createComment("");
      ax.replaceWith(mx); ay.replaceWith(my); mx.replaceWith(ay); my.replaceWith(ax);
      [ax, ay].forEach((e) => { e.classList.add("swapped"); setTimeout(() => e.classList.remove("swapped"), 700); });
      shell.toast("🔀 Dwie karty zamieniły się miejscami!", "", 2200);
    }
    function end(win, why) {
      if (over) return; over = true; clearInterval(tick); lock = true;
      if (win) SFX.done(); else SFX.lose();
      setTimeout(() => (win ? won() : lost(why)), win ? 900 : 700);
    }
    function lost(why) {
      bumpBest("memory", "level", run.level);   // ukończone poziomy
      shell.screen({
        hero: "😵", title: why,
        html: '<p>Podejście zakończone na poziomie <b>' + lv + '</b>. Ukończone poziomy: <b>' + run.level + '</b> (rekord: ' + best("memory", "level") + ").</p>" +
          (run.earned ? '<p style="color:#f1cf6a">W tym podejściu zdobyto: <b>+' + run.earned + " pkt</b></p>" : "<p>Punkty zaczynają się od ukończenia poziomu 5.</p>") + rankHtml(),
        buttons: [{ label: "↻ Jeszcze raz", on: () => { run = { level: 0, earned: 0 }; level(); } }, { label: "Zamknij", cls: "ghost", on: () => shell.close() }]
      });
    }
    async function won() {
      const done = run.level + 1; run.level = done;
      bumpBest("memory", "level", done);
      let gain = REWARD_AT[done] || 0, gmsg = "";
      if (gain) { const r = await grant(ctx, "memory", gain); if (r && r.ok) { run.earned += r.given || gain; gmsg = r.msg || ("+" + gain + " pkt"); } else if (r && r.msg) gmsg = r.msg; }
      if (done >= LV.length) {
        shell.screen({
          hero: "🏆", title: "LEGENDA PIZZY!",
          html: "<p>Ukończyłeś wszystkie 7 poziomów — to się prawie nikomu nie udaje.</p>" + (gmsg ? '<p style="color:#f1cf6a"><b>' + esc(gmsg) + "</b></p>" : "") + rewardsHtml(REW_ROWS, run.earned) + rankHtml(),
          buttons: [{ label: "↻ Jeszcze raz", on: () => { run = { level: 0, earned: 0 }; level(); } }, { label: "Zamknij", cls: "ghost", on: () => shell.close() }]
        });
        SFX.win(); return;
      }
      const nl = LV[done];
      shell.screen({
        hero: "✅", title: "Poziom " + done + " ukończony!",
        html: "<p>Ruchy: <b>" + moves + "</b> z " + L.moves + " · czas zostało: <b>" + fmtTime(left) + "</b></p>" + (gmsg ? '<p style="color:#f1cf6a"><b>' + esc(gmsg) + "</b></p>" : "") +
          '<p>Następny: <b>' + nl.pairs * 2 + " kart</b>, limit <b>" + nl.moves + " ruchów</b>, podgląd " + (nl.peek / 1000).toFixed(1) + " s.</p>",
        buttons: [{ label: "Dalej ▶", on: level }]
      });
    }

    grid.addEventListener("click", (e) => {
      const el = e.target.closest(".wm-card"); if (!el || lock || over) return;
      const c = cards.find((x) => x.el === el);
      if (!c || c.state !== "down") return;
      SFX.flip(); c.state = "up"; el.classList.add("up"); open.push(c);
      if (open.length < 2) return;
      lock = true; moves++; movesEl.textContent = moves;
      const [a, bb] = open; open = [];
      if (a.ic.id === bb.ic.id) {
        setTimeout(() => {
          a.state = bb.state = "done"; a.el.classList.add("done"); bb.el.classList.add("done"); SFX.match(); pairs++; pairsEl.textContent = pairs;
          shell.toast(a.ic.name + ": " + a.ic.fact, "", 3200);
          if (pairs >= L.pairs) end(true); else if (moves >= L.moves) end(false, "Skończyły się ruchy!"); else lock = false;
        }, 380);
      } else {
        setTimeout(() => {
          a.el.classList.add("shake"); bb.el.classList.add("shake"); SFX.miss();
          misses++; if (L.pen) { left -= L.pen; timeEl.textContent = fmtTime(Math.max(0, left)); }
          setTimeout(() => {
            a.state = bb.state = "down"; a.el.classList.remove("up", "shake"); bb.el.classList.remove("up", "shake");
            if (moves >= L.moves) end(false, "Skończyły się ruchy!");
            else { if (L.swap && misses % L.swap === 0) swapTwo(); lock = false; }
          }, L.wrong * 0.6);
        }, 380);
      }
      if (moves >= L.moves && a.ic.id === bb.ic.id && pairs + 1 < L.pairs) { /* ostatni ruch trafiony, ale to nie koniec — obsłużone wyżej */ }
    });
  }

  intro();
}
window.WRGames.register({ id: "memory", icon: "🃏", name: "Memory Mistrzowskie", desc: "7 plansz, limit ruchów i czasu — punkty od poziomu 5", start });
})();
/* =====================================================================
   GRA 2: Quiz Znawca
   Seria 20 pytań z puli ponad 100 (pizza, Włochy, składniki, nauka o cieście), 4 życia, 12 s na pytanie, jedno 50:50.
   Punkty: ukończona seria (max 3 błędy) +1, najwyżej 1 błąd +2, bezbłędnie +3.
   ===================================================================== */
(function () {
const { h, esc, shuffle, pick, clamp, best, bumpBest, bumpRun, grant, SFX, createShell, rankHtml, rewardsHtml, dayLeftHtml, S, save } = LIB;

/* [kategoria, pytanie, poprawna, [błędne x3], wyjaśnienie] */
const Q = [
  /* --- historia i style pizzy --- */
  ["Historia", "W którym włoskim mieście narodziła się pizza w dzisiejszej, znanej nam formie?", "Neapol", ["Rzym", "Florencja", "Palermo"], "Pizza w formie z pomidorem i serem rozwinęła się w Neapolu, jako uliczne jedzenie biednych mieszkańców miasta."],
  ["Historia", "Pizza Margherita miała zostać nazwana na cześć królowej:", "Małgorzaty Sabaudzkiej", ["Izabeli Kastylijskiej", "Wiktorii Brytyjskiej", "Marii Teresy Habsburg"], "Według legendy w 1889 roku pizzaiolo Raffaele Esposito przygotował pizzę w barwach flagi Włoch dla królowej Małgorzaty Sabaudzkiej."],
  ["Historia", "W którym roku (według legendy) Raffaele Esposito stworzył pizzę Margherita?", "1889", ["1789", "1921", "1954"], "Rok 1889 — wizyta króla Humberta I i królowej Małgorzaty w Neapolu."],
  ["Historia", "Rok 2017 przyniósł pizzy ważne wyróżnienie. Jakie?", "UNESCO wpisało sztukę neapolitańskich pizzaiuoli na listę dziedzictwa niematerialnego", ["Pizza stała się daniem narodowym Włoch z mocy ustawy", "Neapol dostał tytuł Stolicy Pizzy Świata od UE", "Margherita trafiła na włoską monetę"], "Sztuka neapolitańskich „pizzaiuoli” została wpisana na listę UNESCO w grudniu 2017 roku."],
  ["Historia", "W jakim roku w dokumencie z miasta Gaeta po raz pierwszy zapisano słowo „pizza”?", "997", ["1189", "1503", "1738"], "Najstarsza znana wzmianka o słowie „pizza” pochodzi z łacińskiego dokumentu z Gaety z roku 997."],
  ["Historia", "Gdzie otwarto pierwszą licencjonowaną pizzerię w USA (Lombardi’s, 1905)?", "Nowy Jork", ["Chicago", "Boston", "Filadelfia"], "Gennaro Lombardi otworzył swój lokal na Manhattanie w 1905 roku."],
  ["Historia", "Z jakiego kontynentu pochodzi pomidor, bez którego dziś nie ma pizzy?", "Ameryka Południowa", ["Azja", "Afryka", "Australia"], "Pomidory przypłynęły do Europy z Ameryki w XVI wieku. Przez długi czas uważano je za ozdobne albo trujące."],
  ["Historia", "Kto uchodzi za patrona pizzaiolo?", "Św. Antoni Opat", ["Św. Franciszek z Asyżu", "Św. Mikołaj", "Św. Wawrzyniec"], "Dzień św. Antoniego Opata (17 stycznia) to w Neapolu święto pizzaiolo i pizzy."],
  ["Historia", "Która pizza została wymyślona w 1962 roku w Kanadzie przez Sama Panopoulosa?", "Hawajska", ["Capricciosa", "Diavola", "Quattro Stagioni"], "Sam Panopoulos dodał ananasa do pizzy w restauracji w Chatham w Ontario."],
  ["Historia", "Co potwierdza oznaczenie STG (TSG) dla pizzy neapolitańskiej?", "Gwarantowaną tradycyjną specjalność", ["Chronioną nazwę pochodzenia", "Standard techniczny gastronomii", "Specjalny typ gotowania"], "STG (po angielsku TSG) to „Gwarantowana Tradycyjna Specjalność” — pizza napoletana dostała ją w UE w 2010 roku."],
  ["Historia", "Jaki kod otrzymała mozzarella di bufala campana w oznaczeniach UE?", "DOP — Chroniona Nazwa Pochodzenia", ["DOCG", "IGT", "STG"], "DOP to chroniona nazwa pochodzenia. DOCG i IGT dotyczą win."],
  ["Historia", "W którym roku pizza napoletana dostała status STG w Unii Europejskiej?", "2010", ["1984", "1995", "2017"], "Rozporządzenie weszło w życie w 2010 roku."],
  ["Historia", "Od kiedy działa (jak twierdzi) najstarsza pizzeria świata — Port’Alba w Neapolu?", "1738", ["1589", "1889", "1921"], "Antica Pizzeria Port’Alba przez wiele lat uchodziła za pierwszą w historii pizzerię."],
  /* --- style i nazwy --- */
  ["Style", "Jak nazywa się wyrośnięty brzeg pizzy neapolitańskiej?", "Cornicione", ["Bruschetta", "Crostino", "Focaccia"], "Cornicione (dosłownie „gzyms”) to puszysty obrzeżek pizzy."],
  ["Style", "Pizza Marinara w tradycyjnej wersji NIE zawiera:", "Mozzarelli", ["Czosnku", "Oregano", "Sosu pomidorowego"], "Marinara to pomidory, czosnek, oregano i oliwa — bez sera."],
  ["Style", "Co oznacza nazwa „calzone”?", "Nogawka (spodnia)", ["Kieszeń", "Złożony placek", "Koperta"], "Calzone to po włosku „nogawka” — od kształtu złożonej pizzy."],
  ["Style", "Pizza „diavola” (diabelska) jest:", "Ostra — z pikantnym salami", ["Słodka — z ananasem", "Wegańska", "Z owocami morza"], "„Diavola” oznacza ostrą pizzę, zwykle z salami piccante lub papryczką chili."],
  ["Style", "Który zestaw składa się na klasyczną pizzę Capricciosa?", "Szynka, pieczarki, karczochy, oliwki", ["Salami, papryka, cebula, kukurydza", "Tuńczyk, cebula, kapary, jajko", "Rukola, grana padano, pomidorki, prosciutto crudo"], "W wersji klasycznej: szynka gotowana, pieczarki, karczochy i oliwki."],
  ["Style", "„Pizza bianca” to pizza:", "Bez sosu pomidorowego", ["Z samą mozzarellą na grubym cieście", "Z białą mąką pełnoziarnistą", "Tylko z białym serem pleśniowym"], "Bianca (biała) nie ma sosu pomidorowego, a dodatkami są np. oliwa, ser, czosnek, rozmaryn."],
  ["Style", "Pizza „fritta” z Neapolu to:", "Pizza smażona w głębokim tłuszczu", ["Pizza pieczona na kamieniu", "Pizza na zimno", "Pizza z grilla"], "Pizza fritta to złożony placek smażony na złoto — uliczny klasyk Neapolu."],
  ["Style", "Która pizza słynie z cienkiego, bardzo chrupiącego ciasta?", "Rzymska (tonda romana)", ["Neapolitańska", "Chicagowska deep dish", "Sycylijska sfincione"], "Rzymska jest cienka i chrupiąca, neapolitańska — miękka i wilgotna."],
  ["Style", "Chicagowska „deep dish” to pizza:", "Pieczona w głębokiej formie, z ogromną ilością sera", ["Cienka jak papier", "Składana na pół jak naleśnik", "Podawana na zimno"], "Ma wysokie, grube ciasto i ser pod sosem."],
  ["Style", "Pizza w stylu Detroit tradycyjnie jest pieczona w:", "Prostokątnych blachach", ["Okrągłych kamieniach", "Miedzianych garnkach", "Żeliwnych patelniach"], "Oryginalnie używano prostokątnych blach z części samochodowych."],
  ["Style", "Sfincione to puszysty placek z tradycji:", "Sycylii", ["Piemontu", "Toskanii", "Sardynii"], "Sfincione to sycylijska, gruba pizza, często z cebulą, anchois i bułką tartą."],
  ["Style", "Z jakiego regionu pochodzi focaccia genovese?", "Liguria", ["Kalabria", "Apulia", "Lombardia"], "Genueńska focaccia to oliwna, solona klasyka Ligurii."],
  ["Style", "Pinsa romana to:", "Owalny rzymski placek z mieszanki mąk", ["Pizza z mięsem w środku", "Pizza smażona", "Włoski chleb pita"], "Pinsa jest lekka, wysoko nawodniona i długo fermentuje."],
  ["Style", "Pizza „al taglio” jest podawana:", "Na kawałki, często na wagę", ["Tylko w całości", "Wyłącznie na zimno", "W pudełku z surowym ciastem"], "Pizza al taglio to rzymska pizza z blachy, krojona i ważona."],
  ["Style", "Który z tych wypieków pochodzi z Turynu?", "Grissini", ["Ciabatta", "Panettone", "Piadina"], "Chlebowe paluszki grissini wywodzą się z Turynu."],
  ["Style", "Stromboli — zawijana pizza — powstała w:", "USA", ["Neapolu", "Rzymie", "Sycylii"], "Stromboli to amerykański wynalazek włoskich imigrantów."],
  /* --- ciasto, chemia, technologia --- */
  ["Ciasto", "Jakie białko tworzy sieć, która zatrzymuje gaz w cieście?", "Gluten", ["Kazeina", "Albumina", "Keratyna"], "Gluten tworzy się z gliadyn i gluteniny po połączeniu mąki z wodą."],
  ["Ciasto", "Czym są drożdże piekarskie?", "Jednokomórkowymi grzybami", ["Bakteriami", "Wirusami", "Roślinami wodnymi"], "Saccharomyces cerevisiae to grzyb, który zamienia cukry w dwutlenek węgla i alkohol."],
  ["Ciasto", "Autoliza w cieście to:", "Odpoczynek mąki z wodą przed dodaniem drożdży i soli", ["Pieczenie w niskiej temperaturze", "Przechowywanie ciasta w zamrażarce", "Dodanie oliwy po wyrośnięciu"], "Podczas autolizy mąka nawadnia się, a gluten zaczyna się rozwijać bez wyrabiania."],
  ["Ciasto", "Reakcja Maillarda odpowiada za:", "Brązowienie i aromat skórki", ["Wyrastanie ciasta", "Rozwój glutenu", "Kwaśny smak zakwasu"], "To reakcja aminokwasów z cukrami redukującymi w wysokiej temperaturze."],
  ["Ciasto", "Hydratacja ciasta 65% oznacza:", "650 g wody na 1 kg mąki", ["65 g wody na 100 g ciasta", "65% soli w cieście", "65 minut wyrastania"], "Hydratacja to stosunek wody do mąki."],
  ["Ciasto", "Włoski typ mąki do pizzy neapolitańskiej to najczęściej:", "00", ["0000", "5", "T80"], "Typ 00 to bardzo drobno zmielona mąka o niskiej zawartości popiołu."],
  ["Ciasto", "Siłę mąki (zdolność do tworzenia glutenu) oznacza się symbolem:", "W", ["F", "K", "R"], "Wartość W pochodzi z badania alweograficznego."],
  ["Ciasto", "Czym jest poolish?", "Płynny przedferment z mąki, wody i odrobiny drożdży", ["Rodzaj mąki", "Gotowa mieszanka przypraw", "Ciasto drożdżowe na słodko"], "Poolish ma zwykle taką samą ilość wody i mąki (100% hydratacji)."],
  ["Ciasto", "„Biga” to:", "Gęstszy przedferment o niższej hydratacji", ["Rodzaj pieca", "Ser", "Sos pomidorowy"], "Biga ma około połowy wody względem mąki i daje mocniejsze ciasto."],
  ["Ciasto", "„Lievito madre” to:", "Naturalny zakwas", ["Drożdże instant", "Mąka kasztanowa", "Tłuszcz do smażenia"], "To włoski zakwas, utrzymywany często latami."],
  ["Ciasto", "Dlaczego ciasto na pizzę często fermentuje w lodówce 24–72 godziny?", "Powolna fermentacja rozwija aromat i poprawia strukturę", ["Aby ciasto było tańsze", "Aby zabić drożdże", "Aby ciasto ścięło się jak jajko"], "Chłód spowalnia drożdże, ale enzymy dalej rozkładają skrobię i białka, co poprawia smak i strawność."],
  ["Ciasto", "Z czego głównie składa się „pasta filata”, czyli sposób robienia mozzarelli?", "Z rozciąganego i zgniatanego w gorącej wodzie twarogu", ["Z długo wędzonego mleka", "Z fermentowanej serwatki", "Ze zmrożonej śmietanki"], "Pasta filata znaczy „ciągnione ciasto” — twaróg rozciąga się w gorącej wodzie."],
  ["Ciasto", "Ciemne plamki na brzegu pizzy neapolitańskiej (tzw. leopard spotting) to efekt:", "Bardzo gorącego pieca", ["Dodania kakao", "Przypadkowego zabrudzenia mąką", "Zbyt długiego mieszania"], "Pęcherze w cieście prażą się błyskawicznie w ok. 450–500 °C."],
  ["Ciasto", "Piec do pizzy neapolitańskiej rozgrzewa się tradycyjnie do około:", "485 °C", ["220 °C", "320 °C", "650 °C"], "Specyfikacja mówi o ok. 485 °C."],
  ["Ciasto", "Jak długo piecze się klasyczną pizzę neapolitańską?", "60–90 sekund", ["6–8 minut", "15 minut", "30 minut"], "W bardzo gorącym piecu pizza piecze się około półtorej minuty."],
  ["Ciasto", "Maksymalna średnica pizzy neapolitańskiej wg specyfikacji STG to:", "35 cm", ["25 cm", "45 cm", "50 cm"], "Specyfikacja ogranicza średnicę do 35 cm."],
  ["Ciasto", "Środek pizzy neapolitańskiej według specyfikacji nie powinien być grubszy niż:", "0,4 cm", ["1 cm", "2 cm", "0,1 mm"], "Środek jest cienki, brzeg wysoki (1–2 cm)."],
  ["Ciasto", "Łopatę do wsuwania pizzy do pieca nazywa się po włosku:", "Pala", ["Mestolo", "Spatola", "Forchetta"], "Pala to drewniana lub metalowa łopata."],
  ["Ciasto", "Dlaczego warto dodać sól po autolizie, a nie od razu?", "Sól utrudnia nawodnienie mąki i spowalnia tworzenie glutenu", ["Sól zabija mąkę", "Bez tego ciasto robi się niebieskie", "Sól rozpuszcza gluten"], "Dodana później pozwala mące najpierw swobodnie wchłonąć wodę."],
  /* --- składniki --- */
  ["Składniki", "Z mleka jakiego zwierzęcia powstaje prawdziwa mozzarella di bufala?", "Bawołu", ["Krowy", "Owcy", "Kozy"], "To miękki ser z mleka bawołów wodnych, głównie z Kampanii."],
  ["Składniki", "Pecorino Romano jest robione z mleka:", "Owczego", ["Krowiego", "Koziego", "Bawolego"], "Pecorino zawsze oznacza ser owczy."],
  ["Składniki", "Z czego robi się mascarpone?", "Ze śmietanki", ["Z serwatki", "Z mleka koziego", "Z twarogu chudego"], "Mascarpone to ukwaszona śmietanka, np. do tiramisu."],
  ["Składniki", "Ricotta powstaje z:", "Serwatki", ["Śmietanki", "Jaj", "Mleka w proszku"], "Ricotta znaczy „ponownie gotowana”, bo serwatkę ogrzewa się drugi raz."],
  ["Składniki", "Burrata jest wypełniona:", "Stracciatellą (szarpana mozzarella ze śmietanką)", ["Mascarpone i miodem", "Sosem pomidorowym", "Ricottą"], "Powłoka z mozzarelli kryje kremowy środek."],
  ["Składniki", "Z którego regionu pochodzi parmigiano reggiano?", "Emilia-Romania", ["Sycylia", "Kampania", "Apulia"], "Dojrzewa co najmniej 12 miesięcy."],
  ["Składniki", "Prosciutto di Parma dojrzewa co najmniej:", "12 miesięcy", ["2 tygodnie", "3 miesiące", "36 miesięcy"], "Minimum to 12 miesięcy."],
  ["Składniki", "Z jakiego regionu pochodzi ostra, smarowna kiełbasa ’nduja?", "Kalabria", ["Toskania", "Lombardia", "Piemont"], "Pikantna ’nduja z Spilinga to symbol Kalabrii."],
  ["Składniki", "Guanciale robi się z:", "Policzków wieprzowych", ["Wołowego języka", "Karkówki", "Boczku wędzonego"], "To klasyczny składnik carbonary i amatriciany."],
  ["Składniki", "Bresaola to suszone mięso:", "Wołowe", ["Wieprzowe", "Z kaczki", "Z koziny"], "Bresaola della Valtellina to dojrzewająca wołowina."],
  ["Składniki", "Kapary to:", "Niedojrzałe pąki kwiatowe", ["Nasiona", "Młode liście", "Dojrzałe jagody"], "Zbiera się pąki kaparówki cierniowej."],
  ["Składniki", "Jadalna część karczocha to:", "Pąki kwiatowe", ["Korzeń", "Łodyga", "Nasiona"], "Karczoch jest kwiatostanem, zjada się niedojrzały."],
  ["Składniki", "Anchois należy do rodziny:", "Sardelowatych", ["Śledziowatych", "Dorszowatych", "Makrelowatych"], "Engraulidae to właśnie sardelowate."],
  ["Składniki", "Maksymalna zawartość wolnych kwasów w oliwie extra vergine wynosi:", "0,8%", ["2%", "3,3%", "5%"], "Dla extra vergine to granica jakościowa — im niżej, tym lepiej."],
  ["Składniki", "San Marzano to odmiana pomidora:", "Śliwkowego (podłużnego)", ["Koktajlowego", "Malinowego", "Zielonego"], "San Marzano to podłużne pomidory z okolic Wezuwiusza."],
  ["Składniki", "Co to jest passata di pomodoro?", "Przecier z przetartych pomidorów", ["Suszone pomidory w oliwie", "Pasta z koncentratu", "Sok z pomidorów z solą"], "Passata to gładki przecier do sosów."],
  ["Składniki", "Które zioło jest sercem sosu marinara obok czosnku?", "Oregano", ["Rozmaryn", "Szałwia", "Mięta"], "Sos marinara = pomidory, czosnek i oregano."],
  ["Składniki", "Z czego powstaje pesto alla genovese?", "Bazylia, orzeszki piniowe, parmezan, oliwa, czosnek", ["Rukola, orzechy włoskie, feta", "Pietruszka, migdały, mozzarella", "Szpinak, słonecznik, gorgonzola"], "Pochodzi z Genui, z Ligurii."],
  ["Składniki", "Które ziarno ryżu jest klasyczne do risotto?", "Arborio", ["Basmati", "Jaśminowy", "Długoziarnisty parboiled"], "Arborio (lub carnaroli) uwalnia skrobię i daje kremową konsystencję."],
  ["Składniki", "Które składniki NIE należą do tradycyjnej carbonary?", "Śmietana", ["Guanciale", "Żółtka", "Pecorino romano"], "Prawdziwa carbonara nie ma śmietany."],
  ["Składniki", "Gorgonzola pochodzi z:", "Lombardii i Piemontu", ["Sycylii", "Apulii", "Sardynii"], "To niebieski ser z północy Włoch."],
  ["Składniki", "Z jakich owoców robi się limoncello?", "Ze skórek cytryn", ["Z pomarańczy", "Z gruszek", "Z fig"], "Skórki moczy się w alkoholu."],
  ["Składniki", "Panna cotta to dosłownie:", "Gotowana śmietanka", ["Biała kawa", "Zimna panna", "Słodki biszkopt"], "Śmietanka z cukrem i żelatyną."],
  /* --- Włochy, język, geografia --- */
  ["Włochy", "Stolicą Kampanii jest:", "Neapol", ["Salerno", "Bari", "Caserta"], "Neapol jest stolicą regionu Kampania."],
  ["Włochy", "Wulkan nad Neapolem nazywa się:", "Wezuwiusz", ["Etna", "Stromboli", "Wulcano"], "Wezuwiusz wybuchł w 79 roku n.e. i pogrzebał Pompeje."],
  ["Włochy", "Który wulkan jest najwyższym aktywnym wulkanem Europy (leży na Sycylii)?", "Etna", ["Wezuwiusz", "Stromboli", "Wulcano"], "Etna ma ponad 3300 m n.p.m."],
  ["Włochy", "Wyspa Capri leży w zatoce:", "Neapolitańskiej", ["Genueńskiej", "Wenecjańskiej", "Tarenckiej"], "Capri jest blisko Neapolu i Sorrento."],
  ["Włochy", "Stolicą Sycylii jest:", "Palermo", ["Katania", "Mesyna", "Syrakuzy"], "Palermo to największe miasto wyspy."],
  ["Włochy", "Co dosłownie znaczy „pomodoro”?", "Złote jabłko", ["Czerwona kula", "Słońce ziemi", "Słodka ziemia"], "Pomo d’oro — pierwsze europejskie pomidory były żółte."],
  ["Włochy", "Po włosku „melanzane” to:", "Bakłażany", ["Cukinie", "Papryki", "Karczochy"], "Melanzane alla parmigiana to klasyk."],
  ["Włochy", "Po włosku „cipolla” to:", "Cebula", ["Czosnek", "Por", "Szalotka"], "Czosnek to „aglio”."],
  ["Włochy", "„Aglio” to po włosku:", "Czosnek", ["Cebula", "Oliwa", "Ocet"], "Spaghetti aglio e olio — czosnek i oliwa."],
  ["Włochy", "„Peperoni” we Włoszech to:", "Papryki", ["Pikantna kiełbasa", "Pieprz", "Sól morska"], "Amerykańskie pepperoni to nie włoskie peperoni."],
  ["Włochy", "„Acciughe” to po włosku:", "Anchois", ["Krewetki", "Małże", "Łosoś"], "Pizza z acciughe to ta z anchois."],
  ["Włochy", "„Funghi” to:", "Grzyby", ["Figi", "Fasola", "Frytki"], "Pizza ai funghi — z pieczarkami."],
  ["Włochy", "„Frutti di mare” to:", "Owoce morza", ["Owoce egzotyczne", "Ryby słodkowodne", "Zupa"], "Ang. seafood."],
  ["Włochy", "Które z nich oznacza „ser” po włosku?", "Formaggio", ["Prosciutto", "Pomodoro", "Salsiccia"], "Quattro formaggi — cztery sery."],
  ["Włochy", "Co znaczy po włosku „impasto”?", "Ciasto", ["Sos", "Mąka", "Drożdże"], "Impasto to ciasto, „forno” — piec."],
  ["Włochy", "„Forno a legna” to:", "Piec opalany drewnem", ["Piec elektryczny", "Zamrażarka", "Wędzarnia"], "Tradycyjna pizzeria ma piec na drewno."],
  ["Włochy", "Z którego miasta pochodzi ragù alla bolognese?", "Bolonia", ["Neapol", "Rzym", "Florencja"], "Bolonia leży w Emilii-Romanii."],
  ["Włochy", "Pesto genovese pochodzi z regionu:", "Liguria", ["Sycylia", "Apulia", "Umbria"], "Genua — stolica Ligurii."],
  ["Włochy", "Co oznacza „piccante” w menu?", "Ostre", ["Słodkie", "Słone", "Kwaśne"], "Pizza piccante to ostra pizza."],
  ["Włochy", "Co oznacza „quattro formaggi”?", "Cztery sery", ["Cztery sosy", "Cztery pory roku", "Cztery miasta"], "Pizza z czterema serami."],
  /* --- ciekawostki --- */
  ["Ciekawostki", "Jaki jest drugi kolor, obok czerwonego i białego, w barwach pizzy Margherita (jak we fladze Włoch)?", "Zielony", ["Niebieski", "Żółty", "Czarny"], "Pomidor (czerwony), mozzarella (biała), bazylia (zielona)."],
  ["Ciekawostki", "Pizza hawajska: jakim składnikiem wzbudza największe spory?", "Ananasem", ["Szynką", "Serem", "Oregano"], "Wielu Włochów uważa, że ananas nie pasuje do pizzy."],
  ["Ciekawostki", "Co to jest „peel” w języku pizzaiolo?", "Łopata do wkładania pizzy", ["Nożyk do krojenia", "Rodzaj sera", "Mąka do posypywania"], "Po włosku pala."],
  ["Ciekawostki", "Która z tych roślin NIE jest ziołem śródziemnomorskim?", "Wasabi", ["Oregano", "Bazylia", "Tymianek"], "Wasabi pochodzi z Japonii."],
  ["Ciekawostki", "W której gminie leżą Głuponie, siedziba Włoskiej Roboty?", "Kuślin", ["Opalenica", "Nowy Tomyśl", "Lwówek"], "Włoska Robota mieści się w Głuponiach 103, 64-316 Kuślin."],
  ["Ciekawostki", "Jakiej średnicy są pizze we Włoskiej Robocie?", "30 cm", ["20 cm", "45 cm", "60 cm"], "Pizza 30 cm prosto z pieca."],
  ["Ciekawostki", "Dlaczego pizzę neapolitańską podaje się natychmiast po wypieku?", "Bo brzeg i środek mięknieją i tracą świeżość po kilku minutach", ["Bo szybko zamarza", "Bo zmienia kolor", "Bo gaśnie piec"], "Wysoka wilgotność ciasta sprawia, że szybko traci chrupkość."],
  ["Ciekawostki", "Mozzarella di bufala jest przechowywana tradycyjnie:", "W solance lub serwatce", ["W oliwie", "Na sucho w lodówce", "Zamrożona"], "Ser trzyma się w płynie, w którym powstał."],
  ["Ciekawostki", "Który z tych sosów NIE jest tradycyjnym sosem na pizzę?", "Majonez", ["Pomidorowy", "Bianca (oliwa i czosnek)", "Pesto"], "Majonez to dodatek znany z fast foodów, nie włoskiej tradycji."]
];

const RUN_LEN = 25, LIVES = 3;
const qTime = (i) => (i < 8 ? 9 : i < 16 ? 7 : 6);   // sekundy na pytanie — z czasem coraz mniej
const REW = [["Ukończ serię (max 2 błędy)", "+1 pkt"], ["Ukończ serię z max 1 błędem", "+2 pkt"], ["Seria bez żadnego błędu", "+3 pkt"]];

const CSS = `
.wrg-quiz .wq-card{background:linear-gradient(180deg,#2a2418,#1e1a11);border:1px solid #6b5521;border-radius:14px;padding:14px 14px 12px;box-shadow:inset 0 0 0 3px rgba(212,175,55,.08),0 6px 18px rgba(0,0,0,.35)}
.wrg-quiz .wq-cat{display:inline-block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#d4af37;border:1px solid #6b5521;border-radius:99px;padding:2px 10px;margin-bottom:8px}
.wrg-quiz .wq-q{font-family:'Playfair Display',Georgia,serif;font-size:19px;line-height:1.35;color:#fbf2dc;margin:0 0 12px;min-height:76px}
.wrg-quiz .wq-ans{display:grid;gap:8px}
.wrg-quiz .wq-a{display:flex;align-items:center;gap:10px;text-align:left;width:100%;padding:10px 12px;border-radius:11px;border:1px solid #4a4a58;background:linear-gradient(180deg,#26262f,#1d1d25);color:#f3f3f5;font-size:14.5px;cursor:pointer;font-family:inherit;transition:transform .08s,border-color .15s,background .15s;min-height:46px}
.wrg-quiz .wq-a:hover:not([disabled]){border-color:#d4af37;transform:translateY(-1px)}
.wrg-quiz .wq-a i{flex:none;width:26px;height:26px;border-radius:8px;background:#34343f;display:grid;place-items:center;font-style:normal;font-weight:800;font-size:13px;color:#f1cf6a}
.wrg-quiz .wq-a.ok{border-color:#14b866;background:linear-gradient(180deg,#154d31,#0f3a25)}
.wrg-quiz .wq-a.ok i{background:#14b866;color:#fff}
.wrg-quiz .wq-a.no{border-color:#e03a3a;background:linear-gradient(180deg,#5a1e1e,#3f1414)}
.wrg-quiz .wq-a.no i{background:#e03a3a;color:#fff}
.wrg-quiz .wq-a.gone{opacity:.18;pointer-events:none}
.wrg-quiz .wq-a[disabled]{cursor:default}
.wrg-quiz .wq-exp{margin-top:10px;background:#16161c;border:1px solid #33333f;border-radius:10px;padding:9px 12px;font-size:13.5px;color:#d8d8e0;text-align:left}
.wrg-quiz .wq-exp b{color:#f1cf6a}
.wrg-quiz .wq-hearts{letter-spacing:2px;font-size:15px}
.wrg-quiz .wq-tools{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px}
.wrg-quiz .wq-joker{padding:7px 12px;font-size:13px}
`;

function start(stage, ctx) {
  const shell = createShell(stage, ctx, { id: "quiz", icon: "❓", title: "Quiz Znawca", css: { id: "quiz", css: CSS } });
  bumpRun("quiz");

  function intro() {
    shell.setTitle("Quiz Znawca");
    shell.screen({
      hero: "🎓", title: "Quiz Znawca",
      html: "<p>Seria <b>" + RUN_LEN + " pytań</b> z puli ponad " + Q.length + " — o pizzie, Włoszech, składnikach i nauce o cieście. Czas na odpowiedź <b>maleje w trakcie serii</b>, a życia masz tylko <b>" + LIVES + "</b>.</p>" +
        '<div class="wrg-rules"><b>Zasady</b><ul><li>Błąd lub brak odpowiedzi w czasie = utrata życia. Zero żyć — koniec serii.</li><li>Odpowiedź po czasie liczy się jak błąd.</li><li>Punkty dostajesz dopiero za ukończenie całej serii: im mniej błędów, tym więcej.</li><li>Pytania losują się z puli, a te, których jeszcze nie widziałeś, pojawiają się częściej.</li></ul></div>' +
        rewardsHtml(REW) + rankHtml() +
        '<p style="font-size:12.5px;color:#9a9aa8">Rekord: <b style="color:#f1cf6a">' + best("quiz", "correct") + "</b> poprawnych w jednej serii</p>" + dayLeftHtml("quiz"),
      buttons: [{ label: "▶ Zagraj", on: run }, { label: "Zamknij", cls: "ghost", on: () => shell.close() }]
    });
  }

  function chooseQuestions() {
    const pool = Q.map((q, i) => ({ q, i, w: (S.seen[i] || 0) + Math.random() * 1.6 }));
    pool.sort((a, b) => a.w - b.w);
    return shuffle(pool.slice(0, RUN_LEN));
  }

  function run() {
    const qs = chooseQuestions();
    let idx = 0, lives = LIVES, correct = 0, mistakes = 0, streak = 0, bestStreak = 0;

    function ask() {
      if (idx >= RUN_LEN) return finish(true);
      const item = qs[idx], q = item.q;
      shell.setTitle("Pytanie " + (idx + 1) + " / " + RUN_LEN);
      const order = shuffle([q[2], ...q[3]]);
      const body = shell.body; body.innerHTML = "";
      const hearts = h("span", { class: "wq-hearts" });
      const paintHearts = () => { hearts.textContent = "❤️".repeat(lives) + "🖤".repeat(LIVES - lives); };
      paintHearts();
      const QT = qTime(idx), timeEl = h("b", null, QT + "s");
      const tbar = h("div", { class: "wrg-bar2" }, h("i"));
      body.append(h("div", { class: "wrg-hud" }, h("span", { class: "wrg-pill" }, hearts), h("span", { class: "wrg-pill" }, "Poprawne: ", h("b", null, correct)), h("span", { class: "wrg-pill" }, "Seria: ", h("b", null, streak)), h("span", { class: "wrg-pill" }, "⏱ ", timeEl)), tbar);
      const ans = h("div", { class: "wq-ans" });
      const btns = order.map((t, k) => h("button", { class: "wq-a", type: "button", "data-t": t }, h("i", null, "ABCD"[k]), h("span", null, t)));
      ans.append(...btns);
      const card = h("div", { class: "wq-card", style: "margin-top:8px" }, h("div", { class: "wq-cat" }, q[0]), h("div", { class: "wq-q" }, q[1]), ans);
      const tools = h("div", { class: "wq-tools" }, h("span", { style: "font-size:12px;color:#8a8a98" }, "Klawisze 1–4"));
      body.append(card, tools);
      S.seen[item.i] = (S.seen[item.i] || 0) + 1; save();

      let left = QT, last = performance.now(), answered = false;
      const tmr = shell.every(100, () => {
        if (answered) return;
        const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
        left -= dt; timeEl.textContent = Math.max(0, Math.ceil(left)) + "s";
        const f = Math.max(0, left / QT); tbar.firstChild.style.width = f * 100 + "%"; tbar.classList.toggle("low", f < 0.34);
        if (left <= 3 && Math.ceil(left) !== Math.ceil(left + dt)) SFX.tick();
        if (left <= 0) reveal(null);
      });
      function reveal(choice) {
        if (answered) return; answered = true; clearInterval(tmr); document.removeEventListener("keydown", onKey);
        const right = choice === q[2];
        btns.forEach((b) => { b.disabled = true; if (b.dataset.t === q[2]) b.classList.add("ok"); else if (b.dataset.t === choice) b.classList.add("no"); });
        if (right) { correct++; streak++; bestStreak = Math.max(bestStreak, streak); SFX.ok(); }
        else { lives--; mistakes++; streak = 0; SFX.bad(); paintHearts(); }
        const exp = h("div", { class: "wq-exp", html: (right ? "<b>Dobrze!</b> " : choice == null ? "<b>Czas minął.</b> " : "<b>Niestety nie.</b> ") + esc(q[4]) });
        const lastQ = idx + 1 >= RUN_LEN;
        const dead = lives <= 0;
        const next = h("button", { class: "wrg-btn", type: "button", style: "margin-top:10px;width:100%" }, dead ? "Zobacz wynik" : lastQ ? "Zobacz wynik" : "Dalej ▶");
        next.addEventListener("click", () => { idx++; if (dead) finish(false); else ask(); });
        card.append(exp, next); next.focus({ preventScroll: true });
      }
      function onKey(e) { const k = "1234".indexOf(e.key); if (k >= 0 && btns[k] && !answered && shell.visible()) reveal(order[k]); }
      document.addEventListener("keydown", onKey); shell.onCleanup(() => document.removeEventListener("keydown", onKey));
      ans.addEventListener("click", (e) => { const b = e.target.closest(".wq-a"); if (b && !b.disabled) reveal(b.dataset.t); });
    }

    async function finish(completed) {
      bumpBest("quiz", "correct", correct);
      let pts = 0;
      if (completed && mistakes <= 2) pts = mistakes === 0 ? 3 : mistakes <= 1 ? 2 : 1;
      let msg = "";
      if (pts) { const r = await grant(ctx, "quiz", pts); msg = r && r.msg ? r.msg : ""; if (r && r.ok) SFX.win(); } else SFX.lose();
      const title = completed ? (mistakes === 0 ? "BEZBŁĘDNIE!" : "Seria ukończona!") : "Koniec żyć";
      shell.screen({
        hero: completed ? (mistakes === 0 ? "🏆" : "🎉") : "💔", title,
        html: "<p>Poprawnych odpowiedzi: <b>" + correct + "</b> z " + RUN_LEN + " · błędy: <b>" + mistakes + "</b> · najdłuższa seria: <b>" + bestStreak + "</b></p>" +
          (pts ? '<p style="color:#f1cf6a"><b>Za serię: +' + pts + " pkt" + (msg && !/^\+/.test(msg) ? " — " + esc(msg) : "") + "</b></p>" : completed ? "<p>Za dużo błędów, żeby dostać punkty (maks. 2).</p>" : "<p>Punkty dostaje się za ukończenie całej serii.</p>") +
          rewardsHtml(REW, pts) + rankHtml(),
        buttons: [{ label: "↻ Nowa seria", on: run }, { label: "Zamknij", cls: "ghost", on: () => shell.close() }]
      });
    }
    ask();
  }
  intro();
}
window.WRGames.register({ id: "quiz", icon: "❓", name: "Quiz Znawca", desc: "20 trudnych pytań, 4 życia — punkty za ukończoną serię", start });
window.__QUIZ_SIZE = Q.length;
})();
/* =====================================================================
   GRA 3: Pizzer na gorąco (zręcznościówka, canvas)
   Łap łopatą składniki spadające z góry — dokładnie w kolejności z zamówienia. Zły składnik, iskra z pieca i przypalone
   kawałki odbierają serce. Z każdym zamówieniem robi się szybciej. Punkty: zamówienie 8 (+1), 12 (+1), 16 (+1).
   Sterowanie: palec/mysz (przeciągnij) lub strzałki / A D.
   ===================================================================== */
(function () {
const { h, esc, rnd, rint, clamp, pick, shuffle, best, bumpBest, bumpRun, grant, SFX, createShell, rankHtml, rewardsHtml, dayLeftHtml } = LIB;

const W = 360, H = 560, PEEL_Y = 478, PEEL_HW = 31;
const REW = [["Ukończ zamówienie nr 10", "+1 pkt"], ["Ukończ zamówienie nr 15", "+1 pkt"], ["Ukończ zamówienie nr 20", "+1 pkt"]];
const REWARD_AT = { 10: 1, 15: 1, 20: 1 };
const ING = {
  sos: { n: "sos", c: "#d3392b" }, ser: { n: "mozzarella", c: "#fbf2d6" }, baz: { n: "bazylia", c: "#3f9a3a" },
  pep: { n: "pepperoni", c: "#c92e28" }, pie: { n: "pieczarki", c: "#c7a47a" }, oli: { n: "oliwki", c: "#4b3d6e" },
  szy: { n: "szynka", c: "#f09aa0" }, pap: { n: "papryka", c: "#f08a24" }
};
const RECIPES = [
  ["Margherita", "sos ser baz"], ["Funghi", "sos ser pie pie"], ["Salame", "sos ser pep pep"], ["Prosciutto", "sos ser szy pie"],
  ["Capricciosa", "sos ser szy pie oli"], ["Diavola", "sos ser pep pap pep"], ["Quattro Stagioni", "sos ser szy pie oli pap"],
  ["Wegetariana", "sos ser pap pie oli pap baz"], ["Mięsna", "sos ser pep szy pep szy baz"], ["Włoska Robota", "sos ser pep pie oli szy pap baz"]
].map((r) => ({ name: r[0], steps: r[1].split(" ") }));
function recipeFor(n) {
  if (n + 1 < RECIPES.length) return RECIPES[n + 1];
  const pool = ["pep", "pie", "oli", "szy", "pap"], len = Math.min(12, 8 + Math.floor((n - 8) / 2));
  const mid = []; for (let i = 0; i < len - 3; i++) mid.push(pick(pool));
  return { name: "Specjalność dnia #" + (n - 8), steps: ["sos", "ser"].concat(mid, ["baz"]) };
}
const CSS = `
.wrg-arcade .wa-wrap{position:relative;width:100%;max-width:400px;margin:0 auto;aspect-ratio:${W}/${H};border-radius:12px;overflow:hidden;background:#1a0f0a;touch-action:none;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.wrg-arcade canvas{display:block;width:100%;height:100%;touch-action:none;cursor:none}
.wrg-full.wrg-arcade .wa-wrap{width:min(100%,calc((100vh - 120px) * ${W} / ${H}));max-width:none}
.wrg-arcade .wa-hint{text-align:center;font-size:12.5px;color:#9a9aa8;margin-top:8px}
`;

/* ---- rysowanie sprite'ów ---- */
function drawIng(c, type, x, y, r, t) {
  c.save(); c.translate(x, y);
  switch (type) {
    case "sos": { /* pomidor / łyżka sosu */
      const g = c.createRadialGradient(-r * .3, -r * .3, r * .1, 0, 0, r * 1.1); g.addColorStop(0, "#ff7a60"); g.addColorStop(.6, "#d3392b"); g.addColorStop(1, "#8a1812");
      c.fillStyle = g; c.beginPath(); c.arc(0, r * .08, r, 0, 7); c.fill();
      c.fillStyle = "#3f9a2c"; c.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 1.2566; c.lineTo(Math.cos(a) * r * .55, -r * .86 + Math.sin(a) * r * .3); c.lineTo(Math.cos(a + .63) * r * .2, -r * .86 + Math.sin(a + .63) * r * .1); } c.closePath(); c.fill();
      c.fillStyle = "rgba(255,255,255,.4)"; c.beginPath(); c.ellipse(-r * .38, -r * .22, r * .2, r * .32, .5, 0, 7); c.fill(); break; }
    case "ser": {
      const g = c.createRadialGradient(-r * .3, -r * .3, r * .1, 0, 0, r * 1.2); g.addColorStop(0, "#ffffff"); g.addColorStop(.7, "#f6ebcb"); g.addColorStop(1, "#dcc690");
      c.fillStyle = g; c.beginPath(); c.moveTo(-r, r * .2); c.quadraticCurveTo(-r * 1.05, -r * .9, -r * .1, -r * .95); c.quadraticCurveTo(r * 1.1, -r * .9, r, r * .1); c.quadraticCurveTo(r * .95, r, 0, r * .95); c.quadraticCurveTo(-r * .95, r, -r, r * .2); c.fill();
      c.strokeStyle = "#cdb27a"; c.lineWidth = 1.2; c.stroke(); c.fillStyle = "rgba(255,255,255,.7)"; c.beginPath(); c.ellipse(-r * .35, -r * .38, r * .3, r * .18, -.5, 0, 7); c.fill(); break; }
    case "baz": {
      const g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, "#7ccb55"); g.addColorStop(1, "#1f6a2b");
      c.fillStyle = g; c.beginPath(); c.moveTo(0, r * 1.05); c.bezierCurveTo(-r * 1.4, r * .5, -r * 1.1, -r * .6, 0, -r * 1.1); c.bezierCurveTo(r * 1.1, -r * .6, r * 1.4, r * .5, 0, r * 1.05); c.fill();
      c.strokeStyle = "#d3f0a6"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, r); c.lineTo(0, -r * .9); c.moveTo(0, r * .3); c.lineTo(-r * .55, -r * .15); c.moveTo(0, r * .3); c.lineTo(r * .55, -r * .15); c.moveTo(0, -r * .2); c.lineTo(-r * .4, -r * .55); c.moveTo(0, -r * .2); c.lineTo(r * .4, -r * .55); c.stroke(); break; }
    case "pep": {
      const g = c.createRadialGradient(-r * .3, -r * .3, r * .1, 0, 0, r * 1.1); g.addColorStop(0, "#f2705a"); g.addColorStop(.6, "#c92e28"); g.addColorStop(1, "#7a1514");
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.strokeStyle = "#6a1212"; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = "#f8c4b2"; [[-.4, -.2, .16], [.3, -.4, .13], [.4, .25, .17], [-.1, .4, .14], [-.45, .35, .1], [.05, -.05, .1]].forEach((d) => { c.beginPath(); c.arc(d[0] * r, d[1] * r, d[2] * r, 0, 7); c.fill(); }); break; }
    case "pie": {
      const g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, "#e2c39a"); g.addColorStop(1, "#9a6b43");
      c.fillStyle = "#f3e9d6"; c.beginPath(); c.moveTo(-r * .32, 0); c.lineTo(r * .32, 0); c.lineTo(r * .26, r * .95); c.quadraticCurveTo(0, r * 1.1, -r * .26, r * .95); c.fill();
      c.fillStyle = g; c.beginPath(); c.moveTo(-r * 1.05, r * .15); c.bezierCurveTo(-r * 1.05, -r * 1.1, r * 1.05, -r * 1.1, r * 1.05, r * .15); c.closePath(); c.fill();
      c.fillStyle = "rgba(255,255,255,.4)"; c.beginPath(); c.ellipse(-r * .35, -r * .45, r * .3, r * .15, -.5, 0, 7); c.fill(); break; }
    case "oli": {
      const g = c.createRadialGradient(-r * .3, -r * .3, r * .1, 0, 0, r); g.addColorStop(0, "#7c6aa8"); g.addColorStop(1, "#2a2040");
      c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, r * 1.05, r * .85, .35, 0, 7); c.fill();
      c.fillStyle = "#14101f"; c.beginPath(); c.ellipse(0, 0, r * .33, r * .27, .35, 0, 7); c.fill();
      c.fillStyle = "rgba(255,255,255,.35)"; c.beginPath(); c.ellipse(-r * .45, -r * .3, r * .25, r * .1, .4, 0, 7); c.fill(); break; }
    case "szy": {
      const g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, "#ffc2c2"); g.addColorStop(1, "#d96a77");
      c.fillStyle = g; c.beginPath(); c.moveTo(-r, -r * .5); c.quadraticCurveTo(0, -r * 1.1, r, -r * .5); c.quadraticCurveTo(r * 1.1, r * .8, 0, r); c.quadraticCurveTo(-r * 1.1, r * .8, -r, -r * .5); c.fill();
      c.strokeStyle = "#fbe0d8"; c.lineWidth = 2; c.stroke(); c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-r * .6, 0); c.quadraticCurveTo(0, -r * .3, r * .6, 0); c.stroke(); break; }
    case "pap": {
      c.lineWidth = r * .55; c.strokeStyle = "#f08a24"; c.beginPath(); c.ellipse(0, 0, r * .72, r * .6, 0, 0, 7); c.stroke();
      c.lineWidth = 1.3; c.strokeStyle = "#a85a0a"; c.beginPath(); c.ellipse(0, 0, r * 1, r * .88, 0, 0, 7); c.stroke(); c.beginPath(); c.ellipse(0, 0, r * .44, r * .32, 0, 0, 7); c.stroke();
      c.strokeStyle = "rgba(255,255,255,.45)"; c.lineWidth = 2; c.beginPath(); c.arc(-r * .1, -r * .05, r * .72, 3.4, 4.4); c.stroke(); break; }
    case "spark": { /* kula ognia (ogon do góry) */
      const f = Math.sin(t * 22 + x) * .12;
      c.fillStyle = "rgba(255,120,20,.35)"; c.beginPath(); c.arc(0, 0, r * 1.7, 0, 7); c.fill();
      c.fillStyle = "#ff8a1e"; c.beginPath(); c.moveTo(-r * .85, 0); c.quadraticCurveTo(-r * .6, -r * (1.6 + f), 0, -r * (2.4 + f)); c.quadraticCurveTo(r * .6, -r * (1.6 - f), r * .85, 0); c.arc(0, 0, r * .85, 0, Math.PI); c.fill();
      c.fillStyle = "#ffd23e"; c.beginPath(); c.moveTo(-r * .5, 0); c.quadraticCurveTo(-r * .3, -r * .9, 0, -r * 1.4); c.quadraticCurveTo(r * .3, -r * .9, r * .5, 0); c.arc(0, 0, r * .5, 0, Math.PI); c.fill();
      c.fillStyle = "#fff6b8"; c.beginPath(); c.arc(0, r * .05, r * .26, 0, 7); c.fill(); break; }
    case "burnt": {
      c.fillStyle = "#1c1412"; c.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, rr = r * (i % 2 ? .78 : 1.08); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill();
      c.strokeStyle = "#5a2a14"; c.lineWidth = 1.5; c.stroke(); c.fillStyle = "#e8541a"; c.beginPath(); c.arc(-r * .25, r * .1, r * .13, 0, 7); c.arc(r * .3, -r * .2, r * .1, 0, 7); c.fill();
      c.strokeStyle = "rgba(190,190,190,.5)"; c.lineWidth = 2; c.beginPath(); c.moveTo(-r * .2, -r); c.bezierCurveTo(-r * .6, -r * 1.5, r * .3, -r * 1.7, 0, -r * 2.2); c.stroke(); break; }
    case "gold": {
      const g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, "#fff0a0"); g.addColorStop(1, "#d99a14");
      c.shadowColor = "#ffd23e"; c.shadowBlur = 14; c.fillStyle = g; c.beginPath(); c.moveTo(0, r * 1.05); c.bezierCurveTo(-r * 1.4, r * .5, -r * 1.1, -r * .6, 0, -r * 1.1); c.bezierCurveTo(r * 1.1, -r * .6, r * 1.4, r * .5, 0, r * 1.05); c.fill(); c.shadowBlur = 0;
      c.strokeStyle = "#fff"; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, r); c.lineTo(0, -r * .9); c.stroke(); break; }
  }
  c.restore();
}

function start(stage, ctx) {
  const shell = createShell(stage, ctx, { id: "arcade", icon: "🔥", title: "Pizzer na gorąco", css: { id: "arcade", css: CSS } });
  bumpRun("arcade");
  let loopId = 0;
  shell.onCleanup(() => cancelAnimationFrame(loopId));

  function intro() {
    shell.setTitle("Pizzer na gorąco");
    shell.screen({
      hero: "🔥", title: "Pizzer na gorąco",
      html: "<p>Zamówienia lecą jedno po drugim! Łap łopatą składniki spadające z góry — <b>dokładnie w kolejności z biletu</b>.</p>" +
        '<div class="wrg-rules"><b>Zasady</b><ul><li>Przeciągnij palcem lub myszką (albo klawisze ← → / A D), żeby przesuwać łopatę.</li><li>Zły składnik, iskra z pieca i przypalony kawałek zabierają serce. Masz 3 serca.</li><li>Serce wraca tylko za bezbłędne zamówienie co piąte.</li><li>Z każdym zamówieniem spada szybciej, a bilety są dłuższe.</li><li>Złota bazylia na chwilę zwalnia czas.</li></ul></div>' +
        rewardsHtml(REW) + rankHtml() +
        '<p style="font-size:12.5px;color:#9a9aa8">Rekord: zamówienie nr <b style="color:#f1cf6a">' + best("arcade", "order") + "</b> · wynik <b style=\"color:#f1cf6a\">" + best("arcade", "score") + "</b></p>" + dayLeftHtml("arcade"),
      buttons: [{ label: "▶ Do pieca!", on: play }, { label: "Zamknij", cls: "ghost", on: () => shell.close() }]
    });
  }

  function play() {
    const body = shell.body; body.innerHTML = "";
    const wrap = h("div", { class: "wa-wrap" }), cv = h("canvas", { "aria-label": "Plansza gry Pizzer na gorąco" });
    wrap.append(cv); body.append(wrap, h("div", { class: "wa-hint" }, "Przeciągnij palcem / myszką albo użyj ← → · Esc zamyka tryb powiększony"));
    const c = cv.getContext("2d");
    let scale = 1, bg = null;

    /* ---- tło (cegły + blat) renderowane raz na zmianę rozmiaru ---- */
    function buildBg() {
      bg = document.createElement("canvas"); bg.width = cv.width; bg.height = cv.height;
      const b = bg.getContext("2d"); b.setTransform(scale, 0, 0, scale, 0, 0);
      const wall = b.createLinearGradient(0, 0, 0, H); wall.addColorStop(0, "#3a1f16"); wall.addColorStop(1, "#24130e"); b.fillStyle = wall; b.fillRect(0, 0, W, H);
      const bw = 44, bh = 20; let seed = 7; const rr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let y = 0, row = 0; y < 500; y += bh, row++) for (let x = -(row % 2 ? bw / 2 : 0); x < W; x += bw) {
        const l = 20 + rr() * 9, s = 38 + rr() * 14, hh = 10 + rr() * 8;
        b.fillStyle = "hsl(" + hh + "," + s + "%," + l + "%)"; b.fillRect(x + 1.2, y + 1.2, bw - 2.4, bh - 2.4);
        b.fillStyle = "rgba(255,255,255,.04)"; b.fillRect(x + 1.2, y + 1.2, bw - 2.4, 2);
        if (rr() < .3) { b.fillStyle = "rgba(0,0,0," + (.1 + rr() * .2) + ")"; b.fillRect(x + 1.2, y + bh * .5, bw - 2.4, bh * .5 - 1.2); }
      }
      /* półka ze słoikami */
      b.fillStyle = "#4a2d18"; b.fillRect(0, 150, 90, 7); b.fillRect(W - 90, 150, 90, 7);
      [[10, "#c9302c"], [34, "#3f9a3a"], [58, "#e8c25a"]].forEach(([x, col]) => { b.fillStyle = "rgba(255,255,255,.15)"; b.fillRect(x, 124, 20, 26); b.fillStyle = col; b.globalAlpha = .75; b.fillRect(x + 2, 130, 16, 19); b.globalAlpha = 1; b.fillStyle = "#6a6a72"; b.fillRect(x + 2, 121, 16, 4); });
      [[W - 80, "#e8c25a"], [W - 56, "#c9302c"], [W - 32, "#3f9a3a"]].forEach(([x, col]) => { b.fillStyle = "rgba(255,255,255,.15)"; b.fillRect(x, 124, 20, 26); b.fillStyle = col; b.globalAlpha = .75; b.fillRect(x + 2, 130, 16, 19); b.globalAlpha = 1; b.fillStyle = "#6a6a72"; b.fillRect(x + 2, 121, 16, 4); });
      /* łuk pieca */
      b.fillStyle = "#1a0d09"; b.beginPath(); b.moveTo(110, 360); b.lineTo(110, 250); b.quadraticCurveTo(110, 170, 180, 170); b.quadraticCurveTo(250, 170, 250, 250); b.lineTo(250, 360); b.closePath(); b.fill();
      b.strokeStyle = "#5a3a2a"; b.lineWidth = 9; b.stroke(); b.strokeStyle = "#7a5238"; b.lineWidth = 2; b.stroke();
      /* blat */
      const ct = b.createLinearGradient(0, 500, 0, H); ct.addColorStop(0, "#8a5a30"); ct.addColorStop(1, "#4a2c14"); b.fillStyle = ct; b.fillRect(0, 500, W, H - 500);
      b.fillStyle = "rgba(0,0,0,.18)"; for (let i = 0; i < 6; i++) b.fillRect(0, 506 + i * 10, W, 1.4);
      b.strokeStyle = "rgba(255,255,255,.1)"; b.lineWidth = 2; b.beginPath(); b.moveTo(0, 500); b.lineTo(W, 500); b.stroke();
      b.fillStyle = "rgba(255,244,220,.12)"; for (let i = 0; i < 45; i++) b.fillRect(rr() * W, 505 + rr() * 50, 1 + rr() * 2, 1);
      const vg = b.createRadialGradient(W / 2, 300, 120, W / 2, 300, 420); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)"); b.fillStyle = vg; b.fillRect(0, 0, W, H);
    }
    function resize() {
      const css = wrap.clientWidth || 360, dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(css * dpr); cv.height = Math.round(css * dpr * H / W); scale = cv.width / W; buildBg();
    }
    resize(); window.addEventListener("resize", resize); shell.onCleanup(() => window.removeEventListener("resize", resize));
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null; if (ro) { ro.observe(wrap); shell.onCleanup(() => ro.disconnect()); }

    /* ---- stan gry ---- */
    const st = {
      px: W / 2, tx: W / 2, hearts: 3, order: 1, step: 0, score: 0, combo: 0, orderMistakes: 0, items: [], parts: [], pops: [], shake: 0, slow: 0,
      spawnT: 1.2, sinceNeeded: 0, t: 0, phase: "count", count: 3.2, banner: null, flyPizza: null, earned: 0, over: false, layers: [], recipe: recipeFor(1), keys: { l: 0, r: 0 }, flash: 0
    };

    /* ---- sterowanie ---- */
    function setTarget(e) { const r = cv.getBoundingClientRect(); st.tx = clamp((e.clientX - r.left) / r.width * W, 36, W - 36); }
    cv.addEventListener("pointermove", setTarget); cv.addEventListener("pointerdown", (e) => { setTarget(e); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* */ } });
    const kd = (e) => { if (!shell.visible()) return; const k = e.key; if (k === "ArrowLeft" || k === "a" || k === "A") { st.keys.l = 1; e.preventDefault(); } if (k === "ArrowRight" || k === "d" || k === "D") { st.keys.r = 1; e.preventDefault(); } };
    const ku = (e) => { const k = e.key; if (k === "ArrowLeft" || k === "a" || k === "A") st.keys.l = 0; if (k === "ArrowRight" || k === "d" || k === "D") st.keys.r = 0; };
    document.addEventListener("keydown", kd); document.addEventListener("keyup", ku); shell.onCleanup(() => { document.removeEventListener("keydown", kd); document.removeEventListener("keyup", ku); });

    /* ---- pomocnicze ---- */
    const speedBase = () => Math.min(340, 105 + st.order * 17);
    const spawnGap = () => Math.max(0.36, 0.92 - st.order * 0.035);
    const needed = () => st.recipe.steps[st.step];
    function burst(x, y, col, n, spd) { for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = rnd(30, spd || 120); st.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: rnd(.35, .8), t: 0, col, r: rnd(1.5, 3.4) }); } }
    function pop(text, x, y, col) { st.pops.push({ text, x, y, col: col || "#fff", t: 0 }); }
    function spawn() {
      const o = st.order, r = Math.random();
      const pHaz = Math.min(0.4, 0.15 + o * 0.025);
      let type;
      const forceNeeded = st.sinceNeeded > 3.2 && !st.items.some((i) => i.type === needed() && i.y < H * .55);
      if (forceNeeded) type = needed();
      else if (r < pHaz) type = Math.random() < (o < 3 ? .3 : .55) ? "spark" : "burnt";
      else if (r < pHaz + 0.045 && o >= 3 && st.slow <= 0 && !st.items.some((i) => i.type === "gold")) type = "gold";
      else if (Math.random() < 0.3) type = needed();
      else type = pick(Object.keys(ING));
      if (type === needed()) st.sinceNeeded = 0;
      const x = rnd(34, W - 34), amp = o >= 3 ? Math.min(60, (o - 2) * 10) : 0;
      st.items.push({ type, x, x0: x, y: -24, r: type === "gold" ? 14 : 13.5, rot: rnd(-.4, .4), vm: o >= 3 && Math.random() < Math.min(.32, .1 + o * .02) ? 1.45 : 1, amp: amp * rnd(.4, 1), ph: rnd(0, 6.28), fr: rnd(1.1, 2.4) });
    }
    function loseHeart(why, x, y) {
      st.hearts--; st.orderMistakes++; st.combo = 0; st.shake = 0.35; st.flash = 0.35; SFX.hit(); burst(x, y, "#ff5a2a", 22, 160); pop(why, x, y - 20, "#ff8a7a");
      if (st.hearts <= 0) gameOver();
    }
    function addLayer(type) { st.layers.push({ type, seed: Math.random() * 100 }); }
    async function orderDone() {
      const n = st.order, perfect = st.orderMistakes === 0;
      const pts = 50 + (perfect ? 30 : 0) + n * 5; st.score += pts; SFX.done();
      st.banner = { text: "Zamówienie #" + n + " gotowe!", sub: (perfect ? "Bez błędu +30 · " : "") + "+" + pts, t: 0 };
      st.flyPizza = { layers: st.layers.slice(), x: st.px, t: 0 };
      for (let i = 0; i < 40; i++) st.parts.push({ x: st.px, y: PEEL_Y - 20, vx: rnd(-160, 160), vy: rnd(-260, -80), life: rnd(.8, 1.5), t: 0, col: pick(["#d3392b", "#fbf2d6", "#3f9a3a", "#f1cf6a"]), r: rnd(2, 4), g: 380 });
      if (perfect && st.hearts < 3 && n % 5 === 0) { st.hearts++; pop("+❤", st.px, PEEL_Y - 50, "#ff8a9a"); }
      bumpBest("arcade", "order", n); bumpBest("arcade", "score", st.score);
      const gain = REWARD_AT[n];
      st.order++; st.step = 0; st.layers = []; st.orderMistakes = 0; st.recipe = recipeFor(st.order); addLayer("base");
      if (gain) { const r = await grant(ctx, "arcade", gain); if (r && r.ok) { st.earned += r.given || gain; shell.toast("Zamówienie #" + n + ": " + (r.msg || "+" + gain + " pkt"), "gold", 3200); } else if (r && r.msg) shell.toast(r.msg, "err", 3200); }
    }
    function catchItem(it) {
      const t = it.type;
      if (t === "spark" || t === "burnt") { loseHeart(t === "spark" ? "Iskra!" : "Przypalone!", it.x, PEEL_Y - 14); return; }
      if (t === "gold") { st.slow = 6; SFX.ok(); pop("Czas zwolniony!", it.x, PEEL_Y - 40, "#ffe27a"); burst(it.x, PEEL_Y - 10, "#ffd23e", 20, 150); return; }
      if (t === needed()) {
        st.step++; st.combo++; SFX.catch(); addLayer(t);
        const mult = 1 + Math.floor(st.combo / 5) * 0.5, gain = Math.round(10 * mult); st.score += gain;
        pop("+" + gain, it.x, PEEL_Y - 36, "#ffe27a"); burst(it.x, PEEL_Y - 10, ING[t].c, 12, 110);
        if (st.step >= st.recipe.steps.length) orderDone();
      } else loseHeart("Zły składnik!", it.x, PEEL_Y - 14);
    }
    function gameOver() {
      if (st.over) return; st.over = true; SFX.lose(); bumpBest("arcade", "order", st.order - 1); bumpBest("arcade", "score", st.score);
      shell.after(900, () => shell.screen({
        hero: "🔥", title: "Pizza przypaliła się…",
        html: "<p>Ukończone zamówienia: <b>" + (st.order - 1) + "</b> · wynik: <b>" + st.score + "</b></p>" +
          (st.earned ? '<p style="color:#f1cf6a"><b>W tym podejściu zdobyto: +' + st.earned + " pkt</b></p>" : "<p>Punkty zaczynają się od zamówienia nr 10.</p>") +
          '<p style="font-size:12.5px;color:#9a9aa8">Rekord: zamówienie nr ' + best("arcade", "order") + " · wynik " + best("arcade", "score") + "</p>" + rewardsHtml(REW, st.earned) + rankHtml(),
        buttons: [{ label: "↻ Jeszcze raz", on: play }, { label: "Zamknij", cls: "ghost", on: () => shell.close() }]
      }));
    }

    /* ---- rysowanie ---- */
    function drawPizza(layers, x, y, tt, alpha) {
      c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.translate(x, y);
      layers.forEach((L, i) => {
        const ly = -i * 3.4, rx = L.type === "base" ? 36 : 33 - Math.min(5, i * .5), ry = L.type === "base" ? 9 : 7.5;
        const rr = (n) => { const s = Math.sin(L.seed * 12.9898 + n * 78.233) * 43758.5453; return s - Math.floor(s); };
        if (L.type === "base") { c.fillStyle = "#b98a4a"; c.beginPath(); c.ellipse(0, ly + 3, rx, ry, 0, 0, 7); c.fill(); c.fillStyle = "#ecd0a0"; c.beginPath(); c.ellipse(0, ly, rx, ry, 0, 0, 7); c.fill(); c.strokeStyle = "#d9b06a"; c.lineWidth = 2; c.stroke(); }
        else if (L.type === "sos") { c.fillStyle = "#c9372a"; c.beginPath(); c.ellipse(0, ly, rx - 3, ry - 1.5, 0, 0, 7); c.fill(); c.fillStyle = "rgba(255,255,255,.18)"; c.beginPath(); c.ellipse(-8, ly - 2, 9, 2.2, 0, 0, 7); c.fill(); }
        else if (L.type === "ser") { c.fillStyle = "#fbf2d6"; for (let k = 0; k < 6; k++) { c.beginPath(); c.ellipse((rr(k) - .5) * (rx * 1.3), ly + (rr(k + 9) - .5) * ry * 1.1, 8 + rr(k + 3) * 4, 3 + rr(k + 5) * 2, 0, 0, 7); c.fill(); } }
        else { for (let k = 0; k < 3; k++) { const ox = (rr(k * 3 + 1) - .5) * rx * 1.4, oy = (rr(k * 3 + 2) - .5) * ry * 1.1; drawIng(c, L.type, ox, ly + oy - 2, 5.2, 0); } }
      });
      c.restore();
    }
    function drawPeel(x) {
      c.save(); c.translate(x, PEEL_Y);
      c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(4, 20, 44, 10, 0, 0, 7); c.fill();
      c.fillStyle = "#8a5a2c"; c.fillRect(-5, 12, 10, 90);
      c.fillStyle = "#a8743a"; c.fillRect(-3, 12, 4, 90);
      const g = c.createLinearGradient(-44, 0, 44, 0); g.addColorStop(0, "#b9843f"); g.addColorStop(.5, "#d9a860"); g.addColorStop(1, "#9a6a30");
      c.fillStyle = g; c.beginPath(); c.ellipse(0, 8, 45, 11, 0, 0, 7); c.fill(); c.strokeStyle = "#6a4318"; c.lineWidth = 1.6; c.stroke();
      c.strokeStyle = "rgba(90,55,20,.35)"; c.lineWidth = 1; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 12, 0); c.lineTo(i * 11, 17); c.stroke(); }
      c.restore();
    }
    function drawHud() {
      /* bilet z zamówieniem */
      const rc = st.recipe, n = rc.steps.length, gap = Math.min(30, (W - 16 - 56) / n), bw = Math.min(W - 16, 40 + n * gap + 16), bx = (W - bw) / 2;
      c.save(); c.shadowColor = "rgba(0,0,0,.5)"; c.shadowBlur = 8; c.shadowOffsetY = 3;
      c.fillStyle = "#f6ecd2"; c.beginPath(); c.moveTo(bx, 8); for (let i = 0; i < 14; i++) c.lineTo(bx + (i + .5) * bw / 14, i % 2 ? 8 : 12); c.lineTo(bx + bw, 8); c.lineTo(bx + bw, 74); c.lineTo(bx, 74); c.closePath(); c.fill(); c.restore();
      c.fillStyle = "#3a2a16"; c.font = "700 12px Poppins,system-ui,sans-serif"; c.textAlign = "left"; c.fillText("#" + st.order + "  " + rc.name.toUpperCase(), bx + 10, 28);
      c.textAlign = "right"; c.fillStyle = "#8a6a2a"; c.fillText(st.step + "/" + n, bx + bw - 10, 28);
      const sx = bx + 14 + 12;
      const vis = st.order >= 8 ? 2 : st.order >= 4 ? 3 : 99;
      for (let i = 0; i < n; i++) {
        const x = sx + i * gap, y = 52, done = i < st.step, nxt = i === st.step;
        if (i >= st.step + vis) { c.fillStyle = "rgba(58,42,22,.12)"; c.beginPath(); c.arc(x, y, 10, 0, 7); c.fill(); c.fillStyle = "#8a6a2a"; c.font = "700 13px Poppins,system-ui,sans-serif"; c.textAlign = "center"; c.fillText("?", x, y + 5); continue; }
        c.save(); c.globalAlpha = done ? .35 : 1;
        if (nxt) { c.fillStyle = "rgba(212,175,55,.35)"; c.beginPath(); c.arc(x, y, 15 + Math.sin(st.t * 8) * 1.2, 0, 7); c.fill(); c.strokeStyle = "#d4af37"; c.lineWidth = 2; c.stroke(); }
        drawIng(c, rc.steps[i], x, y, nxt ? 11 : 9, st.t); c.restore();
        if (done) { c.strokeStyle = "#1f8a4a"; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x - 1, y + 5); c.lineTo(x + 7, y - 6); c.stroke(); }
      }
      /* serca, wynik, kombo */
      c.textAlign = "left"; c.font = "16px system-ui,sans-serif"; for (let i = 0; i < 3; i++) { c.globalAlpha = i < st.hearts ? 1 : .3; c.fillText(i < st.hearts ? "❤️" : "🖤", 10 + i * 20, 98); } c.globalAlpha = 1;
      c.textAlign = "right"; c.font = "700 14px Poppins,system-ui,sans-serif"; c.fillStyle = "#fff6d6"; c.shadowColor = "#000"; c.shadowBlur = 4; c.fillText(String(st.score), W - 10, 98); c.shadowBlur = 0;
      if (st.combo >= 3) { c.font = "700 12px Poppins,system-ui,sans-serif"; c.fillStyle = "#ffd23e"; c.fillText("KOMBO ×" + st.combo, W - 10, 114); }
      if (st.slow > 0) { c.fillStyle = "rgba(255,226,122,.9)"; c.textAlign = "center"; c.font = "700 11px Poppins,system-ui,sans-serif"; c.fillText("⏳ czas zwolniony " + Math.ceil(st.slow) + "s", W / 2, 98); }
    }
    function render() {
      c.setTransform(scale, 0, 0, scale, 0, 0);
      c.drawImage(bg, 0, 0, W, H);
      /* ogień w piecu */
      const fl = 1 + Math.sin(st.t * 9) * .08 + Math.sin(st.t * 23) * .05;
      const gl = c.createRadialGradient(180, 330, 6, 180, 320, 120 * fl); gl.addColorStop(0, "rgba(255,230,120,.95)"); gl.addColorStop(.25, "rgba(255,140,30,.75)"); gl.addColorStop(.7, "rgba(200,50,10,.25)"); gl.addColorStop(1, "rgba(120,20,0,0)");
      c.fillStyle = gl; c.fillRect(60, 170, 240, 200);
      c.fillStyle = "#ff9a2a"; for (let i = 0; i < 5; i++) { const fx = 140 + i * 20, fh = 40 + Math.sin(st.t * 7 + i * 1.7) * 14 + (i === 2 ? 24 : 0); c.beginPath(); c.moveTo(fx - 12, 358); c.quadraticCurveTo(fx - 8, 358 - fh * .5, fx, 358 - fh); c.quadraticCurveTo(fx + 8, 358 - fh * .5, fx + 12, 358); c.fill(); }
      c.fillStyle = "#ffe27a"; for (let i = 0; i < 3; i++) { const fx = 160 + i * 20, fh = 20 + Math.sin(st.t * 9 + i * 2.1) * 8; c.beginPath(); c.moveTo(fx - 7, 358); c.quadraticCurveTo(fx - 4, 358 - fh * .5, fx, 358 - fh); c.quadraticCurveTo(fx + 4, 358 - fh * .5, fx + 7, 358); c.fill(); }
      /* lampy */
      [70, 290].forEach((lx, i) => { const sw = Math.sin(st.t * 1.3 + i * 2) * 3; c.strokeStyle = "#2a1a10"; c.lineWidth = 2; c.beginPath(); c.moveTo(lx, 0); c.lineTo(lx + sw, 120); c.stroke(); c.fillStyle = "#d9a030"; c.beginPath(); c.moveTo(lx + sw - 14, 130); c.lineTo(lx + sw + 14, 130); c.lineTo(lx + sw + 8, 118); c.lineTo(lx + sw - 8, 118); c.fill(); const lg = c.createRadialGradient(lx + sw, 132, 2, lx + sw, 140, 70); lg.addColorStop(0, "rgba(255,230,150,.35)"); lg.addColorStop(1, "rgba(255,200,100,0)"); c.fillStyle = lg; c.beginPath(); c.arc(lx + sw, 140, 70, 0, 7); c.fill(); });
      c.save(); if (st.shake > 0) c.translate(rnd(-1, 1) * st.shake * 12, rnd(-1, 1) * st.shake * 12);
      /* przedmioty */
      st.items.forEach((it) => { c.save(); c.translate(it.x, it.y); c.rotate(it.rot + Math.sin(st.t * 3 + it.ph) * .12); c.shadowColor = "rgba(0,0,0,.45)"; c.shadowBlur = 6; c.shadowOffsetY = 3; drawIng(c, it.type, 0, 0, it.r, st.t); c.restore(); });
      drawPeel(st.px); drawPizza(st.layers, st.px, PEEL_Y - 6, st.t);
      if (st.flyPizza) { const f = st.flyPizza, k = f.t / .8; drawPizza(f.layers, f.x + k * 140, PEEL_Y - 6 - k * 160 - 120 * k * k, st.t, 1 - k); }
      /* cząsteczki */
      st.parts.forEach((p) => { c.globalAlpha = clamp(1 - p.t / p.life, 0, 1); c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill(); }); c.globalAlpha = 1;
      c.restore();
      st.pops.forEach((p) => { c.globalAlpha = clamp(1 - p.t / 1, 0, 1); c.font = "800 15px Poppins,system-ui,sans-serif"; c.textAlign = "center"; c.lineWidth = 3; c.strokeStyle = "rgba(0,0,0,.7)"; c.strokeText(p.text, p.x, p.y - p.t * 38); c.fillStyle = p.col; c.fillText(p.text, p.x, p.y - p.t * 38); }); c.globalAlpha = 1;
      drawHud();
      if (st.flash > 0) { c.fillStyle = "rgba(255,60,20," + (st.flash * .5) + ")"; c.fillRect(0, 0, W, H); }
      if (st.phase === "count") { c.fillStyle = "rgba(0,0,0,.45)"; c.fillRect(0, 0, W, H); c.fillStyle = "#fff"; c.textAlign = "center"; c.font = "800 72px Poppins,system-ui,sans-serif"; c.fillText(String(Math.max(1, Math.ceil(st.count))), W / 2, H / 2 + 20); c.font = "600 15px Poppins,system-ui,sans-serif"; c.fillStyle = "#f1cf6a"; c.fillText("Przeciągnij, żeby ruszać łopatą", W / 2, H / 2 + 56); }
      if (st.banner) { const b = st.banner, a = clamp(1 - (b.t - 1.2) / .6, 0, 1), k = Math.min(1, b.t / .25); c.globalAlpha = a; c.fillStyle = "rgba(0,0,0,.55)"; c.fillRect(0, 150 - 8, W, 66); c.textAlign = "center"; c.fillStyle = "#ffe27a"; c.font = "800 " + (22 * (.8 + .2 * k)) + "px Poppins,system-ui,sans-serif"; c.fillText(b.text, W / 2, 180); c.fillStyle = "#fff"; c.font = "600 14px Poppins,system-ui,sans-serif"; c.fillText(b.sub, W / 2, 202); c.globalAlpha = 1; }
    }

    /* ---- logika ---- */
    function update(dt) {
      st.t += dt;
      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt); if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 1.6);
      if (st.banner) { st.banner.t += dt; if (st.banner.t > 1.8) st.banner = null; }
      if (st.flyPizza) { st.flyPizza.t += dt; if (st.flyPizza.t > .8) st.flyPizza = null; }
      st.parts.forEach((p) => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 260) * dt; }); st.parts = st.parts.filter((p) => p.t < p.life);
      st.pops.forEach((p) => (p.t += dt)); st.pops = st.pops.filter((p) => p.t < 1);
      const kx = (st.keys.r - st.keys.l); if (kx) st.tx = clamp(st.tx + kx * 330 * dt, 36, W - 36);
      st.px += (st.tx - st.px) * Math.min(1, dt * (st.order >= 6 ? 9 : st.order >= 3 ? 12 : 15));
      if (st.phase === "count") { st.count -= dt; if (st.count <= 0) { st.phase = "play"; addLayer("base"); } return; }
      if (st.over) return;
      if (st.slow > 0) st.slow -= dt;
      const k = st.slow > 0 ? 0.55 : 1, sp = speedBase() * k;
      st.spawnT -= dt * k; st.sinceNeeded += dt;
      if (st.spawnT <= 0) { spawn(); st.spawnT = spawnGap() * rnd(.8, 1.25); }
      for (let i = st.items.length - 1; i >= 0; i--) {
        const it = st.items[i]; it.y += sp * it.vm * dt; if (it.amp) it.x = clamp(it.x0 + Math.sin(st.t * it.fr * 2 + it.ph) * it.amp, 18, W - 18);
        const caught = it.y + it.r * .7 >= PEEL_Y - 4 && it.y - it.r < PEEL_Y + 14 && Math.abs(it.x - st.px) < PEEL_HW + it.r * .45;
        if (caught) { st.items.splice(i, 1); catchItem(it); if (st.over) return; }
        else if (it.y > H + 30) st.items.splice(i, 1);
        else if (it.y > 500 && !it.splat) { it.splat = true; if (it.type !== "spark") burst(it.x, 500, "rgba(255,255,255,.5)", 3, 40); }
      }
    }
    let last = performance.now();
    function frame(now) {
      loopId = requestAnimationFrame(frame);
      if (!shell.alive()) { cancelAnimationFrame(loopId); return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!shell.visible()) return;      /* wstrzymane, gdy karta ukryta */
      update(dt); render();
    }
    loopId = requestAnimationFrame(frame);
    window.__arcadeState = st;   /* używane tylko w testach */
  }
  intro();
}
window.WRGames.register({ id: "arcade", icon: "🔥", name: "Pizzer na gorąco", desc: "Łap składniki w kolejności z zamówienia — punkty od zamówienia nr 10", start });
})();
})();
