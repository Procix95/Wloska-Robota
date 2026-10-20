/* =====================================================================
   Włoska Robota — STRAŻ (anty-nadużycia)
   Ten plik robi trzy rzeczy:
   1) Czujniki w przeglądarce klienta: zgłasza adminowi podejrzane zdarzenia ("flagi"), zapamiętuje losowy
      identyfikator urządzenia (żeby wykryć kilka kont z jednego telefonu), pilnuje skoków zegara.
   2) Interfejs zakładki „Straż” w panelu admina: flagi, urządzenia, punkty, obsługa, blokady, limity.
   3) Udostępnia stronie bardzo wąskie API: window.WRStraz.{report, isBlocked, open}.
   UWAGA: strona nie ma własnego serwera (plan Spark), więc TWARDE limity są w firestore.rules.
   Czujniki tutaj wykrywają i alarmują, ale nie są „nie do obejścia” — dlatego decyzję zawsze podejmuje admin.
   ===================================================================== */
import { getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, limit,
  serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const KIND_TXT = {
  console_award: ["Próba nadania sobie punktów z konsoli przeglądarki", "bad"],
  console_register: ["Próba wstrzyknięcia własnej gry z konsoli", "bad"],
  award_denied: ["Serwer odrzucił zapis punktów (limit lub reguły)", "warn"],
  award_fast: ["Punkty zażądane zbyt szybko po starcie gry", "warn"],
  ach_tamper: ["Zmienione osiągnięcia w Kopalni (podpis się nie zgadza)", "bad"],
  save_tamper: ["Zmieniony zapis świata w Kopalni (podpis się nie zgadza)", "bad"],
  bad_stats: ["Niemożliwe statystyki w Kopalni (np. za dużo dni jak na czas gry)", "warn"],
  clock: ["Nagły skok zegara urządzenia (możliwa zmiana daty)", "warn"]
};

let app = null, db = null, auth = null, me = null, admin = false, blockedNow = false, blockedChecked = false;
const sent = new Set();

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tsMs = (t) => (t && t.toMillis ? t.toMillis() : t && t.seconds ? t.seconds * 1000 : typeof t === "number" ? t : 0);
const ago = (ms) => {
  if (!ms) return "—";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "przed chwilą"; if (m < 60) return m + " min temu";
  if (m < 1440) return Math.round(m / 60) + " godz. temu";
  return Math.round(m / 1440) + " dn. temu";
};
const dt = (ms) => (ms ? new Date(ms).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

/* ---------- identyfikator urządzenia (losowy, bez odcisków sprzętu) ---------- */
function deviceId() {
  let v = null;
  try { v = localStorage.getItem("wr_dev"); } catch (e) { /* tryb prywatny */ }
  if (v && /^[a-z0-9]{12,40}$/.test(v)) return v;
  const a = new Uint8Array(12);
  try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
  v = Array.from(a, (b) => (b % 36).toString(36)).join("") + Date.now().toString(36);
  try { localStorage.setItem("wr_dev", v); } catch (e) { /* ignorujemy */ }
  return v;
}
async function rememberDevice(user) {
  try {
    const dev = deviceId(), ref = doc(db, "devices", user.uid), s = await getDoc(ref);
    if (!s.exists()) { await setDoc(ref, { uid: user.uid, email: user.email || "", devs: [dev], at: serverTimestamp() }); return; }
    const list = (s.data() || {}).devs || [];
    if (!list.includes(dev) && list.length < 5) await updateDoc(ref, { devs: arrayUnion(dev), at: serverTimestamp() });
  } catch (e) { /* bez uprawnień lub offline — nic się nie dzieje */ }
}
async function checkBlocked(user) {
  blockedChecked = false; blockedNow = false;
  try { const s = await getDoc(doc(db, "blocked", user.uid)); blockedNow = !!s.exists(); } catch (e) { blockedNow = false; }
  blockedChecked = true;
}

/* ---------- zgłaszanie zdarzeń (max 1 flaga danego rodzaju na dobę — pilnują tego reguły) ---------- */
async function report(kind, detail) {
  try {
    const u = auth && auth.currentUser;
    if (!u || !db || admin || sent.has(kind) || !KIND_TXT[kind]) return false;
    sent.add(kind);
    const d = new Date(), day = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    await setDoc(doc(db, "flags", u.uid + "_" + kind + "_" + day), { uid: u.uid, kind, detail: String(detail || "").slice(0, 240), at: serverTimestamp() });
    return true;
  } catch (e) { return false; }
}

/* ---------- czujnik zegara: skok daty/godziny w trakcie otwartej strony ---------- */
(function clockWatch() {
  let lp = performance.now(), ld = Date.now();
  setInterval(() => {
    const p = performance.now(), d = Date.now(), dp = p - lp, dd = d - ld; lp = p; ld = d;
    if (document.hidden || dp > 6000) return; /* uśpiona karta / telefon — pomijamy */
    if (Math.abs(dd - dp) > 5000) report("clock", "zegar przeskoczył o " + Math.round((dd - dp) / 1000) + " s");
  }, 2000);
})();

/* =====================  PANEL ADMINA  ===================== */
const DAY = 86400000;
const STAFF_STAMPS_24H = 12;      // więcej pieczątek od jednej osoby w dobę = alarm
const OPEN = { 3: [12, 20], 4: [12, 20], 5: [12, 20], 6: [14, 22], 0: [14, 22] }; // dzień tygodnia (0 = niedziela) → godziny otwarcia

function warsawParts(ms) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Warsaw", weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date(ms));
  const o = {}; f.forEach((p) => { o[p.type] = p.value; });
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday];
  return { wd, h: (parseInt(o.hour, 10) % 24) + parseInt(o.minute, 10) / 60 };
}
function outsideHours(ms) {
  const p = warsawParts(ms), h = OPEN[p.wd];
  return !h || p.h < h[0] - 1 || p.h > h[1] + 1; /* 1 godz. zapasu na sprzątanie / opóźnienia */
}

