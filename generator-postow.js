/* Generator postów (panel admina → zakładka „Post”).
   Rysuje grafikę 1080 px na canvasie (zdjęcie + tytuł + cena + numer telefonu) i układa gotowy opis z hasztagami.
   Ładowany dopiero po otwarciu zakładki: import("./generator-postow.js"). Niczego nie wysyła w sieć. */
const $ = (id) => document.getElementById(id);
const PHONE = "668 862 396";
const FORMATS = { post: [1080, 1350, "post"], story: [1080, 1920, "relacja"], sq: [1080, 1080, "kwadrat"] };
const KICKERS = { pizza: "POLECAMY", promo: "PROMOCJA", info: "UWAGA", own: "" };
const TAGS = "#pizza #pizzazpieca #pizzanapoli #włoskarobota #głuponie #kuślin #nowytomyśl #wielkopolska #dowózpizzy #pizzalovers";
const RED = "#CD212A", GREEN = "#009246", GOLD = "#D4AF37";

let ready = false, photos = [], menu = [], photoSel = "", customImg = null, capDirty = false, timer = 0, drawing = false, again = false;
const imgCache = {};

const slug = (t) => String(t || "post").toLowerCase().replace(/ą/g, "a").replace(/ć/g, "c").replace(/ę/g, "e").replace(/ł/g, "l").replace(/ń/g, "n").replace(/ó/g, "o").replace(/ś/g, "s").replace(/[źż]/g, "z").replace(/[^a-z0-9]+/g, "-").slice(0, 30).replace(/^-|-$/g, "") || "post";
const msg = (t, cls) => { const m = $("rb-p-msg"); if (m) { m.textContent = t || ""; m.className = "rb-msg" + (cls ? " " + cls : ""); } };

function loadImg(src) {
  if (!src) return Promise.resolve(null);
  if (imgCache[src]) return imgCache[src];
  return (imgCache[src] = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }));
}

/* ---- dane ze strony: zdjęcia z galerii i pozycje menu ---- */
function collect() {
  const seen = new Set(); photos = [];
  document.querySelectorAll("#galleryGrid img, #aboutImg").forEach((im) => {
    const s = im.currentSrc || im.src; if (!s || seen.has(s)) return;
    if (!(s.startsWith(location.origin) || s.startsWith("data:") || s.startsWith("blob:"))) return;
    seen.add(s); photos.push({ src: s, alt: im.alt || "zdjęcie" });
  });
  menu = [...document.querySelectorAll("#menuGrid .menu-item")].map((el) => {
    const t = (el.querySelector(".menu-item-title") || {}).textContent || "";
    return { name: t.replace(/^\s*\d+\.\s*/, "").trim(), price: ((el.querySelector(".menu-item-price") || {}).textContent || "").trim(), desc: ((el.querySelector(".menu-item-desc") || {}).textContent || "").trim() };
  }).filter((x) => x.name);
}

