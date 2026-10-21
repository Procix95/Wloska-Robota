/* =====================================================================
   Włoska Robota — gra "Pizzak" (wirtualny zwierzak, w stylu Pou)
   Samodzielny plik: rejestruje się w WRGames i nie wymaga gry.js.
   Stan zwierzaka jest zapisywany w przeglądarce (localStorage "wr_pou_v1"), a czas leci naprawdę —
   także wtedy, gdy strona jest zamknięta. Punkty: za kolejne godziny "opieki" (3, 7 i 14 dni), przez WRGames.award.
   ===================================================================== */
(function () {
"use strict";
if (window.__pouLoaded) return;
if (!window.WRGames || typeof window.WRGames.register !== "function") { setTimeout(function(){ if (window.WRGames && !window.__pouLoaded) { var s = document.createElement("script"); s.src = "/gry-pou.js?v=2"; document.head.appendChild(s); } }, 800); return; }
window.__pouLoaded = true;

const KEY = "wr_pou_v1", HOUR = 3600000;
const MILESTONES = [72, 168, 336];                       // godziny "opieki" potrzebne do kolejnych punktów
const DAILY_MAX = 3;                                      // ile punktów z tej gry na dobę (UTC) — poza limitami serwera
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const utcDay = (ms) => Math.floor(ms / 86400000);
function h(tag, attrs) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k === "html") e.innerHTML = v; else if (k === "style") e.style.cssText = v; else e.setAttribute(k, v === true ? "" : v); }
  for (let i = 2; i < arguments.length; i++) { const c = arguments[i]; if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function fmtAge(ms) {
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60);
  return d ? d + " d " + hh + " h" : hh ? hh + " h " + (m % 60) + " min" : (m % 60) + " min";
}

/* ---------- zapis ---------- */
let memSave = null;
function fresh(prev) {
  const now = Date.now();
  return {
    v: 1, born: now, last: now, hunger: 80, hygiene: 80, energy: 80, fun: 80, health: 100, coins: 15, xp: 0, sleeping: false, thrive: 0, award: [0, 0, 0],
    hat: "", owned: [], lives: prev ? prev.lives + 1 : 1, best: prev ? prev.best : 0, day: prev ? prev.day : { d: 0, n: 0 }, capDay: prev ? prev.capDay : 0,
    sound: prev ? prev.sound : 1, started: true, dead: false, diedAt: 0
  };
}
function load() {
  try { const r = localStorage.getItem(KEY); if (r) { const o = JSON.parse(r); if (o && o.v === 1) return o; } } catch (e) { /* brak dostępu */ }
  return memSave;
}
let P = null;
function save() { if (!P) return; memSave = P; try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* tryb prywatny */ } }

/* ---------- symulacja upływu czasu ---------- */
function step(P, dt) {
  const hr = dt / HOUR, sl = P.sleeping;
  P.hunger -= (sl ? 2.5 : 5.5) * hr; P.hygiene -= (sl ? 1.5 : 3.5) * hr; P.fun -= (sl ? 1.5 : 6) * hr;
  if (sl) { P.energy += 14 * hr; if (P.energy >= 100) { P.energy = 100; P.sleeping = false; } } else P.energy -= 3.5 * hr;
  ["hunger", "hygiene", "energy", "fun"].forEach((k) => (P[k] = clamp(P[k], 0, 100)));
  const vals = [P.hunger, P.hygiene, P.energy, P.fun], low = vals.filter((v) => v <= 8).length, mn = Math.min.apply(null, vals);
  if (low) P.health -= (low >= 2 ? 12 : 6) * hr; else if (mn >= 40) P.health += 3 * hr;
  P.health = clamp(P.health, 0, 100);
  if (mn >= 35 && P.health >= 70) P.thrive += dt; else if (low) P.thrive = 0;
}
function advance(P, now) {
  if (P.dead) { P.last = now; return; }
  let dt = now - P.last;
  if (dt <= 0) { P.last = now; return; }
  dt = Math.min(dt, 30 * 24 * HOUR);
  let t = P.last;
  const end = P.last + dt;
  while (t < end && !P.dead) {
    const d = Math.min(300000, end - t); t += d; step(P, d);
    if (P.health <= 0) { P.dead = true; P.diedAt = t; P.sleeping = false; }
  }
  P.last = now;
  const age = (P.dead ? P.diedAt : now) - P.born; if (age > P.best) P.best = age;
}
const level = () => Math.floor(Math.sqrt(P.xp / 18)) + 1;
function addXp(n) { P.xp += n; }

/* ---------- dźwięk ---------- */
let AC = null;
function tone(f, d, type, vol, slide) {
  if (!P || !P.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain(); o.type = type || "sine"; o.frequency.value = f;
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, AC.currentTime + d);
    g.gain.value = vol || 0.05; g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + d);
    o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + d);
  } catch (e) { /* brak audio */ }
}
const SFX = {
  eat: () => { tone(300, .08, "square", .04); setTimeout(() => tone(380, .08, "square", .04), 120); setTimeout(() => tone(300, .08, "square", .04), 240); },
  pop: () => tone(700 + Math.random() * 400, .07, "sine", .04),
  ok: () => { tone(523, .1, "triangle", .06); setTimeout(() => tone(784, .14, "triangle", .06), 100); },
  bad: () => tone(180, .25, "sawtooth", .05, 70),
  giggle: () => { tone(620, .06, "sine", .05); setTimeout(() => tone(760, .06, "sine", .05), 80); setTimeout(() => tone(680, .08, "sine", .05), 160); },
  coin: () => { tone(988, .06, "square", .04); setTimeout(() => tone(1319, .12, "square", .04), 60); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .18, "triangle", .06), i * 110))
};