let D = null, loading = false, root = null;
const CSS = `
#rb-straz .sz-sec{margin:14px 0 6px;font-size:15px}
#rb-straz .sz-why{font-size:12.5px;color:var(--rb-muted);margin:0 0 8px;line-height:1.4}
#rb-straz .sz-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#rb-straz label.sz-f{display:block;font-size:13px;margin-bottom:8px}
#rb-straz label.sz-f select{width:100%;margin-top:4px}
#rb-straz .sz-ck{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;margin:8px 0}
#rb-straz .sz-ck input{margin-top:3px}
#rb-straz .sz-ok{color:#5fd38d;font-size:13.5px}
#rb-straz .rb-kcl .rb-badge{margin:0 0 0 6px}
`;
function injectCss() {
  if (document.getElementById("sz-css")) return;
  const s = document.createElement("style"); s.id = "sz-css"; s.textContent = CSS; document.head.appendChild(s);
}
const uname = (uid) => { const u = D.users.get(uid); return u ? (u.name || "(bez imienia)") + (u.email ? " · " + u.email : "") : "konto " + uid.slice(0, 6) + "… (usunięte?)"; };

async function fetchAll() {
  const col = async (name, ...c) => { try { return (await getDocs(c.length ? query(collection(db, name), ...c) : collection(db, name))).docs.map((d) => ({ id: d.id, ...d.data() })); } catch (e) { return null; } };
  const [users, flags, blocked, devices, points, logs] = await Promise.all([
    col("users"), col("flags", orderBy("at", "desc"), limit(100)), col("blocked"), col("devices"), col("points"), col("logs", orderBy("at", "desc"), limit(600))
  ]);
  let guard = {};
  try { const g = await getDoc(doc(db, "site", "guard")); if (g.exists()) guard = g.data() || {}; } catch (e) { /* brak = domyślne */ }
  /* konto admina (to, na którym jesteś zalogowany) pomijamy — jego własne testy i pieczątki nie są „nadużyciem” */
  const mine = new Set(me ? [me.uid] : []), myMail = me && me.email ? String(me.email).toLowerCase() : "", myName = me && me.displayName ? me.displayName : "";
  (users || []).forEach((u) => { if (myMail && u.email && String(u.email).toLowerCase() === myMail) mine.add(u.id); });
  const notMe = (uid) => !mine.has(uid);
  return {
    users: new Map((users || []).map((u) => [u.id, u])), flags: (flags || []).filter((f) => notMe(f.uid)), blocked: blocked || [],
    devices: (devices || []).filter((d) => notMe(d.id)), points: (points || []).filter((p) => notMe(p.id)), logs: (logs || []).filter((l) => notMe(l.byUid) && !(myName && l.byName === myName)), guard, ok: { users: !!users, flags: !!flags, devices: !!devices, points: !!points, logs: !!logs, blocked: !!blocked }
  };
}