/* ---- rysowanie ---- */
function cover(g, img, w, h) {
  const r = Math.max(w / img.width, h / img.height), dw = img.width * r, dh = img.height * r;
  g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
function wrap(g, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = []; let cur = "";
  words.forEach((w) => { const t = cur ? cur + " " + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  return lines;
}
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };

async function fonts() {
  try {
    await Promise.all(['800 80px "Playfair Display"', '700 40px Poppins', '800 40px Poppins', '500 30px Poppins'].map((f) => document.fonts.load(f)));
    await document.fonts.ready;
  } catch (_) {}
}

export async function render(cv, o) {
  const [W, H] = o.fmt, s = W / 1080, story = H > W * 1.6;
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  await fonts();
  /* tło */
  g.fillStyle = "#121212"; g.fillRect(0, 0, W, H);
  const ph = o.photo && o.photo !== "custom" ? await loadImg(o.photo) : null, bm = o.photo === "custom" ? customImg : null, im = bm || ph;
  if (im) cover(g, im, W, H);
  else {
    const gr = g.createRadialGradient(W * 0.75, H * 0.2, 40, W / 2, H / 2, H * 0.9);
    gr.addColorStop(0, "#a3161f"); gr.addColorStop(0.55, "#4a0d12"); gr.addColorStop(1, "#121212");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  /* przyciemnienie: góra pod logo, dół pod tekst */
  let gr = g.createLinearGradient(0, 0, 0, H * 0.22); gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, W, H * 0.22);
  gr = g.createLinearGradient(0, H * 0.38, 0, H); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.55, "rgba(0,0,0,.72)"); gr.addColorStop(1, "rgba(0,0,0,.92)");
  g.fillStyle = gr; g.fillRect(0, H * 0.38, W, H * 0.62);

  const m = 70 * s, topSafe = story ? 190 * s : 0, botSafe = story ? 250 * s : 0;
  /* logo i adres strony */
  const logo = await loadImg("/logo-badge.webp");
  if (logo) { g.save(); g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 24 * s; g.drawImage(logo, m, topSafe + 46 * s, 150 * s, 150 * s); g.restore(); }
  g.save(); g.font = "600 " + 28 * s + 'px Poppins, sans-serif'; g.fillStyle = "#fff"; g.textAlign = "right"; g.shadowColor = "rgba(0,0,0,.7)"; g.shadowBlur = 10 * s;
  g.fillText("wloskarobota.eu", W - m, topSafe + 96 * s); g.restore();

  /* układ bloku tekstu od dołu */
  const maxW = W - 2 * m, title = (o.title || "").toUpperCase().trim(), sub = (o.sub || "").trim();
  let fs = 124 * s, tl = [];
  for (; fs >= 56 * s; fs -= 4 * s) { g.font = "800 " + fs + 'px "Playfair Display", Georgia, serif'; tl = wrap(g, title, maxW); if (tl.length <= 3 && tl.every((l) => g.measureText(l).width <= maxW)) break; }
  const tlh = fs * 1.08;
  g.font = "500 " + 38 * s + 'px Poppins, sans-serif';
  let sl = sub ? wrap(g, sub, maxW) : []; if (sl.length > 3) { sl = sl.slice(0, 3); sl[2] = sl[2].replace(/\s*\S*$/, "") + "…"; }
  const slh = 54 * s, ctaH = 100 * s, foot = 30 * s;
  const kick = (o.kicker || "").toUpperCase().trim();
  const blockH = 8 * s + 26 * s + (kick ? 56 * s + 26 * s : 0) + tl.length * tlh + (sl.length ? 18 * s + sl.length * slh : 0) + 34 * s + (o.cta ? ctaH + 30 * s : 0) + foot;
  let y = H - m * 0.9 - botSafe - blockH;
  /* trójkolorowy akcent */
  [[GREEN, 0], [ "#fff", 80], [RED, 160]].forEach(([c, dx]) => { g.fillStyle = c; g.fillRect(m + dx * s, y, 80 * s, 8 * s); });
  y += 8 * s + 26 * s;
  const bx = W - m - 130 * s, by = y - 120 * s;
  if (kick) {
    g.font = "800 " + 28 * s + 'px Poppins, sans-serif'; const kw = g.measureText(kick.split("").join(String.fromCharCode(8202))).width + 56 * s;
    g.fillStyle = GOLD; rr(g, m, y, kw, 56 * s, 28 * s); g.fill();
    g.fillStyle = "#1a1a1a"; g.textBaseline = "middle"; g.fillText(kick.split("").join(String.fromCharCode(8202)), m + 28 * s, y + 29 * s); g.textBaseline = "alphabetic";
    y += 56 * s + 26 * s;
  }
  /* tytuł */
  g.save(); g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 18 * s; g.fillStyle = "#fff"; g.font = "800 " + fs + 'px "Playfair Display", Georgia, serif';
  tl.forEach((l, i) => g.fillText(l, m, y + fs * 0.88 + i * tlh)); g.restore();
  y += tl.length * tlh;
  if (sl.length) {
    y += 18 * s; g.font = "500 " + 38 * s + 'px Poppins, sans-serif'; g.fillStyle = "rgba(255,255,255,.92)";
    sl.forEach((l, i) => g.fillText(l, m, y + 38 * s + i * slh)); y += sl.length * slh;
  }
  y += 34 * s;
  /* przycisk z numerem */
  if (o.cta) {
    g.font = "800 " + 44 * s + 'px Poppins, sans-serif'; const cw = Math.min(maxW, g.measureText(o.cta.toUpperCase()).width + 100 * s);
    g.fillStyle = GREEN; rr(g, m, y, cw, ctaH, ctaH / 2); g.fill();
    g.lineWidth = 4 * s; g.strokeStyle = GOLD; g.stroke();
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(o.cta.toUpperCase(), m + cw / 2, y + ctaH / 2 + 2 * s); g.textAlign = "left"; g.textBaseline = "alphabetic";
    y += ctaH + 30 * s;
  }
  g.font = "500 " + 26 * s + 'px Poppins, sans-serif'; g.fillStyle = "rgba(255,255,255,.8)";
  g.fillText("Głuponie 103 · pizza z pieca · dowóz do okolicznych miejscowości", m, y + 24 * s);
  /* plakietka (cena / zniżka) */
  const badge = (o.badge || "").trim();
  if (badge) {
    const R = 128 * s; g.save(); g.translate(bx, Math.max(by, topSafe + 260 * s)); g.rotate(-0.17);
    g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = 24 * s; g.fillStyle = RED; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); g.shadowBlur = 0;
    g.lineWidth = 8 * s; g.strokeStyle = GOLD; g.beginPath(); g.arc(0, 0, R - 10 * s, 0, 7); g.stroke();
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
    let bl = [badge], bf = 78 * s;
    for (; bf >= 30 * s; bf -= 3 * s) { g.font = "800 " + bf + 'px Poppins, sans-serif'; bl = g.measureText(badge).width <= R * 1.52 ? [badge] : wrap(g, badge, R * 1.52); if (bl.length <= 2 && bl.every((l) => g.measureText(l).width <= R * 1.52)) break; }
    bl.forEach((l, i) => g.fillText(l, 0, (i - (bl.length - 1) / 2) * bf * 1.05 + 3 * s));
    g.restore();
  }
  return cv;
}

