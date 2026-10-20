/* =====================================================================
   Włoska Robota — gra "Kopalnia" (sandbox 3D z blokami: survival / hardcore / creative)
   Samodzielny plik: rejestruje się w WRGames. Własny silnik WebGL, wszystkie tekstury rysowane kodem.
   Świat zapisuje się w przeglądarce (IndexedDB). Punkty (tylko admin): wyłącznie za przetrwanie w trybie hardcore.
   ===================================================================== */
(function () {
"use strict";
if (window.__kopLoaded) return;
if (!window.WRGames || typeof window.WRGames.register !== "function") { setTimeout(function(){ if (window.WRGames && !window.__kopLoaded) { var s = document.createElement("script"); s.src = "/gry-kopalnia.js?v=1"; document.head.appendChild(s); } }, 800); return; }
window.__kopLoaded = true;

/* ---------- stałe ---------- */
const CS = 16, WH = 64, SEA = 22, DAY_LEN = 24000;
const CSQ = CS * CS, CVOL = CSQ * WH;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fl = Math.floor;

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash2(x, z, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function hash3(x, y, z, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 1103515245) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vn2(x, z, s) {
  const xi = fl(x), zi = fl(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function vn3(x, y, z, s) {
  const xi = fl(x), yi = fl(y), zi = fl(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const a = lerp(lerp(hash3(xi, yi, zi, s), hash3(xi + 1, yi, zi, s), u), lerp(hash3(xi, yi + 1, zi, s), hash3(xi + 1, yi + 1, zi, s), u), v);
  const b = lerp(lerp(hash3(xi, yi, zi + 1, s), hash3(xi + 1, yi, zi + 1, s), u), lerp(hash3(xi, yi + 1, zi + 1, s), hash3(xi + 1, yi + 1, zi + 1, s), u), v);
  return lerp(a, b, w);
}
function fbm2(x, z, s, oct) { let a = 0, amp = 1, f = 1, t = 0; for (let i = 0; i < oct; i++) { a += vn2(x * f, z * f, s + i * 31) * amp; t += amp; amp *= 0.5; f *= 2; } return a / t; }

function h(tag, attrs) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k === "html") e.innerHTML = v; else if (k === "style") e.style.cssText = v; else e.setAttribute(k, v === true ? "" : v); }
  for (let i = 2; i < arguments.length; i++) { const c = arguments[i]; if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- macierze (kolumnowe) ---------- */
function mPersp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
/* widok bez przesunięcia (renderujemy względem kamery): yaw 0 = patrzy w -Z */
function mView(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const fx = -sy * cp, fy = sp, fz = -cy * cp, rx = cy, ry = 0, rz = -sy;
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const m = new Float32Array(16);
  m[0] = rx; m[1] = ux; m[2] = -fx; m[4] = ry; m[5] = uy; m[6] = -fy; m[8] = rz; m[9] = uz; m[10] = -fz; m[15] = 1;
  return m;
}
function mMul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }

/* ---------- dźwięk (syntezowany) ---------- */
const SFX = (function () {
  let ac = null, on = true, master = null, nbuf = null;
  function ctx() {
    if (!on) return null;
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
        nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ac = null; on = false; return null; }
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function noise(dur, freq, q, vol, type) {
    const a = ctx(); if (!a) return; const t = a.currentTime;
    const s = a.createBufferSource(); s.buffer = nbuf; s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = a.createBiquadFilter(); f.type = type || "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5, dur + 0.05);
  }
  function tone(f0, f1, dur, vol, type) {
    const a = ctx(); if (!a) return; const t = a.currentTime;
    const o = a.createOscillator(); o.type = type || "square"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  const MAT = { stone: [700, 1.2], dirt: [260, 0.9], grass: [420, 0.8], wood: [380, 3], sand: [1500, 0.7], glass: [3200, 4], cloth: [300, 0.5], metal: [1800, 5], snow: [900, 0.6], water: [1200, 0.8] };
  return {
    set(v) { on = !!v; if (!on && ac) { try { master.gain.value = 0; } catch (e) {} } else if (ac) master.gain.value = 0.5; },
    init() { ctx(); },
    dig(m) { const p = MAT[m] || MAT.stone; noise(0.16, p[0], p[1], 0.5); if (m === "glass") tone(2400, 1200, 0.1, 0.07, "triangle"); },
    brk(m) { const p = MAT[m] || MAT.stone; noise(0.3, p[0] * 0.8, p[1], 0.7); },
    step(m) { const p = MAT[m] || MAT.stone; noise(0.07, p[0] * 0.9, p[1], 0.14); },
    put(m) { const p = MAT[m] || MAT.stone; noise(0.1, p[0] * 0.7, p[1], 0.35); },
    hurt() { tone(220, 70, 0.2, 0.22, "sawtooth"); noise(0.12, 500, 1, 0.3); },
    hit() { noise(0.1, 900, 1, 0.35); },
    eat() { noise(0.06, 1100, 2, 0.35); setTimeout(() => noise(0.06, 900, 2, 0.35), 110); },
    pop() { tone(500, 900, 0.06, 0.12, "sine"); },
    click() { tone(800, 600, 0.04, 0.08, "square"); },
    splash() { noise(0.3, 1400, 0.6, 0.4, "highpass"); },
    boom() { noise(0.9, 160, 0.5, 1.0, "lowpass"); tone(90, 30, 0.7, 0.35, "sawtooth"); },
    fuse() { noise(0.5, 3500, 1, 0.1, "highpass"); },
    bow() { tone(180, 90, 0.12, 0.2, "triangle"); noise(0.1, 2500, 1, 0.12, "highpass"); },
    mob(k) { const f = { pig: 190, cow: 110, sheep: 260, chicken: 700, zombie: 90, skeleton: 400, spider: 600 }[k] || 200; tone(f, f * 0.7, 0.22, 0.12, k === "chicken" ? "square" : "sawtooth"); },
    die() { tone(300, 40, 0.8, 0.3, "sawtooth"); },
    lvl() { tone(500, 1000, 0.12, 0.15, "triangle"); setTimeout(() => tone(800, 1400, 0.15, 0.15, "triangle"), 100); },
    close() { try { if (ac) ac.close(); } catch (e) {} ac = null; }
  };
})();
/* ===================== BLOKI ===================== */
const BLK = [], BID = {};
function DB(key, name, o) {
  const b = Object.assign({ key, name, solid: 1, opq: 1, lop: 15, hard: 1, tool: "", req: 0, tier: 0, light: 0, snd: "stone", shape: 0, tex: key, fluid: 0, rep: 0, sel: 1, fuel: 0 }, o || {});
  b.id = BLK.length; BLK.push(b); BID[key] = b.id; return b;
}
/* shape: 0 sześcian, 1 krzyż, 2 pochodnia, 3 płyta, 4 schody, 5 drzwi, 6 drabina, 7 płyn, 8 uprawa, 9 grządka, 10 kaktus, 11 łóżko, -1 nic */
DB("air", "Powietrze", { solid: 0, opq: 0, lop: 0, rep: 1, sel: 0, hard: 0, shape: -1 });
DB("stone", "Kamień", { hard: 1.5, tool: "pick", req: 1, drop: "cobble" });
DB("grass", "Blok trawy", { hard: 0.6, tool: "shovel", snd: "grass", drop: "dirt", tex: { t: "grass_top", b: "dirt", s: "grass_side" }, tint: "gt" });
DB("dirt", "Ziemia", { hard: 0.5, tool: "shovel", snd: "dirt" });
DB("cobble", "Bruk", { hard: 2, tool: "pick", req: 1 });
DB("planks_oak", "Deski dębowe", { hard: 2, tool: "axe", snd: "wood", fuel: 15 });
DB("planks_birch", "Deski brzozowe", { hard: 2, tool: "axe", snd: "wood", fuel: 15 });
DB("planks_spruce", "Deski świerkowe", { hard: 2, tool: "axe", snd: "wood", fuel: 15 });
DB("bedrock", "Podłoże skalne", { hard: -1 });
DB("sand", "Piasek", { hard: 0.5, tool: "shovel", snd: "sand", fall: 1 });
DB("gravel", "Żwir", { hard: 0.6, tool: "shovel", snd: "dirt", fall: 1, drop: "gravel_drop" });
DB("water", "Woda", { solid: 0, opq: 0, lop: 2, hard: -1, rep: 1, sel: 0, shape: 7, fluid: 1, transl: 1, snd: "water" });
DB("lava", "Lawa", { solid: 0, opq: 0, lop: 0, hard: -1, rep: 1, sel: 0, shape: 7, fluid: 2, light: 15, snd: "water" });
DB("ore_coal", "Ruda węgla", { hard: 3, tool: "pick", req: 1, drop: "coal" });
DB("ore_iron", "Ruda żelaza", { hard: 3, tool: "pick", req: 1, tier: 1 });
DB("ore_gold", "Ruda złota", { hard: 3, tool: "pick", req: 1, tier: 2 });
DB("ore_diamond", "Ruda diamentu", { hard: 3, tool: "pick", req: 1, tier: 2, drop: "diamond" });
DB("log_oak", "Pień dębu", { hard: 2, tool: "axe", snd: "wood", tex: { t: "log_oak_top", b: "log_oak_top", s: "log_oak" }, fuel: 15 });
DB("log_birch", "Pień brzozy", { hard: 2, tool: "axe", snd: "wood", tex: { t: "log_birch_top", b: "log_birch_top", s: "log_birch" }, fuel: 15 });
DB("log_spruce", "Pień świerku", { hard: 2, tool: "axe", snd: "wood", tex: { t: "log_spruce_top", b: "log_spruce_top", s: "log_spruce" }, fuel: 15 });
DB("leaves_oak", "Liście dębu", { opq: 0, lop: 1, hard: 0.2, snd: "grass", cut: 1, tint: "lf", drop: "leaf_drop" });
DB("leaves_birch", "Liście brzozy", { opq: 0, lop: 1, hard: 0.2, snd: "grass", cut: 1, tint: 0x80a755, drop: "leaf_drop" });
DB("leaves_spruce", "Liście świerku", { opq: 0, lop: 1, hard: 0.2, snd: "grass", cut: 1, tint: 0x619961, drop: "leaf_drop" });
DB("glass", "Szkło", { opq: 0, lop: 0, hard: 0.3, snd: "glass", cut: 1, drop: "none" });
DB("sandstone", "Piaskowiec", { hard: 0.8, tool: "pick", req: 1, tex: { t: "sandstone_top", b: "sandstone_top", s: "sandstone" } });
DB("snow_block", "Blok śniegu", { hard: 0.2, tool: "shovel", snd: "snow" });
DB("snow_grass", "Trawa pod śniegiem", { hard: 0.6, tool: "shovel", snd: "snow", drop: "dirt", tex: { t: "snow_block", b: "dirt", s: "snow_side" } });
DB("ice", "Lód", { opq: 0, lop: 2, hard: 0.5, tool: "pick", snd: "glass", transl: 1, drop: "none" });
DB("clay", "Glina", { hard: 0.6, tool: "shovel", snd: "dirt", drop: "clay_drop" });
DB("brick_block", "Cegły", { hard: 2, tool: "pick", req: 1, tex: "brick_wall" });
DB("obsidian", "Obsydian", { hard: 50, tool: "pick", req: 1, tier: 3 });
DB("cactus", "Kaktus", { hard: 0.4, snd: "grass", shape: 10, opq: 0, lop: 0, tex: { t: "cactus_top", b: "cactus_top", s: "cactus" }, supp: "sand" });
DB("wool", "Biała wełna", { hard: 0.8, snd: "cloth", tool: "shears" });
DB("tnt", "Dynamit", { hard: 0, snd: "grass", tex: { t: "tnt_top", b: "tnt_top", s: "tnt" } });
DB("torch", "Pochodnia", { solid: 0, opq: 0, lop: 0, hard: 0, snd: "wood", shape: 2, light: 14, tex: "torch", supp: "torch" });
DB("crafting", "Stół warsztatowy", { hard: 2.5, tool: "axe", snd: "wood", tex: { t: "crafting_top", b: "planks_oak", s: "crafting_side", f: "crafting_front" }, fuel: 15 });
DB("furnace", "Piec", { hard: 3.5, tool: "pick", req: 1, tex: { t: "furnace_top", b: "furnace_top", s: "furnace_side", f: "furnace_front" } });
DB("furnace_on", "Piec (płonie)", { hard: 3.5, tool: "pick", req: 1, light: 13, drop: "furnace", tex: { t: "furnace_top", b: "furnace_top", s: "furnace_side", f: "furnace_front_on" } });
DB("chest", "Skrzynia", { hard: 2.5, tool: "axe", snd: "wood", shape: 12, tex: { t: "chest_top", b: "chest_top", s: "chest_side", f: "chest_front" }, fuel: 15 });
DB("door_lower", "Drzwi (dół)", { opq: 0, lop: 0, hard: 3, tool: "axe", snd: "wood", shape: 5, tex: "door_lower", drop: "door_item", cut: 1 });
DB("door_upper", "Drzwi (góra)", { opq: 0, lop: 0, hard: 3, tool: "axe", snd: "wood", shape: 5, tex: "door_upper", drop: "none", cut: 1 });
DB("ladder", "Drabina", { solid: 0, opq: 0, lop: 0, hard: 0.4, tool: "axe", snd: "wood", shape: 6, tex: "ladder", cut: 1, supp: "wall", fuel: 15 });
DB("farmland", "Grządka", { opq: 0, lop: 0, hard: 0.6, tool: "shovel", snd: "dirt", shape: 9, tex: { t: "farm_dry", b: "dirt", s: "dirt" }, drop: "dirt" });
DB("wheat", "Pszenica (uprawa)", { solid: 0, opq: 0, lop: 0, hard: 0, snd: "grass", shape: 8, tex: "wheat0", cut: 1, supp: "farm", drop: "wheat_drop" });
DB("tallgrass", "Wysoka trawa", { solid: 0, opq: 0, lop: 0, hard: 0, snd: "grass", shape: 1, tex: "tallgrass", cut: 1, rep: 1, tint: "gc", supp: "soil", drop: "seed_drop" });
DB("flower_red", "Czerwony kwiat", { solid: 0, opq: 0, lop: 0, hard: 0, snd: "grass", shape: 1, tex: "flower_red", cut: 1, supp: "soil" });
DB("flower_yellow", "Żółty kwiat", { solid: 0, opq: 0, lop: 0, hard: 0, snd: "grass", shape: 1, tex: "flower_yellow", cut: 1, supp: "soil" });
DB("deadbush", "Uschnięty krzak", { solid: 0, opq: 0, lop: 0, hard: 0, snd: "grass", shape: 1, tex: "deadbush", cut: 1, rep: 1, supp: "sand", drop: "stick_drop" });
DB("sapling_oak", "Sadzonka dębu", { solid: 0, opq: 0, lop: 0, hard: 0, snd: "grass", shape: 1, tex: "sapling_oak", cut: 1, supp: "soil", fuel: 5 });
DB("sapling_birch", "Sadzonka brzozy", { solid: 0, opq: 0, lop: 0, hard: 0, snd: "grass", shape: 1, tex: "sapling_birch", cut: 1, supp: "soil", fuel: 5 });
DB("sapling_spruce", "Sadzonka świerku", { solid: 0, opq: 0, lop: 0, hard: 0, snd: "grass", shape: 1, tex: "sapling_spruce", cut: 1, supp: "soil", fuel: 5 });
DB("stonebrick", "Kamienne cegły", { hard: 1.5, tool: "pick", req: 1 });
DB("slab_oak", "Płyta dębowa", { opq: 0, lop: 0, hard: 2, tool: "axe", snd: "wood", shape: 3, tex: "planks_oak", fuel: 7 });
DB("slab_cobble", "Płyta z bruku", { opq: 0, lop: 0, hard: 2, tool: "pick", req: 1, shape: 3, tex: "cobble" });
DB("slab_stonebrick", "Płyta z kamiennych cegieł", { opq: 0, lop: 0, hard: 1.5, tool: "pick", req: 1, shape: 3, tex: "stonebrick" });
DB("slab_sandstone", "Płyta z piaskowca", { opq: 0, lop: 0, hard: 0.8, tool: "pick", req: 1, shape: 3, tex: { t: "sandstone_top", b: "sandstone_top", s: "sandstone" } });
DB("slab_brick", "Płyta z cegieł", { opq: 0, lop: 0, hard: 2, tool: "pick", req: 1, shape: 3, tex: "brick_wall" });
DB("stairs_oak", "Schody dębowe", { opq: 0, lop: 0, hard: 2, tool: "axe", snd: "wood", shape: 4, tex: "planks_oak", fuel: 15 });
DB("stairs_cobble", "Schody z bruku", { opq: 0, lop: 0, hard: 2, tool: "pick", req: 1, shape: 4, tex: "cobble" });
DB("stairs_stonebrick", "Schody z kamiennych cegieł", { opq: 0, lop: 0, hard: 1.5, tool: "pick", req: 1, shape: 4, tex: "stonebrick" });
DB("stairs_brick", "Schody z cegieł", { opq: 0, lop: 0, hard: 2, tool: "pick", req: 1, shape: 4, tex: "brick_wall" });
DB("block_iron", "Blok żelaza", { hard: 5, tool: "pick", req: 1, tier: 1, snd: "metal" });
DB("block_gold", "Blok złota", { hard: 3, tool: "pick", req: 1, tier: 2, snd: "metal" });
DB("block_diamond", "Blok diamentu", { hard: 5, tool: "pick", req: 1, tier: 2, snd: "metal" });
DB("block_coal", "Blok węgla", { hard: 5, tool: "pick", req: 1, fuel: 800 });
DB("lamp", "Lampa", { hard: 0.3, snd: "glass", light: 15 });
DB("bed", "Łóżko", { hard: 0.2, snd: "cloth", shape: 11, opq: 0, lop: 0, tex: { t: "bed_top", b: "planks_oak", s: "bed_side" } });
DB("tnt_lit", "Dynamit (zapalony)", { hard: 0, tex: "tnt", drop: "none" });

const NB = BLK.length;
const isFluid = (id) => BLK[id].fluid > 0;

/* ===================== PRZEDMIOTY ===================== */
const ITM = {}, ID = {};
BLK.forEach((b) => { ID[b.key] = b.id; });
let nextItem = 256;
function DI(key, name, o) {
  const it = Object.assign({ key, name, max: 64 }, o || {});
  it.id = nextItem++; ITM[it.id] = it; ID[key] = it.id; return it;
}
DI("stick", "Patyk", { fuel: 5 });
DI("coal", "Węgiel", { fuel: 80 });
DI("charcoal", "Węgiel drzewny", { fuel: 80 });
DI("iron_ingot", "Sztabka żelaza");
DI("gold_ingot", "Sztabka złota");
DI("diamond", "Diament");
DI("string", "Nić");
DI("flint", "Krzemień");
DI("clay_ball", "Kulka gliny");
DI("brick", "Cegła");
DI("bone", "Kość");
DI("bonemeal", "Mączka kostna");
DI("feather", "Pióro");
DI("leather", "Skóra");
DI("seeds", "Nasiona pszenicy", { place: "wheat" });
DI("wheat_item", "Pszenica");
DI("bread", "Chleb", { food: [5, 6] });
DI("apple", "Jabłko", { food: [4, 2.4] });
DI("raw_pork", "Surowa wieprzowina", { food: [3, 1.8] });
DI("cooked_pork", "Pieczona wieprzowina", { food: [8, 12.8] });
DI("raw_beef", "Surowa wołowina", { food: [3, 1.8] });
DI("cooked_beef", "Stek", { food: [8, 12.8] });
DI("raw_mutton", "Surowa baranina", { food: [2, 1.2] });
DI("cooked_mutton", "Pieczona baranina", { food: [6, 9.6] });
DI("raw_chicken", "Surowy kurczak", { food: [2, 1.2] });
DI("cooked_chicken", "Pieczony kurczak", { food: [6, 7.2] });
DI("rotten", "Zgniłe mięso", { food: [4, 0.8], bad: 1 });
DI("door_item", "Drzwi dębowe", { place: "door_lower" });
DI("bucket", "Wiadro", { max: 16 });
DI("bucket_water", "Wiadro wody", { max: 1 });
DI("bucket_lava", "Wiadro lawy", { max: 1, fuel: 1000 });
DI("flint_steel", "Krzesiwo", { max: 1, dur: 65 });
DI("shears", "Nożyce", { max: 1, dur: 238, tool: { type: "shears", tier: 0, speed: 5, dmg: 1 } });
DI("bow", "Łuk", { max: 1, dur: 385 });
DI("arrow", "Strzała");

const MATS = [
  // klucz, przymiotnik m, f, tier, trwałość, szybkość, zbroja: mnożnik trwałości, punkty [hełm,napierśnik,nogawice,buty]
  ["wood", "Drewniany", "Drewniana", 0, 59, 2],
  ["stone", "Kamienny", "Kamienna", 1, 131, 4],
  ["iron", "Żelazny", "Żelazna", 2, 250, 6],
  ["gold", "Złoty", "Złota", 0, 32, 12],
  ["diamond", "Diamentowy", "Diamentowa", 3, 1561, 8]
];
const TOOLDEF = [["pick", "kilof", 0, [2, 3, 4, 2, 5]], ["axe", "siekiera", 1, [3, 4, 5, 3, 6]], ["shovel", "łopata", 1, [1, 2, 3, 1, 4]], ["hoe", "motyka", 1, [1, 1, 1, 1, 1]], ["sword", "miecz", 0, [4, 5, 6, 4, 7]]];
MATS.forEach((m, mi) => {
  TOOLDEF.forEach((t) => {
    const nm = (t[2] ? m[2] : m[1]) + " " + t[1];
    DI(t[0] + "_" + m[0], nm, { max: 1, dur: m[4], fuel: m[0] === "wood" ? 10 : 0, tool: { type: t[0], tier: m[3], speed: m[5], dmg: t[3][mi] } });
  });
});
const ARMS = [["leather", "Skórzany", "Skórzane", 5, [1, 3, 2, 1]], ["gold", "Złoty", "Złote", 7, [2, 5, 3, 1]], ["iron", "Żelazny", "Żelazne", 15, [2, 6, 5, 2]], ["diamond", "Diamentowy", "Diamentowe", 33, [3, 8, 6, 3]]];
const ASLOT = [["helmet", "hełm", 11, 0], ["chest", "napierśnik", 16, 0], ["legs", "nogawice", 15, 1], ["boots", "buty", 13, 1]];
ARMS.forEach((a) => {
  ASLOT.forEach((s, si) => {
    const nm = (s[3] ? a[2] : a[1]) + " " + s[1];
    DI(a[0] + "_" + s[0], nm, { max: 1, dur: s[2] * a[3], armor: { slot: si, pts: a[4][si] } });
  });
});

/* przedmioty-bloki */
const BITEM = {};
function itemDef(id) {
  if (id >= 256) return ITM[id];
  let d = BITEM[id];
  if (!d) { const b = BLK[id]; d = BITEM[id] = { id, key: b.key, name: b.name, max: 64, block: true, fuel: b.fuel || 0 }; if (b.key === "furnace_on") d.name = "Piec"; }
  return d;
}
const itemName = (id) => itemDef(id).name;
const maxStack = (id) => itemDef(id).max;
const durOf = (id) => itemDef(id).dur || 0;

/* grupy do receptur */
const TAGS = {
  "#planks": new Set([ID.planks_oak, ID.planks_birch, ID.planks_spruce]),
  "#logs": new Set([ID.log_oak, ID.log_birch, ID.log_spruce]),
  "#coal": new Set([ID.coal, ID.charcoal])
};
function ingOk(ing, id) { if (typeof ing === "object") return ing.has(id); return ing === id; }
const resolveIng = (k) => (k == null || k === " " ? 0 : typeof k === "number" ? k : k[0] === "#" ? TAGS[k] : ID[k]);

/* ===================== RECEPTURY ===================== */
const RECIPES = [];
function shaped(out, n, rows, map) {
  const m = {}; for (const k in map) m[k] = resolveIng(map[k]);
  const grid = rows.map((r) => r.split("").map((c) => (c === " " ? 0 : m[c])));
  if (grid.some((r) => r.some((c) => c === undefined)) || !ID[out]) throw new Error("recipe " + out);
  RECIPES.push({ shaped: 1, out: ID[out], n, grid, w: grid[0].length, h: grid.length });
}
function shapeless(out, n, list) { RECIPES.push({ shaped: 0, out: ID[out], n, list: list.map(resolveIng) }); }
const WOOD3 = [["planks_oak", "log_oak"], ["planks_birch", "log_birch"], ["planks_spruce", "log_spruce"]];
WOOD3.forEach((w) => shapeless(w[0], 4, [w[1]]));
shaped("stick", 4, ["P", "P"], { P: "#planks" });
shaped("crafting", 1, ["PP", "PP"], { P: "#planks" });
shaped("furnace", 1, ["CCC", "C C", "CCC"], { C: "cobble" });
shaped("chest", 1, ["PPP", "P P", "PPP"], { P: "#planks" });
shaped("torch", 4, ["C", "S"], { C: "#coal", S: "stick" });
shaped("ladder", 3, ["S S", "SSS", "S S"], { S: "stick" });
shaped("door_item", 3, ["PP", "PP", "PP"], { P: "#planks" });
shaped("bread", 1, ["WWW"], { W: "wheat_item" });
shapeless("bonemeal", 3, ["bone"]);
shaped("bucket", 1, ["I I", " I "], { I: "iron_ingot" });
shaped("shears", 1, [" I", "I "], { I: "iron_ingot" });
shapeless("flint_steel", 1, ["iron_ingot", "flint"]);
shaped("bow", 1, [" XS", "X S", " XS"], { X: "stick", S: "string" });
shaped("arrow", 4, ["F", "S", "E"], { F: "flint", S: "stick", E: "feather" });
shaped("wool", 1, ["SS", "SS"], { S: "string" });
shaped("bed", 1, ["WWW", "PPP"], { W: "wool", P: "#planks" });
shaped("tnt", 1, ["CSC", "SCS", "CSC"], { C: "#coal", S: "sand" });
shaped("lamp", 1, [" G ", "GTG", " G "], { G: "glass", T: "torch" });
shaped("sandstone", 1, ["SS", "SS"], { S: "sand" });
shaped("stonebrick", 4, ["SS", "SS"], { S: "stone" });
shaped("brick_block", 1, ["BB", "BB"], { B: "brick" });
shaped("clay", 1, ["CC", "CC"], { C: "clay_ball" });
[["planks_oak", "slab_oak", "stairs_oak"], ["cobble", "slab_cobble", "stairs_cobble"], ["stonebrick", "slab_stonebrick", "stairs_stonebrick"], ["sandstone", "slab_sandstone", null], ["brick_block", "slab_brick", "stairs_brick"]].forEach((r) => {
  shaped(r[1], 6, ["XXX"], { X: r[0] === "planks_oak" ? "#planks" : r[0] });
  if (r[2]) shaped(r[2], 4, ["X  ", "XX ", "XXX"], { X: r[0] === "planks_oak" ? "#planks" : r[0] });
});
[["block_iron", "iron_ingot"], ["block_gold", "gold_ingot"], ["block_diamond", "diamond"], ["block_coal", "coal"]].forEach((r) => {
  shaped(r[0], 1, ["XXX", "XXX", "XXX"], { X: r[1] });
  shapeless(r[1], 9, [r[0]]);
});
MATS.forEach((m) => {
  const X = m[0] === "wood" ? "#planks" : m[0] === "stone" ? "cobble" : m[0] === "iron" ? "iron_ingot" : m[0] === "gold" ? "gold_ingot" : "diamond";
  shaped("pick_" + m[0], 1, ["XXX", " S ", " S "], { X, S: "stick" });
  shaped("axe_" + m[0], 1, ["XX", "XS", " S"], { X, S: "stick" });
  shaped("shovel_" + m[0], 1, ["X", "S", "S"], { X, S: "stick" });
  shaped("hoe_" + m[0], 1, ["XX", " S", " S"], { X, S: "stick" });
  shaped("sword_" + m[0], 1, ["X", "X", "S"], { X, S: "stick" });
});
ARMS.forEach((a) => {
  const X = a[0] === "leather" ? "leather" : a[0] === "iron" ? "iron_ingot" : a[0] === "gold" ? "gold_ingot" : "diamond";
  shaped(a[0] + "_helmet", 1, ["XXX", "X X"], { X });
  shaped(a[0] + "_chest", 1, ["X X", "XXX", "XXX"], { X });
  shaped(a[0] + "_legs", 1, ["XXX", "X X", "X X"], { X });
  shaped(a[0] + "_boots", 1, ["X X", "X X"], { X });
});

/* dopasowanie: cells = tablica id (0 = puste), w × hh */
function matchRecipe(cells, w, hh) {
  let minx = 99, miny = 99, maxx = -1, maxy = -1, cnt = 0;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (cells[y * w + x]) { cnt++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  if (!cnt) return null;
  const bw = maxx - minx + 1, bh = maxy - miny + 1;
  for (let i = 0; i < RECIPES.length; i++) {
    const r = RECIPES[i];
    if (r.shaped) {
      if (r.w !== bw || r.h !== bh) continue;
      for (let mir = 0; mir < 2; mir++) {
        let ok = true;
        for (let y = 0; y < bh && ok; y++) for (let x = 0; x < bw; x++) {
          const want = r.grid[y][mir ? bw - 1 - x : x], have = cells[(miny + y) * w + minx + x];
          if (!want) { if (have) { ok = false; break; } } else if (!have || !ingOk(want, have)) { ok = false; break; }
        }
        if (ok) return r;
      }
    } else {
      if (cnt !== r.list.length) continue;
      const have = []; for (let k = 0; k < cells.length; k++) if (cells[k]) have.push(cells[k]);
      const used = new Array(have.length).fill(false); let ok = true;
      for (const want of r.list) { let f = false; for (let k = 0; k < have.length; k++) if (!used[k] && ingOk(want, have[k])) { used[k] = true; f = true; break; } if (!f) { ok = false; break; } }
      if (ok) return r;
    }
  }
  return null;
}

/* wypalanie */
const SMELT = {};
function smelt(a, b) { SMELT[ID[a]] = ID[b]; }
smelt("cobble", "stone"); smelt("sand", "glass"); smelt("ore_iron", "iron_ingot"); smelt("ore_gold", "gold_ingot"); smelt("clay_ball", "brick");
smelt("log_oak", "charcoal"); smelt("log_birch", "charcoal"); smelt("log_spruce", "charcoal"); smelt("ore_coal", "coal");
smelt("raw_pork", "cooked_pork"); smelt("raw_beef", "cooked_beef"); smelt("raw_mutton", "cooked_mutton"); smelt("raw_chicken", "cooked_chicken");
const fuelOf = (id) => { const d = itemDef(id); return d.fuel || 0; };

/* bloki podpierane z góry/boku/dołu — pomocniki fizyczne */
const isSoil = (id) => id === BID.grass || id === BID.dirt || id === BID.farmland || id === BID.snow_grass;
const SOLID = new Uint8Array(256), OPQ = new Uint8Array(256), LOP = new Uint8Array(256), LIGHT = new Uint8Array(256);
BLK.forEach((b) => { SOLID[b.id] = b.solid; OPQ[b.id] = b.opq; LOP[b.id] = b.lop; LIGHT[b.id] = b.light; });

/* ile punktów życia/czasu: wylicz czas kopania */
function digTime(bid, tool, creative) {
  const b = BLK[bid];
  if (creative) return 0;
  if (b.hard < 0) return Infinity;
  if (b.hard === 0) return 0;
  const t = tool && tool.tool;
  const speed = t && b.tool && t.type === b.tool ? t.speed : 1;
  return b.hard * (canHarvest(bid, tool) ? 1.5 : 5) / speed;
}
function canHarvest(bid, tool) {
  const b = BLK[bid]; if (!b.req) return true;
  if (!tool || !tool.tool || tool.tool.type !== b.tool) return false;
  return tool.tool.tier >= b.tier;
}
/* wypadające przedmioty: tablica [id, ilość] */
function dropsFor(bid, meta, tool) {
  const b = BLK[bid]; const out = [];
  const T = tool && tool.tool ? tool.tool.type : "";
  if (b.key === "wool" && T !== "shears") { out.push([ID.wool, 1]); return out; }
  if (!canHarvest(bid, tool)) return out;
  const d = b.drop;
  const r = Math.random();
  switch (d) {
    case "none": return out;
    case "leaf_drop":
      if (T === "shears") { out.push([bid, 1]); return out; }
      if (r < 0.06) out.push([bid === BID.leaves_oak ? ID.sapling_oak : bid === BID.leaves_birch ? ID.sapling_birch : ID.sapling_spruce, 1]);
      else if (bid === BID.leaves_oak && r < 0.065) out.push([ID.apple, 1]);
      else if (r > 0.97) out.push([ID.stick, 1]);
      return out;
    case "gravel_drop": out.push(r < 0.12 ? [ID.flint, 1] : [ID.gravel, 1]); return out;
    case "clay_drop": out.push([ID.clay_ball, 4]); return out;
    case "seed_drop": if (T === "shears") out.push([bid, 1]); else if (r < 0.14) out.push([ID.seeds, 1]); return out;
    case "stick_drop": if (r < 0.5) out.push([ID.stick, 1]); return out;
    case "wheat_drop":
      if (meta >= 7) { out.push([ID.wheat_item, 1]); out.push([ID.seeds, ri(1, 3)]); } else out.push([ID.seeds, 1]);
      return out;
    case "door_item": out.push([ID.door_item, 1]); return out;
    default:
      if (typeof d === "string") out.push([ID[d], 1]); else out.push([bid === BID.furnace_on ? ID.furnace : bid, 1]);
  }
  return out;
}
/* ===================== TEKSTURY (rysowane kodem) ===================== */
const TILES = [], TIX = {};
function nameSalt(s) { let q = 7; for (let i = 0; i < s.length; i++) q = (Math.imul(q, 31) + s.charCodeAt(i)) | 0; return q; }
function tile(name, fn) { TIX[name] = TILES.length; TILES.push({ name, fn, salt: nameSalt(name) }); }
const P = (hex, f, a) => { f = f == null ? 1 : f; return [clamp(((hex >> 16) & 255) * f, 0, 255) | 0, clamp(((hex >> 8) & 255) * f, 0, 255) | 0, clamp((hex & 255) * f, 0, 255) | 0, a == null ? 255 : a]; };
const NA = [0, 0, 0, 0];
const nz = (hex, amt) => (x, y, rn) => P(hex, 1 + (rn(x, y) - 0.5) * amt);

tile("stone", (x, y, rn) => P(0x808080, 0.97 + (rn(x, y) - 0.5) * 0.2 - (rn(x >> 1, y >> 1, 3) > 0.8 ? 0.1 : 0)));
tile("dirt", (x, y, rn) => { let f = 1 + (rn(x, y) - 0.5) * 0.3; if (rn(x, y, 4) > 0.93) f *= 0.72; else if (rn(x, y, 5) > 0.95) f *= 1.2; return P(0x87593a, f); });
tile("grass_top", (x, y, rn) => P(0xcccccc, 0.95 + (rn(x, y) - 0.5) * 0.22));
tile("grass_side", (x, y, rn) => {
  const d = 2 + (rn(x, 0, 6) > 0.5 ? 1 : 0) + (rn(x, 0, 7) > 0.85 ? 1 : 0);
  if (y < d) return P(0x6aa84a, 0.9 + (rn(x, y) - 0.5) * 0.25);
  let f = 1 + (rn(x, y) - 0.5) * 0.3; if (rn(x, y, 4) > 0.93) f *= 0.72; return P(0x87593a, f);
});
tile("cobble", (x, y, rn) => {
  const row = y >> 2, off = row * 3 + (rn(row, 0, 1) > 0.5 ? 2 : 0), cell = (x + off) >> 2;
  const edge = (y & 3) === 0 || ((x + off) & 3) === 0;
  return P(0x8a8a8a, edge ? 0.6 : 0.78 + rn(cell, row, 2) * 0.32 + (rn(x, y) - 0.5) * 0.08);
});
function planksTile(name, hex) {
  tile(name, (x, y, rn) => {
    const r = y >> 2, edge = (y & 3) === 3, seam = ((x + r * 5) & 15) === 7 && (y & 3) !== 3;
    let f = 0.92 + rn(r, 0, 1) * 0.16 + (rn(x, y) - 0.5) * 0.07; if (edge) f *= 0.72; if (seam) f *= 0.8;
    return P(hex, f);
  });
}
planksTile("planks_oak", 0xb28b52); planksTile("planks_birch", 0xd6c88f); planksTile("planks_spruce", 0x7c5c33);
tile("bedrock", (x, y, rn) => P(0x2f2f2f, 0.55 + rn(x >> 1, y >> 1) * 0.9 + (rn(x, y) - 0.5) * 0.3));
tile("sand", (x, y, rn) => P(0xdad2a0, 1 + (rn(x, y) - 0.5) * 0.1 + (rn(x, y, 3) > 0.9 ? -0.08 : 0)));
tile("gravel", (x, y, rn) => P(0x857f7c, 0.7 + rn(x >> 1, y >> 1) * 0.6 + (rn(x, y) - 0.5) * 0.18));
tile("water", (x, y, rn) => P(0x2d5fd0, 1 + Math.sin((x + y * 0.7) * 0.9) * 0.05 + (rn(x, y) - 0.5) * 0.1, 170));
tile("lava", (x, y, rn) => { const v = rn(x >> 1, y >> 1) * 0.5 + rn(x, y, 2) * 0.5; return v > 0.78 ? P(0xffd23a, 1) : P(0xe65a12, 0.8 + v * 0.45); });
const ORE_B = [[2, 2], [9, 1], [12, 6], [4, 8], [9, 11], [1, 13], [13, 13]];
function oreTile(name, spot, hi) {
  tile(name, (x, y, rn) => {
    let c = P(0x808080, 0.97 + (rn(x, y) - 0.5) * 0.2 - (rn(x >> 1, y >> 1, 3) > 0.8 ? 0.1 : 0));
    for (let i = 0; i < ORE_B.length; i++) {
      const bx = ORE_B[i][0], by = ORE_B[i][1];
      if ((x >= bx && x <= bx + 1 && y >= by && y <= by + 1) || (x === bx + 2 && y === by + 1 && i % 2 === 0) || (x === bx - 1 && y === by && i % 3 === 0)) return P(rn(x, y, 8) > 0.6 ? hi : spot, 0.88 + rn(x, y, 9) * 0.3);
    }
    return c;
  });
}
oreTile("ore_coal", 0x252525, 0x3a3a3a); oreTile("ore_iron", 0xd8af93, 0xeacbb2); oreTile("ore_gold", 0xf8df3b, 0xfff17a); oreTile("ore_diamond", 0x4fe5ee, 0xc4fbff);
function logSide(name, hex, birch) {
  tile(name, (x, y, rn) => {
    let f = 0.78 + rn(x, 0, 1) * 0.42 + (rn(x, y) - 0.5) * 0.12;
    if (birch && rn(x >> 1, y >> 2, 7) > 0.82) return P(0x2c2c2c, 0.7 + rn(x, y) * 0.5);
    return P(hex, f);
  });
}
logSide("log_oak", 0x6d5433); logSide("log_spruce", 0x3c2a17); logSide("log_birch", 0xd5d5c5, true);
function logTop(name, bark, wood) {
  tile(name, (x, y, rn) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d >= 6.6) return P(bark, 0.85 + rn(x, y) * 0.3);
    return P(wood, (Math.floor(d) % 2 ? 0.86 : 1) + (rn(x, y) - 0.5) * 0.08);
  });
}
logTop("log_oak_top", 0x6d5433, 0xb28b52); logTop("log_spruce_top", 0x3c2a17, 0x7c5c33); logTop("log_birch_top", 0xd5d5c5, 0xd6c88f);
function leavesTile(name, hex, gray) {
  tile(name, (x, y, rn) => { if (rn(x, y, 2) > 0.82) return NA; return P(hex, 0.62 + rn(x, y) * 0.55); });
}
leavesTile("leaves_oak", 0xd0d0d0); leavesTile("leaves_birch", 0xd0d0d0); leavesTile("leaves_spruce", 0xd0d0d0);
tile("glass", (x, y, rn) => {
  if (x === 0 || y === 0 || x === 15 || y === 15) return P(0xd8f0f4, 0.95, 230);
  if ((x === 3 && y >= 3 && y <= 6) || (x === 4 && y === 3) || (y === 12 && x >= 10 && x <= 12)) return P(0xffffff, 1, 200);
  return NA;
});
tile("sandstone", (x, y, rn) => { let f = 1 + (rn(x, y) - 0.5) * 0.06; if (y === 3 || y === 12) f *= 0.88; if (y < 3) f *= 0.96; return P(0xdcd2a2, f); });
tile("sandstone_top", (x, y, rn) => P(0xe0d6a6, 1 + (rn(x, y) - 0.5) * 0.05));
tile("snow_block", (x, y, rn) => P(0xf7fbfc, 1 - rn(x, y) * 0.06));
tile("snow_side", (x, y, rn) => {
  const d = 3 + (rn(x, 0, 6) > 0.5 ? 1 : 0);
  if (y < d) return P(0xf7fbfc, 1 - rn(x, y) * 0.07);
  let f = 1 + (rn(x, y) - 0.5) * 0.3; if (rn(x, y, 4) > 0.93) f *= 0.72; return P(0x87593a, f);
});
tile("ice", (x, y, rn) => P(0x9fd0f5, 0.95 + (rn(x, y) - 0.5) * 0.12, 190));
tile("clay", (x, y, rn) => P(0xa2a7b8, 1 + (rn(x, y) - 0.5) * 0.08));
tile("brick_wall", (x, y, rn) => {
  const row = y >> 2, off = (row & 1) * 4, mortar = (y & 3) === 3 || ((x + off) & 7) === 7;
  return mortar ? P(0xb6aea4, 0.9 + rn(x, y) * 0.15) : P(0x9a4f43, 0.88 + rn(x >> 2, row, 2) * 0.2 + (rn(x, y) - 0.5) * 0.1);
});
tile("obsidian", (x, y, rn) => P(0x1a1426, 0.75 + rn(x, y) * 0.55 + (rn(x >> 2, y >> 2, 3) > 0.8 ? 0.35 : 0)));
tile("cactus", (x, y, rn) => {
  if (x % 5 === 2 && y % 4 === 1) return P(0xf0f0c0, 1);
  let f = 0.85 + rn(x, 0, 1) * 0.25 + (rn(x, y) - 0.5) * 0.1; if (x === 0 || x === 15) f *= 0.75;
  return P(0x2e7d32, f);
});
tile("cactus_top", (x, y, rn) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); return P(0x3d9441, d > 6 ? 0.7 : (Math.abs(x - 7.5) < 1.2 || Math.abs(y - 7.5) < 1.2) ? 0.85 : 1.05); });
tile("wool", (x, y, rn) => P(0xeaeaea, 0.94 + rn(x, y) * 0.1 + ((x + y) % 4 === 0 ? -0.04 : 0)));
tile("tnt", (x, y, rn) => {
  if (y >= 6 && y <= 9) { if (y === 6 || y === 9) return P(0xdddddd, 0.9); const l = (x % 5) < 3 && x > 2 && x < 13; return l && (x % 5 !== 1 || y === 7) ? P(0x222222, 1) : P(0xe8e8e8, 1); }
  return P(0xc8382a, 0.9 + rn(x, y) * 0.15 + (x % 4 === 3 ? -0.15 : 0));
});
tile("tnt_top", (x, y, rn) => { const d = Math.hypot(x - 7.5, y - 7.5); return d < 2 ? P(0x555555, 1) : P(0xb9b2a0, 0.9 + rn(x, y) * 0.12 - (d > 6.5 ? 0.2 : 0)); });
tile("torch", (x, y, rn) => {
  if (x >= 7 && x <= 8 && y >= 6 && y <= 15) { if (y <= 7) return y === 6 ? P(0xffa21c, 1) : P(0xffe27a, 1); return P(0x8a6a35, x === 7 ? 1 : 0.78); }
  return NA;
});
tile("crafting_top", (x, y, rn) => {
  const b = x === 0 || y === 0 || x === 15 || y === 15, g = x === 7 || x === 8 || y === 7 || y === 8;
  return P(0xb28b52, (b ? 0.65 : g ? 0.7 : 1) * (0.94 + rn(x, y) * 0.1));
});
function benchSide(name, front) {
  tile(name, (x, y, rn) => {
    if (y < 3) return P(0x7b5a2c, 0.9 + rn(x, y) * 0.12);
    const board = ((y - 3) >> 2), f = 0.9 + rn(board, 0, 1) * 0.15 + (rn(x, y) - 0.5) * 0.06;
    if (front) { if ((x === 4 && y >= 4 && y <= 10) || (x >= 3 && x <= 5 && y === 4) || (x === 10 && y >= 5 && y <= 11) || (x >= 9 && x <= 11 && y === 5)) return P(0x3a3a3a, 1); }
    else if ((x >= 3 && x <= 12 && y === 6) || (x === 3 && y >= 6 && y <= 11) || (x === 12 && y >= 6 && y <= 11)) return P(0x4a3a20, 1);
    return P(0xb28b52, ((y - 3) & 3) === 3 ? 0.7 : f);
  });
}
benchSide("crafting_side", false); benchSide("crafting_front", true);
tile("furnace_top", (x, y, rn) => P(0x6f6f6f, 0.9 + rn(x, y) * 0.15 - (x === 0 || y === 0 || x === 15 || y === 15 ? 0.2 : 0)));
tile("furnace_side", (x, y, rn) => { const row = y >> 2, off = row * 3 + (rn(row, 0, 1) > 0.5 ? 2 : 0), edge = (y & 3) === 0 || ((x + off) & 3) === 0; return P(0x8a8a8a, edge ? 0.65 : 0.85 + rn((x + off) >> 2, row, 2) * 0.22); });
function furnaceFront(name, on) {
  tile(name, (x, y, rn) => {
    const inSlot = x >= 4 && x <= 11 && y >= 2 && y <= 3;
    const inMain = x >= 3 && x <= 12 && y >= 7 && y <= 13;
    if (inSlot) return P(0x161616, 1);
    if (inMain) {
      if (on) { const f = (13 - y) / 6; return y >= 9 ? P(f > 0.45 ? 0xffb02a : 0xe65a12, 0.8 + rn(x, y) * 0.35) : P(0x2a1a10, 1); }
      return (y === 11 || (y === 9 && x % 2 === 0)) ? P(0x383838, 1) : P(0x151515, 1);
    }
    if (y === 6 && x >= 3 && x <= 12) return P(0x555555, 1);
    const row = y >> 2, off = row * 3 + (rn(row, 0, 1) > 0.5 ? 2 : 0), edge = (y & 3) === 0 || ((x + off) & 3) === 0;
    return P(0x8a8a8a, edge ? 0.65 : 0.85 + rn((x + off) >> 2, row, 2) * 0.22);
  });
}
furnaceFront("furnace_front", false); furnaceFront("furnace_front_on", true);
function chestTile(name, kind) {
  tile(name, (x, y, rn) => {
    const b = x === 0 || y === 0 || x === 15 || y === 15;
    if (kind === "front") { if (x >= 7 && x <= 8 && y >= 5 && y <= 8) return P(y === 5 ? 0xcfcfcf : 0x909090, 1); if (y === 6 && false) return P(0, 1); }
    let f = (b ? 0.6 : 0.95) * (0.92 + rn(x >> 1, y >> 1) * 0.12); if (kind !== "top" && y === 5 && !b) f *= 0.7;
    return P(0xa27526, f);
  });
}
chestTile("chest_top", "top"); chestTile("chest_side", "side"); chestTile("chest_front", "front");
tile("door_lower", (x, y, rn) => {
  const b = x < 2 || x > 13 || y > 14, panel = x >= 4 && x <= 11 && ((y >= 3 && y <= 6) || (y >= 9 && y <= 13));
  if (x === 12 && y >= 7 && y <= 8) return P(0xd0d0d0, 1);
  return P(0xa88346, (b ? 0.7 : panel ? 0.82 : 1) * (0.94 + rn(x, y) * 0.1));
});
tile("door_upper", (x, y, rn) => {
  const b = x < 2 || x > 13 || y < 1, win = x >= 4 && x <= 11 && y >= 3 && y <= 8 && !(x === 7 || x === 8) && !(y === 5 || y === 6);
  return win ? P(0x9fd8e8, 0.9, 235) : P(0xa88346, (b ? 0.7 : 1) * (0.94 + rn(x, y) * 0.1));
});
tile("ladder", (x, y, rn) => { if ((x >= 2 && x <= 3) || (x >= 12 && x <= 13) || (x >= 2 && x <= 13 && y % 4 === 1)) return P(0x9b7b3f, 0.85 + rn(x, y) * 0.3); return NA; });
tile("farm_dry", (x, y, rn) => P(0x7a4d28, (y % 4 === 0 ? 0.78 : 1) * (0.94 + rn(x, y) * 0.1)));
tile("farm_wet", (x, y, rn) => P(0x4a2c14, (y % 4 === 0 ? 0.78 : 1) * (0.94 + rn(x, y) * 0.1)));
for (let age = 0; age < 8; age++) {
  tile("wheat" + age, (x, y, rn) => {
    const col = [2, 5, 8, 11, 14].findIndex((cx) => Math.abs(x - cx) <= (age >= 5 ? 1 : 0) && (age >= 5 || x === cx));
    if (col < 0) return NA;
    const hgt = 3 + age * 1.55 + (rn(col, 0, 1) - 0.5) * 2;
    if (15 - y > hgt) return NA;
    if (age >= 5 && Math.abs(x - [2, 5, 8, 11, 14][col]) === 1 && 15 - y < hgt - 5) return NA;
    const c = age >= 7 ? 0xd5b13a : age >= 6 ? 0xa9b53a : 0x4f9d2f;
    return P(c, 0.85 + rn(x, y) * 0.3);
  });
}
tile("tallgrass", (x, y, rn) => {
  for (let i = 0; i < 6; i++) { const cx = 1 + i * 2.6 + (rn(i, 0, 1) - 0.5) * 1.5, hgt = 6 + rn(i, 0, 2) * 8; if (Math.abs(x - cx - (15 - y) * 0.06 * (i % 2 ? 1 : -1)) < 0.8 && 15 - y <= hgt) return P(0xc0c0c0, 0.7 + rn(x, y) * 0.4); }
  return NA;
});
function flowerTile(name, head) {
  tile(name, (x, y, rn) => {
    if (x >= 7 && x <= 8 && y >= 8) return P(0x3c8a2c, 0.85 + rn(x, y) * 0.3);
    if (x >= 5 && x <= 10 && y >= 3 && y <= 8 && !((x === 5 || x === 10) && (y === 3 || y === 8))) return (x === 7 || x === 8) && (y === 5 || y === 6) ? P(0xf5e642, 1) : P(head, 0.85 + rn(x, y) * 0.3);
    return NA;
  });
}
flowerTile("flower_red", 0xd12525); flowerTile("flower_yellow", 0xe9c81f);
tile("deadbush", (x, y, rn) => {
  const br = [[7, 15, 7, 8], [7, 11, 3, 6], [7, 10, 12, 5], [7, 13, 11, 9], [5, 8, 2, 3]];
  for (const b of br) { const t = (15 - y) / Math.max(1, 15 - b[3]); if (y >= b[3] && y <= b[1]) { const xx = b[0] + (b[2] - b[0]) * (b[1] - y) / Math.max(1, b[1] - b[3]); if (Math.abs(x - xx) < 0.7) return P(0x7b5a2a, 0.8 + rn(x, y) * 0.4); } }
  return NA;
});
function saplingTile(name, leaf, spruce) {
  tile(name, (x, y, rn) => {
    if (x >= 7 && x <= 8 && y >= 10) return P(0x6d5433, 1);
    if (spruce) { const w = Math.floor((y - 1) / 2.4); if (y >= 1 && y <= 11 && Math.abs(x - 7.5) <= w * 0.55 + 0.5) return P(leaf, 0.75 + rn(x, y) * 0.5); return NA; }
    if (Math.hypot(x - 7.5, y - 6) < 4.6 && rn(x, y, 3) > 0.12) return P(leaf, 0.7 + rn(x, y) * 0.5);
    return NA;
  });
}
saplingTile("sapling_oak", 0x3f8a2a); saplingTile("sapling_birch", 0x7fa650); saplingTile("sapling_spruce", 0x2f6a3a, true);
tile("stonebrick", (x, y, rn) => { const edge = (y & 7) === 7 || ((x + ((y >> 3) ? 4 : 0)) & 7) === 7; return P(0x858585, edge ? 0.62 : 0.95 + rn(x, y) * 0.12); });
function metalBlock(name, hex, dark) { tile(name, (x, y, rn) => { const b = x === 0 || y === 0 || x === 15 || y === 15; const g = (x === 7 || x === 8) && y > 2 && y < 13; return P(hex, (b ? 0.82 : 1) * (g ? 0.92 : 1) * (0.96 + rn(x, y) * 0.08) * (x + y < 5 ? 1.1 : 1)); }); }
metalBlock("block_iron", 0xdcdcdc); metalBlock("block_gold", 0xf6d63a); metalBlock("block_diamond", 0x4ee0d6);
tile("block_coal", (x, y, rn) => P(0x1d1d1d, 0.7 + rn(x >> 1, y >> 1) * 0.8 + (rn(x, y) - 0.5) * 0.2));
tile("lamp", (x, y, rn) => { const b = x === 0 || y === 0 || x === 15 || y === 15; return P(0xffe9a0, (b ? 0.75 : 1) * (0.9 + rn(x >> 1, y >> 1) * 0.2)); });
tile("bed_top", (x, y, rn) => (y < 5 ? P(0xf1f1f1, 0.95 + rn(x, y) * 0.06) : P(0xb83232, 0.9 + rn(x, y) * 0.15)));
tile("bed_side", (x, y, rn) => (y < 8 ? P(0xb83232, 0.85 + rn(x, y) * 0.15) : P(0x9a7a45, 0.9 + rn(x, y) * 0.15)));
/* pęknięcia (10 etapów) */
(function () {
  const rg = mulberry32(777), pts = [];
  for (let k = 0; k < 5; k++) { let x = 7 + (rg() * 4 - 2) | 0, y = 7 + (rg() * 4 - 2) | 0, dx = rg() * 2 - 1, dy = rg() * 2 - 1; for (let s = 0; s < 22; s++) { pts.push([Math.round(x), Math.round(y), s + k * 22]); x += dx + (rg() - 0.5) * 1.1; y += dy + (rg() - 0.5) * 1.1; } }
  pts.sort((a, b) => a[2] - b[2]);
  for (let st = 0; st < 10; st++) {
    const lim = Math.floor(pts.length * (st + 1) / 10), set = new Set();
    for (let i = 0; i < lim; i++) set.add(pts[i][0] + "," + pts[i][1]);
    tile("crack" + st, (x, y) => (set.has(x + "," + y) ? [0, 0, 0, 175] : NA));
  }
})();

/* ===================== IKONY PRZEDMIOTÓW ===================== */
function icon(name, draw) { TIX["i_" + name] = TILES.length; TILES.push({ name: "i_" + name, icon: draw, salt: nameSalt(name) }); }
function IG(buf) {
  const g = {
    set(x, y, hex, f) { x = x | 0; y = y | 0; if (x < 0 || y < 0 || x > 15 || y > 15) return; buf[y * 16 + x] = P(hex, f == null ? 1 : f); },
    rect(x0, y0, x1, y1, hex, f) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.set(x, y, hex, f); },
    line(x0, y0, x1, y1, hex, f) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) g.set(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), hex, f); },
    fill(test, colFn) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (test(x + 0.5, y + 0.5)) { const c = colFn(x, y); g.set(x, y, c[0], c[1]); } },
    poly(pts, colFn) {
      g.fill((X, Y) => { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]; if ((yi > Y) !== (yj > Y) && X < (xj - xi) * (Y - yi) / (yj - yi) + xi) ins = !ins; } return ins; }, colFn);
    },
    ell(cx, cy, rx, ry, colFn) { g.fill((X, Y) => ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1, colFn); }
  };
  return g;
}
const MCOL = { wood: 0xb28b52, stone: 0x8e8e8e, iron: 0xdedede, gold: 0xf6d63a, diamond: 0x3de3d6 };
const HANDLE = 0x8b6a3a;
function toolIcon(kind, mat) {
  return (g) => {
    const col = MCOL[mat];
    const fr = (x, y) => { const dx = x + 0.5 - 1.5, dy = y + 0.5 - 14.5; return [0.7071 * (dx - dy), 0.7071 * (dx + dy)]; };
    const shadeB = (b) => (b < -1.5 ? 1.18 : b > 1.5 ? 0.78 : 1);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const ab = fr(x, y), a = ab[0], b = ab[1];
      let c = null;
      const hl = kind === "sword" ? 3.6 : 13.2;
      if (kind !== "sword" && Math.abs(b) <= 0.78 && a >= -0.4 && a <= hl) c = [HANDLE, b < 0 ? 1.0 : 0.72];
      if (kind === "pick") { if (Math.abs(b) <= 6.9 && Math.abs(a - (11.2 + 3.1 * (1 - (b / 6.9) ** 2))) <= 1.2) c = [col, shadeB(b) * (a > 12 ? 1.05 : 0.95)]; }
      else if (kind === "axe") {
        const ins = (aa, bb, pts) => { let r = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]; if ((yi > bb) !== (yj > bb) && aa < (xj - xi) * (bb - yi) / (yj - yi) + xi) r = !r; } return r; };
        if (ins(a, b, [[8.8, -0.7], [13.8, -0.7], [14.3, -3], [13.6, -6.2], [11.6, -6.6], [9.4, -5], [8.8, -3]]) || ins(a, b, [[10.5, 0.7], [13.2, 0.7], [13.2, 2.2], [11, 2.2]])) c = [col, shadeB(b + 1) * (a > 12 ? 1.08 : 0.95)];
      } else if (kind === "shovel") { if (((a - 12.6) / 2.9) ** 2 + (b / 2.5) ** 2 <= 1) c = [col, shadeB(b)]; }
      else if (kind === "hoe") { if ((a >= 11 && a <= 13.1 && b >= -6 && b <= 0.8) || (a >= 8.8 && a <= 13.1 && b >= -6 && b <= -4.4)) c = [col, shadeB(b)]; }
      else if (kind === "sword") {
        const w = 1.35 - (a > 13 ? (a - 13) * 0.55 : 0);
        if (a >= 4.8 && a <= 15.6 && Math.abs(b) <= w) c = [col, b < -0.3 ? 1.15 : 0.82];
        else if (a >= 3.3 && a < 4.8 && Math.abs(b) <= 3.4) c = [0x6b5530, b < 0 ? 1.1 : 0.8];
        else if (a >= 0.5 && a < 3.3 && Math.abs(b) <= 0.8) c = [HANDLE, b < 0 ? 1 : 0.72];
        else if (a >= -0.9 && a < 0.5 && Math.abs(b) <= 1.1) c = [0x6b5530, 1];
      }
      if (c) g.set(x, y, c[0], c[1]);
    }
  };
}
MATS.forEach((m) => TOOLDEF.forEach((t) => icon(t[0] + "_" + m[0], toolIcon(t[0], m[0]))));
const ACOL = { leather: 0x9b5a2c, iron: 0xdcdcdc, gold: 0xf6d63a, diamond: 0x3de3d6 };
const APOLY = {
  helmet: [[3, 7], [4, 4], [6, 2.5], [10, 2.5], [12, 4], [13, 7], [13, 12], [10.5, 12], [10.5, 8.2], [5.5, 8.2], [5.5, 12], [3, 12]],
  chest: [[1.5, 3], [5, 2.5], [6.2, 3.8], [9.8, 3.8], [11, 2.5], [14.5, 3], [14.5, 8.5], [12.2, 8.5], [12.2, 14], [3.8, 14], [3.8, 8.5], [1.5, 8.5]],
  legs: [[3, 2], [13, 2], [13.5, 14], [9, 14], [8, 6.5], [7, 14], [2.5, 14]],
  boots: [[2, 5], [6.5, 5], [6.5, 10.5], [8, 11.5], [8, 14], [2, 14]]
};
ARMS.forEach((a) => ASLOT.forEach((s, si) => icon(a[0] + "_" + s[0], (g) => {
  const col = ACOL[a[0]], draw = (poly, ox) => g.poly(poly.map((p) => [p[0] + (ox || 0), p[1]]), (x, y) => [col, (0.92 + ((x * 7 + y * 13) % 5) * 0.025) * (x + y < 13 ? 1.12 : 0.86) * (y >= 12 ? 0.85 : 1)]);
  if (s[0] === "boots") { draw(APOLY.boots, 0); draw(APOLY.boots.map((p) => [16 - p[0], p[1]]), 0); } else draw(APOLY[s[0]]);
  if (a[0] === "leather") { g.set(7, 6, 0x5a3418); g.set(8, 6, 0x5a3418); }
  if (s[0] === "chest") { g.line(8, 5, 8, 13, col, 0.7); }
})));
icon("stick", (g) => { g.line(3, 13, 12, 4, HANDLE, 1); g.line(4, 13, 13, 4, HANDLE, 0.72); });
function lump(name, col, hi) { icon(name, (g) => { g.ell(8, 8.6, 5.2, 4.2, (x, y) => [col, 0.8 + ((x * 5 + y * 3) % 4) * 0.12]); g.set(6, 6, hi); g.set(7, 6, hi); g.set(10, 9, hi, 0.9); }); }
lump("coal", 0x2a2a2a, 0x555555); lump("charcoal", 0x3b3028, 0x6a5848);
function ingot(name, hex) { icon(name, (g) => { g.poly([[2, 9], [5.5, 5], [14, 5], [10.5, 9]], () => [hex, 1.12]); g.poly([[2, 9], [10.5, 9], [10.5, 12.5], [2, 12.5]], () => [hex, 0.9]); g.poly([[10.5, 9], [14, 5], [14, 8.5], [10.5, 12.5]], () => [hex, 0.7]); }); }
ingot("iron_ingot", 0xdcdcdc); ingot("gold_ingot", 0xf6d63a);
icon("diamond", (g) => { g.poly([[2.5, 6], [5.5, 2.5], [10.5, 2.5], [13.5, 6], [8, 13.5]], (x, y) => [0x3de3d6, y < 6 ? 1.15 : 0.9 - (x > 8 ? 0.15 : 0)]); g.line(5, 6, 11, 6, 0xcffffa, 1); g.set(6, 4, 0xffffff, 1); });
icon("string", (g) => { for (let i = 0; i < 12; i++) g.set(2 + i, 13 - i + (i % 2), 0xf0f0f0, i % 3 ? 1 : 0.85); });
icon("flint", (g) => { g.poly([[3, 12], [6, 4], [10, 7], [13, 12], [8, 13.5]], (x, y) => [0x4a4a4e, 0.85 + ((x + y) % 3) * 0.14]); g.set(6, 6, 0x8a8a90); });
icon("clay_ball", (g) => { g.ell(8, 8, 4.6, 4.6, (x, y) => [0xa2a7b8, (x + y < 14 ? 1.1 : 0.85)]); });
icon("brick", (g) => { g.rect(3, 5, 12, 11, 0x9a4f43, 1); g.rect(3, 5, 12, 6, 0xb86a5c, 1); g.rect(3, 11, 12, 11, 0x6e352c, 1); });
icon("bone", (g) => { g.line(4, 12, 12, 4, 0xe9e5d2, 1); g.line(5, 12, 12, 5, 0xcfcab4, 1); g.rect(2, 11, 4, 13, 0xe9e5d2, 1); g.rect(11, 2, 13, 4, 0xe9e5d2, 1); });
icon("bonemeal", (g) => { for (const p of [[5, 9], [7, 7], [9, 9], [6, 11], [8, 11], [10, 11], [8, 9], [7, 9], [9, 11]]) g.set(p[0], p[1], 0xf2f2f2, p[0] % 2 ? 1 : 0.85); });
icon("feather", (g) => { g.poly([[3, 13], [5, 6], [10, 2], [13, 3], [11, 9], [6, 13]], (x, y) => [0xf4f4f4, x + y < 14 ? 1 : 0.82]); g.line(3, 13, 11, 4, 0xbdbdbd, 1); });
icon("leather", (g) => { g.poly([[3, 4], [13, 4], [12, 12], [4, 12]], (x, y) => [0x9b5a2c, 0.85 + ((x * 3 + y) % 4) * 0.1]); g.rect(3, 4, 12, 5, 0xb87a48, 1); });
icon("seeds", (g) => { for (const p of [[5, 7], [8, 5], [10, 8], [7, 10], [11, 11], [4, 11]]) { g.set(p[0], p[1], 0x6d8a2a, 1); g.set(p[0] + 1, p[1], 0x4f6a1c, 1); } });
icon("wheat_item", (g) => { g.line(8, 14, 8, 4, 0x8aa83a, 1); for (let i = 0; i < 4; i++) { g.set(6, 3 + i * 2, 0xd5b13a); g.set(10, 4 + i * 2, 0xd5b13a); g.set(7, 2 + i * 2, 0xe8c64a); g.set(9, 3 + i * 2, 0xe8c64a); } });
icon("bread", (g) => { g.ell(8, 9, 6, 3.7, (x, y) => [0xc58a3d, y < 8 ? 1.15 : 0.82]); for (const p of [[5, 7], [8, 6], [11, 7]]) g.line(p[0], p[1], p[0] + 1, p[1] + 2, 0x8e5f22, 1); });
icon("apple", (g) => { g.ell(8, 9, 4.8, 4.6, (x, y) => [0xd22b2b, x < 7 && y < 9 ? 1.18 : 0.88]); g.line(8, 4, 9, 2, 0x6d5433, 1); g.rect(9, 3, 11, 4, 0x4f9d2f, 1); g.set(6, 7, 0xffd0d0); });
function meat(name, raw, kind) {
  icon(name, (g) => {
    const main = raw ? (kind === "chicken" ? 0xe8b4a0 : kind === "mutton" ? 0xc9504a : 0xe08a8a) : (kind === "chicken" ? 0xb97a3a : 0x7a4222), dark = raw ? 0xa04040 : 0x4a2412;
    if (kind === "chicken") { g.ell(7, 7.5, 4.4, 3.6, (x, y) => [main, y < 7 ? 1.12 : 0.85]); g.line(9, 10, 13, 14, 0xeee9d6, 1); g.rect(12, 13, 14, 14, 0xeee9d6, 1); }
    else { g.poly([[2.5, 8], [5, 4], [11, 4], [13.5, 8], [11, 12.5], [5, 12.5]], (x, y) => [main, y < 7 ? 1.12 : 0.84]); g.rect(4, 8, 11, 8, dark, 0.9); if (raw) g.set(9, 6, 0xffe0e0); }
  });
}
meat("raw_pork", 1, "pork"); meat("cooked_pork", 0, "pork"); meat("raw_beef", 1, "beef"); meat("cooked_beef", 0, "beef"); meat("raw_mutton", 1, "mutton"); meat("cooked_mutton", 0, "mutton"); meat("raw_chicken", 1, "chicken"); meat("cooked_chicken", 0, "chicken");
icon("rotten", (g) => { g.poly([[3, 6], [8, 3.5], [13, 6], [12, 12], [5, 12.5]], (x, y) => [0x6f7a3a, 0.7 + ((x * 7 + y * 3) % 5) * 0.1]); g.set(6, 7, 0xa8624a); g.set(10, 9, 0xa8624a); g.set(8, 10, 0x4a4a2a); });
icon("door_item", (g) => { g.rect(4, 1, 11, 14, 0xa88346, 1); g.rect(4, 1, 11, 1, 0xc9a35d, 1); g.rect(5, 3, 10, 6, 0x8a6a35, 1); g.rect(5, 9, 10, 12, 0x8a6a35, 1); g.set(10, 8, 0xe0e0e0); });
function bucketIcon(name, fillHex) { icon(name, (g) => { g.poly([[3, 4], [13, 4], [11.5, 14], [4.5, 14]], (x, y) => [0xb8b8b8, x < 8 ? 1.1 : 0.82]); g.rect(3, 4, 12, 5, 0xe0e0e0, 1); if (fillHex) g.rect(4, 5, 11, 6, fillHex, 1); }); }
bucketIcon("bucket", 0); bucketIcon("bucket_water", 0x2d5fd0); bucketIcon("bucket_lava", 0xff7a1c);
icon("flint_steel", (g) => { g.rect(3, 8, 10, 12, 0x9a9a9a, 1); g.rect(4, 9, 9, 11, 0x1a1a1a, 1); g.poly([[9, 4], [13, 5], [12, 9], [8, 8]], (x, y) => [0x4a4a4e, 1]); g.set(11, 6, 0xffd23a); });
icon("shears", (g) => { g.line(3, 13, 12, 3, 0xdedede, 1); g.line(12, 13, 3, 3, 0xbdbdbd, 1); g.rect(2, 12, 4, 14, 0xb83232, 1); g.rect(11, 12, 13, 14, 0xb83232, 1); });
icon("bow", (g) => { for (let i = 0; i <= 12; i++) { const t = i / 12, x = 4 + Math.sin(t * Math.PI) * 6, y = 2 + t * 12; g.set(x, y, 0x8b6a3a, 1); g.set(x + 1, y, 0x6b5530, 1); } g.line(4, 2, 4, 14, 0xeeeeee, 1); });
icon("arrow", (g) => { g.line(3, 13, 12, 4, HANDLE, 1); g.poly([[10, 6], [14, 2], [13, 7], [14, 2], [9, 3]], () => [0x9a9a9a, 1]); g.line(2, 12, 4, 14, 0xf0f0f0, 1); g.line(3, 11, 5, 13, 0xf0f0f0, 1); });

/* ===================== ATLAS ===================== */
const ATLAS_N = 16, ATLAS_PX = ATLAS_N * 16;
TIX.white = 255;
let ATLAS = null, ATLAS_DATA = null;
function buildAtlas() {
  if (ATLAS) return ATLAS;
  if (TILES.length > 255) throw new Error("za dużo tekstur: " + TILES.length);
  const cv = document.createElement("canvas"); cv.width = cv.height = ATLAS_PX;
  const cx = cv.getContext("2d"), img = cx.createImageData(ATLAS_PX, ATLAS_PX), d = img.data;
  const put = (ti, x, y, c) => { const tx = (ti % ATLAS_N) * 16 + x, ty = Math.floor(ti / ATLAS_N) * 16 + y, o = (ty * ATLAS_PX + tx) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3]; };
  TILES.forEach((t, ti) => {
    if (t.icon) {
      const buf = new Array(256).fill(null); t.icon(IG(buf));
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        let c = buf[y * 16 + x];
        if (!c) {
          let near = false;
          if (x > 0 && buf[y * 16 + x - 1]) near = true; else if (x < 15 && buf[y * 16 + x + 1]) near = true; else if (y > 0 && buf[(y - 1) * 16 + x]) near = true; else if (y < 15 && buf[(y + 1) * 16 + x]) near = true;
          c = near ? [20, 14, 10, 215] : NA;
        }
        put(ti, x, y, c);
      }
    } else {
      const s = t.salt, rn = (x, y, k) => { k = k | 0; return hash2(x + k * 57, y + k * 91, s + k * 1013); };
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(ti, x, y, t.fn(x, y, rn));
    }
  });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(255, x, y, [255, 255, 255, 255]);
  cx.putImageData(img, 0, 0); ATLAS = cv; ATLAS_DATA = d; return cv;
}

/* ===================== IKONY DO INTERFEJSU ===================== */
const TINTC = { gt: 0x84d25c, gc: 0x84d25c, lf: 0x62b83a };
function tileCanvas(ti, tint) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 16; const cx = cv.getContext("2d");
  cx.drawImage(buildAtlas(), (ti % ATLAS_N) * 16, Math.floor(ti / ATLAS_N) * 16, 16, 16, 0, 0, 16, 16);
  if (tint) {
    const im = cx.getImageData(0, 0, 16, 16), d = im.data, r = (tint >> 16) & 255, g = (tint >> 8) & 255, b = tint & 255;
    for (let i = 0; i < d.length; i += 4) { d[i] = d[i] * r / 255; d[i + 1] = d[i + 1] * g / 255; d[i + 2] = d[i + 2] * b / 255; }
    cx.putImageData(im, 0, 0);
  }
  return cv;
}
function faceTileName(b, face, meta) {
  const t = b.tex; if (typeof t === "string") return t;
  if (face === 2) return t.t; if (face === 3) return t.b;
  if (t.f && face === 4) return t.f;
  return t.s;
}
const ICON_CACHE = {};
function iconURL(id) {
  if (ICON_CACHE[id]) return ICON_CACHE[id];
  const S = 32, cv = document.createElement("canvas"); cv.width = cv.height = S; const c = cv.getContext("2d"); c.imageSmoothingEnabled = false;
  let url = "";
  if (id >= 256) {
    const t = TIX["i_" + ITM[id].key];
    c.drawImage(tileCanvas(t), 0, 0, 16, 16, 0, 0, S, S);
  } else {
    const b = BLK[id], sh = b.shape;
    const flat = sh === 1 || sh === 2 || sh === 6 || sh === 8 || sh === 5;
    if (flat) {
      const nm = sh === 5 ? "i_door_item" : sh === 8 ? "i_seeds" : faceTileName(b, 4);
      const tn = TIX[nm]; const tint = b.tint ? (typeof b.tint === "number" ? b.tint : TINTC[b.tint]) : 0;
      c.drawImage(tileCanvas(tn, tint), 0, 0, 16, 16, 0, 0, S, S);
    } else {
      const top = TIX[faceTileName(b, 2)], left = TIX[faceTileName(b, 4)], right = TIX[faceTileName(b, 0)];
      const tintT = b.tint ? (typeof b.tint === "number" ? b.tint : TINTC[b.tint]) : 0;
      const tintS = typeof b.tint === "number" || b.tint === "lf" ? (typeof b.tint === "number" ? b.tint : TINTC.lf) : 0;
      const slab = sh === 3 || sh === 11 || sh === 9;
      const k = S / 32, hgt = slab ? 0.5 : 1;
      c.save(); c.setTransform(k, k / 2, -k, k / 2, S / 2, slab ? S * 0.25 : 0); c.drawImage(tileCanvas(top, tintT), 0, 0); c.restore();
      c.save(); c.setTransform(k, k / 2, 0, k * hgt, 0, S / 4 + (slab ? S * 0.25 : 0)); c.drawImage(tileCanvas(left, tintS), 0, 0); c.fillStyle = "rgba(0,0,0,.22)"; c.fillRect(0, 0, 16, 16); c.restore();
      c.save(); c.setTransform(k, -k / 2, 0, k * hgt, S / 2, S / 2 + (slab ? S * 0.25 : 0)); c.drawImage(tileCanvas(right, tintS), 0, 0); c.fillStyle = "rgba(0,0,0,.4)"; c.fillRect(0, 0, 16, 16); c.restore();
    }
  }
  url = cv.toDataURL(); ICON_CACHE[id] = url; return url;
}
/* ===================== ŚWIAT ===================== */
const DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const ckey = (cx, cz) => (cx + 30000) * 60000 + (cz + 30000);
const pkey = (x, y, z) => (y * 65536 + (z + 32768)) * 65536 + (x + 32768);
const unpk = (k) => { const x = (k % 65536) - 32768, r = Math.floor(k / 65536), z = (r % 65536) - 32768, y = Math.floor(r / 65536); return [x, y, z]; };
const IX = (x, y, z) => (y << 8) | ((z & 15) << 4) | (x & 15);
const TORCH_SUP = [null, [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]];
const BIO = { PLAINS: 0, FOREST: 1, DESERT: 2, SNOW: 3, MOUNT: 4 };

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.b = new Uint8Array(CVOL); this.m = new Uint8Array(CVOL); this.sky = new Uint8Array(CVOL); this.blk = new Uint8Array(CVOL);
    this.bio = new Uint8Array(CSQ); this.hm = new Uint8Array(CSQ);
    this.mesh = null; this.dirty = true; this.sdirty = false; this.lit = false; this.empty = false;
  }
}
function rleEnc(arr) { const out = []; let i = 0; const n = arr.length; while (i < n) { const v = arr[i]; let j = i + 1; while (j < n && arr[j] === v && j - i < 255) j++; out.push(v, j - i); i = j; } return out; }
function rleDec(buf, from, to, dst) { let o = 0; for (let i = from; i < to; i += 2) { const v = buf[i], n = buf[i + 1]; dst.fill(v, o, o + n); o += n; } }
function encodeChunk(c) {
  const bp = rleEnc(c.b), mp = rleEnc(c.m), out = new Uint8Array(4 + bp.length + mp.length);
  out[0] = bp.length >>> 24; out[1] = (bp.length >>> 16) & 255; out[2] = (bp.length >>> 8) & 255; out[3] = bp.length & 255;
  out.set(bp, 4); out.set(mp, 4 + bp.length); return out;
}
function decodeChunk(c, buf) {
  const bl = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
  rleDec(buf, 4, 4 + bl, c.b); rleDec(buf, 4 + bl, buf.length, c.m);
}

/* kolejki światła */
const LQ = [{ a: new Int32Array(3 * 600000), h: 0, t: 0 }, { a: new Int32Array(3 * 600000), h: 0, t: 0 }];
const RQ = { a: new Int32Array(4 * 400000), h: 0, t: 0 };
function lqPush(ch, x, y, z) { const q = LQ[ch]; if (q.t + 3 > q.a.length) return; q.a[q.t++] = x; q.a[q.t++] = y; q.a[q.t++] = z; }

class World {
  constructor(seed) {
    this.seed = seed | 0; this.chunks = new Map(); this.saved = new Map(); this.pending = new Map(); this.updates = []; this.updSet = new Set();
    this.fl = [new Set(), new Set()]; this.tiles = new Map(); this.hooks = {}; this.spawnPending = [];
    this.fluidT = [0, 0]; this.rtT = 0; this.genCount = 0;
  }
  chunk(cx, cz) { return this.chunks.get(ckey(cx, cz)); }
  get(x, y, z) { if (y < 0) return BID.bedrock; if (y >= WH) return 0; const c = this.chunks.get(ckey(x >> 4, z >> 4)); return c ? c.b[IX(x, y, z)] : BID.bedrock; }
  getM(x, y, z) { if (y < 0 || y >= WH) return 0; const c = this.chunks.get(ckey(x >> 4, z >> 4)); return c ? c.m[IX(x, y, z)] : 0; }
  setM(x, y, z, m) { if (y < 0 || y >= WH) return; const c = this.chunks.get(ckey(x >> 4, z >> 4)); if (!c) return; c.m[IX(x, y, z)] = m; c.sdirty = true; this.touch(c, x, z); }
  sky(x, y, z) { if (y >= WH) return 15; if (y < 0) return 0; const c = this.chunks.get(ckey(x >> 4, z >> 4)); return c ? c.sky[IX(x, y, z)] : 0; }
  blk(x, y, z) { if (y < 0 || y >= WH) return 0; const c = this.chunks.get(ckey(x >> 4, z >> 4)); return c ? c.blk[IX(x, y, z)] : 0; }
  has(x, z) { return this.chunks.has(ckey(x >> 4, z >> 4)); }
  touch(c, x, z) {
    c.dirty = true; const lx = x & 15, lz = z & 15;
    if (lx === 0) { const n = this.chunks.get(ckey(c.cx - 1, c.cz)); if (n) n.dirty = true; } else if (lx === 15) { const n = this.chunks.get(ckey(c.cx + 1, c.cz)); if (n) n.dirty = true; }
    if (lz === 0) { const n = this.chunks.get(ckey(c.cx, c.cz - 1)); if (n) n.dirty = true; } else if (lz === 15) { const n = this.chunks.get(ckey(c.cx, c.cz + 1)); if (n) n.dirty = true; }
  }
  /* ---- światło ---- */
  lightAdd(ch) {
    const q = LQ[ch], a = q.a;
    while (q.h < q.t) {
      const x = a[q.h++], y = a[q.h++], z = a[q.h++];
      const c0 = this.chunks.get(ckey(x >> 4, z >> 4)); if (!c0) continue;
      const l = (ch ? c0.blk : c0.sky)[IX(x, y, z)];
      if (l <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const dd = DIRS6[d], nx = x + dd[0], ny = y + dd[1], nz = z + dd[2];
        if (ny < 0 || ny >= WH) continue;
        const c = (nx >> 4 === c0.cx && nz >> 4 === c0.cz) ? c0 : this.chunks.get(ckey(nx >> 4, nz >> 4)); if (!c) continue;
        const i = IX(nx, ny, nz), op = LOP[c.b[i]]; if (op >= 15) continue;
        let nl = l - (op > 1 ? op : 1);
        if (ch === 0 && dd[1] === -1 && l === 15 && op === 0) nl = 15;
        const arr = ch ? c.blk : c.sky;
        if (arr[i] < nl) { arr[i] = nl; this.touch(c, nx, nz); if (q.t + 3 <= a.length) { a[q.t++] = nx; a[q.t++] = ny; a[q.t++] = nz; } }
      }
    }
    q.h = q.t = 0;
  }
  lightRemove(ch, x, y, z, level) {
    const r = RQ, ra = r.a; r.h = r.t = 0;
    ra[r.t++] = x; ra[r.t++] = y; ra[r.t++] = z; ra[r.t++] = level;
    while (r.h < r.t) {
      const px = ra[r.h++], py = ra[r.h++], pz = ra[r.h++], pl = ra[r.h++];
      for (let d = 0; d < 6; d++) {
        const dd = DIRS6[d], nx = px + dd[0], ny = py + dd[1], nz = pz + dd[2];
        if (ny < 0 || ny >= WH) continue;
        const c = this.chunks.get(ckey(nx >> 4, nz >> 4)); if (!c) continue;
        const arr = ch ? c.blk : c.sky, i = IX(nx, ny, nz), nl = arr[i];
        if (nl === 0) continue;
        if (nl < pl || (ch === 0 && dd[1] === -1 && pl === 15 && nl === 15)) {
          arr[i] = 0; this.touch(c, nx, nz);
          if (ch && LIGHT[c.b[i]] > 0) { arr[i] = LIGHT[c.b[i]]; lqPush(1, nx, ny, nz); }
          if (r.t + 4 <= ra.length) { ra[r.t++] = nx; ra[r.t++] = ny; ra[r.t++] = nz; ra[r.t++] = nl; }
        } else lqPush(ch, nx, ny, nz);
      }
    }
    r.h = r.t = 0;
  }
  lightUpdate(x, y, z, oldId, newId) {
    const c = this.chunks.get(ckey(x >> 4, z >> 4)), i = IX(x, y, z);
    const osky = c.sky[i], oblk = c.blk[i];
    if (osky > 0) { c.sky[i] = 0; this.lightRemove(0, x, y, z, osky); }
    if (oblk > 0) { c.blk[i] = 0; this.lightRemove(1, x, y, z, oblk); }
    const em = LIGHT[newId]; if (em > 0) { c.blk[i] = em; lqPush(1, x, y, z); }
    if (LOP[newId] < 15) {
      if (LOP[newId] === 0 && this.sky(x, y + 1, z) === 15) { c.sky[i] = 15; lqPush(0, x, y, z); }
      for (let d = 0; d < 6; d++) { const dd = DIRS6[d]; const ny = y + dd[1]; if (ny < 0 || ny >= WH) continue; lqPush(0, x + dd[0], ny, z + dd[2]); lqPush(1, x + dd[0], ny, z + dd[2]); }
    }
    this.lightAdd(0); this.lightAdd(1);
    this.touch(c, x, z);
  }
  initLight(c) {
    const b = c.b, sky = c.sky, blk = c.blk; sky.fill(0); blk.fill(0);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      let y = WH - 1;
      for (; y >= 0; y--) { if (LOP[b[(y << 8) | (z << 4) | x]] > 0) break; sky[(y << 8) | (z << 4) | x] = 15; }
      c.hm[(z << 4) | x] = y + 1;
    }
    const wx0 = c.cx * 16, wz0 = c.cz * 16;
    for (let y = 0; y < WH; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const i = (y << 8) | (z << 4) | x, id = b[i];
      if (LIGHT[id] > 0) { blk[i] = LIGHT[id]; lqPush(1, wx0 + x, y, wz0 + z); }
      if (sky[i] === 15) {
        let need = false;
        if (x > 0 && sky[i - 1] < 15 && LOP[b[i - 1]] < 15) need = true; else if (x < 15 && sky[i + 1] < 15 && LOP[b[i + 1]] < 15) need = true;
        else if (z > 0 && sky[i - 16] < 15 && LOP[b[i - 16]] < 15) need = true; else if (z < 15 && sky[i + 16] < 15 && LOP[b[i + 16]] < 15) need = true;
        else if (y > 0 && sky[i - 256] < 15 && LOP[b[i - 256]] < 15) need = true;
        else if (x === 0 || x === 15 || z === 0 || z === 15) need = true;
        if (need) lqPush(0, wx0 + x, y, wz0 + z);
      }
    }
    this.lightAdd(0); this.lightAdd(1);
    /* krawędzie: wpuść światło do sąsiadów i od sąsiadów */
    for (let y = 0; y < WH; y++) for (let k = 0; k < CS; k++) {
      const edge = [[0, k, -1, 0], [15, k, 1, 0], [k, 0, 0, -1], [k, 15, 0, 1]];
      for (let e = 0; e < 4; e++) {
        const ex = edge[e][0], ez = edge[e][1], nx = wx0 + ex + edge[e][2], nz = wz0 + ez + edge[e][3];
        if (!this.has(nx, nz)) continue;
        for (let ch = 0; ch < 2; ch++) { lqPush(ch, wx0 + ex, y, wz0 + ez); lqPush(ch, nx, y, nz); }
      }
    }
    this.lightAdd(0); this.lightAdd(1);
    c.lit = true;
  }
  /* ---- zmiany bloków ---- */
  setBlock(x, y, z, id, meta, silent) {
    if (y < 0 || y >= WH) return false;
    const c = this.chunks.get(ckey(x >> 4, z >> 4)); if (!c) return false;
    const i = IX(x, y, z), old = c.b[i];
    c.b[i] = id; c.m[i] = meta || 0; c.sdirty = true;
    const hi = ((z & 15) << 4) | (x & 15);
    if (LOP[id] > 0 && y >= c.hm[hi]) c.hm[hi] = y + 1; else if (LOP[id] === 0 && y === c.hm[hi] - 1) { let yy = y; while (yy >= 0 && LOP[c.b[(yy << 8) | hi]] === 0) yy--; c.hm[hi] = yy + 1; }
    this.touch(c, x, z);
    if (c.lit) this.lightUpdate(x, y, z, old, id);
    if (!silent) this.queueUpdate(x, y, z);
    if (old !== id && this.tiles.size) { const tk = pkey(x, y, z), t = this.tiles.get(tk); if (t && id !== BID.furnace_on && id !== BID.furnace && id !== BID.chest) { this.tiles.delete(tk); if (this.hooks.tileLost) this.hooks.tileLost(x, y, z, t); } }
    return true;
  }
  queueUpdate(x, y, z) {
    const push = (a, b, c) => { if (b < 0 || b >= WH) return; const k = pkey(a, b, c); if (!this.updSet.has(k)) { this.updSet.add(k); this.updates.push(k); } };
    push(x, y, z); for (let d = 0; d < 6; d++) push(x + DIRS6[d][0], y + DIRS6[d][1], z + DIRS6[d][2]);
  }
  processUpdates(max) {
    let n = 0;
    while (this.updates.length && n++ < max) { const k = this.updates.shift(); this.updSet.delete(k); const p = unpk(k); this.blockUpdate(p[0], p[1], p[2]); }
  }
  supported(x, y, z, id, meta) {
    const b = BLK[id];
    if (b.supp) {
      const below = this.get(x, y - 1, z);
      if (b.supp === "soil") return isSoil(below);
      if (b.supp === "farm") return below === BID.farmland;
      if (b.supp === "sand") return below === BID.sand || below === BID.dirt || below === BID.sandstone || (id === BID.cactus && below === BID.cactus);
      if (b.supp === "torch") { if (meta === 0) return OPQ[below] === 1 || below === BID.glass || BLK[below].shape === 3 || BLK[below].shape === 4; const s = TORCH_SUP[meta]; return !!s && OPQ[this.get(x + s[0], y, z + s[2])] === 1; }
      if (b.supp === "wall") { const s = TORCH_SUP[meta]; return !!s && OPQ[this.get(x + s[0], y, z + s[2])] === 1; }
    }
    if (id === BID.door_lower) return SOLID[this.get(x, y - 1, z)] === 1 && this.get(x, y + 1, z) === BID.door_upper;
    if (id === BID.door_upper) return this.get(x, y - 1, z) === BID.door_lower;
    return true;
  }
  blockUpdate(x, y, z) {
    if (!this.has(x, z)) return;
    const id = this.get(x, y, z); if (id === 0) return;
    const b = BLK[id], meta = this.getM(x, y, z);
    if (!this.supported(x, y, z, id, meta)) { if (this.hooks.breakDrop) this.hooks.breakDrop(x, y, z, id, meta); this.setBlock(x, y, z, 0, 0); return; }
    if (b.fall) { const bl = this.get(x, y - 1, z); if (y > 0 && !SOLID[bl] && bl !== BID.sapling_oak) { this.setBlock(x, y, z, 0, 0); if (this.hooks.fall) this.hooks.fall(x, y, z, id); } return; }
    if (b.fluid) { this.fl[b.fluid - 1].add(pkey(x, y, z)); return; }
    if (id === BID.farmland && SOLID[this.get(x, y + 1, z)]) { this.setBlock(x, y, z, BID.dirt, 0); return; }
    if (id === BID.grass && OPQ[this.get(x, y + 1, z)] === 1) { this.setBlock(x, y, z, BID.dirt, 0, true); }
    if (OPQ[id] === 0 || b.fluid) { /* płyny w sąsiedztwie */ }
    for (let d = 0; d < 6; d++) { const nb = this.get(x + DIRS6[d][0], y + DIRS6[d][1], z + DIRS6[d][2]); if (BLK[nb].fluid) { this.fl[BLK[nb].fluid - 1].add(pkey(x + DIRS6[d][0], y + DIRS6[d][1], z + DIRS6[d][2])); } }
  }
  /* ---- płyny ---- */
  canFlowInto(id) { const b = BLK[id]; return id === 0 || (b.rep && !b.fluid) || (!b.solid && b.shape !== 5 && b.shape !== 6 && b.shape !== 2 && !b.fluid && b.hard === 0); }
  setFluid(x, y, z, kind, meta) {
    const cur = this.get(x, y, z), fid = kind === 1 ? BID.water : BID.lava;
    if (cur === fid) { if (this.getM(x, y, z) !== meta) this.setBlock(x, y, z, fid, meta, true), this.fl[kind - 1].add(pkey(x, y, z)); return; }
    const cb = BLK[cur];
    if (cb.fluid && cb.fluid !== kind) {
      if (kind === 1) { if (this.getM(x, y, z) === 0) this.setBlock(x, y, z, BID.obsidian, 0); else this.setBlock(x, y, z, BID.cobble, 0); }
      else this.setBlock(x, y, z, BID.cobble, 0);
      if (this.hooks.sfx) this.hooks.sfx("splash", x, y, z);
      return;
    }
    if (!this.canFlowInto(cur)) return;
    if (cur !== 0 && this.hooks.breakDrop && !cb.fluid) this.hooks.breakDrop(x, y, z, cur, this.getM(x, y, z));
    this.setBlock(x, y, z, fid, meta, true);
    this.fl[kind - 1].add(pkey(x, y, z));
  }
  fluidStep(kind, x, y, z) {
    const fid = kind === 1 ? BID.water : BID.lava, id = this.get(x, y, z);
    if (id !== fid) return;
    let meta = this.getM(x, y, z); const maxL = kind === 1 ? 7 : 3;
    /* woda przy lawie */
    if (kind === 2) { for (let d = 0; d < 6; d++) { if (d === 3) continue; const nb = this.get(x + DIRS6[d][0], y + DIRS6[d][1], z + DIRS6[d][2]); if (nb === BID.water) { this.setBlock(x, y, z, meta === 0 ? BID.obsidian : BID.cobble, 0); return; } } }
    if (meta !== 0) {
      let nm = -1;
      if (this.get(x, y + 1, z) === fid) nm = 8;
      else {
        let best = 99;
        for (let d = 0; d < 6; d++) { if (DIRS6[d][1] !== 0) continue; const nx = x + DIRS6[d][0], nz = z + DIRS6[d][2]; if (this.get(nx, y, nz) === fid) { const nmeta = this.getM(nx, y, nz), lv = nmeta === 8 ? 0 : nmeta; if (lv + 1 < best) best = lv + 1; } }
        if (best <= maxL) nm = best;
      }
      if (nm < 0) { this.setBlock(x, y, z, 0, 0); return; }
      if (nm !== meta) { this.setBlock(x, y, z, fid, nm, true); meta = nm; for (let d = 0; d < 6; d++) this.fl[kind - 1].add(pkey(x + DIRS6[d][0], y + DIRS6[d][1], z + DIRS6[d][2])); }
    } else if (kind === 1) {
      /* nieskończona woda */
      let src = 0; for (let d = 0; d < 6; d++) { if (DIRS6[d][1] !== 0) continue; if (this.get(x + DIRS6[d][0], y, z + DIRS6[d][2]) === fid && this.getM(x + DIRS6[d][0], y, z + DIRS6[d][2]) === 0) src++; }
      /* (źródło już jest źródłem) */
    }
    /* rozlewanie */
    const below = this.get(x, y - 1, z);
    if (y > 0 && (this.canFlowInto(below) || (BLK[below].fluid && BLK[below].fluid !== kind))) { this.setFluid(x, y - 1, z, kind, 8); return; }
    if (below === fid && this.getM(x, y - 1, z) !== 8 && this.getM(x, y - 1, z) !== 0) { this.setFluid(x, y - 1, z, kind, 8); return; }
    const L = meta === 8 ? 1 : meta + 1;
    if (L <= maxL && (SOLID[below] || (below === fid))) {
      for (let d = 0; d < 6; d++) {
        if (DIRS6[d][1] !== 0) continue;
        const nx = x + DIRS6[d][0], nz = z + DIRS6[d][2], nb = this.get(nx, y, nz);
        if (nb === fid) { const nm = this.getM(nx, y, nz); if (nm !== 0 && nm !== 8 && nm > L) this.setFluid(nx, y, nz, kind, L); }
        else if (this.canFlowInto(nb) || (BLK[nb].fluid && BLK[nb].fluid !== kind)) this.setFluid(nx, y, nz, kind, L);
      }
    }
    /* woda staje się źródłem, gdy ma dwa źródła obok i podłoże */
    if (kind === 1 && meta !== 0) {
      let src = 0; for (let d = 0; d < 6; d++) { if (DIRS6[d][1] !== 0) continue; const nx = x + DIRS6[d][0], nz = z + DIRS6[d][2]; if (this.get(nx, y, nz) === fid && this.getM(nx, y, nz) === 0) src++; }
      if (src >= 2 && (SOLID[below] || (below === fid && this.getM(x, y - 1, z) === 0))) this.setBlock(x, y, z, fid, 0, true);
    }
  }
  tickFluids(dt) {
    for (let k = 0; k < 2; k++) {
      this.fluidT[k] += dt;
      const per = k === 0 ? 0.25 : 1.2;
      if (this.fluidT[k] < per) continue;
      this.fluidT[k] = 0;
      const set = this.fl[k]; if (!set.size) continue;
      const arr = Array.from(set); set.clear();
      let n = 0;
      for (const key of arr) { if (n++ > 700) { set.add(key); continue; } const p = unpk(key); if (this.has(p[0], p[2])) this.fluidStep(k + 1, p[0], p[1], p[2]); }
    }
  }
  /* ---- losowe ticki ---- */
  randomTicks(px, pz, radius) {
    const pcx = px >> 4, pcz = pz >> 4;
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      const c = this.chunks.get(ckey(pcx + dx, pcz + dz)); if (!c || !c.lit) continue;
      for (let n = 0; n < 5; n++) {
        const lx = (Math.random() * 16) | 0, lz = (Math.random() * 16) | 0, y = (Math.random() * WH) | 0, i = (y << 8) | (lz << 4) | lx, id = c.b[i];
        if (id === 0) continue;
        const wx = c.cx * 16 + lx, wz = c.cz * 16 + lz;
        if (id === BID.grass) {
          if (OPQ[this.get(wx, y + 1, wz)] === 1) { this.setBlock(wx, y, wz, BID.dirt, 0); continue; }
          const tx = wx + ri(-1, 1), ty = y + ri(-1, 1), tz = wz + ri(-1, 1);
          if (this.get(tx, ty, tz) === BID.dirt && !OPQ[this.get(tx, ty + 1, tz)] && this.sky(tx, ty + 1, tz) >= 9) this.setBlock(tx, ty, tz, BID.grass, 0);
        } else if (id === BID.wheat) {
          const m = c.m[i]; if (m < 7 && (this.sky(wx, y, wz) >= 9 || this.blk(wx, y, wz) >= 9)) { const wet = this.getM(wx, y - 1, wz) === 1; if (Math.random() < (wet ? 0.5 : 0.25)) this.setM(wx, y, wz, m + 1); }
        } else if (id === BID.farmland) {
          let wet = false;
          for (let ax = -3; ax <= 3 && !wet; ax++) for (let az = -3; az <= 3 && !wet; az++) for (let ay = 0; ay <= 1; ay++) if (this.get(wx + ax, y + ay, wz + az) === BID.water) { wet = true; break; }
          if (wet) { if (c.m[i] !== 1) this.setM(wx, y, wz, 1); } else if (c.m[i] === 1) this.setM(wx, y, wz, 0); else if (this.get(wx, y + 1, wz) !== BID.wheat) this.setBlock(wx, y, wz, BID.dirt, 0);
        } else if (id === BID.sapling_oak || id === BID.sapling_birch || id === BID.sapling_spruce) {
          if (this.sky(wx, y, wz) >= 9 && Math.random() < 0.25) { const kind = id === BID.sapling_oak ? "oak" : id === BID.sapling_birch ? "birch" : "spruce"; this.setBlock(wx, y, wz, 0, 0); this.growTree(kind, wx, y, wz); }
        } else if ((id === BID.leaves_oak || id === BID.leaves_birch || id === BID.leaves_spruce) && c.m[i] === 0) {
          if (!this.nearLog(wx, y, wz)) { if (this.hooks.breakDrop) this.hooks.breakDrop(wx, y, wz, id, 0); this.setBlock(wx, y, wz, 0, 0); }
        } else if (id === BID.cactus && this.get(wx, y + 1, wz) === 0 && this.get(wx, y - 2, wz) !== BID.cactus && this.get(wx, y - 1, wz) !== 0) {
          if (Math.random() < 0.3) this.setBlock(wx, y + 1, wz, BID.cactus, 0);
        }
      }
    }
  }
  nearLog(x, y, z) {
    for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) {
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 5) continue;
      const b = this.get(x + dx, y + dy, z + dz); if (b === BID.log_oak || b === BID.log_birch || b === BID.log_spruce) return true;
    }
    return false;
  }
  growTree(kind, x, y, z) {
    const put = (px, py, pz, id, meta, force) => { const cur = this.get(px, py, pz); if (force || cur === 0 || BLK[cur].rep || cur === BID.leaves_oak || cur === BID.leaves_birch || cur === BID.leaves_spruce) this.setBlock(px, py, pz, id, meta, true); };
    buildTree(kind, x, y, z, put, Math.random);
  }
  /* ---- generacja ---- */
  putPending(x, y, z, id, meta, force) {
    const k = ckey(x >> 4, z >> 4); let a = this.pending.get(k); if (!a) { a = []; this.pending.set(k, a); } a.push(x, y, z, id, meta, force ? 1 : 0);
  }
  genPut(c, x, y, z, id, meta, force) {
    if (y < 0 || y >= WH) return;
    if ((x >> 4) === c.cx && (z >> 4) === c.cz) { const i = IX(x, y, z), cur = c.b[i]; if (force || cur === 0 || BLK[cur].rep || cur === BID.leaves_oak || cur === BID.leaves_birch || cur === BID.leaves_spruce) { c.b[i] = id; c.m[i] = meta; } return; }
    const n = this.chunks.get(ckey(x >> 4, z >> 4));
    if (n) { const cur = n.b[IX(x, y, z)]; if (force || cur === 0 || BLK[cur].rep || cur === BID.leaves_oak || cur === BID.leaves_birch || cur === BID.leaves_spruce) this.setBlock(x, y, z, id, meta, true); }
    else this.putPending(x, y, z, id, meta, force);
  }
  biomeAt(wx, wz) {
    const s = this.seed;
    const t = fbm2(wx / 300, wz / 300, s + 1, 2), m = fbm2(wx / 260, wz / 260, s + 2, 2);
    const cont = fbm2(wx / 230, wz / 230, s + 3, 3), hill = fbm2(wx / 60, wz / 60, s + 4, 3), mt = fbm2(wx / 190, wz / 190, s + 5, 3);
    const mount = clamp((mt - 0.5) * 3.4, 0, 1);
    let height = SEA + 1 + (cont - 0.47) * 34 + (hill - 0.5) * 11 + mount * mount * 28;
    height = clamp(Math.round(height), 3, 56);
    let bio = BIO.PLAINS;
    if (mount > 0.3 && height > 38) bio = BIO.MOUNT; else if (t < 0.4) bio = BIO.SNOW; else if (t > 0.6 && m < 0.5) bio = BIO.DESERT; else if (m > 0.56) bio = BIO.FOREST;
    return { height, bio };
  }
  generate(cx, cz) {
    const c = new Chunk(cx, cz), s = this.seed, b = c.b, wx0 = cx * 16, wz0 = cz * 16;
    const rg = mulberry32(hash2(cx, cz, s) * 4294967296 | 0), hts = new Int16Array(CSQ);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = wx0 + x, wz = wz0 + z, col = this.biomeAt(wx, wz), h = col.height, bio = col.bio; hts[(z << 4) | x] = h; c.bio[(z << 4) | x] = bio;
      const beach = h <= SEA + 1 && bio !== BIO.MOUNT, sandy = bio === BIO.DESERT || beach;
      const patch = vn2(wx / 14, wz / 14, s + 20), gv = h < SEA - 1 && patch > 0.62, cl = h < SEA - 1 && patch < 0.26;
      for (let y = 0; y <= h; y++) {
        let id = BID.stone;
        if (y === 0) id = BID.bedrock; else if (y === 1 && rg() < 0.5) id = BID.bedrock;
        else if (y > h - 4) {
          const d = h - y;
          if (sandy) id = d < 3 ? BID.sand : BID.sandstone;
          else if (h < SEA - 1) id = gv ? BID.gravel : cl ? BID.clay : BID.sand;
          else if (bio === BIO.MOUNT) id = (h >= 52 && d === 0) ? BID.snow_block : (h < 44 && d === 0) ? BID.grass : (h < 44 ? BID.dirt : BID.stone);
          else if (d === 0) id = bio === BIO.SNOW ? BID.snow_grass : BID.grass; else id = BID.dirt;
        }
        b[IX(x, y, z)] = id;
      }
      for (let y = h + 1; y <= SEA; y++) b[IX(x, y, z)] = (y === SEA && bio === BIO.SNOW && h < SEA - 1) ? BID.ice : BID.water;
    }
    /* jaskinie */
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = wx0 + x, wz = wz0 + z, h = hts[(z << 4) | x], top = (h <= SEA - 2) ? h - 7 : h - 3;
      for (let y = 2; y <= top; y++) {
        const a = Math.abs(vn3(wx * 0.05, y * 0.075, wz * 0.05, s + 10) - 0.5), q = Math.abs(vn3(wx * 0.05 + 100, y * 0.075, wz * 0.05 + 100, s + 11) - 0.5);
        let cave = a < 0.042 && q < 0.042;
        if (!cave && y < 30) cave = vn3(wx * 0.04, y * 0.07, wz * 0.04, s + 12) > 0.76;
        if (cave) { const i = IX(x, y, z); if (b[i] !== BID.bedrock) b[i] = y <= 4 ? BID.lava : 0; }
      }
    }
    /* rudy */
    const vein = (id, count, size, y0, y1, only) => {
      for (let n = 0; n < count; n++) {
        let x = (rg() * 16) | 0, y = y0 + ((rg() * (y1 - y0 + 1)) | 0), z = (rg() * 16) | 0;
        for (let j = 0; j < size; j++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 1 && y < WH) { const i = IX(x, y, z); if (b[i] === (only || BID.stone)) b[i] = id; }
          const r = (rg() * 6) | 0; if (r === 0) x++; else if (r === 1) x--; else if (r === 2) y++; else if (r === 3) y--; else if (r === 4) z++; else z--;
        }
      }
    };
    vein(BID.ore_coal, 16, 7, 3, 50); vein(BID.ore_iron, 12, 5, 3, 42); vein(BID.ore_gold, 3, 4, 3, 18); vein(BID.ore_diamond, 2, 3, 2, 14);
    vein(BID.gravel, 4, 22, 5, 50); vein(BID.dirt, 6, 18, 5, 52);
    /* oczka wody w jaskiniach — pomijamy; roślinność */
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = wx0 + x, wz = wz0 + z, h = hts[(z << 4) | x], bio = c.bio[(z << 4) | x], top = b[IX(x, h, z)], r = rg();
      if (h <= SEA || h >= WH - 10) continue;
      if (top === BID.grass || top === BID.snow_grass) {
        if (top === BID.grass && bio !== BIO.MOUNT) {
          if (r < (bio === BIO.FOREST ? 0.045 : 0.004)) { const k = rg(); const kind = bio === BIO.FOREST ? (k < 0.45 ? "birch" : "oak") : "oak"; buildTree(kind, wx, h + 1, wz, (px, py, pz, id, meta, force) => this.genPut(c, px, py, pz, id, meta, force), rg); continue; }
          if (r < 0.25) { b[IX(x, h + 1, z)] = BID.tallgrass; continue; }
          if (r < 0.265) { b[IX(x, h + 1, z)] = rg() < 0.5 ? BID.flower_red : BID.flower_yellow; continue; }
        } else if (bio === BIO.SNOW && r < 0.02) buildTree("spruce", wx, h + 1, wz, (px, py, pz, id, meta, force) => this.genPut(c, px, py, pz, id, meta, force), rg);
        else if (bio === BIO.MOUNT && r < 0.006) buildTree("spruce", wx, h + 1, wz, (px, py, pz, id, meta, force) => this.genPut(c, px, py, pz, id, meta, force), rg);
      } else if (top === BID.sand && bio === BIO.DESERT) {
        if (r < 0.012) { const hh = 1 + ((rg() * 3) | 0); for (let k = 1; k <= hh; k++) b[IX(x, h + k, z)] = BID.cactus; } else if (r < 0.03) b[IX(x, h + 1, z)] = BID.deadbush;
      }
    }
    /* zapamiętane bloki z drzew sąsiadów */
    const pend = this.pending.get(ckey(cx, cz));
    if (pend) { for (let i = 0; i < pend.length; i += 6) this.genPut(c, pend[i], pend[i + 1], pend[i + 2], pend[i + 3], pend[i + 4], pend[i + 5]); this.pending.delete(ckey(cx, cz)); }
    return c;
  }
  loadChunk(cx, cz) {
    const k = ckey(cx, cz); let c = this.chunks.get(k); if (c) return c;
    const sv = this.saved.get(k);
    if (sv) { c = new Chunk(cx, cz); decodeChunk(c, sv); c.sdirty = false; for (let i = 0; i < CSQ; i++) c.bio[i] = 0;  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) c.bio[(z << 4) | x] = this.biomeAt(cx * 16 + x, cz * 16 + z).bio; }
    else { c = this.generate(cx, cz); this.spawnPending.push([cx, cz]); }
    this.chunks.set(k, c); this.genCount++;
    this.initLight(c);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const n = this.chunks.get(ckey(cx + dx, cz + dz)); if (n) n.dirty = true; }
    return c;
  }
  unloadChunk(c, store) {
    if (c.mesh && this.hooks.freeMesh) this.hooks.freeMesh(c);
    if (c.sdirty && store) store(c);
    this.chunks.delete(ckey(c.cx, c.cz));
  }
  topSolid(x, z) { for (let y = WH - 1; y > 0; y--) { const id = this.get(x, y, z); if (SOLID[id] || BLK[id].fluid) return y + 1; } return 1; }
  canMesh(c) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && !this.chunks.has(ckey(c.cx + dx, c.cz + dz))) return false;
    return true;
  }
  /* czy blok jest na świeżym powietrzu (światło nieba) */
  skyExposed(x, y, z) { return this.sky(x, y, z) >= 15; }
}

/* ---- drzewa ---- */
function buildTree(kind, x, y, z, put, rg) {
  const R = (a, b) => a + Math.floor(rg() * (b - a + 1));
  const leaf = kind === "oak" ? BID.leaves_oak : kind === "birch" ? BID.leaves_birch : BID.leaves_spruce, log = kind === "oak" ? BID.log_oak : kind === "birch" ? BID.log_birch : BID.log_spruce;
  if (kind === "spruce") {
    const h = R(6, 8), radii = [0, 1, 1, 2, 2, 3, 3];
    for (let t = 0; t < radii.length; t++) {
      const ly = y + h + 1 - t, r = radii[t]; if (ly < y + 2) break;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { if (Math.abs(dx) + Math.abs(dz) > r + (r > 1 ? 1 : 0)) continue; put(x + dx, ly, z + dz, leaf, 0, false); }
    }
    for (let k = 0; k < h + 1; k++) put(x, y + k, z, log, 0, true);
    return;
  }
  const h = kind === "birch" ? R(5, 7) : R(4, 6);
  for (let dy = h - 3; dy <= h; dy++) {
    const r = dy >= h - 1 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r && (dy >= h - 1 || rg() < 0.5)) continue;
      put(x + dx, y + dy, z + dz, leaf, 0, false);
    }
  }
  for (let k = 0; k < h; k++) put(x, y + k, z, log, 0, true);
}
/* ===================== RENDERER (WebGL2) ===================== */
const GRASS_T = [0x84d25c, 0x6bbf4a, 0xb4c85a, 0x7fc29a, 0x82c06a], LEAF_T = [0x62b83a, 0x52a832, 0x8bb540, 0x5a9f58, 0x62b83a];
const FRONT_FACE = [4, 0, 5, 1];
const DIR4 = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0]]; /* meta (kierunek patrzenia gracza) */
const SHADE = [0.6, 0.6, 1, 0.5, 0.8, 0.8];
const AOF = [0.5, 0.68, 0.84, 1];
const EPS = 0.004;

function tileIdx(b, f, meta) {
  const t = b.tex;
  if (typeof t === "string") { if (b.key === "wheat") return TIX["wheat" + (meta & 7)]; return TIX[t]; }
  if (f === 2) return TIX[t.t]; if (f === 3) return TIX[t.b];
  if (t.f && f === FRONT_FACE[meta & 3]) return TIX[t.f];
  return TIX[t.s];
}
function tintOf(b, f, bio) {
  const t = b.tint; if (!t) return null;
  if (typeof t === "number") return t;
  if (t === "gt") return f === 2 ? GRASS_T[bio] : null;
  if (t === "gc") return GRASS_T[bio];
  if (t === "lf") return LEAF_T[bio];
  return null;
}

class MB {
  constructor(maxV) { this.max = maxV; this.buf = new ArrayBuffer(maxV * 28); this.f = new Float32Array(this.buf); this.u = new Uint8Array(this.buf); this.i = new Uint32Array(maxV * 3); this.nv = 0; this.ni = 0; this.over = false; }
  reset() { this.nv = 0; this.ni = 0; this.over = false; }
  v(x, y, z, u, v, r, g, b, a, s, k) {
    if (this.nv >= this.max) { this.over = true; return; }
    const o = this.nv * 7, f = this.f; f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = u; f[o + 4] = v;
    const q = this.nv * 28 + 20, u8 = this.u; u8[q] = r; u8[q + 1] = g; u8[q + 2] = b; u8[q + 3] = a; u8[q + 4] = s; u8[q + 5] = k; u8[q + 6] = 0; u8[q + 7] = 0;
    this.nv++;
  }
  quad(flip) {
    if (this.over) return; const n = this.nv - 4, i = this.i; let k = this.ni;
    if (!flip) { i[k++] = n; i[k++] = n + 1; i[k++] = n + 2; i[k++] = n; i[k++] = n + 2; i[k++] = n + 3; } else { i[k++] = n + 1; i[k++] = n + 2; i[k++] = n + 3; i[k++] = n + 1; i[k++] = n + 3; i[k++] = n; }
    this.ni = k;
  }
}
const mbS = new MB(110000), mbW = new MB(30000);
/* bufor pomocniczy: chunk + 1 blok z każdej strony */
const PW = 18, PB = new Uint8Array(PW * WH * PW), PS = new Uint8Array(PW * WH * PW), PK = new Uint8Array(PW * WH * PW), PM = new Uint8Array(PW * WH * PW);
const pi = (x, y, z) => (y * PW + (z + 1)) * PW + (x + 1);
function fillPad(W, c) {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const n = W.chunk(c.cx + dx, c.cz + dz); if (!n) continue;
    const z0 = dz === 0 ? 0 : dz === -1 ? 15 : 0, z1 = dz === 0 ? 15 : z0;
    for (let z = z0; z <= z1; z++) {
      const padZ = dz === 0 ? z : dz === -1 ? -1 : 16;
      for (let y = 0; y < WH; y++) {
        const src = (y << 8) | (z << 4);
        if (dx === 0) { const d = pi(0, y, padZ); PB.set(n.b.subarray(src, src + 16), d); PS.set(n.sky.subarray(src, src + 16), d); PK.set(n.blk.subarray(src, src + 16), d); PM.set(n.m.subarray(src, src + 16), d); }
        else { const sx = dx === -1 ? 15 : 0, d = pi(dx === -1 ? -1 : 16, y, padZ); PB[d] = n.b[src + sx]; PS[d] = n.sky[src + sx]; PK[d] = n.blk[src + sx]; PM[d] = n.m[src + sx]; }
      }
    }
  }
}
const pOpq = (x, y, z) => (y < 0 ? 1 : y >= WH ? 0 : OPQ[PB[pi(x, y, z)]]);
const pSky = (x, y, z) => (y >= WH ? 15 : y < 0 ? 0 : PS[pi(x, y, z)]);
const pBlk = (x, y, z) => (y < 0 || y >= WH ? 0 : PK[pi(x, y, z)]);

/* osie stycznych dla ścian */
const FACE_AX = [[[0, 1, 0], [0, 0, 1]], [[0, 1, 0], [0, 0, 1]], [[1, 0, 0], [0, 0, 1]], [[1, 0, 0], [0, 0, 1]], [[1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 1, 0]]];
const CORN = [[-1, -1], [-1, 1], [1, 1], [1, -1]];
let M_bio = 0, M_full = 0;
/* dodaje ścianę boxa; box = [x0,y0,z0,x1,y1,z1] w jednostkach bloku. mb = bufor docelowy */
function emitFace(mb, f, bx, by, bz, bo, tile, tint, baseIn, fb, off, uvTop) {
  const x0 = bo[0], y0 = bo[1], z0 = bo[2], x1 = bo[3], y1 = bo[4], z1 = bo[5];
  const n = DIRS6[f], ax = FACE_AX[f], a1 = ax[0], a2 = ax[1];
  /* podstawa próbkowania światła */
  let sx = bx, sy = by, sz = bz;
  if (baseIn) { /* ściana wewnątrz bloku: światło własnej komórki */ } else { sx += n[0]; sy += n[1]; sz += n[2]; }
  const col = [0, 0, 0, 0], sk = [0, 0, 0, 0], bl = [0, 0, 0, 0], px = [0, 0, 0, 0], py = [0, 0, 0, 0], pz = [0, 0, 0, 0], pu = [0, 0, 0, 0], pv = [0, 0, 0, 0];
  const baseSky = pSky(sx, sy, sz), baseBlk = pBlk(sx, sy, sz);
  let tr = 255, tg = 255, tb = 255;
  if (tint != null) { tr = (tint >> 16) & 255; tg = (tint >> 8) & 255; tb = tint & 255; }
  const sh = SHADE[f] * (fb ? 1 : 1);
  const tu = (tile % ATLAS_N) / ATLAS_N, tv = Math.floor(tile / ATLAS_N) / ATLAS_N, ts = 1 / ATLAS_N;
  for (let k = 0; k < 4; k++) {
    const s1 = CORN[k][0], s2 = CORN[k][1];
    /* pozycja */
    let X, Y, Z;
    if (f === 0) { X = x1; Y = s1 < 0 ? y0 : y1; Z = s2 < 0 ? z0 : z1; }
    else if (f === 1) { X = x0; Y = s1 < 0 ? y0 : y1; Z = s2 < 0 ? z0 : z1; }
    else if (f === 2) { Y = y1; X = s1 < 0 ? x0 : x1; Z = s2 < 0 ? z0 : z1; }
    else if (f === 3) { Y = y0; X = s1 < 0 ? x0 : x1; Z = s2 < 0 ? z0 : z1; }
    else if (f === 4) { Z = z1; X = s1 < 0 ? x0 : x1; Y = s2 < 0 ? y0 : y1; }
    else { Z = z0; X = s1 < 0 ? x0 : x1; Y = s2 < 0 ? y0 : y1; }
    /* UV (wyrównane do świata) */
    let lu, lv;
    if (f === 0) { lu = 1 - Z; lv = 1 - Y; } else if (f === 1) { lu = Z; lv = 1 - Y; } else if (f === 2) { lu = X; lv = Z; } else if (f === 3) { lu = X; lv = 1 - Z; } else if (f === 4) { lu = X; lv = 1 - Y; } else { lu = 1 - X; lv = 1 - Y; }
    if (uvTop) { lu = uvTop[0] + (lu - uvTop[2]) ; lv = uvTop[1] + (lv - uvTop[3]); }
    pu[k] = tu + (EPS + clamp(lu, 0, 1) * (1 - 2 * EPS)) * ts; pv[k] = tv + (EPS + clamp(lv, 0, 1) * (1 - 2 * EPS)) * ts;
    px[k] = bx + X + (off ? off[0] : 0); py[k] = by + Y + (off ? off[1] : 0); pz[k] = bz + Z + (off ? off[2] : 0);
    /* AO + światło */
    const c1x = sx + a1[0] * s1, c1y = sy + a1[1] * s1, c1z = sz + a1[2] * s1;
    const c2x = sx + a2[0] * s2, c2y = sy + a2[1] * s2, c2z = sz + a2[2] * s2;
    const o1 = pOpq(c1x, c1y, c1z), o2 = pOpq(c2x, c2y, c2z);
    const cx2 = sx + a1[0] * s1 + a2[0] * s2, cy2 = sy + a1[1] * s1 + a2[1] * s2, cz2 = sz + a1[2] * s1 + a2[2] * s2;
    const oc = (o1 && o2) ? 1 : pOpq(cx2, cy2, cz2);
    const ao = (o1 && o2) ? 0 : 3 - (o1 + o2 + oc);
    const s_1 = o1 ? baseSky : pSky(c1x, c1y, c1z), s_2 = o2 ? baseSky : pSky(c2x, c2y, c2z), s_c = oc ? baseSky : pSky(cx2, cy2, cz2);
    const b_1 = o1 ? baseBlk : pBlk(c1x, c1y, c1z), b_2 = o2 ? baseBlk : pBlk(c2x, c2y, c2z), b_c = oc ? baseBlk : pBlk(cx2, cy2, cz2);
    const g = sh * AOF[ao];
    col[k] = ao; sk[k] = (baseSky + s_1 + s_2 + s_c) * 0.25 * 17; bl[k] = (baseBlk + b_1 + b_2 + b_c) * 0.25 * 17;
    mb.v(px[k], py[k], pz[k], pu[k], pv[k], tr * g, tg * g, tb * g, 255, sk[k], bl[k]);
  }
  mb.quad(col[0] + col[2] < col[1] + col[3]);
}
/* ściana „płaska” (krzyż, uprawy) z jednego światła */
function emitFlat(mb, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, tile, tint, sky, blk, shade) {
  const tu = (tile % ATLAS_N) / ATLAS_N, tv = Math.floor(tile / ATLAS_N) / ATLAS_N, ts = 1 / ATLAS_N;
  let tr = 255, tg = 255, tb = 255; if (tint != null) { tr = (tint >> 16) & 255; tg = (tint >> 8) & 255; tb = tint & 255; }
  const g = shade, e = EPS * ts, u0 = tu + e, u1 = tu + ts - e, v0 = tv + e, v1 = tv + ts - e;
  mb.v(ax, ay, az, u0, v1, tr * g, tg * g, tb * g, 255, sky, blk); mb.v(bx, by, bz, u0, v0, tr * g, tg * g, tb * g, 255, sky, blk);
  mb.v(cx, cy, cz, u1, v0, tr * g, tg * g, tb * g, 255, sky, blk); mb.v(dx, dy, dz, u1, v1, tr * g, tg * g, tb * g, 255, sky, blk);
  mb.quad(false);
}
/* pudełka dla kształtów (lokalne współrzędne bloku) */
function boxesOf(id, meta) {
  const b = BLK[id];
  switch (b.shape) {
    case 0: return B_FULL;
    case 3: return B_SLAB;
    case 4: { const f = meta & 3, d = DIR4[f], up = [d[0] > 0 ? 0.5 : 0, 0.5, d[2] > 0 ? 0.5 : 0, d[0] < 0 ? 0.5 : 1, 1, d[2] < 0 ? 0.5 : 1]; if (d[0] !== 0) { up[2] = 0; up[5] = 1; } else { up[0] = 0; up[3] = 1; } return [B_SLAB[0], up]; }
    case 5: { const open = (meta & 4) ? 1 : 0, f = ((meta & 3) + (open ? 3 : 0)) & 3; const T = 0.1875; return [f === 0 ? [0, 0, 0, 1, 1, T] : f === 1 ? [1 - T, 0, 0, 1, 1, 1] : f === 2 ? [0, 0, 1 - T, 1, 1, 1] : [0, 0, 0, T, 1, 1]]; }
    case 6: { const s = TORCH_SUP[meta] || TORCH_SUP[1]; const T = 0.0625; return [[s[0] < 0 ? 0 : s[0] > 0 ? 1 - T : 0, 0, s[2] < 0 ? 0 : s[2] > 0 ? 1 - T : 0, s[0] < 0 ? T : 1, 1, s[2] < 0 ? T : 1]]; }
    case 9: return B_FARM;
    case 10: return B_CACT;
    case 11: return B_BED;
    case 12: return B_CHEST;
    case 2: return [torchBox(meta)];
    case 1: case 8: return B_PLANT;
  }
  return B_FULL;
}
const TORCH_BASE = [0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625];
const B_FULL = [[0, 0, 0, 1, 1, 1]], B_SLAB = [[0, 0, 0, 1, 0.5, 1]], B_FARM = [[0, 0, 0, 1, 0.9375, 1]], B_CACT = [[0.0625, 0, 0.0625, 0.9375, 1, 0.9375]], B_BED = [[0, 0, 0, 1, 0.5625, 1]], B_CHEST = [[0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375]], B_PLANT = [[0.15, 0, 0.15, 0.85, 0.8, 0.85]];
function torchBox(meta) {
  const s = TORCH_SUP[meta]; const bx = [0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625];
  if (!s) return bx;
  return [bx[0] - s[0] * 0.3, 0.2, bx[2] - s[2] * 0.3, bx[3] - s[0] * 0.3, 0.825, bx[5] - s[2] * 0.3];
}
const FLUID_H = (m, above) => (above ? 1 : m === 8 ? 1 : (8 - m) / 9 - 0.01);

function meshChunk(W, c) {
  fillPad(W, c); mbS.reset(); mbW.reset();
  const bio = c.bio;
  for (let y = 0; y < WH; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    const p = pi(x, y, z), id = PB[p]; if (!id) continue;
    const b = BLK[id], meta = PM[p], sh = b.shape, bi = bio[(z << 4) | x];
    if (sh < 0) continue;
    const bx = x, by = y, bz = z, tint0 = null;
    if (sh === 7) { /* płyn */
      const water = b.fluid === 1, mb = water ? mbW : mbS, tile = TIX[b.tex];
      const aboveSame = PB[pi(x, y + 1, z)] === id, h = FLUID_H(meta, aboveSame || y === WH - 1);
      const lava = !water;
      for (let f = 0; f < 6; f++) {
        const n = DIRS6[f], nid = PB[pi(x + n[0], y + n[1], z + n[2])];
        if (f === 3 && y === 0) continue;
        if (nid === id) continue;
        if (nid && OPQ[nid] === 1) continue;
        const bo = [0, 0, 0, 1, h, 1];
        const before = mb.nv;
        emitFace(mb, f, bx, by, bz, bo, tile, tint0, false, 0, null, null);
        if (lava) { for (let q = before; q < mb.nv; q++) { const o = q * 28 + 20; mbS.u[o] = 255; mbS.u[o + 1] = 255; mbS.u[o + 2] = 255; mbS.u[o + 4] = 255; mbS.u[o + 5] = 255; } }
      }
      continue;
    }
    if (sh === 1 || sh === 8) { /* krzyż / uprawy */
      const tile = tileIdx(b, 4, meta), sk = PS[p] * 17, kb = PK[p] * 17, tint = tintOf(b, 2, bi);
      if (sh === 1) {
        emitFlat(mbS, bx + 0.05, by, bz + 0.05, bx + 0.05, by + 1, bz + 0.05, bx + 0.95, by + 1, bz + 0.95, bx + 0.95, by, bz + 0.95, tile, tint, sk, kb, 0.95);
        emitFlat(mbS, bx + 0.05, by, bz + 0.95, bx + 0.05, by + 1, bz + 0.95, bx + 0.95, by + 1, bz + 0.05, bx + 0.95, by, bz + 0.05, tile, tint, sk, kb, 0.95);
      } else {
        for (const q of [0.25, 0.75]) {
          emitFlat(mbS, bx + q, by - 0.06, bz, bx + q, by + 0.94, bz, bx + q, by + 0.94, bz + 1, bx + q, by - 0.06, bz + 1, tile, null, sk, kb, 0.95);
          emitFlat(mbS, bx, by - 0.06, bz + q, bx, by + 0.94, bz + q, bx + 1, by + 0.94, bz + q, bx + 1, by - 0.06, bz + q, tile, null, sk, kb, 0.95);
        }
      }
      continue;
    }
    const mb = b.transl ? mbW : mbS;
    let boxes, toff = null;
    if (sh === 2) { boxes = [TORCH_BASE]; const s2 = TORCH_SUP[meta]; if (s2) toff = [-s2[0] * 0.3, 0.2, -s2[2] * 0.3]; } else boxes = boxesOf(id, meta);
    const leafy = b.key.startsWith("leaves");
    for (let bk = 0; bk < boxes.length; bk++) {
      const bo = boxes[bk];
      for (let f = 0; f < 6; f++) {
        const n = DIRS6[f];
        const onB = (f === 0 && bo[3] >= 1) || (f === 1 && bo[0] <= 0) || (f === 2 && bo[4] >= 1) || (f === 3 && bo[1] <= 0) || (f === 4 && bo[5] >= 1) || (f === 5 && bo[2] <= 0);
        if (onB) {
          const nid = PB[pi(x + n[0], y + n[1], z + n[2])];
          if (f === 3 && y === 0) continue;
          if (OPQ[nid] === 1) continue;
          if (nid === id && (b.cut || b.transl) && sh === 0) continue;
          if (leafy && BLK[nid].key.startsWith("leaves")) continue;
        }
        let tile = tileIdx(b, f, meta); if (id === BID.farmland && f === 2) tile = TIX[meta === 1 ? "farm_wet" : "farm_dry"];
        if (sh === 2 && f === 2) { emitFace(mb, f, bx, by, bz, bo, tile, null, true, 0, toff, [0.4375, 0.375, 0.4375, 0.4375]); continue; }
        emitFace(mb, f, bx, by, bz, bo, tile, tintOf(b, f, bi), !onB, 0, toff, null);
      }
    }
  }
  return { s: mbS, w: mbW };
}

/* ===================== GL ===================== */
const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos; layout(location=1) in vec2 a_uv; layout(location=2) in vec4 a_col; layout(location=3) in vec4 a_light;
uniform mat4 u_vp; uniform vec3 u_off;
out vec2 v_uv; out vec4 v_col; out vec2 v_l; out float v_d;
void main(){ vec3 p=a_pos+u_off; gl_Position=u_vp*vec4(p,1.0); v_uv=a_uv; v_col=a_col; v_l=a_light.xy; v_d=length(p); }`;
const FS = `#version 300 es
precision mediump float;
in vec2 v_uv; in vec4 v_col; in vec2 v_l; in float v_d;
uniform sampler2D u_tex; uniform float u_sun; uniform float u_min; uniform vec3 u_fog; uniform vec2 u_fogr; uniform float u_flat; uniform float u_alpha; uniform float u_cut; uniform vec3 u_add;
out vec4 o;
void main(){
  vec4 t=texture(u_tex,v_uv); if(t.a<u_cut) discard;
  vec3 c=t.rgb*v_col.rgb;
  if(u_flat<0.5){
    float l=max(v_l.x*u_sun,v_l.y); float b=u_min+(1.0-u_min)*pow(l,2.2);
    c*=b; c+=u_add*t.rgb;
    float f=clamp((v_d-u_fogr.x)/(u_fogr.y-u_fogr.x),0.0,1.0); c=mix(c,u_fog,f);
  }
  o=vec4(c,t.a*v_col.a*u_alpha);
}`;

class Dyn {
  constructor(maxV) { this.mb = new MB(maxV); this.vao = null; this.vbo = null; this.ibo = null; this.cap = 0; this.icap = 0; }
  reset() { this.mb.reset(); }
  v(x, y, z, u, v, r, g, b, a, s, k) { this.mb.v(x, y, z, u, v, r, g, b, a, s, k); }
  q() { this.mb.quad(false); }
}

class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: !!window.__KOP_DEBUG });
    if (!gl) throw new Error("Brak WebGL2");
    this.gl = gl; this.canvas = canvas;
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    this.pr = pr; gl.useProgram(pr);
    const U = {}; ["u_vp", "u_off", "u_tex", "u_sun", "u_min", "u_fog", "u_fogr", "u_flat", "u_alpha", "u_cut", "u_add"].forEach((n) => (U[n] = gl.getUniformLocation(pr, n))); this.U = U;
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buildAtlas());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.tex = tex; gl.uniform1i(U.u_tex, 0);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.dyn = new Dyn(60000); this.sky = new Dyn(1200); this.lines = new Dyn(400); this.over = new Dyn(200);
    this.meshN = 0; this.vp = null; this.planes = null; this.lastDraw = 0;
    this.stars = []; const rs = mulberry32(99); for (let i = 0; i < 160; i++) { const a = rs() * Math.PI * 2, e = Math.asin(rs() * 2 - 1); this.stars.push([Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a), 0.25 + rs() * 0.45]); }
  }
  setupVAO(vao) {
    const gl = this.gl; gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 28, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 28, 24);
  }
  upload(mb) {
    if (!mb.ni) return null; const gl = this.gl;
    const vao = gl.createVertexArray(), vbo = gl.createBuffer(), ibo = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, mb.u.subarray(0, mb.nv * 28), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mb.i.subarray(0, mb.ni), gl.STATIC_DRAW);
    this.setupVAO(vao); gl.bindVertexArray(null);
    return { vao, vbo, ibo, n: mb.ni };
  }
  free(m) { if (!m) return; const gl = this.gl; gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vbo); gl.deleteBuffer(m.ibo); }
  buildMesh(W, c) {
    const r = meshChunk(W, c);
    this.freeChunk(c);
    c.mesh = { s: this.upload(r.s), w: this.upload(r.w) };
    c.dirty = false; this.meshN++;
  }
  freeChunk(c) { if (c.mesh) { this.free(c.mesh.s); this.free(c.mesh.w); c.mesh = null; } }
  drawDyn(d, mode) {
    const gl = this.gl, mb = d.mb; if (!mb.ni) return;
    if (!d.vao) { d.vao = gl.createVertexArray(); d.vbo = gl.createBuffer(); d.ibo = gl.createBuffer(); gl.bindVertexArray(d.vao); gl.bindBuffer(gl.ARRAY_BUFFER, d.vbo); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, d.ibo); this.setupVAO(d.vao); d.cap = 0; d.icap = 0; }
    gl.bindVertexArray(d.vao); gl.bindBuffer(gl.ARRAY_BUFFER, d.vbo);
    const bytes = mb.nv * 28; if (bytes > d.cap) { d.cap = Math.max(bytes, 65536); gl.bufferData(gl.ARRAY_BUFFER, d.cap, gl.DYNAMIC_DRAW); }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, mb.u, 0, bytes);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, d.ibo);
    if (mb.ni > d.icap) { d.icap = Math.max(mb.ni, 16384); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, d.icap * 4, gl.DYNAMIC_DRAW); }
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, mb.i, 0, mb.ni);
    gl.drawElements(mode || gl.TRIANGLES, mb.ni, gl.UNSIGNED_INT, 0);
  }
  resize(w, h) { const d = Math.min(window.devicePixelRatio || 1, 1.5); const cw = Math.max(2, Math.floor(w * d)), ch = Math.max(2, Math.floor(h * d)); if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; } this.gl.viewport(0, 0, cw, ch); }
  frustum(m) {
    const pl = (i, sg) => { const a = m[3] + sg * m[i], b = m[7] + sg * m[i + 4], c = m[11] + sg * m[i + 8], d = m[15] + sg * m[i + 12], l = Math.hypot(a, b, c) || 1; return [a / l, b / l, c / l, d / l]; };
    return [pl(0, 1), pl(0, -1), pl(1, 1), pl(1, -1), pl(2, 1), pl(2, -1)];
  }
  visBox(pl, x0, y0, z0, x1, y1, z1) { for (let i = 0; i < 6; i++) { const q = pl[i]; if (q[0] * (q[0] > 0 ? x1 : x0) + q[1] * (q[1] > 0 ? y1 : y0) + q[2] * (q[2] > 0 ? z1 : z0) + q[3] < 0) return false; } return true; }
  visible(pl, x, y, z, r) { for (let i = 0; i < 6; i++) { if (pl[i][0] * x + pl[i][1] * y + pl[i][2] * z + pl[i][3] < -r) return false; } return true; }
  /* st: { cam:[x,y,z], yaw, pitch, fov, tod, world, dayF, sunF, under, lava, fogFar, brightness } */
  draw(st, drawEntities) {
    const gl = this.gl, U = this.U, W = st.world;
    const cw = this.canvas.width, ch = this.canvas.height;
    const proj = mPersp(st.fov, cw / ch, 0.05, 400), view = mView(st.yaw, st.pitch), vp = mMul(proj, view); this.vp = vp; const pl = this.frustum(vp);
    const fog = st.fog; gl.clearColor(fog[0], fog[1], fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.pr); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniformMatrix4fv(U.u_vp, false, vp);
    gl.uniform1f(U.u_sun, st.sunF); gl.uniform1f(U.u_min, st.minL); gl.uniform3f(U.u_fog, fog[0], fog[1], fog[2]); gl.uniform2f(U.u_fogr, st.fogNear, st.fogFar); gl.uniform1f(U.u_alpha, 1); gl.uniform1f(U.u_cut, 0.5); gl.uniform3f(U.u_add, 0, 0, 0);
    /* niebo: słońce, księżyc, gwiazdy */
    if (!st.under) {
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.uniform1f(U.u_flat, 1); gl.uniform3f(U.u_off, 0, 0, 0);
      const sd = this.sky; sd.reset(); const a = st.tod / DAY_LEN * Math.PI * 2;
      const bill = (dx, dy, dz, size, r, g, b, al) => {
        const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        let tx = -dz, ty = 0, tz = dx; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const ux = dy * tz - dz * ty, uy = dz * tx - dx * tz, uz = dx * ty - dy * tx, R = 150;
        const cx = dx * R, cy = dy * R, cz = dz * R, t = TIX.white, u = (t % ATLAS_N) / ATLAS_N + 0.01, v = Math.floor(t / ATLAS_N) / ATLAS_N + 0.01;
        sd.v(cx - tx * size - ux * size, cy - ty * size - uy * size, cz - tz * size - uz * size, u, v, r, g, b, al, 255, 255);
        sd.v(cx + tx * size - ux * size, cy + ty * size - uy * size, cz + tz * size - uz * size, u, v, r, g, b, al, 255, 255);
        sd.v(cx + tx * size + ux * size, cy + ty * size + uy * size, cz + tz * size + uz * size, u, v, r, g, b, al, 255, 255);
        sd.v(cx - tx * size + ux * size, cy - ty * size + uy * size, cz - tz * size + uz * size, u, v, r, g, b, al, 255, 255); sd.q();
      };
      const night = 1 - st.dayF;
      if (night > 0.05) for (const s of this.stars) { const ca = Math.cos(a), sa = Math.sin(a); const x = s[0] * ca - s[1] * sa, y = s[0] * sa + s[1] * ca; if (y > -0.05) bill(x, y, s[2], s[3], 255, 255, 255, 255 * night * night); }
      bill(Math.cos(a), Math.sin(a), 0.25, 14, 255, 244, 190, 255); bill(-Math.cos(a), -Math.sin(a), -0.25, 10, 205, 215, 240, 255);
      this.drawDyn(sd); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    }
    gl.uniform1f(U.u_flat, 0);
    const cam = st.cam, sx = cam[0], sy = cam[1], sz = cam[2], pcx = Math.floor(sx / 16), pcz = Math.floor(sz / 16);
    const list = []; const R = 17;
    W.chunks.forEach((c) => { if (!c.mesh) return; const ox = c.cx * 16 - sx, oz = c.cz * 16 - sz; if (!this.visBox(pl, ox, -sy, oz, ox + 16, WH - sy, oz + 16)) return; list.push(c); });
    this.drawn = list.length;
    for (const c of list) { const m = c.mesh.s; if (!m) continue; gl.uniform3f(U.u_off, c.cx * 16 - sx, -sy, c.cz * 16 - sz); gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0); }
    gl.uniform3f(U.u_off, 0, 0, 0);
    if (drawEntities) drawEntities(this, gl, U, sx, sy, sz);
    /* woda */
    gl.enable(gl.BLEND); gl.depthMask(false); gl.uniform1f(U.u_cut, 0.01);
    list.sort((a, b) => ((b.cx * 16 - sx) ** 2 + (b.cz * 16 - sz) ** 2) - ((a.cx * 16 - sx) ** 2 + (a.cz * 16 - sz) ** 2));
    for (const c of list) { const m = c.mesh.w; if (!m) continue; gl.uniform3f(U.u_off, c.cx * 16 - sx, -sy, c.cz * 16 - sz); gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0); }
    gl.depthMask(true);
    gl.uniform3f(U.u_off, 0, 0, 0);
    if (st.overlay) st.overlay(this, gl, U, sx, sy, sz);
    gl.disable(gl.BLEND); gl.bindVertexArray(null);
  }
  dispose() { try { const e = this.gl.getExtension("WEBGL_lose_context"); if (e) e.loseContext(); } catch (er) {} }
}
/* ===================== FIZYKA ===================== */
let WORLD = null; /* aktywny świat */
const _bx = [];
function gatherBoxes(x0, y0, z0, x1, y1, z1) {
  _bx.length = 0; const W = WORLD;
  const ax = Math.floor(x0), bx = Math.floor(x1), ay = Math.max(0, Math.floor(y0)), by = Math.min(WH - 1, Math.floor(y1)), az = Math.floor(z0), bz = Math.floor(z1);
  for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
    const id = W.get(x, y, z); if (!SOLID[id]) continue;
    const bs = boxesOf(id, W.getM(x, y, z));
    for (let i = 0; i < bs.length; i++) { const b = bs[i]; _bx.push(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]); }
  }
  return _bx;
}
function slideE(e, dx, dy, dz) {
  const hw = e.w / 2, bxs = gatherBoxes(e.x - hw + Math.min(0, dx) - 0.001, e.y + Math.min(0, dy) - 0.001, e.z - hw + Math.min(0, dz) - 0.001, e.x + hw + Math.max(0, dx) + 0.001, e.y + e.h + Math.max(0, dy) + 0.001, e.z + hw + Math.max(0, dz) + 0.001);
  const n = bxs.length, E = 1e-6;
  /* Y */
  for (let i = 0; i < n; i += 6) {
    if (e.x + hw <= bxs[i] + E || e.x - hw >= bxs[i + 3] - E || e.z + hw <= bxs[i + 2] + E || e.z - hw >= bxs[i + 5] - E) continue;
    if (dy > 0 && bxs[i + 1] >= e.y + e.h - E) { const d = bxs[i + 1] - (e.y + e.h); if (d < dy) dy = d; }
    else if (dy < 0 && bxs[i + 4] <= e.y + E) { const d = bxs[i + 4] - e.y; if (d > dy) dy = d; }
  }
  e.y += dy;
  /* X */
  for (let i = 0; i < n; i += 6) {
    if (e.y + e.h <= bxs[i + 1] + E || e.y >= bxs[i + 4] - E || e.z + hw <= bxs[i + 2] + E || e.z - hw >= bxs[i + 5] - E) continue;
    if (dx > 0 && bxs[i] >= e.x + hw - E) { const d = bxs[i] - (e.x + hw); if (d < dx) dx = d; }
    else if (dx < 0 && bxs[i + 3] <= e.x - hw + E) { const d = bxs[i + 3] - (e.x - hw); if (d > dx) dx = d; }
  }
  e.x += dx;
  /* Z */
  for (let i = 0; i < n; i += 6) {
    if (e.y + e.h <= bxs[i + 1] + E || e.y >= bxs[i + 4] - E || e.x + hw <= bxs[i] + E || e.x - hw >= bxs[i + 3] - E) continue;
    if (dz > 0 && bxs[i + 2] >= e.z + hw - E) { const d = bxs[i + 2] - (e.z + hw); if (d < dz) dz = d; }
    else if (dz < 0 && bxs[i + 5] <= e.z - hw + E) { const d = bxs[i + 5] - (e.z - hw); if (d > dz) dz = d; }
  }
  e.z += dz;
  return [dx, dy, dz];
}
function moveEnt(e, dx, dy, dz, step) {
  const x0 = e.x, y0 = e.y, z0 = e.z, was = e.onGround;
  const r = slideE(e, dx, dy, dz); let ax = r[0], ay = r[1], az = r[2];
  e.hitX = Math.abs(ax - dx) > 1e-6; e.hitZ = Math.abs(az - dz) > 1e-6; e.hitY = Math.abs(ay - dy) > 1e-6;
  let ground = dy < 0 && e.hitY;
  if (step && (was || ground) && (e.hitX || e.hitZ)) {
    const sx = e.x, sy = e.y, sz = e.z; e.x = x0; e.y = y0; e.z = z0;
    const u = slideE(e, 0, step, 0), h2 = slideE(e, dx, 0, dz), d = slideE(e, 0, -u[1], 0);
    if (h2[0] * h2[0] + h2[2] * h2[2] > ax * ax + az * az + 1e-6) { ground = true; e.hitX = Math.abs(h2[0] - dx) > 1e-6; e.hitZ = Math.abs(h2[2] - dz) > 1e-6; }
    else { e.x = sx; e.y = sy; e.z = sz; }
  }
  e.onGround = ground;
  return e;
}
function hasGroundAt(e, x, z) {
  const hw = e.w / 2; const b = gatherBoxes(x - hw, e.y - 0.6, z - hw, x + hw, e.y - 0.001, z + hw);
  for (let i = 0; i < b.length; i += 6) if (b[i + 3] > x - hw && b[i] < x + hw && b[i + 5] > z - hw && b[i + 2] < z + hw && b[i + 4] <= e.y + 0.001) return true;
  return false;
}
function aabbHitsBlocks(e) { const hw = e.w / 2; return gatherBoxes(e.x - hw + 0.001, e.y + 0.001, e.z - hw + 0.001, e.x + hw - 0.001, e.y + e.h - 0.001, e.z + hw - 0.001).length > 0; }
/* środowisko */
function fluidAt(x, y, z) { const id = WORLD.get(Math.floor(x), Math.floor(y), Math.floor(z)); return BLK[id].fluid; }
function fluidLevelH(x, y, z) { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), id = WORLD.get(X, Y, Z); if (!BLK[id].fluid) return 0; return WORLD.get(X, Y + 1, Z) === id ? 1 : FLUID_H(WORLD.getM(X, Y, Z), false); }
function inFluid(e) { /* 0 brak, 1 woda, 2 lawa: czy środek ciała (stopy+0.4) jest w płynie */ const f = fluidAt(e.x, e.y + 0.4, e.z); if (f && e.y + 0.4 - Math.floor(e.y + 0.4) <= fluidLevelH(e.x, e.y + 0.4, e.z)) return f; return 0; }
function blockAtE(e, dy) { return WORLD.get(Math.floor(e.x), Math.floor(e.y + dy), Math.floor(e.z)); }
/* raycast po blokach: zwraca { x,y,z,f (ściana), t, hx,hy,hz } lub null */
function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0, tmax = maxT, face = -1;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    const lo = b[a], hi = b[a + 3];
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo || o[a] > hi) return null; continue; }
    let t1 = (lo - o[a]) / d[a], t2 = (hi - o[a]) / d[a], fc = d[a] > 0 ? a * 2 + 1 : a * 2;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) { tmin = t1; face = fc; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return face < 0 && tmin === 0 ? { t: 0, f: -1 } : { t: tmin, f: face };
}
function selBoxes(id, meta) {
  const b = BLK[id];
  if (b.shape === 2) return [torchBox(meta)];
  if (b.shape === 7) return B_FULL;
  return boxesOf(id, meta);
}
function raycastBlocks(ox, oy, oz, dx, dy, dz, maxD, liquids) {
  const W = WORLD; let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(1 / (dx || 1e-12)), tdy = Math.abs(1 / (dy || 1e-12)), tdz = Math.abs(1 / (dz || 1e-12));
  let tx = (dx > 0 ? x + 1 - ox : ox - x) * tdx, ty = (dy > 0 ? y + 1 - oy : oy - y) * tdy, tz = (dz > 0 ? z + 1 - oz : oz - z) * tdz, t = 0;
  for (let i = 0; i < 200 && t <= maxD; i++) {
    if (y >= 0 && y < WH) {
      const id = W.get(x, y, z);
      if (id !== 0 && (BLK[id].sel || (liquids && BLK[id].fluid))) {
        const m = W.getM(x, y, z), bs = selBoxes(id, m); let best = null;
        for (const bo of bs) { const r = rayBox(ox - x, oy - y, oz - z, dx, dy, dz, bo, maxD); if (r && (!best || r.t < best.t)) best = r; }
        if (best && best.t <= maxD) return { x, y, z, id, meta: m, f: best.f, t: best.t };
      }
    }
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; } else if (ty < tz) { y += sy; t = ty; ty += tdy; } else { z += sz; t = tz; tz += tdz; }
  }
  return null;
}
/* ===================== EKWIPUNEK ===================== */
const newInv = () => ({ slots: new Array(36).fill(null), armor: new Array(4).fill(null) });
const cloneStack = (s) => (s ? { id: s.id, n: s.n, d: s.d || 0 } : null);
function invAdd(inv, id, n, d) {
  const mx = maxStack(id);
  if (mx > 1) for (let i = 0; i < 36 && n > 0; i++) { const s = inv.slots[i]; if (s && s.id === id && s.n < mx) { const t = Math.min(mx - s.n, n); s.n += t; n -= t; } }
  for (let i = 0; i < 36 && n > 0; i++) { if (!inv.slots[i]) { const t = Math.min(mx, n); inv.slots[i] = { id, n: t, d: d || 0 }; n -= t; } }
  return n;
}
function invCount(inv, id) { let c = 0; for (let i = 0; i < 36; i++) if (inv.slots[i] && inv.slots[i].id === id) c += inv.slots[i].n; return c; }
function invTake(inv, id, n) { for (let i = 35; i >= 0 && n > 0; i--) { const s = inv.slots[i]; if (s && s.id === id) { const t = Math.min(n, s.n); s.n -= t; n -= t; if (!s.n) inv.slots[i] = null; } } return n; }
function invRoom(inv, id, n) { const mx = maxStack(id); let room = 0; for (let i = 0; i < 36; i++) { const s = inv.slots[i]; if (!s) room += mx; else if (s.id === id) room += mx - s.n; } return room >= n; }
/* usunięcie 1 sztuki ze slotu (nowy ekwipunek zawsze zachowuje stos) */
function slotUse(inv, i) { const s = inv.slots[i]; if (!s) return; s.n--; if (s.n <= 0) inv.slots[i] = null; }
function damageStack(inv, i, amt) {
  const s = inv.slots[i]; if (!s) return false; const dur = durOf(s.id); if (!dur) return false;
  s.d = (s.d || 0) + (amt || 1); if (s.d >= dur) { inv.slots[i] = null; return true; } return false;
}
/* ----- kontenery: furnace / chest są trzymane w WORLD.tiles pod kluczem pkey ----- */
function newFurnace() { return { t: "furnace", slots: [null, null, null], burn: 0, burnMax: 0, cook: 0 }; }
function newChest() { return { t: "chest", slots: new Array(27).fill(null) }; }
function tileAt(x, y, z, create) {
  const k = pkey(x, y, z); let t = WORLD.tiles.get(k);
  if (!t && create) { const id = WORLD.get(x, y, z); t = id === BID.chest ? newChest() : newFurnace(); WORLD.tiles.set(k, t); }
  return t;
}
/* piec: slots[0] wsad, [1] paliwo, [2] wynik; zwraca true, jeśli zmienił blok (płonie/nie) */
function furnaceTick(t, x, y, z, dt) {
  const inp = t.slots[0], fuel = t.slots[1], out = t.slots[2];
  const res = inp ? SMELT[inp.id] : 0;
  const canCook = !!(res && (!out || (out.id === res && out.n < maxStack(res))));
  let changed = false;
  if (t.burn > 0) t.burn -= dt;
  if (t.burn <= 0 && canCook && fuel && fuelOf(fuel.id) > 0) {
    const f = fuelOf(fuel.id); t.burn = f; t.burnMax = f;
    if (fuel.id === ID.bucket_lava) t.slots[1] = { id: ID.bucket, n: 1, d: 0 }; else { fuel.n--; if (fuel.n <= 0) t.slots[1] = null; }
    changed = true;
  }
  if (t.burn > 0 && canCook) { t.cook += dt; if (t.cook >= 10) { t.cook = 0; inp.n--; if (inp.n <= 0) t.slots[0] = null; if (out) out.n++; else t.slots[2] = { id: res, n: 1, d: 0 }; } }
  else if (t.cook > 0) t.cook = Math.max(0, t.cook - dt * 2);
  const lit = t.burn > 0;
  if (lit !== !!t.lit) { t.lit = lit; changed = true; }
  return changed;
}
/* ===================== ENCJE (stwory, przedmioty, strzały...) ===================== */
let G = null;
const gdiff = () => (G ? G.diff : 2);
const DMGMUL = [0, 0.6, 1, 1.5];
/* modele w pikselach (1/16 bloku). kierunek „do przodu” = +z. anim: legA/legB (nogi), head, armF (ręce wyciągnięte) */
const MOBS = {
  pig: { name: "Świnia", w: 0.9, h: 0.9, hp: 10, speed: 1.5, passive: 1, snd: "pig", parts: [
    { b: [-5, 6, -8, 5, 14, 8], c: 0xf0a0a8 }, { b: [-4, 7, 8, 4, 15, 16], c: 0xf2a8b0, a: "head", py: 11, pz: 8 }, { b: [-2, 7.5, 16, 2, 11, 17.4], c: 0xd68a92, a: "head", py: 11, pz: 8 },
    { b: [-3.5, 11, 16, -2, 12.6, 16.3], c: 0x1a1a1a, a: "head", py: 11, pz: 8 }, { b: [2, 11, 16, 3.5, 12.6, 16.3], c: 0x1a1a1a, a: "head", py: 11, pz: 8 },
    { b: [-5, 0, 4, -1, 6, 8], c: 0xdd8f98, a: "legA", py: 6, pz: 6 }, { b: [1, 0, 4, 5, 6, 8], c: 0xdd8f98, a: "legB", py: 6, pz: 6 }, { b: [-5, 0, -8, -1, 6, -4], c: 0xdd8f98, a: "legB", py: 6, pz: -6 }, { b: [1, 0, -8, 5, 6, -4], c: 0xdd8f98, a: "legA", py: 6, pz: -6 }] },
  cow: { name: "Krowa", w: 0.9, h: 1.4, hp: 10, speed: 1.4, passive: 1, snd: "cow", parts: [
    { b: [-6, 10, -10, 6, 22, 8], c: 0x4b3424 }, { b: [-6.1, 13, -4, -5.9, 20, 3], c: 0xeeeeee }, { b: [5.9, 12, 0, 6.1, 19, 6], c: 0xeeeeee }, { b: [-3, 22.1, -4, 3, 22.3, 2], c: 0xeeeeee },
    { b: [-4, 16, 8, 4, 25, 16], c: 0x55392a, a: "head", py: 18, pz: 8 }, { b: [-3, 16, 16, 3, 20, 17.2], c: 0xe0b9a8, a: "head", py: 18, pz: 8 }, { b: [-5.5, 24, 10, -4, 26.5, 11.5], c: 0xf0f0e0, a: "head", py: 18, pz: 8 }, { b: [4, 24, 10, 5.5, 26.5, 11.5], c: 0xf0f0e0, a: "head", py: 18, pz: 8 },
    { b: [-3.5, 20, 15.9, -2, 21.6, 16.2], c: 0x111111, a: "head", py: 18, pz: 8 }, { b: [2, 20, 15.9, 3.5, 21.6, 16.2], c: 0x111111, a: "head", py: 18, pz: 8 },
    { b: [-6, 0, 4, -2, 10, 8], c: 0x3f2a1d, a: "legA", py: 10, pz: 6 }, { b: [2, 0, 4, 6, 10, 8], c: 0x3f2a1d, a: "legB", py: 10, pz: 6 }, { b: [-6, 0, -8, -2, 10, -4], c: 0x3f2a1d, a: "legB", py: 10, pz: -6 }, { b: [2, 0, -8, 6, 10, -4], c: 0x3f2a1d, a: "legA", py: 10, pz: -6 }] },
  sheep: { name: "Owca", w: 0.9, h: 1.3, hp: 8, speed: 1.4, passive: 1, snd: "sheep", parts: [
    { b: [-5.5, 9, -9, 5.5, 20, 9], c: 0xefefef, wool: 1 }, { b: [-3.5, 15, 8, 3.5, 21, 15], c: 0xc9b79a, a: "head", py: 17, pz: 8 }, { b: [-4, 20, 8, 4, 22, 14], c: 0xefefef, a: "head", py: 17, pz: 8, wool: 1 },
    { b: [-2.5, 17, 14.9, -1, 18.6, 15.2], c: 0x161616, a: "head", py: 17, pz: 8 }, { b: [1, 17, 14.9, 2.5, 18.6, 15.2], c: 0x161616, a: "head", py: 17, pz: 8 },
    { b: [-5, 0, 4, -1.5, 9, 7.5], c: 0xd8c8ae, a: "legA", py: 9, pz: 6 }, { b: [1.5, 0, 4, 5, 9, 7.5], c: 0xd8c8ae, a: "legB", py: 9, pz: 6 }, { b: [-5, 0, -7.5, -1.5, 9, -4], c: 0xd8c8ae, a: "legB", py: 9, pz: -6 }, { b: [1.5, 0, -7.5, 5, 9, -4], c: 0xd8c8ae, a: "legA", py: 9, pz: -6 }] },
  chicken: { name: "Kura", w: 0.4, h: 0.7, hp: 4, speed: 1.3, passive: 1, snd: "chicken", parts: [
    { b: [-3, 5, -5, 3, 11, 4], c: 0xf4f4f4 }, { b: [-2, 10, 3, 2, 16, 7], c: 0xf4f4f4, a: "head", py: 10, pz: 4 }, { b: [-1, 11, 7, 1, 13, 9], c: 0xf0b830, a: "head", py: 10, pz: 4 }, { b: [-0.7, 16, 4, 0.7, 18, 6], c: 0xd22b2b, a: "head", py: 10, pz: 4 },
    { b: [-2, 14, 6.9, -1, 15.2, 7.2], c: 0x111111, a: "head", py: 10, pz: 4 }, { b: [1, 14, 6.9, 2, 15.2, 7.2], c: 0x111111, a: "head", py: 10, pz: 4 },
    { b: [-4, 6, -3, -3, 10, 3], c: 0xdedede }, { b: [3, 6, -3, 4, 10, 3], c: 0xdedede }, { b: [-2, 0, -1, -1, 5, 0], c: 0xe8b82c, a: "legA", py: 5, pz: -0.5 }, { b: [1, 0, -1, 2, 5, 0], c: 0xe8b82c, a: "legB", py: 5, pz: -0.5 }] },
  zombie: { name: "Zombie", w: 0.6, h: 1.95, hp: 20, speed: 2.4, hostile: 1, burn: 1, dmg: 3, snd: "zombie", parts: [
    { b: [-4, 24, -4, 4, 32, 4], c: 0x5e8c4a, a: "head", py: 24, pz: 0 }, { b: [-2.5, 27, 4, -0.8, 28.5, 4.2], c: 0x151515, a: "head", py: 24, pz: 0 }, { b: [0.8, 27, 4, 2.5, 28.5, 4.2], c: 0x151515, a: "head", py: 24, pz: 0 },
    { b: [-4, 12, -2, 4, 24, 2], c: 0x2e9aa8 }, { b: [-8, 12, -2, -4, 24, 2], c: 0x5e8c4a, a: "armF", py: 22, pz: 0 }, { b: [4, 12, -2, 8, 24, 2], c: 0x5e8c4a, a: "armF", py: 22, pz: 0 },
    { b: [-4, 0, -2, 0, 12, 2], c: 0x3a3a8a, a: "legA", py: 12, pz: 0 }, { b: [0, 0, -2, 4, 12, 2], c: 0x3a3a8a, a: "legB", py: 12, pz: 0 }] },
  skeleton: { name: "Szkielet", w: 0.6, h: 1.95, hp: 20, speed: 2.1, hostile: 1, burn: 1, ranged: 1, dmg: 3, snd: "skeleton", parts: [
    { b: [-4, 24, -4, 4, 32, 4], c: 0xdcdcd0, a: "head", py: 24, pz: 0 }, { b: [-2.5, 27, 4, -0.8, 29, 4.2], c: 0x1a1a1a, a: "head", py: 24, pz: 0 }, { b: [0.8, 27, 4, 2.5, 29, 4.2], c: 0x1a1a1a, a: "head", py: 24, pz: 0 },
    { b: [-3, 12, -1.5, 3, 24, 1.5], c: 0xc9c9bd }, { b: [-3.1, 14, -1.6, 3.1, 15, 1.6], c: 0x6e6e66 }, { b: [-3.1, 17, -1.6, 3.1, 18, 1.6], c: 0x6e6e66 }, { b: [-3.1, 20, -1.6, 3.1, 21, 1.6], c: 0x6e6e66 },
    { b: [-5, 12, -1, -3, 24, 1], c: 0xdcdcd0, a: "armF", py: 22, pz: 0 }, { b: [3, 12, -1, 5, 24, 1], c: 0xdcdcd0, a: "armF", py: 22, pz: 0 },
    { b: [-3, 0, -1, -1, 12, 1], c: 0xdcdcd0, a: "legA", py: 12, pz: 0 }, { b: [1, 0, -1, 3, 12, 1], c: 0xdcdcd0, a: "legB", py: 12, pz: 0 }] },
  spider: { name: "Pająk", w: 1.4, h: 0.9, hp: 16, speed: 3.0, hostile: 1, spider: 1, dmg: 2, snd: "spider", parts: [
    { b: [-5, 4, -13, 5, 11, -3], c: 0x2b2522 }, { b: [-3.5, 5, -3, 3.5, 10, 4], c: 0x3a322e }, { b: [-3.5, 5, 4, 3.5, 11, 10], c: 0x2f2825, a: "head", py: 7, pz: 4 },
    { b: [-3, 8, 9.9, -1, 10, 10.3], c: 0xd02020, a: "head", py: 7, pz: 4 }, { b: [1, 8, 9.9, 3, 10, 10.3], c: 0xd02020, a: "head", py: 7, pz: 4 },
    { b: [-15, 5, 1, -3, 6.4, 2.4], c: 0x1e1a18 }, { b: [-15, 5, -2.2, -3, 6.4, -0.8], c: 0x1e1a18 }, { b: [-15, 5, -5.5, -3, 6.4, -4.1], c: 0x1e1a18 }, { b: [-15, 5, 4, -3, 6.4, 5.4], c: 0x1e1a18 },
    { b: [3, 5, 1, 15, 6.4, 2.4], c: 0x1e1a18 }, { b: [3, 5, -2.2, 15, 6.4, -0.8], c: 0x1e1a18 }, { b: [3, 5, -5.5, 15, 6.4, -4.1], c: 0x1e1a18 }, { b: [3, 5, 4, 15, 6.4, 5.4], c: 0x1e1a18 }] }
};
const BOXF = [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]];
const BOXSH = [0.65, 0.65, 1, 0.5, 0.82, 0.82];
const WHITE_UV = () => [(TIX.white % ATLAS_N) / ATLAS_N + 0.01, Math.floor(TIX.white / ATLAS_N) / ATLAS_N + 0.01];

/* ===== tworzenie ===== */
let ENT_ID = 1;
function spawnMob(kind, x, y, z) {
  const d = MOBS[kind]; const m = { id: ENT_ID++, type: "mob", kind, x, y, z, vx: 0, vy: 0, vz: 0, w: d.w, h: d.h, yaw: Math.random() * 6.28, hp: d.hp, onGround: false, walkT: 0, walkA: 0, hurtT: 0, atkCd: 1, wt: rand(1, 4), wdx: 0, wdz: 0, panic: 0, age: 0, fire: 0, kbx: 0, kbz: 0, sheared: 0, headYaw: 0, shootT: rand(1, 3), sndT: rand(4, 14) };
  G.ents.push(m); return m;
}
function spawnItem(x, y, z, id, n, d, vx, vy, vz, delay) {
  if (!id || n <= 0) return;
  G.ents.push({ id: ENT_ID++, type: "item", x, y, z, vx: vx == null ? rand(-1.2, 1.2) : vx, vy: vy == null ? rand(2.5, 4.5) : vy, vz: vz == null ? rand(-1.2, 1.2) : vz, w: 0.25, h: 0.25, stack: { id, n, d: d || 0 }, age: 0, delay: delay == null ? 0.6 : delay, onGround: false, spin: rand(0, 6) });
}
function spawnDrops(x, y, z, list) { for (const [id, n] of list) spawnItem(x + 0.5, y + 0.5, z + 0.5, id, n); }
function spawnArrow(x, y, z, vx, vy, vz, owner, dmg) { G.ents.push({ id: ENT_ID++, type: "arrow", x, y, z, vx, vy, vz, w: 0.2, h: 0.2, owner, dmg, stuck: 0, age: 0 }); }
function spawnTnt(x, y, z, fuse) { G.ents.push({ id: ENT_ID++, type: "tnt", x: x + 0.5, y, z: z + 0.5, vx: rand(-0.6, 0.6), vy: 3, vz: rand(-0.6, 0.6), w: 0.98, h: 0.98, fuse: fuse == null ? 4 : fuse, onGround: false }); SFX.fuse(); }
function spawnFalling(x, y, z, id) { G.ents.push({ id: ENT_ID++, type: "fall", x: x + 0.5, y, z: z + 0.5, vx: 0, vy: 0, vz: 0, w: 0.98, h: 0.98, bid: id, age: 0, onGround: false }); }
function puff(x, y, z, bid, n) {
  const b = BLK[bid] || BLK[1]; const t = b.tex, tile = typeof t === "string" ? TIX[t] : TIX[t.s];
  for (let i = 0; i < (n || 10); i++) G.parts.push({ x: x + rand(-0.4, 0.4), y: y + rand(-0.4, 0.4), z: z + rand(-0.4, 0.4), vx: rand(-2, 2), vy: rand(0.5, 3.2), vz: rand(-2, 2), life: rand(0.5, 1.1), tile, su: Math.floor(Math.random() * 3) * 4, sv: Math.floor(Math.random() * 3) * 4, sz: rand(0.06, 0.13), tint: tintOf(b, 2, 0) });
}
function sparks(x, y, z, hex, n, up) { for (let i = 0; i < n; i++) G.parts.push({ x, y, z, vx: rand(-1.5, 1.5), vy: rand(0, 2.5) + (up || 0), vz: rand(-1.5, 1.5), life: rand(0.4, 0.9), tile: TIX.white, su: 6, sv: 6, sz: rand(0.05, 0.1), tint: hex, fb: 1 }); }

/* ===== bronienie / obrażenia ===== */
function hurtMob(m, dmg, fromX, fromZ, kb) {
  if (m.hp <= 0) return;
  m.hp -= dmg; m.hurtT = 0.45; m.panic = 5;
  const dx = m.x - fromX, dz = m.z - fromZ, l = Math.hypot(dx, dz) || 1;
  m.kbx = dx / l * (kb || 4.5); m.kbz = dz / l * (kb || 4.5); m.vy = Math.max(m.vy, 4.5); m.onGround = false;
  SFX.hit(); SFX.mob(MOBS[m.kind].snd);
  if (m.hp <= 0) killMob(m);
}
function killMob(m) {
  m.dead = true;
  const k = m.kind, x = m.x, y = m.y + 0.3, z = m.z, R = Math.random;
  const drop = (id, a, b) => spawnItem(x, y, z, id, ri(a, b));
  if (k === "pig") drop(ID.raw_pork, 1, 3); else if (k === "cow") { drop(ID.raw_beef, 1, 3); drop(ID.leather, 0, 2); }
  else if (k === "sheep") { if (!m.sheared) drop(ID.wool, 1, 1); drop(ID.raw_mutton, 1, 2); }
  else if (k === "chicken") { drop(ID.raw_chicken, 1, 1); drop(ID.feather, 0, 2); }
  else if (k === "zombie") { drop(ID.rotten, 0, 2); if (R() < 0.03) spawnItem(x, y, z, ID.iron_ingot, 1); }
  else if (k === "skeleton") { drop(ID.bone, 0, 2); drop(ID.arrow, 0, 2); }
  else if (k === "spider") drop(ID.string, 0, 2);
  sparks(m.x, m.y + m.h / 2, m.z, 0xdddddd, 14, 1);
  if (G) { G.kills = (G.kills || 0) + 1; Ach.bump("kills"); Ach.bump("k_" + k); }
}
function explode(x, y, z, r, byTnt) {
  const W = WORLD; SFX.boom(); if (byTnt) Ach.bump("tnt");
  const R = Math.ceil(r), broken = [];
  for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
    const d = Math.hypot(dx, dy, dz); if (d > r) continue;
    const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz, id = W.get(bx, by, bz); if (id === 0 || BLK[id].fluid) continue;
    const b = BLK[id]; if (b.hard < 0 || b.hard > 20) continue;
    if (Math.random() < (1 - d / r) * 1.1 + 0.15 - b.hard * 0.04) broken.push([bx, by, bz, id]);
  }
  for (const [bx, by, bz, id] of broken) {
    if (id === BID.tnt) { W.setBlock(bx, by, bz, 0, 0); spawnTnt(bx, by, bz, rand(0.4, 1.2)); continue; }
    if (Math.random() < 0.3) { const dr = dropsFor(id, W.getM(bx, by, bz), null); spawnDrops(bx, by, bz, dr); }
    W.setBlock(bx, by, bz, 0, 0);
  }
  for (let i = 0; i < 40; i++) G.parts.push({ x: x + rand(-1, 1), y: y + rand(-1, 1), z: z + rand(-1, 1), vx: rand(-4, 4), vy: rand(0, 5), vz: rand(-4, 4), life: rand(0.5, 1.2), tile: TIX.white, su: 6, sv: 6, sz: rand(0.2, 0.5), tint: Math.random() < 0.5 ? 0x555555 : 0xdddddd, fb: 1 });
  const hit = (e, ew, eh) => {
    const d = Math.hypot(e.x - x, e.y + eh / 2 - y, e.z - z); if (d > r * 2) return 0;
    return (1 - d / (r * 2));
  };
  for (const e of G.ents) {
    if (e.type !== "mob" && e.type !== "item" && e.type !== "tnt") continue;
    const imp = hit(e, e.w, e.h); if (imp <= 0) continue;
    const dx = e.x - x, dz = e.z - z, l = Math.hypot(dx, dz) || 1;
    if (e.type === "mob") { hurtMob(e, (imp * imp + imp) / 2 * 7 * r + 1, x, z, imp * 10); }
    else { e.vx += dx / l * imp * 8; e.vz += dz / l * imp * 8; e.vy += imp * 5; if (e.type === "item" && imp > 0.6) e.dead = true; }
  }
  const p = G.p; const pd = Math.hypot(p.x - x, p.y + 0.9 - y, p.z - z);
  if (pd < r * 2) { const imp = 1 - pd / (r * 2); hurtPlayer((imp * imp + imp) / 2 * 7 * r + 1, "explosion", x, z, imp * 12); }
}

/* ===== aktualizacja ===== */
const isDaySun = () => G && G.dayF > 0.7;
function updateMob(m, dt) {
  const d = MOBS[m.kind], p = G.p;
  m.age += dt; m.hurtT = Math.max(0, m.hurtT - dt); m.atkCd -= dt; m.panic = Math.max(0, m.panic - dt);
  const dx = p.x - m.x, dz = p.z - m.z, dist = Math.hypot(dx, dz), dy = p.y + 0.9 - (m.y + m.h * 0.5);
  const alive = !p.dead && G.mode !== "creative";
  if (m.age > 1 && dist > (d.hostile ? 90 : 120)) { m.dead = true; return; }
  if (d.hostile && m.age > 60 && dist > 48 && Math.random() < dt * 0.2) { m.dead = true; return; }
  if (d.hostile && gdiff() === 0) { m.dead = true; return; }
  let wx = 0, wz = 0, sp = d.speed, face = null;
  if (d.passive) {
    m.wt -= dt;
    if (m.panic > 0) { const l = Math.hypot(m.kbx, m.kbz) || 1; if (!m.fx) { m.fx = m.x - p.x; m.fz = m.z - p.z; } const fl2 = Math.hypot(m.fx, m.fz) || 1; wx = m.fx / fl2; wz = m.fz / fl2; sp *= 1.9; face = [wx, wz]; }
    else { m.fx = 0; if (m.wt <= 0) { m.wt = rand(2, 7); if (Math.random() < 0.55) { const a = Math.random() * 6.283; m.wdx = Math.cos(a); m.wdz = Math.sin(a); } else { m.wdx = 0; m.wdz = 0; } } wx = m.wdx; wz = m.wdz; sp *= 0.7; if (wx || wz) face = [wx, wz]; }
    m.sndT -= dt; if (m.sndT <= 0) { m.sndT = rand(8, 20); if (dist < 16) SFX.mob(d.snd); }
  } else {
    const night = !(G.dayF > 0.6);
    let aggro = alive && dist < (d.spider ? 20 : 32) && Math.abs(dy) < 14;
    if (d.spider && G.dayF > 0.6 && WORLD.sky(Math.floor(m.x), Math.floor(m.y + 0.5), Math.floor(m.z)) >= 12 && m.hurtT <= 0 && !m.provoked) aggro = false;
    if (aggro) {
      const l = dist || 1; face = [dx / l, dz / l];
      if (d.ranged) {
        if (dist > 9) { wx = dx / l; wz = dz / l; } else if (dist < 5) { wx = -dx / l; wz = -dz / l; sp *= 0.8; } else { wx = -dz / l * (m.strafe || 1) * 0.6; wz = dx / l * (m.strafe || 1) * 0.6; if (Math.random() < dt * 0.4) m.strafe = (m.strafe || 1) * -1; }
        m.shootT -= dt;
        if (m.shootT <= 0 && dist < 18 && dist > 3) {
          m.shootT = rand(1.6, 2.6) + (3 - gdiff()) * 0.4;
          const ex = m.x, ey = m.y + 1.6, ez = m.z, tx = p.x, ty = p.y + 1.2, tz = p.z, ll = Math.hypot(tx - ex, ty - ey, tz - ez) || 1, spd = 22, er = (4 - gdiff()) * 0.012;
          spawnArrow(ex, ey, ez, (tx - ex) / ll * spd + rand(-1, 1) * er * 60, (ty - ey) / ll * spd + 2.2 + rand(-1, 1) * er * 40, (tz - ez) / ll * spd + rand(-1, 1) * er * 60, "mob", 2 + gdiff());
          SFX.bow();
        }
      } else if (d.spider) {
        wx = dx / l; wz = dz / l;
        if (dist < 3.2 && m.onGround && m.atkCd <= 0) { m.vy = 6.5; m.kbx = wx * 7; m.kbz = wz * 7; m.atkCd = 1.1; }
        if (dist < 1.4 && m.atkCd < 0.6 && Math.abs(dy) < 1.5) { hurtPlayer(d.dmg * DMGMUL[gdiff()], "mob", m.x, m.z, 4); m.atkCd = 1.2; }
      } else {
        wx = dx / l; wz = dz / l;
        if (dist < 1.25 && Math.abs(dy) < 1.8 && m.atkCd <= 0) { hurtPlayer(d.dmg * DMGMUL[gdiff()], "mob", m.x, m.z, 5); m.atkCd = 1.0; }
      }
      m.sndT -= dt; if (m.sndT <= 0) { m.sndT = rand(6, 14); SFX.mob(d.snd); }
    } else {
      m.wt -= dt; if (m.wt <= 0) { m.wt = rand(2, 6); if (Math.random() < 0.5) { const a = Math.random() * 6.283; m.wdx = Math.cos(a); m.wdz = Math.sin(a); } else { m.wdx = 0; m.wdz = 0; } } wx = m.wdx; wz = m.wdz; sp *= 0.5; if (wx || wz) face = [wx, wz];
    }
    if (d.burn && G.dayF > 0.7 && WORLD.sky(Math.floor(m.x), Math.floor(m.y + m.h), Math.floor(m.z)) >= 15 && !fluidAt(m.x, m.y + 0.5, m.z)) { m.fire = 3; }
  }
  if (face) { const ty = Math.atan2(-face[0], -face[1]); let dd = ty - m.yaw; while (dd > Math.PI) dd -= 6.283; while (dd < -Math.PI) dd += 6.283; m.yaw += clamp(dd, -dt * 6, dt * 6); }
  /* ogień */
  if (m.fire > 0) { m.fire -= dt; m.fireT = (m.fireT || 0) + dt; if (m.fireT >= 1) { m.fireT = 0; m.hp -= 1; m.hurtT = 0.3; if (m.hp <= 0) { killMob(m); return; } } if (Math.random() < dt * 8) sparks(m.x + rand(-0.3, 0.3), m.y + rand(0, m.h), m.z + rand(-0.3, 0.3), Math.random() < 0.5 ? 0xff8a1c : 0xffd23a, 1, 1); }
  /* płyny */
  const fl2 = inFluid(m);
  if (fl2 === 1) { m.vy += (m.vy < 2 ? 22 * dt : 0); m.vy *= Math.pow(0.9, dt * 20); m.fire = 0; if (Math.random() < 0.3 && m.y < 1000) { } }
  else if (fl2 === 2) { m.vy += (m.vy < 1.5 ? 14 * dt : 0); m.hp -= 4 * dt; m.fire = 3; m.hurtT = 0.2; if (m.hp <= 0) { killMob(m); return; } }
  else m.vy -= 30 * dt;
  m.vy = Math.max(m.vy, -50);
  const acc = m.onGround ? 40 : fl2 ? 12 : 8;
  const tvx = wx * sp, tvz = wz * sp;
  m.kbx *= Math.pow(0.02, dt); m.kbz *= Math.pow(0.02, dt);
  m.vx += clamp(tvx - m.vx, -acc * dt, acc * dt); m.vz += clamp(tvz - m.vz, -acc * dt, acc * dt);
  const mx = (m.vx + m.kbx) * dt, mz = (m.vz + m.kbz) * dt;
  /* nie spadaj z krawędzi (bierne stwory) */
  moveEnt(m, mx, m.vy * dt, mz, 0.55);
  if (m.hitY) m.vy = 0;
  if ((m.hitX || m.hitZ) && m.onGround && (wx || wz) && !fl2) m.vy = 8.4;
  if (m.hitX) m.vx = 0; if (m.hitZ) m.vz = 0;
  const spd = Math.hypot(m.vx, m.vz); m.walkA += (clamp(spd / 2, 0, 1) - m.walkA) * Math.min(1, dt * 8); m.walkT += spd * dt * 2.2;
  if (m.y < -20) m.dead = true;
}
function updateItem(e, dt) {
  e.age += dt; e.delay -= dt;
  const fl2 = inFluid(e);
  if (fl2 === 2) { e.dead = true; sparks(e.x, e.y, e.z, 0xff8a1c, 6, 1); return; }
  if (fl2 === 1) { e.vy += (e.vy < 1 ? 14 * dt : 0); e.vy *= Math.pow(0.9, dt * 20); e.vx *= Math.pow(0.9, dt * 20); e.vz *= Math.pow(0.9, dt * 20); } else e.vy -= 26 * dt;
  moveEnt(e, e.vx * dt, e.vy * dt, e.vz * dt, 0);
  if (e.hitY) e.vy *= -0.2; if (e.onGround) { const f = Math.pow(0.001, dt); e.vx *= f; e.vz *= f; }
  if (e.hitX) e.vx = 0; if (e.hitZ) e.vz = 0;
  if (e.age > 300) e.dead = true;
  const p = G.p;
  if (!p.dead && e.delay <= 0) {
    const dx = p.x - e.x, dy = p.y + 0.6 - e.y, dz = p.z - e.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 1.2 * 1.2) {
      const left = invAdd(G.inv, e.stack.id, e.stack.n, e.stack.d);
      if (left < e.stack.n) { SFX.pop(); G.invDirty = true; }
      e.stack.n = left; if (left <= 0) e.dead = true;
    } else if (d2 < 3 * 3 && invRoom(G.inv, e.stack.id, 1)) { const l = Math.sqrt(d2) || 1; e.vx += dx / l * 18 * dt; e.vz += dz / l * 18 * dt; e.vy += dy / l * 18 * dt + 26 * dt; }
  }
}
function updateArrow(e, dt) {
  e.age += dt;
  if (e.stuck) { e.stuck -= dt; if (e.stuck <= 0) e.dead = true; return; }
  e.vy -= 20 * dt; const steps = 3;
  for (let s = 0; s < steps; s++) {
    const nx = e.x + e.vx * dt / steps, ny = e.y + e.vy * dt / steps, nz = e.z + e.vz * dt / steps;
    const id = WORLD.get(Math.floor(nx), Math.floor(ny), Math.floor(nz));
    if (SOLID[id]) { e.stuck = 25; e.vx = e.vy = e.vz = 0; SFX.put("wood"); return; }
    e.x = nx; e.y = ny; e.z = nz;
    if (e.owner === "player") {
      for (const m of G.ents) { if (m.type !== "mob" || m.dead) continue; const hw = m.w / 2 + 0.15; if (Math.abs(m.x - e.x) < hw && Math.abs(m.z - e.z) < hw && e.y > m.y - 0.1 && e.y < m.y + m.h + 0.1) { hurtMob(m, e.dmg, e.x - e.vx, e.z - e.vz, 3); e.dead = true; return; } }
    } else {
      const p = G.p; if (!p.dead && Math.abs(p.x - e.x) < 0.45 && Math.abs(p.z - e.z) < 0.45 && e.y > p.y - 0.1 && e.y < p.y + 1.9) { hurtPlayer(e.dmg * (gdiff() === 3 ? 1 : DMGMUL[gdiff()] || 1) * 0.9, "arrow", e.x - e.vx, e.z - e.vz, 3); e.dead = true; return; }
    }
  }
  if (e.age > 60) e.dead = true;
}
function updateTnt(e, dt) {
  e.fuse -= dt; e.vy -= 28 * dt; moveEnt(e, e.vx * dt, e.vy * dt, e.vz * dt, 0); if (e.hitY) e.vy = 0; if (e.onGround) { e.vx *= 0.8; e.vz *= 0.8; }
  if (fluidAt(e.x, e.y + 0.3, e.z)) { e.vy = Math.max(e.vy, 1); }
  if (e.fuse <= 0) { e.dead = true; explode(e.x, e.y + 0.5, e.z, 4, true); }
}
function updateFall(e, dt) {
  e.vy -= 30 * dt; moveEnt(e, 0, e.vy * dt, 0, 0);
  if (e.onGround || e.hitY) { e.dead = true; const x = Math.floor(e.x), y = Math.floor(e.y + 0.01), z = Math.floor(e.z); const cur = WORLD.get(x, y, z); if (cur === 0 || BLK[cur].rep || BLK[cur].fluid || !SOLID[cur]) { if (cur !== 0 && !BLK[cur].fluid) { } WORLD.setBlock(x, y, z, e.bid, 0); SFX.put("sand"); } else spawnItem(e.x, e.y + 0.3, e.z, e.bid, 1); }
  if (e.y < -10) e.dead = true;
}
function updateParts(dt) {
  const ps = G.parts;
  for (let i = ps.length - 1; i >= 0; i--) { const p = ps[i]; p.life -= dt; if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; } p.vy -= 14 * dt; const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt; if (SOLID[WORLD.get(Math.floor(nx), Math.floor(ny), Math.floor(nz))]) { p.vx *= 0.4; p.vz *= 0.4; p.vy = 0; } else { p.x = nx; p.y = ny; p.z = nz; } }
  if (ps.length > 700) ps.splice(0, ps.length - 700);
}
function updateEnts(dt) {
  const es = G.ents;
  for (let i = 0; i < es.length; i++) {
    const e = es[i]; if (e.dead) continue;
    if (e.type === "mob") updateMob(e, dt); else if (e.type === "item") updateItem(e, dt); else if (e.type === "arrow") updateArrow(e, dt); else if (e.type === "tnt") updateTnt(e, dt); else if (e.type === "fall") updateFall(e, dt);
  }
  /* scalanie przedmiotów */
  G.mergeT = (G.mergeT || 0) - dt;
  if (G.mergeT <= 0) { G.mergeT = 0.6; const items = es.filter((e) => e.type === "item" && !e.dead); for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const a = items[i], b = items[j]; if (!a.dead && !b.dead && a.stack.id === b.stack.id && a.stack.d === b.stack.d && Math.abs(a.x - b.x) < 0.8 && Math.abs(a.z - b.z) < 0.8 && Math.abs(a.y - b.y) < 0.8 && a.stack.n + b.stack.n <= maxStack(a.stack.id)) { a.stack.n += b.stack.n; b.dead = true; } } }
  for (let i = es.length - 1; i >= 0; i--) if (es[i].dead) { es[i] = es[es.length - 1]; es.pop(); }
  updateParts(dt);
}
/* ===== spawn ===== */
function spawnCounts() { let h = 0, pa = 0; for (const e of G.ents) if (e.type === "mob") { if (MOBS[e.kind].hostile) h++; else pa++; } return [h, pa]; }
function findFloor(x, z, yMin, yMax) {
  const W = WORLD;
  for (let y = Math.min(WH - 3, yMax); y >= Math.max(2, yMin); y--) {
    const b = W.get(x, y - 1, z), a1 = W.get(x, y, z), a2 = W.get(x, y + 1, z);
    if (SOLID[b] && !BLK[b].fluid && (a1 === 0 || (!SOLID[a1] && !BLK[a1].fluid && BLK[a1].shape !== 6)) && (a2 === 0 || !SOLID[a2]) && !BLK[a1].fluid && !BLK[a2].fluid) return y;
  }
  return -1;
}
function spawnTick(dt) {
  G.spawnT -= dt; if (G.spawnT > 0) return; G.spawnT = 1.2;
  const p = G.p, cnt = spawnCounts(), W = WORLD;
  if (G.diff > 0 && cnt[0] < 14 + G.diff * 2) {
    for (let tries = 0; tries < 4; tries++) {
      const a = Math.random() * 6.283, r = rand(20, 44), x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
      if (!W.has(x, z)) continue;
      const y = findFloor(x, z, Math.floor(p.y) - 14, Math.floor(p.y) + 14); if (y < 0) continue;
      const sk = W.sky(x, y, z) * (G.sunF), bl = W.blk(x, y, z), light = Math.max(sk, bl * 1.0);
      if (light > 7.5) continue;
      const k = Math.random(), kind = k < 0.5 ? "zombie" : k < 0.8 ? "skeleton" : "spider";
      spawnMob(kind, x + 0.5, y, z + 0.5); break;
    }
  }
  G.spawnP = (G.spawnP || 0) - 1.2;
  if (G.spawnP <= 0 && cnt[1] < 16 && G.dayF > 0.6) {
    G.spawnP = 10;
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * 6.283, r = rand(24, 48), x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
      if (!W.has(x, z)) continue; const y = W.topSolid(x, z); if (y <= SEA) continue;
      if (W.get(x, y - 1, z) !== BID.grass) continue;
      const kinds = ["pig", "cow", "sheep", "chicken"], kind = kinds[Math.floor(Math.random() * 4)];
      for (let n = 0; n < ri(1, 3); n++) spawnMob(kind, x + 0.5 + rand(-1.5, 1.5), y, z + 0.5 + rand(-1.5, 1.5));
      break;
    }
  }
}
function populateChunk(cx, cz) {
  const W = WORLD, rg = mulberry32(hash2(cx, cz, W.seed + 5) * 4294967296 | 0);
  if (rg() > 0.22) return;
  const kinds = ["pig", "cow", "sheep", "chicken"], kind = kinds[Math.floor(rg() * 4)], n = 2 + Math.floor(rg() * 3);
  for (let t = 0; t < 8; t++) {
    const x = cx * 16 + Math.floor(rg() * 16), z = cz * 16 + Math.floor(rg() * 16), y = W.topSolid(x, z);
    if (y > SEA && W.get(x, y - 1, z) === BID.grass) { for (let i = 0; i < n; i++) spawnMob(kind, x + 0.5 + rand(-2, 2), y, z + 0.5 + rand(-2, 2)); return; }
  }
}
/* ===== rysowanie ===== */
function lightBytes(x, y, z) { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z); return [Math.max(WORLD.sky(X, Y, Z), WORLD.sky(X, Y + 1, Z)) * 17, Math.max(WORLD.blk(X, Y, Z), WORLD.blk(X, Y + 1, Z)) * 17]; }
const _c8 = new Array(8);
function emitBoxXf(dy, b, hex, sk, bk, xf, tr, tg, tb, shMul) {
  const uv = WHITE_UV(), r = (hex >> 16) & 255, g = (hex >> 8) & 255, bl = hex & 255;
  const x0 = b[0] / 16, y0 = b[1] / 16, z0 = b[2] / 16, x1 = b[3] / 16, y1 = b[4] / 16, z1 = b[5] / 16;
  for (let i = 0; i < 8; i++) _c8[i] = xf((i & 1) ? x1 : x0, (i & 2) ? y1 : y0, (i & 4) ? z1 : z0);
  for (let f = 0; f < 6; f++) {
    const q = BOXF[f], sh = BOXSH[f] * (shMul || 1);
    for (let k = 0; k < 4; k++) { const c = _c8[q[k]]; dy.v(c[0], c[1], c[2], uv[0], uv[1], r * sh * tr, g * sh * tg, bl * sh * tb, 255, sk, bk); }
    dy.q();
  }
}
function drawMobModel(dy, m, cx, cy, cz) {
  const d = MOBS[m.kind], L = lightBytes(m.x, m.y + m.h * 0.5, m.z), psi = m.yaw + Math.PI, cs = Math.cos(psi), sn = Math.sin(psi);
  const hurt = m.hurtT > 0 ? 1 : 0, tr = hurt ? 1.0 : 1, tg = hurt ? 0.45 : 1, tb = hurt ? 0.45 : 1;
  const sw = Math.sin(m.walkT) * m.walkA * 0.9;
  const dead = 0;
  for (const part of d.parts) {
    let ang = 0;
    if (part.a === "legA") ang = sw; else if (part.a === "legB") ang = -sw; else if (part.a === "armF") ang = m.kind === "zombie" ? -1.45 + sw * 0.15 : -1.25 + (m.kind === "skeleton" && part.b[0] > 0 ? 0.2 : 0);
    const py = (part.py || 0) / 16, pz = (part.pz || 0) / 16, ca = Math.cos(ang), sa = Math.sin(ang);
    const hy = part.a === "head" ? clamp(m.headYaw || 0, -0.6, 0.6) : 0, chy = Math.cos(hy), shy = Math.sin(hy);
    const ox = m.x - cx, oy = m.y - cy, oz = m.z - cz;
    emitBoxXf(dy, part.b, part.wool && m.sheared ? 0xe6c8c0 : part.c, L[0], L[1], (x, y, z) => {
      let lx = x, ly = y, lz = z;
      if (hy) { const nx = lx * chy + lz * shy, nz = -lx * shy + lz * chy; lx = nx; lz = nz; }
      const ry = py + (ly - py) * ca - (lz - pz) * sa, rz = pz + (ly - py) * sa + (lz - pz) * ca; ly = ry; lz = rz;
      return [ox + lx * cs + lz * sn, oy + ly, oz - lx * sn + lz * cs];
    }, tr, tg, tb, m.fire > 0 ? 1.1 : 1);
  }
}
function drawItemEnt(dy, e, cx, cy, cz, t) {
  const L = lightBytes(e.x, e.y + 0.2, e.z), id = e.stack.id, bob = Math.sin(t * 2 + e.spin) * 0.06 + 0.2, ox = e.x - cx, oy = e.y - cy + bob, oz = e.z - cz, a = t * 1.5 + e.spin, ca = Math.cos(a), sa = Math.sin(a);
  const nStack = e.stack.n > 1 ? (e.stack.n > 16 ? 3 : 2) : 1;
  for (let s = 0; s < nStack; s++) {
    const jx = s ? (s === 1 ? 0.08 : -0.08) : 0, jy = s ? 0.03 * s : 0;
    if (id < 256 && BLK[id].shape !== 1 && BLK[id].shape !== 2 && BLK[id].shape !== 6 && BLK[id].shape !== 8 && BLK[id].shape !== 5) {
      const b = BLK[id]; const sz = 0.13, uvq = (tile, f) => { const tu = (tile % ATLAS_N) / ATLAS_N, tv = Math.floor(tile / ATLAS_N) / ATLAS_N, ts = 1 / ATLAS_N; return [tu + 0.002, tv + 0.002, tu + ts - 0.002, tv + ts - 0.002]; };
      const corners = []; for (let i = 0; i < 8; i++) { const lx = ((i & 1) ? sz : -sz), ly = ((i & 2) ? sz * 2 : 0), lz = ((i & 4) ? sz : -sz); corners.push([ox + jx + lx * ca + lz * sa, oy + jy + ly, oz + jy - lx * sa + lz * ca]); }
      const slab = b.shape === 3;
      for (let f = 0; f < 6; f++) {
        const tile = tileIdx(b, f, 0), uv = uvq(tile), q = BOXF[f], sh = BOXSH[f], tint = tintOf(b, f, 0);
        const tr = tint != null ? ((tint >> 16) & 255) / 255 : 1, tg = tint != null ? ((tint >> 8) & 255) / 255 : 1, tb = tint != null ? (tint & 255) / 255 : 1;
        const us = [[uv[0], uv[3]], [uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]]];
        for (let k = 0; k < 4; k++) { const c = corners[q[k]]; dy.v(c[0], c[1] * (slab ? 0.5 : 1) + (slab ? oy * 0.5 : 0), c[2], us[k][0], us[k][1], 255 * sh * tr, 255 * sh * tg, 255 * sh * tb, 255, L[0], L[1]); }
        dy.q();
      }
    } else {
      const tile = id >= 256 ? TIX["i_" + ITM[id].key] : (BLK[id].shape === 5 ? TIX.i_door_item : BLK[id].shape === 8 ? TIX.i_seeds : tileIdx(BLK[id], 4, 0)), tu = (tile % ATLAS_N) / ATLAS_N, tv = Math.floor(tile / ATLAS_N) / ATLAS_N, ts = 1 / ATLAS_N, sz = 0.22;
      const tint = id < 256 ? tintOf(BLK[id], 2, 0) : null, tr = tint != null ? ((tint >> 16) & 255) : 255, tg = tint != null ? ((tint >> 8) & 255) : 255, tb = tint != null ? (tint & 255) : 255;
      const px = (lx, ly) => [ox + jx + lx * ca, oy + jy + ly, oz - lx * sa];
      const A = px(-sz, 0), B = px(-sz, sz * 2), C = px(sz, sz * 2), D = px(sz, 0);
      dy.v(A[0], A[1], A[2], tu + 0.001, tv + ts - 0.001, tr, tg, tb, 255, L[0], L[1]); dy.v(B[0], B[1], B[2], tu + 0.001, tv + 0.001, tr, tg, tb, 255, L[0], L[1]); dy.v(C[0], C[1], C[2], tu + ts - 0.001, tv + 0.001, tr, tg, tb, 255, L[0], L[1]); dy.v(D[0], D[1], D[2], tu + ts - 0.001, tv + ts - 0.001, tr, tg, tb, 255, L[0], L[1]); dy.q();
    }
  }
}
function drawEntities(R, gl, U, cx, cy, cz) {
  const dy = R.dyn; dy.reset(); const t = performance.now() / 1000, st = G.renderCam;
  gl.uniform3f(U.u_off, 0, 0, 0);
  for (const e of G.ents) {
    if (e.dead) continue; const dx = e.x - cx, dz = e.z - cz; if (dx * dx + dz * dz > 80 * 80) continue;
    if (e.type === "mob") drawMobModel(dy, e, cx, cy, cz);
    else if (e.type === "item") drawItemEnt(dy, e, cx, cy, cz, t);
    else if (e.type === "arrow") {
      const L = lightBytes(e.x, e.y, e.z), l = Math.hypot(e.vx, e.vy, e.vz) || 1, ux = e.vx / l, uy = e.vy / l, uz = e.vz / l;
      const tx = -uz, tz = ux, tl = Math.hypot(tx, tz) || 1, ax = tx / tl * 0.03, az = tz / tl * 0.03;
      const uv = WHITE_UV(), ox = e.x - cx, oy = e.y - cy, oz = e.z - cz, len = 0.55;
      for (const side of [0, 1]) {
        const px = side ? 0 : ax, pz = side ? az : 0, py = side ? 0.03 : 0;
        const A = [ox - ux * len + px, oy - uy * len + py, oz - uz * len + pz], B = [ox + ux * 0.15 + px, oy + uy * 0.15 + py, oz + uz * 0.15 + pz], C = [ox + ux * 0.15 - px, oy + uy * 0.15 - py, oz + uz * 0.15 - pz], D = [ox - ux * len - px, oy - uy * len - py, oz - uz * len - pz];
        dy.v(A[0], A[1], A[2], uv[0], uv[1], 150, 120, 80, 255, L[0], L[1]); dy.v(B[0], B[1], B[2], uv[0], uv[1], 200, 200, 200, 255, L[0], L[1]); dy.v(C[0], C[1], C[2], uv[0], uv[1], 200, 200, 200, 255, L[0], L[1]); dy.v(D[0], D[1], D[2], uv[0], uv[1], 150, 120, 80, 255, L[0], L[1]); dy.q();
      }
    } else if (e.type === "tnt" || e.type === "fall") {
      const b = BLK[e.type === "tnt" ? BID.tnt : e.bid], L = lightBytes(e.x, e.y + 0.5, e.z), flash = e.type === "tnt" && Math.floor(e.fuse * 5) % 2 === 0 ? 1.6 : 1, s = e.type === "tnt" ? 0.49 * (1 + Math.max(0, 1 - e.fuse) * 0.1) : 0.49;
      const ox = e.x - cx, oy = e.y - cy, oz = e.z - cz;
      for (let f = 0; f < 6; f++) {
        const tile = tileIdx(b, f, 0), tu = (tile % ATLAS_N) / ATLAS_N, tv = Math.floor(tile / ATLAS_N) / ATLAS_N, ts = 1 / ATLAS_N, q = BOXF[f], sh = BOXSH[f] * flash;
        const us = [[tu, tv + ts], [tu, tv], [tu + ts, tv], [tu + ts, tv + ts]];
        for (let k = 0; k < 4; k++) { const i = q[k]; dy.v(ox + ((i & 1) ? s : -s), oy + ((i & 2) ? s * 2 : 0), oz + ((i & 4) ? s : -s), us[k][0], us[k][1], clamp(255 * sh, 0, 255), clamp(255 * sh, 0, 255), clamp(255 * sh, 0, 255), 255, L[0], L[1]); }
        dy.q();
      }
    }
  }
  /* cząsteczki: billboardy zwrócone do kamery */
  const cy_ = Math.cos(st.yaw), sy_ = Math.sin(st.yaw), rx = cy_, rz = -sy_;
  for (const p of G.parts) {
    const tu = (p.tile % ATLAS_N) / ATLAS_N, tv = Math.floor(p.tile / ATLAS_N) / ATLAS_N, ts = 1 / ATLAS_N / 16, u0 = tu + p.su * ts, v0 = tv + p.sv * ts, u1 = u0 + 4 * ts, v1 = v0 + 4 * ts;
    const L = p.fb ? [255, 255] : lightBytes(p.x, p.y, p.z), s = p.sz, ox = p.x - cx, oy = p.y - cy, oz = p.z - cz;
    const tr = p.tint != null ? (p.tint >> 16) & 255 : 255, tg = p.tint != null ? (p.tint >> 8) & 255 : 255, tb = p.tint != null ? p.tint & 255 : 255, a = clamp(p.life * 3, 0, 1) * 255;
    dy.v(ox - rx * s, oy - s, oz - rz * s, u0, v1, tr, tg, tb, a, L[0], L[1]); dy.v(ox - rx * s, oy + s, oz - rz * s, u0, v0, tr, tg, tb, a, L[0], L[1]); dy.v(ox + rx * s, oy + s, oz + rz * s, u1, v0, tr, tg, tb, a, L[0], L[1]); dy.v(ox + rx * s, oy - s, oz + rz * s, u1, v1, tr, tg, tb, a, L[0], L[1]); dy.q();
  }
  gl.uniform1f(U.u_cut, 0.05); gl.enable(gl.BLEND);
  R.drawDyn(dy);
  gl.uniform1f(U.u_cut, 0.5); gl.disable(gl.BLEND);
}
/* ===================== GRACZ ===================== */
function newPlayer() {
  return { x: 0.5, y: 40, z: 0.5, vx: 0, vy: 0, vz: 0, w: 0.6, h: 1.8, yaw: 0, pitch: 0, onGround: false, hp: 20, food: 20, sat: 5, exh: 0, air: 15, fly: false, sneak: false, sprint: false, fallDist: 0, invuln: 0, lastDmg: 0, dead: false, inWater: false, headWater: false, inLava: false, burn: 0, spawn: null, regenT: 0, starveT: 0, drownT: 0, eatT: 0, walkD: 0, hitFlash: 0, cause: "", killer: "", lavaT: 0, cactT: 0, onLadder: false, eyeH: 1.62, hungerFx: 0 };
}
const armorPts = () => { let a = 0; for (let i = 0; i < 4; i++) { const s = G.inv.armor[i]; if (s) a += ITM[s.id].armor.pts; } return a; };
function hurtPlayer(amount, src, fx, fz, kb, killerKind) {
  const p = G.p; if (p.dead || G.mode === "creative" || G.state === "menu") return;
  if (p.invuln > 0 && amount <= p.lastDmg) return;
  if (src === "mob" || src === "arrow" || src === "explosion" || src === "cactus" || src === "lava" || src === "fire") amount *= 1 - Math.min(armorPts(), 20) * 0.04;
  if (src === "fall" && G.diff === 0) amount = 0;
  amount = Math.max(0, amount); if (amount <= 0) return;
  p.hp -= amount; p.invuln = 0.5; p.lastDmg = amount; p.hitFlash = 0.35; p.cause = src;
  if (src === "mob" && killerKind) p.killer = killerKind;
  if (fx != null) { const dx = p.x - fx, dz = p.z - fz, l = Math.hypot(dx, dz) || 1; p.vx += dx / l * (kb || 4); p.vz += dz / l * (kb || 4); if (kb) p.vy = Math.max(p.vy, 4); }
  SFX.hurt();
  if (src === "mob" || src === "arrow" || src === "explosion") for (let i = 0; i < 4; i++) { const s = G.inv.armor[i]; if (s && Math.random() < 0.5) { s.d = (s.d || 0) + 1; if (s.d >= durOf(s.id)) { G.inv.armor[i] = null; UI.toast("Zbroja się zniszczyła!"); } } }
  G.invDirty = true;
  if (p.hp <= 0) killPlayer();
}
const DEATH_TXT = { fall: "spadł z wysokości", drown: "utonął", lava: "spłonął w lawie", fire: "spłonął", mob: "został zabity", arrow: "został zastrzelony", explosion: "został wysadzony w powietrze", starve: "zmarł z głodu", cactus: "zginął, nakłuty przez kaktus", void: "wypadł ze świata", "": "zginął" };
function killPlayer() {
  const p = G.p; if (p.dead) return; p.dead = true; p.hp = 0; SFX.die();
  const txt = (DEATH_TXT[p.cause] || "zginął") + (p.cause === "mob" && p.killer ? " (" + MOBS[p.killer].name + ")" : "");
  G.deathText = "Zginąłeś: " + txt.replace(/^./, (c) => c);
  if (G.mode !== "creative") {
    for (let i = 0; i < 36; i++) { const s = G.inv.slots[i]; if (s) { spawnItem(p.x, p.y + 0.5, p.z, s.id, s.n, s.d, rand(-3, 3), rand(2, 6), rand(-3, 3), 3); G.inv.slots[i] = null; } }
    for (let i = 0; i < 4; i++) { const s = G.inv.armor[i]; if (s) { spawnItem(p.x, p.y + 0.5, p.z, s.id, s.n, s.d, rand(-3, 3), rand(2, 6), rand(-3, 3), 3); G.inv.armor[i] = null; } }
  }
  if (G.cursor) { G.cursor = null; }
  onPlayerDeath();
}
function respawnPlayer() {
  const p = G.p, W = WORLD; const sp = p.spawn || G.worldSpawn;
  p.dead = false; p.hp = 20; p.food = 20; p.sat = 5; p.exh = 0; p.air = 15; p.burn = 0; p.vx = p.vy = p.vz = 0; p.fallDist = 0; p.fly = false; p.invuln = 2; p.hungerFx = 0;
  let x = sp[0], z = sp[2], y = sp[1];
  /* upewnij się, że miejsce jest bezpieczne */
  for (let i = 0; i < 40; i++) { W.loadChunk(Math.floor(x) >> 4, Math.floor(z) >> 4); }
  y = W.topSolid(Math.floor(x), Math.floor(z)); if (SOLID[W.get(Math.floor(sp[0]), Math.floor(sp[1]), Math.floor(sp[2]))] === 0 && W.get(Math.floor(sp[0]), Math.floor(sp[1]) - 1, Math.floor(sp[2])) !== 0 && p.spawn) y = sp[1];
  p.x = x; p.y = y + 0.01; p.z = z;
}
const SND_OF = (id) => (id ? BLK[id].snd : "stone");
function updatePlayer(dt) {
  const p = G.p, I = G.input, W = WORLD; if (p.dead) return;
  const creative = G.mode === "creative", canMove = G.state === "play";
  p.invuln = Math.max(0, p.invuln - dt); p.hitFlash = Math.max(0, p.hitFlash - dt);
  let mx = 0, mz = 0;
  if (canMove) { mx = (I.r ? 1 : 0) - (I.l ? 1 : 0) + (I.jx || 0); mz = (I.f ? 1 : 0) - (I.b ? 1 : 0) + (I.jz || 0); const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; } }
  p.sneak = canMove && !!I.sneak && !p.fly;
  const feetFl = inFluid(p), headFl = fluidAt(p.x, p.y + p.eyeH, p.z);
  p.inWater = feetFl === 1; p.inLava = feetFl === 2; p.headWater = headFl === 1;
  const lx = Math.floor(p.x), lz = Math.floor(p.z);
  p.onLadder = BLK[W.get(lx, Math.floor(p.y + 0.3), lz)].shape === 6 || BLK[W.get(lx, Math.floor(p.y + 1.2), lz)].shape === 6;
  /* sprint */
  const wantSprint = canMove && mz > 0.3 && (I.sprint || I.sprintTap) && !p.sneak && (creative || p.food > 6) && !p.headWater;
  if (!wantSprint) p.sprint = false; else p.sprint = true;
  if (p.sprint && (p.hitX || p.hitZ) && !p.fly) { p.sprint = false; I.sprintTap = false; }
  let speed = p.fly ? (p.sprint ? 21 : 10.9) : p.sneak ? 1.3 : p.sprint ? 5.61 : 4.32;
  if (p.inWater && !p.fly) speed = p.sprint ? 3.2 : 2.4; if (p.inLava && !p.fly) speed = 1.5;
  if (p.eatT > 0 && !p.fly) speed *= 0.7;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw), wxv = (-sy * mz + cy * mx) * speed, wzv = (-cy * mz - sy * mx) * speed;
  const onIce = p.onGround && (W.get(lx, Math.floor(p.y - 0.1), lz) === BID.ice);
  const acc = p.fly ? 30 : p.onGround ? (onIce ? 3 : 55) : p.inWater || p.inLava ? 16 : 11;
  p.vx += clamp(wxv - p.vx, -acc * dt, acc * dt); p.vz += clamp(wzv - p.vz, -acc * dt, acc * dt);
  /* pionowo */
  if (p.fly) {
    const tv = canMove ? ((I.jump ? 1 : 0) - (I.sneak ? 1 : 0)) * (p.sprint ? 14 : 9) : 0; p.vy += clamp(tv - p.vy, -40 * dt, 40 * dt);
  } else if (p.onLadder) {
    let tv = -2.5; if (canMove && (I.jump || mz > 0.1 && (p.hitX || p.hitZ))) tv = 3.2; else if (p.sneak) tv = 0;
    p.vy += clamp(tv - p.vy, -30 * dt, 30 * dt); p.fallDist = 0;
  } else if (p.inWater) {
    p.vy -= 6 * dt; p.vy *= Math.pow(0.82, dt * 20); if (canMove && I.jump) { p.vy += 26 * dt; if (p.vy > 3.8) p.vy = 3.8; if (!p.headWater && (p.hitX || p.hitZ)) p.vy = 7.2; }
    p.fallDist = 0;
  } else if (p.inLava) { p.vy -= 4 * dt; p.vy *= Math.pow(0.5, dt * 20); if (canMove && I.jump) p.vy = Math.min(p.vy + 14 * dt, 2.8); p.fallDist = 0; }
  else {
    p.vy -= 32 * dt; if (p.vy < -58) p.vy = -58;
    if (canMove && I.jump && p.onGround) { p.vy = 8.9; if (p.sprint) { p.vx += -sy * 2.2; p.vz += -cy * 2.2; p.exh += 0.2; } else p.exh += 0.05; p.onGround = false; I.jumpHeld = true; }
  }
  /* ruch z ochroną krawędzi podczas skradania */
  let dx = p.vx * dt, dz = p.vz * dt;
  if (p.sneak && p.onGround) {
    while (dx !== 0 && !hasGroundAt(p, p.x + dx, p.z)) { if (Math.abs(dx) < 0.03) { dx = 0; p.vx = 0; } else dx -= Math.sign(dx) * 0.03; }
    while (dz !== 0 && !hasGroundAt(p, p.x, p.z + dz)) { if (Math.abs(dz) < 0.03) { dz = 0; p.vz = 0; } else dz -= Math.sign(dz) * 0.03; }
    while (dx !== 0 && dz !== 0 && !hasGroundAt(p, p.x + dx, p.z + dz)) { dx -= Math.sign(dx) * 0.03; dz -= Math.sign(dz) * 0.03; if (Math.abs(dx) < 0.03) dx = 0; if (Math.abs(dz) < 0.03) dz = 0; }
  }
  const px0 = p.x, pz0 = p.z, py0 = p.y, vyBefore = p.vy; p.h = p.sneak ? 1.65 : 1.8; p.eyeH += ((p.sneak ? 1.47 : 1.62) - p.eyeH) * Math.min(1, dt * 14);
  moveEnt(p, dx, p.vy * dt, dz, p.sneak || p.fly ? 0 : 0.6);
  if (p.hitX) p.vx = 0; if (p.hitZ) p.vz = 0;
  const fell = py0 - p.y;
  if (fell > 0 && !p.fly && !p.inWater && !p.inLava && !p.onLadder) p.fallDist += fell;
  if (p.hitY) {
    if (vyBefore < 0) {
      if (!creative && !p.fly && p.fallDist > 3 && !p.inWater) { hurtPlayer(Math.ceil(p.fallDist - 3), "fall"); SFX.put("dirt"); }
      else if (vyBefore < -8) SFX.put(SND_OF(W.get(lx, Math.floor(p.y - 0.2), lz)));
      p.fallDist = 0;
    }
    p.vy = 0;
  }
  if (p.fly && p.onGround && !I.jump) p.fly = false;
  if (p.fly || p.inWater || p.inLava || p.onLadder) p.fallDist = 0;
  /* kroki */
  const moved = Math.hypot(p.x - px0, p.z - pz0);
  if (p.onGround && moved > 0) { p.walkD += moved; if (p.walkD > (p.sprint ? 2.6 : 1.9)) { p.walkD = 0; if (!p.sneak) SFX.step(SND_OF(W.get(lx, Math.floor(p.y - 0.2), lz))); } p.bob = (p.bob || 0) + moved * 5.5; }
  if (!creative) {
    if (moved > 0.0001 && p.onGround) p.exh += moved * (p.sprint ? 0.1 : 0.01); else if (moved > 0.0001 && p.inWater) p.exh += moved * 0.015;
    if (p.exh >= 4) { p.exh -= 4; if (p.sat > 0) p.sat = Math.max(0, p.sat - 1); else if (G.diff > 0) p.food = Math.max(0, p.food - 1); }
    if (p.hungerFx > 0) { p.hungerFx -= dt; p.exh += 0.12 * dt * 20 * 0.1; }
    if (p.food >= 18 && p.hp < 20) { p.regenT += dt; if (p.regenT >= 4) { p.regenT = 0; p.hp = Math.min(20, p.hp + 1); p.exh += 3; } } else p.regenT = 0;
    if (p.food <= 0) { p.starveT += dt; if (p.starveT >= 4) { p.starveT = 0; if (G.diff === 3 || (G.diff === 2 && p.hp > 1) || (G.diff === 1 && p.hp > 10)) hurtPlayer(1, "starve"); } } else p.starveT = 0;
  } else { p.hp = 20; p.food = 20; p.air = 15; p.burn = 0; }
  /* powietrze */
  if (!creative) {
    if (p.headWater) { p.air -= dt; if (p.air <= 0) { p.air = 0; p.drownT += dt; if (p.drownT >= 1) { p.drownT = 0; hurtPlayer(2, "drown"); } } } else { p.air = Math.min(15, p.air + dt * 6); p.drownT = 0; }
    if (p.inLava) { p.lavaT += dt; p.burn = 8; if (p.lavaT >= 0.5) { p.lavaT = 0; hurtPlayer(4, "lava"); } } else p.lavaT = 0;
    if (p.burn > 0) { p.burn -= dt; if (p.inWater) p.burn = 0; p.fireT = (p.fireT || 0) + dt; if (p.fireT >= 1) { p.fireT = 0; hurtPlayer(1, "fire"); } }
    /* kaktus */
    p.cactT -= dt; if (p.cactT <= 0) { const hw = p.w / 2 + 0.1; for (const [ax, az] of [[-hw, 0], [hw, 0], [0, -hw], [0, hw]]) { if (W.get(Math.floor(p.x + ax), Math.floor(p.y + 0.5), Math.floor(p.z + az)) === BID.cactus) { hurtPlayer(1, "cactus"); p.cactT = 0.5; break; } } }
    if (p.y < -12) hurtPlayer(4, "void");
  }
}
/* ===================== INTERFEJS ===================== */
const Game = {};
const SET = { rd: 4, sens: 1, fov: 70, bright: 1, sound: 1, invert: 0 };
(function loadSet() { try { const o = JSON.parse(localStorage.getItem("wr_kop_set") || "{}"); for (const k in SET) if (o[k] != null) SET[k] = o[k]; } catch (e) {} })();
function saveSet() { try { localStorage.setItem("wr_kop_set", JSON.stringify(SET)); } catch (e) {} }
const IS_TOUCH = (() => { try { return window.matchMedia("(pointer:coarse)").matches || "ontouchstart" in window; } catch (e) { return false; } })();
if (IS_TOUCH) SET.rd = Math.min(SET.rd, 3);

const KCSS = `
.kop{position:fixed;inset:0;z-index:2147483000;background:#000;color:#f3ede6;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;touch-action:none;overflow:hidden;--s:min(46px,calc((100vw - 26px)/9.6),calc((100vh - 120px)/9))}
.kop *{box-sizing:border-box}
.kop canvas.kcv{position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated}
.kop .kui{position:absolute;inset:0;pointer-events:none}
.kop .kui>*{pointer-events:auto}
.kop .kx{position:absolute;pointer-events:none!important}
.kop img{image-rendering:pixelated;-webkit-user-drag:none}
.kop button{font:inherit;color:inherit;cursor:pointer}
.kop .kbtn{display:block;width:100%;margin:6px 0;padding:11px 14px;border:2px solid #000;border-radius:3px;background:linear-gradient(#7a7a7a,#5a5a5a);color:#fff;font-weight:700;font-size:15px;text-shadow:1px 1px #222;box-shadow:inset 2px 2px #9a9a9a,inset -2px -2px #3a3a3a}
.kop .kbtn:hover{background:linear-gradient(#8a8aa8,#6a6a88)}
.kop .kbtn:active{background:#4a4a60}
.kop .kbtn.gold{background:linear-gradient(#d4af37,#a8851f);color:#1a1405;text-shadow:none;box-shadow:inset 2px 2px #f2d56b,inset -2px -2px #7a5f12}
.kop .kbtn.red{background:linear-gradient(#a33,#722)}
.kop .kbtn.sm{display:inline-block;width:auto;margin:3px;padding:7px 12px;font-size:13px}
.kop .kbtn.on{outline:2px solid #d4af37}
.kop .kbtn[disabled]{opacity:.45;pointer-events:none}
.kop .kscreen{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62);overflow:auto;padding:12px}
.kop .kscreen.dark{background:#1b1612 url() center/cover}
.kop .kcard{width:min(440px,100%);max-height:100%;overflow:auto;background:#2b241d;border:3px solid #5a4a3a;border-radius:6px;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.6)}
.kop .kcard h2{margin:0 0 4px;font-size:22px;color:#d4af37;letter-spacing:.5px}
.kop .kcard h3{margin:12px 0 4px;font-size:14px;color:#c9b99a;font-weight:600}
.kop .kcard p{margin:6px 0;font-size:13px;line-height:1.45;color:#d9cfbf}
.kop .ktitle{text-align:center;font-size:clamp(34px,9vw,60px);font-weight:900;letter-spacing:3px;color:#d4af37;text-shadow:3px 3px #000,0 0 22px rgba(212,175,55,.35);margin:0}
.kop .ksub{text-align:center;color:#c9b99a;font-size:13px;margin:2px 0 14px}
.kop .kslotrow{display:flex;gap:8px;align-items:center;background:#1f1a15;border:2px solid #3a2f26;border-radius:4px;padding:8px;margin:7px 0}
.kop .kslotrow .t{flex:1;min-width:0}.kop .kslotrow b{display:block;font-size:14px}.kop .kslotrow small{color:#a99a85;font-size:11.5px}
.kop label.kl{display:block;margin:9px 0 3px;font-size:12.5px;color:#c9b99a}
.kop input[type=text],.kop input[type=number]{width:100%;padding:8px;border:2px solid #000;background:#14110f;color:#fff;border-radius:3px;font:inherit}
.kop input[type=range]{width:100%;accent-color:#d4af37}
.kop .krow{display:flex;gap:6px;flex-wrap:wrap}.kop .krow .kbtn{flex:1;min-width:90px}
.kop .kopt{display:flex;justify-content:space-between;align-items:center;font-size:13px;margin:8px 0 2px}
/* HUD */
.kop .khud{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;pointer-events:none}
.kop .kbars{display:flex;justify-content:space-between;width:calc(var(--s)*9);margin-bottom:3px;font-size:0}
.kop .kbarL,.kop .kbarR{display:flex;flex-direction:column;gap:1px}.kop .kbarR{align-items:flex-end}
.kop .kic9{display:flex}.kop .kic9 img{width:calc(var(--s)*.42);height:calc(var(--s)*.42);margin-right:1px}.kop .kbarR .kic9{flex-direction:row-reverse}.kop .kbarR .kic9 img{margin:0 0 0 1px}
.kop .khotbar{display:flex;background:rgba(20,16,12,.8);border:2px solid #000;pointer-events:auto}
.kop .kslot{position:relative;width:var(--s);height:var(--s);background:#1a1511;border:2px solid #3f342a;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none}
.kop .kslot:hover{background:#2c241c;border-color:#d4af37}
.kop .kslot.sel{border-color:#fff;box-shadow:0 0 0 2px #000 inset,0 0 8px rgba(255,255,255,.5)}
.kop .kslot img{width:80%;height:80%}
.kop .kslot .n{position:absolute;right:2px;bottom:0;font-size:calc(var(--s)*.3);font-weight:800;color:#fff;text-shadow:1px 1px #000,-1px 1px #000,1px -1px #000,-1px -1px #000;pointer-events:none}
.kop .kslot .dur{position:absolute;left:12%;right:12%;bottom:3px;height:3px;background:#000;pointer-events:none}.kop .kslot .dur i{display:block;height:100%}
.kop .kslot.arm{opacity:.95;border-style:dashed}
.kop .kslot.out{width:calc(var(--s)*1.25);height:calc(var(--s)*1.25)}
.kop .kcross{position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;pointer-events:none;mix-blend-mode:difference}
.kop .kcross:before,.kop .kcross:after{content:"";position:absolute;background:#fff}.kop .kcross:before{left:9px;top:2px;width:2px;height:16px}.kop .kcross:after{top:9px;left:2px;height:2px;width:16px}
.kop .kitemname{position:absolute;left:0;right:0;bottom:calc(var(--s)*1.9 + 34px);text-align:center;font-weight:700;text-shadow:1px 1px #000;pointer-events:none;transition:opacity .4s;opacity:0;font-size:14px}
.kop .kdmg{position:absolute;inset:0;background:radial-gradient(transparent 45%,rgba(200,0,0,.65));opacity:0;pointer-events:none;transition:opacity .25s}
.kop .kuw{position:absolute;inset:0;background:rgba(20,60,140,.28);opacity:0;pointer-events:none}
.kop .khand{position:absolute;right:6%;bottom:-2%;width:clamp(90px,22vw,190px);height:clamp(90px,22vw,190px);pointer-events:none;transform-origin:80% 100%;transform:rotate(-10deg) translateY(10%)}
.kop .khand img{width:100%;height:100%;filter:drop-shadow(4px 6px 0 rgba(0,0,0,.35))}
.kop .khand.swing{animation:kswing .26s ease-out}
@keyframes kswing{0%{transform:rotate(-10deg) translateY(10%)}40%{transform:rotate(-38deg) translate(-18%,-12%)}100%{transform:rotate(-10deg) translateY(10%)}}
.kop .ktoast{position:absolute;left:50%;top:12%;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none;width:min(520px,92vw)}
.kop .ktoast div{background:rgba(20,16,12,.88);border:2px solid #5a4a3a;padding:6px 12px;border-radius:4px;font-size:13px;text-align:center;animation:ktin .2s}
.kop .ktoast div.gold{border-color:#d4af37;color:#f6e08a}
@keyframes ktin{from{opacity:0;transform:translateY(-6px)}}
.kop .kgoal{position:absolute;left:8px;max-width:min(420px,60vw);font-size:12px;line-height:1.3;background:rgba(20,16,12,.7);border:1px solid #5a4a3a;color:#f6e08a;padding:5px 9px;border-radius:6px;cursor:pointer;z-index:3;text-shadow:0 1px 0 #000}
.kop .kdbg{position:absolute;left:6px;top:6px;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;background:rgba(0,0,0,.5);padding:4px 6px;white-space:pre;pointer-events:none;display:none}
.kop .kbreath{position:absolute;left:0;right:0;bottom:calc(var(--s)*1.9 + 6px);display:flex;justify-content:center;pointer-events:none}
.kop .kbreath .kic9{flex-direction:row-reverse;width:calc(var(--s)*9);justify-content:flex-start}
.kop .kcur{position:fixed;left:0;top:0;width:var(--s);height:var(--s);pointer-events:none!important;z-index:5;display:none}
.kop .kcur img{width:80%;height:80%;margin:10%}.kop .kcur .n{position:absolute;right:2px;bottom:0;font-size:calc(var(--s)*.3);font-weight:800;text-shadow:1px 1px #000}
.kop .ktip{position:fixed;z-index:6;pointer-events:none;background:rgba(12,8,16,.95);border:2px solid #3a2a5a;padding:4px 8px;font-size:12.5px;border-radius:3px;display:none;white-space:nowrap}
/* ekwipunek */
.kop .kinv{background:#2b241d;border:3px solid #5a4a3a;border-radius:6px;padding:10px;max-width:100%;max-height:100%;overflow:auto;box-shadow:0 10px 40px #000}
.kop .kinv h4{margin:0 0 6px;font-size:13px;color:#c9b99a;font-weight:600}
.kop .kgrid{display:grid;gap:2px;grid-template-columns:repeat(9,var(--s));width:max-content}
.kop .kgrid.c2{grid-template-columns:repeat(2,var(--s))}.kop .kgrid.c3{grid-template-columns:repeat(3,var(--s))}.kop .kgrid.c1{grid-template-columns:var(--s)}
.kop .kcrow{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}
.kop .karrow{font-size:calc(var(--s)*.6);color:#c9b99a;width:calc(var(--s)*.8);text-align:center}
.kop .kprog{width:calc(var(--s)*1.1);height:10px;background:#000;border:1px solid #3a2f26}.kop .kprog i{display:block;height:100%;background:#d4af37;width:0}
.kop .kflame{width:calc(var(--s)*.5);height:calc(var(--s)*.6);background:#000;border:1px solid #3a2f26;position:relative}.kop .kflame i{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(#ffd23a,#e65a12);height:0}
.kop .kcats{display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap}
.kop .kpal{max-height:calc(var(--s)*5.2);overflow:auto;margin-bottom:8px;padding-right:4px;touch-action:pan-y}
.kop .ksep{height:8px}
/* sterowanie dotykowe */
.kop .ktouch{position:absolute;inset:0;pointer-events:none;display:none}.kop.touch .ktouch{display:block}
.kop .kjoy{position:absolute;left:22px;bottom:96px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.3);pointer-events:auto;touch-action:none}
.kop .kjoy i{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px;border-radius:50%;background:rgba(255,255,255,.35)}
.kop .ktb{position:absolute;width:62px;height:62px;border-radius:50%;background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.4);color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;text-align:center;line-height:1.05}
.kop .ktb.on{background:rgba(212,175,55,.5)}
.kop .ktsm{position:absolute;pointer-events:auto;padding:8px 11px;border-radius:5px;background:rgba(0,0,0,.45);border:2px solid rgba(255,255,255,.35);font-size:12px;font-weight:700;touch-action:none}
`;
function injectKCss() { if (document.getElementById("kop-css")) return; const s = document.createElement("style"); s.id = "kop-css"; s.textContent = KCSS; document.head.appendChild(s); }

/* ikony HUD (pikselart) */
function mkPix(w, hh, fn) { const c = document.createElement("canvas"); c.width = w; c.height = hh; const x = c.getContext("2d"), im = x.createImageData(w, hh), d = im.data; const px = new Array(w * hh).fill(null); fn((X, Y, hex) => { if (X >= 0 && Y >= 0 && X < w && Y < hh) px[Y * w + X] = hex; }); for (let y = 0; y < hh; y++) for (let X = 0; X < w; X++) { let hx = px[y * w + X], a = 255; if (hx == null) { let near = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = X + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < hh && px[ny * w + nx] != null) near = true; } if (!near) continue; hx = 0x1a0d0d; } const o = (y * w + X) * 4; d[o] = (hx >> 16) & 255; d[o + 1] = (hx >> 8) & 255; d[o + 2] = hx & 255; d[o + 3] = a; } x.putImageData(im, 0, 0); return c.toDataURL(); }
const HEART_M = [".XXX.XXX.", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X...."];
function heartIcon(kind) { return mkPix(11, 10, (S) => { HEART_M.forEach((r, y) => { for (let x = 0; x < 9; x++) if (r[x] === "X") { const full = kind === 2 || (kind === 1 && x <= 4); S(x + 1, y + 1, full ? ((x < 3 && y < 2) ? 0xff8c8c : 0xe02a2a) : 0x3a2222); } }); }); }
function foodIcon(kind) { return mkPix(11, 10, (S) => { const col = kind === 0 ? 0x3a2a1e : 0xc27a36; for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) { const dx = x - 6, dy = y - 2.6; if (dx * dx / 10 + dy * dy / 9 <= 1 && (kind === 2 || (kind === 1 && x >= 6 ) || kind === 0)) S(x + 1, y + 1, kind === 0 ? col : (dx < -1 && dy < 0 ? 0xe29a52 : col)); } for (let i = 0; i < 4; i++) S(1 + i, 8 - i, kind === 0 ? 0x4a4038 : 0xeee9d6); }); }
function armorIcon(kind) { const M = ["XX.....XX", "XXXXXXXXX", "XXXXXXXXX", ".XXXXXXX.", ".XXXXXXX.", ".XXXXXXX.", ".XXXXXXX."]; return mkPix(11, 9, (S) => { M.forEach((r, y) => { for (let x = 0; x < 9; x++) if (r[x] === "X") { const full = kind === 2 || (kind === 1 && x <= 4); S(x + 1, y + 1, full ? (x + y < 5 ? 0xe8e8e8 : 0xb8b8b8) : 0x3a3a3a); } }); }); }
function bubbleIcon() { return mkPix(11, 11, (S) => { for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) { const d = Math.hypot(x - 4, y - 4); if (d <= 4.2) S(x + 1, y + 1, d > 3.2 ? 0xbfe6ff : (x < 4 && y < 4 ? 0xffffff : 0x5ab0ff)); } }); }
let HUDI = null;
function hudIcons() { if (!HUDI) HUDI = { h: [heartIcon(0), heartIcon(1), heartIcon(2)], f: [foodIcon(0), foodIcon(1), foodIcon(2)], a: [armorIcon(0), armorIcon(1), armorIcon(2)], b: bubbleIcon() }; return HUDI; }

/* lista kreatywna */
const CREATIVE_CATS = [["b", "Bloki"], ["t", "Narzędzia i zbroje"], ["f", "Jedzenie"], ["m", "Materiały"]];
const CREATIVE = (() => {
  const c = { b: [], t: [], f: [], m: [] };
  const skip = new Set([BID.air, BID.water, BID.lava, BID.door_upper, BID.furnace_on, BID.wheat, BID.tnt_lit]);
  for (let id = 1; id < NB; id++) if (!skip.has(id)) c.b.push(id);
  for (const k in ITM) { const it = ITM[k]; if (it.tool || it.armor || it.key === "bucket" || it.key === "bucket_water" || it.key === "bucket_lava" || it.key === "bow" || it.key === "flint_steel" || it.key === "arrow") c.t.push(+k); else if (it.food) c.f.push(+k); else c.m.push(+k); }
  return c;
})();

let UI = null;
function buildUI(root, touch) {
  injectKCss();
  const U = { root, touch };
  const el = (cls, tag) => { const e = document.createElement(tag || "div"); if (cls) e.className = cls; return e; };
  U.cv = el("kcv", "canvas"); root.append(U.cv);
  U.hand = el("khand"); U.handImg = el("", "img"); U.hand.append(U.handImg); root.append(U.hand);
  U.uw = el("kuw"); U.dmg = el("kdmg"); root.append(U.uw, U.dmg);
  U.hud = el("khud"); U.hud.style.display = "none";
  U.itemName = el("kitemname"); U.hud.append(U.itemName);
  U.cross = el("kcross"); root.append(U.cross); U.cross.style.display = "none";
  U.breath = el("kbreath"); U.hud.append(U.breath);
  U.bars = el("kbars"); U.barL = el("kbarL"); U.barR = el("kbarR"); U.barL.append(el("kic9"), el("kic9")); U.barR.append(el("kic9"), el("kic9")); U.bars.append(U.barL, U.barR); U.hud.append(U.bars);
  U.hotbar = el("khotbar"); U.hud.append(U.hotbar); root.append(U.hud);
  U.toastBox = el("ktoast"); root.append(U.toastBox);
  U.dbg = el("kdbg"); root.append(U.dbg);
  U.goal = el("kgoal"); U.goal.style.display = "none"; U.goal.style.top = touch ? "52px" : "8px"; U.goal.onclick = () => { if (typeof openGoals === "function") openGoals(); }; root.append(U.goal);
  U.scr = el("kscreen"); U.scr.style.display = "none"; root.append(U.scr);
  U.cur = el("kcur"); root.append(U.cur); U.tip = el("ktip"); root.append(U.tip);
  /* dotyk */
  U.tch = el("ktouch");
  U.joy = el("kjoy"); U.joyK = el("", "i"); U.joy.append(U.joyK); U.tch.append(U.joy);
  const tb = (txt, right, bottom, key) => { const b = el("ktb"); b.textContent = txt; b.style.right = right + "px"; b.style.bottom = bottom + "px"; b.dataset.k = key; U.tch.append(b); return b; };
  tb("Skok", 20, 118, "jump"); tb("Kop /\nAtak", 100, 70, "mine"); tb("Użyj /\nPostaw", 20, 28, "use"); U.tSneak = tb("Skrad", 100, 150, "sneak");
  const sm = (txt, left, top, key) => { const b = el("ktsm"); b.textContent = txt; b.style.left = left; b.style.top = top; b.dataset.k = key; U.tch.append(b); return b; };
  sm("⏸", "8px", "8px", "pause"); sm("Ekwipunek", "58px", "8px", "inv"); U.tFly = sm("Lot", "150px", "8px", "fly");
  root.append(U.tch);
  UI = U; U.mkScreen = (inner, dark) => { U.scr.className = "kscreen" + (dark ? " dark" : ""); U.scr.style.display = "flex"; U.scr.innerHTML = ""; if (inner) U.scr.append(inner); };
  U.hideScreen = () => { U.scr.style.display = "none"; U.scr.innerHTML = ""; };
  U.toast = (msg, cls) => { const d = el(cls || ""); d.textContent = msg; U.toastBox.append(d); while (U.toastBox.children.length > 4) U.toastBox.firstChild.remove(); setTimeout(() => d.remove(), 2800); };
  U.showName = (txt) => { U.itemName.textContent = txt || ""; U.itemName.style.opacity = txt ? 1 : 0; clearTimeout(U._nt); U._nt = setTimeout(() => (U.itemName.style.opacity = 0), 1800); };
  return U;
}

/* ===== sloty ===== */
function slotHtml(s, extra, attrs) {
  let inner = "";
  if (s) {
    inner = '<img alt="" src="' + iconURL(s.id) + '">';
    if (s.n > 1) inner += '<span class="n">' + s.n + "</span>";
    const dur = durOf(s.id); if (dur && s.d > 0) { const f = 1 - s.d / dur; inner += '<span class="dur"><i style="width:' + Math.round(f * 100) + "%;background:hsl(" + Math.round(f * 120) + ',85%,45%)"></i></span>'; }
  }
  return '<div class="kslot ' + (extra || "") + '" ' + (attrs || "") + ">" + inner + "</div>";
}
function renderHotbar() {
  const U = UI; if (!U || !G) return; let html = "";
  for (let i = 0; i < 9; i++) html += slotHtml(G.inv.slots[i], i === G.sel ? "sel" : "", 'data-hot="' + i + '"');
  U.hotbar.innerHTML = html;
  const s = G.inv.slots[G.sel];
  U.handImg.style.display = s ? "block" : "none"; if (s) U.handImg.src = iconURL(s.id);
}
function renderBars() {
  const U = UI, p = G.p, I = hudIcons(); if (!U) return;
  const creative = G.mode === "creative";
  const row = (parent, icons, val, max, extra) => { let h = ""; for (let i = 0; i < 10; i++) { const v = val - i * 2; const k = v >= 2 ? 2 : v >= 1 ? 1 : 0; h += '<img src="' + icons[k] + '" alt="">'; } parent.innerHTML = h; };
  const hearts = U.barL.children[1], armor = U.barL.children[0], food = U.barR.children[1], air = U.breath.firstChild;
  U.barL.style.visibility = U.barR.style.visibility = creative ? "hidden" : "visible";
  row(hearts, I.h, Math.ceil(p.hp), 20);
  const ap = armorPts(); armor.style.visibility = ap > 0 ? "visible" : "hidden"; row(armor, I.a, ap, 20);
  row(food, I.f, Math.ceil(p.food), 20);
  if (!U.breath.firstChild) U.breath.append(el2("kic9")); const ab = U.breath.firstChild;
  const bubbles = p.headWater || p.air < 15 ? Math.ceil(p.air / 15 * 10) : 0; let h = ""; for (let i = 0; i < bubbles; i++) h += '<img src="' + I.b + '" alt="">'; ab.innerHTML = h;
  hearts.style.transform = p.hp <= 6 && !creative ? "translateY(" + (Math.sin(performance.now() / 60) > 0 ? 1 : 0) + "px)" : "";
}
const el2 = (cls) => { const e = document.createElement("div"); e.className = cls; return e; };

/* ===== ekrany ===== */
function screenCard(html) { const c = document.createElement("div"); c.className = "kcard"; c.innerHTML = html; return c; }
function fmtTime(sec) { const m = Math.floor(sec / 60), h2 = Math.floor(m / 60); return h2 ? h2 + " h " + (m % 60) + " min" : m + " min"; }
const MODE_NAME = { survival: "Przetrwanie", hardcore: "Hardcore", creative: "Kreatywny" };
const DIFF_NAME = ["Pokojowy", "Łatwy", "Normalny", "Trudny"];
async function showMainMenu(ctx) {
  const U = UI; G.state = "menu"; U.hud.style.display = "none"; U.cross.style.display = "none"; U.hand.style.display = "none"; if (U.goal) U.goal.style.display = "none";
  const wrap = document.createElement("div"); wrap.style.cssText = "width:min(460px,100%)";
  wrap.innerHTML = '<h1 class="ktitle">KOPALNIA</h1><div class="ksub">Włoska Robota</div><div class="kcard"><div id="kmslots">Ładowanie…</div><button class="kbtn" data-a="ach">🎯 Cele i osiągnięcia</button><button class="kbtn" data-a="help">Sterowanie i zasady</button><button class="kbtn red sm" data-a="quit" style="margin-top:10px">Zamknij grę</button></div>';
  U.mkScreen(wrap, true);
  const list = wrap.querySelector("#kmslots");
  let metas = []; try { metas = await Save.allMeta(); } catch (e) { metas = []; }
  if (G.state !== "menu") return;
  let html = "";
  for (let s = 0; s < 3; s++) {
    const m = metas[s];
    if (m) html += '<div class="kslotrow"><div class="t"><b>' + esc(m.name || "Świat " + (s + 1)) + '</b><small>' + MODE_NAME[m.mode] + (m.mode !== "hardcore" ? " · " + DIFF_NAME[m.diff] : "") + " · dzień " + ((m.day | 0) + 1) + " · " + fmtTime(m.playSec || 0) + '</small></div><button class="kbtn gold sm" data-a="play" data-s="' + s + '">Graj</button><button class="kbtn red sm" data-a="del" data-s="' + s + '">✕</button></div>';
    else html += '<div class="kslotrow"><div class="t"><b>Wolny slot ' + (s + 1) + '</b><small>Pusty świat</small></div><button class="kbtn sm" data-a="new" data-s="' + s + '">Nowy świat</button></div>';
  }
  list.innerHTML = html;
  wrap.onclick = (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return; const a = b.dataset.a, s = +b.dataset.s; SFX.click();
    if (a === "play") Game.startWorld(s); else if (a === "new") showNewWorld(s);
    else if (a === "del") { if (confirm("Usunąć ten świat bezpowrotnie?")) Game.deleteWorld(s).then(() => showMainMenu(ctx)); }
    else if (a === "help") showHelp(); else if (a === "ach") showAch(() => showMainMenu(ctx)); else if (a === "quit") Game.quit();
  };
}
function showHelp() {
  const c = screenCard('<h2>Sterowanie</h2><p><b>Komputer:</b> WASD ruch · Spacja skok · Shift skradanie · Ctrl lub podwójne W bieg · LPM kop/atak (przytrzymaj) · PPM użyj/postaw · E ekwipunek · J cele Hardcore · Q wyrzuć · 1–9 lub kółko wybór · F3 informacje · Esc pauza. W trybie kreatywnym dwa razy Spacja włącza lot.</p><p><b>Telefon:</b> lewy drążek = ruch, przeciągnięcie po ekranie = rozglądanie, przyciski po prawej.</p><h3>Tryby</h3><p><b>Przetrwanie:</b> zbieraj surowce, craftuj, jedz, uważaj na noc. <b>Hardcore:</b> jedno życie na Trudnym. Śmierć kasuje świat. <b>Kreatywny:</b> nieskończone bloki, lot, brak obrażeń.</p><h3>Punkty (konto klienta)</h3><p>Punkty dostaje się <b>tylko w trybie Hardcore</b>: za osiągnięcia (każde jednorazowo, patrz 🎯 Cele (klawisz J w grze)) oraz za 10., 20., 30., 50. i 100. dzień przetrwania jednego świata (jeden dzień w grze to ok. 20 minut). Limit to 8 pkt na dobę, a 100 pkt = rabat −5 zł. Śmierć kasuje świat, ale zdobyte punkty zostają. Tryb próbny obsługi nie zbiera punktów.</p><button class="kbtn gold" data-a="back">Wróć</button>');
  UI.mkScreen(c, true); c.onclick = (e) => { if (e.target.closest("[data-a=back]")) showMainMenu(); };
}
function showNewWorld(slot) {
  let mode = "survival", diff = 2;
  const c = screenCard('<h2>Nowy świat</h2><label class="kl">Nazwa</label><input type="text" id="kn" maxlength="24" placeholder="Mój świat"><label class="kl">Ziarno (puste = losowe)</label><input type="text" id="ks" maxlength="24" placeholder="np. pizza"><label class="kl">Tryb gry</label><div class="krow" id="km"></div><div id="kdw"><label class="kl">Poziom trudności</label><div class="krow" id="kd"></div></div><p id="kinfo"></p><button class="kbtn gold" data-a="go">Stwórz świat</button><button class="kbtn" data-a="back">Anuluj</button>');
  UI.mkScreen(c, true);
  const km = c.querySelector("#km"), kd = c.querySelector("#kd"), info = c.querySelector("#kinfo"), dw = c.querySelector("#kdw");
  const INFO = { survival: "Standardowa rozgrywka. Po śmierci odradzasz się, ale tracisz ekwipunek.", hardcore: "Jedno życie, poziom Trudny. Śmierć = koniec świata. Tylko tu naliczają się punkty (osiągnięcia i dni przetrwania).", creative: "Nieskończone bloki, latanie, brak obrażeń. Bez punktów." };
  const draw = () => {
    km.innerHTML = ["survival", "hardcore", "creative"].map((m) => '<button class="kbtn sm' + (mode === m ? " on" : "") + '" data-m="' + m + '">' + MODE_NAME[m] + "</button>").join("");
    kd.innerHTML = [0, 1, 2, 3].map((d) => '<button class="kbtn sm' + (diff === d ? " on" : "") + '" data-d="' + d + '">' + DIFF_NAME[d] + "</button>").join("");
    dw.style.display = mode === "hardcore" ? "none" : "block"; info.textContent = INFO[mode];
  };
  draw();
  c.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return; SFX.click();
    if (b.dataset.m) { mode = b.dataset.m; draw(); } else if (b.dataset.d) { diff = +b.dataset.d; draw(); }
    else if (b.dataset.a === "back") showMainMenu();
    else if (b.dataset.a === "go") { const nm = c.querySelector("#kn").value.trim(), sd = c.querySelector("#ks").value.trim(); Game.newWorld(slot, { name: nm || "Świat " + (slot + 1), seedText: sd, mode, diff: mode === "hardcore" ? 3 : diff }); }
  };
}
function showPause() {
  G.state = "pause"; unlockPointer(); if (UI.goal) UI.goal.style.display = "none";
  const c = screenCard('<h2>Pauza</h2><button class="kbtn gold" data-a="res">Wróć do gry</button><button class="kbtn" data-a="opt">Ustawienia</button><button class="kbtn" data-a="mode" id="kmodebtn"></button><button class="kbtn" data-a="ach">🎯 Cele i osiągnięcia</button><button class="kbtn" data-a="help">Sterowanie</button><button class="kbtn red" data-a="exit">Zapisz i wyjdź do menu</button>');
  UI.mkScreen(c);
  const mb = c.querySelector("#kmodebtn"); if (G.mode === "hardcore") { mb.textContent = "Tryb: Hardcore (nie można zmienić)"; mb.disabled = true; } else mb.textContent = "Przełącz na: " + (G.mode === "creative" ? "Przetrwanie" : "Kreatywny");
  c.onclick = (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return; SFX.click(); const a = b.dataset.a;
    if (a === "res") Game.resume(); else if (a === "opt") showOptions(); else if (a === "mode") { Game.toggleMode(); showPause(); } else if (a === "exit") Game.exitToMenu(); else if (a === "ach") showAch(showPause); else if (a === "help") { showHelp(); const back = UI.scr.querySelector("[data-a=back]"); if (back) back.onclick = (ev) => { ev.stopPropagation(); showPause(); }; }
  };
}
function showOptions() {
  const c = screenCard('<h2>Ustawienia</h2><div class="kopt"><span>Zasięg widzenia</span><b id="vrd"></b></div><input type="range" id="rd" min="2" max="8" step="1"><div class="kopt"><span>Czułość myszy</span><b id="vsn"></b></div><input type="range" id="sn" min="0.3" max="2.5" step="0.1"><div class="kopt"><span>Pole widzenia</span><b id="vfv"></b></div><input type="range" id="fv" min="55" max="100" step="1"><div class="kopt"><span>Jasność</span><b id="vbr"></b></div><input type="range" id="br" min="0" max="2" step="1"><div class="kopt"><span>Dźwięk</span><button class="kbtn sm" id="snd"></button></div><div class="kopt"><span>Odwróć oś Y</span><button class="kbtn sm" id="inv"></button></div><button class="kbtn gold" data-a="back" style="margin-top:12px">Gotowe</button>');
  UI.mkScreen(c);
  const q = (s) => c.querySelector(s);
  const sync = () => { q("#vrd").textContent = SET.rd + " chunków"; q("#vsn").textContent = SET.sens.toFixed(1); q("#vfv").textContent = SET.fov + "°"; q("#vbr").textContent = ["Mroczna", "Normalna", "Jasna"][SET.bright]; q("#snd").textContent = SET.sound ? "Włączony" : "Wyłączony"; q("#inv").textContent = SET.invert ? "Tak" : "Nie"; };
  q("#rd").value = SET.rd; q("#sn").value = SET.sens; q("#fv").value = SET.fov; q("#br").value = SET.bright; sync();
  c.oninput = (e) => { SET.rd = +q("#rd").value; SET.sens = +q("#sn").value; SET.fov = +q("#fv").value; SET.bright = +q("#br").value; sync(); saveSet(); };
  c.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; if (b.id === "snd") { SET.sound = SET.sound ? 0 : 1; SFX.set(SET.sound); sync(); saveSet(); } else if (b.id === "inv") { SET.invert = SET.invert ? 0 : 1; sync(); saveSet(); } else if (b.dataset.a === "back") showPause(); };
}
function showDeath() {
  G.state = "dead"; unlockPointer(); UI.cross.style.display = "none";
  const hc = G.mode === "hardcore";
  const c = screenCard('<h2 style="color:#e0564a">' + (hc ? "Koniec gry" : "Zginąłeś!") + "</h2><p>" + esc(G.deathText || "") + "</p><p>Przetrwane dni: <b>" + ((G.day | 0) + 1) + "</b> · Zabite stwory: <b>" + (G.kills | 0) + "</b></p>" + (hc ? "<p>To był tryb Hardcore. Świat został usunięty.</p>" : "<p>Twoje rzeczy leżą w miejscu śmierci (znikną po 5 minutach).</p>") + (hc ? "" : '<button class="kbtn gold" data-a="resp">Odrodź się</button>') + '<button class="kbtn red" data-a="exit">Wyjdź do menu</button>');
  UI.mkScreen(c); UI.scr.style.background = "rgba(120,0,0,.5)";
  c.onclick = (e) => { const b = e.target.closest("[data-a]"); if (!b) return; if (b.dataset.a === "resp") Game.respawn(); else Game.exitToMenu(); };
}
function showLoading(txt, pct) {
  const c = document.createElement("div"); c.style.cssText = "width:min(360px,90%);text-align:center";
  c.innerHTML = '<h1 class="ktitle" style="font-size:34px">KOPALNIA</h1><p style="margin:14px 0 8px;color:#c9b99a">' + esc(txt) + '</p><div style="height:12px;background:#000;border:2px solid #5a4a3a"><i id="klb" style="display:block;height:100%;width:' + Math.round((pct || 0) * 100) + '%;background:#d4af37"></i></div>';
  UI.mkScreen(c, true);
}
function setLoading(pct) { const b = UI.scr.querySelector("#klb"); if (b) b.style.width = Math.round(pct * 100) + "%"; }

/* ===== ekwipunek / crafting / piec / skrzynia ===== */
const INV = { open: false, kind: "inv", pos: null, craft: null, tile: null, hover: null, cat: "b" };
function isFuel(s) { return s && fuelOf(s.id) > 0; }
function slotRef(g, i) {
  const inv = G.inv, ref = { g, i, accepts: () => true, get: null, set: null };
  if (g === "inv") { ref.get = () => inv.slots[i]; ref.set = (v) => { inv.slots[i] = v; }; }
  else if (g === "armor") { ref.get = () => inv.armor[i]; ref.set = (v) => { inv.armor[i] = v; }; ref.accepts = (s) => !!(ITM[s.id] && ITM[s.id].armor && ITM[s.id].armor.slot === i); }
  else if (g === "craft") { const cr = INV.craft; ref.get = () => cr.cells[i]; ref.set = (v) => { cr.cells[i] = v; }; }
  else if (g === "out") { ref.out = true; ref.get = () => INV.craft.out; ref.set = () => {}; ref.accepts = () => false; }
  else if (g === "f0") { const t = INV.tile; ref.get = () => t.slots[0]; ref.set = (v) => { t.slots[0] = v; }; }
  else if (g === "f1") { const t = INV.tile; ref.get = () => t.slots[1]; ref.set = (v) => { t.slots[1] = v; }; ref.accepts = (s) => fuelOf(s.id) > 0; }
  else if (g === "f2") { const t = INV.tile; ref.get = () => t.slots[2]; ref.set = (v) => { t.slots[2] = v; }; ref.accepts = () => false; }
  else if (g === "chest") { const t = INV.tile; ref.get = () => t.slots[i]; ref.set = (v) => { t.slots[i] = v; }; }
  return ref;
}
function craftUpdate() { const cr = INV.craft; if (!cr) return; const ids = cr.cells.map((s) => (s ? s.id : 0)); const r = matchRecipe(ids, cr.w, cr.h); cr.recipe = r; cr.out = r ? { id: r.out, n: r.n, d: 0 } : null; }
function craftConsume() { const cr = INV.craft; if (cr.out) Ach.flag("c" + cr.out.id); for (let i = 0; i < cr.cells.length; i++) { const s = cr.cells[i]; if (s) { s.n--; if (s.n <= 0) cr.cells[i] = null; } } craftUpdate(); }
function mergeInto(arr, from, to, s) { /* wstaw stos s do arr[from..to]; zwraca resztę */
  const mx = maxStack(s.id);
  if (mx > 1) for (let i = from; i <= to && s.n > 0; i++) { const t = arr[i]; if (t && t.id === s.id && t.n < mx) { const k = Math.min(mx - t.n, s.n); t.n += k; s.n -= k; } }
  for (let i = from; i <= to && s.n > 0; i++) if (!arr[i]) { const k = Math.min(mx, s.n); arr[i] = { id: s.id, n: k, d: s.d || 0 }; s.n -= k; }
  return s.n;
}
function clickSlot(ref, btn, shift) {
  const cur = G.cursor, s = ref.get();
  if (ref.out) {
    const o = ref.get(); if (!o) return;
    if (shift) { let guard = 0; while (INV.craft.out && guard++ < 64) { const o2 = INV.craft.out; if (!invRoom(G.inv, o2.id, o2.n)) break; invAdd(G.inv, o2.id, o2.n, 0); craftConsume(); } }
    else if (!cur) { G.cursor = cloneStack(o); craftConsume(); }
    else if (cur.id === o.id && cur.n + o.n <= maxStack(o.id)) { cur.n += o.n; craftConsume(); }
    SFX.pop(); return;
  }
  if (shift) { quickMove(ref); return; }
  if (btn === 0) {
    if (!cur) { if (s) { G.cursor = s; ref.set(null); } }
    else if (!s) { if (ref.accepts(cur)) { ref.set(cur); G.cursor = null; } }
    else if (s.id === cur.id && maxStack(s.id) > 1) { const k = Math.min(maxStack(s.id) - s.n, cur.n); s.n += k; cur.n -= k; if (cur.n <= 0) G.cursor = null; }
    else if (ref.accepts(cur)) { ref.set(cur); G.cursor = s; }
  } else {
    if (!cur) { if (s) { const half = Math.ceil(s.n / 2); G.cursor = { id: s.id, n: half, d: s.d || 0 }; s.n -= half; if (s.n <= 0) ref.set(null); } }
    else if (!s) { if (ref.accepts(cur)) { ref.set({ id: cur.id, n: 1, d: cur.d || 0 }); cur.n--; if (cur.n <= 0) G.cursor = null; } }
    else if (s.id === cur.id && s.n < maxStack(s.id)) { s.n++; cur.n--; if (cur.n <= 0) G.cursor = null; }
    else if (ref.accepts(cur)) { ref.set(cur); G.cursor = s; }
  }
}
function quickMove(ref) {
  const s = ref.get(); if (!s) return; const inv = G.inv.slots;
  const done = () => { if (ref.get() && ref.get().n <= 0) ref.set(null); };
  if (ref.g === "inv") {
    if (INV.kind === "chest") { const t = INV.tile; mergeInto(t.slots, 0, 26, s); }
    else if (INV.kind === "furnace") { const t = INV.tile; if (SMELT[s.id]) { if (!t.slots[0] || t.slots[0].id === s.id) mergeInto(t.slots, 0, 0, s); } else if (fuelOf(s.id) > 0) mergeInto(t.slots, 1, 1, s); else { if (ref.i < 9) mergeInto(inv, 9, 35, s); else mergeInto(inv, 0, 8, s); } }
    else if (ITM[s.id] && ITM[s.id].armor && !G.inv.armor[ITM[s.id].armor.slot]) { G.inv.armor[ITM[s.id].armor.slot] = cloneStack(s); s.n = 0; }
    else { if (ref.i < 9) mergeInto(inv, 9, 35, s); else mergeInto(inv, 0, 8, s); }
  } else { const left = mergeInto(inv, 0, 8, s); if (left > 0) mergeInto(inv, 9, 35, s); }
  done();
}
function openInventory(kind, pos) {
  if (G.state !== "play" && G.state !== "inv") return;
  if (kind === "chest" || kind === "furnace") { INV.tile = tileAt(pos[0], pos[1], pos[2], true); }
  INV.kind = kind; INV.pos = pos; INV.open = true; G.state = "inv"; unlockPointer();
  if (kind === "inv") INV.craft = { w: 2, h: 2, cells: [null, null, null, null], out: null }; else if (kind === "bench") INV.craft = { w: 3, h: 3, cells: new Array(9).fill(null), out: null }; else INV.craft = null;
  if (G.mode === "creative") INV.kind = kind = (kind === "inv" ? "creative" : kind);
  G.cursor = null; renderInventory();
}
function closeInventory() {
  if (!INV.open) return; INV.open = false;
  if (INV.craft) { for (const s of INV.craft.cells) if (s) { const left = invAdd(G.inv, s.id, s.n, s.d); if (left > 0) spawnItem(G.p.x, G.p.y + 1, G.p.z, s.id, left, s.d); } INV.craft = null; }
  if (G.cursor) { const s = G.cursor, left = invAdd(G.inv, s.id, s.n, s.d); if (left > 0) spawnItem(G.p.x - Math.sin(G.p.yaw) * 0.5, G.p.y + 1.3, G.p.z - Math.cos(G.p.yaw) * 0.5, s.id, left, s.d, -Math.sin(G.p.yaw) * 3, 2, -Math.cos(G.p.yaw) * 3, 1.5); G.cursor = null; }
  UI.hideScreen(); UI.cur.style.display = "none"; UI.tip.style.display = "none"; INV.tile = null;
  if (G.state === "inv") { G.state = "play"; lockPointer(); }
  G.invDirty = true;
}
function renderInventory() {
  const U = UI, kind = INV.kind, creative = G.mode === "creative";
  const titles = { inv: "Ekwipunek", bench: "Stół warsztatowy", furnace: "Piec", chest: "Skrzynia", creative: "Tryb kreatywny" };
  let h = '<div class="kinv"><h4>' + titles[kind] + "</h4>";
  const grid = (g, from, to, cols, cls) => { let t = '<div class="kgrid ' + (cls || "") + '">'; for (let i = from; i <= to; i++) t += slotHtml(slotRef(g, i).get(), "", 'data-g="' + g + '" data-i="' + i + '"'); return t + "</div>"; };
  if (kind === "inv") {
    h += '<div class="kcrow"><div class="kgrid c1">';
    for (let i = 0; i < 4; i++) h += slotHtml(G.inv.armor[i], "arm", 'data-g="armor" data-i="' + i + '" title="' + ["Hełm", "Napierśnik", "Nogawice", "Buty"][i] + '"');
    h += '</div><div style="flex:1;min-width:6px"></div><div class="kgrid c2">';
    for (let i = 0; i < 4; i++) h += slotHtml(INV.craft.cells[i], "", 'data-g="craft" data-i="' + i + '"');
    h += '</div><div class="karrow">➜</div>' + slotHtml(INV.craft.out, "out", 'data-g="out" data-i="0"') + "</div>";
  } else if (kind === "bench") {
    h += '<div class="kcrow" style="justify-content:center"><div class="kgrid c3">';
    for (let i = 0; i < 9; i++) h += slotHtml(INV.craft.cells[i], "", 'data-g="craft" data-i="' + i + '"');
    h += '</div><div class="karrow">➜</div>' + slotHtml(INV.craft.out, "out", 'data-g="out" data-i="0"') + "</div>";
  } else if (kind === "furnace") {
    const t = INV.tile;
    h += '<div class="kcrow" style="justify-content:center"><div style="display:flex;flex-direction:column;align-items:center;gap:6px">' + slotHtml(t.slots[0], "", 'data-g="f0" data-i="0"') + '<div class="kflame"><i id="kfl" style="height:' + (t.burnMax ? Math.max(0, t.burn / t.burnMax * 100) : 0) + '%"></i></div>' + slotHtml(t.slots[1], "", 'data-g="f1" data-i="0"') + '</div><div style="display:flex;flex-direction:column;align-items:center;gap:6px"><div class="kprog"><i id="kpg" style="width:' + (t.cook / 10 * 100) + '%"></i></div></div>' + slotHtml(t.slots[2], "out", 'data-g="f2" data-i="0"') + "</div>";
  } else if (kind === "chest") {
    h += grid("chest", 0, 26, 9) + '<div class="ksep"></div>';
  } else if (kind === "creative") {
    h += '<div class="kcats">' + CREATIVE_CATS.map((c) => '<button class="kbtn sm' + (INV.cat === c[0] ? " on" : "") + '" data-cat="' + c[0] + '">' + c[1] + "</button>").join("") + '</div><div class="kpal"><div class="kgrid">' + CREATIVE[INV.cat].map((id) => slotHtml({ id, n: 1, d: 0 }, "", 'data-g="cre" data-i="' + id + '"')).join("") + '</div></div>';
  }
  if (kind !== "creative") h += '<h4 style="margin-top:6px">Ekwipunek</h4>' + grid("inv", 9, 35, 9) + '<div class="ksep"></div>';
  h += grid("inv", 0, 8, 9);
  if (kind === "creative") h += '<div class="krow" style="margin-top:6px"><div class="kslot" data-g="trash" style="font-size:20px" title="Kosz">🗑</div><div style="flex:1"></div>' + '</div>';
  h += '<button class="kbtn gold" data-a="close" style="margin-top:8px">Zamknij (E)</button></div>';
  U.scr.className = "kscreen"; U.scr.style.display = "flex"; U.scr.style.background = "rgba(0,0,0,.55)"; U.scr.innerHTML = h;
  renderCursor();
}
function renderCursor() {
  const c = G.cursor, U = UI;
  if (!c) { U.cur.style.display = "none"; return; }
  U.cur.innerHTML = '<img alt="" src="' + iconURL(c.id) + '">' + (c.n > 1 ? '<span class="n">' + c.n + "</span>" : ""); U.cur.style.display = "block";
}
function bindInvEvents(root) {
  let lastMove = null, press = null;
  const move = (e) => { if (!G.cursor && !INV.open) return; const x = e.clientX, y = e.clientY; lastMove = [x, y]; const s = parseFloat(getComputedStyle(root).getPropertyValue("--s")) || 44; UI.cur.style.transform = "translate(" + (x - s / 2) + "px," + (y - s / 2) + "px)"; };
  root.addEventListener("pointermove", move);
  const act = (target, btn, shift) => {
    const cat = target.closest("[data-cat]"); if (cat) { INV.cat = cat.dataset.cat; renderInventory(); return; }
    if (target.closest("[data-a=close]")) { closeInventory(); return; }
    const sl = target.closest(".kslot"); if (!sl) { if (!target.closest(".kinv") && G.cursor) { dropCursor(btn === 2); renderInventory(); } return; }
    const g = sl.dataset.g; if (!g) return;
    if (g === "trash") { G.cursor = null; renderInventory(); return; }
    if (g === "cre") {
      const id = +sl.dataset.i, mx = maxStack(id);
      if (shift) invAdd(G.inv, id, mx, 0); else if (G.cursor && G.cursor.id === id) G.cursor = null; else G.cursor = { id, n: btn === 2 ? 1 : mx, d: 0 };
      SFX.pop(); renderInventory(); return;
    }
    clickSlot(slotRef(g, +sl.dataset.i), btn, shift);
    if (INV.craft) craftUpdate(); G.invDirty = true; SFX.click(); renderInventory();
  };
  root.addEventListener("contextmenu", (e) => { if (INV.open) e.preventDefault(); });
  root.addEventListener("pointerdown", (e) => {
    if (!INV.open || !e.target.closest(".kscreen")) return; move(e);
    if (e.pointerType === "touch") { const tg = e.target; press = { tg, t: setTimeout(() => { if (press) { press.fired = true; act(tg, 2, false); } }, 380), x: e.clientX, y: e.clientY }; return; }
    act(e.target, e.button === 2 ? 2 : 0, e.shiftKey);
  });
  root.addEventListener("pointerup", (e) => { if (press) { clearTimeout(press.t); if (!press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 14) act(press.tg, 0, false); press = null; } });
  root.addEventListener("pointercancel", () => { if (press) { clearTimeout(press.t); press = null; } });
  root.addEventListener("mouseover", (e) => {
    const sl = e.target.closest && e.target.closest(".kslot"); INV.hover = sl && sl.dataset.g ? [sl.dataset.g, +sl.dataset.i] : null;
    const tip = UI.tip; if (sl && INV.open) { let s = null; if (sl.dataset.g === "cre") s = { id: +sl.dataset.i, n: 1 }; else if (sl.dataset.g && sl.dataset.g !== "trash") s = slotRef(sl.dataset.g, +sl.dataset.i).get(); if (s) { const dur = durOf(s.id); tip.textContent = itemName(s.id) + (dur && s.d ? " (" + (dur - s.d) + "/" + dur + ")" : ""); tip.style.display = "block"; const r = sl.getBoundingClientRect(); tip.style.left = Math.min(r.left, innerWidth - 200) + "px"; tip.style.top = (r.top - 28) + "px"; } else tip.style.display = "none"; } else tip.style.display = "none";
  });
  root.addEventListener("dblclick", (e) => {
    if (!INV.open || !G.cursor) return; const c = G.cursor, mx = maxStack(c.id);
    for (let i = 0; i < 36 && c.n < mx; i++) { const s = G.inv.slots[i]; if (s && s.id === c.id) { const k = Math.min(mx - c.n, s.n); c.n += k; s.n -= k; if (s.n <= 0) G.inv.slots[i] = null; } }
    renderInventory();
  });
}
function dropCursor(one) {
  const c = G.cursor; if (!c) return; const p = G.p, n = one ? 1 : c.n;
  spawnItem(p.x - Math.sin(p.yaw) * 0.5, p.y + 1.3, p.z - Math.cos(p.yaw) * 0.5, c.id, n, c.d, -Math.sin(p.yaw) * 4, 2, -Math.cos(p.yaw) * 4, 1.5);
  c.n -= n; if (c.n <= 0) G.cursor = null;
}
function refreshFurnaceUI() {
  if (!INV.open || INV.kind !== "furnace" || !INV.tile) return; const t = INV.tile;
  const fl = UI.scr.querySelector("#kfl"), pg = UI.scr.querySelector("#kpg"); if (fl) fl.style.height = (t.burnMax ? Math.max(0, t.burn / t.burnMax * 100) : 0) + "%"; if (pg) pg.style.width = (t.cook / 10 * 100) + "%";
  const sig = JSON.stringify(t.slots); if (sig !== INV._sig) { INV._sig = sig; renderInventory(); }
}
/* ===================== ZAPIS (IndexedDB) ===================== */
const Save = (function () {
  let db = null, failed = false; const mem = new Map();
  function open() { return new Promise((res, rej) => { try { const rq = indexedDB.open("wr_kopalnia", 1); rq.onupgradeneeded = () => rq.result.createObjectStore("kv"); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); rq.onblocked = () => rej(new Error("blocked")); } catch (e) { rej(e); } }); }
  async function ensure() { if (db) return db; if (failed) return null; try { db = await open(); return db; } catch (e) { failed = true; return null; } }
  const wrap = (r) => new Promise((res) => { r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });
  return {
    async get(k) { const d = await ensure(); if (!d) return mem.get(k); return wrap(d.transaction("kv").objectStore("kv").get(k)); },
    async putMany(entries) {
      const d = await ensure(); if (!d) { for (const [k, v] of entries) mem.set(k, v); return true; }
      return new Promise((res) => { try { const tx = d.transaction("kv", "readwrite"), st = tx.objectStore("kv"); for (const [k, v] of entries) st.put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); tx.onabort = () => res(false); } catch (e) { res(false); } });
    },
    async delPrefix(prefix) {
      const d = await ensure(); if (!d) { for (const k of Array.from(mem.keys())) if (k.startsWith(prefix)) mem.delete(k); return; }
      return new Promise((res) => { try { const tx = d.transaction("kv", "readwrite"), st = tx.objectStore("kv"); st.delete(IDBKeyRange.bound(prefix, prefix + "￿")); tx.oncomplete = () => res(); tx.onerror = () => res(); tx.onabort = () => res(); } catch (e) { res(); } });
    },
    async chunks(slot) {
      const prefix = "c" + slot + "|", out = new Map(), d = await ensure();
      if (!d) { for (const [k, v] of mem) if (k.startsWith(prefix)) out.set(k.slice(prefix.length), v); return out; }
      return new Promise((res) => { try { const rq = d.transaction("kv").objectStore("kv").openCursor(IDBKeyRange.bound(prefix, prefix + "￿")); rq.onsuccess = () => { const c = rq.result; if (c) { out.set(c.key.slice(prefix.length), c.value); c.continue(); } else res(out); }; rq.onerror = () => res(out); } catch (e) { res(out); } });
    },
    async allMeta() { const r = []; for (let s = 0; s < 3; s++) r.push(await this.get("m" + s)); return r; },
    async deleteSlot(slot) { await this.delPrefix("c" + slot + "|"); await this.delPrefix("w" + slot); await this.delPrefix("m" + slot); }
  };
})();

/* ===================== GRA ===================== */
let CTX = null, RUN = null;
function newGame(root, ctx) {
  CTX = ctx;
  G = { root, state: "menu", mode: "survival", diff: 2, slot: 0, p: newPlayer(), inv: newInv(), cursor: null, sel: 0, tod: 1000, day: 0, ents: [], parts: [], input: { f: 0, b: 0, l: 0, r: 0, jump: 0, sneak: 0, sprint: 0, sprintTap: 0, mouseL: 0, mouseR: 0 }, running: true, dayF: 1, sunF: 1, playSec: 0, kills: 0, spawnT: 5, awarded: [0, 0, 0], renderCam: { yaw: 0, pitch: 0 }, invDirty: true, name: "", seed: 0, created: 0, worldSpawn: [0.5, 40, 0.5], saveT: 0, hudT: 0, swing: 0, dig: null, target: null, useCd: 0, atkCd: 0, bowT: 0, debug: 0, fps: 60, frames: 0, fpsT: 0, rewardRetry: 0, loaded: false };
  return G;
}
function seedFromText(t) { if (!t) return (Math.random() * 2147483647) | 0; if (/^-?\d+$/.test(t)) return parseInt(t, 10) | 0; return nameSalt(t); }
function findSpawn(W) {
  for (let r = 0; r < 600; r += 16) {
    const n = Math.max(1, r / 4 | 0);
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * 6.283 + r, x = Math.floor(Math.cos(a) * r), z = Math.floor(Math.sin(a) * r), c = W.biomeAt(x, z);
      if (c.height > SEA + 1 && c.height < 38 && c.bio !== BIO.DESERT) return [x + 0.5, z + 0.5];
    }
  }
  return [0.5, 0.5];
}
async function enterWorld(slot, data, opts) {
  const U = UI, W0 = WORLD;
  showLoading("Wczytywanie świata…", 0.02); await nextFrame();
  G.slot = slot; G.loaded = false;
  const seed = data ? data.seed : seedFromText(opts.seedText);
  const W = new World(seed); WORLD = W;
  W.hooks.breakDrop = (x, y, z, id, meta) => spawnDrops(x, y, z, dropsFor(id, meta, null));
  W.hooks.fall = (x, y, z, id) => spawnFalling(x, y, z, id);
  W.hooks.freeMesh = (c) => RUN.ren.freeChunk(c);
  W.hooks.sfx = (k) => SFX.splash();
  W.hooks.tileLost = (x, y, z, t) => { if (t && t.slots) for (const s of t.slots) if (s) spawnItem(x + 0.5, y + 0.5, z + 0.5, s.id, s.n, s.d); };
  G.ents = []; G.parts = []; G.inv = newInv(); G.cursor = null; G.p = newPlayer(); G.kills = 0; G.deathText = ""; G.awarded = [0, 0, 0, 0, 0]; G.dig = null;
  if (data) {
    const saved = await Save.chunks(slot);
    for (const [k, v] of saved) { const [cx, cz] = k.split(",").map(Number); W.saved.set(ckey(cx, cz), v); }
    G.mode = data.mode; G.diff = data.diff; G.tod = data.tod; G.day = data.day; G.playSec = data.playSec || 0; G.name = data.name; G.created = data.created; G.seed = seed; G.awarded = data.awarded || [0, 0, 0, 0, 0]; G.kills = data.kills || 0; G.sel = data.sel | 0;
    Object.assign(G.p, data.p); G.p.dead = false; G.p.vx = G.p.vy = G.p.vz = 0; G.inv.slots = data.inv; G.inv.armor = data.armor; G.worldSpawn = data.worldSpawn;
    for (const [k, t] of data.tiles || []) W.tiles.set(k, t);
  } else {
    G.mode = opts.mode; G.diff = opts.diff; G.tod = 1000; G.day = 0; G.playSec = 0; G.name = opts.name; G.created = Date.now(); G.seed = seed; G.sel = 0;
    const sp = findSpawn(W); const cx = Math.floor(sp[0]) >> 4, cz = Math.floor(sp[1]) >> 4;
    W.loadChunk(cx, cz); const y = W.topSolid(Math.floor(sp[0]), Math.floor(sp[1]));
    G.p.x = sp[0]; G.p.z = sp[1]; G.p.y = y + 0.05; G.worldSpawn = [sp[0], y + 0.05, sp[1]]; G.p.spawn = null;
    if (G.mode === "creative") G.p.fly = false;
    if (G.mode !== "creative") { invAdd(G.inv, ID.bread, 0); }
  }
  /* ładowanie okolicy */
  const px = Math.floor(G.p.x) >> 4, pz = Math.floor(G.p.z) >> 4, R0 = 3, total = (R0 * 2 + 1) ** 2; let done = 0;
  const order = []; for (let dz = -R0; dz <= R0; dz++) for (let dx = -R0; dx <= R0; dx++) order.push([dx, dz, dx * dx + dz * dz]); order.sort((a, b) => a[2] - b[2]);
  let t0 = performance.now();
  for (const [dx, dz] of order) { W.loadChunk(px + dx, pz + dz); done++; if (performance.now() - t0 > 40) { setLoading(0.05 + 0.85 * done / total); await nextFrame(); t0 = performance.now(); } }
  for (const [dx, dz] of order) { const c = W.chunk(px + dx, pz + dz); if (c && W.canMesh(c)) RUN.ren.buildMesh(W, c); if (performance.now() - t0 > 40) { await nextFrame(); t0 = performance.now(); } }
  if (!data) { const y = W.topSolid(Math.floor(G.p.x), Math.floor(G.p.z)); G.p.y = y + 0.05; G.worldSpawn = [G.p.x, G.p.y, G.p.z]; }
  W.spawnPending.length = 0;
  for (const [dx, dz] of order) if (!data || !W.saved.has(ckey(px + dx, pz + dz))) populateChunk(px + dx, pz + dz);
  setLoading(1); await nextFrame();
  G.loaded = true; G.state = "ready";
  const c = screenCard('<h2>' + esc(G.name) + '</h2><p>' + MODE_NAME[G.mode] + (G.mode !== "hardcore" ? " · " + DIFF_NAME[G.diff] : "") + '</p><button class="kbtn gold" data-a="go">Zacznij grać</button>');
  U.mkScreen(c); c.onclick = () => { Game.begin(); };
  await saveWorld(true);
}
function nextFrame() { return new Promise((r) => requestAnimationFrame(() => r())); }
Game.begin = function () {
  const U = UI; U.hideScreen(); G.state = "play"; U.hud.style.display = "flex"; U.hand.style.display = "block"; U.cross.style.display = "block";
  SFX.init(); SFX.set(SET.sound); lockPointer(); G.invDirty = true; G.lastT = performance.now();
  if (G.mode === "creative") U.toast("Tryb kreatywny — dwa razy Spacja: lot"); else if (G.mode === "hardcore") U.toast("Hardcore: jedno życie. Powodzenia!", "gold");
};
Game.startWorld = async function (slot) {
  const data = await Save.get("w" + slot); if (!data) { showNewWorld(slot); return; }
  await enterWorld(slot, data, null);
};
Game.newWorld = async function (slot, opts) { await Save.deleteSlot(slot); await enterWorld(slot, null, opts); };
Game.deleteWorld = async function (slot) { await Save.deleteSlot(slot); };
Game.resume = function () { UI.hideScreen(); G.state = "play"; lockPointer(); G.lastT = performance.now(); };
Game.toggleMode = function () { if (G.mode === "hardcore") return; G.mode = G.mode === "creative" ? "survival" : "creative"; G.p.fly = false; G.invDirty = true; saveWorld(); UI.toast("Tryb: " + MODE_NAME[G.mode]); };
Game.respawn = function () { respawnPlayer(); UI.hideScreen(); UI.scr.style.background = ""; G.state = "play"; UI.cross.style.display = "block"; lockPointer(); G.invDirty = true; };
Game.exitToMenu = async function () {
  if (G.mode !== "hardcore" || !G.p.dead) await saveWorld(true);
  closeWorld(); await showMainMenu(CTX);
};
Game.quit = function () { shutdown(); };
function closeWorld() {
  if (WORLD) { WORLD.chunks.forEach((c) => RUN.ren.freeChunk(c)); }
  WORLD = null; G.ents = []; G.parts = []; G.state = "menu"; G.loaded = false; G.p = newPlayer(); G.inv = newInv(); G.cursor = null; INV.open = false;
  UI.hud.style.display = "none"; UI.hand.style.display = "none"; UI.cross.style.display = "none"; UI.dmg.style.opacity = 0; UI.uw.style.opacity = 0; unlockPointer();
}
function onPlayerDeath() {
  G.state = "dead"; unlockPointer(); G.input.mouseL = G.input.mouseR = 0;
  UI.hud.style.display = "none"; UI.hand.style.display = "none";
  if (INV.open) { INV.open = false; INV.craft = null; UI.hideScreen(); UI.cur.style.display = "none"; }
  if (G.mode === "hardcore") { G.hardDead = true; Save.deleteSlot(G.slot); }
  setTimeout(() => { if (G.p.dead) showDeath(); }, 700);
}
/* serializacja */
async function saveWorld(force) {
  if (!WORLD || !G.loaded || (G.p.dead && G.mode === "hardcore")) return;
  const W = WORLD, entries = [], p = G.p;
  const meta = { name: G.name, mode: G.mode, diff: G.diff, day: G.day, playSec: Math.round(G.playSec), created: G.created };
  const keep = (s) => (s ? { id: s.id, n: s.n, d: s.d || 0 } : null);
  const data = Object.assign({ seed: G.seed, tod: G.tod, awarded: G.awarded, kills: G.kills, sel: G.sel, worldSpawn: G.worldSpawn, inv: G.inv.slots.map(keep), armor: G.inv.armor.map(keep), tiles: Array.from(W.tiles.entries()).map(([k, t]) => [k, t]), p: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp, food: p.food, sat: p.sat, exh: p.exh, air: p.air, fly: p.fly, spawn: p.spawn } }, meta);
  entries.push(["w" + G.slot, data], ["m" + G.slot, meta]);
  W.chunks.forEach((c) => { if (c.sdirty) { const enc = encodeChunk(c); W.saved.set(ckey(c.cx, c.cz), enc); entries.push(["c" + G.slot + "|" + c.cx + "," + c.cz, enc]); c.sdirty = false; } });
  if (G.pendingChunkSaves) { for (const e of G.pendingChunkSaves) entries.push(e); G.pendingChunkSaves = []; }
  await Save.putMany(entries);
}
function shutdown() {
  if (!RUN) return; RUN.stop = true; G.running = false;
  try { if (WORLD && G.loaded && !(G.p.dead && G.mode === "hardcore")) saveWorld(true); } catch (e) {}
  unlockPointer();
  for (const [t, fn, o] of RUN.listeners) { try { t.removeEventListener(fn[0], fn[1], o); } catch (e) {} }
  try { RUN.ren.dispose(); } catch (e) {}
  SFX.close(); try { RUN.root.remove(); } catch (e) {}
  const ctx = CTX; RUN = null; WORLD = null; G = null; UI = null;
  window.__kopRunning = false;
  if (ctx && ctx.close) ctx.close();
}

/* ===================== PĘTLA ===================== */
function skyState() {
  const a = G.tod / DAY_LEN * Math.PI * 2, s = Math.sin(a);
  const dayF = clamp((s + 0.18) / 0.4, 0, 1), df = dayF * dayF * (3 - 2 * dayF);
  G.dayF = df; G.sunF = 0.3 + 0.7 * df;
  const night = [0.03, 0.045, 0.1], day = [0.47, 0.69, 1.0]; let c = [lerp(night[0], day[0], df), lerp(night[1], day[1], df), lerp(night[2], day[2], df)];
  const g = clamp(1 - Math.abs(s) / 0.3, 0, 1) * 0.45; c = [lerp(c[0], 1.0, g), lerp(c[1], 0.52, g), lerp(c[2], 0.28, g)];
  return c;
}
function streamChunks(budget) {
  const W = WORLD, p = G.p, ren = RUN.ren, rd = SET.rd, pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
  const t0 = performance.now();
  /* 1. generacja (najbliższe najpierw) */
  if (G.chunkCx !== pcx || G.chunkCz !== pcz || G.chunkRd !== rd) {
    G.chunkCx = pcx; G.chunkCz = pcz; G.chunkRd = rd; const L = []; const R = rd + 1;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue; L.push([dx, dz, dx * dx + dz * dz]); }
    L.sort((a, b) => a[2] - b[2]); G.chunkList = L;
  }
  for (const [dx, dz] of G.chunkList) { if (W.chunk(pcx + dx, pcz + dz)) continue; W.loadChunk(pcx + dx, pcz + dz); if (performance.now() - t0 > budget) break; }
  /* nowe chunki → stwory */
  while (W.spawnPending.length) { const [cx, cz] = W.spawnPending.pop(); if (G.mode !== "creative" || true) populateChunk(cx, cz); }
  /* 2. meshe */
  let built = 0; const dirty = [];
  W.chunks.forEach((c) => { if (c.dirty && c.lit) { const dx = c.cx - pcx, dz = c.cz - pcz; if (dx * dx + dz * dz <= (rd + 0.5) * (rd + 0.5) && W.canMesh(c)) dirty.push([c, dx * dx + dz * dz]); } });
  dirty.sort((a, b) => a[1] - b[1]);
  for (const [c] of dirty) { ren.buildMesh(W, c); built++; if (built >= 4 || performance.now() - t0 > budget + 6) break; }
  /* 3. wyładowanie */
  G.unloadT = (G.unloadT || 0) - 1; if (G.unloadT <= 0) {
    G.unloadT = 30; const far = [];
    W.chunks.forEach((c) => { const dx = c.cx - pcx, dz = c.cz - pcz; if (dx * dx + dz * dz > (rd + 3) * (rd + 3)) far.push(c); });
    for (const c of far) W.unloadChunk(c, (ch) => { const enc = encodeChunk(ch); W.saved.set(ckey(ch.cx, ch.cz), enc); (G.pendingChunkSaves = G.pendingChunkSaves || []).push(["c" + G.slot + "|" + ch.cx + "," + ch.cz, enc]); });
    for (const c of far) { /* tile entities w wyładowanych chunkach zostają w pamięci */ }
  }
}
function tickFurnaces(dt) {
  const W = WORLD; if (!W.tiles.size) return;
  for (const [k, t] of W.tiles) {
    if (t.t !== "furnace") continue; const [x, y, z] = unpk(k); if (!W.has(x, z)) continue;
    const id = W.get(x, y, z); if (id !== BID.furnace && id !== BID.furnace_on) continue;
    if (furnaceTick(t, x, y, z, dt)) { const m = W.getM(x, y, z); W.setBlock(x, y, z, t.lit ? BID.furnace_on : BID.furnace, m, true); }
  }
}
function tick(dt) {
  const W = WORLD, p = G.p;
  G.playSec += dt; G.tod += dt * 20; if (G.tod >= DAY_LEN) { G.tod -= DAY_LEN; G.day++; }
  streamChunks(9);
  W.processUpdates(300); W.tickFluids(dt);
  G.rtT = (G.rtT || 0) + dt; if (G.rtT > 0.25) { G.rtT = 0; W.randomTicks(Math.floor(p.x), Math.floor(p.z), Math.min(3, SET.rd)); }
  tickFurnaces(dt);
  const pxi = Math.floor(p.x), pzi = Math.floor(p.z);
  if (!W.has(pxi, pzi)) W.loadChunk(pxi >> 4, pzi >> 4);
  if (p.y < -2 && !p.dead) { p.y = W.topSolid(pxi, pzi) + 0.05; p.vy = 0; p.fallDist = 0; UI.toast("Wyciągnięto Cię spod świata"); }
  updatePlayer(dt); Ach.tick(dt);
  if (G.state === "play") updateInteract(dt);
  updateEnts(dt); spawnTick(dt);
  G.saveT += dt; if (G.saveT > 25) { G.saveT = 0; saveWorld(); }
  G.rewardRetry -= dt; if (G.rewardRetry <= 0) { G.rewardRetry = 5; checkAwards(); }
  G.hudT -= dt; if (G.hudT <= 0 || G.invDirty) { G.hudT = 0.1; renderBars(); if (G.invDirty) { renderHotbar(); G.invDirty = false; } refreshFurnaceUI(); }
  if (G.debug) { G.dbgT = (G.dbgT || 0) - dt; if (G.dbgT <= 0) { G.dbgT = 0.25; const c = W.chunk(Math.floor(p.x) >> 4, Math.floor(p.z) >> 4); UI.dbg.textContent = "FPS " + G.fps + "\nXYZ " + p.x.toFixed(1) + " " + p.y.toFixed(1) + " " + p.z.toFixed(1) + "\nchunków " + W.chunks.size + " (rysowane " + (RUN.ren.drawn | 0) + ")\nświatło " + W.sky(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) + "/" + W.blk(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) + "\nbiom " + (c ? c.bio[((Math.floor(p.z) & 15) << 4) | (Math.floor(p.x) & 15)] : "-") + "\nstwory " + G.ents.filter((e) => e.type === "mob").length + "\ndzień " + (G.day + 1) + " tick " + (G.tod | 0) + "\ntryb " + G.mode; } }
}
/* nagrody punktowe: tylko hardcore (osiągnięcia + dni przetrwania), patrz k6c-ach.js */
async function checkAwards() {
  if (G.mode !== "hardcore" || G.p.dead || !CTX || !CTX.award || G.awarding) return;
  const cl = Ach.nextClaim(); if (!cl) return;
  G.awarding = true;
  try {
    const r = await CTX.award(cl.pts);
    if (r && r.ok) { cl.ok(); UI.toast("🏅 " + cl.label + " " + (r.msg || "+" + cl.pts + " pkt"), "gold"); SFX.lvl(); saveWorld(); G.rewardRetry = 33; G.rewardFail = false; }
    else { G.rewardRetry = r && r.wait ? 35 : r && r.cap ? 900 : 150; if (r && r.msg && !G.rewardFail) { G.rewardFail = true; UI.toast(r.msg, "gold"); } }
  } catch (e) { G.rewardRetry = 150; }
  G.awarding = false;
}
function render(dt) {
  const U = UI, ren = RUN.ren, p = G.p; if (!ren) return;
  U.tch.style.visibility = G.state === "play" ? "visible" : "hidden";
  if (G.state === "menu" || !WORLD || !G.loaded) {
    /* tło menu: pusty ekran nieba */
    ren.gl.clearColor(0.1, 0.085, 0.07, 1); ren.gl.clear(ren.gl.COLOR_BUFFER_BIT | ren.gl.DEPTH_BUFFER_BIT); return;
  }
  const W = WORLD, sky = skyState();
  const eyeY = p.y + p.eyeH, headFl = fluidAt(p.x, eyeY, p.z);
  const eL = Math.max(W.sky(Math.floor(p.x), Math.floor(eyeY), Math.floor(p.z)), 0) / 15; G.fogL = (G.fogL == null ? eL : G.fogL + (eL - G.fogL) * Math.min(1, dt * 3));
  const fk = 0.03 + 0.97 * G.fogL; sky[0] *= fk; sky[1] *= fk; sky[2] *= fk;
  let fog = sky.slice(), near = SET.rd * 16 * 0.55, far = SET.rd * 16 * 0.98 + 8;
  if (headFl === 1) { const f = 0.35 + 0.65 * G.dayF; fog = [0.08 * f, 0.22 * f, 0.5 * f]; near = 0; far = 22; }
  else if (headFl === 2) { fog = [0.6, 0.15, 0]; near = 0; far = 3; }
  G.renderCam.yaw = p.yaw; G.renderCam.pitch = p.pitch;
  U.uw.style.opacity = headFl === 1 ? 1 : 0; U.dmg.style.opacity = p.hitFlash > 0 ? Math.min(1, p.hitFlash * 3) : (p.hp <= 4 && G.mode !== "creative" && !p.dead ? 0.35 + Math.sin(performance.now() / 300) * 0.15 : 0);
  G.fovCur = (G.fovCur || SET.fov); G.fovCur += ((SET.fov * (p.sprint ? 1.12 : 1)) - G.fovCur) * Math.min(1, dt * 8);
  const bob = p.onGround && !p.fly ? Math.sin((p.bob || 0)) * 0.03 * Math.min(1, Math.hypot(p.vx, p.vz) / 4) : 0;
  const st = { world: W, cam: [p.x, eyeY + bob, p.z], yaw: p.yaw, pitch: p.pitch, fov: G.fovCur * Math.PI / 180, tod: G.tod, dayF: G.dayF, sunF: G.sunF, minL: [0.04, 0.09, 0.2][SET.bright], fog, fogNear: near, fogFar: far, under: headFl > 0, overlay: drawOverlay };
  ren.resize(U.root.clientWidth, U.root.clientHeight);
  ren.draw(st, drawEntities);
  G.frames++; G.fpsT += dt; if (G.fpsT >= 0.5) { G.fps = Math.round(G.frames / G.fpsT); G.frames = 0; G.fpsT = 0; }
}
function drawOverlay(R, gl, U, sx, sy, sz) {
  const T = G.target; if (!T || !T.block || G.state === "menu") return;
  const b = T.block, bs = selBoxes(b.id, b.meta), d = R.lines; d.reset();
  const mb = d.mb; const E = 0.003, wt = TIX.white, wu = (wt % ATLAS_N) / ATLAS_N + 0.01, wv = Math.floor(wt / ATLAS_N) / ATLAS_N + 0.01;
  for (const bo of bs) {
    const base = mb.nv;
    for (let i = 0; i < 8; i++) mb.v(b.x + ((i & 1) ? bo[3] + E : bo[0] - E) - sx, b.y + ((i & 2) ? bo[4] + E : bo[1] - E) - sy, b.z + ((i & 4) ? bo[5] + E : bo[2] - E) - sz, wu, wv, 0, 0, 0, 255, 255, 255);
    for (const [a, c] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) { mb.i[mb.ni++] = base + a; mb.i[mb.ni++] = base + c; }
  }
  gl.uniform1f(U.u_flat, 1); gl.uniform1f(U.u_cut, 0.01); gl.depthMask(false); R.drawDyn(d, gl.LINES);
  const dg = G.dig;
  if (dg && dg.prog > 0.02 && dg.x === b.x && dg.y === b.y && dg.z === b.z) {
    const o = R.over; o.reset(); const stg = Math.min(9, Math.floor(dg.prog * 10)), tile = TIX["crack" + stg], tu = (tile % ATLAS_N) / ATLAS_N, tv = Math.floor(tile / ATLAS_N) / ATLAS_N, ts = 1 / ATLAS_N, e = 0.004;
    for (const bo of bs) for (let f = 0; f < 6; f++) {
      const q = BOXF[f]; const cs = [];
      for (let i = 0; i < 8; i++) cs.push([b.x + ((i & 1) ? bo[3] + e : bo[0] - e) - sx, b.y + ((i & 2) ? bo[4] + e : bo[1] - e) - sy, b.z + ((i & 4) ? bo[5] + e : bo[2] - e) - sz]);
      const us = [[tu, tv + ts], [tu, tv], [tu + ts, tv], [tu + ts, tv + ts]];
      for (let k = 0; k < 4; k++) { const c = cs[q[k]]; o.v(c[0], c[1], c[2], us[k][0], us[k][1], 255, 255, 255, 255, 255, 255); } o.q();
    }
    gl.enable(gl.BLEND); R.drawDyn(o);
  }
  gl.depthMask(true); gl.uniform1f(U.u_flat, 0); gl.uniform1f(U.u_cut, 0.5);
}
/* ===================== WSKAŹNIK MYSZY ===================== */
function lockPointer() {
  if (IS_TOUCH || !UI || !UI.cv) return;
  try { if (document.pointerLockElement !== UI.cv) { const r = UI.cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } } catch (e) {}
}
function unlockPointer() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {} }

/* ===================== INTERAKCJE ===================== */
const lookDir = (p) => { const cp = Math.cos(p.pitch); return [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp]; };
const lookIdx = (p) => { const dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw); return Math.abs(dz) >= Math.abs(dx) ? (dz > 0 ? 0 : 2) : dx > 0 ? 1 : 3; };
const FACE_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function rayMob(ox, oy, oz, d, maxD) {
  let best = null;
  for (const e of G.ents) {
    if (e.type !== "mob" || e.dead) continue;
    const hw = e.w / 2 + 0.05; let t0 = 0, t1 = maxD, ok = true;
    const o = [ox, oy, oz], mn = [e.x - hw, e.y, e.z - hw], mx = [e.x + hw, e.y + e.h, e.z + hw];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) { ok = false; break; } continue; }
      let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a]; if (ta > tb) { const q = ta; ta = tb; tb = q; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
    }
    if (ok && (!best || t0 < best.t)) best = { m: e, t: t0 };
  }
  return best;
}
function swingHand() {
  G.swing = 0.26; const h = UI.hand; h.classList.remove("swing"); void h.offsetWidth; h.classList.add("swing");
}
function toolWear(n) {
  if (G.mode === "creative") return;
  const s = G.inv.slots[G.sel]; if (!s || !durOf(s.id)) return;
  if (damageStack(G.inv, G.sel, n)) { UI.toast("Narzędzie się zniszczyło!"); SFX.brk("wood"); }
  G.invDirty = true;
}
function breakBlock(b) {
  const W = WORLD, p = G.p, id = b.id, meta = b.meta, bl = BLK[id], creative = G.mode === "creative";
  const stack = G.inv.slots[G.sel], def = stack ? itemDef(stack.id) : null;
  let drops = creative ? [] : dropsFor(id, meta, def);
  if (id === BID.door_upper) { if (!creative) drops = [[ID.door_item, 1]]; if (W.get(b.x, b.y - 1, b.z) === BID.door_lower) W.setBlock(b.x, b.y - 1, b.z, 0, 0, true); }
  else if (id === BID.door_lower && W.get(b.x, b.y + 1, b.z) === BID.door_upper) W.setBlock(b.x, b.y + 1, b.z, 0, 0, true);
  puff(b.x + 0.5, b.y + 0.5, b.z + 0.5, id, 12); SFX.brk(bl.snd);
  if (!creative) { Ach.bump("mined"); if (id === BID.log_oak || id === BID.log_birch || id === BID.log_spruce) Ach.bump("logs"); if (id === BID.obsidian) Ach.flag("h" + id); }
  W.setBlock(b.x, b.y, b.z, 0, 0);
  spawnDrops(b.x, b.y, b.z, drops);
  if (!creative) { p.exh += 0.025; if (bl.hard > 0) toolWear(def && def.tool && def.tool.type === "sword" ? 2 : 1); }
}
function digBlock(dt, b) {
  const bl = BLK[b.id], stack = G.inv.slots[G.sel], def = stack ? itemDef(stack.id) : null, creative = G.mode === "creative";
  if (G.breakCd > 0) { G.breakCd -= dt; return; }
  let dg = G.dig; if (!dg || dg.x !== b.x || dg.y !== b.y || dg.z !== b.z) dg = G.dig = { x: b.x, y: b.y, z: b.z, prog: 0, snd: 0 };
  const t = digTime(b.id, def, creative); if (t === Infinity) return;
  if (creative || t <= 0) { breakBlock(b); G.dig = null; G.breakCd = creative ? 0.18 : 0.25; swingHand(); return; }
  dg.prog += dt / t; dg.snd -= dt;
  if (dg.snd <= 0) { dg.snd = 0.23; SFX.dig(bl.snd); swingHand(); }
  if (dg.prog >= 1) { breakBlock(b); G.dig = null; G.breakCd = 0.25; }
}
function attackMob(m) {
  const p = G.p, stack = G.inv.slots[G.sel], def = stack ? itemDef(stack.id) : null;
  let dmg = def && def.tool ? def.tool.dmg : 1;
  if (!p.onGround && p.vy < 0 && !p.inWater && !p.onLadder) dmg *= 1.5;
  hurtMob(m, dmg, p.x, p.z, p.sprint ? 7 : 4.5);
  G.atkCd = def && def.tool && def.tool.type === "sword" ? 0.5 : 0.35; swingHand();
  if (G.mode !== "creative") { p.exh += 0.1; if (def && def.tool) toolWear(def.tool.type === "sword" ? 1 : 2); }
}
function eatDone(def) {
  const p = G.p, s = G.inv.slots[G.sel];
  p.food = Math.min(20, p.food + def.food[0]); p.sat = Math.min(p.food, p.sat + def.food[1]);
  if (def.bad) { p.hungerFx = 25; UI.toast("Fuj! Zgniłe mięso…"); }
  if (G.mode !== "creative") slotUse(G.inv, G.sel); G.invDirty = true; SFX.pop();
  G.eating = 0;
}
function canPlaceAt(x, y, z, nb) {
  const p = G.p;
  if (nb.solid && nb.shape !== 1 && nb.shape !== 8) {
    const hw = p.w / 2;
    if (p.x + hw > x && p.x - hw < x + 1 && p.z + hw > z && p.z - hw < z + 1 && p.y + p.h > y && p.y < y + 1) return false;
  }
  return true;
}
function placeItem(tb, stack, def) {
  const W = WORLD, p = G.p;
  let kind = def.block ? stack.id : def.place ? ID[def.place] : 0; if (!kind) return false;
  const n = FACE_N[tb.f]; let x = tb.x + n[0], y = tb.y + n[1], z = tb.z + n[2];
  if (BLK[tb.id].rep) { x = tb.x; y = tb.y; z = tb.z; }
  if (y < 1 || y >= WH - 2) return false;
  if (!BLK[W.get(x, y, z)].rep) return false;
  if (!W.has(x, z)) return false;
  const nb = BLK[kind]; let meta = 0; const li = lookIdx(p);
  if (nb.shape === 2 || nb.shape === 6) {
    if (nb.shape === 6 && (tb.f === 2 || tb.f === 3)) return false;
    if (tb.f === 3) return false;
    meta = tb.f === 2 ? 0 : [1, 2, 0, 0, 3, 4][tb.f]; if (nb.shape === 6 && meta === 0) return false;
  } else if (nb.shape === 4) meta = li;
  else if (nb.shape === 12 || kind === BID.furnace || kind === BID.furnace_on) meta = (li + 2) & 3;
  else if (nb.shape === 5) meta = [0, 3, 2, 1][li];
  else if (kind === BID.leaves_oak || kind === BID.leaves_birch || kind === BID.leaves_spruce) meta = 1;
  if (!canPlaceAt(x, y, z, nb)) return false;
  if (kind === BID.door_lower) {
    if (!SOLID[W.get(x, y - 1, z)] || !BLK[W.get(x, y + 1, z)].rep) return false;
    W.setBlock(x, y + 1, z, BID.door_upper, meta, true); W.setBlock(x, y, z, BID.door_lower, meta);
  } else {
    if (!W.supported(x, y, z, kind, meta)) return false;
    W.setBlock(x, y, z, kind, meta);
  }
  SFX.put(nb.snd); if (G.mode !== "creative") { slotUse(G.inv, G.sel); Ach.bump("placed"); } G.invDirty = true; swingHand();
  return true;
}
function setStackTo(i, id) { const s = G.inv.slots[i]; if (G.mode === "creative") return; if (s.n <= 1) G.inv.slots[i] = { id, n: 1, d: 0 }; else { s.n--; const left = invAdd(G.inv, id, 1); if (left) spawnItem(G.p.x, G.p.y + 1, G.p.z, id, 1); } G.invDirty = true; }
function useBucket(def, stack, tb, eye, d) {
  const W = WORLD, reach = G.mode === "creative" ? 5.5 : 4.5;
  if (def.key === "bucket") {
    const hit = raycastBlocks(eye[0], eye[1], eye[2], d[0], d[1], d[2], reach, true);
    if (hit && BLK[hit.id].fluid && hit.meta === 0) {
      const lava = BLK[hit.id].fluid === 2; W.setBlock(hit.x, hit.y, hit.z, 0, 0); SFX.splash();
      if (G.mode === "creative") invAdd(G.inv, lava ? ID.bucket_lava : ID.bucket_water, 1); else setStackTo(G.sel, lava ? ID.bucket_lava : ID.bucket_water);
      swingHand(); return true;
    }
    return false;
  }
  const kind = def.key === "bucket_lava" ? 2 : 1; let pos = null;
  const hit = raycastBlocks(eye[0], eye[1], eye[2], d[0], d[1], d[2], reach, false);
  if (hit) { const n = FACE_N[hit.f]; pos = BLK[hit.id].rep ? [hit.x, hit.y, hit.z] : [hit.x + n[0], hit.y + n[1], hit.z + n[2]]; }
  if (!pos) return false;
  const cur = W.get(pos[0], pos[1], pos[2]); if (!BLK[cur].rep && !BLK[cur].fluid) return false;
  W.setFluid(pos[0], pos[1], pos[2], kind, 0); W.fl[kind - 1].add(pkey(pos[0], pos[1], pos[2]));
  SFX.splash(); if (G.mode !== "creative") setStackTo(G.sel, ID.bucket); swingHand(); return true;
}
function useBonemeal(tb) {
  const W = WORLD, id = tb.id;
  if (id === BID.wheat && tb.meta < 7) { W.setM(tb.x, tb.y, tb.z, Math.min(7, tb.meta + ri(2, 4))); }
  else if (id === BID.sapling_oak || id === BID.sapling_birch || id === BID.sapling_spruce) { if (Math.random() < 0.45) { const k = id === BID.sapling_oak ? "oak" : id === BID.sapling_birch ? "birch" : "spruce"; W.setBlock(tb.x, tb.y, tb.z, 0, 0); W.growTree(k, tb.x, tb.y, tb.z); } }
  else if (id === BID.grass) { for (let i = 0; i < 10; i++) { const x = tb.x + ri(-2, 2), z = tb.z + ri(-2, 2), y = tb.y; if (W.get(x, y, z) === BID.grass && W.get(x, y + 1, z) === 0) W.setBlock(x, y + 1, z, Math.random() < 0.12 ? (Math.random() < 0.5 ? BID.flower_red : BID.flower_yellow) : BID.tallgrass, 0); } }
  else return false;
  puff(tb.x + 0.5, tb.y + 0.8, tb.z + 0.5, BID.leaves_oak, 6); SFX.pop();
  if (G.mode !== "creative") slotUse(G.inv, G.sel); G.invDirty = true; swingHand(); return true;
}
function sleepBed(b) {
  const p = G.p; p.spawn = [b.x + 0.5, b.y + 0.6, b.z + 0.5];
  if (G.dayF < 0.4) { Ach.bump("slept"); G.tod = 500; if (G.mode !== "hardcore") G.day++; for (const e of G.ents) if (e.type === "mob" && MOBS[e.kind].hostile) e.dead = true; UI.toast("Przespałeś noc. Punkt odrodzenia ustawiony."); }
  else UI.toast("Punkt odrodzenia ustawiony. Spać można tylko w nocy.");
  SFX.click();
}
function shootBow(power) {
  const p = G.p, creative = G.mode === "creative";
  if (!creative && invCount(G.inv, ID.arrow) < 1) { UI.toast("Brak strzał"); return; }
  const d = lookDir(p), sp = 12 + 26 * power;
  spawnArrow(p.x + d[0] * 0.3, p.y + p.eyeH - 0.1 + d[1] * 0.3, p.z + d[2] * 0.3, d[0] * sp + p.vx * 0.3, d[1] * sp, d[2] * sp + p.vz * 0.3, "player", power > 0.95 ? 6 : 1 + power * 4);
  SFX.bow(); if (!creative) { invTake(G.inv, ID.arrow, 1); toolWear(1); } G.invDirty = true; swingHand();
}
function endUse() {
  const p = G.p;
  if (G.bowT > 0.18) { const s = G.inv.slots[G.sel]; if (s && s.id === ID.bow) shootBow(Math.min(1, G.bowT)); }
  G.bowT = 0; G.eating = 0; p.eatT = 0;
}
function useOnBlock(tb, stack, def, edge) {
  const W = WORLD, p = G.p, id = tb.id, held = !!stack;
  if (edge && !(p.sneak && held)) {
    if (id === BID.crafting) { openInventory("bench", [tb.x, tb.y, tb.z]); return true; }
    if (id === BID.furnace || id === BID.furnace_on) { openInventory("furnace", [tb.x, tb.y, tb.z]); return true; }
    if (id === BID.chest) { openInventory("chest", [tb.x, tb.y, tb.z]); return true; }
    if (id === BID.door_lower || id === BID.door_upper) {
      const ly = id === BID.door_lower ? tb.y : tb.y - 1, m = W.getM(tb.x, ly, tb.z) ^ 4;
      W.setM(tb.x, ly, tb.z, m); W.setM(tb.x, ly + 1, tb.z, m); W.touch(W.chunks.get(ckey(tb.x >> 4, tb.z >> 4)), tb.x, tb.z); SFX.put("wood"); swingHand(); return true;
    }
    if (id === BID.bed) { sleepBed(tb); return true; }
  }
  if (!def) return false;
  if (def.key === "flint_steel" && edge) {
    if (id === BID.tnt) { W.setBlock(tb.x, tb.y, tb.z, 0, 0); spawnTnt(tb.x, tb.y, tb.z); SFX.fuse(); toolWear(1); swingHand(); return true; }
    return false;
  }
  if (def.tool && def.tool.type === "hoe" && edge) {
    if ((id === BID.grass || id === BID.dirt) && tb.f === 2 && W.get(tb.x, tb.y + 1, tb.z) === 0) { W.setBlock(tb.x, tb.y, tb.z, BID.farmland, 0); SFX.put("dirt"); toolWear(1); swingHand(); return true; }
    return false;
  }
  if (def.key === "bonemeal" && edge) return useBonemeal(tb);
  if (def.armor && edge) return false;
  if (def.block || def.place) {
    if (def.place === "wheat" && !(tb.f === 2 && id === BID.farmland)) return false;
    if (!edge && G.useCd > 0) return false;
    const ok = placeItem(tb, stack, def); if (ok) G.useCd = 0.25; return ok;
  }
  return false;
}
function updateInteract(dt) {
  const p = G.p, I = G.input, W = WORLD; if (p.dead) return;
  G.atkCd = Math.max(0, G.atkCd - dt); G.useCd = Math.max(0, G.useCd - dt); G.swing = Math.max(0, G.swing - dt);
  const eye = [p.x, p.y + p.eyeH, p.z], d = lookDir(p), reach = G.mode === "creative" ? 5.5 : 4.5;
  const hb = raycastBlocks(eye[0], eye[1], eye[2], d[0], d[1], d[2], reach, false), mh = rayMob(eye[0], eye[1], eye[2], d, reach);
  const tgt = { block: null, mob: null };
  if (hb && (!mh || hb.t <= mh.t)) tgt.block = hb; else if (mh) tgt.mob = mh.m;
  G.target = tgt;
  const stack = G.inv.slots[G.sel], def = stack ? itemDef(stack.id) : null;
  /* lewy: kop / atak */
  if (I.mouseL) {
    if (tgt.mob) { G.dig = null; if (G.atkCd <= 0) attackMob(tgt.mob); }
    else if (tgt.block) digBlock(dt, tgt.block);
    else { G.dig = null; G.swingT = (G.swingT || 0) - dt; if (G.swingT <= 0) { G.swingT = 0.4; swingHand(); } }
  } else { G.dig = null; if (G.breakCd > 0) G.breakCd = Math.max(0, G.breakCd - dt * 0.5); }
  /* prawy: użycie */
  const R = I.mouseR, edge = R && !I.rPrev; I.rPrev = R;
  if (!R) { if (I.rWas) { endUse(); I.rWas = false; } return; }
  I.rWas = true;
  if (edge) swingHand();
  if (edge && tgt.mob && def && def.key === "shears" && tgt.mob.kind === "sheep" && !tgt.mob.sheared) {
    tgt.mob.sheared = true; spawnItem(tgt.mob.x, tgt.mob.y + 0.6, tgt.mob.z, ID.wool, ri(1, 3)); SFX.put("cloth"); toolWear(1); return;
  }
  if (tgt.block && useOnBlock(tgt.block, stack, def, edge)) return;
  if (!def) return;
  if (def.food) {
    if (p.food < 20) { G.eating = (G.eating || 0) + dt; p.eatT = 0.2; G.eatSnd = (G.eatSnd || 0) - dt; if (G.eatSnd <= 0) { G.eatSnd = 0.28; SFX.eat(); } if (G.eating >= 1.6) eatDone(def); }
    return;
  }
  if (def.key === "bow") { G.bowT = Math.min(1.2, (G.bowT || 0) + dt); p.eatT = 0.2; return; }
  if (def.armor && edge) {
    const sl = def.armor.slot; if (!G.inv.armor[sl]) { G.inv.armor[sl] = stack; G.inv.slots[G.sel] = null; G.invDirty = true; SFX.put("metal"); } return;
  }
  if ((def.key === "bucket" || def.key === "bucket_water" || def.key === "bucket_lava") && edge) { useBucket(def, stack, tgt.block, eye, d); return; }
}
function dropHeld(all) {
  const p = G.p, s = G.inv.slots[G.sel]; if (!s) return;
  const n = all ? s.n : 1, d = lookDir(p);
  spawnItem(p.x + d[0] * 0.4, p.y + p.eyeH - 0.3, p.z + d[2] * 0.4, s.id, n, s.d, d[0] * 4.5, d[1] * 4.5 + 1.5, d[2] * 4.5, 1.6);
  if (all) G.inv.slots[G.sel] = null; else slotUse(G.inv, G.sel);
  G.invDirty = true;
}
function selectSlot(i) {
  i = (i + 9) % 9; if (i === G.sel) return; G.sel = i; G.invDirty = true; G.bowT = 0; G.eating = 0;
  const s = G.inv.slots[i]; UI.showName(s ? itemName(s.id) : "");
}

/* ===================== WEJŚCIE ===================== */
function bindInput() {
  const U = UI, I = G.input, L = RUN.listeners;
  const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); L.push([t, [type, fn], o]); };
  const playing = () => G && G.state === "play";
  const KEYS = { KeyW: "f", KeyS: "b", KeyA: "l", KeyD: "r", ArrowUp: "f", ArrowDown: "b", ArrowLeft: "l", ArrowRight: "r" };
  let lastW = 0, lastSpace = 0;
  on(window, "keydown", (e) => {
    if (!G || !RUN) return; if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const c = e.code;
    if (G.state === "inv") { if (c === "KeyE" || c === "Escape") { e.preventDefault(); e.stopPropagation(); closeInventory(); } return; }
    if (G.state === "play") {
      if (KEYS[c]) { if (!I[KEYS[c]] && c === "KeyW") { const now = performance.now(); if (now - lastW < 300) I.sprintTap = true; lastW = now; } I[KEYS[c]] = 1; }
      else if (c === "Space") { I.jump = 1; if (!e.repeat && G.mode === "creative") { const now = performance.now(); if (now - lastSpace < 320) { G.p.fly = !G.p.fly; G.p.vy = 0; } lastSpace = now; } }
      else if (c === "ShiftLeft" || c === "ShiftRight") I.sneak = 1;
      else if (c === "ControlLeft" || c === "ControlRight") I.sprint = 1;
      else if (c === "KeyE") { openInventory("inv"); }
      else if (c === "KeyJ") openGoals();
      else if (c === "KeyQ") dropHeld(e.ctrlKey);
      else if (c === "F3") { G.debug = !G.debug; U.dbg.style.display = G.debug ? "block" : "none"; }
      else if (/^Digit[1-9]$/.test(c)) selectSlot(+c.slice(5) - 1);
      else return;
      e.preventDefault(); e.stopPropagation();
    } else if (G.state === "pause" && c === "Escape") { /* przeglądarka sama zwolniła kursor */ }
  }, true);
  on(window, "keyup", (e) => {
    if (!G) return; const c = e.code;
    if (KEYS[c]) { I[KEYS[c]] = 0; if (c === "KeyW") I.sprintTap = false; }
    else if (c === "Space") { I.jump = 0; I.jumpHeld = false; }
    else if (c === "ShiftLeft" || c === "ShiftRight") I.sneak = 0;
    else if (c === "ControlLeft" || c === "ControlRight") I.sprint = 0;
  }, true);
  on(window, "blur", () => { if (!G) return; Object.assign(I, { f: 0, b: 0, l: 0, r: 0, jump: 0, sneak: 0, sprint: 0, sprintTap: 0, mouseL: 0, mouseR: 0 }); if (G.state === "play" && !IS_TOUCH) showPause(); });
  on(window, "pagehide", () => { try { if (G && WORLD && G.loaded) saveWorld(true); } catch (e) {} });
  on(document, "pointerlockchange", () => {
    if (!G) return;
    if (document.pointerLockElement !== U.cv && G.state === "play" && !IS_TOUCH) showPause();
  });
  on(document, "mousemove", (e) => {
    if (!G || G.state !== "play" || document.pointerLockElement !== U.cv) return;
    const s = 0.0022 * SET.sens, p = G.p; p.yaw -= e.movementX * s; p.pitch = clamp(p.pitch - e.movementY * s * (SET.invert ? -1 : 1), -1.5533, 1.5533);
  });
  on(U.cv, "mousedown", (e) => {
    if (!G) return; e.preventDefault();
    if (G.state === "play" && document.pointerLockElement !== U.cv && !IS_TOUCH) { lockPointer(); return; }
    if (G.state !== "play") return;
    if (e.button === 0) I.mouseL = 1; else if (e.button === 2) I.mouseR = 1; else if (e.button === 1) pickBlock();
  });
  on(window, "mouseup", (e) => { if (e.button === 0) I.mouseL = 0; else if (e.button === 2) I.mouseR = 0; });
  on(U.root, "contextmenu", (e) => e.preventDefault());
  on(U.root, "wheel", (e) => { if (!G || G.state !== "play") return; e.preventDefault(); selectSlot(G.sel + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });
  on(U.hotbar, "click", (e) => { const s = e.target.closest("[data-hot]"); if (s && G && G.state === "play") selectSlot(+s.dataset.hot); });
  /* dotyk */
  if (IS_TOUCH) {
    const touches = new Map(); let joyC = null;
    const press = (k, v) => {
      if (k === "jump") I.jump = v; else if (k === "mine") I.mouseL = v; else if (k === "use") I.mouseR = v;
      else if (k === "sneak") { if (v) { I.sneak = I.sneak ? 0 : 1; U.tSneak.classList.toggle("on", !!I.sneak); } }
      else if (k === "pause") { if (v && G.state === "play") showPause(); }
      else if (k === "inv") { if (v) { if (G.state === "play") openInventory("inv"); else if (G.state === "inv") closeInventory(); } }
      else if (k === "fly") { if (v && G.mode === "creative") { G.p.fly = !G.p.fly; G.p.vy = 0; U.tFly.classList.toggle("on", G.p.fly); } }
    };
    on(U.root, "touchstart", (e) => {
      if (!G) return;
      for (const t of e.changedTouches) {
        const el = t.target; const btn = el.closest && el.closest("[data-k]");
        if (btn && U.tch.contains(btn)) { e.preventDefault(); touches.set(t.identifier, { r: "btn", k: btn.dataset.k }); btn.classList.add("on"); press(btn.dataset.k, 1); continue; }
        if (el.closest && el.closest(".kjoy")) { e.preventDefault(); const r = U.joy.getBoundingClientRect(); joyC = [r.left + r.width / 2, r.top + r.height / 2]; touches.set(t.identifier, { r: "joy" }); continue; }
        if (G.state === "play" && !(el.closest && (el.closest(".khotbar") || el.closest(".kscreen") || el.closest(".ktsm")))) { touches.set(t.identifier, { r: "look", x: t.clientX, y: t.clientY, t0: performance.now() }); e.preventDefault(); }
      }
    }, { passive: false });
    on(U.root, "touchmove", (e) => {
      if (!G) return;
      for (const t of e.changedTouches) {
        const o = touches.get(t.identifier); if (!o) continue; e.preventDefault();
        if (o.r === "joy" && joyC) { let dx = t.clientX - joyC[0], dy = t.clientY - joyC[1]; const l = Math.hypot(dx, dy), m = 55; if (l > m) { dx = dx / l * m; dy = dy / l * m; } I.jx = dx / m; I.jz = -dy / m; U.joyK.style.transform = "translate(" + dx + "px," + dy + "px)"; I.sprintTap = l > m * 0.98 && I.jz > 0.7; }
        else if (o.r === "look" && G.state === "play") { const s = 0.0055 * SET.sens, p = G.p; p.yaw -= (t.clientX - o.x) * s; p.pitch = clamp(p.pitch - (t.clientY - o.y) * s * (SET.invert ? -1 : 1), -1.5533, 1.5533); o.x = t.clientX; o.y = t.clientY; }
      }
    }, { passive: false });
    const end = (e) => {
      if (!G) return;
      for (const t of e.changedTouches) {
        const o = touches.get(t.identifier); if (!o) continue; touches.delete(t.identifier);
        if (o.r === "btn") { press(o.k, 0); const b = U.tch.querySelector('[data-k="' + o.k + '"]'); if (b && o.k !== "sneak" && o.k !== "fly") b.classList.remove("on"); }
        else if (o.r === "joy") { I.jx = 0; I.jz = 0; I.sprintTap = false; U.joyK.style.transform = ""; }
      }
    };
    on(U.root, "touchend", end); on(U.root, "touchcancel", end);
  }
}
function pickBlock() {
  const T = G.target; if (!T || !T.block || G.mode !== "creative") return;
  let id = T.block.id; if (id === BID.furnace_on) id = BID.furnace; if (id === BID.door_upper) id = BID.door_lower;
  const it = id === BID.door_lower ? ID.door_item : id;
  for (let i = 0; i < 9; i++) if (G.inv.slots[i] && G.inv.slots[i].id === it) { selectSlot(i); return; }
  G.inv.slots[G.sel] = { id: it, n: 64, d: 0 }; G.invDirty = true;
}

/* ===================== START ===================== */
function loop(now) {
  if (!RUN || RUN.stop) return;
  RUN.raf = requestAnimationFrame(loop);
  let dt = (now - RUN.last) / 1000; RUN.last = now; if (!(dt > 0)) return; if (dt > 0.1) dt = 0.1;
  try {
    if (G.loaded && (G.state === "play" || G.state === "inv" || G.state === "dead")) tick(dt);
    render(dt);
    if (G.loaded && UI.hand.style.display !== "none") {
      const mv = Math.min(1, Math.hypot(G.p.vx, G.p.vz) / 5), b = G.p.onGround ? Math.sin(G.p.bob || 0) : 0;
      UI.hand.style.marginRight = (b * 5 * mv) + "px"; UI.hand.style.marginBottom = (-Math.abs(b) * 6 * mv) + "px";
    }
  } catch (e) { RUN.errs = (RUN.errs || 0) + 1; if (RUN.errs < 4) { console.error("Kopalnia:", e); if (UI) UI.toast("Błąd: " + (e && e.message)); } }
}
function launch(ctx) {
  if (window.__kopRunning) return; window.__kopRunning = true;
  const root = document.createElement("div"); root.className = "kop" + (IS_TOUCH ? " touch" : "");
  document.body.append(root);
  newGame(root, ctx); const U = buildUI(root, IS_TOUCH);
  let ren;
  try { ren = new Renderer(U.cv); }
  catch (e) { console.warn("Kopalnia:", e); root.remove(); window.__kopRunning = false; G = null; UI = null; alert("Ta przeglądarka nie obsługuje WebGL2 — gra się nie uruchomi."); if (ctx && ctx.close) ctx.close(); return; }
  RUN = { root, ren, listeners: [], stop: false, last: performance.now(), errs: 0, raf: 0 };
  bindInput(); bindInvEvents(root);
  if (IS_TOUCH) U.tFly.style.display = "none";
  showMainMenu(ctx);
  RUN.raf = requestAnimationFrame(loop);
}
/* ===================== OSIĄGNIĘCIA ===================== */
/* Statystyki: "all" (przetrwanie + hardcore → trofea) i "hc" (tylko hardcore → punkty). Zapis lokalny w przeglądarce. */
const ACH_KEY = "wr_kop_ach_v2";
const REWARD_DAYS = [9, 19, 29, 49, 99];
const REWARD_PTS = [1, 1, 2, 3, 3];
const Ach = {
  d: null, dirty: false, t: 0, acc: 0, lp: null, D: null,
  load() {
    if (this.d) return;
    let d = null; try { d = JSON.parse(localStorage.getItem(ACH_KEY) || "null"); } catch (e) { d = null; }
    if (!d || typeof d !== "object") d = {};
    d.all = d.all || {}; d.hc = d.hc || {}; d.done = d.done || {}; d.paid = d.paid || {};
    this.d = d;
  },
  save() { if (!this.dirty) return; this.dirty = false; try { localStorage.setItem(ACH_KEY, JSON.stringify(this.d)); } catch (e) {} },
  on() { return !!(G && WORLD && G.loaded && G.p && !G.p.dead && (G.mode === "survival" || G.mode === "hardcore")); },
  put(k, f) {
    if (!this.on()) return; this.load();
    const sc = G.mode === "hardcore" ? [this.d.all, this.d.hc] : [this.d.all];
    for (const s of sc) { const o = s[k], v = f(o); if (v !== o) { s[k] = v; this.dirty = true; } }
  },
  bump(k, n) { this.put(k, (o) => (o || 0) + (n === undefined ? 1 : n)); },
  flag(k) { this.put(k, () => 1); },
  low(k, v) { this.put(k, (o) => (o === undefined || v < o ? v : o)); },
  high(k, v) { this.put(k, (o) => (o === undefined || v > o ? v : o)); },
  defs() {
    if (this.D) return this.D;
    const f = (k) => (s) => !!s[k], ge = (k, n) => (s) => (s[k] || 0) >= n;
    const cr = (id) => f("c" + id), hv = (id) => f("h" + id);
    const cooked = [ID.cooked_pork, ID.cooked_beef, ID.cooked_mutton, ID.cooked_chicken];
    const full = (m) => (s) => ["helmet", "chest", "legs", "boots"].every((p) => s["e" + ID[m + "_" + p]]);
    this.D = [
      /* trofea (0 pkt): łatwe cele na dobry start */
      { id: "wood", n: "Drwal", d: "Zetnij 5 pni drzew.", p: 0, t: ge("logs", 5) },
      { id: "table", n: "Stół rzemieślniczy", d: "Wytwórz stół rzemieślniczy.", p: 0, t: cr(BID.crafting) },
      { id: "stonepick", n: "Epoka kamienia", d: "Wytwórz kamienny kilof.", p: 0, t: cr(ID.pick_stone) },
      { id: "torch", n: "Niech się świeci", d: "Wytwórz pochodnię.", p: 0, t: cr(BID.torch) },
      { id: "furnace", n: "Gorący piec", d: "Wytwórz piec.", p: 0, t: cr(BID.furnace) },
      { id: "night", n: "Przetrwana noc", d: "Dożyj drugiego dnia.", p: 0, t: ge("day", 1) },
      { id: "iron", n: "Czas na żelazo", d: "Przetop rudę na sztabkę żelaza.", p: 0, t: hv(ID.iron_ingot) },
      { id: "zombie", n: "Łowca zombie", d: "Pokonaj 5 zombie.", p: 0, t: ge("k_zombie", 5) },
      { id: "skeleton", n: "Szkielet w szafie", d: "Pokonaj 3 szkielety.", p: 0, t: ge("k_skeleton", 3) },
      { id: "spider", n: "Pajęczyna", d: "Pokonaj 3 pająki.", p: 0, t: ge("k_spider", 3) },
      { id: "bread", n: "Własny chleb", d: "Wytwórz chleb.", p: 0, t: cr(ID.bread) },
      { id: "cook", n: "Kucharz", d: "Zdobądź pieczone mięso.", p: 0, t: (s) => cooked.some((i) => s["h" + i]) },
      { id: "bed", n: "Dobranoc", d: "Prześpij noc w łóżku.", p: 0, t: ge("slept", 1) },
      { id: "bucket", n: "Wiaderko", d: "Wytwórz wiadro.", p: 0, t: cr(ID.bucket) },
      { id: "bow", n: "Łucznik", d: "Wytwórz łuk.", p: 0, t: cr(ID.bow) },
      { id: "builder", n: "Budowniczy", d: "Postaw 300 bloków.", p: 0, t: ge("placed", 300) },
      { id: "walker", n: "Wędrowiec", d: "Przejdź 10 000 m.", p: 0, t: ge("walked", 10000) },
      { id: "ipick", n: "Żelazny kilof", d: "Wytwórz żelazny kilof.", p: 0, t: cr(ID.pick_iron) },
      { id: "gold", n: "Złoto!", d: "Zdobądź sztabkę złota.", p: 0, t: hv(ID.gold_ingot) },
      /* punkty: bardzo trudne cele, tylko Hardcore */
      { id: "ironarm", n: "Żelazny rycerz", d: "Załóż komplet żelaznej zbroi.", p: 1, t: full("iron") },
      { id: "deep", n: "Głębinowiec", d: "Zejdź na wysokość 8 lub niżej.", p: 1, t: (s) => s.miny !== undefined && s.miny <= 8 },
      { id: "miner", n: "Górnik", d: "Wykop 3000 bloków.", p: 1, t: ge("mined", 3000) },
      { id: "builder2", n: "Wielki budowniczy", d: "Postaw 3000 bloków.", p: 1, t: ge("placed", 3000) },
      { id: "walker2", n: "Maratończyk", d: "Przejdź 30 000 m.", p: 1, t: ge("walked", 30000) },
      { id: "diamond", n: "Diamenty!", d: "Zdobądź diament.", p: 2, t: hv(ID.diamond) },
      { id: "dpick", n: "Diamentowy kilof", d: "Wytwórz diamentowy kilof.", p: 2, t: cr(ID.pick_diamond) },
      { id: "obsidian", n: "Obsydian", d: "Wykop obsydian.", p: 2, t: hv(BID.obsidian) },
      { id: "hunter", n: "Pogromca", d: "Pokonaj 150 stworów.", p: 2, t: ge("kills", 150) },
      { id: "tnt", n: "Wielki wybuch", d: "Wysadź 10 ładunków TNT.", p: 2, t: ge("tnt", 10) },
      { id: "dblock", n: "Skarbiec", d: "Wytwórz blok diamentu.", p: 3, t: cr(BID.block_diamond) },
      { id: "darmor", n: "Diamentowy rycerz", d: "Załóż komplet diamentowej zbroi.", p: 3, t: full("diamond") },
      { id: "hunter2", n: "Postrach nocy", d: "Pokonaj 400 stworów.", p: 3, t: ge("kills", 400) }
    ];
    return this.D;
  },
  scan() {
    for (const s of G.inv.slots) if (s) this.flag("h" + s.id);
    for (const s of G.inv.armor) if (s) { this.flag("h" + s.id); this.flag("e" + s.id); }
  },
  check() {
    this.load(); const D = this.defs(), hc = G.mode === "hardcore";
    for (const a of D) {
      if (!this.d.done[a.id] && a.t(this.d.all)) {
        this.d.done[a.id] = 1; this.dirty = true;
        UI.toast("🏆 Osiągnięcie: " + a.n + (a.p && !hc ? " · punkty tylko w Hardcore" : ""), "gold"); SFX.lvl();
      }
    }
    this.save();
  },
  tick(dt) {
    if (!this.on()) { this.lp = null; try { updateGoal(); } catch (e) {} return; }
    const p = G.p;
    if (this.lp) {
      const d = Math.hypot(p.x - this.lp[0], p.z - this.lp[1]);
      if (d < 2.5 && (p.onGround || p.inWater)) { this.acc += d; if (this.acc >= 5) { this.bump("walked", Math.round(this.acc)); this.acc = 0; } }
    }
    this.lp = [p.x, p.z];
    this.t += dt;
    if (this.t >= 1.5) {
      this.t = 0; this.scan(); this.low("miny", Math.floor(p.y)); this.high("day", G.day); this.check(); try { updateGoal(); } catch (e) {}
    }
  },
  /* następna nagroda do naliczenia (tylko hardcore) */
  nextClaim() {
    this.load(); const hc = this.d.hc;
    for (const a of this.defs()) {
      if (a.p > 0 && !this.d.paid[a.id] && a.t(hc)) return { pts: a.p, label: "Osiągnięcie: " + a.n, ok: () => { this.d.paid[a.id] = 1; this.dirty = true; this.save(); } };
    }
    for (let k = 0; k < REWARD_DAYS.length; k++) {
      if (G.day >= REWARD_DAYS[k] && !G.awarded[k]) return { pts: REWARD_PTS[k], label: (REWARD_DAYS[k] + 1) + ". dzień przetrwania", ok: () => { G.awarded[k] = 1; } };
    }
    return null;
  }
};
/* ===== lista celów (Hardcore) ===== */
const ACH_G = { wood: ["logs", 5], zombie: ["k_zombie", 5], skeleton: ["k_skeleton", 3], spider: ["k_spider", 3], bed: ["slept", 1], builder: ["placed", 300], builder2: ["placed", 3000], walker: ["walked", 10000, " m"], walker2: ["walked", 30000, " m"], miner: ["mined", 3000], hunter: ["kills", 150], hunter2: ["kills", 400], tnt: ["tnt", 10] };
function achProg(a, d) {
  const s = a.p ? d.hc : d.all, g = ACH_G[a.id];
  if (g) return Math.min(g[1], s[g[0]] || 0) + "/" + g[1] + (g[2] || "");
  if (a.id === "deep") return s.miny === undefined ? "cel: wysokość 8" : "najniżej: " + s.miny + " (cel: 8)";
  if (a.id === "night") return "dzień " + (Math.min(1, s.day || 0) + 1) + "/2";
  return "";
}
function hcPending() { Ach.load(); return Ach.defs().filter((a) => a.p > 0 && !Ach.d.paid[a.id]).sort((x, y) => x.p - y.p); }
function nextGoalText() {
  Ach.load(); const d = Ach.d, hc = d.hc;
  const pend = hcPending(), todo = pend.find((a) => !a.t(hc));
  if (todo) { const pr = achProg(todo, d); return "🎯 " + todo.d + (pr ? " (" + pr + ")" : "") + " · +" + todo.p + " pkt"; }
  if (pend.length) return "🏅 Cel zaliczony — punkty zaraz zostaną naliczone";
  for (let k = 0; k < REWARD_DAYS.length; k++) if (!G.awarded[k]) return "🎯 Przetrwaj do " + (REWARD_DAYS[k] + 1) + ". dnia (jesteś na " + (G.day + 1) + ".) · +" + REWARD_PTS[k] + " pkt";
  return "🏅 Wszystkie cele Hardcore zaliczone!";
}
function updateGoal() {
  const U = UI; if (!U || !U.goal) return;
  const show = !!(G && G.loaded && G.p && !G.p.dead && G.mode === "hardcore" && G.state === "play");
  if (!show) { U.goal.style.display = "none"; return; }
  U.goal.style.display = "block"; U.goal.textContent = nextGoalText() + "  ·  lista: J";
}
function openGoals() {
  if (!G || G.state !== "play") return;
  G.state = "pause"; unlockPointer(); if (UI.goal) UI.goal.style.display = "none"; showAch(() => Game.resume());
}
function showAch(back) {
  Ach.load(); const D = Ach.defs(), d = Ach.d;
  const inHc = !!(G && G.loaded && G.mode === "hardcore");
  const maxP = D.reduce((s, a) => s + a.p, 0), gotP = D.reduce((s, a) => s + (d.paid[a.id] ? a.p : 0), 0);
  const row = (a, st) => {
    const pr = achProg(a, d), pd = d.paid[a.id], ok = st === "done";
    const tag = a.p ? (pd ? "✔ +" + a.p + " pkt" : "+" + a.p + " pkt") : "trofeum";
    return '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #3c322a"><span style="font-size:20px">' + (ok ? "🏆" : "🎯") + '</span><div style="flex:1"><b style="font-size:13px">' + esc(a.n) + '</b><br><small style="color:#b8a98f">' + esc(a.d) + (pr && !ok ? ' · <span style="color:#f6e08a">' + esc(pr) + "</span>" : "") + '</small></div><span style="font-size:12px;white-space:nowrap;color:' + (pd ? "#7bd88f" : a.p ? "#f6e08a" : "#8a7c68") + '">' + tag + "</span></div>";
  };
  const todo = D.filter((a) => a.p > 0 && !d.paid[a.id]).sort((x, y) => x.p - y.p);
  const done = D.filter((a) => a.p > 0 && d.paid[a.id]);
  const troph = D.filter((a) => a.p === 0);
  const days = REWARD_DAYS.map((dd, k) => {
    const got = inHc && G.awarded[k], cur = inHc ? G.day + 1 : null;
    return '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #3c322a"><span style="font-size:20px">' + (got ? "✔" : "🌅") + '</span><div style="flex:1"><b style="font-size:13px">' + (dd + 1) + '. dzień przetrwania</b><br><small style="color:#b8a98f">w jednym świecie Hardcore' + (cur && !got ? ' · <span style="color:#f6e08a">teraz: ' + cur + ".</span>" : "") + '</small></div><span style="font-size:12px;color:' + (got ? "#7bd88f" : "#f6e08a") + '">' + (got ? "✔ " : "") + "+" + REWARD_PTS[k] + " pkt</span></div>";
  }).join("");
  const sec = (t, n) => '<h3 style="margin:12px 0 2px;font-size:14px">' + t + (n !== undefined ? ' <small style="color:#b8a98f">(' + n + ")</small>" : "") + "</h3>";
  const html = '<h2>🎯 Cele Hardcore</h2>'
    + '<p style="font-size:13px;margin:4px 0">Zdobyte punkty z osiągnięć: <b>' + gotP + "/" + maxP + '</b></p>'
    + '<p style="font-size:12px;color:#b8a98f;margin:0 0 4px">Punkty dostajesz <b>tylko w świecie Hardcore</b> i tylko po zalogowaniu na koncie. Każde osiągnięcie liczy się <b>raz</b>. Limit to <b>8 pkt na dobę</b>, a 100 punktów wymienisz na rabat −5 zł. Postęp pokazuje to, co zrobiłeś w Hardcore.</p>'
    + sec("Do zdobycia", todo.length) + (todo.length ? todo.map((a) => row(a, "todo")).join("") : '<p style="font-size:13px;color:#7bd88f">Wszystkie osiągnięcia z punktami zdobyte! 🎉</p>')
    + sec("Dni przetrwania", REWARD_DAYS.length) + days
    + (done.length ? sec("Już zaliczone", done.length) + done.map((a) => row(a, "done")).join("") : "")
    + sec("Trofea (bez punktów)", troph.filter((a) => d.done[a.id]).length + "/" + troph.length) + troph.map((a) => row(a, d.done[a.id] ? "done" : "todo")).join("")
    + '<button class="kbtn gold" data-a="back" style="margin-top:10px">Wróć</button>';
  const c = screenCard(html);
  UI.mkScreen(c, true);
  c.onclick = (e) => { if (e.target.closest("[data-a=back]")) { SFX.click(); back(); } };
}
/* ===================== REJESTRACJA ===================== */
function startCard(stage, ctx) {
  const card = h("div", { style: "text-align:center;padding:14px 10px" },
    h("div", { style: "font-size:40px" }, "⛏️"),
    h("h3", { style: "margin:6px 0" }, "Kopalnia"),
    h("p", { style: "font-size:13px;opacity:.85;margin:4px 0 12px" }, "Sandbox 3D z blokami: przetrwanie, hardcore i kreatywny. Gra otwiera się na cały ekran. Punkty tylko w trybie Hardcore: za osiągnięcia i dni przetrwania (limit 8 pkt na dobę)."),
    h("button", { class: "rb-btn", style: "padding:10px 22px;font-weight:800;cursor:pointer" }, "Uruchom"),
    h("button", { class: "rb-btn", style: "padding:10px 16px;margin-left:8px;cursor:pointer" }, "Zamknij"));
  const b = card.querySelectorAll("button");
  b[0].onclick = () => { stage.innerHTML = ""; launch(ctx); };
  b[1].onclick = () => ctx.close();
  stage.innerHTML = ""; stage.append(card);
}
window.WRGames.register({ id: "kopalnia", icon: "⛏️", name: "Kopalnia — sandbox 3D", desc: "Kop, buduj i przetrwaj. Tryby: przetrwanie, hardcore, kreatywny.", start: startCard });
if (window.__KOP_DEBUG) window.__KOP = { get G() { return G; }, get W() { return WORLD; }, get UI() { return UI; }, get RUN() { return RUN; }, launch, Game, Save, Ach, INV, killMob, hurtMob, showAch, showPause, craftConsume, spawnMob, explode, spawnItem, buildAtlas, iconURL, BLK, ITM, ID, BID, TIX, TILES, RECIPES, matchRecipe, itemDef, dropsFor, digTime, tick, SET };
})();