function analyze() {
  const blockedSet = new Set(D.blocked.map((b) => b.id));
  /* kilka kont z jednego urządzenia */
  const byDev = new Map();
  D.devices.forEach((r) => (r.devs || []).forEach((dv) => { if (!byDev.has(dv)) byDev.set(dv, new Set()); byDev.get(dv).add(r.id); }));
  const seen = new Set(), multi = [];
  byDev.forEach((set) => {
    if (set.size < 2) return;
    const key = Array.from(set).sort().join("|"); if (seen.has(key)) return; seen.add(key);
    multi.push(Array.from(set));
  });
  /* podejrzane punkty */
  const now = Date.now(), cap = Number(D.guard.ptsDayMax) || 8, pts = [];
  D.points.forEach((p) => {
    const created = tsMs(p.createdAt), age = created ? Math.max(1, (now - created) / DAY) : 1, rate = (p.total || 0) / age, why = [];
    if ((p.total || 0) >= 8 && rate > cap * 0.6) why.push("zdobywa prawie maksimum każdego dnia (" + rate.toFixed(1) + " pkt/dobę)");
    if ((p.redeemN || 0) >= 1 && age < 20) why.push("wymiana na rabat po " + Math.round(age) + " dniach od założenia");
    if ((p.redeemN || 0) >= 3) why.push("wymieniał(a) punkty " + p.redeemN + " razy");
    if (why.length) pts.push({ uid: p.id, total: p.total || 0, points: p.points || 0, why });
  });
  pts.sort((a, b) => b.total - a.total);
  /* obsługa: pieczątki, anulowania, nagrody, godziny */
  const staff = new Map();
  D.logs.forEach((l) => {
    const at = tsMs(l.at); if (!at) return;
    const s = staff.get(l.byUid) || { uid: l.byUid, name: l.byName || "?", st24: 0, unst7: 0, rew7: 0, off: 0, offAt: 0 };
    if (l.type === "stamp") {
      if (now - at < DAY) s.st24++;
      if (outsideHours(at)) { s.off++; if (!s.offAt) s.offAt = at; }
    }
    if (l.type === "unstamp" && now - at < 7 * DAY) s.unst7++;
    if (l.type === "reward" && now - at < 7 * DAY) s.rew7++;
    staff.set(l.byUid, s);
  });
  const staffAlerts = [];
  staff.forEach((s) => {
    const why = [];
    if (s.st24 > STAFF_STAMPS_24H) why.push(s.st24 + " pieczątek w ostatniej dobie (próg " + STAFF_STAMPS_24H + ")");
    if (s.off > 0) why.push(s.off + " pieczątek poza godzinami otwarcia (ostatnio " + dt(s.offAt) + ")");
    if (s.unst7 >= 3) why.push(s.unst7 + " cofnięć pieczątki w 7 dni");
    if (s.rew7 >= 3) why.push(s.rew7 + " wydań pizzy gratis w 7 dni");
    if (why.length) staffAlerts.push({ ...s, why });
  });
  return { blockedSet, multi, pts, staffAlerts };
}

function box(title, why, html) { return `<h4 class="sz-sec">${title}</h4>${why ? `<p class="sz-why">${why}</p>` : ""}${html}`; }
function tile(n, label, bad) { return `<div class="rb-stat"><b${bad && n ? ' style="color:#ff8c8c"' : ""}>${n}</b><span>${label}</span></div>`; }