/* ---- opis do wklejenia ---- */
function caption() {
  const t = $("rb-p-type").value, title = $("rb-p-title").value.trim(), sub = $("rb-p-sub").value.trim(), badge = $("rb-p-badge").value.trim();
  const ctaLine = "📞 Zamów: " + PHONE + "\n📍 Głuponie 103 · dowozimy do okolicznych miejscowości";
  let head;
  if (t === "pizza") head = "🍕 " + (title || "Pizza") + (badge ? " (" + badge + ")" : "") + (sub ? "\n" + sub + "." : "") + "\nCiasto fermentowane 24 h, pieczone w piecu, 30 cm. Gorąca, prosto z pieca! 🔥";
  else if (t === "promo") head = "🔥 " + (title || "Promocja") + (badge ? " " + badge : "") + (sub ? "\n" + sub : "") + "\nBierz kogoś na pizzę, bo takiej okazji szkoda nie wykorzystać! 😋";
  else if (t === "info") head = "📢 " + (title || "Ważna informacja") + (sub ? "\n" + sub : "");
  else head = [title, sub].filter(Boolean).join("\n");
  return head + "\n\n" + ctaLine + "\n\n" + TAGS;
}
function setCaption(force) { if (force) capDirty = false; if (!capDirty) $("rb-p-cap").value = caption(); }

/* ---- formularz ---- */
function opts() {
  return { fmt: FORMATS[$("rb-p-fmt").value] || FORMATS.post, kicker: $("rb-p-kicker").value, title: $("rb-p-title").value, sub: $("rb-p-sub").value, badge: $("rb-p-badge").value, cta: $("rb-p-cta").value.trim(), photo: photoSel };
}
function paint() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (drawing) { again = true; return; }
    drawing = true;
    try { await render($("rb-p-cv"), opts()); } catch (e) { msg("Nie udało się narysować grafiki: " + (e && e.message || e), "err"); }
    drawing = false; if (again) { again = false; paint(); }
  }, 120);
  setCaption(false);
}
function save(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const toBlob = (cv) => new Promise((r) => cv.toBlob(r, "image/png"));
const base = () => "wloska-robota-" + slug($("rb-p-title").value);

function buildPhotos() {
  const box = $("rb-p-photos"); box.innerHTML = "";
  const add = (src, label, node) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "rb-p-ph"; b.dataset.src = src; b.title = label; b.setAttribute("aria-label", label);
    b.appendChild(node); b.addEventListener("click", () => { photoSel = src; mark(); paint(); }); box.appendChild(b);
  };
  const none = document.createElement("span"); none.textContent = "Tło marki"; add("", "Tło marki (bez zdjęcia)", none);
  photos.forEach((p) => { const i = document.createElement("img"); i.src = p.src; i.alt = p.alt; i.loading = "lazy"; add(p.src, p.alt, i); });
  mark();
}
function mark() { document.querySelectorAll("#rb-p-photos .rb-p-ph").forEach((b) => b.classList.toggle("on", (b.dataset.src || "") === (photoSel || ""))); }