/* ---------- dane: jedzenie i ubranka ---------- */
const FOODS = [
  { id: "apple", ic: "🍎", n: "Jabłko", c: 3, e: { hunger: 12, health: 4 } },
  { id: "salad", ic: "🥗", n: "Sałatka", c: 6, e: { hunger: 22, health: 8 } },
  { id: "marg", ic: "🍕", n: "Margherita", c: 8, e: { hunger: 34, fun: 6, hygiene: -4 } },
  { id: "pep", ic: "🍕", n: "Pepperoni", c: 12, e: { hunger: 42, fun: 10, hygiene: -6 }, tag: "pep" },
  { id: "cake", ic: "🍰", n: "Ciasto", c: 14, e: { hunger: 20, fun: 24, hygiene: -3 } },
  { id: "cola", ic: "🥤", n: "Cola", c: 5, e: { hunger: 8, fun: 14, energy: 8 } }
];
const STAT_LBL = { hunger: "głód", hygiene: "czystość", energy: "energia", fun: "humor", health: "zdrowie" };
const HATS = [
  { id: "chef", n: "Czapa kucharza", c: 30, lv: 1 },
  { id: "bandana", n: "Bandana", c: 45, lv: 2 },
  { id: "shades", n: "Okulary", c: 60, lv: 2 },
  { id: "stache", n: "Wąsy", c: 80, lv: 3 },
  { id: "crown", n: "Korona", c: 220, lv: 5 }
];
function hatSvg(id) {
  switch (id) {
    case "chef": return '<g><rect x="70" y="36" width="60" height="16" rx="3" fill="#fff" stroke="#d6d6d6" stroke-width="2"/><circle cx="76" cy="30" r="14" fill="#fff" stroke="#d6d6d6" stroke-width="2"/><circle cx="100" cy="21" r="17" fill="#fff" stroke="#d6d6d6" stroke-width="2"/><circle cx="124" cy="30" r="14" fill="#fff" stroke="#d6d6d6" stroke-width="2"/><rect x="72" y="34" width="56" height="16" fill="#fff"/><path d="M78 40h44" stroke="#e4e4e4" stroke-width="2"/></g>';
    case "bandana": return '<g><path d="M30 62Q100 38 170 62L166 76Q100 54 34 76Z" fill="#d6302b" stroke="#8f1b18" stroke-width="2"/><g fill="#fff"><circle cx="60" cy="64" r="3"/><circle cx="90" cy="58" r="3"/><circle cx="120" cy="58" r="3"/><circle cx="148" cy="66" r="3"/></g><path d="M166 70l22 -10 -4 20z" fill="#d6302b" stroke="#8f1b18" stroke-width="2"/></g>';
    case "shades": return '<g><rect x="62" y="86" width="34" height="22" rx="8" fill="#14141a" stroke="#000" stroke-width="2"/><rect x="104" y="86" width="34" height="22" rx="8" fill="#14141a" stroke="#000" stroke-width="2"/><path d="M96 94h8" stroke="#000" stroke-width="3"/><path d="M68 90l10 0M110 90l10 0" stroke="#5a6a8a" stroke-width="2" stroke-linecap="round"/></g>';
    case "stache": return '<g><path d="M100 126C92 118 74 120 70 130C80 128 90 134 100 128C110 134 120 128 130 130C126 120 108 118 100 126Z" fill="#2a1c12" stroke="#120a05" stroke-width="1.5"/></g>';
    case "crown": return '<g><path d="M66 50L64 18L84 34L100 10L116 34L136 18L134 50Z" fill="#f5c63a" stroke="#a6780c" stroke-width="2.5" stroke-linejoin="round"/><rect x="66" y="46" width="68" height="9" rx="2" fill="#e8b21e" stroke="#a6780c" stroke-width="2"/><circle cx="100" cy="30" r="4.5" fill="#d6302b"/><circle cx="80" cy="42" r="3" fill="#3a8ad6"/><circle cx="120" cy="42" r="3" fill="#2fa84f"/></g>';
  }
  return "";
}

/* ---------- rysowanie Pizzaka ---------- */
function moodOf() {
  if (P.dead) return "dead";
  if (P.sleeping) return "sleep";
  const mn = Math.min(P.hunger, P.hygiene, P.energy, P.fun);
  if (P.health < 40) return "sick";
  if (mn < 25) return "sad";
  if (mn >= 60) return "happy";
  return "ok";
}
function petSvg(mood, eating, tap) {
  const dirt = clamp((60 - P.hygiene) / 60, 0, 1);
  const spots = [[60, 80, 7], [138, 70, 6], [118, 150, 8], [66, 140, 6], [100, 62, 5], [152, 112, 6], [48, 110, 5], [92, 160, 5]];
  const dirtSvg = spots.slice(0, Math.round(dirt * spots.length)).map((s) => '<circle cx="' + s[0] + '" cy="' + s[1] + '" r="' + s[2] + '" fill="#6b4a2a" opacity=".55"/>').join("");
  let eyes, brows = "", mouth;
  if (mood === "dead") { eyes = '<g stroke="#2a1a14" stroke-width="4" stroke-linecap="round"><path d="M72 90l16 16M88 90l-16 16M112 90l16 16M128 90l-16 16"/></g>'; mouth = '<path d="M88 134h24" stroke="#2a1a14" stroke-width="4" stroke-linecap="round"/>'; }
  else if (mood === "sleep") { eyes = '<g stroke="#2a1a14" stroke-width="4" fill="none" stroke-linecap="round"><path d="M70 100Q80 108 90 100"/><path d="M110 100Q120 108 130 100"/></g>'; mouth = '<path d="M92 130Q100 136 108 130" stroke="#2a1a14" stroke-width="3.5" fill="none" stroke-linecap="round"/>'; }
  else {
    const sad = mood === "sad" || mood === "sick";
    const eye = (cx) => '<g class="wp-eye"><ellipse cx="' + cx + '" cy="98" rx="11" ry="' + (mood === "happy" ? 13 : 12) + '" fill="#fff" stroke="#2a1a14" stroke-width="2.5"/><circle cx="' + (cx + (tap ? 0 : 1)) + '" cy="' + (sad ? 102 : 99) + '" r="6" fill="#241612"/><circle cx="' + (cx + 2.5) + '" cy="' + (sad ? 99.5 : 96) + '" r="2.1" fill="#fff"/></g>';
    eyes = eye(80) + eye(120);
    if (sad) brows = '<g stroke="#2a1a14" stroke-width="3.5" stroke-linecap="round"><path d="M68 80l20 -6"/><path d="M132 80l-20 -6"/></g>';
    else if (mood === "happy") brows = '<g stroke="#2a1a14" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"><path d="M70 78Q80 72 90 78"/><path d="M110 78Q120 72 130 78"/></g>';
    if (eating) mouth = '<ellipse class="wp-chew" cx="100" cy="130" rx="11" ry="9" fill="#7a1f1f" stroke="#2a1a14" stroke-width="3"/>';
    else if (mood === "happy") mouth = '<path d="M80 122Q100 156 120 122Z" fill="#7a1f1f" stroke="#2a1a14" stroke-width="3.5" stroke-linejoin="round"/><path d="M90 140Q100 133 110 140Q100 148 90 140Z" fill="#ff7a8a"/>';
    else if (sad) mouth = '<path d="M84 138Q100 120 116 138" stroke="#2a1a14" stroke-width="4" fill="none" stroke-linecap="round"/>';
    else mouth = '<path d="M84 128Q100 143 116 128" stroke="#2a1a14" stroke-width="4" fill="none" stroke-linecap="round"/>';
  }
  const sickTint = mood === "sick" ? '<circle cx="100" cy="105" r="78" fill="#7ac94a" opacity=".32"/>' : "";
  const sweat = mood === "sick" ? '<path d="M152 70q8 12 0 18q-8 -6 0 -18z" fill="#9fd8ff" stroke="#4f9bd0" stroke-width="1.5"/>' : "";
  const hatId = P.hat && P.owned.indexOf(P.hat) >= 0 ? P.hat : "";
  const front = hatId === "shades" || hatId === "stache" ? hatSvg(hatId) : "";
  const top = hatId && !front ? hatSvg(hatId) : "";
  return '<svg viewBox="0 0 200 210" class="wp-svg" aria-label="Pizzak">' +
    '<ellipse cx="100" cy="199" rx="58" ry="8" fill="#000" opacity=".28"/>' +
    '<ellipse cx="74" cy="189" rx="17" ry="9" fill="#8a5a2c" stroke="#4e3015" stroke-width="2.5"/><ellipse cx="126" cy="189" rx="17" ry="9" fill="#8a5a2c" stroke="#4e3015" stroke-width="2.5"/>' +
    '<g class="wp-arms" stroke="#c98a35" stroke-width="9" stroke-linecap="round" fill="none"><path d="M26 122q-14 12 -10 28"/><path d="M174 122q14 12 10 28"/></g>' +
    '<g class="wp-body"><circle cx="100" cy="106" r="79" fill="#e6b25c" stroke="#a96d22" stroke-width="3.5"/>' +
    '<circle cx="100" cy="106" r="70" fill="#d9a04a" opacity=".55"/><circle cx="100" cy="106" r="66" fill="#d64a2e"/><circle cx="100" cy="106" r="60" fill="#f7d56e"/>' +
    '<g fill="#fff0a6" opacity=".7"><ellipse cx="62" cy="116" rx="12" ry="7"/><ellipse cx="140" cy="94" rx="11" ry="6"/><ellipse cx="118" cy="62" rx="12" ry="6"/><ellipse cx="86" cy="150" rx="12" ry="6"/></g>' +
    '<g><circle cx="58" cy="72" r="11" fill="#c92e28" stroke="#7a1514" stroke-width="2"/><circle cx="55" cy="69" r="2.4" fill="#f4b3a0"/><circle cx="62" cy="76" r="2" fill="#f4b3a0"/>' +
    '<circle cx="146" cy="76" r="10" fill="#c92e28" stroke="#7a1514" stroke-width="2"/><circle cx="143" cy="73" r="2.2" fill="#f4b3a0"/>' +
    '<circle cx="144" cy="144" r="11" fill="#c92e28" stroke="#7a1514" stroke-width="2"/><circle cx="141" cy="141" r="2.4" fill="#f4b3a0"/><circle cx="148" cy="148" r="2" fill="#f4b3a0"/>' +
    '<circle cx="58" cy="146" r="10" fill="#c92e28" stroke="#7a1514" stroke-width="2"/><circle cx="55" cy="143" r="2.2" fill="#f4b3a0"/>' +
    '<ellipse cx="100" cy="60" rx="8" ry="6" fill="#3a2d5a" stroke="#1d1530" stroke-width="2"/><ellipse cx="100" cy="60" rx="3" ry="2.2" fill="#f7d56e"/>' +
    '<path d="M100 164q10 -10 22 -4q-6 12 -22 4z" fill="#3f9a3a" stroke="#216a24" stroke-width="1.5"/></g>' +
    '<ellipse cx="66" cy="119" rx="9" ry="6" fill="#ff7f8c" opacity=".55"/><ellipse cx="134" cy="119" rx="9" ry="6" fill="#ff7f8c" opacity=".55"/>' +
    dirtSvg + sickTint + eyes + brows + mouth + sweat + front + "</g>" + top + "</svg>";
}