function render() {
  if (!root) return;
  if (!D) { root.innerHTML = '<div class="rb-empty">Wczytuję dane Straży…</div>'; return; }
  const A = D.an = analyze();
  const miss = Object.entries(D.ok).filter(([, v]) => !v).map(([k]) => k);
  let h = "";
  if (miss.length) h += `<div class="rb-msg err" style="display:block">Nie udało się wczytać: ${esc(miss.join(", "))}. Opublikuj nowe reguły Firestore (firestore.rules) i kliknij Odśwież.</div>`;
  h += `<div class="rb-stats">${tile(D.flags.length, "flagi do sprawdzenia", 1)}${tile(D.blocked.length, "zablokowane konta")}${tile(A.multi.length, "grupy kont z 1 urządzenia", 1)}${tile(A.staffAlerts.length, "alarmy obsługi", 1)}${tile(A.pts.length, "podejrzane punkty", 1)}</div>`;

  /* flagi */
  h += box("🚩 Flagi z przeglądarek klientów", "Zgłoszenia automatyczne. Flaga to sygnał, nie wyrok — sprawdź kto i co, dopiero potem decyduj.",
    D.flags.length ? D.flags.map((f) => {
      const k = KIND_TXT[f.kind] || [f.kind, "warn"], isB = A.blockedSet.has(f.uid);
      return `<div class="rb-kcl"><div><b>${esc(uname(f.uid))}</b><span class="rb-badge ${k[1]}">${esc(k[0])}</span>${isB ? '<span class="rb-badge bad">zablokowany</span>' : ""}</div>
        <div class="rb-meta">${dt(tsMs(f.at))} (${ago(tsMs(f.at))})${f.detail ? " · " + esc(f.detail) : ""}</div>
        <div class="rb-actions"><button type="button" class="rb-btn secondary small" data-sz="ok" data-id="${esc(f.id)}">✔ Sprawdzone (usuń)</button>
        ${isB ? "" : `<button type="button" class="rb-btn small" data-sz="block" data-uid="${esc(f.uid)}">⛔ Zablokuj konto</button>`}</div></div>`;
    }).join("") : '<div class="rb-empty">Brak flag — spokój. ✅</div>');

  /* urządzenia */
  h += box("📱 Kilka kont z jednego urządzenia", "Ten sam telefon/przeglądarka użyty do kilku kont. Czasem to rodzina — ale też sposób na wielokrotny kod powitalny −5 zł lub polecanie samego siebie. Wykrywa tylko konta zakładane po wdrożeniu Straży.",
    A.multi.length ? A.multi.map((g) => `<div class="rb-kcl"><div class="rb-dup">⚠️ ${g.length} konta na jednym urządzeniu</div>${g.map((u) => `<div class="rb-meta">• ${esc(uname(u))}${A.blockedSet.has(u) ? ' <span class="rb-badge bad">zablokowany</span>' : ""}${D.users.get(u) && D.users.get(u).createdAt ? " · założone " + dt(tsMs(D.users.get(u).createdAt)) : ""} ${A.blockedSet.has(u) ? "" : `<button type="button" class="rb-btn secondary small" data-sz="block" data-uid="${esc(u)}" style="margin-left:6px">⛔</button>`}</div>`).join("")}</div>`).join("")
      : '<div class="rb-empty">Nic podejrzanego.</div>');

  /* punkty */
  h += box("🎯 Podejrzane punkty z gier", "Konta, które zbierają punkty prawie zawsze do dziennego maksimum albo wymieniają je bardzo szybko.",
    A.pts.length ? A.pts.slice(0, 15).map((p) => `<div class="rb-kcl"><div><b>${esc(uname(p.uid))}</b><span class="rb-badge warn">${p.total} pkt łącznie</span>${A.blockedSet.has(p.uid) ? '<span class="rb-badge bad">zablokowany</span>' : ""}</div>
      ${p.why.map((w) => `<div class="rb-meta">• ${esc(w)}</div>`).join("")}
      ${A.blockedSet.has(p.uid) ? "" : `<div class="rb-actions"><button type="button" class="rb-btn small" data-sz="block" data-uid="${esc(p.uid)}">⛔ Zablokuj konto</button></div>`}</div>`).join("")
      : '<div class="rb-empty">Brak podejrzanych kont.</div>');

  /* obsługa */
  h += box("🧑‍🍳 Kontrola obsługi (pieczątki i nagrody)", `Na podstawie ostatnich ${D.logs.length} wpisów dziennika. Pilnuje: zbyt wielu pieczątek na dobę, pieczątek poza godzinami otwarcia (Śr–Pt 12–20, Sob–Nd 14–22), częstych cofnięć i wydań pizzy gratis.`,
    A.staffAlerts.length ? A.staffAlerts.map((s) => `<div class="rb-kcl"><div><b>${esc(s.name)}</b><span class="rb-badge warn">do sprawdzenia</span></div>${s.why.map((w) => `<div class="rb-meta">• ${esc(w)}</div>`).join("")}</div>`).join("")
      : '<div class="rb-empty">Wszystko w normie.</div>');

  /* blokady */
  h += box("⛔ Zablokowane konta", "Zablokowane konto nie zdobywa punktów, nie wymienia ich i nie tworzy nowych kodów rabatowych (pilnują tego reguły Firestore). Może się dalej logować i ma stare kody — pełne zablokowanie logowania zrobisz w Firebase → Authentication → konto → „Wyłącz”.",
    D.blocked.length ? D.blocked.map((b) => `<div class="rb-kcl"><div><b>${esc(uname(b.id))}</b></div><div class="rb-meta">od ${dt(tsMs(b.at))}${b.reason ? " · " + esc(b.reason) : ""}</div>
      <div class="rb-actions"><button type="button" class="rb-btn secondary small" data-sz="unblock" data-uid="${esc(b.id)}">Odblokuj</button></div></div>`).join("") : '<div class="rb-empty">Brak zablokowanych kont.</div>');

  /* limity */
  const g = D.guard, dayMax = Number(g.ptsDayMax) || 8, gap = Number(g.ptsGapSec) || 30;
  const opt = (v, cur, txt) => `<option value="${v}"${Number(cur) === v ? " selected" : ""}>${txt}</option>`;
  h += box("⚙️ Twarde limity punktów (egzekwuje serwer Google)", "Te liczby sprawdza Firestore przy każdym zapisie punktów — nie da się ich obejść z przeglądarki. Zalecane: 3 pkt na dobę, 10 min odstępu i punkty tylko dla klientów po pierwszej pieczątce.",
    `<div class="sz-grid"><label class="sz-f">Maks. punktów na dobę<select id="sz-daymax">${[1, 2, 3, 4, 5, 6, 8].map((n) => opt(n, dayMax, n + " pkt")).join("")}</select></label>
     <label class="sz-f">Min. odstęp między nagrodami<select id="sz-gap">${opt(30, gap, "30 sekund")}${opt(300, gap, "5 minut")}${opt(600, gap, "10 minut")}${opt(1800, gap, "30 minut")}${opt(3600, gap, "1 godzina")}</select></label></div>
     <label class="sz-ck"><input type="checkbox" id="sz-needstamp"${g.needStamp ? " checked" : ""}><span>Punkty tylko dla klientów, którzy mają już co najmniej 1 pieczątkę (blokuje farmienie punktów na fałszywych kontach)</span></label>
     <div class="rb-actions"><button type="button" class="rb-btn small" data-sz="saveguard">Zapisz limity</button></div><div class="rb-msg" id="sz-msg" role="status"></div>`);
  root.innerHTML = h;
  root.insertAdjacentHTML("beforeend", '<p class="sz-why" style="margin-top:14px">🛡️ Ochrona przed botami (App Check + reCAPTCHA v3): <b>kod strony jest podpięty</b>. Zostało jedno kliknięcie w Firebase: App Check → Cloud Firestore → <b>Egzekwuj</b> — zrób to dopiero po kilku dniach, gdy prawie cały ruch jest tam widoczny jako „zweryfikowany”. Do tego czasu App Check tylko zbiera statystyki i niczego nie blokuje.</p><p class="sz-why">Straż v4 · konta admina (' + esc(me ? me.email || me.uid : "") + ') są pomijane w analizie.</p>');
  const badge = document.getElementById("rb-straz-badge");
  if (badge) { const n = D.flags.length + A.staffAlerts.length; badge.textContent = n > 9 ? "9+" : String(n); badge.hidden = !n; }
}