function fillPizza() {
  const p = menu[Number($("rb-p-pizza").value)]; if (!p) return;
  $("rb-p-title").value = p.name.replace(/\b(\p{L})(\p{L}*)/gu, (_, a, b) => a + b.toLowerCase()); $("rb-p-sub").value = p.desc; $("rb-p-badge").value = p.price;
}
function onType() {
  const t = $("rb-p-type").value; $("rb-p-kicker").value = KICKERS[t]; $("rb-p-pizzarow").hidden = t !== "pizza";
  if (t === "pizza") { if (!$("rb-p-pizza").value) $("rb-p-pizza").value = "0"; fillPizza(); }
  else if (t === "promo") { $("rb-p-title").value = "Happy hour"; $("rb-p-sub").value = "Dziś na wszystkie pizze"; $("rb-p-badge").value = "-20%"; }
  else if (t === "info") { $("rb-p-title").value = "Dziś nieczynne"; $("rb-p-sub").value = "Zapraszamy jutro od 12:00"; $("rb-p-badge").value = ""; }
  else { $("rb-p-badge").value = ""; }
  setCaption(true); paint();
}

export async function open() {
  collect();
  if (!ready) {
    ready = true;
    const sel = $("rb-p-pizza"); sel.innerHTML = "";
    menu.forEach((p, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = p.name + (p.price ? " · " + p.price : ""); sel.appendChild(o); });
    photoSel = (photos.find((p) => /DSC01412|DSC01358/.test(p.src)) || photos[0] || { src: "" }).src;
    buildPhotos();
    $("rb-p-type").addEventListener("change", onType);
    $("rb-p-pizza").addEventListener("change", () => { fillPizza(); setCaption(true); paint(); });
    ["rb-p-kicker", "rb-p-title", "rb-p-sub", "rb-p-badge", "rb-p-cta", "rb-p-fmt"].forEach((id) => $(id).addEventListener("input", paint));
    $("rb-p-cap").addEventListener("input", () => { capDirty = true; });
    $("rb-p-capreset").addEventListener("click", () => { setCaption(true); msg("Opis ułożony od nowa.", "ok"); });
    $("rb-p-file").addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      if (!/^image\//.test(f.type)) { msg("To nie jest zdjęcie. Wybierz plik JPG, PNG lub WebP.", "err"); e.target.value = ""; return; }
      try { customImg = await createImageBitmap(f, { imageOrientation: "from-image" }); }
      catch (_) { customImg = await loadImg(URL.createObjectURL(f)); }
      photoSel = "custom"; mark(); paint(); msg("Użyję Twojego zdjęcia: " + f.name, "ok");
    });
    $("rb-p-dl").addEventListener("click", async () => {
      await render($("rb-p-cv"), opts()); save(await toBlob($("rb-p-cv")), base() + "-" + FORMATS[$("rb-p-fmt").value][2] + ".png"); msg("Pobrano grafikę.", "ok");
    });
    $("rb-p-all").addEventListener("click", async () => {
      const cv = document.createElement("canvas"); const o = opts();
      for (const k of Object.keys(FORMATS)) { await render(cv, { ...o, fmt: FORMATS[k] }); save(await toBlob(cv), base() + "-" + FORMATS[k][2] + ".png"); await new Promise((r) => setTimeout(r, 500)); }
      msg("Pobrano 3 grafiki: post, relacja i kwadrat.", "ok");
    });
    $("rb-p-copy").addEventListener("click", async () => {
      const t = $("rb-p-cap").value;
      try { await navigator.clipboard.writeText(t); msg("Opis skopiowany. Wklej go przy poście.", "ok"); }
      catch (_) { const a = $("rb-p-cap"); a.select(); try { document.execCommand("copy"); msg("Opis skopiowany.", "ok"); } catch (__) { msg("Zaznacz opis i skopiuj go ręcznie.", "err"); } }
    });
    onType();
  } else { paint(); }
}