/* ---------- styl ---------- */
const CSS = `
.wpou{position:relative;max-width:440px;margin:0 auto;border-radius:16px;overflow:hidden;background:#16110f;color:#f3ede6;border:1px solid #3a2c24;font-family:inherit;line-height:1.35;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.wpou *{box-sizing:border-box}
.wp-top{display:flex;align-items:center;gap:8px;padding:8px 10px;background:linear-gradient(180deg,#2c201a,#1d1511);border-bottom:1px solid #3a2c24}
.wp-name{flex:1;min-width:0;font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wp-name small{display:block;font-weight:500;font-size:11.5px;color:#b9a99a;margin-top:1px}
.wp-coins{font-weight:800;font-size:14px;background:#2a2012;border:1px solid #6a5019;color:#f6d36b;border-radius:99px;padding:4px 11px}
.wp-ib{width:34px;height:34px;flex:none;border-radius:9px;border:1px solid #4a382c;background:#241a14;color:#eee;font-size:16px;cursor:pointer;display:grid;place-items:center;padding:0;font-family:inherit}
.wp-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;padding:9px 12px 4px}
.wp-st{display:flex;align-items:center;gap:6px;font-size:12px;color:#cdbdae}
.wp-st i{font-style:normal;font-size:15px;width:20px;text-align:center}
.wp-bar{flex:1;height:9px;border-radius:99px;background:#2a211b;overflow:hidden;border:1px solid #3a2c24}
.wp-bar b{display:block;height:100%;border-radius:99px;background:#3fbf6a;transition:width .5s,background .5s}
.wp-bar.mid b{background:#e3b341}.wp-bar.low b{background:#e04a3a;animation:wppulse 1s infinite}
@keyframes wppulse{50%{opacity:.55}}
.wp-care{margin:2px 12px 8px;font-size:12px;color:#c9b99a;display:flex;align-items:center;gap:8px}
.wp-care .wp-bar{height:7px}.wp-care .wp-bar b{background:linear-gradient(90deg,#d4af37,#f6e08a)}.wp-care .wp-bar.hp b{background:linear-gradient(90deg,#e0566a,#ff8a9a)}
.wp-scene{position:relative;height:292px;margin:0 8px;border-radius:14px;overflow:hidden;background:linear-gradient(180deg,#7a4d34,#5a3724);border:1px solid #3a2c24;touch-action:none}
.wp-wall{position:absolute;inset:0 0 62px 0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 22px,rgba(0,0,0,.05) 22px 44px),linear-gradient(180deg,#a8744c,#8a5a3a)}
.wp-wall:after{content:"";position:absolute;left:0;right:0;bottom:0;height:10px;background:#5a3722;box-shadow:0 -2px 0 #7a4e32}
.wp-floor{position:absolute;left:0;right:0;bottom:0;height:62px;background:repeating-linear-gradient(90deg,#9b6a3d 0 56px,#8a5b32 56px 58px),linear-gradient(180deg,#a47241,#7a4e28);box-shadow:inset 0 6px 10px rgba(0,0,0,.3)}
.wp-win{position:absolute;left:16px;top:16px;width:84px;height:92px;border-radius:44px 44px 6px 6px;border:6px solid #f1e3c8;overflow:hidden;background:#8fd0ff;box-shadow:0 4px 10px rgba(0,0,0,.35)}
.wp-win:before,.wp-win:after{content:"";position:absolute;background:#f1e3c8;z-index:2}.wp-win:before{left:50%;top:0;bottom:0;width:4px;margin-left:-2px}.wp-win:after{top:50%;left:0;right:0;height:4px;margin-top:-2px}
.wp-sky{position:absolute;inset:0;transition:background 1s}
.wpou.day .wp-sky{background:linear-gradient(180deg,#6ec0ff,#c8ecff)}.wpou.dusk .wp-sky{background:linear-gradient(180deg,#5a4a9a,#ff9a5a)}.wpou.night .wp-sky{background:linear-gradient(180deg,#0e1030,#26306a)}
.wp-sun{position:absolute;width:26px;height:26px;border-radius:50%;left:46px;top:48px;background:#ffe36b;box-shadow:0 0 18px #ffd23e}
.wpou.dusk .wp-sun{top:62px;background:#ff8a3a;box-shadow:0 0 18px #ff7a2a}.wpou.night .wp-sun{background:#e8ecff;box-shadow:0 0 14px #b8c4ff;width:20px;height:20px;top:34px;left:50px;-webkit-mask:radial-gradient(circle at 70% 40%,transparent 8px,#000 9px);mask:radial-gradient(circle at 70% 40%,transparent 8px,#000 9px)}
.wp-star{position:absolute;width:3px;height:3px;border-radius:50%;background:#fff;opacity:0}.wpou.night .wp-star{opacity:.9}
.wp-poster{position:absolute;right:18px;top:20px;width:74px;height:92px;border:5px solid #3a2414;background:#f3e2b6;border-radius:3px;display:grid;place-items:center;font-size:34px;box-shadow:0 4px 8px rgba(0,0,0,.35)}
.wp-poster small{position:absolute;bottom:4px;font-size:8.5px;font-weight:800;color:#6a3a1a;letter-spacing:.5px}
.wp-plant{position:absolute;left:14px;bottom:50px;font-size:38px}
.wp-pet{position:absolute;left:50%;bottom:38px;width:196px;margin-left:-98px;cursor:pointer;transform-origin:50% 100%}
.wp-pet .wp-svg{width:100%;display:block;overflow:visible}
.wp-pet.breathe .wp-body{animation:wpbreath 3.2s ease-in-out infinite;transform-origin:100px 190px}
@keyframes wpbreath{0%,100%{transform:scale(1,1)}50%{transform:scale(1.02,.975)}}
.wp-pet .wp-eye{animation:wpblink 4.6s infinite;transform-origin:center;transform-box:fill-box}
@keyframes wpblink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}
.wp-pet.bounce{animation:wpbounce .5s}
@keyframes wpbounce{0%{transform:translateY(0) scale(1,1)}30%{transform:translateY(-26px) scale(.95,1.06)}60%{transform:translateY(0) scale(1.06,.94)}100%{transform:translateY(0) scale(1,1)}}
.wp-chew{animation:wpchew .3s infinite alternate;transform-origin:100px 130px;transform-box:fill-box}
@keyframes wpchew{from{transform:scaleY(.55)}to{transform:scaleY(1.1)}}
.wp-dead .wp-svg{filter:grayscale(.9) brightness(.8)}
.wp-dark{position:absolute;inset:0;background:rgba(6,6,28,.66);opacity:0;pointer-events:none;transition:opacity .8s}
.wpou.sleeping .wp-dark{opacity:1}
.wp-zzz{position:absolute;left:62%;top:90px;pointer-events:none;font-weight:800;color:#cfd8ff;font-size:22px;display:none}
.wpou.sleeping .wp-zzz{display:block}
.wp-zzz span{position:absolute;opacity:0;animation:wpzzz 3s infinite}.wp-zzz span:nth-child(2){animation-delay:1s;font-size:17px}.wp-zzz span:nth-child(3){animation-delay:2s;font-size:13px}
@keyframes wpzzz{0%{opacity:0;transform:translate(0,10px)}30%{opacity:1}100%{opacity:0;transform:translate(24px,-34px)}}
.wp-say{position:absolute;left:50%;top:14px;transform:translateX(-30%);max-width:46%;background:#fff;color:#2a1a14;font-weight:700;font-size:13px;padding:7px 11px;border-radius:14px;box-shadow:0 4px 10px rgba(0,0,0,.35);display:none}
.wp-say:after{content:"";position:absolute;left:22px;bottom:-8px;border:8px solid transparent;border-top-color:#fff;border-bottom:0}
.wp-say.on{display:block;animation:wppop .3s}
@keyframes wppop{from{transform:translateX(-30%) scale(.6);opacity:0}to{transform:translateX(-30%) scale(1);opacity:1}}
.wp-fly{position:absolute;left:50%;bottom:20px;font-size:38px;margin-left:-19px;pointer-events:none;animation:wpfly .8s ease-in forwards}
@keyframes wpfly{0%{transform:translate(0,0) scale(1);opacity:1}70%{transform:translate(0,-120px) scale(.8);opacity:1}100%{transform:translate(0,-130px) scale(.2);opacity:0}}
.wp-bub{position:absolute;pointer-events:none;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,rgba(190,235,255,.55));border:1px solid rgba(255,255,255,.7);animation:wpbub 1s ease-out forwards}
@keyframes wpbub{to{transform:translateY(-40px) scale(1.4);opacity:0}}
.wp-pop{position:absolute;pointer-events:none;font-weight:800;font-size:16px;color:#ffe27a;text-shadow:0 1px 3px #000;animation:wppopup 1.1s ease-out forwards}
@keyframes wppopup{to{transform:translateY(-46px);opacity:0}}
.wp-nav{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:10px 8px 4px}
.wp-nav button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 2px;border-radius:12px;border:1px solid #4a382c;background:#241a14;color:#e8dccd;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer}
.wp-nav button span{font-size:21px;line-height:1.1}
.wp-nav button.on{background:linear-gradient(180deg,#5a3e1e,#3a2812);border-color:#d4af37;color:#ffe9a8}
.wp-panel{padding:6px 10px 12px;min-height:120px}
.wp-hint{font-size:13px;color:#cdbdae;text-align:center;margin:6px 4px}
.wp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.wp-card{display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 4px;border-radius:12px;border:1px solid #4a382c;background:#221913;color:#f3ede6;font-family:inherit;cursor:pointer;text-align:center}
.wp-card span{font-size:28px;line-height:1.1}.wp-card b{font-size:12.5px}.wp-card small{font-size:11px;color:#b9a99a}.wp-card em{font-style:normal;font-size:12px;font-weight:800;color:#f6d36b}
.wp-card[disabled]{opacity:.45;cursor:default}.wp-card.on{border-color:#d4af37;background:#2f2410}
.wp-btn{display:block;width:100%;margin-top:8px;padding:12px 16px;border:0;border-radius:12px;background:linear-gradient(180deg,#14b866,#0b8a4b);color:#fff;font-weight:800;font-size:15px;cursor:pointer;font-family:inherit;box-shadow:0 3px 0 #06562e}
.wp-btn.gold{background:linear-gradient(180deg,#f1cf6a,#c9961f);color:#2a1d00;box-shadow:0 3px 0 #7a5a10}.wp-btn.ghost{background:#2a1f18;color:#ddd;box-shadow:0 3px 0 #120c08}
.wp-btn[disabled]{opacity:.5;cursor:default}
.wp-toast{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:30;max-width:92%;padding:9px 15px;border-radius:12px;font-size:13.5px;font-weight:800;color:#fff;background:#0b8a4b;box-shadow:0 8px 24px rgba(0,0,0,.5);text-align:center;animation:wppop2 .25s ease-out}
.wp-toast.err{background:#b3261e}.wp-toast.gold{background:linear-gradient(180deg,#f1cf6a,#c9961f);color:#2a1d00}
@keyframes wppop2{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
.wp-over{position:absolute;inset:0;z-index:25;background:rgba(14,10,8,.94);padding:14px 14px 18px;overflow:auto;text-align:center}
.wp-over .t{font-size:22px;font-weight:800;color:#f6e7bd;margin:6px 0}
.wp-over p{margin:6px 0;font-size:13.5px;color:#d8cbbd}
.wp-box{margin:10px auto 0;max-width:400px;text-align:left;background:#201712;border:1px solid #3d2e24;border-radius:12px;padding:10px 12px;font-size:13px;color:#d8cbbd}
.wp-box b{color:#f1cf6a}.wp-box ul{margin:6px 0 0;padding-left:18px}.wp-box li{margin:3px 0}
.wp-rw{display:flex;justify-content:space-between;gap:8px;padding:6px 10px;margin-top:6px;background:#201712;border:1px solid #3d2e24;border-radius:10px;font-size:13px;text-align:left}
.wp-rw.got{border-color:#d4af37;background:#2b2511}.wp-rw em{font-style:normal;color:#f1cf6a;font-weight:800;white-space:nowrap}
.wp-mg{position:absolute;inset:0;z-index:20;background:#16110f;display:flex;flex-direction:column;padding:8px}
.wp-mg canvas{width:100%;flex:1;min-height:0;border-radius:12px;background:#1d1510;touch-action:none;display:block}
.wp-mgh{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:2px 2px 8px;font-size:13.5px;font-weight:700}
`;
function injectCss() {
  if (document.getElementById("wp-css")) return;
  const s = document.createElement("style"); s.id = "wp-css"; s.textContent = CSS; document.head.appendChild(s);
}