async function load() {
  if (loading || !admin) return; loading = true;
  render();
  try { D = await fetchAll(); } catch (e) { D = null; }
  loading = false;
  if (!D) { if (root) root.innerHTML = '<div class="rb-msg err" style="display:block">Nie udało się wczytać Straży.</div>'; return; }
  render();
}

async function onClick(e) {
  const b = e.target.closest("[data-sz]"); if (!b || !D) return;
  const act = b.dataset.sz, msg = () => document.getElementById("sz-msg");
  b.disabled = true;
  try {
    if (act === "ok") { await deleteDoc(doc(db, "flags", b.dataset.id)); D.flags = D.flags.filter((f) => f.id !== b.dataset.id); render(); return; }
    if (act === "block") {
      const uid = b.dataset.uid;
      if (!confirm("Zablokować konto: " + uname(uid) + "?\nPrzestanie zdobywać punkty i tworzyć nowe kody rabatowe.")) { b.disabled = false; return; }
      const zero = confirm("Wyzerować mu też saldo punktów z gier?\nOK = wyzeruj, Anuluj = zostaw punkty.");
      await setDoc(doc(db, "blocked", uid), { uid, at: serverTimestamp(), byUid: me ? me.uid : "", reason: "ręcznie z panelu Straż" });
      if (zero) { try { await updateDoc(doc(db, "points", uid), { points: 0 }); } catch (er) { /* brak konta punktów */ } }
      D.blocked.push({ id: uid, at: Date.now(), reason: "ręcznie z panelu Straż" }); render(); return;
    }
    if (act === "unblock") { await deleteDoc(doc(db, "blocked", b.dataset.uid)); D.blocked = D.blocked.filter((x) => x.id !== b.dataset.uid); render(); return; }
    if (act === "saveguard") {
      const dayMax = parseInt(document.getElementById("sz-daymax").value, 10), gap = parseInt(document.getElementById("sz-gap").value, 10), needStamp = document.getElementById("sz-needstamp").checked;
      if (!(dayMax >= 1 && dayMax <= 8) || !(gap >= 30 && gap <= 3600)) { const m = msg(); if (m) { m.textContent = "Nieprawidłowe wartości."; m.className = "rb-msg err"; } b.disabled = false; return; }
      await setDoc(doc(db, "site", "guard"), { ptsDayMax: dayMax, ptsGapSec: gap, needStamp }, { merge: true });
      D.guard = { ...D.guard, ptsDayMax: dayMax, ptsGapSec: gap, needStamp };
      const m = msg(); if (m) { m.textContent = "Zapisano. Limity działają od razu."; m.className = "rb-msg ok"; }
    }
  } catch (err) {
    const m = msg(); if (m) { m.textContent = "Nie udało się: " + (err && (err.code || err.message) || "błąd"); m.className = "rb-msg err"; }
  }
  b.disabled = false;
}

function mountPane() {
  root = document.getElementById("rb-straz");
  if (root && !root.__sz) { root.__sz = 1; root.addEventListener("click", onClick); }
  injectCss();
}

/* ---------- start ---------- */
async function onUser(user) {
  me = user; admin = false;
  const tab = document.getElementById("rb-straz-tab");
  if (tab) tab.hidden = true;
  if (!user) { blockedNow = false; blockedChecked = true; return; }
  checkBlocked(user);
  try { const a = await getDoc(doc(db, "admins", user.uid)); admin = !!(a && a.exists()); } catch (e) { admin = false; }
  if (!admin) rememberDevice(user);
  if (admin) {
    if (tab) tab.hidden = false;
    mountPane();
    try { const f = await getDocs(query(collection(db, "flags"), orderBy("at", "desc"), limit(50))); const n = f.docs.filter((x) => (x.data() || {}).uid !== user.uid).length, /* dokładne filtrowanie po mailu robi pełny widok */ b = document.getElementById("rb-straz-badge"); if (b) { b.textContent = n > 9 ? "9+" : String(n); b.hidden = !n; } } catch (e) { /* reguły jeszcze niewgrane */ }
  }
}

function boot(tries) {
  try { app = getApp(); } catch (e) { app = null; }
  if (!app) { if ((tries || 0) < 80) setTimeout(() => boot((tries || 0) + 1), 150); return; }
  db = getFirestore(app); auth = getAuth(app);
  onAuthStateChanged(auth, onUser);
}
boot(0);

const API = {
  report,
  open() { mountPane(); D = null; load(); },
  async isBlocked() { for (let i = 0; i < 20 && !blockedChecked; i++) await new Promise((r) => setTimeout(r, 100)); return blockedNow; },
  version: 4
};
Object.defineProperty(window, "WRStraz", { value: Object.freeze(API), writable: false, configurable: false });