/* ---------- gra ---------- */
function start(stage, ctx) {
  injectCss();
  P = load();
  if (P) { advance(P, Date.now()); save(); }
  const root = h("div", { class: "wpou" });
  stage.append(root);
  let alive = true, tab = "feed", eating = false, tapUntil = 0, washP = 0, lastKey = "", claiming = false, nextTry = 0, failShown = false, mg = null, lastSave = 0, lastSay = "", lastSayAt = 0;
  const closeBtn = h("button", { class: "wp-ib", type: "button", "aria-label": "Zamknij" }, "✕");
  const sndBtn = h("button", { class: "wp-ib", type: "button", "aria-label": "Dźwięk" }, P && !P.sound ? "🔇" : "🔊");
  const nameEl = h("div", { class: "wp-name" });
  const coinsEl = h("div", { class: "wp-coins" });
  root.append(h("div", { class: "wp-top" }, nameEl, coinsEl, sndBtn, closeBtn));
  const statEls = {};
  const stats = h("div", { class: "wp-stats" });
  [["hunger", "🍕"], ["hygiene", "🧼"], ["energy", "⚡"], ["fun", "😊"]].forEach(([k, ic]) => {
    const b = h("b"), bar = h("div", { class: "wp-bar" }, b); statEls[k] = { bar, b };
    stats.append(h("div", { class: "wp-st", title: STAT_LBL[k] }, h("i", null, ic), bar));
  });
  root.append(stats);
  const careB = h("b"), careTxt = h("span");
  root.append(h("div", { class: "wp-care" }, h("span", null, "❤️"), h("div", { class: "wp-bar hp", style: "max-width:64px" }, (statEls.health = { b: h("b"), bar: null }).b), h("span", null, "🏅"), careTxt));
  const care = h("div", { class: "wp-bar", style: "flex:1" }, careB);
  root.lastChild.insertBefore(care, careTxt);
  /* scena */
  const pet = h("div", { class: "wp-pet breathe" });
  const say = h("div", { class: "wp-say" });
  const scene = h("div", { class: "wp-scene" },
    h("div", { class: "wp-wall" }), h("div", { class: "wp-floor" }),
    h("div", { class: "wp-win" }, h("div", { class: "wp-sky" }), h("div", { class: "wp-sun" }), h("i", { class: "wp-star", style: "left:12px;top:10px" }), h("i", { class: "wp-star", style: "left:56px;top:18px" }), h("i", { class: "wp-star", style: "left:30px;top:40px" }), h("i", { class: "wp-star", style: "left:60px;top:62px" })),
    h("div", { class: "wp-poster" }, "🍕", h("small", null, "WŁOSKA ROBOTA")), h("div", { class: "wp-plant" }, "🌵"),
    pet, say, h("div", { class: "wp-dark" }), h("div", { class: "wp-zzz" }, h("span", null, "Z"), h("span", null, "z"), h("span", null, "z")));
  root.append(scene);
  const nav = h("div", { class: "wp-nav" });
  const TABS = [["feed", "🍴", "Jedz"], ["wash", "🛁", "Myj"], ["play", "🎮", "Baw"], ["sleep", "💡", "Śpij"], ["wear", "👒", "Szafa"]];
  const navBtns = {};
  TABS.forEach(([id, ic, lb]) => { const b = h("button", { type: "button", "data-t": id }, h("span", null, ic), lb); navBtns[id] = b; nav.append(b); });
  root.append(nav);
  const panel = h("div", { class: "wp-panel" });
  root.append(panel);

  /* pomocnicze UI */
  function toast(msg, cls, ms) {
    const t = h("div", { class: "wp-toast " + (cls || "") }, msg); root.append(t); setTimeout(() => t.remove(), ms || 2400);
  }
  function floatText(txt, x, y) { const e = h("div", { class: "wp-pop", style: "left:" + x + "px;top:" + y + "px" }, txt); scene.append(e); setTimeout(() => e.remove(), 1100); }
  function over(html, buttons) {
    const o = h("div", { class: "wp-over" }); o.innerHTML = html;
    buttons.forEach((b) => { const e = h("button", { class: "wp-btn " + (b.cls || ""), type: "button" }, b.label); e.addEventListener("click", () => { o.remove(); b.on(); }); o.append(e); });
    root.append(o); return o;
  }
  const rewardsHtml = () => '<div class="wp-box"><b>Nagrody za opiekę</b>' + MILESTONES.map((m, i) => '<div class="wp-rw' + ((P && (P && P.award[i])) ? " got" : "") + '"><span>' + (m / 24) + " dni dobrej opieki (łącznie " + m + ' h)</span><em>' + ((P && (P && P.award[i])) ? "✓ odebrano" : "+1 pkt") + "</em></div>").join("") + "</div>";

  /* ---- ekrany ---- */
  function introScreen() {
    over('<div style="font-size:54px">🥚</div><div class="t">Pizzak potrzebuje domu</div>' +
      "<p>Zaopiekuj się swoim własnym Pizzakiem. Czas płynie <b>naprawdę</b> — także wtedy, gdy zamkniesz stronę.</p>" +
      '<div class="wp-box"><b>Jak to działa</b><ul><li>Karm 🍴, myj 🛁, baw 🎮 i kładź spać 💡 — nic samo się nie zrobi.</li><li>Pizzak robi się głodny, brudny, śpiący i smutny z godziny na godzinę.</li><li>Zaniedbany zbyt długo — odchodzi na zawsze i zaczynasz od jajka.</li><li>Za gry dostajesz monety na jedzenie i ubranka.</li></ul></div>' + rewardsHtml(),
      [{ label: "🐣 Wykluj Pizzaka", cls: "gold", on: () => { P = fresh(null); save(); lastKey = ""; render(true); } }, { label: "Zamknij", cls: "ghost", on: close }]);
  }
  function deadScreen() {
    over('<div style="font-size:54px">💀</div><div class="t">Pizzak odszedł…</div>' +
      "<p>Przeżył <b>" + fmtAge(P.diedAt - P.born) + "</b>. Zabrakło opieki — głód, brud i zmęczenie zrobiły swoje.</p><p>Rekord: <b>" + fmtAge(P.best) + "</b> · to było jego życie nr " + P.lives + ".</p>" + rewardsHtml(),
      [{ label: "🐣 Nowy Pizzak", cls: "gold", on: () => { P = fresh(P); save(); lastKey = ""; render(true); } }, { label: "Zamknij", cls: "ghost", on: close }]);
  }
  function close() { cleanup(); ctx.close(); }
  function cleanup() { if (!alive) return; alive = false; clearInterval(timer); if (mg) mg.stop(); if (P) { advance(P, Date.now()); save(); } }

  /* ---- panele ---- */
  function renderPanel() {
    panel.innerHTML = "";
    Object.keys(navBtns).forEach((k) => navBtns[k].classList.toggle("on", k === tab));
    if (!P || P.dead) return;
    if (tab === "feed") {
      panel.append(h("div", { class: "wp-hint" }, "Wybierz jedzenie (płacisz monetami)."));
      const g = h("div", { class: "wp-grid" });
      FOODS.forEach((f) => {
        const eff = Object.keys(f.e).filter((k) => f.e[k] > 0).map((k) => "+" + f.e[k] + " " + STAT_LBL[k]).slice(0, 2).join(", ");
        const b = h("button", { class: "wp-card", type: "button", disabled: P.coins < f.c ? true : null }, h("span", null, f.ic), h("b", null, f.n), h("small", null, eff), h("em", null, f.c + " 💰"));
        b.addEventListener("click", () => feed(f)); g.append(b);
      });
      panel.append(g);
    } else if (tab === "wash") {
      panel.append(h("div", { class: "wp-hint", id: "wp-wash-h" }, "Przeciągaj palcem lub myszką po Pizzaku, żeby go szorować. " + (P.hygiene >= 95 ? "Jest czysty 🧼" : "Czystość: " + Math.round(P.hygiene) + "%")));
    } else if (tab === "play") {
      panel.append(h("div", { class: "wp-hint" }, "Zabawa daje monety i humor, ale kosztuje energię (min. 20%)."));
      const g = h("div", { class: "wp-grid", style: "grid-template-columns:1fr 1fr" });
      [["catch", "🧺", "Łap składniki", "Ruszaj Pizzakiem i łap, co spada. Omijaj ogień i skarpety."], ["juggle", "🍅", "Żonglerka", "Podbijaj pomidora — nie daj mu spaść."]].forEach(([id, ic, n, d]) => {
        const b = h("button", { class: "wp-card", type: "button" }, h("span", null, ic), h("b", null, n), h("small", null, d));
        b.addEventListener("click", () => startMini(id)); g.append(b);
      });
      panel.append(g);
    } else if (tab === "sleep") {
      const eta = P.sleeping ? Math.max(0, (100 - P.energy) / 14) : 0;
      panel.append(h("div", { class: "wp-hint" }, P.sleeping ? "Pizzak śpi. Pełna energia za ok. " + (eta < 1 ? Math.ceil(eta * 60) + " min" : eta.toFixed(1) + " h") + "." : "Śpiący Pizzak odzyskuje energię (ok. 14% na godzinę), ale w tym czasie nic nie robisz."));
      const b = h("button", { class: "wp-btn " + (P.sleeping ? "gold" : "") , type: "button" }, P.sleeping ? "☀️ Obudź Pizzaka" : "🌙 Zgaś światło");
      b.addEventListener("click", () => { P.sleeping = !P.sleeping; if (P.sleeping) { addXp(2); SFX.ok(); } else SFX.pop(); save(); render(true); });
      panel.append(b);
    } else if (tab === "wear") {
      panel.append(h("div", { class: "wp-hint" }, "Poziom Pizzaka: " + level() + " · kolejne ubranka odblokowują się z poziomem."));
      const g = h("div", { class: "wp-grid" });
      const none = h("button", { class: "wp-card" + (!P.hat ? " on" : ""), type: "button" }, h("span", null, "🚫"), h("b", null, "Bez dodatków"));
      none.addEventListener("click", () => { P.hat = ""; save(); render(true); }); g.append(none);
      HATS.forEach((x) => {
        const own = P.owned.indexOf(x.id) >= 0, locked = level() < x.lv;
        const ic = { chef: "👨‍🍳", bandana: "🏴‍☠️", shades: "🕶️", stache: "🧔", crown: "👑" }[x.id];
        const b = h("button", { class: "wp-card" + (P.hat === x.id ? " on" : ""), type: "button", disabled: !own && (locked || P.coins < x.c) ? true : null }, h("span", null, ic), h("b", null, x.n), h("small", null, locked && !own ? "poziom " + x.lv : own ? (P.hat === x.id ? "założone" : "masz to") : ""), own ? null : h("em", null, x.c + " 💰"));
        b.addEventListener("click", () => { if (!own) { if (P.coins < x.c || locked) return; P.coins -= x.c; P.owned.push(x.id); SFX.coin(); } P.hat = x.id; addXp(2); save(); render(true); });
        g.append(b);
      });
      panel.append(g);
    }
  }
  Object.keys(navBtns).forEach((k) => navBtns[k].addEventListener("click", () => { tab = k; SFX.pop(); renderPanel(); }));

  /* ---- akcje ---- */
  function feed(f) {
    if (!P || P.dead) return;
    if (P.sleeping) { toast("Pizzak śpi — najpierw go obudź.", "err"); return; }
    if (eating) return;
    if (P.hunger >= 95) { toast("Pizzak jest pełny!", "err"); return; }
    if (P.coins < f.c) { toast("Za mało monet.", "err"); return; }
    P.coins -= f.c; eating = true; SFX.eat();
    const fl = h("div", { class: "wp-fly" }, f.ic); scene.append(fl); setTimeout(() => fl.remove(), 850);
    setTimeout(() => {
      for (const k in f.e) P[k] = clamp(P[k] + f.e[k], 0, 100);
      P.health = clamp(P.health + (f.e.health || 0), 0, 100);
      addXp(3); save(); floatText("+" + f.e.hunger + " 🍕", scene.clientWidth / 2 - 20, 90);
      setTimeout(() => { eating = false; render(true); }, 900); render(true);
    }, 800);
    renderPanel();
  }
  pet.addEventListener("pointerdown", () => {
    if (!P || P.dead) return;
    if (P.sleeping) { toast("Ciii… Pizzak śpi.", "err", 1400); return; }
    if (tab === "wash") return;
    tapUntil = Date.now() + 500; pet.classList.remove("bounce"); void pet.offsetWidth; pet.classList.add("bounce"); SFX.giggle();
    P.pets = (P.pets || 0) + 1;
    if (Date.now() - (P.petAt || 0) > 20000) { P.petAt = Date.now(); P.fun = clamp(P.fun + 2, 0, 100); }
    render(true);
  });
  /* mycie */
  let lastPt = null;
  scene.addEventListener("pointerdown", (e) => { lastPt = pt(e); });
  scene.addEventListener("pointerup", () => { lastPt = null; });
  scene.addEventListener("pointerleave", () => { lastPt = null; });
  function pt(e) { const r = scene.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  scene.addEventListener("pointermove", (e) => {
    if (tab !== "wash" || !P || P.dead || !lastPt) return;
    if (P.sleeping) return;
    const p = pt(e), d = Math.hypot(p.x - lastPt.x, p.y - lastPt.y); lastPt = p;
    const pr = pet.getBoundingClientRect(), sr = scene.getBoundingClientRect();
    const inside = e.clientX > pr.left + 20 && e.clientX < pr.right - 20 && e.clientY > pr.top + 20 && e.clientY < pr.bottom;
    if (!inside) return;
    const bub = h("div", { class: "wp-bub", style: "left:" + (p.x - 8) + "px;top:" + (p.y - 8) + "px;width:" + rnd(10, 22) + "px;height:" + rnd(10, 22) + "px" }); scene.append(bub); setTimeout(() => bub.remove(), 1000);
    if (P.hygiene >= 99) return;
    washP += d / 5.5; if (Math.random() < .2) SFX.pop();
    if (washP >= 100) { washP = 0; P.hygiene = clamp(P.hygiene + 30, 0, 100); addXp(4); SFX.ok(); floatText("✨ czysto!", p.x - 20, p.y - 20); save(); render(true); }
  });

  /* ---- mini-gry ---- */
  function startMini(id) {
    if (!P || P.dead) return;
    if (P.sleeping) { toast("Pizzak śpi — najpierw go obudź.", "err"); return; }
    if (P.energy < 20) { toast("Pizzak jest za zmęczony na zabawę.", "err"); return; }
    if (P.hunger < 10) { toast("Pizzak jest zbyt głodny, żeby się bawić.", "err"); return; }
    const box = h("div", { class: "wp-mg" });
    const scoreEl = h("b", null, "0"), livesEl = h("span");
    const hd = h("div", { class: "wp-mgh" }, h("span", null, id === "catch" ? "🧺 Łap składniki" : "🍅 Żonglerka"), h("span", null, "Wynik: ", scoreEl), livesEl);
    const cv = h("canvas"); box.append(hd, cv); root.append(box);
    cv.width = 360; cv.height = 460;
    const c = cv.getContext("2d");
    let raf = 0, last = performance.now(), score = 0, over_ = false, t = 0;
    const W = 360, H = 460;
    const S = { x: W / 2, tx: W / 2, items: [], spawn: 0.6, lives: 3, ball: { x: W / 2, y: 120, vx: 0, vy: 0 }, flash: 0, parts: [] };
    function pos(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
    cv.addEventListener("pointermove", (e) => { S.tx = clamp(pos(e).x, 36, W - 36); });
    cv.addEventListener("pointerdown", (e) => {
      const p = pos(e); S.tx = clamp(p.x, 36, W - 36);
      if (id === "juggle" && !over_) {
        const b = S.ball;
        if (Math.hypot(p.x - b.x, p.y - b.y) < 46) { score++; b.vy = -rnd(560, 640); b.vx = clamp((b.x - p.x) * 7 + rnd(-50, 50), -260, 260); SFX.pop(); scoreEl.textContent = score; for (let i = 0; i < 8; i++) S.parts.push({ x: b.x, y: b.y, vx: rnd(-90, 90), vy: rnd(-90, 40), l: .5, t: 0 }); }
      }
    });
    livesEl.textContent = id === "catch" ? "❤️❤️❤️" : "";
    const GOOD = ["🧀", "🍅", "🍄", "🌽", "🌿"], BAD = ["🔥", "🧦"];
    function pizzak(x, y, s, face) {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.fillStyle = "#e6b25c"; c.strokeStyle = "#a96d22"; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 36, 0, 7); c.fill(); c.stroke();
      c.fillStyle = "#d64a2e"; c.beginPath(); c.arc(0, 0, 30, 0, 7); c.fill(); c.fillStyle = "#f7d56e"; c.beginPath(); c.arc(0, 0, 27, 0, 7); c.fill();
      c.fillStyle = "#fff"; c.strokeStyle = "#2a1a14"; c.lineWidth = 1.5; [-12, 12].forEach((ex) => { c.beginPath(); c.ellipse(ex, -4, 5.5, 6.5, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = "#241612"; c.beginPath(); c.arc(ex + 1, -3, 3, 0, 7); c.fill(); c.fillStyle = "#fff"; });
      c.strokeStyle = "#2a1a14"; c.lineWidth = 2.2; c.lineCap = "round"; c.beginPath(); if (face === "sad") c.arc(0, 18, 8, 3.5, 5.9); else c.arc(0, 9, 9, .3, Math.PI - .3); c.stroke();
      c.restore();
    }
    function finish() {
      if (over_) return; over_ = true; cancelAnimationFrame(raf);
      const coins = id === "catch" ? Math.min(15, Math.floor(score / 4)) : Math.min(12, Math.floor(score / 5));
      P.coins += coins; P.fun = clamp(P.fun + Math.min(40, score * 2), 0, 100); P.energy = clamp(P.energy - 15, 0, 100); addXp(Math.floor(score / 2)); P.hygiene = clamp(P.hygiene - 3, 0, 100);
      P.mgBest = P.mgBest || {}; if (score > (P.mgBest[id] || 0)) P.mgBest[id] = score; save();
      if (coins) SFX.win(); else SFX.bad();
      const o = h("div", { class: "wp-over" }); o.innerHTML = '<div style="font-size:48px">' + (coins ? "🎉" : "😅") + '</div><div class="t">Wynik: ' + score + '</div><p>Monety: <b>+' + coins + ' 💰</b> · humor +' + Math.min(40, score * 2) + " · energia −15</p><p>Rekord: <b>" + P.mgBest[id] + "</b></p>";
      const again = h("button", { class: "wp-btn", type: "button" }, "↻ Jeszcze raz"), back = h("button", { class: "wp-btn ghost", type: "button" }, "Wróć do Pizzaka");
      again.addEventListener("click", () => { box.remove(); mg = null; if (P.energy >= 20 && P.hunger >= 10) startMini(id); else { toast("Pizzak potrzebuje odpoczynku.", "err"); render(true); } });
      back.addEventListener("click", () => { box.remove(); mg = null; render(true); });
      o.append(again, back); box.append(o);
    }
    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (!alive) { cancelAnimationFrame(raf); return; }
      if (document.hidden || over_) { last = now; return; }
      const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
      S.x += (S.tx - S.x) * Math.min(1, dt * 14);
      S.parts.forEach((p) => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; }); S.parts = S.parts.filter((p) => p.t < p.l);
      if (S.flash > 0) S.flash -= dt;
      const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#3a2418"); bg.addColorStop(1, "#1d120c"); c.fillStyle = bg; c.fillRect(0, 0, W, H);
      c.fillStyle = "#6a4528"; c.fillRect(0, H - 40, W, 40);
      if (id === "catch") {
        S.spawn -= dt;
        if (S.spawn <= 0) {
          const bad = Math.random() < Math.min(.45, .2 + score * .006), gold = !bad && Math.random() < .07;
          S.items.push({ x: rnd(24, W - 24), y: -20, vy: rnd(120, 170) + score * 3.6, e: bad ? pick(BAD) : gold ? "💰" : pick(GOOD), bad, gold, w: rnd(0, 6) });
          S.spawn = Math.max(.32, .85 - score * .012) * rnd(.8, 1.2);
        }
        for (let i = S.items.length - 1; i >= 0; i--) {
          const it = S.items[i]; it.y += it.vy * dt; it.x += Math.sin(t * 3 + it.w) * 22 * dt;
          const hit = it.y > H - 100 && it.y < H - 30 && Math.abs(it.x - S.x) < 40;
          if (hit) {
            S.items.splice(i, 1);
            if (it.bad) { S.lives--; S.flash = .3; SFX.bad(); livesEl.textContent = "❤️".repeat(Math.max(0, S.lives)) + "🖤".repeat(3 - Math.max(0, S.lives)); if (S.lives <= 0) { finish(); } }
            else { score += it.gold ? 4 : 1; scoreEl.textContent = score; it.gold ? SFX.coin() : SFX.pop(); }
          } else if (it.y > H + 20) S.items.splice(i, 1);
        }
        c.font = "30px system-ui,Apple Color Emoji,Segoe UI Emoji,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        S.items.forEach((it) => c.fillText(it.e, it.x, it.y));
        pizzak(S.x, H - 62, 1.15, S.flash > 0 ? "sad" : "ok");
        c.fillStyle = "#8a5a2c"; c.fillRect(S.x - 40, H - 28, 80, 6);
      } else {
        const b = S.ball, g = 900 + score * 14;
        b.vy += g * dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < 24) { b.x = 24; b.vx = Math.abs(b.vx); } if (b.x > W - 24) { b.x = W - 24; b.vx = -Math.abs(b.vx); }
        if (b.y < 24) { b.y = 24; b.vy = Math.abs(b.vy) * .5; }
        if (b.y > H - 50) { finish(); }
        pizzak(W / 2, H - 70, 1.25, "ok");
        c.font = "46px system-ui,Apple Color Emoji,Segoe UI Emoji,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.save(); c.translate(b.x, b.y); c.rotate(t * (b.vx / 80)); c.fillText("🍅", 0, 0); c.restore();
        if (!score) { c.font = "600 15px system-ui,sans-serif"; c.fillStyle = "#f1cf6a"; c.fillText("Dotknij pomidora, zanim spadnie!", W / 2, 200); }
      }
      c.fillStyle = "#ffe27a"; S.parts.forEach((p) => { c.globalAlpha = 1 - p.t / p.l; c.fillRect(p.x, p.y, 4, 4); }); c.globalAlpha = 1;
      if (S.flash > 0) { c.fillStyle = "rgba(255,60,20," + S.flash + ")"; c.fillRect(0, 0, W, H); }
    }
    mg = { stop() { cancelAnimationFrame(raf); over_ = true; } };
    raf = requestAnimationFrame(loop);
  }

  /* ---- renderowanie stanu ---- */
  function say_(txt) { if (txt === lastSay && Date.now() - lastSayAt < 20000) return; if (!txt) { say.classList.remove("on"); lastSay = ""; return; } lastSay = txt; lastSayAt = Date.now(); say.textContent = txt; say.classList.remove("on"); void say.offsetWidth; say.classList.add("on"); }
  function render(force) {
    if (!alive || !P) return;
    const hr = new Date().getHours();
    root.classList.remove("day", "dusk", "night"); root.classList.add(hr >= 7 && hr < 18 ? "day" : hr >= 18 && hr < 21 ? "dusk" : "night");
    root.classList.toggle("sleeping", !!P.sleeping);
    const now = Date.now(), age = (P.dead ? P.diedAt : now) - P.born;
    nameEl.innerHTML = "Pizzak · poz. " + level() + "<small>wiek: " + fmtAge(age) + (P.lives > 1 ? " · życie nr " + P.lives : "") + "</small>";
    coinsEl.textContent = Math.floor(P.coins) + " 💰";
    ["hunger", "hygiene", "energy", "fun"].forEach((k) => { const v = P[k], e = statEls[k]; e.b.style.width = v + "%"; e.bar.className = "wp-bar" + (v < 25 ? " low" : v < 50 ? " mid" : ""); });
    statEls.health.b.style.width = P.health + "%";
    const th = P.thrive / HOUR; let nextM = MILESTONES.find((m, i) => !P.award[i]);
    careB.style.width = nextM ? clamp(th / nextM * 100, 0, 100) + "%" : "100%";
    careTxt.textContent = nextM ? Math.floor(th) + " / " + nextM + " h opieki" : "komplet nagród!";
    const mood = P.dead ? "dead" : moodOf();
    const key = mood + "|" + (eating ? 1 : 0) + "|" + P.hat + "|" + P.owned.length + "|" + Math.round(clamp((60 - P.hygiene) / 60, 0, 1) * 8) + "|" + (Date.now() < tapUntil ? 1 : 0);
    if (force || key !== lastKey) { pet.innerHTML = petSvg(mood, eating, Date.now() < tapUntil); lastKey = key; pet.classList.toggle("wp-dead", mood === "dead"); }
    /* podpowiedź w dymku */
    let msg = "";
    if (!P.dead && !P.sleeping) {
      const need = [["hunger", "Jestem głodny! 🍕"], ["hygiene", "Potrzebuję kąpieli! 🧼"], ["energy", "Jestem śpiący… 💤"], ["fun", "Nudzę się… pobawmy się!"]].filter((n) => P[n[0]] < 25).sort((a, b) => P[a[0]] - P[b[0]])[0];
      if (need) msg = need[1]; else if (P.health < 40) msg = "Nie czuję się dobrze…";
    }
    say_(msg);
    if (P.dead && !root.querySelector(".wp-over")) deadScreen();
    if (!force) { const sub = panel.querySelector("#wp-wash-h"); if (sub) sub.textContent = "Przeciągaj palcem lub myszką po Pizzaku, żeby go szorować. " + (P.hygiene >= 95 ? "Jest czysty 🧼" : "Czystość: " + Math.round(P.hygiene) + "%"); }
    if (force) renderPanel();
  }

  /* ---- nagrody za opiekę ---- */
  async function checkAward() {
    if (!P || P.dead || claiming || Date.now() < nextTry) return;
    const th = P.thrive / HOUR, i = MILESTONES.findIndex((m, k) => !P.award[k] && th >= m);
    if (i < 0) return;
    const today = utcDay(Date.now());
    if (P.capDay === today) return;
    if (P.day.d !== today) P.day = { d: today, n: 0 };
    if (P.day.n >= DAILY_MAX) return;
    claiming = true;
    try {
      const r = await ctx.award(1);
      if (r && r.ok) { P.award[i] = 1; P.day.n++; const bonus = 40 * (i + 1); P.coins += bonus; save(); SFX.win(); toast("🏅 " + MILESTONES[i] / 24 + " dni opieki! " + (r.msg || "+1 pkt") + " (+" + bonus + " 💰)", "gold", 4200); render(true); }
      else { if (r && r.cap) P.capDay = today; nextTry = Date.now() + (r && r.wait ? 31000 : 120000); if (r && r.msg && !failShown) { failShown = true; toast(r.msg, "err", 3600); } }
    } catch (e) { nextTry = Date.now() + 120000; }
    claiming = false;
  }

  /* ---- start ---- */
  closeBtn.addEventListener("click", close);
  sndBtn.addEventListener("click", () => { if (!P) return; P.sound = P.sound ? 0 : 1; sndBtn.textContent = P.sound ? "🔊" : "🔇"; save(); SFX.pop(); });
  const timer = setInterval(() => {
    if (!root.isConnected) { cleanup(); return; }
    if (!P || document.hidden) return;
    const was = P.dead; advance(P, Date.now());
    if (!was && P.dead) { SFX.bad(); save(); }
    render(false); checkAward();
    if (Date.now() - lastSave > 5000) { lastSave = Date.now(); save(); }
    if (tab === "sleep" && !P.sleeping && panel.textContent.indexOf("Obudź") >= 0) renderPanel();
  }, 1000);
  if (!P || !P.started) { P = null; nameEl.textContent = "Pizzak"; introScreen(); }
  else {
    render(true);
    const td = utcDay(Date.now());
    if (!P.dead && P.bonusDay !== td) { P.bonusDay = td; P.coins += 10; save(); setTimeout(() => toast("🎁 Dzienna premia: +10 💰", "gold", 3200), 600); }
  }
}

window.WRGames.register({ id: "pou", icon: "🍕", name: "Pizzak — Twój zwierzak", desc: "Karm, myj, baw i usypiaj Pizzaka. Punkty za dni dobrej opieki.", start });
})();
