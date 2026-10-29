import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, signInWithCredential, GoogleAuthProvider, signOut, sendPasswordResetEmail, sendEmailVerification, updateProfile,
  deleteUser, reauthenticateWithPopup, reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, writeBatch, runTransaction, getDocs, orderBy, limit, increment, documentId
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* ▼▼▼ WKLEJ TUTAJ SWOJĄ KONFIGURACJĘ Z FIREBASE (Ustawienia projektu → Twoje aplikacje) ▼▼▼ */
const firebaseConfig = {
  apiKey: "AIzaSyDoqjW1vcVdcDh_zEhrI3s6jLxINedh8G0",
  authDomain: "wloskarobota-4c044.firebaseapp.com",
  projectId: "wloskarobota-4c044",
  storageBucket: "wloskarobota-4c044.firebasestorage.app",
  messagingSenderId: "304699522128",
  appId: "1:304699522128:web:eb35d88706ef3a6f6a6555",
  measurementId: "G-2VZPB4ZEH3"
};
/* ▲▲▲ */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = "pl";
const db = getFirestore(app);

/* ---------- pomocnicze ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (ts) => (ts && ts.toDate ? ts.toDate().toLocaleDateString("pl-PL") : "");

const ERR = {
  "auth/invalid-email": "Niepoprawny adres e-mail.",
  "auth/missing-password": "Wpisz hasło.",
  "auth/weak-password": "Hasło jest za słabe (min. 6 znaków).",
  "auth/email-already-in-use": "Konto z tym adresem e-mail już istnieje.",
  "auth/invalid-credential": "Błędny e-mail lub hasło.",
  "auth/wrong-password": "Błędny e-mail lub hasło.",
  "auth/user-not-found": "Błędny e-mail lub hasło.",
  "auth/too-many-requests": "Za dużo prób. Spróbuj ponownie za chwilę.",
  "auth/network-request-failed": "Brak połączenia z internetem.",
  "auth/popup-blocked": "Przeglądarka zablokowała okno logowania Google. Zezwól na wyskakujące okna.",
  "auth/popup-closed-by-user": "",
  "auth/cancelled-popup-request": "",
  "auth/account-exists-with-different-credential": "Konto z tym e-mailem istnieje już z innym sposobem logowania.",
  "auth/operation-not-allowed": "Logowanie Google nie jest włączone w Firebase (Authentication → Sign-in method → Google → Enable).",
  "auth/unauthorized-domain": "Ta domena nie jest dodana w Firebase (Authentication → Settings → Authorized domains).",
  "auth/configuration-not-found": "W Firebase kliknij najpierw „Get started” w zakładce Authentication.",
  "auth/invalid-api-key": "Błędny klucz API w index.html (firebaseConfig).",
  "auth/api-key-not-valid": "Błędny klucz API w index.html (firebaseConfig).",
  "permission-denied": "Brak uprawnień do tej operacji."
};
const errText = (e) => {
  if (e && e.code in ERR) return ERR[e.code];
  return "Coś poszło nie tak (" + ((e && (e.code || e.message)) || "nieznany błąd") + ").";
};
function setMsg(el, text, type) { el.textContent = text || ""; el.className = "rb-msg" + (type ? " " + type : ""); }

/* ---------- otwieranie / zamykanie zakładki ---------- */
const overlay = $("rabat-overlay");
function openRabat() {
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
  if (location.hash !== "#konto") history.replaceState(null, "", "#konto");
}
function closeRabat() {
  stopScanner();
  overlay.classList.remove("open");
  delete overlay.dataset.games; wantGames = false;
  document.body.style.overflow = "";
  if (location.hash === "#konto") history.replaceState(null, "", location.pathname + location.search);
}
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href="#konto"], [data-open-rabat]');
  if (a) { e.preventDefault(); openRabat(); }
  const g = e.target.closest('a[href="#gry"], [data-open-games]');
  if (g) { e.preventDefault(); openGames(); }
});
/* „Gry” w menu: otwiera Konto i pokazuje kartę gier (po zalogowaniu przewija do niej, bez logowania prosi o konto) */
let wantGames = false;
function focusGames() {
  const box = document.getElementById("rb-games");
  if (box && !box.hidden && box.offsetParent !== null) {
    box.scrollIntoView({ behavior: "smooth", block: "center" });
    box.classList.remove("flash"); void box.offsetWidth; box.classList.add("flash");
    wantGames = false;
  }
}
function openGames() { wantGames = true; overlay.dataset.games = "1"; openRabat(); setTimeout(focusGames, 150); }
$("rb-close").addEventListener("click", closeRabat);
overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeRabat(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("open")) closeRabat(); });
window.addEventListener("hashchange", () => { if (location.hash === "#konto") openRabat(); else if (location.hash === "#gry") openGames(); });
const QS = new URLSearchParams(location.search);
let wantScan = QS.has("skan");
if (location.hash === "#konto" || QS.has("konto") || wantScan) openRabat();
if (location.hash === "#gry" || QS.has("gry")) openGames();

/* ---------- logowanie / rejestracja ---------- */
let mode = "login";
let registering = false;
const authMsg = $("rb-auth-msg");

function setMode(m) {
  mode = m;
  document.querySelectorAll("#rabat-overlay .rb-tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
  $("rb-name").hidden = m !== "register";
  $("rb-reset").hidden = m !== "login";
  $("rb-submit").textContent = m === "register" ? "Załóż konto" : "Zaloguj się";
  $("rb-pass").autocomplete = m === "register" ? "new-password" : "current-password";
  setMsg(authMsg, "");
}
document.querySelectorAll("#rabat-overlay .rb-tab").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
setMode("login");

$("rb-eye").addEventListener("click", () => {
  const p = $("rb-pass");
  const show = p.type === "password";
  p.type = show ? "text" : "password";
  $("rb-eye").textContent = show ? "🙈" : "👁";
  $("rb-eye").setAttribute("aria-label", show ? "Ukryj hasło" : "Pokaż hasło");
});

$("rb-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("rb-email").value.trim();
  const pass = $("rb-pass").value;
  const name = $("rb-name").value.trim();
  setMsg(authMsg, "");
  if (!email || !pass) { setMsg(authMsg, "Wpisz e-mail i hasło.", "err"); return; }
  const wasRegister = mode === "register";
  try {
    if (wasRegister) {
      registering = true;
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (name) await updateProfile(cred.user, { displayName: name });
      try { await sendEmailVerification(cred.user); } catch (_) { /* nieistotne */ }
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch (err) {
    setMsg(authMsg, errText(err), "err");
  } finally {
    if (wasRegister) {
      registering = false;
      if (auth.currentUser) handleUser(auth.currentUser);
    }
  }
});

/* Logowanie Google przez Google Identity Services: okno Google pokazuje wtedy adres strony (wloskarobota.eu),
   a nie wloskarobota-4c044.firebaseapp.com. Działa, gdy wpiszesz poniżej identyfikator klienta (patrz instrukcja).
   Gdy pole jest puste albo skrypt Google się nie wczyta, przycisk „Kontynuuj z Google” działa po staremu. */
const GOOGLE_CLIENT_ID = "304699522128-tap3upslskh66l3288aen46mkn5e53rk.apps.googleusercontent.com";
let gsiTried = false;
function loadGsi() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.id) return resolve();
    const sc = document.createElement("script");
    const t = setTimeout(() => reject(new Error("timeout")), 8000);
    sc.src = "https://accounts.google.com/gsi/client";
    sc.async = true;
    sc.onload = () => { clearTimeout(t); resolve(); };
    sc.onerror = () => { clearTimeout(t); reject(new Error("load")); };
    document.head.appendChild(sc);
  });
}
async function onGsiCredential(resp) {
  setMsg(authMsg, "");
  try { await signInWithCredential(auth, GoogleAuthProvider.credential(resp.credential)); }
  catch (err) { console.error("Rabat Google (GIS):", err); setMsg(authMsg, errText(err), "err"); }
}
async function initGoogleButton() {
  if (gsiTried || !GOOGLE_CLIENT_ID) return;
  gsiTried = true;
  try {
    await loadGsi();
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGsiCredential, ux_mode: "popup", auto_select: false });
    google.accounts.id.renderButton($("rb-gsi"), {
      type: "standard", theme: document.body.classList.contains("dark") ? "filled_black" : "outline",
      size: "large", text: "continue_with", shape: "rectangular", locale: "pl",
      width: Math.max(200, Math.min(400, $("rb-auth").clientWidth || 320))
    });
    $("rb-gsi").hidden = false;
    $("rb-google").hidden = true;
  } catch (err) {
    console.warn("Google Identity Services niedostępne, używam zwykłego logowania:", err && err.message);
    gsiTried = false;
  }
}

$("rb-google").addEventListener("click", async () => {
  setMsg(authMsg, "");
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (err) { console.error("Rabat Google:", err); setMsg(authMsg, errText(err), "err"); }
});

$("rb-reset").addEventListener("click", async () => {
  const email = $("rb-email").value.trim();
  if (!email) { setMsg(authMsg, "Wpisz swój e-mail w polu powyżej.", "err"); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    setMsg(authMsg, "Jeśli konto istnieje, wysłaliśmy link do zmiany hasła.", "ok");
  } catch (err) { setMsg(authMsg, errText(err), "err"); }
});

$("rb-logout").addEventListener("click", () => signOut(auth));

/* ---------- usuwanie konta ---------- */
$("rb-delete").addEventListener("click", async () => {
  const msg = $("rb-del-msg");
  setMsg(msg, "");
  const user = auth.currentUser;
  if (!user) return;
  if (!confirm("Usunąć konto?\n\nTrwale usuniemy Twoje konto, kartę lojalnościową z pieczątkami i wszystkie kody rabatowe. Tej operacji nie można cofnąć.")) return;
  try {
    // 1) ponowne potwierdzenie tożsamości (wymóg Firebase)
    if (user.providerData.some((p) => p.providerId === "google.com")) {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    } else {
      const pass = prompt("Podaj hasło, aby potwierdzić usunięcie konta:");
      if (!pass) return;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pass));
    }
    // 2) prośba o usunięcie danych (administrator czyści bazę przy najbliższym wejściu w panel)
    await setDoc(doc(db, "deletionRequests", user.uid), { email: user.email || "", requestedAt: serverTimestamp() });
    // 3) usunięcie konta logowania
    await deleteUser(user);
  } catch (err) {
    console.error(err);
    setMsg(msg, errText(err), "err");
  }
});

/* ---------- stan aplikacji ---------- */
let unsubs = [];
let isAdmin = false;
let isStaff = false;
let myLoyal = null;
let svVisit = 0, svRating = 0, svDoneFor = 0;
let custView = null;
const LOYAL_GOAL = 10;        // tyle pieczątek = pizza gratis (to samo w firestore.rules)
const STAMP_COOLDOWN_H = 2;   // min. odstęp między pieczątkami (to samo w firestore.rules)
let allStaff = [];
let staffFound = [];
let myCoupons = [];
let allUsers = [];
let allCoupons = [];
let allTemplates = [];
let allPromos = [];
let myProfile = null, couponsReady = false, bdayTried = false;
let refBusy = false, refFail = false, lvUp = null;
const refNames = {};
let selTpl = {};
let lastCheck = "";

function cleanup() {
  stopScanner();
  unsubs.forEach((u) => { try { u(); } catch (_) {} });
  unsubs = [];
  isAdmin = false; try { applyPhotos(); } catch (_) {} isStaff = false; allStaff = []; staffFound = []; myLoyal = null; custView = null; myCoupons = []; allUsers = []; allCoupons = []; allTemplates = []; lastCheck = ""; svVisit = 0; svRating = 0; svDoneFor = 0; myProfile = null; couponsReady = false; bdayTried = false;
  if ($("rb-bday-set")) delete $("rb-bday-set").dataset.filled;
  allLoyal = []; allPromos = []; dataAt = 0; welcomeMigrated = false; reportEvents = []; feedbackItems = []; kShown = KPAGE;
  if ($("rb-k-card")) $("rb-k-card").innerHTML = "";
  scanHist = []; statsEvents = null; visitDocs = null; myPoints = null; ptsUser = null; if ($("rb-games")) $("rb-games").hidden = true; if ($("rb-s-hist")) $("rb-s-hist").innerHTML = "";
}
function showOnly(which) {
  $("rb-loading").hidden = which !== "loading";
  $("rb-gate").hidden = which !== "gate";
  $("rb-auth").hidden = which !== "auth";
  $("rb-user").hidden = which !== "user";
  if (which === "auth") initGoogleButton();
}

let visitCounted = false;
onAuthStateChanged(auth, async (user) => {
  try { if (!registering) await handleUser(user); } finally { if (!visitCounted) { visitCounted = true; countVisit(); } }
});

const withTimeout = (p, ms = 12000) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: "timeout" }), ms))]);

const WELCOME_DESC = "-5 zł na zamówienie (kod powitalny)";

/* Kod powitalny jest ważny miesiąc od założenia konta (do końca dnia). 31 stycznia + miesiąc = koniec lutego. */
function welcomeExpiry(fromMs) {
  const d = new Date(fromMs);
  const day = d.getDate();
  d.setMonth(d.getMonth() + 1);
  if (d.getDate() !== day) d.setDate(0);
  d.setHours(23, 59, 59, 0);
  return Timestamp.fromDate(d);
}

/* Tworzy profil klienta. Przy pierwszym logowaniu dodaje w tej samej operacji kod powitalny -5 zł.
   Zwraca true, gdy kod powitalny został przyznany. */
async function ensureProfile(user) {
  const uref = doc(db, "users", user.uid);
  const snap = await withTimeout(getDoc(uref));
  if (snap.exists()) return false;
  const profile = { email: user.email || "", name: user.displayName || "", createdAt: serverTimestamp() };
  const batch = writeBatch(db);
  batch.set(uref, profile);
  batch.set(doc(db, "coupons", "welcome_" + user.uid), {
    uid: user.uid,
    userEmail: user.email || "",
    code: "WITAJ5-" + user.uid.slice(0, 6).toUpperCase(),
    description: WELCOME_DESC,
    expiresAt: welcomeExpiry(Date.now()),
    used: false,
    createdAt: serverTimestamp()
  });
  try {
    await withTimeout(batch.commit());
    return true;
  } catch (err) {
    // np. reguły jeszcze nieopublikowane: konto ma się założyć mimo to
    console.warn("Kod powitalny nie został utworzony:", err && (err.code || err.message));
    const again = await withTimeout(getDoc(uref));
    if (!again.exists()) await withTimeout(setDoc(uref, profile));
    return false;
  }
}

/* ---------- gry i punkty (szkielet; limity są też w firestore.rules) ---------- */
const PTS_COST = 100;          // tyle punktów = rabat -5 zł
let PTS_DAY_CAP = 8;           // maks. punktów na dobę (doba UTC) — nadpisywane przez site/guard (panel Straż)
const PTS_MAX_AWARD = 3;       // maks. punktów za jedną nagrodę
let PTS_COOLDOWN_MS = 30000;   // odstęp między nagrodami — nadpisywane przez site/guard
let PTS_NEED_STAMP = false;    // true = punkty tylko dla klientów z min. 1 pieczątką (site/guard)
let ptsGuardAt = 0;
const MIN_PLAY_S = { memory: 45, quiz: 60, arcade: 45 }; // najkrótszy sensowny czas od startu gry do pierwszej nagrody
const gameStartAt = {};
async function loadGuard(force) {
  if (!force && Date.now() - ptsGuardAt < 300000) return;
  ptsGuardAt = Date.now();
  try {
    const s = await withTimeout(getDoc(doc(db, "site", "guard")));
    const g = s.exists() ? s.data() : {};
    PTS_DAY_CAP = Math.min(8, Math.max(1, Math.floor(Number(g.ptsDayMax) || 8)));
    PTS_COOLDOWN_MS = Math.min(3600, Math.max(30, Math.floor(Number(g.ptsGapSec) || 30))) * 1000;
    PTS_NEED_STAMP = !!g.needStamp;
  } catch (e) { /* zostają wartości domyślne */ }
}
const PTS_REWARD_DESC = "Rabat -5 zł na zamówienie (za punkty z gier)";
let myPoints = null, ptsUser = null;
const GAMES = [
  { id: "memory", icon: "🃏", name: "Memory z pizzami", desc: "Znajdź pary i zbieraj punkty", soon: true },
  { id: "quiz", icon: "❓", name: "Quiz o pizzy", desc: "Odpowiadaj i zbieraj punkty", soon: true }
];
const utcDay = (ms) => Math.floor(ms / 86400000);
function ptsToday() {
  if (!myPoints) return 0;
  const t = tsMs(myPoints.lastAt);
  return t && utcDay(t) === utcDay(Date.now()) ? (myPoints.dayPts || 0) : 0;
}
async function ensurePoints(user) {
  await loadGuard(true);
  const ref = doc(db, "points", user.uid);
  const snap = await withTimeout(getDoc(ref));
  if (snap.exists()) return;
  await withTimeout(setDoc(ref, { points: 0, total: 0, dayPts: 0, redeemN: 0, lastAt: null, createdAt: serverTimestamp() }));
}
function renderGames() {
  const box = $("rb-games");
  /* Gry widzi każdy zalogowany (klient, obsługa, admin); obsługa gra próbnie, bez punktów */
  if (!ptsUser && !isStaff) { box.hidden = true; return; }
  if (!isStaff && !myPoints) { box.hidden = true; return; }
  box.hidden = false;
  loadGamesScript();
  if (isStaff) {
    $("rb-pts-n").textContent = "tryb próbny";
    $("rb-pts-fill").style.width = "0%";
    $("rb-pts-txt").textContent = "Konto obsługi nie zbiera punktów — grasz próbnie.";
    $("rb-pts-test").hidden = true; $("rb-pts-redeem").hidden = true;
    $("rb-game-list").innerHTML = gameRows();
    $("rb-scratch").hidden = true;
    return;
  }
  $("rb-pts-redeem").hidden = false;
  const p = myPoints.points || 0, today = ptsToday();
  $("rb-pts-n").textContent = p + " pkt";
  $("rb-pts-fill").style.width = Math.min(100, Math.round(p / PTS_COST * 100)) + "%";
  $("rb-pts-txt").textContent = (p >= PTS_COST ? "Masz dość punktów na rabat −5 zł!" : "Do rabatu −5 zł brakuje " + (PTS_COST - p) + " pkt.") +
    " Dziś zdobyto " + today + " z " + PTS_DAY_CAP + " pkt (dzienny limit)." +
    (PTS_NEED_STAMP && !(myLoyal && (myLoyal.total || 0) >= 1) ? " Punkty zaczniesz zbierać po pierwszej pieczątce na karcie lojalnościowej." : "");
  $("rb-pts-test").hidden = !isAdmin;
  $("rb-pts-redeem").disabled = p < PTS_COST;
  $("rb-pts-redeem").textContent = "Wymień " + PTS_COST + " pkt na rabat −5 zł";
  $("rb-game-list").innerHTML = gameRows();
  try { renderScratch(); } catch (e) { console.warn(e); }
}
function gameRows() {
  return GAMES.map((g) =>
    `<div class="rb-game${g.start ? "" : " soon"}"><span class="ic">${g.icon || "🎮"}</span><div class="tx"><b>${esc(g.name)}</b><small>${esc(g.desc || "")}</small></div>` +
    (g.start ? `<button type="button" class="rb-btn small" data-play="${esc(g.id)}">Graj</button>` : '<small>Wkrótce</small>') + "</div>").join("");
}
let gamesScriptReq = false;
function loadGamesScript() {
  if (gamesScriptReq) return; gamesScriptReq = true;
  ["/gry.js?v=3", "/gry-pou.js?v=2", "/gry-kopalnia.js?v=6"].forEach((src) => {
    const sc = document.createElement("script"); sc.src = src; sc.async = true;
    document.head.appendChild(sc);
  });
}
/* ---------- zdrapka dnia (raz na dobę, 1–3 pkt, poza dziennym limitem z gier) ---------- */
let scSt = { day: 0, uid: "", doc: undefined, prize: 0, busy: false, drawn: false };
const scDay = () => { const t = new Date(Date.now() + 2 * 3600e3); return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate(); };
const scPrize = () => { const r = Math.random(); return r < 0.6 ? 1 : r < 0.9 ? 2 : 3; };
async function renderScratch() {
  const box = $("rb-scratch");
  if (!box) return;
  if (isStaff || !ptsUser || !myPoints) { box.hidden = true; return; }
  box.hidden = false;
  const day = scDay();
  if (scSt.day !== day || scSt.uid !== ptsUser.uid) scSt = { day, uid: ptsUser.uid, doc: undefined, prize: scPrize(), busy: false, drawn: false };
  if (scSt.busy) return;
  const st = scSt;
  if (st.doc === undefined) {
    st.busy = true;
    try { const s = await getDoc(doc(db, "dailyScratch", st.uid + "_" + st.day)); st.doc = s.exists() ? s.data() : null; }
    catch (_) { st.doc = null; }
    st.busy = false;
    if (scSt !== st) return;
  }
  const head = '<div class="rb-sec" style="margin-top:0"><h3>🎟 Zdrapka dnia</h3></div>';
  if (st.doc) {
    st.drawn = false;
    box.innerHTML = head + `<div class="sc-done">✅ Dzisiejsza zdrapka: <b>+${esc(String(st.doc.pts))} pkt</b>. Wróć jutro po kolejną!</div>`;
    return;
  }
  if (PTS_NEED_STAMP && !(myLoyal && (myLoyal.total || 0) >= 1)) {
    box.innerHTML = head + '<div class="rb-meta">Zdrapka odblokuje się po pierwszej pieczątce na karcie lojalnościowej.</div>';
    return;
  }
  if (st.drawn) return;
  st.drawn = true;
  box.innerHTML = head + `<div class="sc-wrap"><div class="sc-prize">+${st.prize} pkt</div><canvas id="sc-cv" width="300" height="110" aria-label="Zdrapka"></canvas></div>`
    + '<div class="rb-meta">Zdrap srebrne pole palcem lub myszką. Raz dziennie, nagroda to 1–3 punkty (poza dziennym limitem z gier).</div>'
    + '<button type="button" class="rb-btn secondary small" id="sc-reveal">Odsłoń</button><div class="rb-msg" id="sc-msg" role="status"></div>';
  scpInit($("sc-cv"));
  $("sc-reveal").addEventListener("click", () => scFinish());
}
function scpInit(cv) {
  const g = cv.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 300, 110);
  gr.addColorStop(0, "#c9ced6"); gr.addColorStop(0.5, "#f1f3f6"); gr.addColorStop(1, "#aeb4be");
  g.fillStyle = gr; g.fillRect(0, 0, 300, 110);
  g.fillStyle = "#6b7380"; g.font = "bold 22px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("ZDRAP TUTAJ 🍕", 150, 55);
  let down = false, n = 0;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 300 / r.width, (e.clientY - r.top) * 110 / r.height]; };
  const scratch = (e) => {
    const [x, y] = pos(e);
    g.globalCompositeOperation = "destination-out";
    g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill();
    if (++n % 6 === 0) {
      const d = g.getImageData(0, 0, 300, 110).data; let c = 0, t = 0;
      for (let i = 3; i < d.length; i += 4 * 37) { t++; if (d[i] < 40) c++; }
      if (c / t > 0.45) scFinish();
    }
  };
  cv.addEventListener("pointerdown", (e) => { down = true; try { cv.setPointerCapture(e.pointerId); } catch (_) {} scratch(e); });
  cv.addEventListener("pointermove", (e) => { if (down) scratch(e); });
  ["pointerup", "pointercancel"].forEach((ev) => cv.addEventListener(ev, () => { down = false; }));
}
async function scFinish() {
  const st = scSt;
  if (st.busy || st.doc || !ptsUser) return;
  st.busy = true;
  const cv = $("sc-cv"), msg = $("sc-msg");
  if (cv) cv.style.opacity = "0";
  const rv = $("sc-reveal"); if (rv) rv.hidden = true;
  try {
    if (window.WRStraz && await window.WRStraz.isBlocked()) throw { soft: "To konto ma wyłączone zdobywanie punktów." };
    const pref = doc(db, "points", ptsUser.uid), dref = doc(db, "dailyScratch", st.uid + "_" + st.day), pts = st.prize;
    await runTransaction(db, async (tx) => {
      const [cur, dd] = await Promise.all([tx.get(pref), tx.get(dref)]);
      if (!cur.exists()) throw { soft: "Konto punktów nie jest gotowe." };
      if (dd.exists()) throw { done: dd.data() };
      const d = cur.data();
      tx.update(pref, { points: (d.points || 0) + pts, total: (d.total || 0) + pts });
      tx.set(dref, { uid: st.uid, pts, at: serverTimestamp() });
    });
    st.doc = { pts };
  } catch (err) {
    if (err && err.done) st.doc = err.done;
    else {
      console.warn("Zdrapka:", err && (err.code || err.message));
      if (cv) cv.style.opacity = "1";
      if (rv) rv.hidden = false;
      if (msg) setMsg(msg, err && err.soft ? err.soft : err && err.code === "permission-denied" ? "Nie udało się zapisać zdrapki. Spróbuj za chwilę (jeśli to się powtarza, mogła być już wykorzystana)." : "Nie udało się zapisać zdrapki. Spróbuj ponownie.", "err");
    }
  }
  st.busy = false;
  if (st.doc) { st.drawn = false; renderScratch(); }
}

async function awardPoints(n, gameId) {
  if (isStaff) return { ok: false, msg: "Tryb próbny obsługi — punkty nie są naliczane." };
  if (!ptsUser || !myPoints) return { ok: false, msg: "Zaloguj się, żeby zbierać punkty." };
  n = Math.floor(Number(n));
  if (!(n >= 1)) return { ok: false, msg: "Brak punktów do przyznania." };
  n = Math.min(n, PTS_MAX_AWARD);
  if (window.WRStraz && await window.WRStraz.isBlocked()) return { ok: false, msg: "To konto ma wyłączone zdobywanie punktów. W razie pytań skontaktuj się z pizzerią." };
  await loadGuard(false);
  if (PTS_NEED_STAMP && !(myLoyal && (myLoyal.total || 0) >= 1)) return { ok: false, msg: "Punkty z gier są dla klientów, którzy odebrali już pizzę. Poproś o pierwszą pieczątkę na karcie lojalnościowej!" };
  const minS = MIN_PLAY_S[gameId];
  if (minS && gameStartAt[gameId] && performance.now() - gameStartAt[gameId] < minS * 1000) {
    if (window.WRStraz) window.WRStraz.report("award_fast", gameId + ": nagroda po " + Math.round((performance.now() - gameStartAt[gameId]) / 1000) + " s od startu");
    return { ok: false, msg: "Za wcześnie na punkty — pograj jeszcze chwilę." };
  }
  const ref = doc(db, "points", ptsUser.uid);
  try {
    return await runTransaction(db, async (tx) => {
      const cur = await tx.get(ref);
      if (!cur.exists()) return { ok: false, msg: "Konto punktów nie jest gotowe." };
      const d = cur.data();
      const last = tsMs(d.lastAt), now = Date.now();
      if (last && now - last < PTS_COOLDOWN_MS) {
        const w = PTS_COOLDOWN_MS - (now - last);
        return { ok: false, msg: w > 90000 ? "Kolejne punkty będą dostępne za ok. " + Math.ceil(w / 60000) + " min." : "Chwilę poczekaj przed kolejnymi punktami.", wait: w <= 90000, waitMs: w };
      }
      const sameDay = last && utcDay(last) === utcDay(now);
      const todayPts = sameDay ? (d.dayPts || 0) : 0;
      const give = Math.min(n, PTS_DAY_CAP - todayPts);
      if (give <= 0) return { ok: false, msg: "Dzienny limit punktów wyczerpany. Wróć jutro!", cap: true };
      tx.update(ref, { points: (d.points || 0) + give, total: (d.total || 0) + give, dayPts: todayPts + give, lastAt: serverTimestamp() });
      return { ok: true, given: give, msg: "+" + give + " pkt" };
    });
  } catch (err) {
    console.warn("Punkty:", err && (err.code || err.message));
    if (err && err.code === "permission-denied" && window.WRStraz) window.WRStraz.report("award_denied", String(gameId || "?") + ": serwer odrzucił zapis punktów");
    return { ok: false, msg: err && err.code === "permission-denied" ? "Nie można teraz dodać punktów (limit lub reguły)." : "Nie udało się zapisać punktów." };
  }
}
/* Rejestrować gry mogą tylko skrypty gier z tej strony (gry*.js). Wołanie z konsoli = flaga dla admina.
   Publiczne WRGames.award nie przyznaje punktów (to pułapka); punkty idą wyłącznie przez ctx.award przekazane grze w start(). */
const GAME_SCRIPT_RE = /\/gry(-[a-z0-9]+)?\.js$/;
function fromGameScript() {
  try {
    const cs = document.currentScript;
    if (!cs || !cs.src) return false;
    const u = new URL(cs.src, location.href);
    return u.origin === location.origin && GAME_SCRIPT_RE.test(u.pathname);
  } catch (e) { return false; }
}
const WRG = {
  /* Dodanie gry: WRGames.register({ id, name, desc, icon, start(stageEl, { award, close }) }) */
  register(g) {
    if (!fromGameScript()) { if (window.WRStraz) window.WRStraz.report("console_register", "register() poza skryptem gry"); return; }
    if (!g || !g.id) return; const i = GAMES.findIndex((x) => x.id === g.id); if (i >= 0) GAMES[i] = { ...GAMES[i], ...g, soon: false }; else GAMES.push(g); renderGames();
  },
  get points() { return myPoints ? myPoints.points || 0 : 0; },
  get dayCap() { return PTS_DAY_CAP; }
};
Object.defineProperty(WRG, "award", { enumerable: false, configurable: false, writable: false, value() {
  if (window.WRStraz) window.WRStraz.report("console_award", "WRGames.award wywołane poza grą");
  return Promise.resolve({ ok: false, msg: "Punkty przyznaje wyłącznie gra." });
} });
Object.defineProperty(WRG, "register", { configurable: false, writable: false });
Object.defineProperty(window, "WRGames", { value: WRG, writable: false, configurable: false });
$("rb-game-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-play]");
  if (!b) return;
  const g = GAMES.find((x) => x.id === b.dataset.play);
  const stage = $("rb-game-stage");
  if (!g || !g.start) return;
  stage.hidden = false; stage.innerHTML = "";
  gameStartAt[g.id] = performance.now();
  const close = () => { stage.hidden = true; stage.innerHTML = ""; };
  g.start(stage, { close, award: async (n) => { const r = await awardPoints(n, g.id); if (r.msg) setMsg($("rb-pts-msg"), r.msg, r.ok ? "ok" : "err"); return r; } });
});
$("rb-pts-test").addEventListener("click", async () => {
  if (!isAdmin || !ptsUser) return;
  try {
    const ref = doc(db, "points", ptsUser.uid);
    const d = (await getDoc(ref)).data() || {};
    await updateDoc(ref, { points: (d.points || 0) + 10, total: (d.total || 0) + 10 });
    setMsg($("rb-pts-msg"), "Dodano 10 pkt (tryb testowy).", "ok");
  } catch (err) { setMsg($("rb-pts-msg"), errText(err), "err"); }
});
$("rb-pts-redeem").addEventListener("click", async () => {
  const msg = $("rb-pts-msg"), btn = $("rb-pts-redeem");
  if (!ptsUser || isStaff) return;
  btn.disabled = true;
  setMsg(msg, "");
  try {
    const ref = doc(db, "points", ptsUser.uid);
    const cur = await withTimeout(getDoc(ref));
    const d = cur.exists() ? cur.data() : null;
    if (!d || (d.points || 0) < PTS_COST) { setMsg(msg, "Za mało punktów.", "err"); return; }
    const n = (d.redeemN || 0) + 1;
    const exp = new Date(); exp.setDate(exp.getDate() + 14); exp.setHours(23, 59, 59, 0);
    const batch = writeBatch(db);
    batch.update(ref, { points: d.points - PTS_COST, redeemN: n });
    const ptsCode = genCode("PUNKTY");
    batch.set(doc(db, "coupons", "pts_" + ptsUser.uid + "_" + n), {
      uid: ptsUser.uid, userEmail: ptsUser.email || "", code: ptsCode, description: PTS_REWARD_DESC,
      expiresAt: Timestamp.fromDate(exp), used: false, createdAt: serverTimestamp()
    });
    await withTimeout(batch.commit());
    setMsg(msg, "Gotowe! Twój kod rabatowy −5 zł: " + ptsCode + " (ważny 14 dni, jest też na liście Twoich kodów).", "ok");
  } catch (err) {
    console.warn("Wymiana punktów:", err && (err.code || err.message));
    setMsg(msg, err && err.code === "permission-denied" ? "Nie udało się wymienić punktów (opublikuj nowe reguły)." : errText(err), "err");
  } finally { renderGames(); }
});

async function ensureLoyalty(user) {
  const ref = doc(db, "loyalty", user.uid);
  const snap = await withTimeout(getDoc(ref));
  if (snap.exists()) return;
  await withTimeout(setDoc(ref, {
    email: (user.email || "").toLowerCase(), name: user.displayName || "",
    stamps: 0, total: 0, rewards: 0, lastStampAt: null, lastRewardAt: null, createdAt: serverTimestamp()
  }));
}

/* Ekran „Zanim zaczniesz”: każdy klient (nowy i obecny) musi raz podać dzień i miesiąc urodzin. */
let gateUser = null;
$("rb-g-out").addEventListener("click", () => signOut(auth));
$("rb-g-skip").addEventListener("click", () => showOnly("user"));
$("rb-g-save").addEventListener("click", async () => {
  const gm = $("rb-g-msg");
  const btn = $("rb-g-save");
  btn.disabled = true;
  try {
    if (await saveBirthday("rb-g", gm, $("rb-g-mkt").checked ? { marketing: true } : null)) showOnly("user");
  } catch (err) {
    setMsg(gm, errText(err), "err");
    $("rb-g-skip").hidden = false;
  } finally { btn.disabled = false; }
});

/* ---------- anonimowy licznik odwiedzin (dzienne sumy, bez IP, cookies i identyfikatorów) ---------- */
const WARSAW_DAY = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(d);
async function countVisit() {
  try {
    if (isAdmin || isStaff) return;
    if (navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit/i.test(navigator.userAgent || "")) return;
    if (!/^https:|^http:\/\/localhost/.test(location.href)) return;
    const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") || (window.matchMedia && matchMedia("(pointer: coarse)").matches && innerWidth < 900);
    let src = "s_other";
    let host = "";
    try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch (_) {}
    if (standalone || /[?&]pwa=1\b/.test(location.search)) src = "s_app";
    else if (!host || host === location.hostname.replace(/^www\./, "")) src = "s_direct";
    else if (/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex|brave)\./i.test(host)) src = "s_search";
    else if (/(facebook|fb|instagram|messenger|t\.co|twitter|x\.com|tiktok|linkedin|youtube|pinterest)/i.test(host)) src = "s_social";
    await setDoc(doc(db, "visits", WARSAW_DAY(new Date())), { total: increment(1), [mobile ? "mobile" : "desktop"]: increment(1), [src]: increment(1) }, { merge: true });
  } catch (_) { /* licznik nie może przeszkadzać stronie */ }
}

async function handleUser(user) {
  cleanup();
  if (!user) { showOnly("auth"); refFail = false; lvUp = null; try { updateRefInvite(); } catch (_) {} return; }
  showOnly("loading");
  let gotWelcome = false;
  let needBday = false;
  try {
    isAdmin = (await withTimeout(getDoc(doc(db, "admins", user.uid)))).exists();
    try { applyPhotos(); } catch (_) {}
    if (!isAdmin) {
      try { isStaff = (await withTimeout(getDoc(doc(db, "staff", user.uid)))).exists(); }
      catch (e) { console.warn("Sprawdzanie roli obsługi nie powiodło się (opublikuj nowe reguły):", e.code); isStaff = false; }
    }
    // konto obsługi nie jest klientem: bez profilu i bez kodu powitalnego
    if (!isStaff) gotWelcome = await ensureProfile(user);
    if (!isStaff && !isAdmin) {
      try {
        const ps = await withTimeout(getDoc(doc(db, "users", user.uid)));
        needBday = ps.exists() && !hasFullBday(ps.data());
        if (needBday) { myProfile = ps.data(); prefillBdayForm("rb-g", myProfile); }
      } catch (e) { needBday = false; }
    }
    if (!isStaff) { try { await ensurePoints(user); } catch (e) { console.warn("Konto punktów nie zostało założone (opublikuj nowe reguły):", e && (e.code || e.message)); } }
    if (!isStaff && !isAdmin) { try { await ensureLoyalty(user); } catch (e) { console.warn("Karta lojalnościowa nie została założona (opublikuj nowe reguły):", e && (e.code || e.message)); } }
  } catch (err) {
    console.error("Rabat:", err);
    showOnly("auth");
    const hint = err.code === "timeout"
      ? "Baza Firestore nie odpowiada. Sprawdź w Firebase, czy ją utworzyłeś (Firestore Database → Create database)."
      : err.code === "permission-denied"
        ? "Brak uprawnień. Wklej i opublikuj reguły z pliku firestore.rules (Firestore → zakładka Rules)."
        : "Szczegóły: " + (err.code || err.message);
    setMsg(authMsg, "Nie udało się wczytać konta. " + hint, "err");
    return;
  }

  const shownName = user.displayName || (user.email || "").split("@")[0] || "Klient";
  $("rb-who").innerHTML = esc("Cześć, " + shownName.split(" ")[0] + "!") + (isAdmin ? '<span class="rb-adminpill">ADMIN</span>' : isStaff ? '<span class="rb-adminpill">OBSŁUGA</span>' : "");
  $("rb-mail").textContent = user.email || "";
  $("rb-avatar").textContent = (shownName.trim()[0] || "?").toUpperCase();
  $("rb-user").classList.toggle("adminview", isAdmin || isStaff); // admin i obsługa nie pokazują własnych kodów QR
  $("rb-delete").hidden = isAdmin || isStaff;
  $("rb-admin").hidden = !(isAdmin || isStaff);
  if (!(isAdmin || isStaff)) delete overlay.dataset.atab;
  // panel obsługi/admina od razu pod nagłówkiem, bez przewijania przez własną kartę i kody
  if (isAdmin || isStaff) { const top = document.querySelector("#rb-user .rb-top"); if (top) top.after($("rb-admin")); }
  $("rb-admin").classList.toggle("staffonly", !isAdmin && isStaff);
  $("rb-admin-title").textContent = isAdmin ? "🛠 Panel administratora" : "📷 Skanowanie rabatów";
  if (!isAdmin && isStaff) setAdminTab("check");
  else if (isAdmin) setAdminTab("today");
  if (wantScan && (isAdmin || isStaff)) { wantScan = false; setAdminTab("check"); if (PHONE_CAM) setTimeout(() => { startScanner(); }, 300); }
  $("rb-welcome").hidden = !gotWelcome;
  gateUser = user;
  setMsg($("rb-g-msg"), "");
  $("rb-g-skip").hidden = true;
  showOnly(needBday ? "gate" : "user");
  if (wantGames && !needBday) setTimeout(focusGames, 400);

  if (!isStaff) {
    ptsUser = user;
    unsubs.push(onSnapshot(doc(db, "points", user.uid),
      (d) => { myPoints = d.exists() ? d.data() : null; renderGames(); },
      (err) => { console.warn("Punkty niedostępne:", err && err.code); myPoints = null; renderGames(); }));
  } else renderGames();
  try { updateRefInvite(); maybeInitRef(); } catch (_) {}
  if (!isStaff && !isAdmin) {
    unsubs.push(onSnapshot(doc(db, "loyalty", user.uid),
      (d) => { myLoyal = d.exists() ? d.data() : null; renderLoyal(user); },
      (err) => { console.warn("Karta lojalnościowa niedostępna:", err.code); myLoyal = null; renderLoyal(user); }));
  }
  unsubs.push(onSnapshot(
    query(collection(db, "coupons"), where("uid", "==", user.uid)),
    (s) => { myCoupons = s.docs.map((d) => ({ id: d.id, ...d.data() })); couponsReady = true; renderMy(); maybeBirthday(); },
    (err) => { console.error(err); $("rb-my-list").innerHTML = '<div class="rb-empty">Nie udało się wczytać kodów (' + esc(err.code || err.message) + ').</div>'; }
  ));

  if (!isStaff && !isAdmin) {
    unsubs.push(onSnapshot(doc(db, "users", user.uid),
      (s) => { myProfile = s.exists() ? s.data() : null; renderMe(); maybeBirthday(); try { maybeInitRef(); renderRef(); } catch (_) {} },
      (err) => { console.warn("Profil niedostępny:", err && (err.code || err.message)); }));
  }

  if (isAdmin) {
    unsubs.push(onSnapshot(collection(db, "users"), (s) => {
      allUsers = s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.email).localeCompare(String(b.email)));
      renderUserSelect();
      renderStats();
      renderToday();
      renderClients();
    }, console.error));
    unsubs.push(onSnapshot(collection(db, "coupons"), (s) => {
      allCoupons = s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      renderAdminList();
      renderPromos();
      renderToday();
      renderClients();
      migrateWelcome();
    }, console.error));
    renderTemplates();
    unsubs.push(onSnapshot(collection(db, "deletionRequests"), (s) => {
      s.docs.forEach((d) => purgeDeleted(d.id));
    }, (err) => console.warn("Prośby o usunięcie niedostępne (opublikuj nowe reguły):", err.code)));
    unsubs.push(onSnapshot(collection(db, "staff"), (s) => {
      allStaff = s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.email).localeCompare(String(b.email)));
      renderStaff();
    }, (err) => { console.warn("Lista obsługi niedostępna (opublikuj nowe reguły):", err.code); allStaff = []; renderStaff(); }));
    unsubs.push(onSnapshot(collection(db, "promoCodes"), (s) => {
      allPromos = s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      renderPromos();
    }, (err) => { console.warn("Kody promocyjne niedostępne (opublikuj nowe reguły):", err.code); allPromos = []; renderPromos(); }));
    unsubs.push(onSnapshot(collection(db, "templates"), (s) => {
      allTemplates = s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      renderTemplates();
    }, (err) => {
      console.warn("Szablony niedostępne (opublikuj nowe reguły z firestore.rules):", err.code);
      allTemplates = [];
      renderTemplates();
    }));
  }
}

/* ---------- karta lojalnościowa klienta ---------- */
function stampDots(n) {
  return Array.from({ length: LOYAL_GOAL }, (_, i) => `<span class="rb-stamp${i < n ? " on" : ""}">${i < n ? "🍕" : i + 1}</span>`).join("");
}
/* ---------- rangi klienta: liczone z odebranych darmowych pizz z karty lojalnościowej ---------- */
const LV_MIN = 3, LV_MAX = 6;
function defLevels() {
  return [
    { n: "Brąz", ic: "🥉", from: 0, perk: "Karta lojalnościowa: co 10. pizza gratis" },
    { n: "Srebro", ic: "🥈", from: 2, perk: "Sos do każdego zamówienia za 1 zł" },
    { n: "Złoto", ic: "🥇", from: 5, perk: "Sos i mały dodatek do każdego zamówienia — razem za 1 zł" },
    { n: "Platyna", ic: "💎", from: 10, perk: "Sos i dodatek za 1 zł + pierwszeństwo przy zamówieniach na konkretną godzinę" },
    { n: "Legenda", ic: "👑", from: 20, perk: "Pizza urodzinowa za 1 zł raz w roku + wszystkie wcześniejsze przywileje" }
  ];
}
/* v === 2: progi są w darmowych pizzach (starsze ustawienia liczyły wizyty, więc wracają do domyślnych) */
function cleanLevels(a, v) {
  if (v !== 2 || !Array.isArray(a) || a.length < LV_MIN || a.length > LV_MAX) return defLevels();
  const out = [];
  for (let i = 0; i < a.length; i++) {
    const x = a[i] || {};
    const n = String(x.n || "").trim().slice(0, 20), ic = String(x.ic || "").trim().slice(0, 4);
    const from = Number(x.from), perk = String(x.perk || "").trim().slice(0, 100);
    if (!n || !Number.isInteger(from) || from < 0 || from > 9999) return defLevels();
    if (i === 0 ? from !== 0 : from <= out[i - 1].from) return defLevels();
    out.push({ n, ic, from, perk });
  }
  return out;
}
const curLevels = () => siteCfg.levels || defLevels();
const rewardsOf = (L) => Math.max(0, Math.floor(Number(L && L.rewards) || 0));
const lvTier = (i) => "lv-t" + Math.min(Math.max(i, 0), 5);
function pizzaWord(n) {
  n = Math.abs(n); const m10 = n % 10, m100 = n % 100;
  return n === 1 ? "pizza" : (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) ? "pizze" : "pizz";
}
/* ranga wynika z liczby odebranych darmowych pizz (pole rewards na karcie) */
function levelInfo(rewards, minIdx) {
  const L = curLevels(); let idx = 0;
  for (let i = 0; i < L.length; i++) if (rewards >= L[i].from) idx = i;
  const auto = idx, mi = Math.floor(Number(minIdx));
  if (Number.isInteger(mi) && mi > idx) idx = Math.min(mi, L.length - 1);   // ranga nadana ręcznie przez właściciela
  const next = L[idx + 1] || null;
  return { idx, auto, lvl: L[idx], next, left: next ? next.from - rewards : 0, granted: idx > auto };
}
/* ranga klienta = większa z: liczonej z darmowych pizz i nadanej ręcznie przez admina (pole rankSet na karcie) */
const rankOf = (L) => levelInfo(rewardsOf(L), L && L.rankSet);
function lvRowHtml(l, i, n) {
  return `<div class="rb-lv-row">
      <div class="rb-row"><input class="rb-lv-ic" maxlength="4" value="${esc(l.ic)}" aria-label="Ikona"><input class="rb-lv-n" maxlength="20" value="${esc(l.n)}" aria-label="Nazwa rangi"><input class="rb-lv-f" type="number" min="0" max="9999" step="1" value="${esc(String(l.from))}" ${i === 0 ? "disabled" : ""} aria-label="Od ilu darmowych pizz">${i > 0 && n > LV_MIN ? `<button type="button" class="rb-btn secondary small rb-lv-del" data-i="${i}" aria-label="Usuń rangę">🗑</button>` : ""}</div>
      <input class="rb-lv-p" maxlength="100" value="${esc(l.perk)}" placeholder="Przywilej tej rangi (np. sos za 1 zł)" aria-label="Przywilej">
      <div class="rb-meta">${i === 0 ? "Ranga startowa — od 0 darmowych pizz." : "Liczba w polu = od ilu odebranych darmowych pizz z karty klient ma tę rangę."}</div>
    </div>`;
}
function renderLevelRows(list) {
  const box = $("rb-lv-rows"); if (!box) return;
  box.innerHTML = list.map((l, i) => lvRowHtml(l, i, list.length)).join("");
  const add = $("rb-lv-add"); if (add) add.disabled = list.length >= LV_MAX;
}
function readLevelRows() {
  return [...document.querySelectorAll("#rb-lv-rows .rb-lv-row")].map((r, i) => ({
    ic: r.querySelector(".rb-lv-ic").value.trim(), n: r.querySelector(".rb-lv-n").value.trim(),
    from: i === 0 ? 0 : r.querySelector(".rb-lv-f").value, perk: r.querySelector(".rb-lv-p").value.trim()
  }));
}
function fillLevelsForm() {
  const on = $("rb-lv-on"), box = $("rb-lv-rows");
  if (!on || !box) return;
  on.checked = !!siteCfg.levelsOn;
  $("rb-ref-on").checked = !!siteCfg.refOn;
  renderLevelRows(curLevels());
}
(function lvEditorEvents() {
  const box = $("rb-lv-rows"), add = $("rb-lv-add");
  if (box) box.addEventListener("click", (e) => {
    const b = e.target.closest(".rb-lv-del"); if (!b) return;
    const list = readLevelRows(), i = Number(b.dataset.i);
    if (list.length > LV_MIN && i > 0) { list.splice(i, 1); renderLevelRows(list); }
  });
  if (add) add.addEventListener("click", () => {
    const list = readLevelRows(); if (list.length >= LV_MAX) return;
    const last = Number(list[list.length - 1].from) || 0;
    list.push({ ic: "⭐", n: "Nowa ranga", from: last + 5, perk: "" });
    renderLevelRows(list);
  });
})();
function collectLevels() {
  const raw = readLevelRows();
  if (raw.length < LV_MIN || raw.length > LV_MAX) return { list: curLevels() };
  const list = raw.map((r, i) => ({ ic: r.ic, n: r.n, from: i === 0 ? 0 : Number(r.from), perk: r.perk }));
  for (let i = 0; i < list.length; i++) {
    if (!list[i].n) return { bad: "Podaj nazwę każdej rangi." };
    if (!Number.isInteger(list[i].from) || list[i].from < 0 || list[i].from > 9999) return { bad: "Liczba darmowych pizz musi być liczbą całkowitą." };
    if (i > 0 && list[i].from <= list[i - 1].from) return { bad: "Każda kolejna ranga musi zaczynać się od większej liczby darmowych pizz." };
  }
  return { list };
}
/* osiągnięcia: wyliczane z danych karty (nic nie trzeba zapisywać) */
function achievements(L) {
  const rw = rewardsOf(L), tot = L.total || 0, st = L.stamps || 0, c = tsMs(L.createdAt), age = c ? (Date.now() - c) / 86400000 : 0;
  return [
    { ic: "🍕", n: "Pierwsza pieczątka", d: "Zdobądź pierwszą pieczątkę", ok: tot >= 1 },
    { ic: "🔥", n: "Prawie pełna karta", d: "Uzbieraj 8 pieczątek na karcie", ok: st >= 8 || rw >= 1 },
    { ic: "🎁", n: "Pierwsza pizza gratis", d: "Odbierz pierwszą darmową pizzę", ok: rw >= 1 },
    { ic: "🔟", n: "10 wizyt", d: "10 pieczątek łącznie", ok: tot >= 10 },
    { ic: "🥳", n: "Trzy gratisy", d: "Odbierz 3 darmowe pizze", ok: rw >= 3 },
    { ic: "🎯", n: "25 wizyt", d: "25 pieczątek łącznie", ok: tot >= 25 },
    { ic: "🏅", n: "50 wizyt", d: "50 pieczątek łącznie", ok: tot >= 50 },
    { ic: "👑", n: "Dziesięć gratisów", d: "Odbierz 10 darmowych pizz", ok: rw >= 10 },
    { ic: "🎂", n: "Rok z nami", d: "Konto starsze niż rok", ok: age >= 365 }
  ];
}
function rankHtml(L, preview, uid) {
  const rw = rewardsOf(L), st = Math.min(LOYAL_GOAL, L.stamps || 0), LI = rankOf(L), all = curLevels();
  if (!preview) {
    try {
      const k = "wr_lvl2_" + uid, s0 = localStorage.getItem(k);
      if (s0 !== null && LI.idx > Number(s0)) lvUp = LI.idx;
      if (s0 === null || LI.idx !== Number(s0)) localStorage.setItem(k, String(LI.idx));
    } catch (_) {}
  }
  const base = rw + st / LOYAL_GOAL;
  const pct = LI.next ? Math.max(0, Math.min(100, Math.round((base - LI.lvl.from) / (LI.next.from - LI.lvl.from) * 100))) : 100;
  const needSt = LI.next ? Math.max(0, (LI.next.from - rw) * LOYAL_GOAL - st) : 0;
  const ach = achievements(L), done = ach.filter((a) => a.ok).length;
  return (!preview && lvUp === LI.idx && LI.idx > 0 ? `<div class="rb-lv-up">🎉 Awans! Jesteś teraz w randze ${esc(LI.lvl.ic)} ${esc(LI.lvl.n)}.</div>` : "")
    + `<div class="rb-lv-top"><span class="rb-lv-chip ${lvTier(LI.idx)}">${esc(LI.lvl.ic)} ${esc(LI.lvl.n)}</span><span class="rb-meta">🍕 Darmowe pizze: <b>${rw}</b></span></div>`
    + (LI.granted ? `<div class="rb-meta">🎖 Tę rangę nadał Ci właściciel pizzerii.</div>` : "")
    + `<div class="rb-lv-bar"><i style="width:${pct}%"></i></div>`
    + (LI.next
      ? `<div class="rb-meta">Do rangi ${esc(LI.next.ic)} ${esc(LI.next.n)}: jeszcze ${LI.left} ${pizzaWord(LI.left)} gratis (ok. ${needSt} pieczątek). Pizza liczy się do rangi, gdy ją odbierzesz.</div>`
      : `<div class="rb-meta">Masz najwyższą rangę. Dziękujemy, że z nami jesteś! 💚</div>`)
    + `<div class="rb-lv-ladder">${all.map((l, i) => `<div class="rb-lv-step ${lvTier(i)} ${i < LI.idx ? "done" : i === LI.idx ? "cur" : "lock"}"><span class="ic">${esc(l.ic)}</span><b>${esc(l.n)}</b><small>${l.from} 🍕</small></div>`).join("")}</div>`
    + (LI.lvl.perk ? `<div class="rb-lv-perk">✨ Twój przywilej: <b>${esc(LI.lvl.perk)}</b><br><span class="rb-meta">Pokaż kartę przy zamówieniu — obsługa go zastosuje.</span></div>` : "")
    + `<details class="rb-lv-all"><summary>Wszystkie rangi i przywileje</summary>${all.map((l, i) => `<div>${esc(l.ic)} <b>${esc(l.n)}</b> — od ${l.from} ${pizzaWord(l.from)} gratis${l.perk ? ": " + esc(l.perk) : ""}${i === LI.idx ? " ← Ty" : ""}</div>`).join("")}</details>`
    + `<div class="rb-ach-h">🏆 Osiągnięcia <span>${done}/${ach.length}</span></div><div class="rb-ach">${ach.map((a) => `<span class="${a.ok ? "on" : "off"}" title="${esc(a.d)}">${a.ic} ${esc(a.n)}</span>`).join("")}</div>`;
}
function renderLevel(user) {
  const el = $("rb-level");
  if (!el) return;
  if (!siteCfg.levelsOn || !myLoyal || isStaff || isAdmin) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = rankHtml(myLoyal, false, user.uid);
}
function refreshLoyaltyUi() {
  const u = auth.currentUser;
  try { if (u && myLoyal && !isAdmin && !isStaff) renderLoyal(u); } catch (_) {}
  try { renderRef(); updateRefInvite(); maybeInitRef(); } catch (_) {}
  try { renderPoll(u); } catch (_) {}
  try { if (isAdmin) { renderClients(); renderToday(); } } catch (_) {}
}

/* ---------- program poleceń (link z kodem) ---------- */
const REF_RE = /^[A-Z0-9]{6}$/;
try { const m = String(QS.get("ref") || "").toUpperCase(); if (REF_RE.test(m)) localStorage.setItem("wr_ref", m); } catch (_) {}
function pendingRef() { try { const v = localStorage.getItem("wr_ref") || ""; return REF_RE.test(v) ? v : ""; } catch (_) { return ""; } }
function clearPendingRef() { try { localStorage.removeItem("wr_ref"); } catch (_) {} }
async function refName(code) {
  if (!REF_RE.test(code || "")) return null;
  if (code in refNames) return refNames[code];
  try {
    const s = await getDoc(doc(db, "refs", code));
    refNames[code] = s.exists() ? String(s.data().name || "") : null;
  } catch (_) { return null; }
  return refNames[code];
}
const refLink = (code) => "https://wloskarobota.eu/?ref=" + code;
async function maybeInitRef() {
  const user = auth.currentUser;
  if (!user || isAdmin || isStaff || !siteCfg.refOn || !myProfile || refBusy || refFail) return;
  const pend = pendingRef();
  if (myProfile.refCode && !pend) return;
  refBusy = true;
  try {
    let code = myProfile.refCode || "";
    if (!code) {
      const nm = String(myProfile.name || user.displayName || "").trim().split(/\s+/)[0].slice(0, 40);
      for (let i = 0; i < 6 && !code; i++) {
        const c = genCode();
        const ex = await getDoc(doc(db, "refs", c));
        if (ex.exists()) continue;
        const b = writeBatch(db);
        b.update(doc(db, "users", user.uid), { refCode: c });
        b.set(doc(db, "refs", c), { name: nm, createdAt: serverTimestamp() });
        await b.commit();
        code = c; myProfile.refCode = c; refNames[c] = nm;
      }
    }
    if (pend) {
      if (myProfile.refBy || pend === code) clearPendingRef();
      else if (myLoyal && (myLoyal.total || 0) === 0) {
        const nm = await refName(pend);
        if (nm !== null) { await updateDoc(doc(db, "users", user.uid), { refBy: pend }); myProfile.refBy = pend; }
        clearPendingRef();
      } else if (myLoyal) clearPendingRef();
    }
  } catch (e) { refFail = true; console.warn("Polecenia:", e.code || e.message); }
  finally { refBusy = false; try { renderRef(); } catch (_) {} }
}
function renderRef() {
  const box = $("rb-ref");
  if (!box) return;
  const user = auth.currentUser;
  const on = !!(user && siteCfg.refOn && !isAdmin && !isStaff && myProfile);
  box.hidden = !on;
  if (!on) return;
  const code = myProfile.refCode || "";
  $("rb-ref-code").textContent = code || "…";
  $("rb-ref-share").disabled = $("rb-ref-copy").disabled = !code;
  const by = $("rb-ref-by");
  if (myProfile.refBy) {
    by.textContent = "Dołączasz z polecenia znajomego.";
    refName(myProfile.refBy).then((n) => { if (n && myProfile && myProfile.refBy) by.textContent = "Polecił(a) Cię: " + n + "."; });
  } else by.textContent = "";
  $("rb-ref-enter").hidden = !!myProfile.refBy || !myLoyal || (myLoyal.total || 0) > 0;
  maybeInitRef();
}
let refInviteHidden = false;
function updateRefInvite() {
  let el = $("ref-invite");
  const code = pendingRef();
  const show = !auth.currentUser && siteCfg.refOn && code && !refInviteHidden;
  if (!show) { if (el) el.hidden = true; return; }
  if (!el) {
    el = document.createElement("div"); el.id = "ref-invite";
    el.innerHTML = '<span></span><button type="button" id="ref-invite-go">Załóż konto</button><button type="button" class="x" id="ref-invite-x" aria-label="Zamknij">✕</button>';
    document.body.appendChild(el);
    $("ref-invite-go").onclick = () => { location.hash = "#konto"; };
    $("ref-invite-x").onclick = () => { refInviteHidden = true; el.hidden = true; };
  }
  el.hidden = false;
  const sp = el.querySelector("span");
  sp.textContent = "🤝 Znajomy poleca Włoską Robotę! Załóż konto i odbierz kod powitalny.";
  refName(code).then((n) => { if (n) sp.textContent = "🤝 " + n + " poleca Włoską Robotę! Załóż konto i odbierz kod powitalny."; });
}
(function bindRef() {
  const msg = $("rb-ref-msg");
  const copy = async () => { const c = (myProfile || {}).refCode; if (!c) return false; try { await navigator.clipboard.writeText(refLink(c)); return true; } catch (_) { return false; } };
  $("rb-ref-copy").addEventListener("click", async () => { const ok = await copy(); setMsg(msg, ok ? "Skopiowano link." : "Nie udało się skopiować. Przepisz kod: " + ((myProfile || {}).refCode || ""), ok ? "ok" : "err"); });
  $("rb-ref-share").addEventListener("click", async () => {
    const c = (myProfile || {}).refCode; if (!c) return;
    const data = { title: "Włoska Robota", text: "Zjedz pizzę we Włoskiej Robocie i odbierz kod powitalny! 🍕", url: refLink(c) };
    if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    setMsg(msg, (await copy()) ? "Skopiowano link — wklej go znajomemu." : "Przepisz kod: " + c, "ok");
  });
  $("rb-ref-ok").addEventListener("click", async () => {
    const user = auth.currentUser; if (!user || !myProfile) return;
    const c = $("rb-ref-in").value.trim().toUpperCase();
    if (!REF_RE.test(c)) { setMsg(msg, "Kod ma 6 znaków (litery i cyfry).", "err"); return; }
    if (c === myProfile.refCode) { setMsg(msg, "To Twój własny kod.", "err"); return; }
    try {
      const nm = await refName(c);
      if (nm === null) { setMsg(msg, "Nie znamy takiego kodu.", "err"); return; }
      await updateDoc(doc(db, "users", user.uid), { refBy: c });
      myProfile.refBy = c; clearPendingRef(); $("rb-ref-in").value = "";
      setMsg(msg, "Dzięki! Polecający dostanie rabat po Twoim pierwszym zakupie.", "ok"); renderRef();
    } catch (err) { setMsg(msg, errText(err), "err"); }
  });
})();
function refInfo(u) {
  const by = u.refBy ? (allUsers.find((x) => x.refCode && x.refCode === u.refBy) || null) : null;
  const L = allLoyal.find((l) => l.id === u.id) || null;
  const paid = !!(L && L.refPaid);
  const ok = !!(by && L && (L.total || 0) >= 1 && !paid);
  return { by, L, paid, ok, state: paid ? "paid" : !by ? "nobody" : ok ? "ready" : "wait" };
}
async function rewardReferral(uid) {
  const u = allUsers.find((x) => x.id === uid);
  if (!u) return;
  const ri = refInfo(u);
  if (ri.state !== "ready") return;
  const who = ri.by.name || ri.by.email || "polecający";
  if (!confirm("Przyznać klientowi „" + who + "” rabat −5 zł za polecenie „" + (u.name || u.email) + "”?")) return;
  const exp = new Date(); exp.setDate(exp.getDate() + 30); exp.setHours(23, 59, 59, 0);
  const code = genCode("POLEC");
  try {
    const b = writeBatch(db);
    b.set(doc(db, "coupons", "ref_" + uid), { uid: ri.by.id, userEmail: ri.by.email || "", code, description: "Rabat -5 zł na zamówienie (polecenie znajomego)", expiresAt: Timestamp.fromDate(exp), used: false, createdAt: serverTimestamp() });
    b.update(doc(db, "loyalty", uid), { refPaid: serverTimestamp() });
    b.set(newLogRef(), logData("coupon", { uid: ri.by.id, name: who }, "Polecenie: " + (u.name || u.email || "") + " · " + code));
    await b.commit();
    const L = allLoyal.find((l) => l.id === uid); if (L) L.refPaid = Timestamp.now();
    renderClients(); renderToday();
    siteToast("Przyznano −5 zł: " + who + " (kod " + code + ")");
  } catch (err) { console.error(err); alert(errText(err)); }
}

function renderLoyal(user) {
  const box = $("rb-loyal");
  try { renderRef(); } catch (_) {}
  try { renderPoll(user); } catch (_) {}
  if (!myLoyal || isStaff || isAdmin) { box.hidden = true; return; }
  try { renderLevel(user); } catch (e) { console.warn(e); }
  const n = Math.min(LOYAL_GOAL, myLoyal.stamps || 0);
  const full = n >= LOYAL_GOAL;
  box.hidden = false;
  box.classList.toggle("full", full);
  $("rb-stamps").innerHTML = stampDots(n);
  $("rb-loyal-count").textContent = n + " / " + LOYAL_GOAL;
  $("rb-loyal-free").hidden = !full;
  const left = LOYAL_GOAL - n;
  $("rb-loyal-txt").textContent = full
    ? "Karta pełna! Pizza gratis czeka na Twoje następne zamówienie."
    : "Za każde zamówienie dostajesz pieczątkę. Jeszcze " + left + " " + (left === 1 ? "pieczątka" : left < 5 ? "pieczątki" : "pieczątek") + " do pizzy gratis (1 sztuka)."
      + (myLoyal.rewards ? " Odebrane dotąd: " + myLoyal.rewards + "." : "");
  const qr = $("rb-card-qr");
  qr.dataset.qrfull = "KL:" + user.uid;
  drawQRs(box);
  renderSurvey(user);
}

/* ---------- ankieta po wizycie ---------- */
const SURVEY_WINDOW_MS = 48 * 3600 * 1000;   // tyle czasu od pieczątki można ocenić wizytę (to samo w firestore.rules)
function lastVisitSec() {
  if (!myLoyal) return 0;
  const ms = Math.max(tsMs(myLoyal.lastStampAt), tsMs(myLoyal.lastRewardAt));
  return ms ? Math.floor(ms / 1000) : 0;
}
function paintStars(v) {
  document.querySelectorAll("#rb-stars button").forEach((b) => {
    const on = Number(b.dataset.v) <= v;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", Number(b.dataset.v) === v ? "true" : "false");
  });
}
function showSurveyDone(rating) {
  $("rb-sv-form").hidden = true;
  $("rb-sv-done").hidden = false;
  const g = $("rb-sv-google");
  const url = siteCfg.googleReviewUrl;
  // przycisk Google dla każdej oceny (wybiórcze zachęcanie tylko zadowolonych jest niezgodne z zasadami Google i może wprowadzać w błąd)
  if (rating >= 4) {
    $("rb-sv-done-text").textContent = "Dziękujemy za ocenę! 🙏 Cieszymy się, że smakowało." + (url ? " Jeśli chcesz, możesz zostawić opinię także publicznie w Google." : "");
  } else {
    $("rb-sv-done-text").textContent = "Dziękujemy za szczerą opinię. Przekażemy ją właścicielowi i postaramy się to poprawić." + (url ? " Jeśli chcesz, możesz zostawić opinię także publicznie w Google." : "");
  }
  if (url) { g.href = url; g.hidden = false; } else g.hidden = true;
}
async function renderSurvey(user) {
  const box = $("rb-survey");
  const sec = lastVisitSec();
  if (isStaff || isAdmin || !myLoyal || !sec || Date.now() - sec * 1000 > SURVEY_WINDOW_MS) { box.hidden = true; return; }
  if (svDoneFor === sec) { box.hidden = false; return; }          // właśnie oceniona w tej sesji
  if (sec !== svVisit) {
    svVisit = sec;
    svRating = 0;
    box.hidden = true;
    $("rb-sv-form").hidden = false;
    $("rb-sv-done").hidden = true;
    $("rb-sv-comment").value = "";
    $("rb-sv-send").disabled = true;
    setMsg($("rb-sv-msg"), "");
    paintStars(0);
    let exists = true;
    try { exists = (await getDoc(doc(db, "feedback", user.uid + "_" + sec))).exists(); }
    catch (err) { console.warn("Ankieta niedostępna (opublikuj nowe reguły):", err.code); }
    if (svVisit !== sec) return;
    box.hidden = exists;
  }
}
document.querySelectorAll("#rb-stars button").forEach((b) => b.addEventListener("click", () => {
  svRating = Number(b.dataset.v);
  paintStars(svRating);
  $("rb-sv-send").disabled = false;
}));
$("rb-sv-send").addEventListener("click", async () => {
  const user = auth.currentUser;
  const sec = svVisit;
  if (!user || !sec || !svRating) return;
  const btn = $("rb-sv-send");
  btn.disabled = true;
  setMsg($("rb-sv-msg"), "");
  const name = (user.displayName || (user.email || "").split("@")[0] || "Klient").slice(0, 60);
  try {
    await withTimeout(setDoc(doc(db, "feedback", user.uid + "_" + sec), {
      uid: user.uid, name, rating: svRating, comment: $("rb-sv-comment").value.trim().slice(0, 300), visitSec: sec, createdAt: serverTimestamp()
    }), 10000);
    svDoneFor = sec;
    showSurveyDone(svRating);
  } catch (err) {
    console.error(err);
    setMsg($("rb-sv-msg"), errText(err), "err");
    btn.disabled = false;
  }
});

/* ---------- admin: czyszczenie danych usuniętych kont ---------- */
const purging = new Set();
async function purgeDeleted(uid) {
  if (purging.has(uid)) return;
  purging.add(uid);
  try {
    const cs = await getDocs(query(collection(db, "coupons"), where("uid", "==", uid)));
    for (const c of cs.docs) await deleteDoc(doc(db, "coupons", c.id));
    const fbs = await getDocs(query(collection(db, "feedback"), where("uid", "==", uid)));
    for (const f of fbs.docs) await deleteDoc(doc(db, "feedback", f.id));
    const lgs = await getDocs(query(collection(db, "logs"), where("customerUid", "==", uid)));
    for (const l of lgs.docs) await deleteDoc(doc(db, "logs", l.id));
    await deleteDoc(doc(db, "loyalty", uid));
    await deleteDoc(doc(db, "points", uid));
    try { await deleteDoc(doc(db, "devices", uid)); } catch (_) {}
    try { await deleteDoc(doc(db, "blocked", uid)); } catch (_) {}
    try { const fl = await getDocs(query(collection(db, "flags"), where("uid", "==", uid))); for (const f of fl.docs) await deleteDoc(doc(db, "flags", f.id)); } catch (_) {}
    try { const us = await getDoc(doc(db, "users", uid)); const rc = us.exists() && us.data().refCode; if (rc) await deleteDoc(doc(db, "refs", rc)); } catch (_) {}
    await deleteDoc(doc(db, "users", uid));
    await deleteDoc(doc(db, "deletionRequests", uid));
  } catch (err) {
    console.error("Czyszczenie danych konta nie powiodło się:", err);
    purging.delete(uid);
  }
}

/* ---------- kody klienta ---------- */
function couponState(c) {
  if (c.used) return { off: true, label: "Wykorzystany" };
  if (c.expiresAt && c.expiresAt.toDate && c.expiresAt.toDate() < new Date()) return { off: true, label: "Wygasł" };
  return { off: false, label: "Aktywny" };
}

function expiryInfo(c) {
  if (!c.expiresAt || !c.expiresAt.toDate) return { text: "Bez terminu ważności", soon: false };
  const d = c.expiresAt.toDate();
  const days = Math.ceil((d - new Date()) / 86400000);
  let extra = "";
  if (days === 1) extra = " · zostaje 1 dzień";
  else if (days > 1 && days <= 14) extra = " · zostało " + days + " dni";
  return { text: "Ważny do: " + fmtDate(c.expiresAt) + extra, soon: days >= 0 && days <= 3 };
}

const MONTHS_GEN = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const BDAY_DESC = "Urodzinowy rabat -5 zł na zamówienie";
const meMsg = $("rb-me-msg");
(function fillBdaySelects() {
  const dHtml = '<option value="">dzień</option>' + Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
  const mHtml = '<option value="">miesiąc</option>' + MONTHS_GEN.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
  const thisYear = new Date().getFullYear();
  const yHtml = '<option value="">rok</option>' + Array.from({ length: thisYear - 1919 }, (_, i) => `<option value="${thisYear - i}">${thisYear - i}</option>`).join("");
  ["rb-bday-d", "rb-g-d"].forEach((id) => { $(id).innerHTML = dHtml; });
  ["rb-bday-m", "rb-g-m"].forEach((id) => { $(id).innerHTML = mHtml; });
  ["rb-bday-y", "rb-g-y"].forEach((id) => { $(id).innerHTML = yHtml; });
})();
function bdayText(u) {
  return u && Number.isInteger(u.bMonth) && Number.isInteger(u.bDay) ? u.bDay + " " + MONTHS_GEN[u.bMonth - 1] : "urodziny: brak danych";
}
function ageOf(u) {
  if (!u || !Number.isInteger(u.bYear) || !Number.isInteger(u.bMonth) || !Number.isInteger(u.bDay)) return null;
  const t = new Date();
  let a = t.getFullYear() - u.bYear;
  if (t.getMonth() + 1 < u.bMonth || (t.getMonth() + 1 === u.bMonth && t.getDate() < u.bDay)) a--;
  return a;
}
function bdayFull(u) {
  if (!u || !Number.isInteger(u.bMonth) || !Number.isInteger(u.bDay)) return "data urodzenia: brak";
  const a = ageOf(u);
  return u.bDay + " " + MONTHS_GEN[u.bMonth - 1] + (Number.isInteger(u.bYear) ? " " + u.bYear + " (" + a + " lat" + (a >= 18 ? ", pełnoletni" : ", niepełnoletni") + ")" : " (bez roku)");
}
const dateExists = (d, m, y) => { const t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; };
const hasFullBday = (u) => !!u && Number.isInteger(u.bMonth) && Number.isInteger(u.bDay) && Number.isInteger(u.bYear);
/* wspólny zapis daty urodzenia (ekran „Zanim zaczniesz” i pole w Koncie); dzień i miesiąc, które już są w profilu, zostają bez zmian */
async function saveBirthday(pf, msgEl, extra) {
  const user = auth.currentUser;
  if (!user) return false;
  const had = Number.isInteger((myProfile || {}).bMonth);
  const d = Number($(pf + "-d").value), m = Number($(pf + "-m").value), y = Number($(pf + "-y").value);
  if (!d || !m || !y) { setMsg(msgEl, "Wybierz dzień, miesiąc i rok urodzenia.", "err"); return false; }
  if (!dateExists(d, m, y) || y > new Date().getFullYear()) { setMsg(msgEl, "Taka data nie istnieje.", "err"); return false; }
  if (ageOf({ bYear: y, bMonth: m, bDay: d }) < 18) { setMsg(msgEl, "Konto mogą mieć tylko osoby pełnoletnie (Regulamin, pkt 2). Jeśli nie masz jeszcze 18 lat, wyloguj się.", "err"); return false; }
  if (!confirm("Zapisać datę urodzenia: " + d + " " + MONTHS_GEN[m - 1] + " " + y + "? Datę można ustawić tylko raz.")) return false;
  const data = had ? { bYear: y } : { bMonth: m, bDay: d, bYear: y };
  Object.assign(data, extra || {});
  await withTimeout(updateDoc(doc(db, "users", user.uid), data));
  return true;
}
function prefillBdayForm(pf, prof) {
  const has = !!prof && Number.isInteger(prof.bMonth);
  $(pf + "-d").value = has ? String(prof.bDay) : "";
  $(pf + "-m").value = has ? String(prof.bMonth) : "";
  $(pf + "-y").value = "";
  $(pf + "-d").disabled = has; $(pf + "-m").disabled = has;
}
function bdayInDays(u) {
  const m = u && u.bMonth, d = u && u.bDay;
  if (!Number.isInteger(m) || !Number.isInteger(d)) return Infinity;
  const t = new Date();
  const t0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  let n = new Date(t.getFullYear(), m - 1, d);
  if (n < t0) n = new Date(t.getFullYear() + 1, m - 1, d);
  return Math.round((n - t0) / 86400000);
}
function renderMe() {
  const box = $("rb-me");
  if (!box) return;
  const show = !!myProfile && !isAdmin && !isStaff;
  box.hidden = !show;
  if (!show) return;
  const has = hasFullBday(myProfile);
  $("rb-bday-set").hidden = has;
  $("rb-bday-done").hidden = !has;
  if (!has && !$("rb-bday-set").dataset.filled) { prefillBdayForm("rb-bday", myProfile); $("rb-bday-set").dataset.filled = "1"; }
  if (has) $("rb-bday-done").textContent = "🎂 Twoja data urodzenia: " + bdayText(myProfile) + " " + myProfile.bYear + ". W dniu urodzin wejdź w Konto, a dodamy Ci urodzinowy rabat.";
  $("rb-mkt").checked = myProfile.marketing === true;
}
$("rb-bday-save").addEventListener("click", async () => {
  const btn = $("rb-bday-save");
  btn.disabled = true;
  try {
    if (await saveBirthday("rb-bday", meMsg)) setMsg(meMsg, "Zapisane. Dziękujemy!", "ok");
  } catch (err) { setMsg(meMsg, errText(err), "err"); }
  finally { btn.disabled = false; }
});
$("rb-mkt").addEventListener("change", async () => {
  const user = auth.currentUser;
  const on = $("rb-mkt").checked;
  if (!user) return;
  try {
    await withTimeout(updateDoc(doc(db, "users", user.uid), { marketing: on }));
    setMsg(meMsg, on ? "Dziękujemy! Będziemy dawać znać o ciekawych akcjach." : "Zgoda wycofana. Nie wyślemy Ci więcej e-maili z promocjami.", "ok");
  } catch (err) { $("rb-mkt").checked = !on; setMsg(meMsg, errText(err), "err"); }
});
/* Rabat urodzinowy: raz w roku, w dniu urodzin (wg UTC, tak jak sprawdzają reguły), dla konta starszego niż 7 dni. */
async function maybeBirthday() {
  const user = auth.currentUser;
  if (!user || isAdmin || isStaff || bdayTried || !couponsReady || !myProfile) return;
  const m = myProfile.bMonth, d = myProfile.bDay;
  if (!Number.isInteger(m) || !Number.isInteger(d)) return;
  const now = new Date();
  if (now.getUTCMonth() + 1 !== m || now.getUTCDate() !== d) return;
  const created = tsMs(myProfile.createdAt);
  if (!created || Date.now() - created < 7 * DAY) return;
  const year = now.getUTCFullYear();
  const id = "bday_" + user.uid + "_" + year;
  bdayTried = true;
  if (myCoupons.some((c) => c.id === id)) return;
  const exp = new Date(Date.now() + 7 * DAY);
  exp.setHours(23, 59, 59, 0);
  try {
    await withTimeout(setDoc(doc(db, "coupons", id), {
      uid: user.uid, userEmail: user.email || "",
      code: "URODZINY" + String(year - 2000).padStart(2, "0") + "-" + user.uid.slice(0, 6).toUpperCase(),
      description: BDAY_DESC, expiresAt: Timestamp.fromDate(exp), used: false, createdAt: serverTimestamp()
    }));
    setMsg(meMsg, "🎉 Wszystkiego najlepszego! Dodaliśmy Ci urodzinowy rabat. Znajdziesz go niżej w kodach.", "ok");
  } catch (e) { console.warn("Rabat urodzinowy nie został utworzony:", e && (e.code || e.message)); }
}

function renderMy() {
  const box = $("rb-my-list");
  const cnt = $("rb-count");
  // wykorzystane i wygasłe kody znikają z konta klienta (od razu po zeskanowaniu)
  const list = myCoupons.filter((c) => !couponState(c).off)
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  if (!list.length) {
    cnt.textContent = "";
    box.innerHTML = '<div class="rb-empty2"><span class="rb-emoji">🎟️</span><b>Nie masz teraz aktywnych kodów</b><br>Zaglądaj tu — nowe kody rabatowe od nas pojawią się w tym miejscu.</div>';
    return;
  }
  cnt.textContent = "aktywne: " + list.length;
  box.innerHTML = list.map((c) => {
    const st = couponState(c);
    const ex = expiryInfo(c);
    return `<div class="rb-ticket">
      <div class="rb-ticket-top"><span class="rb-badge">✓ ${st.label}</span></div>
      <div class="rb-ticket-desc">${esc(c.description)}</div>
      <div class="rb-codebox"><span class="rb-code">${esc(c.code)}</span><button type="button" class="rb-btn secondary small rb-copy" data-act="copy" data-code="${esc(c.code)}">Kopiuj</button></div>
      <div class="rb-expiry${ex.soon ? " soon" : ""}">${ex.text}</div>
      <div class="rb-qrwrap"><div class="rb-qr" data-qr="${esc(c.code)}"></div><div class="rb-qrcap">Pokaż ten kod QR przy kasie<small>albo podaj kod słownie</small></div></div>
    </div>`;
  }).join("");
  drawQRs(box);
}

$("rb-my-list").addEventListener("click", async (e) => {
  const b = e.target.closest('[data-act="copy"]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.code); b.textContent = "Skopiowano ✓"; }
  catch (_) { b.textContent = b.dataset.code; }
  setTimeout(() => { if (b.isConnected) b.textContent = "Kopiuj"; }, 2000);
});

/* ---------- kody promocyjne: klient wpisuje kod, admin tworzy ---------- */
/* kolekcja promoCodes/{KOD}: { code, description, expiresAt|null, active, createdAt }
   Odebrany rabat to zwykły kod w coupons/promo_{KOD}_{uid} (jeden na konto), z unikalnym kodem do skanowania: KOD-XXXXXX */
const promoMsg = $("rb-promo-msg");
$("rb-promo-btn").addEventListener("click", async () => {
  setMsg(promoMsg, "");
  const user = auth.currentUser;
  if (!user) return;
  const code = $("rb-promo-in").value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(code)) { setMsg(promoMsg, "Wpisz kod: 3–20 liter lub cyfr.", "err"); return; }
  const id = "promo_" + code + "_" + user.uid;
  if (myCoupons.some((c) => c.id === id)) { setMsg(promoMsg, "Ten kod już wykorzystałeś na swoim koncie.", "err"); return; }
  const btn = $("rb-promo-btn");
  btn.disabled = true;
  try {
    const snap = await withTimeout(getDoc(doc(db, "promoCodes", code)));
    const p = snap.exists() ? snap.data() : null;
    if (!p || p.active !== true) { setMsg(promoMsg, "Nieprawidłowy kod.", "err"); return; }
    if (p.expiresAt && tsMs(p.expiresAt) < Date.now()) { setMsg(promoMsg, "Ten kod już wygasł.", "err"); return; }
    await withTimeout(setDoc(doc(db, "coupons", id), {
      uid: user.uid, userEmail: user.email || "", code: code + "-" + user.uid.slice(0, 6).toUpperCase(),
      description: p.description, expiresAt: p.expiresAt || null, used: false, createdAt: serverTimestamp(), promo: code
    }));
    $("rb-promo-in").value = "";
    setMsg(promoMsg, "Gotowe! Rabat „" + p.description + "” dodany do Twoich kodów poniżej.", "ok");
  } catch (err) {
    console.error("Kod promocyjny:", err);
    setMsg(promoMsg, err.code === "permission-denied" ? "Nie udało się. Kod mógł wygasnąć albo został już wykorzystany." : errText(err), "err");
  } finally { btn.disabled = false; }
});
$("rb-promo-in").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("rb-promo-btn").click(); } });

const pMsg = $("rb-t-msg");
$("rb-p-gen").addEventListener("click", () => { $("rb-p-code").value = "WR" + genCode(); });
function renderPromos() {
  const box = $("rb-p-list");
  if (!box) return;
  if (!allPromos.length) { box.innerHTML = '<div class="rb-empty">Nie masz jeszcze kodów promocyjnych.</div>'; return; }
  const now = Date.now();
  box.innerHTML = allPromos.map((p) => {
    const exp = p.expiresAt ? tsMs(p.expiresAt) : 0;
    const expired = exp && exp < now;
    const off = p.active !== true || expired;
    const used = allCoupons.filter((c) => c.promo === p.id).length;
    return `<div class="rb-coupon${off ? " off" : ""}">
      <div class="rb-code" style="font-size:18px">${esc(p.id)}<span class="rb-badge${off ? " bad" : ""}">${expired ? "Wygasł" : p.active === true ? "Aktywny" : "Wyłączony"}</span></div>
      <div class="rb-desc">${esc(p.description)}</div>
      <div class="rb-meta">${exp ? "ważny do " + new Date(exp).toLocaleDateString("pl-PL") : "bez terminu"} · użyto: <b>${used}</b> ${used === 1 ? "raz" : "razy"}</div>
      <div class="rb-actions">
        ${expired ? "" : `<button type="button" class="rb-btn secondary small" data-pact="toggle" data-id="${esc(p.id)}">${p.active === true ? "Wyłącz" : "Włącz"}</button>`}
        <button type="button" class="rb-btn secondary small" data-pact="del" data-id="${esc(p.id)}">Usuń</button>
      </div>
    </div>`;
  }).join("");
}
$("rb-p-list").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-pact]");
  if (!b) return;
  const p = allPromos.find((x) => x.id === b.dataset.id);
  if (!p) return;
  try {
    if (b.dataset.pact === "toggle") await updateDoc(doc(db, "promoCodes", p.id), { active: p.active !== true });
    else if (confirm("Usunąć kod promocyjny " + p.id + "? Rabaty, które klienci już odebrali, zostają.")) await deleteDoc(doc(db, "promoCodes", p.id));
  } catch (err) { console.error(err); setMsg(pMsg, errText(err), "err"); }
});

/* ---------- panel administratora ---------- */
const aMsg = $("rb-t-msg");

function renderUserSelect() {
  const sel = $("rb-a-user");
  const prev = sel.value;
  const q = $("rb-a-filter").value.trim().toLowerCase();
  const items = allUsers.filter((u) => !q || (u.email || "").toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q));
  sel.innerHTML = '<option value="">— wybierz klienta —</option><option value="__all__">★ Wszyscy klienci (' + allUsers.length + ')</option>'
    + items.map((u) => `<option value="${esc(u.id)}">${esc(u.name ? u.name + " — " : "")}${esc(u.email)}</option>`).join("");
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  else sel.value = "";
}
$("rb-a-filter").addEventListener("input", renderUserSelect);

function genCode(prefix = "") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bez 0/O/1/I
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  const body = Array.from(buf, (n) => alphabet[n % alphabet.length]).join("");
  return prefix ? prefix + "-" + body : body;
}
$("rb-a-gen").addEventListener("click", () => { $("rb-a-code").value = genCode($("rb-t-prefix").value.trim().toUpperCase()); });

const SOON_DAYS = 7;
function daysLeftText(ms) {
  const d = Math.ceil((ms - Date.now()) / 86400000);
  return d <= 0 ? "dziś" : d === 1 ? "jutro" : "za " + d + " dni";
}
function expiringSoon() {
  const now = Date.now();
  return allCoupons.filter((c) => !c.used && c.expiresAt && tsMs(c.expiresAt) > now && tsMs(c.expiresAt) <= now + SOON_DAYS * 86400000)
    .sort((a, b) => tsMs(a.expiresAt) - tsMs(b.expiresAt));
}
function renderAdminList() {
  renderStats();
  renderCheck();
  const box = $("rb-a-list");
  if (!allCoupons.length) { box.innerHTML = '<div class="rb-empty">Brak przyznanych kodów.</div>'; $("rb-l-count").textContent = ""; return; }
  const f = $("rb-l-filter").value;
  const q = normTxt($("rb-l-search").value);
  const now = Date.now();
  let list = allCoupons;
  if (f === "soon") list = expiringSoon();
  else if (f === "active") list = allCoupons.filter((c) => !couponState(c).off);
  else if (f === "used") list = allCoupons.filter((c) => c.used);
  else if (f === "expired") list = allCoupons.filter((c) => !c.used && couponState(c).off);
  if (q) list = list.filter((c) => normTxt(c.code).includes(q) || normTxt(c.userEmail).includes(q) || normTxt(c.description).includes(q));
  $("rb-l-count").textContent = "Pokazano: " + list.length + " z " + allCoupons.length;
  if (!list.length) { box.innerHTML = '<div class="rb-empty">Brak kodów w tym widoku.</div>'; return; }
  box.innerHTML = list.slice(0, 200).map((c) => {
    const st = couponState(c);
    const exp = c.expiresAt ? tsMs(c.expiresAt) : 0;
    const soon = !c.used && exp > now && exp <= now + SOON_DAYS * 86400000;
    return `<div class="rb-coupon${st.off ? " off" : ""}">
      <div class="rb-code" style="font-size:18px">${esc(c.code)}<span class="rb-badge${st.off ? " bad" : ""}">${st.label}</span>${soon ? `<span class="rb-badge warn">wygasa ${daysLeftText(exp)}</span>` : ""}</div>
      <div class="rb-desc">${esc(c.description)}</div>
      <div class="rb-meta"><b>${esc(c.userEmail)}</b> · ${exp ? "do " + new Date(exp).toLocaleDateString("pl-PL") : "bez terminu"} · przyznano ${c.createdAt ? new Date(tsMs(c.createdAt)).toLocaleDateString("pl-PL") : ""}</div>
      <div class="rb-actions">
        <button type="button" class="rb-btn secondary small" data-act="toggle" data-id="${esc(c.id)}">${c.used ? "Przywróć" : "Oznacz jako wykorzystany"}</button>
        <button type="button" class="rb-btn secondary small" data-act="del" data-id="${esc(c.id)}">Usuń</button>
      </div>
    </div>`;
  }).join("") + (list.length > 200 ? '<div class="rb-empty">Pokazano pierwsze 200. Zawęź wyszukiwanie.</div>' : "");
}
$("rb-l-filter").addEventListener("change", renderAdminList);
$("rb-l-search").addEventListener("input", renderAdminList);

$("rb-a-list").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const c = allCoupons.find((x) => x.id === b.dataset.id);
  if (!c) return;
  try {
    if (b.dataset.act === "toggle") {
      const lb = writeBatch(db);
      lb.update(doc(db, "coupons", c.id), { used: !c.used });
      lb.set(newLogRef(), logData(c.used ? "couponundo" : "coupon", { uid: c.uid, name: c.userEmail }, c.code + " (ręcznie z listy kodów)"));
      await lb.commit();
    } else if (b.dataset.act === "del") {
      if (confirm("Usunąć kod " + c.code + "?")) await deleteDoc(doc(db, "coupons", c.id));
    }
  } catch (err) {
    console.error(err);
    setMsg(aMsg, errText(err), "err");
  }
});

/* ---------- statystyki ---------- */
function renderStats() {
  const box = $("rb-stats");
  if (!box) return;
  let active = 0, used = 0, expired = 0;
  allCoupons.forEach((c) => {
    const st = couponState(c);
    if (c.used) used++; else if (st.off) expired++; else active++;
  });
  box.innerHTML = [["Klienci", allUsers.length], ["Przyznane", allCoupons.length], ["Aktywne", active], ["Wykorzystane", used], ["Wygasłe", expired]]
    .map(([label, n]) => `<div class="rb-stat"><b>${n}</b><span>${label}</span></div>`).join("");
}

/* ---------- sprawdzanie kodu ---------- */
function ownerName(c) {
  const u = allUsers.find((x) => x.id === c.uid);
  if (u) return (u.name ? u.name + " — " : "") + (u.email || "");
  return c.userEmail || "nieznany klient";
}
async function lookupCode(code) {
  if (isAdmin) return allCoupons.filter((c) => c.code === code);
  const snap = await getDocs(query(collection(db, "coupons"), where("code", "==", code)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
function renderCheck() {
  const box = $("rb-c-result");
  if (!box) return;
  if (custView && custView.target === box) return;
  if (!lastCheck) { box.innerHTML = ""; return; }
  const found = isAdmin ? allCoupons.filter((c) => c.code === lastCheck) : staffFound;
  if (!found.length) {
    box.innerHTML = `<div class="rb-res bad">❌ Nie znaleziono kodu <b>${esc(lastCheck)}</b></div>`;
    return;
  }
  box.innerHTML = found.map((c) => {
    const st = couponState(c);
    return `<div class="rb-res ${st.off ? "bad" : "ok"}">
      <div>${st.off ? "❌" : "✅"} <b>${esc(c.code)}</b> — ${st.label}</div>
      <div class="rb-desc">${esc(c.description)}</div>
      <div class="rb-meta">${esc(ownerName(c))} · ${c.expiresAt ? "ważny do " + fmtDate(c.expiresAt) : "bez terminu"}${c.used && c.usedAt ? " · wykorzystano " + fmtDateTime(c.usedAt) : ""}</div>
      ${st.off ? "" : `<div class="rb-actions"><button type="button" class="rb-btn small" data-act="use" data-id="${esc(c.id)}">Wykorzystaj</button></div>`}
    </div>`;
  }).join("");
}
async function runCheck() {
  const raw = $("rb-c-code").value.trim();
  setMsg(cMsg, "");
  if (/^kl:/i.test(raw) || raw.includes("@")) {
    lastCheck = "";
    const box = $("rb-c-result");
    try {
      let uid = /^kl:/i.test(raw) ? raw.slice(3).trim() : "";
      if (!uid) {
        const sn = await getDocs(query(collection(db, "loyalty"), where("email", "==", raw.toLowerCase())));
        uid = sn.docs[0] ? sn.docs[0].id : "";
      }
      if (!uid) { custView = null; box.innerHTML = '<div class="rb-res bad">❌ Nie znaleziono klienta o takim e-mailu (musi raz otworzyć Konto).</div>'; return; }
      await showCustomer(uid, box, false);
    } catch (err) { custView = null; setMsg(cMsg, errText(err), "err"); }
    return;
  }
  if (custView && custView.target === $("rb-c-result")) custView = null;
  lastCheck = raw.toUpperCase();
  if (!isAdmin && lastCheck) {
    try { staffFound = await lookupCode(lastCheck); }
    catch (err) { staffFound = []; setMsg(cMsg, errText(err), "err"); }
  }
  renderCheck();
}
$("rb-c-btn").addEventListener("click", runCheck);
$("rb-c-code").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runCheck(); } });
$("rb-c-result").addEventListener("click", async (e) => {
  const b = e.target.closest('[data-act="use"]');
  if (!b) return;
  setMsg(cMsg, "");
  const r = await redeem(b.dataset.id);
  if (!r.ok) setMsg(cMsg, r.reason, "err");
  if (!isAdmin) await runCheck();
});

/* ---------- dziennik zdarzeń (kto, kiedy, komu) ---------- */
function logData(type, cust, detail) {
  const u = auth.currentUser || {};
  return {
    type, byUid: u.uid || "", byName: u.displayName || u.email || "",
    customerUid: (cust && cust.uid) || "", customerName: (cust && cust.name) || "",
    detail: detail || "", at: serverTimestamp()
  };
}
const newLogRef = () => doc(collection(db, "logs"));

/* ---------- skan karty klienta: pieczątki, nagroda, rabaty ---------- */
async function loadCustomer(uid) {
  const [ls, cs] = await Promise.all([
    getDoc(doc(db, "loyalty", uid)),
    getDocs(query(collection(db, "coupons"), where("uid", "==", uid)))
  ]);
  const out = { loyal: ls.exists() ? ls.data() : null, coupons: cs.docs.map((d) => ({ id: d.id, ...d.data() })), pts: null, logs: [], fb: [] };
  if (isAdmin) {
    try {
      const [ps, lg, fb] = await Promise.all([
        getDoc(doc(db, "points", uid)),
        getDocs(query(collection(db, "logs"), where("customerUid", "==", uid))),
        getDocs(query(collection(db, "feedback"), where("uid", "==", uid)))
      ]);
      out.pts = ps.exists() ? ps.data() : null;
      out.logs = lg.docs.map((d) => d.data()).sort((a, b) => tsMs(b.at) - tsMs(a.at)).slice(0, 25);
      out.fb = fb.docs.map((d) => d.data()).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)).slice(0, 5);
    } catch (e) { console.error(e); }
  }
  return out;
}
/* karta klienta w Klienci (tylko admin): podgląd „tak widzi klient”, pełna kontrola, historia */
function adminCustHtml(uid, L, data) {
  const lv = curLevels(), cur = Number.isInteger(L.rankSet) ? L.rankSet : -1;
  const hist = data.logs.map((e) => `<div><b>${esc(EV_LABEL[e.type] || e.type)}</b> · ${esc(fmtDateTime(e.at))} · ${esc(e.byName || "")}${e.detail ? " — " + esc(e.detail) : ""}</div>`).join("")
    + data.fb.map((f) => `<div>⭐ Ocena ${esc(String(f.rating))}/5 · ${esc(fmtDateTime(f.createdAt))}${f.comment ? " — „" + esc(f.comment) + "”" : ""}</div>`).join("");
  const pts = data.pts ? Number(data.pts.points) || 0 : 0;
  return `<details class="rb-adm-box" open><summary>👁 Tak widzi to klient</summary>${siteCfg.levelsOn ? `<div class="rb-level">${rankHtml(L, true, uid)}</div>` : '<div class="rb-meta">Rangi są wyłączone (Strona → Lojalność), więc klient ich nie widzi.</div>'}</details>
    <details class="rb-adm-box"><summary>🛠 Pełna kontrola (tylko admin)</summary>
      <div class="rb-adm-row"><div><label>Ranga (nadana ręcznie)</label><select class="rb-adm-rank"><option value="-1"${cur < 0 ? " selected" : ""}>Automatyczna (z darmowych pizz)</option>${lv.map((l, i) => `<option value="${i}"${cur === i ? " selected" : ""}>${esc(l.ic)} ${esc(l.n)} (co najmniej)</option>`).join("")}</select></div><button type="button" class="rb-btn small" data-act="adm-rank">Zapisz rangę</button></div>
      <div class="rb-meta">Ranga ręczna działa jako minimum: klient nigdy nie spadnie poniżej niej, a wyższą dostanie normalnie z darmowych pizz.</div>
      <div class="rb-adm-row"><div><label>Pieczątki na karcie (0–${LOYAL_GOAL})</label><input type="number" class="rb-adm-st" min="0" max="${LOYAL_GOAL}" step="1" value="${Math.min(LOYAL_GOAL, L.stamps || 0)}"></div><div><label>Darmowe pizze (odebrane)</label><input type="number" class="rb-adm-rw" min="0" max="9999" step="1" value="${rewardsOf(L)}"></div><div><label>Pieczątki łącznie</label><input type="number" class="rb-adm-tot" min="0" max="99999" step="1" value="${L.total || 0}"></div><button type="button" class="rb-btn small" data-act="adm-card">Zapisz kartę</button></div>
      <div class="rb-adm-row"><div><label>Punkty z gier (saldo: ${pts})</label><input type="number" class="rb-adm-pts" step="1" min="-10000" max="10000" placeholder="np. 20 lub -10"></div><button type="button" class="rb-btn small" data-act="adm-pts">Dodaj / odejmij</button></div>
    </details>
    <details class="rb-adm-box"><summary>📜 Historia klienta${data.logs.length ? " (" + data.logs.length + ")" : ""}</summary><div class="rb-hist">${hist || '<div class="rb-meta">Brak wpisów w dzienniku.</div>'}</div></details>`;
}
async function showCustomer(uid, target, withNext) {
  custView = { uid, target, withNext: !!withNext, data: null };
  try { custView.data = await loadCustomer(uid); }
  catch (err) { console.error(err); target.innerHTML = '<div class="rb-res bad">❌ ' + esc(errText(err)) + "</div>"; custView = null; return; }
  renderCustomer();
}
/* ---------- cennik i kalkulator zamówienia dla kasy (aktualne ceny ze strony) ---------- */
let posCart = {}, posUse = {}, posUid = "", posOpen = false;
const POS_PIZZA = ["klasyczne", "miesne", "vege"];
const posMoney = (n) => (Math.round(n * 100) / 100).toFixed(2).replace(".", ",") + " zł";
function posItems() {
  return menuEls().filter((e) => !e.classList.contains("is-hidden")).map((e) => {
    const pt = ((e.querySelector(".menu-item-price") || {}).textContent || "").trim();
    const nums = pt.match(/\d+(?:[.,]\d+)?/g) || [];
    const cats = String(e.dataset.category || "").split(/\s+/).filter(Boolean);   // pozycja może należeć do kilku kategorii, np. „klasyczne miesne”
    const cat = cats.find((c) => PROD_CATS.some((x) => x[0] === c)) || "dodatki";
    return { key: itemKey(e), name: itemName(e).replace(/^\s*\d+\.\s*/, ""), cat, pizza: cats.some((c) => POS_PIZZA.includes(c)), priceText: pt, price: nums.length === 1 ? Number(nums[0].replace(",", ".")) : null, un: e.classList.contains("is-unavail") };
  });
}
function posDiscount(desc, sum, pizzaSum) {
  const m = String(desc || "").trim().match(/^-\s*(\d+(?:[.,]\d+)?)\s*(%|zł)\s+na\s+(.+)$/i);
  if (!m) return null;
  const v = Number(m[1].replace(",", ".")), scope = m[3].toLowerCase();
  const base = /pizz/.test(scope) ? pizzaSum : /zamówieni|całe/.test(scope) ? sum : null;
  if (base === null) return null;
  return m[2] === "%" ? base * v / 100 : Math.min(v, base);
}
function posBody(active) {
  const items = posItems();
  let sum = 0, pizzaSum = 0;
  items.forEach((it) => { const q = posCart[it.key] || 0; if (q && it.price !== null) { sum += q * it.price; if (it.pizza) pizzaSum += q * it.price; } });
  const rows = PROD_CATS.map(([k, n]) => {
    const list = items.filter((it) => it.cat === k);
    if (!list.length) return "";
    return `<div class="rb-pos-cat">${esc(n)}</div>` + list.map((it) => {
      const q = posCart[it.key] || 0;
      return `<div class="rb-pos-row${it.un ? " un" : ""}"><span class="nm">${esc(it.name)}${it.un ? " <i>niedostępne</i>" : ""}</span><span class="pr">${esc(it.priceText)}</span>`
        + (it.price === null ? "" : `<span class="qty"><button type="button" data-pos="-" data-k="${esc(it.key)}" aria-label="Mniej"${q ? "" : " disabled"}>−</button><b>${q}</b><button type="button" data-pos="+" data-k="${esc(it.key)}" aria-label="Więcej"${it.un ? " disabled" : ""}>+</button></span>`) + "</div>";
    }).join("");
  }).join("");
  let disc = 0, cps = "";
  active.forEach((c) => {
    const d = posDiscount(c.description, sum, pizzaSum), on = !!posUse[c.id];
    if (d !== null && on) disc += Math.min(d, Math.max(0, sum - disc));
    cps += `<label class="rb-pos-cp"><input type="checkbox" data-pos="cp" data-id="${esc(c.id)}"${on ? " checked" : ""}${d === null ? " disabled" : ""}> Kod <b>${esc(c.code)}</b>: ${esc(c.description)}${d === null ? " <i>(odlicz ręcznie)</i>" : sum ? " → −" + posMoney(d) : ""}</label>`;
  });
  const total = Math.max(0, sum - disc);
  return `<div class="rb-pos-list">${rows || '<div class="rb-meta">Brak pozycji w menu.</div>'}</div>`
    + (cps ? `<div class="rb-pos-cps">${cps}</div>` : "")
    + `<div class="rb-pos-sum"><div>Suma: <b>${posMoney(sum)}</b></div>${disc ? `<div>Zniżki z kodów: −${posMoney(disc)}</div>` : ""}<div class="tot">Do zapłaty: ${posMoney(total)}</div><div class="rb-meta">Przywilej rangi i pizzę gratis z karty odlicz ręcznie na kasie.</div></div>`
    + `<button type="button" class="rb-btn secondary small" data-pos="clear">Wyczyść zamówienie</button>`;
}
function posSync(uid) { if (uid !== posUid) { posUid = uid; posCart = {}; posUse = {}; } }
function posClick(b) {
  const a = b.dataset.pos;
  if (a === "+" || a === "-") posCart[b.dataset.k] = Math.max(0, Math.min(99, (posCart[b.dataset.k] || 0) + (a === "+" ? 1 : -1)));
  else if (a === "cp") posUse[b.dataset.id] = b.checked;
  else if (a === "clear") { posCart = {}; posUse = {}; }
  const box = custView && custView.target.querySelector(".rb-pos-body");
  if (box) box.innerHTML = posBody(custView.data.coupons.filter((c) => !couponState(c).off));
}
['rb-s-result', 'rb-c-result', 'rb-k-card'].forEach((id) => { const t = $(id); if (t) t.addEventListener("toggle", (e) => { if (e.target.classList && e.target.classList.contains("rb-pos")) posOpen = e.target.open; }, true); });

function renderCustomer() {
  if (!custView || !custView.data) return;
  const { uid, target, withNext, data } = custView;
  const L = data.loyal;
  const active = data.coupons.filter((c) => !couponState(c).off);
  let head, body = "";
  if (!L) {
    head = '<div class="rb-big">👤 Klient bez karty</div><div class="rb-meta">Ten klient musi raz otworzyć zakładkę Konto na swoim telefonie.</div>';
  } else {
    const n = Math.min(LOYAL_GOAL, L.stamps || 0);
    const full = n >= LOYAL_GOAL;
    const last = L.lastStampAt && L.lastStampAt.toDate ? L.lastStampAt.toDate() : null;
    const next = last ? new Date(last.getTime() + STAMP_COOLDOWN_H * 3600000) : null;
    const cool = !isAdmin && next && next > new Date();
    const lastMs = Math.max(tsMs(L.lastStampAt), tsMs(L.lastRewardAt));
    const uu = allUsers.find((x) => x.id === uid) || {};
    const adminInfo = isAdmin
      ? `<div class="rb-meta">🎂 ${esc(bdayFull(uu))} · ✉ zgoda na e-mail: ${uu.marketing === true ? "tak" : "nie"}</div><div class="rb-meta">Konto od: ${L.createdAt ? new Date(tsMs(L.createdAt)).toLocaleDateString("pl-PL") : "—"} · ostatnia wizyta: ${lastMs ? new Date(lastMs).toLocaleDateString("pl-PL") + " (" + agoText(lastMs) + ")" : "jeszcze nie było"}</div>`
      : "";
    const LI = siteCfg.levelsOn ? rankOf(L) : null;
    const lvUpNow = !!(LI && LI.next && (L.stamps || 0) >= LOYAL_GOAL && rewardsOf(L) + 1 >= LI.next.from);
    const lvLine = LI ? `<div class="rb-meta">🏅 Ranga: <b>${esc(LI.lvl.ic)} ${esc(LI.lvl.n)}</b>${LI.lvl.perk ? " — przywilej: <b>" + esc(LI.lvl.perk) + "</b>" : ""}${LI.next ? " · do " + esc(LI.next.ic + " " + LI.next.n) + ": " + LI.left + " " + pizzaWord(LI.left) + " gratis" : ""}</div>${lvUpNow ? `<div class="rb-lv-up">⭐ Wydanie tej pizzy gratis awansuje klienta na rangę ${esc(LI.next.ic + " " + LI.next.n)}!</div>` : ""}` : "";
    /* ściąga dla kasy: co należy się temu klientowi przy płaceniu */
    const kasa = [];
    if (LI && LI.idx >= 1 && LI.lvl.perk) kasa.push(`<li>${esc(LI.lvl.ic)} <b>${esc(LI.lvl.n)}</b>: ${esc(LI.lvl.perk)}</li>`);
    if (full) kasa.push(`<li>🍕 Karta pełna: <b>pizza gratis (1 szt.)</b> — wydaj ją przyciskiem poniżej</li>`);
    active.forEach((c) => kasa.push(`<li>🎟 Kod <b>${esc(c.code)}</b>: ${esc(c.description)}</li>`));
    if (isAdmin && bdayInDays(uu) === 0) kasa.push(`<li>🎂 <b>Dziś ma urodziny</b></li>`);
    const kasaHtml = `<div class="rb-kasa"><div class="rb-kasa-h">💰 Do nabicia na kasie</div>${kasa.length ? "<ul>" + kasa.join("") + "</ul>" : '<div class="rb-kasa-none">Brak zniżek — pełna cena.</div>'}</div>`;
    head = `<div class="rb-big">👤 ${esc(L.name || L.email)}</div><div class="rb-meta">${esc(L.email)} · pieczątek łącznie: ${L.total || 0} · darmowe pizze: ${L.rewards || 0}</div>${kasaHtml}${lvLine}${adminInfo}
      <div class="rb-stamps">${stampDots(n)}</div>
      <div class="rb-loyal-txt"><b>${n} / ${LOYAL_GOAL}</b>${full ? " — 🎉 należy się pizza gratis (1 szt.)" : ""}</div>`;
    body = `<div class="rb-actions">
      ${full
        ? `<button type="button" class="rb-btn small" data-act="reward">🍕 Wydaj pizzę gratis</button>`
        : `<button type="button" class="rb-btn small" data-act="stamp"${cool ? " disabled" : ""}>➕ Dodaj pieczątkę</button>`}
      ${isAdmin && n > 0 && !full ? `<button type="button" class="rb-btn secondary small" data-act="unstamp">↩ Cofnij pieczątkę</button>` : ""}
    </div>${cool ? `<div class="rb-meta" style="margin-top:6px">Pieczątka była dodana ${fmtDateTime(L.lastStampAt)} — kolejna możliwa po ${next.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}.</div>` : ""}`;
  }
  const cps = active.length
    ? `<div class="rb-cust-sub">Aktywne rabaty klienta</div>` + active.map((c) => `<div class="rb-cust-cp"><span><b>${esc(c.code)}</b><br>${esc(c.description)}</span><button type="button" class="rb-btn small" data-act="cuse" data-id="${esc(c.id)}">Wykorzystaj</button></div>`).join("")
    : `<div class="rb-cust-sub">Klient nie ma aktywnych rabatów</div>`;
  posSync(uid);
  const posBox = `<details class="rb-pos"${posOpen ? " open" : ""}><summary>🧾 Cennik i kalkulator zamówienia</summary><div class="rb-pos-body">${posBody(active)}</div></details>`;
  const admBox = isAdmin && L && target.id === "rb-k-card" ? adminCustHtml(uid, L, data) : "";
  target.innerHTML = `<div class="rb-res big ok rb-cust">${head}${body}${cps}${posBox}${admBox}
    <div class="rb-actions" style="margin-top:10px">
      ${isAdmin ? `<button type="button" class="rb-btn secondary small" data-act="grant">🎟 Przyznaj rabat</button>` : ""}
      ${withNext ? `<button type="button" class="rb-btn secondary small" data-act="next">Skanuj następny</button>` : ""}
      ${target.id === "rb-k-card" ? `<button type="button" class="rb-btn secondary small" data-act="kclose">✕ Zamknij kartę</button>` : ""}
    </div></div>`;
}
async function customerClick(e) {
  const pb = e.target.closest("[data-pos]");
  if (pb && custView) { posClick(pb); return; }
  const b = e.target.closest('[data-act="stamp"],[data-act="reward"],[data-act="unstamp"],[data-act="grant"],[data-act="cuse"],[data-act="adm-rank"],[data-act="adm-card"],[data-act="adm-pts"]');
  if (!b || !custView) return;
  const act = b.dataset.act;
  let okAct = false;
  const msg = custView.target === $("rb-s-result") ? sMsg : custView.target === $("rb-k-card") ? $("rb-k-msg") : cMsg;
  setMsg(msg, "");
  if (act === "grant") {
    setAdminTab("grant");
    $("rb-a-filter").value = "";
    renderUserSelect();
    $("rb-a-user").value = custView.uid;
    $("rb-n-mode").scrollIntoView({ block: "center" });
    return;
  }
  const ref = doc(db, "loyalty", custView.uid);
  b.disabled = true;
  try {
    if (act === "stamp") {
      const r = await stampTx(custView.uid);
      buzz(150);
      okAct = true;
      scanHistPush(r.name, "➕ pieczątka " + r.n + "/" + LOYAL_GOAL);
    } else if (act === "reward") {
      await runTransaction(db, async (tx) => {
        const sn = await tx.get(ref);
        const d = sn.exists() ? sn.data() : {};
        if ((d.stamps || 0) < LOYAL_GOAL) throw new Error("Karta nie jest jeszcze pełna.");
        tx.update(ref, { stamps: 0, rewards: (d.rewards || 0) + 1, lastRewardAt: serverTimestamp() });
        tx.set(newLogRef(), logData("reward", { uid: custView.uid, name: d.name || d.email }, "pizza gratis nr " + ((d.rewards || 0) + 1)));
      });
      buzz([100, 50, 100]);
      okAct = true;
      scanHistPush(custName(), "🍕 pizza gratis");
    } else if (act === "unstamp") {
      if (!confirm("Cofnąć ostatnią pieczątkę?")) { b.disabled = false; return; }
      await runTransaction(db, async (tx) => {
        const sn = await tx.get(ref);
        const d = sn.data();
        tx.update(ref, { stamps: Math.max(0, (d.stamps || 0) - 1), total: Math.max(0, (d.total || 0) - 1), lastStampAt: null });
        tx.set(newLogRef(), logData("unstamp", { uid: custView.uid, name: d.name || d.email }, "cofnięto do " + Math.max(0, (d.stamps || 0) - 1) + "/" + LOYAL_GOAL));
      });
    } else if (act === "adm-rank" && isAdmin) {
      const v = Number(custView.target.querySelector(".rb-adm-rank").value);
      await updateDoc(ref, { rankSet: Number.isInteger(v) && v >= 0 ? v : null, adjustedAt: serverTimestamp() });
      setMsg(msg, v >= 0 ? "✅ Nadano rangę ręcznie." : "✅ Ranga znów liczona automatycznie.", "ok");
    } else if (act === "adm-card" && isAdmin) {
      const q = (c) => Number(custView.target.querySelector(c).value), st = q(".rb-adm-st"), rw = q(".rb-adm-rw"), tot = q(".rb-adm-tot");
      if (![st, rw, tot].every(Number.isInteger) || st < 0 || st > LOYAL_GOAL || rw < 0 || rw > 9999 || tot < 0 || tot > 99999) throw new Error("Wpisz poprawne liczby całkowite (pieczątki 0–" + LOYAL_GOAL + ").");
      if (!confirm("Zapisać kartę: " + st + "/" + LOYAL_GOAL + " pieczątek, " + rw + " darmowych pizz, " + tot + " pieczątek łącznie?")) { b.disabled = false; return; }
      await updateDoc(ref, { stamps: st, rewards: rw, total: tot, adjustedAt: serverTimestamp() });
      setMsg(msg, "✅ Karta zapisana.", "ok");
    } else if (act === "adm-pts" && isAdmin) {
      const dlt = Number(custView.target.querySelector(".rb-adm-pts").value);
      if (!Number.isInteger(dlt) || dlt === 0 || Math.abs(dlt) > 10000) throw new Error("Wpisz niezerową liczbę całkowitą punktów (do 10000).");
      const pref = doc(db, "points", custView.uid);
      await runTransaction(db, async (tx) => {
        const sn = await tx.get(pref);
        if (sn.exists()) tx.update(pref, { points: Math.max(0, (Number(sn.data().points) || 0) + dlt) });
        else tx.set(pref, { points: Math.max(0, dlt), total: 0, dayPts: 0, redeemN: 0, lastAt: null, createdAt: serverTimestamp() });
      });
      setMsg(msg, "✅ Saldo punktów zmienione o " + dlt + ".", "ok");
    } else if (act === "cuse") {
      const r = await redeem(b.dataset.id);
      if (!r.ok) { setMsg(msg, r.reason, "err"); beep("err"); } else { buzz(200); okAct = true; scanHistPush(custName(), "🎟 rabat"); }
    }
  } catch (err) {
    console.error(err);
    beep("err");
    setMsg(msg, err.code === "permission-denied"
      ? "Odmowa: za krótko od poprzedniej pieczątki (min. " + STAMP_COOLDOWN_H + " h) albo nowe reguły nie są opublikowane."
      : (err.code ? errText(err) : err.message), "err");
  }
  try {
    if (!custView) return;
    custView.data = await loadCustomer(custView.uid);
    renderCustomer();
    syncLoyalCache(custView.uid, custView.data.loyal);
  } catch (_) {}
  if (okAct && custView && custView.target === $("rb-s-result")) autoResume();
}
$("rb-s-result").addEventListener("click", customerClick);
$("rb-c-result").addEventListener("click", customerClick);
$("rb-k-card").addEventListener("click", (e) => {
  const x = e.target.closest('[data-act="kclose"]');
  if (x) { custView = null; $("rb-k-card").innerHTML = ""; return; }
  customerClick(e);
});

/* ---------- szablony rabatów ---------- */
const DEFAULT_TPL = ["-10% na całe zamówienie", "-20% na pizzę", "-5 zł na zamówienie", "Sos do pizzy za 1 zł", "Frytki za 1 zł", "Dowóz za 1 zł"];

function renderTemplates() {
  const sel = $("rb-n-from");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— wybierz gotowy rabat —</option>'
    + DEFAULT_TPL.map((t, i) => `<option value="d:${i}">${esc(t)}</option>`).join("")
    + allTemplates.map((t) => `<option value="c:${esc(t.id)}">★ ${esc(t.text)}</option>`).join("");
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  renderOwnList();
}
/* ---------- gotowe rabaty: wybór w zakładce Przyznaj ---------- */
function ymd(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
/* ---------- jeden kreator rabatów: co → opis → ważność → komu ---------- */
const tMsg = $("rb-t-msg");
let tTextTouched = false;
let nMode = "grant";
const NMODE_LABEL = { grant: "Przyznaj kod", promo: "Utwórz kod promocyjny", save: "Zapisz rabat" };

function buildText() {
  const type = $("rb-t-type").value;
  const raw = $("rb-t-value").value.trim();
  const val = raw.replace(",", ".");
  const scope = $("rb-t-scope").value.trim();
  if (!raw) return "";
  if (type === "percent") return "-" + val + "% na " + (scope || "całe zamówienie");
  if (type === "amount") return "-" + val + " zł na " + (scope || "zamówienie");
  if (type === "free") return raw + " za 1 zł";
  return "";
}
function syncBuilder() {
  const type = $("rb-t-type").value;
  const isFree = type === "free", isCustom = type === "custom";
  const vi = $("rb-t-value");
  $("rb-t-valwrap").hidden = isCustom;
  $("rb-t-scopewrap").hidden = isCustom || isFree;
  $("rb-t-hint1").hidden = isCustom || isFree;
  vi.type = isFree ? "text" : "number";
  vi.placeholder = isFree ? "np. sos czosnkowy" : (type === "percent" ? "np. 20" : "np. 5");
  $("rb-t-vallabel").textContent = type === "percent" ? "Ile procent (%)" : type === "amount" ? "Ile złotych (zł)" : "Jaki produkt za 1 zł";
  document.querySelectorAll("#rb-t-seg button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === type ? "true" : "false"));
  if (!tTextTouched) $("rb-t-text").value = buildText();
}
document.querySelectorAll("#rb-t-seg button").forEach((b) => b.addEventListener("click", () => {
  const sel = $("rb-t-type");
  if (sel.value !== b.dataset.v) { sel.value = b.dataset.v; sel.dispatchEvent(new Event("change")); }
}));
$("rb-t-type").addEventListener("change", () => { $("rb-t-value").value = ""; tTextTouched = false; syncBuilder(); });
["rb-t-value", "rb-t-scope"].forEach((id) => $(id).addEventListener("input", () => { if (!tTextTouched) $("rb-t-text").value = buildText(); }));
$("rb-t-text").addEventListener("input", () => { tTextTouched = $("rb-t-text").value !== ""; });
syncBuilder();

/* tryb („komu”) i sekcje zakładki */
function setNMode(m) {
  if (!NMODE_LABEL[m]) m = "grant";
  nMode = m;
  document.querySelectorAll("#rb-n-mode button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === m ? "true" : "false"));
  $("rb-n-grant").hidden = m !== "grant";
  $("rb-n-promo").hidden = m !== "promo";
  $("rb-n-save").hidden = m !== "save";
  $("rb-n-keepwrap").hidden = m === "save";
  $("rb-n-go").textContent = NMODE_LABEL[m];
}
document.querySelectorAll("#rb-n-mode button").forEach((b) => b.addEventListener("click", () => setNMode(b.dataset.m)));
function setNSec(sec) {
  document.querySelectorAll("#rb-n-sub button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.sec === sec ? "true" : "false"));
  document.querySelectorAll("#rabat-overlay .rb-nsec").forEach((x) => { x.hidden = x.dataset.sec !== sec; });
}
document.querySelectorAll("#rb-n-sub button").forEach((b) => b.addEventListener("click", () => setNSec(b.dataset.sec)));
setNMode("grant");
setNSec("new");

/* wczytanie gotowego rabatu do formularza */
function fillSpec(t) {
  const type = ["percent", "amount", "free", "custom"].includes(t.type) ? t.type : "custom";
  $("rb-t-type").value = type;
  tTextTouched = false;
  syncBuilder();
  $("rb-t-value").value = t.value == null ? "" : String(t.value);
  $("rb-t-scope").value = t.scope || "";
  $("rb-t-days").value = t.validDays || "";
  $("rb-t-prefix").value = t.prefix || "";
  $("rb-n-exp").value = "";
  $("rb-t-text").value = t.text || "";
  tTextTouched = true;
}
$("rb-n-from").addEventListener("change", () => {
  const v = $("rb-n-from").value;
  if (!v) return;
  if (v[0] === "d") fillSpec({ type: "custom", text: DEFAULT_TPL[Number(v.slice(2))] || "" });
  else { const t = allTemplates.find((x) => x.id === v.slice(2)); if (t) fillSpec(t); }
});

/* odczyt i sprawdzenie formularza (kroki 1–3) */
function readSpec() {
  const type = $("rb-t-type").value;
  const rawVal = $("rb-t-value").value.trim().replace(",", ".");
  const scope = $("rb-t-scope").value.trim();
  const text = $("rb-t-text").value.trim();
  const daysRaw = $("rb-t-days").value.trim();
  const expRaw = $("rb-n-exp").value;
  const prefix = $("rb-t-prefix").value.trim().toUpperCase();
  let value = null;
  if (type === "percent") {
    value = Number(rawVal);
    if (!(value >= 1 && value <= 100)) { setMsg(tMsg, "Procent: liczba od 1 do 100.", "err"); return null; }
  } else if (type === "amount") {
    value = Number(rawVal);
    if (!(value > 0 && value <= 1000)) { setMsg(tMsg, "Kwota: liczba większa od 0 (do 1000 zł).", "err"); return null; }
  } else if (type === "free") {
    value = $("rb-t-value").value.trim();
    if (!value) { setMsg(tMsg, "Wpisz, jaki produkt ma być za 1 zł.", "err"); return null; }
  }
  if (!text) { setMsg(tMsg, "Wpisz opis rabatu.", "err"); return null; }
  let validDays = null;
  if (daysRaw) {
    validDays = Math.floor(Number(daysRaw));
    if (!(validDays >= 1 && validDays <= 3650)) { setMsg(tMsg, "Ważność: liczba dni od 1 do 3650.", "err"); return null; }
  }
  if (prefix && !/^[A-Z0-9-]{2,12}$/.test(prefix)) { setMsg(tMsg, "Przedrostek: 2–12 znaków (litery, cyfry, myślnik).", "err"); return null; }
  let expiresAt = null;
  if (expRaw) {
    const dt = new Date(expRaw + "T23:59:59");
    if (isNaN(dt.getTime()) || dt.getTime() < Date.now()) { setMsg(tMsg, "Data ważności jest w przeszłości.", "err"); return null; }
    expiresAt = Timestamp.fromDate(dt);
  } else if (validDays) {
    const d = new Date();
    d.setDate(d.getDate() + validDays);
    d.setHours(23, 59, 59, 0);
    expiresAt = Timestamp.fromDate(d);
  }
  return { type, value, scope: (type === "percent" || type === "amount") && scope ? scope : null, text, validDays, prefix, expiresAt, expRaw };
}
const isDupTpl = (text) => allTemplates.some((t) => t.text === text) || DEFAULT_TPL.includes(text);
async function saveTemplate(sp) {
  await addDoc(collection(db, "templates"), {
    text: sp.text, type: sp.type, value: sp.value, scope: sp.scope,
    validDays: sp.validDays, prefix: sp.prefix || null, createdAt: serverTimestamp()
  });
}
function resetCreator() {
  ["rb-t-value", "rb-t-scope", "rb-t-text", "rb-t-days", "rb-t-prefix", "rb-n-exp", "rb-a-code", "rb-p-code"].forEach((id) => { $(id).value = ""; });
  $("rb-n-keep").checked = false;
  $("rb-a-user").value = "";
  $("rb-n-from").value = "";
  tTextTouched = false;
  syncBuilder();
}

$("rb-p-gen").addEventListener("click", () => { $("rb-p-code").value = "WR" + genCode(); });

/* krok 4: wykonanie zależnie od trybu */
async function runGrant(sp) {
  const sel = $("rb-a-user").value;
  const codeIn = $("rb-a-code").value.trim().toUpperCase();
  if (!sel) { setMsg(tMsg, "Wybierz klienta.", "err"); return false; }
  if (sel === "__all__") {
    const prefix = codeIn || sp.prefix || "";
    if (prefix && !/^[A-Z0-9-]{2,18}$/.test(prefix)) { setMsg(tMsg, "Przedrostek: 2–18 znaków (litery, cyfry, myślnik).", "err"); return false; }
    if (!allUsers.length) { setMsg(tMsg, "Nie ma jeszcze żadnych klientów.", "err"); return false; }
    if (!confirm("Przyznać ten rabat WSZYSTKIM klientom (" + allUsers.length + ")?")) return false;
    const taken = new Set(allCoupons.map((c) => c.code));
    let n = 0;
    for (let i = 0; i < allUsers.length; i += 400) {
      const batch = writeBatch(db);
      allUsers.slice(i, i + 400).forEach((u) => {
        let code;
        do { code = genCode(prefix); } while (taken.has(code));
        taken.add(code);
        batch.set(doc(collection(db, "coupons")), {
          uid: u.id, userEmail: u.email || "", code, description: sp.text, expiresAt: sp.expiresAt, used: false, createdAt: serverTimestamp()
        });
        n++;
      });
      await batch.commit();
    }
    setMsg(tMsg, "Przyznano " + n + " kodów" + (prefix ? " (" + prefix + "-XXXXXX)" : "") + ", każdy klient ma własny.", "ok");
  } else {
    const user = allUsers.find((u) => u.id === sel);
    if (!user) { setMsg(tMsg, "Wybierz klienta.", "err"); return false; }
    let code = codeIn;
    if (!code) { code = genCode(sp.prefix || ""); $("rb-a-code").value = code; }
    if (!/^[A-Z0-9-]{3,30}$/.test(code)) { setMsg(tMsg, "Kod: 3–30 znaków (litery, cyfry, myślnik).", "err"); return false; }
    if (allCoupons.some((c) => c.code === code)) { setMsg(tMsg, "Taki kod już istnieje. Wpisz inny albo kliknij Losuj.", "err"); return false; }
    await addDoc(collection(db, "coupons"), {
      uid: user.id, userEmail: user.email || "", code, description: sp.text, expiresAt: sp.expiresAt, used: false, createdAt: serverTimestamp()
    });
    setMsg(tMsg, "Kod " + code + " przyznany: " + (user.email || ""), "ok");
  }
  return true;
}
async function runPromo(sp) {
  const code = $("rb-p-code").value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(code)) { setMsg(tMsg, "Kod: 3–20 liter i cyfr (bez spacji i polskich znaków).", "err"); return false; }
  if (allPromos.some((p) => p.id === code)) { setMsg(tMsg, "Taki kod promocyjny już istnieje.", "err"); return false; }
  await setDoc(doc(db, "promoCodes", code), { code, description: sp.text, expiresAt: sp.expiresAt, active: true, createdAt: serverTimestamp() });
  setMsg(tMsg, "Kod " + code + " utworzony. Klient wpisuje go w Koncie, w polu „Masz kod promocyjny?”.", "ok");
  return true;
}
$("rb-n-go").addEventListener("click", async () => {
  setMsg(tMsg, "");
  const sp = readSpec();
  if (!sp) return;
  const btn = $("rb-n-go");
  btn.disabled = true;
  try {
    if (nMode === "save") {
      if (sp.expRaw) { setMsg(tMsg, "Do zapisania na później podaj ważność w dniach (bez daty).", "err"); return; }
      if (isDupTpl(sp.text)) { setMsg(tMsg, "Taki rabat już istnieje.", "err"); return; }
      await saveTemplate(sp);
      setMsg(tMsg, "Rabat zapisany na liście „Gotowe”.", "ok");
      resetCreator();
      return;
    }
    const done = nMode === "promo" ? await runPromo(sp) : await runGrant(sp);
    if (!done) return;
    const keep = $("rb-n-keep").checked;
    if (keep && !sp.expRaw && !isDupTpl(sp.text)) { await saveTemplate(sp); tMsg.textContent += " Zapisano też na liście „Gotowe”."; }
    resetCreator();
  } catch (err) {
    console.error(err);
    setMsg(tMsg, err.code === "permission-denied" ? "Brak uprawnień. Opublikuj reguły z pliku firestore.rules." : errText(err), "err");
  } finally { btn.disabled = false; }
});

function renderOwnList() {
  const box = $("rb-t-list");
  if (!box) return;
  if (!allTemplates.length) { box.innerHTML = '<div class="rb-empty">Nie masz jeszcze własnych rabatów. Zapisz pierwszy w kreatorze („Tylko zapisz”).</div>'; return; }
  const TT = { percent: ["%", "Procent"], amount: ["zł", "Kwota"], free: ["🍕", "Za 1 zł"], custom: ["✎", "Własny"] };
  box.innerHTML = allTemplates.map((t) => {
    const k = TT[t.type] || TT.custom;
    return `<div class="rb-tcard">
      <div class="rb-tic" aria-hidden="true">${k[0]}</div>
      <div class="rb-tbody">
        <div class="rb-ttxt">${esc(t.text)}</div>
        <div class="rb-tchips"><span>${k[1]}</span><span>${t.validDays ? "ważny " + esc(t.validDays) + " dni" : "bez terminu"}</span>${t.prefix ? "<span>kod " + esc(t.prefix) + "-XXXXXX</span>" : ""}</div>
      </div>
      <div class="rb-tact">
        <button type="button" class="rb-btn small" data-act="grant" data-id="${esc(t.id)}">Użyj</button>
        <button type="button" class="rb-btn secondary small" data-act="del" data-id="${esc(t.id)}">Usuń</button>
      </div>
    </div>`;
  }).join("");
}
$("rb-t-list").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.act === "grant") {
    setNSec("new");
    $("rb-n-from").value = "c:" + id;
    $("rb-n-from").dispatchEvent(new Event("change"));
    $("rb-n-from").scrollIntoView({ block: "start" });
  } else if (b.dataset.act === "del") {
    const t = allTemplates.find((x) => x.id === id);
    if (!t || !confirm("Usunąć rabat „" + t.text + "”? Już przyznane kody zostaną.")) return;
    try { await deleteDoc(doc(db, "templates", id)); }
    catch (err) { console.error(err); setMsg(tMsg, errText(err), "err"); }
  }
});

/* ---------- konta obsługi (skanowanie) ---------- */
const stMsg = $("rb-st-msg");
let staffApp = null;
function renderStaff() {
  const box = $("rb-st-list");
  if (!box) return;
  if (!allStaff.length) { box.innerHTML = '<div class="rb-empty">Brak kont obsługi.</div>'; return; }
  box.innerHTML = allStaff.map((u) => `<div class="rb-res"><div><b>${esc(u.name || u.email)}</b></div>
    <div class="rb-meta">${esc(u.email)}</div>
    <div class="rb-actions"><button type="button" class="rb-btn secondary small" data-act="revoke" data-id="${esc(u.id)}">Odbierz dostęp</button></div></div>`).join("");
}
async function grantStaff(uid, email, name) {
  await setDoc(doc(db, "staff", uid), { email, name: name || "", createdAt: serverTimestamp() });
}
$("rb-st-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg(stMsg, "");
  const name = $("rb-st-name").value.trim();
  const email = $("rb-st-email").value.trim().toLowerCase();
  const pass = $("rb-st-pass").value;
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) { setMsg(stMsg, "Wpisz poprawny e-mail.", "err"); return; }
  if (pass.length < 6) { setMsg(stMsg, "Hasło musi mieć min. 6 znaków.", "err"); return; }
  const btn = $("rb-st-add");
  btn.disabled = true;
  try {
    // druga, osobna instancja logowania — dzięki temu Ty zostajesz zalogowany jako admin
    if (!staffApp) staffApp = initializeApp(firebaseConfig, "staff-creator");
    const auth2 = getAuth(staffApp);
    try {
      const cred = await createUserWithEmailAndPassword(auth2, email, pass);
      if (name) { try { await updateProfile(cred.user, { displayName: name }); } catch (_) {} }
      const uid = cred.user.uid;
      await signOut(auth2);
      await grantStaff(uid, email, name);
      setMsg(stMsg, "Gotowe! Konto obsługi " + email + " utworzone. Przekaż pracownikowi e-mail i hasło.", "ok");
      $("rb-st-form").reset();
    } catch (err) {
      try { await signOut(auth2); } catch (_) {}
      if (err.code === "auth/email-already-in-use") {
        const u = allUsers.find((x) => (x.email || "").toLowerCase() === email);
        if (u && confirm("Konto " + email + " już istnieje. Nadać mu uprawnienia do skanowania?")) {
          await grantStaff(u.id, u.email, u.name || name);
          setMsg(stMsg, "Nadano uprawnienia do skanowania: " + email, "ok");
          $("rb-st-form").reset();
        } else if (!u) {
          setMsg(stMsg, "Takie konto już istnieje, ale nie ma go na liście klientów (musi się najpierw raz zalogować na stronie).", "err");
        }
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error(err);
    setMsg(stMsg, errText(err), "err");
  } finally {
    btn.disabled = false;
  }
});
$("rb-st-list").addEventListener("click", async (e) => {
  const b = e.target.closest('[data-act="revoke"]');
  if (!b) return;
  if (!confirm("Odebrać temu kontu uprawnienia do skanowania?")) return;
  try { await deleteDoc(doc(db, "staff", b.dataset.id)); setMsg(stMsg, "Dostęp odebrany.", "ok"); }
  catch (err) { setMsg(stMsg, errText(err), "err"); }
});


/* ---------- treści strony z bazy: ceny, dostępność, komunikat, pizza dnia ---------- */
const SITE_CACHE_KEY = "wr_site_cfg_v1";
// Domyślna lista dowozu (do ok. 10 km od lokalu, koszt 10 zł). Obowiązuje, dopóki admin nie zapisze własnej listy w panelu (Strona → Dowóz).
const DELIVERY_DEFAULT = ["Głuponie", "Trzcianka", "Tomaszewo", "Michorzewo", "Kuślin", "Zygmuntowo", "Chraplewo", "Marszewo", "Michorzewko", "Wymysłowo", "Dąbrowa", "Łęczyce", "Dąbrowa Nowa", "Rudniki", "Wąsowo", "Jastrzębniki", "Krystianowo"]
  .map((name) => ({ name, fee: 10, min: null, freeFrom: null }));
// Link do formularza opinii w Google (domyślny; admin może go zmienić lub wyczyścić w panelu: Strona → Opinie w Google).
const GOOGLE_REVIEW_DEFAULT = "https://g.page/r/CUq2_T6CQcy5EAE/review";
let siteCfg = { prices: {}, unavailable: {}, hidden: {}, badges: {}, qz: {}, products: [], campaigns: [], notice: null, dish: null, delivery: { places: DELIVERY_DEFAULT }, googleReviewUrl: GOOGLE_REVIEW_DEFAULT, reviews: [], googleMapsUrl: "", theme: "auto", levelsOn: false, levels: null, refOn: false, poll: null, hours: null };
const PROD_CATS = [["klasyczne", "Klasyczne"], ["miesne", "Mięsne"], ["vege", "Wege"], ["sosy", "Sosy"], ["makarony", "Makarony"], ["dodatki", "Dodatki"]];
const MAX_PRODUCTS = 40;
const QZ_TYPES = [["meat", "🥓 Mięsna"], ["sea", "🦐 Owoce morza"], ["vege", "🌱 Bez mięsa"], ["none", "🚫 Nie pokazuj w quizie"]];
const qzType = (v) => (QZ_TYPES.some((t) => t[0] === v) ? v : "");
function cleanQz(m) { const o = {}; if (m && typeof m === "object") Object.keys(m).slice(0, 200).forEach((k) => { if (qzType(m[k])) o[k] = m[k]; }); return o; }
const qzSelectHtml = (cls, cur) => `<label class="rb-qz-row">🍕 Quiz „Dobierz mi pizzę”: <select class="${cls}" aria-label="Rodzaj pizzy w quizie"><option value="">Auto (po opisie)</option>${QZ_TYPES.map((t) => `<option value="${t[0]}"${cur === t[0] ? " selected" : ""}>${t[1]}</option>`).join("")}</select></label>`;
const BADGES = [["hit", "🔥 Hit"], ["ostra", "🌶 Ostra"], ["wege", "🌱 Wege"], ["nowosc", "⭐ Nowość"], ["polecamy", "👍 Polecamy"]];
const badgeIds = (v) => (Array.isArray(v) ? v : []).filter((b) => BADGES.some((x) => x[0] === b));
const menuEls = () => [...document.querySelectorAll("#menuGrid .menu-item")];
const itemKey = (el) => ((el.querySelector(".menu-item-title") || {}).textContent || "").replace(/^\s*\d+\.\s*/, "").trim().toLowerCase();
const itemName = (el) => ((el.querySelector(".menu-item-title") || {}).textContent || "").trim();
menuEls().forEach((el) => {
  const pEl = el.querySelector(".menu-item-price");
  if (pEl && !el.dataset.origPrice) el.dataset.origPrice = pEl.textContent.replace(/\u00a0/g, " ").trim();
});
const tsMs = (t) => (t ? (t.toDate ? t.toDate().getTime() : (t.seconds ? t.seconds * 1000 : 0)) : 0);

function plainCfg(c) {
  const n = c.notice ? { ...c.notice, until: c.notice.until ? { seconds: Math.floor(tsMs(c.notice.until) / 1000) } : null } : null;
  const camps = (c.campaigns || []).map((x) => ({ ...x, from: x.from ? { seconds: Math.floor(tsMs(x.from) / 1000) } : null, until: x.until ? { seconds: Math.floor(tsMs(x.until) / 1000) } : null }));
  return { prices: c.prices || {}, unavailable: c.unavailable || {}, hidden: c.hidden || {}, badges: c.badges || {}, qz: c.qz || {}, products: c.products || [], campaigns: camps, notice: n, dish: c.dish || null, delivery: c.delivery || null, googleReviewUrl: typeof c.googleReviewUrl === "string" ? c.googleReviewUrl : null, reviews: Array.isArray(c.reviews) ? c.reviews : [], googleMapsUrl: typeof c.googleMapsUrl === "string" ? c.googleMapsUrl : "", theme: typeof c.theme === "string" ? c.theme : "auto", levelsOn: c.levelsOn === true, levels: Array.isArray(c.levels) ? c.levels : null, levelsV: c.levelsV === 2 ? 2 : 0, refOn: c.refOn === true, poll: c.poll || null, hours: c.hours || null };
}

function renderDish() {
  let box = $("site-dish");
  const d = siteCfg.dish;
  const el = d && d.active ? menuEls().find((e) => itemKey(e) === d.key && !e.classList.contains("is-hidden")) : null;
  if (!el) { if (box) box.style.display = "none"; return; }
  if (!box) {
    box = document.createElement("div");
    box.id = "site-dish";
    const anchor = document.querySelector("#menu .menu-categories") || $("menuGrid");
    anchor.parentNode.insertBefore(box, anchor);
  }
  const desc = d.text || ((el.querySelector(".menu-item-desc") || {}).textContent || "");
  const price = (el.querySelector(".menu-item-price") || {}).textContent || "";
  box.innerHTML = '<div class="sd-label">⭐ Pizza dnia</div><div class="sd-name">' + esc(itemName(el)) + '</div><div class="sd-text">' + esc(desc) + '</div><div class="sd-price">' + esc(price) + "</div>";
  box.style.display = "block";
}

/* Akcja z kalendarza (od-do, opcjonalnie godziny), która trwa właśnie teraz */
function activeCampaign() {
  const now = new Date();
  const t = now.getTime();
  const min = now.getHours() * 60 + now.getMinutes();
  const hm = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  return (siteCfg.campaigns || []).find((c) => {
    if (!c || !c.active || !c.text) return false;
    const f = tsMs(c.from), u = tsMs(c.until);
    if ((f && t < f) || (u && t > u)) return false;
    const a = hm(c.hFrom), b = hm(c.hTo);
    if (a !== null && b !== null) return a <= b ? (min >= a && min < b) : (min >= a || min < b);
    return true;
  }) || null;
}
function effectiveNotice() {
  const n = siteCfg.notice;
  const until = n ? tsMs(n.until) : 0;
  if (n && n.active && n.text && (!until || until > Date.now())) return n;
  const c = activeCampaign();
  return c ? { text: c.text, type: c.type, active: true } : null;
}
function renderNotice() {
  const n = effectiveNotice();
  let bar = $("site-notice");
  let closed = "";
  try { closed = sessionStorage.getItem("wr_notice_closed") || ""; } catch (_) {}
  const strip = $("rb-campaign");
  if (strip) {
    strip.hidden = !(n && n.text);
    if (n && n.text) { strip.textContent = "📣 " + n.text; strip.className = "rb-campaign " + (["promo", "warn"].includes(n.type) ? n.type : ""); }
  }
  const show = !!(n && n.text && closed !== n.text);
  if (!show) { if (bar) bar.style.display = "none"; document.body.classList.remove("has-notice"); return; }
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "site-notice";
    bar.setAttribute("role", "status");
    bar.innerHTML = '<span id="site-notice-text"></span><button type="button" aria-label="Zamknij komunikat">&times;</button>';
    const hero = $("home");
    hero.parentNode.insertBefore(bar, hero);
    bar.querySelector("button").addEventListener("click", () => {
      try { sessionStorage.setItem("wr_notice_closed", (effectiveNotice() || {}).text || ""); } catch (_) {}
      bar.style.display = "none";
      document.body.classList.remove("has-notice");
    });
  }
  $("site-notice-text").textContent = n.text;
  bar.className = ["info", "promo", "warn"].includes(n.type) ? n.type : "info";
  const h = $("header");
  bar.style.marginTop = (h ? h.offsetHeight : 70) + "px";
  bar.style.display = "block";
  document.body.classList.add("has-notice");
}

setInterval(() => { try { renderNotice(); } catch (_) {} }, 60000);

function validProduct(p) {
  return !!(p && typeof p.name === "string" && p.name.trim() && typeof p.price === "string" && p.price.trim());
}

function renderProducts() {
  document.querySelectorAll("#menuGrid .menu-item[data-custom]").forEach((e) => e.remove());
  const grid = $("menuGrid");
  if (!grid) return;
  siteCfg.products.filter(validProduct).slice(0, MAX_PRODUCTS).forEach((p) => {
    const el = document.createElement("div");
    el.className = "menu-item";
    el.dataset.custom = "1";
    el.dataset.category = PROD_CATS.some((c) => c[0] === p.cat) ? p.cat : "dodatki";
    el.dataset.origPrice = p.price;
    if (p.unavail) el.dataset.customUn = "1";
    el.dataset.badges = badgeIds(p.badges).join(",");
    el.dataset.qz = qzType(p.qz);
    const tags = (Array.isArray(p.tags) ? p.tags : []).filter((t) => typeof t === "string" && t.trim()).slice(0, 3);
    el.innerHTML = '<div class="menu-item-content"><div class="menu-item-header"><h3 class="menu-item-title">' + esc(p.name) + '</h3><span class="menu-item-price">' + esc(p.price) + "</span></div>" +
      (p.desc ? '<p class="menu-item-desc">' + esc(p.desc) + "</p>" : "") +
      (tags.length ? '<div class="menu-item-sizes">' + tags.map((t) => '<span class="size-badge">' + esc(t) + "</span>").join("") + "</div>" : "") + "</div>";
    // wstawiamy za ostatnią pozycją tej samej grupy (pizze razem, sosy razem…), a nie na końcu całego menu
    const grp = (c) => (/klasyczne|miesne|vege/.test(c || "") ? "pizza" : (c || "").split(/\s+/)[0]);
    const mine = grp(el.dataset.category);
    const same = [...grid.querySelectorAll(".menu-item")].filter((x) => x !== el && grp(x.dataset.category) === mine);
    if (same.length) same[same.length - 1].after(el); else grid.appendChild(el);
  });
}

/* ---------- „Dobierz mi pizzę” (3 pytania → polecenia z aktualnego menu) ---------- */
const QZ_Q = [
  { k: "meat", q: "Na co masz ochotę?", o: [["meat", "🥓 Mięsna"], ["sea", "🦐 Owoce morza"], ["vege", "🌱 Bez mięsa"], ["any", "🤷 Wszystko jedno"]] },
  { k: "hot", q: "Jak z ostrością?", o: [["mild", "😌 Łagodna"], ["hot", "🌶 Ostra"], ["any", "🤷 Obojętnie"]] },
  { k: "n", q: "Ile Was będzie?", o: [["1", "🙋 Sam(a)"], ["2", "👫 Dwie osoby"], ["4", "👨‍👩‍👧 3–4 osoby"], ["6", "🎉 5 i więcej"]] }
];
let qzSt = { step: 0, a: {} };
const QZ_MEAT = /pepperoni|prosciutto|szynk|salami|boczek|nduja|kiełbas|kurczak|wołow|bekon|mięs|cotto/i;
const QZ_SEA = /krewet|gamber|owoce morza|frutti di mare|tuńczyk|tuncz|tonno|łosoś|losos|salmone|anchois|acciug|ryb|małż|mule\b|kalmar|ośmiorn/i;
const QZ_HOT = /piccante|jalape|nduja|ostr|chili|diavola/i;
function qzPizzas() {
  // pizza = kategoria Klasyczne/Mięsne/Wege, a dla pozycji dodanych w panelu także każda, która wygląda na pizzę (nazwa „Pizza…” albo sos/mozzarella w opisie)
  const looksPizza = (el) => !!el.dataset.custom && !/sosy|makarony/.test(el.dataset.category || "") && /^\s*pizza\b|mozzarell|sos pomidorow|ciasto/i.test(itemName(el) + " " + ((el.querySelector(".menu-item-desc") || {}).textContent || ""));
  return menuEls().filter((el) => !el.classList.contains("is-hidden") && !el.classList.contains("is-unavail")).map((el) => {
    const key = itemKey(el), cat = el.dataset.category || "";
    const qt = el.dataset.custom ? qzType(el.dataset.qz) : qzType(siteCfg.qz[key]);
    if (qt === "none") return null;
    if (!qt && !(/klasyczne|miesne|vege/.test(cat) || looksPizza(el))) return null;
    const bd = el.dataset.custom ? badgeIds((el.dataset.badges || "").split(",")) : badgeIds(siteCfg.badges[key]);
    const txt = itemName(el) + " " + ((el.querySelector(".menu-item-desc") || {}).textContent || "");
    // rodzaj z ręcznego tagu w panelu; bez tagu zgadujemy z nazwy i opisu
    const sea = qt ? qt === "sea" : QZ_SEA.test(txt);
    const meat = qt ? qt === "meat" : ((!sea && /miesne/.test(cat)) || QZ_MEAT.test(txt));
    const hot = bd.includes("ostra") || (!qt && QZ_HOT.test(txt));
    return { el, name: itemName(el).replace(/^\d+\.\s*/, ""), price: ((el.querySelector(".menu-item-price") || {}).textContent || "").trim(), desc: ((el.querySelector(".menu-item-desc") || {}).textContent || "").trim(),
      sea, meat, hot, top: bd.includes("hit") || bd.includes("polecamy"),
      score: (bd.includes("hit") || bd.includes("polecamy") ? 2 : 0) + (bd.includes("nowosc") ? 2 : 0) + (el.dataset.custom ? 1 : 0) };
  }).filter(Boolean);
}
function qzResult() {
  const a = qzSt.a, all = qzPizzas();
  const fm = (p) => a.meat === "any" || (a.meat === "meat" ? p.meat : a.meat === "sea" ? p.sea : !p.meat && !p.sea);
  const fh = (p) => a.hot === "any" || (a.hot === "hot" ? p.hot : !p.hot);
  let list = all.filter((p) => fm(p) && fh(p)), note = "";
  if (!list.length) { list = all.filter(fm); note = "Nie mamy dokładnie takiej pizzy, więc luzujemy ostrość. Poniżej najbliższe propozycje."; }
  if (!list.length) { list = all; note = "Dziś nie mamy pizzy pasującej do wyboru — oto nasze propozycje."; }
  list = list.map((p) => [Math.random(), p]).sort((x, y) => x[0] - y[0]).map((x) => x[1]); // losowa kolejność przy równym wyniku, żeby nowe pizze też się pokazywały
  list = list.sort((x, y) => y.score - x.score).slice(0, 3);
  const n = Number(a.n || 1), k = n === 1 ? "1 pizza 30 cm" : n === 2 ? "2 pizze 30 cm" : n === 4 ? "3 pizze 30 cm" : "5–6 pizz 30 cm (zadzwoń z wyprzedzeniem)";
  return { list, note, k, n, all };
}
function qzRender() {
  const box = $("quizCard"), st = qzSt;
  if (st.step < QZ_Q.length) {
    const q = QZ_Q[st.step];
    box.innerHTML = `<div class="qz-prog">Pytanie ${st.step + 1} z ${QZ_Q.length}</div><div class="qz-q">${esc(q.q)}</div><div class="qz-opts">${q.o.map((o) => `<button type="button" class="qz-opt" data-qv="${o[0]}">${esc(o[1])}</button>`).join("")}</div>${st.step ? '<button type="button" class="qz-back" data-qback>← Wróć</button>' : ""}`;
    return;
  }
  const r = qzResult();
  box.innerHTML = `<div class="qz-q">Polecamy dla Ciebie:</div>${r.note ? `<div class="qz-note">${esc(r.note)}</div>` : ""}`
    + r.list.map((p, i) => `<div class="qz-hit"><div><b>${esc(p.name)}</b> <span class="qz-price">${esc(p.price)}</span><div class="qz-desc">${esc(p.desc)}</div></div><button type="button" class="qz-show" data-qshow="${i}">Pokaż w menu</button></div>`).join("")
    + `<div class="qz-note">Dla ${r.n === 1 ? "jednej osoby" : r.n === 2 ? "dwóch osób" : r.n === 4 ? "3–4 osób" : "większej ekipy"} zwykle wystarczy ${esc(r.k)}${r.n > 1 ? " — weźcie kilka różnych z tej listy." : "."}</div>`
    + `<div class="qz-actions"><a class="btn btn-primary" href="tel:668862396">📞 Zamów: 668 862 396</a><button type="button" class="qz-back" data-qreset>🔄 Jeszcze raz</button></div>`;
  box._list = r.list;
}
$("quizOpen").addEventListener("click", () => {
  const c = $("quizCard");
  if (!c.hidden) { c.hidden = true; return; }
  qzSt = { step: 0, a: {} }; c.hidden = false; qzRender();
});
$("quizCard").addEventListener("click", (e) => {
  const o = e.target.closest("[data-qv]");
  if (o) { qzSt.a[QZ_Q[qzSt.step].k] = o.dataset.qv; qzSt.step++; qzRender(); return; }
  if (e.target.closest("[data-qback]")) { qzSt.step = Math.max(0, qzSt.step - 1); qzRender(); return; }
  if (e.target.closest("[data-qreset]")) { qzSt = { step: 0, a: {} }; qzRender(); return; }
  const s = e.target.closest("[data-qshow]");
  if (s) {
    const p = $("quizCard")._list[Number(s.dataset.qshow)];
    if (!p) return;
    const all = document.querySelector('.category-btn[data-category="all"]');
    if (all) all.click();
    p.el.scrollIntoView({ behavior: "smooth", block: "center" });
    p.el.classList.remove("quiz-flash"); void p.el.offsetWidth; p.el.classList.add("quiz-flash");
    setTimeout(() => p.el.classList.remove("quiz-flash"), 3200);
  }
});

/* ---------- motyw sezonowy (silnik w motyw.js; tu tylko cienkie wrappery) ---------- */
const WRT = window.WRTheme || { THEMES: {}, list: [], auto: () => null, label: () => "żaden (zwykła strona)", apply: () => {} };
const THEMES = WRT.THEMES;
const autoTheme = WRT.auto;
const themeLabel = WRT.label;
const applyTheme = WRT.apply;

/* ---------- menu do druku / PDF (z aktualnymi cenami ze strony) ---------- */
function printMenu() {
  const cats = PROD_CATS.map((c) => ({ key: c[0], name: c[1], rows: [] }));
  menuEls().forEach((el) => {
    if (el.classList.contains("is-hidden")) return;
    const first = (el.dataset.category || "").split(/\s+/).find((k) => cats.some((c) => c.key === k));
    const cat = cats.find((c) => c.key === first);
    if (!cat) return;
    const price = ((el.querySelector(".menu-item-price") || {}).textContent || "").replace(/\u00a0/g, " ").trim();
    const desc = ((el.querySelector(".menu-item-desc") || {}).textContent || "").trim();
    cat.rows.push('<div class="pm-row"><span>' + esc(itemName(el)) + "</span><b>" + esc(price) + "</b></div>" + (desc ? '<div class="pm-desc">' + esc(desc) + "</div>" : ""));
  });
  const today = new Date().toLocaleDateString("pl-PL");
  const html = '<h1>Włoska Robota</h1><div class="pm-sub">Pizza z pieca · Głuponie · pizze 30 cm, ciasto 24 h</div>' +
    cats.filter((c) => c.rows.length).map((c) => "<h2>" + esc(c.name) + "</h2>" + c.rows.join("")).join("") +
    '<div class="pm-foot">Zamówienia: 668 862 396 · wloskarobota.eu · ceny aktualne na dzień ' + esc(today) + "</div>";
  let box = document.getElementById("print-menu");
  if (!box) { box = document.createElement("div"); box.id = "print-menu"; document.body.appendChild(box); }
  box.innerHTML = html;
  const done = () => { document.body.classList.remove("printing-menu"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  document.body.classList.add("printing-menu");
  setTimeout(() => { try { window.print(); } catch (_) { done(); } }, 60);
}
document.getElementById("menu-print-btn").addEventListener("click", printMenu);

function applySite(cfg) {
  siteCfg = {
    prices: (cfg && cfg.prices) || {}, unavailable: (cfg && cfg.unavailable) || {}, hidden: (cfg && cfg.hidden) || {}, badges: (cfg && cfg.badges) || {}, qz: cleanQz(cfg && cfg.qz),
    products: Array.isArray(cfg && cfg.products) ? cfg.products : [], campaigns: Array.isArray(cfg && cfg.campaigns) ? cfg.campaigns : [], notice: (cfg && cfg.notice) || null, dish: (cfg && cfg.dish) || null,
    delivery: { places: Array.isArray(cfg && cfg.delivery && cfg.delivery.places) ? cfg.delivery.places : DELIVERY_DEFAULT },
    googleReviewUrl: (cfg && typeof cfg.googleReviewUrl === "string") ? cfg.googleReviewUrl : GOOGLE_REVIEW_DEFAULT,
    reviews: Array.isArray(cfg && cfg.reviews) ? cfg.reviews : [], googleMapsUrl: (cfg && typeof cfg.googleMapsUrl === "string") ? cfg.googleMapsUrl : "",
    theme: (cfg && typeof cfg.theme === "string") ? cfg.theme : "auto",
    levelsOn: !!(cfg && cfg.levelsOn === true), levels: cleanLevels(cfg && cfg.levels, cfg && cfg.levelsV), refOn: !!(cfg && cfg.refOn === true), poll: validPoll(cfg && cfg.poll), hours: validHours(cfg && cfg.hours)
  };
  window.WR_HOURS = siteCfg.hours;
  try { if (window.wrHoursApply) window.wrHoursApply(); } catch (_) {}
  applyTheme(siteCfg.theme);
  setTimeout(() => { try { refreshLoyaltyUi(); } catch (_) {} try { renderPoll(auth.currentUser); } catch (_) {} }, 0);
  renderProducts();
  menuEls().forEach((el) => {
    const key = itemKey(el);
    const pEl = el.querySelector(".menu-item-price");
    if (pEl) pEl.textContent = (!el.dataset.custom && siteCfg.prices[key]) || el.dataset.origPrice || pEl.textContent;
    el.classList.toggle("is-hidden", !el.dataset.custom && !!siteCfg.hidden[key]);
    const un = !!siteCfg.unavailable[key] || el.dataset.customUn === "1";
    el.classList.toggle("is-unavail", un);
    let b = el.querySelector(".unavail-badge");
    if (un && !b) {
      b = document.createElement("div");
      b.className = "unavail-badge";
      b.textContent = "Niedostępne dziś";
      const c = el.querySelector(".menu-item-content") || el;
      c.appendChild(b);
    }
    if (!un && b) b.remove();
    el.classList.toggle("is-dish", !!(siteCfg.dish && siteCfg.dish.active && siteCfg.dish.key === key));
    const bd = el.dataset.custom ? badgeIds((el.dataset.badges || "").split(",")) : badgeIds(siteCfg.badges[key]);
    const cont = el.querySelector(".menu-item-content");
    let row = el.querySelector(".menu-badges");
    if (cont && bd.length) {
      if (!row) { row = document.createElement("div"); row.className = "menu-badges"; cont.insertBefore(row, cont.firstChild); }
      row.innerHTML = bd.map((id) => '<span class="mbd ' + id + '">' + esc(BADGES.find((x) => x[0] === id)[1]) + "</span>").join("");
    } else if (row) row.remove();
  });
  if (window.applyMenuFilter) window.applyMenuFilter();
  renderDish();
  renderNotice();
  renderDelivery();
  try { renderReviews(); } catch (_) {}
  try { renderRanks(); } catch (_) {}
  try { renderPollPublic(); } catch (_) {}
  try { applyPhotos(); } catch (_) {}
}

/* ---------- opinie z Google wybrane przez właściciela (sekcja „Co mówią klienci”) ---------- */
const MAX_REVIEWS = 12;
const GMAPS_DEFAULT = "https://www.google.com/maps/search/?api=1&query=W%C5%82oska+Robota+G%C5%82uponie+103+Ku%C5%9Blin";
const httpsUrl = (u) => typeof u === "string" && /^https:\/\/\S+$/.test(u.trim());
function validReview(r) {
  return !!(r && typeof r.name === "string" && r.name.trim() && typeof r.text === "string" && r.text.trim() && Number.isInteger(r.stars) && r.stars >= 1 && r.stars <= 5);
}
function renderRanks() {
  const sec = $("rangi");
  if (!sec) return;
  if (!siteCfg.levelsOn) { sec.hidden = true; return; }
  $("rkLadder").innerHTML = curLevels().map((l, i) =>
    '<div class="rk-card ' + lvTier(i) + '"><span class="ic">' + esc(l.ic) + "</span><h3>" + esc(l.n) + '</h3><div class="from">' +
    (i === 0 ? "na start" : "od " + l.from + " " + pizzaWord(l.from) + " gratis") + "</div>" + (l.perk ? "<p>" + esc(l.perk) + "</p>" : "") + "</div>").join("");
  sec.hidden = false;
}
function renderReviews() {
  const sec = $("opinie");
  if (!sec) return;
  const list = (siteCfg.reviews || []).filter(validReview).slice(0, MAX_REVIEWS);
  if (!list.length) { sec.hidden = true; return; }
  $("revGrid").innerHTML = list.map((r) =>
    '<figure class="rev-card"><div class="rev-stars" role="img" aria-label="' + r.stars + ' na 5 gwiazdek">' + "★".repeat(r.stars) + "<i>" + "★".repeat(5 - r.stars) + "</i></div>" +
    "<blockquote>" + esc(r.text) + "</blockquote><figcaption><span><b>" + esc(r.name) + "</b>" + (r.when ? " · " + esc(r.when) : "") + "</span><small>Opinia z Google</small></figcaption></figure>").join("");
  $("rev-all").href = httpsUrl(siteCfg.googleMapsUrl) ? siteCfg.googleMapsUrl.trim() : GMAPS_DEFAULT;
  const add = $("rev-add"), url = httpsUrl(siteCfg.googleReviewUrl) ? siteCfg.googleReviewUrl.trim() : "";
  add.hidden = !url; if (url) add.href = url;
  sec.hidden = false;
}

/* ---------- dowóz: sprawdzanie miejscowości ---------- */
const normTxt = (t) => String(t || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const money = (n) => String(n).replace(".", ",") + " zł";
function validPlace(p) { return !!(p && typeof p.name === "string" && p.name.trim()); }
function renderDelivery() {
  const box = $("delivery-check");
  if (!box) return;
  const places = siteCfg.delivery.places.filter(validPlace);
  const sec = $("dowoz");
  if (sec) sec.hidden = !places.length;
  document.querySelectorAll(".dowoz-link").forEach((e) => { e.hidden = !places.length; });
  $("dc-list").innerHTML = places.map((p) => '<option value="' + esc(p.name) + '"></option>').join("");
  const sub = $("deliverySub");
  if (sub && places.length) {
    sub.textContent = places.length > 8
      ? "Dowozimy do " + places.length + " miejscowości w okolicy Głuponi — wpisz swoją poniżej i sprawdź koszt"
      : "Dowóz: " + places.map((p) => p.name).join(", ") + " i okolice";
  }
  renderDeliveryResult();
}
function renderDeliveryResult() {
  const out = $("dc-result");
  if (!out) return;
  const q = normTxt($("dc-input").value);
  out.className = "";
  if (q.length < 2) { out.textContent = ""; return; }
  const places = siteCfg.delivery.places.filter(validPlace);
  let m = places.filter((p) => normTxt(p.name) === q);
  if (!m.length) m = places.filter((p) => { const n = normTxt(p.name); return n.includes(q) || q.includes(n); });
  if (!m.length) {
    out.className = "no";
    const from = $("dc-input").value.trim();
    const route = "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent(from + ", Polska") + "&destination=" + encodeURIComponent("Głuponie 103, 64-316 Kuślin, Polska") + "&travelmode=driving";
    out.innerHTML = 'Tej miejscowości nie ma na naszej liście dowozu. <a href="tel:668862396">Zadzwoń: 668 862 396</a> — ustalimy, albo zapraszamy po odbiór osobisty.'
      + '<a class="dc-route" href="' + esc(route) + '" target="_blank" rel="noopener">🗺 TRASA do restauracji</a>';
    return;
  }
  out.className = "yes";
  out.innerHTML = m.slice(0, 3).map((p) => {
    const info = [];
    if (typeof p.fee === "number") info.push(p.fee === 0 ? "dowóz gratis" : "koszt dowozu " + money(p.fee));
    if (typeof p.freeFrom === "number" && p.fee !== 0) info.push("gratis od " + money(p.freeFrom));
    if (typeof p.min === "number" && p.min > 0) info.push("minimalne zamówienie " + money(p.min));
    return '<div class="dc-line">✅ <b>Dowozimy: ' + esc(p.name) + "</b>" + (info.length ? "<br>" + esc(info.join(" · ")) : "") + "</div>";
  }).join("");
}
$("dc-input").addEventListener("input", renderDeliveryResult);

/* ---------- zdjęcia pizz (jedno zdjęcie na pozycję menu; admin dodaje/usuwa wprost na karcie) ----------
   Zdjęcie jest zmniejszane w przeglądarce (ok. 640×480, JPEG) i zapisywane w Firestore: site/ph_<nazwa>,
   a spis wersji w site/photos. Klienci pobierają tylko te zdjęcia, które widzą na ekranie, i zapamiętują je w przeglądarce. */
const PHOTO_CACHE_KEY = "wr_photos_v1";
let photoIdx = {};
let photoCache = {};
try { photoCache = JSON.parse(localStorage.getItem(PHOTO_CACHE_KEY) || "{}") || {}; } catch (_) { photoCache = {}; }
const photoInflight = {};
let photoObs = null;
const okImg = (d) => typeof d === "string" && d.length < 250000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d);
const photoSlug = (el) => normTxt(itemKey(el)).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
function savePhotoCache() {
  try { localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(photoCache)); }
  catch (_) { /* brak miejsca: zdjęcia zostają tylko w pamięci strony */ }
}
function observePhoto(el) {
  if (!("IntersectionObserver" in window)) { ensurePhoto(el.dataset.pslug); return; }
  if (!photoObs) {
    photoObs = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { photoObs.unobserve(e.target); ensurePhoto(e.target.dataset.pslug); }
    }), { rootMargin: "400px" });
  }
  photoObs.observe(el);
}
async function ensurePhoto(slug) {
  const ts = photoIdx[slug];
  if (!slug || !ts) return;
  const c = photoCache[slug];
  if (c && c.t === ts && okImg(c.d)) return;
  if (photoInflight[slug] === ts) return;
  photoInflight[slug] = ts;
  try {
    const d = await withTimeout(getDoc(doc(db, "site", "ph_" + slug)), 12000);
    const data = d.exists() ? d.data() : null;
    if (data && okImg(data.d)) { photoCache[slug] = { t: ts, d: data.d }; savePhotoCache(); applyPhotos(); }
  } catch (e) { console.warn("Zdjęcie niedostępne:", slug, e && (e.code || e.message)); }
  finally { delete photoInflight[slug]; }
}
function applyPhotos() {
  menuEls().forEach((el) => {
    const slug = photoSlug(el);
    el.dataset.pslug = slug;
    let box = el.querySelector(":scope > .menu-photo");
    if (!box) { box = document.createElement("div"); box.className = "menu-photo"; el.insertBefore(box, el.firstChild); }
    const ts = slug ? (photoIdx[slug] || 0) : 0, c = photoCache[slug];
    const has = !!(ts && c && c.t === ts && okImg(c.d));
    const pending = !!ts && !has;
    const adm = !!isAdmin;
    box.classList.toggle("has", has); box.classList.toggle("pending", pending); box.classList.toggle("adm", adm);
    const sig = (has ? ts : "-") + (pending ? "P" : "") + (adm ? "A" : "");
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      if (has) {
        box.innerHTML = '<img class="mp-img" alt="' + esc(itemName(el)) + '" src="' + c.d + '" decoding="async">' +
          (adm ? '<div class="mp-tools"><button type="button" class="mp-btn" data-a="add">📷 Zmień</button><button type="button" class="mp-btn mp-del" data-a="del">🗑 Usuń</button></div>' : "");
      } else if (pending) box.innerHTML = '<div class="mp-skel"></div>';
      else if (adm) box.innerHTML = '<button type="button" class="mp-empty" data-a="add"><span>📷</span>Dodaj zdjęcie</button>';
      else box.innerHTML = "";
    }
    if (pending) observePhoto(el);
  });
}
async function loadPhotos() {
  try {
    const d = await withTimeout(getDoc(doc(db, "site", "photos")), 8000);
    const v = d.exists() && d.data() && typeof d.data().v === "object" && d.data().v ? d.data().v : {};
    photoIdx = {};
    Object.keys(v).forEach((k) => { if (typeof v[k] === "number" && v[k] > 0) photoIdx[k] = v[k]; });
    Object.keys(photoCache).forEach((k) => { if (!photoIdx[k]) delete photoCache[k]; });
    savePhotoCache();
  } catch (e) { console.warn("Spis zdjęć niedostępny:", e && (e.code || e.message)); }
  applyPhotos();
}
/* zmniejszenie zdjęcia do ok. 640×480 (kadr 4:3 ze środka) i JPEG poniżej ~100 KB */
async function photoToJpeg(file) {
  let src, w, h;
  try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); w = src.width; h = src.height; }
  catch (_) {
    src = await new Promise((ok, bad) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); bad(new Error("bad")); }; im.src = u; });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  if (!w || !h) throw new Error("bad");
  const TW = 640, TH = 480, ratio = TW / TH;
  let sw = w, sh = h;
  if (w / h > ratio) sw = h * ratio; else sh = w / ratio;
  const cv = document.createElement("canvas"); cv.width = TW; cv.height = TH;
  const cx = cv.getContext("2d");
  cx.fillStyle = "#fff"; cx.fillRect(0, 0, TW, TH);
  cx.imageSmoothingQuality = "high";
  cx.drawImage(src, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, TW, TH);
  let q = 0.82, out = cv.toDataURL("image/jpeg", q);
  while (out.length > 135000 && q > 0.45) { q -= 0.08; out = cv.toDataURL("image/jpeg", q); }
  if (!okImg(out) || out.length > 200000) throw new Error("big");
  return out;
}
let photoFileEl = null, photoTarget = null, photoBusy = false;
function pickPhoto(el) {
  if (!isAdmin || photoBusy) return;
  photoTarget = el;
  if (!photoFileEl) {
    photoFileEl = document.createElement("input");
    photoFileEl.type = "file"; photoFileEl.accept = "image/*"; photoFileEl.hidden = true;
    photoFileEl.addEventListener("change", async () => {
      const f = photoFileEl.files && photoFileEl.files[0], el2 = photoTarget;
      photoFileEl.value = "";
      if (f && el2) await savePhoto(el2, f);
    });
    document.body.appendChild(photoFileEl);
  }
  photoFileEl.click();
}
async function savePhoto(el, file) {
  const slug = photoSlug(el);
  if (!slug || !isAdmin || photoBusy) return;
  photoBusy = true;
  const box = el.querySelector(":scope > .menu-photo");
  if (box) box.classList.add("busy");
  try {
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name || "")) throw new Error("type");
    const data = await photoToJpeg(file);
    const ts = Date.now();
    await setDoc(doc(db, "site", "ph_" + slug), { d: data, t: ts, name: itemName(el).slice(0, 80) });
    await setDoc(doc(db, "site", "photos"), { v: { [slug]: ts }, updatedAt: serverTimestamp() }, { merge: true });
    photoIdx[slug] = ts; photoCache[slug] = { t: ts, d: data }; savePhotoCache();
    siteToast("Zdjęcie zapisane: " + itemName(el), "ok");
  } catch (err) {
    console.error(err);
    siteToast(err && err.message === "type" ? "To nie jest zdjęcie. Wybierz plik JPG lub PNG." : err && err.message === "big" ? "Zdjęcie jest zbyt duże, spróbuj innego." : errText(err), "err");
  } finally { photoBusy = false; if (box) box.classList.remove("busy"); applyPhotos(); }
}
async function removePhoto(el) {
  const slug = photoSlug(el);
  if (!slug || !isAdmin || photoBusy) return;
  if (!confirm("Usunąć zdjęcie: " + itemName(el) + "?")) return;
  photoBusy = true;
  try {
    await setDoc(doc(db, "site", "photos"), { v: { [slug]: 0 }, updatedAt: serverTimestamp() }, { merge: true });
    try { await deleteDoc(doc(db, "site", "ph_" + slug)); } catch (_) {}
    delete photoIdx[slug]; delete photoCache[slug]; savePhotoCache();
    siteToast("Zdjęcie usunięte.", "ok");
  } catch (err) { console.error(err); siteToast(errText(err), "err"); }
  finally { photoBusy = false; applyPhotos(); }
}
function showPhotoBig(src, title) {
  const o = document.createElement("div");
  o.className = "mp-lb"; o.setAttribute("role", "dialog");
  o.innerHTML = '<figure><img alt="" src="' + src + '"><figcaption>' + esc(title) + '</figcaption></figure>';
  const close = () => { o.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  o.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(o);
}
(function bindPhotoClicks() {
  const grid = $("menuGrid");
  if (!grid) return;
  grid.addEventListener("click", (e) => {
    const el = e.target.closest(".menu-item");
    if (!el) return;
    const btn = e.target.closest("[data-a]");
    if (btn && el.contains(btn) && btn.closest(".menu-photo")) {
      e.preventDefault(); e.stopPropagation();
      if (btn.dataset.a === "del") removePhoto(el); else pickPhoto(el);
      return;
    }
    const img = e.target.closest(".mp-img");
    if (img) showPhotoBig(img.src, itemName(el));
  });
})();

/* ---------- galeria: kolejność, dodawanie i usuwanie zdjęć z panelu ----------
   Spis i kolejność: site/gallery {order, removed, caps, v}; zdjęcia dodane przez admina: site/gal_<id> (JPEG ok. 1000 px).
   Zdjęcia z kodu strony (images/…) też można ukryć. Dopóki admin niczego nie zmieni, galeria wygląda jak w kodzie strony. */
const GAL_CACHE_KEY = "wr_gal_v1", GAL_CFG_KEY = "wr_gal_cfg_v1", GAL_MAX_UP = 30;
const galGrid = $("galleryGrid");
const GAL_STATIC = galGrid ? [...galGrid.querySelectorAll(".gallery-item img")].map((im) => {
  const src = im.getAttribute("src") || "";
  return { key: "s_" + src.split("/").pop().replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 50), src, alt: im.alt || "" };
}) : [];
let galCfg = { order: [], removed: [], caps: {}, v: {} }, galActive = false, galBusy = false;
let galCache = {};
try { galCache = JSON.parse(localStorage.getItem(GAL_CACHE_KEY) || "{}") || {}; } catch (_) { galCache = {}; }
const galTiles = new Map(), galInflight = {};
let galObs = null;
function galClean(d) {
  const o = { order: [], removed: [], caps: {}, v: {} };
  if (!d || typeof d !== "object") return o;
  const okKey = (k) => typeof k === "string" && /^[su]_[A-Za-z0-9_]{1,60}$/.test(k);
  if (Array.isArray(d.order)) o.order = d.order.filter(okKey).slice(0, 100);
  if (Array.isArray(d.removed)) o.removed = d.removed.filter(okKey).slice(0, 100);
  if (d.caps && typeof d.caps === "object") Object.keys(d.caps).forEach((k) => { if (okKey(k) && typeof d.caps[k] === "string") o.caps[k] = d.caps[k].slice(0, 80); });
  if (d.v && typeof d.v === "object") Object.keys(d.v).forEach((k) => { if (/^[a-z0-9]{4,20}$/.test(k) && typeof d.v[k] === "number" && d.v[k] > 0) o.v[k] = d.v[k]; });
  return o;
}
function galItems() {
  const map = new Map(GAL_STATIC.map((x) => [x.key, x])), out = [], seen = new Set();
  const add = (k) => {
    if (seen.has(k)) return; seen.add(k);
    if (k.startsWith("s_")) { const st = map.get(k); if (st && !galCfg.removed.includes(k)) out.push({ key: k, src: st.src, alt: galCfg.caps[k] || st.alt, base: st.alt, stat: true }); }
    else if (k.startsWith("u_")) { const id = k.slice(2); if (galCfg.v[id]) out.push({ key: k, id, alt: galCfg.caps[k] || "", base: "" }); }
  };
  galCfg.order.forEach(add); GAL_STATIC.forEach((x) => add(x.key));
  return out;
}
const galSrc = (it) => { if (it.stat) return it.src; const c = galCache[it.id]; return c && c.t === galCfg.v[it.id] && okImg(c.d) ? c.d : ""; };
function galSave() { try { localStorage.setItem(GAL_CACHE_KEY, JSON.stringify(galCache)); } catch (_) { /* brak miejsca: zostają w pamięci strony */ } }
function renderGallery() {
  if (!galGrid || !galActive) return;
  const items = galItems(), keep = new Set(items.map((i) => i.key));
  galGrid.querySelectorAll(".gallery-item:not([data-gkey])").forEach((e) => e.remove());
  galTiles.forEach((el, k) => { if (!keep.has(k)) { el.remove(); galTiles.delete(k); } });
  items.forEach((it) => {
    let el = galTiles.get(it.key);
    if (!el) { el = document.createElement("div"); el.className = "gallery-item"; el.dataset.gkey = it.key; galTiles.set(it.key, el); }
    const src = galSrc(it);
    const sig = src ? "i|" + (it.stat ? it.src : galCfg.v[it.id]) + "|" + it.alt : "p";
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      el.innerHTML = src ? '<img src="' + esc(src) + '" alt="' + esc(it.alt) + '" loading="lazy" decoding="async">' : '<div class="gal-skel"></div>';
    }
    galGrid.appendChild(el);
    if (!src && it.id) galObserve(el, it.id);
  });
}
function galObserve(el, id) {
  if (!("IntersectionObserver" in window)) { galEnsure(id); return; }
  if (!galObs) {
    galObs = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { galObs.unobserve(e.target); galEnsure(e.target.dataset.gkey.slice(2)); }
    }), { rootMargin: "400px" });
  }
  galObs.observe(el);
}
async function galEnsure(id) {
  const t = galCfg.v[id];
  if (!t) return;
  const c = galCache[id];
  if (c && c.t === t && okImg(c.d)) return;
  if (galInflight[id] === t) return;
  galInflight[id] = t;
  try {
    const d = await withTimeout(getDoc(doc(db, "site", "gal_" + id)), 15000);
    const data = d.exists() ? d.data() : null;
    if (data && okImg(data.d)) { galCache[id] = { t, d: data.d }; galSave(); renderGallery(); galAdminRender(); }
  } catch (e) { console.warn("Zdjęcie galerii niedostępne:", id, e && (e.code || e.message)); }
  finally { delete galInflight[id]; }
}
async function loadGallery() {
  try {
    const d = await withTimeout(getDoc(doc(db, "site", "gallery")), 8000);
    if (d.exists()) {
      galCfg = galClean(d.data()); galActive = true;
      try { localStorage.setItem(GAL_CFG_KEY, JSON.stringify(galCfg)); } catch (_) {}
    } else { try { localStorage.removeItem(GAL_CFG_KEY); } catch (_) {} }
    Object.keys(galCache).forEach((id) => { if (!galCfg.v[id]) delete galCache[id]; });
    galSave();
  } catch (e) { console.warn("Galeria niedostępna:", e && (e.code || e.message)); }
  renderGallery(); galAdminRender();
}
try { const c = localStorage.getItem(GAL_CFG_KEY); if (c) { galCfg = galClean(JSON.parse(c)); galActive = true; renderGallery(); } } catch (_) {}
if (galGrid) galGrid.addEventListener("click", (e) => {
  const im = e.target.closest(".gallery-item img");
  if (im) showPhotoBig(im.currentSrc || im.src, im.alt || "");
});
/* zdjęcie w „Dlaczego Włoska Robota?” też można powiększyć (jak w galerii i w menu) */
(function () {
  const im = document.querySelector(".about-image img");
  if (!im) return;
  im.style.cursor = "zoom-in"; im.tabIndex = 0; im.setAttribute("role", "button");
  const open = () => showPhotoBig(im.currentSrc || im.src, im.alt || "");
  im.addEventListener("click", open);
  im.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
})();

/* --- panel admina --- */
function galAdminRender() {
  const list = $("rb-gal-list");
  if (!list) return;
  const items = galItems();
  $("rb-gal-count").textContent = "Zdjęć na stronie: " + items.length + (galCfg.removed.length ? " · ukrytych z kodu strony: " + galCfg.removed.length : "");
  list.innerHTML = items.map((it, i) => {
    const src = galSrc(it);
    if (!src && it.id) galEnsure(it.id);
    return `<div class="rb-gal-row" data-k="${esc(it.key)}">
      ${src ? `<img class="rb-gal-th" src="${esc(src)}" alt="">` : '<div class="rb-gal-th skel">wczytuję…</div>'}
      <div class="rb-gal-main">
        <div class="rb-gal-n">${i + 1}. ${it.stat ? "z kodu strony" : "dodane"}</div>
        <input type="text" class="rb-gal-cap" maxlength="80" placeholder="${esc(it.base || "Podpis (opcjonalnie)")}" value="${esc(galCfg.caps[it.key] || "")}" aria-label="Podpis zdjęcia ${i + 1}">
        <div class="rb-gal-btns">
          <button type="button" data-a="top" aria-label="Na początek"${i === 0 ? " disabled" : ""}>⤒</button>
          <button type="button" data-a="up" aria-label="Wyżej"${i === 0 ? " disabled" : ""}>↑</button>
          <button type="button" data-a="down" aria-label="Niżej"${i === items.length - 1 ? " disabled" : ""}>↓</button>
          <button type="button" data-a="del" class="del" aria-label="Usuń">🗑</button>
        </div>
      </div>
    </div>`;
  }).join("") || '<div class="rb-meta">Galeria jest pusta — dodaj zdjęcia albo przywróć domyślne.</div>';
}
async function galPersist(next) {
  const prev = galCfg;
  galCfg = galClean(next);
  try {
    await setDoc(doc(db, "site", "gallery"), { order: galCfg.order, removed: galCfg.removed, caps: galCfg.caps, v: galCfg.v, updatedAt: serverTimestamp() });
    galActive = true;
    try { localStorage.setItem(GAL_CFG_KEY, JSON.stringify(galCfg)); } catch (_) {}
  } catch (err) { galCfg = prev; throw err; }
  renderGallery(); galAdminRender();
}
async function galRun(fn) {
  if (!isAdmin || galBusy) return;
  galBusy = true;
  try { await fn(); } catch (err) { console.error(err); siteToast(errText(err), "err"); }
  finally { galBusy = false; }
}
const galCopy = () => ({ order: galItems().map((i) => i.key), removed: [...galCfg.removed], caps: { ...galCfg.caps }, v: { ...galCfg.v } });
function galMove(key, how) {
  return galRun(async () => {
    const c = galCopy(), i = c.order.indexOf(key);
    if (i < 0) return;
    c.order.splice(i, 1);
    c.order.splice(how === "top" ? 0 : how === "up" ? Math.max(0, i - 1) : Math.min(c.order.length, i + 1), 0, key);
    await galPersist(c);
  });
}
function galDelete(key) {
  if (!confirm("Usunąć to zdjęcie z galerii na stronie?")) return;
  return galRun(async () => {
    const c = galCopy(); c.order = c.order.filter((k) => k !== key); delete c.caps[key];
    let delId = null;
    if (key.startsWith("s_")) { if (!c.removed.includes(key)) c.removed.push(key); }
    else { delId = key.slice(2); delete c.v[delId]; }
    await galPersist(c);
    if (delId) { try { await deleteDoc(doc(db, "site", "gal_" + delId)); } catch (_) {} delete galCache[delId]; galSave(); }
    siteToast("Zdjęcie usunięte z galerii.", "ok");
  });
}
function galCaption(key, text) {
  const t = text.trim().slice(0, 80);
  if ((galCfg.caps[key] || "") === t) return;
  return galRun(async () => { const c = galCopy(); if (t) c.caps[key] = t; else delete c.caps[key]; await galPersist(c); siteToast("Podpis zapisany.", "ok"); });
}
async function galToJpeg(file) {
  let src, w, h;
  try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); w = src.width; h = src.height; }
  catch (_) {
    src = await new Promise((ok, bad) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); bad(new Error("bad")); }; im.src = u; });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  if (!w || !h) throw new Error("bad");
  let scale = Math.min(1, 1000 / Math.max(w, h)), out = "";
  for (let tries = 0; tries < 6; tries++) {
    const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(w * scale)); cv.height = Math.max(1, Math.round(h * scale));
    const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.imageSmoothingQuality = "high";
    cx.drawImage(src, 0, 0, cv.width, cv.height);
    let q = 0.82; out = cv.toDataURL("image/jpeg", q);
    while (out.length > 140000 && q > 0.5) { q -= 0.08; out = cv.toDataURL("image/jpeg", q); }
    if (out.length <= 160000) break;
    scale *= 0.85;
  }
  if (!okImg(out) || out.length > 220000) throw new Error("big");
  return out;
}
function galAdd(files) {
  return galRun(async () => {
    const list = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name || ""));
    if (!list.length) { siteToast("To nie są zdjęcia. Wybierz pliki JPG lub PNG.", "err"); return; }
    let done = 0;
    for (const f of list) {
      if (Object.keys(galCfg.v).length >= GAL_MAX_UP) { siteToast("Limit " + GAL_MAX_UP + " dodanych zdjęć. Usuń któreś, żeby dodać nowe.", "err"); break; }
      siteToast("Dodaję zdjęcie " + (done + 1) + " z " + list.length + "…", "ok");
      const data = await galToJpeg(f);
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts = Date.now();
      await setDoc(doc(db, "site", "gal_" + id), { d: data, t: ts });
      const c = galCopy(); c.v[id] = ts; c.order.push("u_" + id);
      galCache[id] = { t: ts, d: data };
      await galPersist(c);
      galSave(); done++;
    }
    if (done) siteToast("Dodano zdjęć: " + done + ".", "ok");
  });
}
(function bindGalAdmin() {
  const list = $("rb-gal-list"), add = $("rb-gal-add"), reset = $("rb-gal-reset");
  if (!list || !add) return;
  const fe = document.createElement("input"); fe.type = "file"; fe.accept = "image/*"; fe.multiple = true; fe.hidden = true;
  fe.addEventListener("change", () => { const fs = [...fe.files]; fe.value = ""; if (fs.length) galAdd(fs); });
  document.body.appendChild(fe);
  add.addEventListener("click", () => { if (isAdmin && !galBusy) fe.click(); });
  list.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-a]"), row = e.target.closest(".rb-gal-row");
    if (!b || !row) return;
    const key = row.dataset.k;
    if (b.dataset.a === "del") galDelete(key); else galMove(key, b.dataset.a);
  });
  list.addEventListener("change", (e) => {
    const inp = e.target.closest(".rb-gal-cap"), row = e.target.closest(".rb-gal-row");
    if (inp && row) galCaption(row.dataset.k, inp.value);
  });
  reset.addEventListener("click", () => {
    if (!confirm("Przywrócić wszystkie zdjęcia z kodu strony i ich domyślną kolejność? Dodane przez Ciebie zostaną na końcu.")) return;
    galRun(async () => {
      const up = galItems().filter((i) => !i.stat).map((i) => i.key);
      await galPersist({ order: [...GAL_STATIC.map((x) => x.key), ...up], removed: [], caps: {}, v: { ...galCfg.v } });
      siteToast("Przywrócono domyślną galerię.", "ok");
    });
  });
})();

async function loadSite() {
  try {
    const c = localStorage.getItem(SITE_CACHE_KEY);
    if (c && !loadSite.done) applySite(JSON.parse(c));
  } catch (_) {}
  try {
    const d = await withTimeout(getDoc(doc(db, "site", "config")), 8000);
    loadSite.done = true;
    if (d.exists()) {
      const cfg = d.data();
      applySite(cfg);
      try { localStorage.setItem(SITE_CACHE_KEY, JSON.stringify(plainCfg(cfg))); } catch (_) {}
    } else {
      applySite({});
      try { localStorage.removeItem(SITE_CACHE_KEY); } catch (_) {}
    }
  } catch (e) { console.warn("Ustawienia strony niedostępne:", e && (e.code || e.message)); }
  loadPhotos();
  loadGallery();
}

/* ---------- panel admina: zakładka Strona ---------- */
const siteMsg = $("rb-site-msg");
function siteSay(text, kind) { setMsg(siteMsg, text, kind); if (text) siteToast(text, kind); }
const NOTICE_TYPES = ["info", "promo", "warn"];
function prodRowHtml(p) {
  p = p || {};
  const id = p.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  return `<div class="rb-prod" data-id="${esc(id)}">
    <div class="rb-prod-top">
      <input type="text" class="rb-prod-name" maxlength="60" placeholder="Nazwa, np. PIZZA TRUFLOWA" value="${esc(p.name || "")}" aria-label="Nazwa produktu">
      <input type="text" class="rb-prod-price" inputmode="decimal" maxlength="12" placeholder="np. 39 zł" value="${esc(p.price || "")}" aria-label="Cena">
    </div>
    <select class="rb-prod-cat" aria-label="Kategoria">${PROD_CATS.map((c) => `<option value="${c[0]}"${p.cat === c[0] ? " selected" : ""}>${c[1]}</option>`).join("")}</select>
    <textarea class="rb-prod-desc" rows="2" maxlength="200" placeholder="Opis (skład, opcjonalnie)">${esc(p.desc || "")}</textarea>
    <input type="text" class="rb-prod-tags" maxlength="60" placeholder="Plakietki (opcjonalnie, po przecinku), np. 30cm, 24h" value="${esc((p.tags || []).join(", "))}" aria-label="Plakietki">
    ${qzSelectHtml("rb-prod-qz", qzType(p.qz))}
    <div class="rb-site-badges rb-prod-badges">${BADGES.map((b) => `<label><input type="checkbox" class="rb-prod-bd" data-b="${b[0]}"${badgeIds(p.badges).includes(b[0]) ? " checked" : ""}> ${b[1]}</label>`).join("")}</div>
    <div class="rb-prod-foot">
      <label class="rb-check"><input type="checkbox" class="rb-prod-un"${p.unavail ? " checked" : ""}> niedostępne dziś</label>
      <button type="button" class="rb-btn secondary small rb-prod-del">Usuń produkt</button>
    </div>
  </div>`;
}

function revRowHtml(r) {
  r = r || {};
  const id = r.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const st = Number.isInteger(r.stars) ? r.stars : 5;
  return `<div class="rb-prod rb-rev" data-id="${esc(id)}">
    <div class="rb-rev-top">
      <input type="text" class="rb-rev-name" maxlength="40" placeholder="Autor, np. Anna K." value="${esc(r.name || "")}" aria-label="Autor opinii">
      <select class="rb-rev-stars" aria-label="Liczba gwiazdek">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}"${st === n ? " selected" : ""}>${"★".repeat(n)}</option>`).join("")}</select>
    </div>
    <input type="text" class="rb-rev-when" maxlength="30" placeholder="Kiedy (opcjonalnie), np. 2 tygodnie temu" value="${esc(r.when || "")}" aria-label="Kiedy">
    <textarea class="rb-rev-text" rows="3" maxlength="400" placeholder="Treść opinii (skopiuj z Google)">${esc(r.text || "")}</textarea>
    <div class="rb-prod-foot"><span></span><button type="button" class="rb-btn secondary small rb-rev-del">Usuń opinię</button></div>
  </div>`;
}

const numStr = (v) => (typeof v === "number" ? String(v).replace(".", ",") : "");
function delRowHtml(p) {
  p = p || {};
  return `<div class="rb-del">
    <input type="text" class="rb-del-name" maxlength="40" placeholder="Miejscowość" value="${esc(p.name || "")}" aria-label="Miejscowość">
    <div class="rb-del-nums">
      <div><label>Koszt dowozu (zł)</label><input type="text" class="rb-del-fee" inputmode="decimal" maxlength="7" placeholder="np. 8" value="${esc(numStr(p.fee))}"></div>
      <div><label>Minimum (zł)</label><input type="text" class="rb-del-min" inputmode="decimal" maxlength="7" placeholder="np. 40" value="${esc(numStr(p.min))}"></div>
      <div><label>Gratis od (zł)</label><input type="text" class="rb-del-free" inputmode="decimal" maxlength="7" placeholder="opcj." value="${esc(numStr(p.freeFrom))}"></div>
    </div>
    <button type="button" class="rb-btn secondary small rb-del-rm">Usuń miejscowość</button>
  </div>`;
}

const MAX_CAMPAIGNS = 10;
function campRowHtml(c) {
  c = c || {};
  const id = c.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const f = tsMs(c.from), u = tsMs(c.until);
  const type = NOTICE_TYPES.includes(c.type) ? c.type : "promo";
  return `<div class="rb-camp" data-id="${esc(id)}">
    <input class="rb-camp-text" type="text" maxlength="200" placeholder="np. Happy hour: -5 zł na każdą pizzę!" value="${esc(c.text || "")}">
    <select class="rb-camp-type" aria-label="Rodzaj">
      <option value="info"${type === "info" ? " selected" : ""}>Informacja (zielony)</option>
      <option value="promo"${type === "promo" ? " selected" : ""}>Promocja (złoty)</option>
      <option value="warn"${type === "warn" ? " selected" : ""}>Uwaga (czerwony)</option>
    </select>
    <div class="rb-row">
      <div style="flex:1"><label>Od dnia</label><input class="rb-camp-from" type="date" value="${f ? ymd(new Date(f)) : ""}"></div>
      <div style="flex:1"><label>Do dnia</label><input class="rb-camp-until" type="date" value="${u ? ymd(new Date(u)) : ""}"></div>
    </div>
    <div class="rb-row">
      <div style="flex:1"><label>Od godz. (opcjonalnie)</label><input class="rb-camp-hfrom" type="time" value="${esc(c.hFrom || "")}"></div>
      <div style="flex:1"><label>Do godz.</label><input class="rb-camp-hto" type="time" value="${esc(c.hTo || "")}"></div>
    </div>
    <label class="rb-check"><input class="rb-camp-on" type="checkbox"${c.active === false ? "" : " checked"}> Włączona</label>
    <button type="button" class="rb-btn secondary small rb-camp-del">Usuń akcję</button>
  </div>`;
}
function collectCampaigns() {
  const list = [];
  let bad = "";
  document.querySelectorAll("#rb-camp-list .rb-camp").forEach((row) => {
    if (bad) return;
    const q = (sel) => row.querySelector(sel);
    const text = q(".rb-camp-text").value.replace(/\s+/g, " ").trim();
    const from = q(".rb-camp-from").value, until = q(".rb-camp-until").value;
    const hf = q(".rb-camp-hfrom").value, ht = q(".rb-camp-hto").value;
    if (!text && !from && !until) return;
    if (!text) { bad = "Wpisz treść każdej akcji."; return; }
    if (from && until && until < from) { bad = "W akcji „" + text.slice(0, 30) + "” data „do” jest przed datą „od”."; return; }
    if ((hf && !ht) || (!hf && ht)) { bad = "W akcji „" + text.slice(0, 30) + "” podaj obie godziny albo żadnej."; return; }
    list.push({
      id: row.dataset.id, text, type: q(".rb-camp-type").value, active: q(".rb-camp-on").checked,
      from: from ? Timestamp.fromDate(new Date(from + "T00:00:00")) : null,
      until: until ? Timestamp.fromDate(new Date(until + "T23:59:59")) : null,
      hFrom: hf || "", hTo: ht || ""
    });
  });
  if (!bad && list.length > MAX_CAMPAIGNS) bad = "Maksymalnie " + MAX_CAMPAIGNS + " akcji.";
  return { list, bad };
}
function fillSiteForm() {
  $("rb-camp-list").innerHTML = (siteCfg.campaigns || []).map(campRowHtml).join("");
  const dp = siteCfg.delivery.places.filter(validPlace);
  $("rb-del-list").innerHTML = dp.map(delRowHtml).join("");
  $("rb-site-google").value = siteCfg.googleReviewUrl || "";
  $("rb-site-theme").value = siteCfg.theme === "auto" || THEMES[siteCfg.theme] ? siteCfg.theme : "";
  showThemeNow();
  fillLevelsForm();
  fillPollForm();
  fillHoursForm();
  try { bkFillList(); } catch (_) {}
  try { qpPreview(); } catch (_) {}
  $("rb-prod-list").innerHTML = siteCfg.products.filter(validProduct).map(prodRowHtml).join("");
  $("rb-rev-list").innerHTML = (siteCfg.reviews || []).filter(validReview).map(revRowHtml).join("");
  $("rb-site-gmaps").value = siteCfg.googleMapsUrl || "";
  const items = menuEls().filter((el) => !el.dataset.custom);
  $("rb-site-items").innerHTML = items.map((el) => {
    const key = itemKey(el);
    const cur = siteCfg.prices[key] || el.dataset.origPrice || "";
    return `<div class="rb-site-row" data-key="${esc(key)}">
      <div class="rb-site-name">${esc(itemName(el))}<small>w kodzie strony: ${esc(el.dataset.origPrice || "")}</small></div>
      <input type="text" class="rb-site-price" inputmode="decimal" maxlength="12" value="${esc(cur)}" aria-label="Cena: ${esc(itemName(el))}">
      ${qzSelectHtml("rb-site-qz", qzType(siteCfg.qz[key]))}
      <div class="rb-site-badges">${BADGES.map((b) => `<label><input type="checkbox" class="rb-site-bd" data-b="${b[0]}"${badgeIds(siteCfg.badges[key]).includes(b[0]) ? " checked" : ""}> ${b[1]}</label>`).join("")}
        <label class="rb-site-un"><input type="checkbox" class="rb-site-unav"${siteCfg.unavailable[key] ? " checked" : ""}> ⛔ niedostępne dziś</label>
        <label class="rb-site-un"><input type="checkbox" class="rb-site-hide"${siteCfg.hidden[key] ? " checked" : ""}> 🙈 ukryj</label></div>
    </div>`;
  }).join("");
  $("rb-site-dish").innerHTML = '<option value="">— brak —</option>' + menuEls().map((el) => `<option value="${esc(itemKey(el))}">${esc(itemName(el))}</option>`).join("");
  const n = siteCfg.notice || {};
  $("rb-site-notice-text").value = n.text || "";
  $("rb-site-notice-type").value = NOTICE_TYPES.includes(n.type) ? n.type : "info";
  const um = tsMs(n.until);
  $("rb-site-notice-until").value = um ? ymd(new Date(um)) : "";
  $("rb-site-notice-on").checked = !!n.active;
  const d = siteCfg.dish || {};
  $("rb-site-dish").value = d.key || "";
  $("rb-site-dish-text").value = d.text || "";
  $("rb-site-dish-on").checked = !!d.active;
}

$("rb-del-add").addEventListener("click", () => {
  const list = $("rb-del-list");
  if (list.querySelectorAll(".rb-del").length >= 40) { siteSay( "Maksymalnie 40 miejscowości.", "err"); return; }
  list.insertAdjacentHTML("beforeend", delRowHtml());
  list.lastElementChild.querySelector(".rb-del-name").focus();
});
$("rb-del-bulk").addEventListener("click", () => {
  const vals = { ".rb-del-fee": $("rb-del-bulk-fee").value.trim(), ".rb-del-min": $("rb-del-bulk-min").value.trim(), ".rb-del-free": $("rb-del-bulk-free").value.trim() };
  if (!Object.values(vals).some(Boolean)) { siteSay( "Wpisz kwotę w co najmniej jednym polu „Ustaw wszystkim naraz”.", "err"); return; }
  document.querySelectorAll("#rb-del-list .rb-del").forEach((row) => {
    Object.entries(vals).forEach(([sel, v]) => { if (v) row.querySelector(sel).value = v; });
  });
  siteSay( "Wpisano we wszystkich wierszach. Kliknij „Zapisz i opublikuj na stronie”, żeby zatwierdzić.", "ok");
});
$("rb-del-list").addEventListener("click", (e) => {
  const b = e.target.closest(".rb-del-rm");
  if (b) b.closest(".rb-del").remove();
});
$("rb-camp-add").addEventListener("click", () => {
  const list = $("rb-camp-list");
  if (list.querySelectorAll(".rb-camp").length >= MAX_CAMPAIGNS) { siteSay( "Maksymalnie " + MAX_CAMPAIGNS + " akcji.", "err"); return; }
  list.insertAdjacentHTML("beforeend", campRowHtml());
  const last = list.lastElementChild;
  last.scrollIntoView({ behavior: "smooth", block: "center" });
  last.querySelector(".rb-camp-text").focus();
});
$("rb-camp-list").addEventListener("click", (e) => {
  const b = e.target.closest(".rb-camp-del");
  if (b && confirm("Usunąć tę akcję? Zmiana wejdzie po kliknięciu „Zapisz i opublikuj”.")) b.closest(".rb-camp").remove();
});
$("rb-rev-add").addEventListener("click", () => {
  const list = $("rb-rev-list");
  if (list.querySelectorAll(".rb-rev").length >= MAX_REVIEWS) { siteSay("Maksymalnie " + MAX_REVIEWS + " opinii.", "err"); return; }
  list.insertAdjacentHTML("beforeend", revRowHtml());
  const last = list.lastElementChild;
  last.scrollIntoView({ behavior: "smooth", block: "center" });
  last.querySelector(".rb-rev-name").focus();
});
$("rb-rev-list").addEventListener("click", (e) => {
  const b = e.target.closest(".rb-rev-del");
  if (b && confirm("Usunąć tę opinię? Zmiana wejdzie po kliknięciu „Zapisz i opublikuj”.")) b.closest(".rb-rev").remove();
});
$("rb-prod-add").addEventListener("click", () => {
  const list = $("rb-prod-list");
  if (list.querySelectorAll(".rb-prod").length >= MAX_PRODUCTS) { siteSay( "Maksymalnie " + MAX_PRODUCTS + " własnych produktów.", "err"); return; }
  list.insertAdjacentHTML("beforeend", prodRowHtml());
  const last = list.lastElementChild;
  last.scrollIntoView({ behavior: "smooth", block: "center" });
  last.querySelector(".rb-prod-name").focus();
});
// rodzaj dla quizu podpowiada się z kategorii, dopóki nie ustawisz go ręcznie
$("rb-prod-list").addEventListener("change", (e) => {
  const row = e.target.closest(".rb-prod");
  if (!row) return;
  const qs = row.querySelector(".rb-prod-qz");
  if (e.target.classList.contains("rb-prod-qz")) { qs.dataset.auto = ""; return; }
  if (e.target.classList.contains("rb-prod-cat") && qs && (qs.value === "" || qs.dataset.auto === "1")) { qs.value = { miesne: "meat", vege: "vege" }[e.target.value] || ""; qs.dataset.auto = "1"; }
});
$("rb-prod-list").addEventListener("click", (e) => {
  const b = e.target.closest(".rb-prod-del");
  if (!b) return;
  const row = b.closest(".rb-prod");
  const nm = row.querySelector(".rb-prod-name").value.trim();
  if (confirm("Usunąć produkt" + (nm ? " „" + nm + "”" : "") + "? Zmiana wejdzie po kliknięciu „Zapisz i opublikuj”.")) row.remove();
});

$("rb-site-reset").addEventListener("click", () => {
  document.querySelectorAll("#rb-site-items .rb-site-row").forEach((row) => {
    const el = menuEls().find((e) => itemKey(e) === row.dataset.key);
    if (el) row.querySelector(".rb-site-price").value = el.dataset.origPrice || "";
    row.querySelector(".rb-site-unav").checked = false;
    row.querySelector(".rb-site-hide").checked = false;
  });
  siteSay( "Przywrócono ceny z kodu strony. Kliknij „Zapisz i opublikuj”, żeby zatwierdzić.", "ok");
});

let toastT = null;
function siteToast(text, kind) {
  const t = $("rb-site-toast");
  clearTimeout(toastT);
  t.textContent = text; t.className = "rb-toast" + (kind === "err" ? " err" : ""); t.hidden = false;
  toastT = setTimeout(() => { t.hidden = true; }, kind === "err" ? 7000 : 3000);
}
async function saveSite() {
  const say = (text, kind) => { setMsg(siteMsg, text, kind); if (text) siteToast(text, kind); };
  say("");
  const prices = {}, unavailable = {}, hidden = {}, badges = {}, qz = {};
  let bad = "";
  document.querySelectorAll("#rb-site-items .rb-site-row").forEach((row) => {
    if (bad) return;
    const key = row.dataset.key;
    const el = menuEls().find((e) => itemKey(e) === key);
    let v = row.querySelector(".rb-site-price").value.replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ");
    if (/^\d+([.,]\d{1,2})?$/.test(v)) v += " zł";
    v = v.replace(/\s?zł$/i, " zł");
    if (!/^\d+([.,]\d{1,2})? zł$/.test(v)) { bad = itemName(el); return; }
    if (!el || v !== el.dataset.origPrice) prices[key] = v;
    if (row.querySelector(".rb-site-unav").checked) unavailable[key] = true;
    if (row.querySelector(".rb-site-hide").checked) hidden[key] = true;
    const bl = [...row.querySelectorAll(".rb-site-bd:checked")].map((c) => c.dataset.b);
    if (bl.length) badges[key] = bl;
    const qv = qzType(row.querySelector(".rb-site-qz").value);
    if (qv) qz[key] = qv;
  });
  if (bad) { say( "Popraw cenę przy: " + bad + " (np. 36 zł).", "err"); return; }
  const products = [];
  const usedKeys = new Set(menuEls().filter((el) => !el.dataset.custom).map(itemKey));
  let prodBad = "";
  document.querySelectorAll("#rb-prod-list .rb-prod").forEach((row) => {
    if (prodBad) return;
    const name = row.querySelector(".rb-prod-name").value.replace(/\s+/g, " ").trim().toLocaleUpperCase("pl");
    let price = row.querySelector(".rb-prod-price").value.replace(/ /g, " ").trim().replace(/\s+/g, " ");
    const desc = row.querySelector(".rb-prod-desc").value.replace(/\s+/g, " ").trim();
    const cat = row.querySelector(".rb-prod-cat").value;
    const tags = row.querySelector(".rb-prod-tags").value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 3).map((t) => t.slice(0, 20));
    if (!name && !price && !desc) return; // pusty wiersz ignorujemy
    if (!name) { prodBad = "Wpisz nazwę każdego nowego produktu."; return; }
    if (/^\d+([.,]\d{1,2})?$/.test(price)) price += " zł";
    price = price.replace(/\s?zł$/i, " zł");
    if (!/^\d+([.,]\d{1,2})? zł$/.test(price)) { prodBad = "Popraw cenę produktu „" + name + "” (np. 39 zł)."; return; }
    if (!PROD_CATS.some((c) => c[0] === cat)) { prodBad = "Wybierz kategorię produktu „" + name + "”."; return; }
    const k = name.replace(/^\s*\d+\.\s*/, "").trim().toLowerCase();
    if (usedKeys.has(k)) { prodBad = "Produkt „" + name + "” już istnieje w menu — zmień nazwę."; return; }
    usedKeys.add(k);
    const bdg = [...row.querySelectorAll(".rb-prod-bd:checked")].map((c) => c.dataset.b);
    products.push({ id: row.dataset.id, name, price, cat, desc, tags, badges: bdg, qz: qzType(row.querySelector(".rb-prod-qz").value), unavail: row.querySelector(".rb-prod-un").checked });
  });
  if (prodBad) { say( prodBad, "err"); return; }
  const parseZl = (v) => {
    v = String(v).trim().replace(",", ".");
    if (v === "") return null;
    return /^\d{1,4}(\.\d{1,2})?$/.test(v) ? Number(v) : NaN;
  };
  const places = [];
  const seenPlaces = new Set();
  let delBad = "";
  document.querySelectorAll("#rb-del-list .rb-del").forEach((row) => {
    if (delBad) return;
    const name = row.querySelector(".rb-del-name").value.replace(/\s+/g, " ").trim();
    const fee = parseZl(row.querySelector(".rb-del-fee").value);
    const min = parseZl(row.querySelector(".rb-del-min").value);
    const freeFrom = parseZl(row.querySelector(".rb-del-free").value);
    if (!name && fee === null && min === null && freeFrom === null) return;
    if (!name) { delBad = "Wpisz nazwę każdej miejscowości w sekcji Dowóz."; return; }
    if ([fee, min, freeFrom].some((x) => Number.isNaN(x))) { delBad = "Popraw kwoty przy miejscowości „" + name + "” (np. 8 lub 8,50)."; return; }
    const k = normTxt(name);
    if (seenPlaces.has(k)) { delBad = "Miejscowość „" + name + "” jest na liście dwa razy."; return; }
    seenPlaces.add(k);
    places.push({ name, fee, min, freeFrom });
  });
  if (delBad) { say( delBad, "err"); return; }
  const tv = $("rb-site-theme").value, theme = tv === "auto" || THEMES[tv] ? tv : "";
  const lvRes = collectLevels();
  if (lvRes.bad) { say(lvRes.bad, "err"); return; }
  const pollRes = collectPoll();
  if (pollRes.bad) { say(pollRes.bad, "err"); return; }
  const poll = pollRes.poll;
  const hoursRes = collectHours();
  if (hoursRes.bad) { say(hoursRes.bad, "err"); return; }
  const hours = hoursRes.hours;
  const levels = lvRes.list, levelsOn = $("rb-lv-on").checked, refOn = $("rb-ref-on").checked;
  const googleReviewUrl = $("rb-site-google").value.trim();
  if (googleReviewUrl && !/^https:\/\/\S+$/.test(googleReviewUrl)) { say( "Link do opinii w Google musi zaczynać się od https://", "err"); return; }
  const delivery = { places };
  if (products.length > MAX_PRODUCTS) { say( "Maksymalnie " + MAX_PRODUCTS + " własnych produktów.", "err"); return; }
  const text = $("rb-site-notice-text").value.trim();
  const until = $("rb-site-notice-until").value;
  const notice = {
    text, type: $("rb-site-notice-type").value,
    active: $("rb-site-notice-on").checked && !!text,
    until: until ? Timestamp.fromDate(new Date(until + "T23:59:59")) : null
  };
  const camp = collectCampaigns();
  if (camp.bad) { say( camp.bad, "err"); return; }
  const campaigns = camp.list;
  const dishKey = $("rb-site-dish").value;
  const dish = { key: dishKey, text: $("rb-site-dish-text").value.trim(), active: $("rb-site-dish-on").checked && !!dishKey };
  const reviews = [];
  let revBad = "";
  document.querySelectorAll("#rb-rev-list .rb-rev").forEach((row) => {
    if (revBad) return;
    const name = row.querySelector(".rb-rev-name").value.replace(/\s+/g, " ").trim();
    const text = row.querySelector(".rb-rev-text").value.replace(/\s+/g, " ").trim();
    const when = row.querySelector(".rb-rev-when").value.replace(/\s+/g, " ").trim().slice(0, 30);
    const stars = parseInt(row.querySelector(".rb-rev-stars").value, 10);
    if (!name && !text) return;
    if (!name || !text) { revBad = "Uzupełnij autora i treść każdej opinii."; return; }
    reviews.push({ id: row.dataset.id, name: name.slice(0, 40), stars: stars >= 1 && stars <= 5 ? stars : 5, when, text: text.slice(0, 400) });
  });
  if (revBad) { say( revBad, "err"); return; }
  if (reviews.length > MAX_REVIEWS) { say( "Maksymalnie " + MAX_REVIEWS + " opinii.", "err"); return; }
  const googleMapsUrl = $("rb-site-gmaps").value.trim();
  if (googleMapsUrl && !httpsUrl(googleMapsUrl)) { say( "Link do opinii w Mapach Google musi zaczynać się od https://", "err"); return; }
  const btns = [$("rb-site-save"), ...document.querySelectorAll(".rb-sec-save")];
  btns.forEach((b) => { b.disabled = true; });
  try {
    await setDoc(doc(db, "site", "config"), { prices, unavailable, hidden, badges, qz, products, campaigns, notice, dish, delivery, googleReviewUrl, reviews, googleMapsUrl, theme, levelsOn, levels, levelsV: 2, refOn, poll, hours, updatedAt: serverTimestamp() });
    const cfg = { prices, unavailable, hidden, badges, qz, products, campaigns, notice, dish, delivery, googleReviewUrl, reviews, googleMapsUrl, theme, levelsOn, levels, levelsV: 2, refOn, poll, hours };
    applySite(cfg);
    fillSiteForm();
    try { localStorage.setItem(SITE_CACHE_KEY, JSON.stringify(plainCfg(cfg))); } catch (_) {}
    say( "Zapisano. Zmiany są już na stronie.", "ok");
  } catch (err) {
    console.error(err);
    say( errText(err), "err");
  } finally { btns.forEach((b) => { b.disabled = false; }); }
}
$("rb-site-save").addEventListener("click", saveSite);
document.querySelectorAll(".rb-sec-save").forEach((b) => b.addEventListener("click", saveSite));

/* ---------- godziny otwarcia i dni wolne (Strona → Godziny) ---------- */
const HRS_DAYS = [[1, "Poniedziałek"], [2, "Wtorek"], [3, "Środa"], [4, "Czwartek"], [5, "Piątek"], [6, "Sobota"], [0, "Niedziela"]];
const hrsMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
const hrsStr = (n) => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
function validHours(h) {
  if (!h || !Array.isArray(h.days) || h.days.length !== 7) return null;
  const days = h.days.map((d) => (d && Number.isInteger(d.o) && Number.isInteger(d.c) && d.o >= 0 && d.c <= 1440 && d.o < d.c ? { o: d.o, c: d.c } : null));
  const closed = Array.isArray(h.closed) ? h.closed.filter((s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)).slice(0, 80) : [];
  const hol = Array.isArray(h.hol) ? h.hol.filter((k) => window.PL_HOL_KEYS.includes(k)) : window.PL_HOL_KEYS.slice();
  return { days, closed, hol };
}
let hrsClosed = [];
function hrsClosedHtml() {
  $("rb-hrs-closed").innerHTML = hrsClosed.length
    ? hrsClosed.map((d, i) => `<span class="rb-poll-chip">${esc(d.split("-").reverse().join("."))} <a href="#" data-hrs-del="${i}" aria-label="Usuń">✕</a></span>`).join(" ")
    : '<div class="rb-meta">Brak dni wolnych.</div>';
}
function fillHoursForm() {
  const h = siteCfg.hours || { days: window.WR_DEF_HOURS, closed: [] };
  $("rb-hrs-rows").innerHTML = HRS_DAYS.map(([d, n]) => {
    const x = h.days[d];
    return `<div class="rb-hrs-row"><label class="rb-check"><input type="checkbox" class="rb-hrs-on" data-d="${d}"${x ? " checked" : ""}> ${n}</label><input type="time" class="rb-hrs-o" data-d="${d}" value="${hrsStr(x ? x.o : 720)}"><span>–</span><input type="time" class="rb-hrs-c" data-d="${d}" value="${hrsStr(x ? x.c : 1200)}"></div>`;
  }).join("");
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const on = h.hol || window.PL_HOL_KEYS, y0 = t.getFullYear();
  $("rb-hrs-hol").innerHTML = window.PL_HOL_KEYS.map((k) => {
    const hd = [y0, y0 + 1].map((y) => window.plHolidays(y).find((x) => x.key === k)).find((x) => x && x.dt >= t) || window.plHolidays(y0 + 1).find((x) => x.key === k) || window.plHolidays(y0).find((x) => x.key === k);
    return `<label class="rb-check"><input type="checkbox" class="rb-hrs-hol" data-k="${k}"${on.includes(k) ? " checked" : ""}> ${esc(hd.name)} <span class="rb-meta">— ${hd.dt.toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</span></label>`;
  }).join("");
  const keep = (s) => { const p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]) >= t; };
  hrsClosed = (h.closed || []).filter(keep).sort();
  hrsClosedHtml();
}
function collectHours() {
  const days = [0, 1, 2, 3, 4, 5, 6].map(() => null);
  for (const [d, n] of HRS_DAYS) {
    if (!document.querySelector(`.rb-hrs-on[data-d="${d}"]`).checked) continue;
    const o = hrsMin(document.querySelector(`.rb-hrs-o[data-d="${d}"]`).value), c = hrsMin(document.querySelector(`.rb-hrs-c[data-d="${d}"]`).value);
    if (!(o >= 0 && c > o)) return { bad: n + ": godzina otwarcia musi być wcześniejsza niż zamknięcia." };
    days[d] = { o, c };
  }
  return { hours: { days, closed: hrsClosed.slice(), hol: [...document.querySelectorAll(".rb-hrs-hol:checked")].map((c) => c.dataset.k) } };
}
$("rb-hrs-hol-all").addEventListener("click", () => document.querySelectorAll(".rb-hrs-hol").forEach((c) => { c.checked = true; }));
$("rb-hrs-hol-none").addEventListener("click", () => document.querySelectorAll(".rb-hrs-hol").forEach((c) => { c.checked = false; }));
$("rb-hrs-add").addEventListener("click", () => {
  const v = $("rb-hrs-date").value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
  if (!hrsClosed.includes(v) && hrsClosed.length < 80) hrsClosed.push(v);
  hrsClosed.sort(); $("rb-hrs-date").value = ""; hrsClosedHtml();
});
$("rb-hrs-closed").addEventListener("click", (e) => {
  const a = e.target.closest("[data-hrs-del]");
  if (!a) return;
  e.preventDefault(); hrsClosed.splice(Number(a.dataset.hrsDel), 1); hrsClosedHtml();
});

/* ---------- głosowanie klientów (np. „jaką pizzę dodać do menu?”) ---------- */
/* Dwa rodzaje: „fixed” (odpowiedzi wpisuje admin) i „open” (klienci zgłaszają propozycje, po zebraniu limitu lista się zamyka i wszyscy głosują przez kilka dni). */
const POLL_MAX = 6, PROP_MAX = 20;
function validPoll(p) {
  if (!p || typeof p !== "object" || typeof p.id !== "string" || !/^[a-z0-9]{4,24}$/.test(p.id)) return null;
  const q = String(p.q || "").trim().slice(0, 120);
  const mode = p.mode === "open" ? "open" : "fixed";
  const opts = Array.isArray(p.opts) ? p.opts.map((o) => String(o || "").trim().slice(0, 40)).filter(Boolean).slice(0, PROP_MAX) : [];
  if (!q || (mode === "fixed" && opts.length < 2)) return null;
  const res = Array.isArray(p.results) && p.results.length === opts.length && opts.length >= 2 && p.results.every((n) => Number.isInteger(n) && n >= 0) ? p.results : null;
  const maxP = Number.isInteger(p.maxP) && p.maxP >= 3 && p.maxP <= PROP_MAX ? p.maxP : 10;
  const days = Number.isInteger(p.days) && p.days >= 1 && p.days <= 14 ? p.days : 2;
  return { id: p.id, q, mode, opts, open: p.open === true, results: res, maxP, days };
}
const newPollId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const pollTotal = (r) => r.reduce((a, b) => a + b, 0);
const pollWord = (n) => { const m10 = n % 10, m100 = n % 100; return n === 1 ? "głos" : (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) ? "głosy" : "głosów"; };
const pollDays = (n) => n + " " + (n === 1 ? "dzień" : "dni");
const atMs = (t) => (typeof t === "number" ? t : tsMs(t));
const pollFmt = (ms) => new Date(ms).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
function pollBarsHtml(opts, counts) {
  const tot = Math.max(1, pollTotal(counts)), top = Math.max(...counts);
  return opts.map((o, i) => `<div class="poll-bar${counts[i] === top && top > 0 ? " win" : ""}"><span>${esc(o)}</span><div><i style="width:${Math.round(counts[i] / tot * 100)}%"></i></div><b>${counts[i]} (${Math.round(counts[i] / tot * 100)}%)</b></div>`).join("");
}
/* --- strona główna --- */
function renderPollPublic() {
  const sec = $("glosowanie");
  if (!sec) return;
  const p = siteCfg.poll;
  if (!p || (!p.open && !p.results)) { sec.hidden = true; return; }
  $("pollQ").textContent = p.q;
  if (p.open) {
    $("pollPub").innerHTML = p.mode === "open"
      ? `<div class="poll-opt"><b>💡</b> <span>Zaproponuj własną pizzę! Zbieramy pierwszych ${p.maxP} propozycji od klientów, a potem wszyscy głosują przez ${pollDays(p.days)}.</span></div>`
      : p.opts.map((o, i) => `<div class="poll-opt"><b>${String.fromCharCode(65 + i)}</b> ${esc(o)}</div>`).join("");
    $("pollCta").innerHTML = '<a class="rev-btn" href="#konto">Zaloguj się i weź udział w swoim koncie</a>';
  } else {
    const r = p.results, top = Math.max(...r), w = r.indexOf(top);
    $("pollPub").innerHTML = '<div class="poll-res">' + pollBarsHtml(p.opts, r) + "</div>";
    $("pollCta").innerHTML = top > 0 ? `<div class="poll-win">🏆 Wygrywa: <b>${esc(p.opts[w])}</b> — dziękujemy za ${pollTotal(r)} ${pollWord(pollTotal(r))}!</div>` : "";
  }
  sec.hidden = false;
}
/* --- panel klienta (Konto) --- */
let pollSt = { key: "", props: null, mark: undefined, vote: undefined, at: 0, busy: false };
const propRows = (s) => s.docs.map((d) => ({ id: d.id, slot: d.data().slot, text: d.data().text, at: d.data().at })).sort((a, b) => a.slot - b.slot);
async function renderPoll(user, force) {
  const el = $("rb-poll");
  if (!el) return;
  const p = siteCfg.poll;
  if (!user || !p || !p.open || isAdmin || isStaff) { el.hidden = true; return; }
  const key = p.id + "_" + user.uid;
  if (pollSt.key !== key) pollSt = { key, props: null, mark: undefined, vote: undefined, at: 0, busy: false };
  if (pollSt.busy) return;
  if (force || pollSt.vote === undefined || Date.now() - pollSt.at > 20000) {
    pollSt.busy = true;
    try {
      const tasks = [getDoc(doc(db, "pollVotes", key)).then((s) => { pollSt.vote = s.exists() ? s.data().opt : null; }).catch(() => { pollSt.vote = null; })];
      if (p.mode === "open") {
        tasks.push(getDocs(query(collection(db, "pollProps"), where("pollId", "==", p.id))).then((s) => { pollSt.props = propRows(s); }).catch(() => { pollSt.props = pollSt.props || []; }));
        tasks.push(getDoc(doc(db, "pollMarks", key)).then((s) => { pollSt.mark = s.exists(); }).catch(() => { pollSt.mark = !!pollSt.mark; }));
      }
      await Promise.all(tasks);
    } finally { pollSt.busy = false; pollSt.at = Date.now(); }
  }
  if (!siteCfg.poll || siteCfg.poll.id !== p.id || pollSt.key !== key) return;
  paintPoll(el, siteCfg.poll);
}
function pollPhase(p) {
  if (p.mode !== "open") return { ph: "vote", opts: p.opts.map((t, i) => ({ v: i, t })) };
  const props = pollSt.props || [];
  if (props.length < p.maxP) return { ph: "propose", props };
  const end = atMs(props[p.maxP - 1].at) + p.days * DAY;
  const opts = props.map((x) => ({ v: x.slot, t: x.text }));
  return { ph: Date.now() < end ? "vote" : "ended", opts, end };
}
function paintPoll(el, p, note) {
  const st = pollPhase(p);
  let body = "";
  if (st.ph === "propose") {
    const left = p.maxP - st.props.length;
    body = `<div class="rb-meta">Zbieramy pierwszych ${p.maxP} propozycji od klientów (wolnych miejsc: ${left}). Potem lista się zamyka i wszyscy głosują przez ${pollDays(p.days)}.</div>`
      + (st.props.length ? '<div class="rb-poll-chips">' + st.props.map((x) => `<span class="rb-poll-chip">${esc(x.text)}</span>`).join("") + "</div>" : "")
      + (pollSt.mark
        ? '<div class="rb-meta">✅ Twoja propozycja jest zgłoszona. Wrócimy do głosowania, gdy zbierzemy komplet.</div><button type="button" class="rb-btn secondary small" data-prefresh>🔄 Odśwież</button>'
        : '<input id="rb-poll-prop" maxlength="40" placeholder="Twoja propozycja, np. Bolognese" autocomplete="off"><button type="button" class="rb-btn small" data-ppropose>Zaproponuj</button>');
  } else if (st.ph === "ended") {
    body = '<div class="rb-meta">Głosowanie zakończone. Wyniki ogłosimy wkrótce na stronie.</div>';
  } else {
    const voted = Number.isInteger(pollSt.vote), mine = voted ? st.opts.find((o) => o.v === pollSt.vote) : null;
    body = (st.end ? `<div class="rb-meta">Głosować można do ${esc(pollFmt(st.end))}.</div>` : "")
      + (voted
        ? `<div class="rb-meta">✅ Dziękujemy! Twój głos: <b>${esc(mine ? mine.t : "")}</b>. Wyniki ogłosimy na stronie po zakończeniu.</div>`
        : st.opts.map((o) => `<label class="rb-poll-o"><input type="radio" name="rbpoll" value="${o.v}"> ${esc(o.t)}</label>`).join("") + '<button type="button" class="rb-btn small" data-pvote>Zagłosuj</button>');
  }
  el.hidden = false;
  el.innerHTML = `<div class="rb-sec" style="margin-top:0"><h3>🗳 Głosowanie</h3></div><div class="rb-poll-q">${esc(p.q)}</div>${body}` + (note ? `<div class="rb-msg err">${esc(note)}</div>` : "");
}
async function submitProp(user, p, text) {
  const key = p.id + "_" + user.uid;
  for (let i = 0; i < 4; i++) {
    const props = propRows(await getDocs(query(collection(db, "pollProps"), where("pollId", "==", p.id))));
    pollSt.props = props;
    if (props.length >= p.maxP) throw { full: true };
    if (props.some((x) => String(x.text).toLowerCase() === text.toLowerCase())) throw { dup: true };
    const slot = props.length + 1;
    try {
      const b = writeBatch(db);
      b.set(doc(db, "pollMarks", key), { uid: user.uid, pollId: p.id, slot, at: serverTimestamp() });
      b.set(doc(db, "pollProps", p.id + "_" + slot), { pollId: p.id, slot, text, at: serverTimestamp() });
      await b.commit();
      pollSt.mark = true;
      pollSt.props = propRows(await getDocs(query(collection(db, "pollProps"), where("pollId", "==", p.id))));
      return;
    } catch (e) { if (!(e && e.code === "permission-denied" && i < 3)) throw e; }
  }
}
$("rb-poll").addEventListener("click", async (e) => {
  const p = siteCfg.poll, user = auth.currentUser, el = $("rb-poll");
  if (!p || !user || !p.open) return;
  if (e.target.closest("[data-prefresh]")) { renderPoll(user, true); return; }
  const pb = e.target.closest("[data-ppropose]");
  if (pb) {
    const text = ($("rb-poll-prop").value || "").replace(/\s+/g, " ").trim();
    if (text.length < 2) { paintPoll(el, p, "Wpisz propozycję (minimum 2 znaki)."); return; }
    pb.disabled = true;
    try { await submitProp(user, p, text); paintPoll(el, p); }
    catch (err) {
      console.error(err);
      paintPoll(el, p, err && err.full ? "Komplet propozycji już się zebrał, teraz czas na głosowanie." : err && err.dup ? "Taka propozycja już jest na liście." : err && err.code === "permission-denied" ? "Nie udało się dodać propozycji: mogłeś już jedną zgłosić albo limit właśnie się zapełnił. Odśwież listę." : errText(err));
      if (err && err.full) renderPoll(user, true);
    }
    return;
  }
  const b = e.target.closest("[data-pvote]");
  if (!b) return;
  const ch = el.querySelector('input[name="rbpoll"]:checked');
  if (!ch) { paintPoll(el, p, "Wybierz jedną odpowiedź."); return; }
  const opt = Number(ch.value);
  b.disabled = true;
  try {
    await setDoc(doc(db, "pollVotes", p.id + "_" + user.uid), { uid: user.uid, pollId: p.id, opt, at: serverTimestamp() });
    pollSt.vote = opt;
    paintPoll(el, p);
  } catch (err) {
    console.error(err);
    paintPoll(el, p, err && err.code === "permission-denied" ? "Nie udało się zagłosować: głosowanie mogło się zakończyć, już głosowałeś albo konto jest zablokowane." : errText(err));
  }
});
/* --- panel admina (Strona → Głosowanie) --- */
let pollDraft = { id: "", results: null, opts: [] };
function renderPollOpts(list) {
  const box = $("rb-poll-opts");
  const arr = list.slice(0, POLL_MAX);
  while (arr.length < 2) arr.push("");
  box.innerHTML = arr.map((o, i) => `<input class="rb-poll-opt" maxlength="40" placeholder="Odpowiedź ${i + 1}" value="${esc(o)}">`).join("");
  $("rb-poll-add").disabled = arr.length >= POLL_MAX;
}
function pollModeUi() {
  const open = $("rb-poll-mode").value === "open";
  $("rb-poll-fixed").hidden = open;
  $("rb-poll-openbox").hidden = !open;
}
function pollInfo(txt) {
  const p = siteCfg.poll;
  $("rb-poll-towin").hidden = !(p && !p.open && p.results && Math.max(...p.results) > 0);
  $("rb-poll-id").textContent = txt || (p ? "Zapisane głosowanie: " + (p.open ? "aktywne" : p.results ? "zakończone, wyniki opublikowane" : "zamknięte") + "." : "Brak zapisanego głosowania.");
}
function fillPollForm() {
  const p = siteCfg.poll;
  pollDraft = { id: p ? p.id : "", results: p ? p.results : null, opts: p ? p.opts : [] };
  $("rb-poll-mode").value = p ? p.mode : "fixed";
  $("rb-poll-q").value = p ? p.q : "";
  renderPollOpts(p && p.mode === "fixed" ? p.opts : ["", ""]);
  $("rb-poll-max").value = p ? p.maxP : 10;
  $("rb-poll-max").disabled = !!(p && p.mode === "open");
  $("rb-poll-days").value = p ? p.days : 2;
  $("rb-poll-open").checked = p ? p.open : true;
  $("rb-poll-out").innerHTML = "";
  pollModeUi();
  pollInfo();
}
function collectPoll() {
  const mode = $("rb-poll-mode").value === "open" ? "open" : "fixed";
  const q = $("rb-poll-q").value.trim(), saved = siteCfg.poll;
  const opts = [...document.querySelectorAll("#rb-poll-opts .rb-poll-opt")].map((i) => i.value.trim()).filter(Boolean);
  if (!q && !opts.length) return { poll: null };
  if (!q) return { bad: "Wpisz pytanie głosowania (albo wyczyść pytanie i odpowiedzi, żeby usunąć głosowanie)." };
  if (pollDraft.id && saved && saved.id === pollDraft.id && saved.mode !== mode) pollDraft = { id: "", results: null, opts: [] };
  const open = $("rb-poll-open").checked;
  if (mode === "fixed") {
    if (opts.length < 2) return { bad: "W głosowaniu muszą być co najmniej 2 odpowiedzi." };
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return { bad: "Odpowiedzi w głosowaniu nie mogą się powtarzać." };
    if (!pollDraft.id) pollDraft.id = newPollId();
    let results = pollDraft.results;
    if (open || !results || results.length !== opts.length) results = null;
    return { poll: { id: pollDraft.id, q: q.slice(0, 120), mode, opts: opts.map((o) => o.slice(0, 40)), open, results } };
  }
  let maxP = Number($("rb-poll-max").value);
  const days = Number($("rb-poll-days").value);
  if (saved && saved.id === pollDraft.id && saved.mode === "open") maxP = saved.maxP;
  if (!Number.isInteger(maxP) || maxP < 3 || maxP > PROP_MAX) return { bad: "Liczba propozycji do zebrania: od 3 do " + PROP_MAX + "." };
  if (!Number.isInteger(days) || days < 1 || days > 14) return { bad: "Czas głosowania: od 1 do 14 dni." };
  if (!pollDraft.id) pollDraft.id = newPollId();
  const keep = !open && pollDraft.results && pollDraft.opts.length === pollDraft.results.length;
  return { poll: { id: pollDraft.id, q: q.slice(0, 120), mode, maxP, days, opts: keep ? pollDraft.opts : [], open, results: keep ? pollDraft.results : null } };
}
async function pollTally() {
  const p = siteCfg.poll;
  if (!p) throw new Error("Najpierw zapisz głosowanie (przycisk Zapisz).");
  const vs = await getDocs(query(collection(db, "pollVotes"), where("pollId", "==", p.id)));
  if (p.mode === "open") {
    const props = propRows(await getDocs(query(collection(db, "pollProps"), where("pollId", "==", p.id))));
    const counts = props.map(() => 0);
    vs.docs.forEach((d) => { const i = props.findIndex((x) => x.slot === d.data().opt); if (i >= 0) counts[i]++; });
    return { props, counts, votes: vs.docs.length };
  }
  const counts = p.opts.map(() => 0);
  vs.docs.forEach((d) => { const o = d.data().opt; if (Number.isInteger(o) && o >= 0 && o < counts.length) counts[o]++; });
  return { props: null, counts, votes: vs.docs.length };
}
let pollLast = null;
function pollOutHtml(t) {
  const p = siteCfg.poll;
  if (!t.props) return '<div class="poll-res">' + pollBarsHtml(p.opts, t.counts) + `</div><div class="rb-meta">Razem głosów: ${pollTotal(t.counts)} (na żywo, widzisz je tylko Ty).</div>`;
  if (!t.props.length) return '<div class="rb-meta">Klienci nie zgłosili jeszcze żadnych propozycji.</div>';
  const full = t.props.length >= p.maxP;
  let end = "";
  if (full) { const e = atMs(t.props[p.maxP - 1].at) + p.days * DAY; end = e ? " Głosowanie " + (Date.now() < e ? "trwa do " : "zakończyło się ") + pollFmt(e) + "." : ""; }
  return `<div class="rb-meta">Propozycje: ${t.props.length} / ${p.maxP}${full ? " — lista zamknięta." : "."}${esc(end)} Razem głosów: ${pollTotal(t.counts)}.</div>`
    + t.props.map((x, i) => `<div class="rb-poll-row"><span>${i + 1}. ${esc(x.text)}</span><b>${t.counts[i]}</b><button type="button" class="rb-btn secondary small" data-pedit="${i}" title="Zmień tekst (np. gdy jest nieodpowiedni)">✏</button></div>`).join("");
}
async function pollShow() {
  const out = $("rb-poll-out");
  out.innerHTML = '<div class="rb-meta">Liczę…</div>';
  try { pollLast = await pollTally(); out.innerHTML = pollOutHtml(pollLast); }
  catch (err) { out.innerHTML = '<div class="rb-msg err">' + esc(err.code ? errText(err) : err.message) + "</div>"; }
}
$("rb-poll-tomenu").addEventListener("click", () => {
  const p = siteCfg.poll;
  if (!p || !p.results) return;
  const top = Math.max(...p.results), name = p.opts[p.results.indexOf(top)];
  const list = $("rb-prod-list");
  const have = [...list.querySelectorAll(".rb-prod-name")].some((i) => i.value.trim().toLowerCase() === name.trim().toLowerCase());
  if (have) { alert("Produkt „" + name + "” jest już na liście produktów."); return; }
  if (list.querySelectorAll(".rb-prod").length >= MAX_PRODUCTS) { alert("Maksymalnie " + MAX_PRODUCTS + " własnych produktów."); return; }
  list.insertAdjacentHTML("beforeend", prodRowHtml({ name: name.toUpperCase(), cat: "klasyczne", badges: ["nowosc"], tags: ["wybór klientów"] }));
  const tab = [...document.querySelectorAll(".rb-subtab")].find((t) => t.textContent.includes("Produkty"));
  if (tab) tab.click();
  const last = list.lastElementChild;
  last.scrollIntoView({ behavior: "smooth", block: "center" });
  last.querySelector(".rb-prod-price").focus();
  siteSay("Dodano „" + name + "” do produktów. Wpisz cenę, popraw nazwę i opis, potem kliknij Zapisz.", "ok");
});
$("rb-poll-mode").addEventListener("change", pollModeUi);
$("rb-poll-add").addEventListener("click", () => {
  const cur = [...document.querySelectorAll("#rb-poll-opts .rb-poll-opt")].map((i) => i.value);
  if (cur.length < POLL_MAX) { cur.push(""); renderPollOpts(cur); }
});
$("rb-poll-res").addEventListener("click", pollShow);
$("rb-poll-out").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-pedit]");
  if (!b || !pollLast || !pollLast.props) return;
  const x = pollLast.props[Number(b.dataset.pedit)];
  const t = prompt("Nowy tekst propozycji (2–40 znaków). Zmiana jest widoczna dla wszystkich klientów, a głosy zostają:", x.text);
  if (t === null) return;
  const nt = t.replace(/\s+/g, " ").trim();
  if (nt.length < 2 || nt.length > 40) { alert("Tekst musi mieć od 2 do 40 znaków."); return; }
  try { await updateDoc(doc(db, "pollProps", x.id), { text: nt }); await pollShow(); }
  catch (err) { alert(errText(err)); }
});
$("rb-poll-new").addEventListener("click", () => {
  if (siteCfg.poll && !confirm("Rozpocząć NOWE głosowanie? Stare głosy przestaną się liczyć (nie kasują się, ale nowe zaczyna od zera). Pamiętaj, żeby zmienić pytanie i odpowiedzi, a potem kliknąć Zapisz.")) return;
  pollDraft = { id: newPollId(), results: null, opts: [] };
  $("rb-poll-max").disabled = false;
  $("rb-poll-open").checked = true; $("rb-poll-out").innerHTML = "";
  pollInfo("Nowe głosowanie — zmień pytanie i ustawienia, potem kliknij Zapisz, żeby ruszyło.");
});
$("rb-poll-close").addEventListener("click", async () => {
  const p = siteCfg.poll;
  if (!p) { $("rb-poll-out").innerHTML = '<div class="rb-msg err">Najpierw zapisz głosowanie.</div>'; return; }
  if (!confirm("Zamknąć głosowanie i opublikować wyniki na stronie?")) return;
  try {
    const t = await pollTally();
    if (p.mode === "open") {
      if (t.props.length < 2) throw new Error("Za mało propozycji, żeby ogłosić wyniki (minimum 2).");
      pollDraft.opts = t.props.map((x) => x.text);
    }
    pollDraft.id = p.id;
    pollDraft.results = t.counts;
    $("rb-poll-open").checked = false;
    await saveSite();
    fillPollForm();
  } catch (err) { $("rb-poll-out").innerHTML = '<div class="rb-msg err">' + esc(err.code ? errText(err) : err.message) + "</div>"; }
});

/* ---------- panel admina: zakładka Raport (dziennik zdarzeń) ---------- */
const rpMsg = $("rb-rp-msg");
let reportEvents = [];
const EV_LABEL = { stamp: "➕ Pieczątka", reward: "🍕 Pizza gratis", unstamp: "↩ Cofnięta pieczątka", coupon: "🎟 Kod", couponundo: "↩ Cofnięty kod" };

function reportStart() {
  const r = $("rb-rp-range").value;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === "7") d.setDate(d.getDate() - 6);
  if (r === "30") d.setDate(d.getDate() - 29);
  return d;
}
async function loadReport() {
  setMsg(rpMsg, "Wczytuję…");
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 29);
  try {
    const snap = await getDocs(query(collection(db, "logs"), where("at", ">=", Timestamp.fromDate(since)), orderBy("at", "desc"), limit(3000)));
    reportEvents = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setMsg(rpMsg, "");
    renderReport();
    return true;
  } catch (err) {
    console.error(err);
    setMsg(rpMsg, errText(err) + " (czy opublikowałeś nowe reguły?)", "err");
    return false;
  }
}
function visibleEvents() {
  const start = reportStart().getTime();
  const type = $("rb-rp-type").value;
  return reportEvents.filter((e) => tsMs(e.at) >= start && (!type || e.type === type || (type === "coupon" && e.type === "couponundo")));
}
function renderReport() {
  const start = reportStart().getTime();
  const evs = reportEvents.filter((e) => tsMs(e.at) >= start);
  const cnt = (t) => evs.filter((e) => e.type === t).length;
  const newClients = allUsers.filter((u) => tsMs(u.createdAt) >= start).length;
  $("rb-rp-stats").innerHTML = [
    [cnt("stamp"), "pieczątek"], [cnt("reward"), "pizz gratis"], [cnt("coupon"), "kodów"], [newClients, "nowych klientów"]
  ].map(([n, l]) => `<div class="rb-stat"><b>${n}</b><span>${l}</span></div>`).join("");
  const by = {};
  evs.forEach((e) => {
    const k = e.byName || "(nieznany)";
    (by[k] ||= { stamp: 0, reward: 0, coupon: 0, unstamp: 0 });
    if (by[k][e.type] !== undefined) by[k][e.type]++;
  });
  const names = Object.keys(by).sort();
  $("rb-rp-staff").innerHTML = names.length
    ? names.map((n) => `<div class="rb-ev"><b>${esc(n)}</b><div class="rb-meta">➕ ${by[n].stamp} · 🍕 ${by[n].reward} · 🎟 ${by[n].coupon}${by[n].unstamp ? " · ↩ " + by[n].unstamp : ""}</div></div>`).join("")
    : '<div class="rb-empty">Brak zdarzeń w tym okresie.</div>';
  const list = visibleEvents().slice(0, 100);
  $("rb-rp-list").innerHTML = list.length
    ? list.map((e) => `<div class="rb-ev"><b>${esc(EV_LABEL[e.type] || e.type)}</b> — ${esc(e.customerName || "")}
        <div class="rb-meta">${fmtDateTime(e.at)} · ${esc(e.byName || "")}${e.detail ? " · " + esc(e.detail) : ""}</div></div>`).join("")
    : '<div class="rb-empty">Brak zdarzeń.</div>';
}
$("rb-rp-range").addEventListener("change", renderReport);
$("rb-rp-type").addEventListener("change", renderReport);
$("rb-rp-refresh").addEventListener("click", () => { loadReport(); loadFeedback(); statsEvents = null; visitDocs = null; refreshStats(false); refreshVisits(false); });

/* ---------- statystyki i wykresy (bez zewnętrznych bibliotek) ---------- */
let statsEvents = null;
function barsHtml(items, h = 70) {
  const max = Math.max(1, ...items.map((i) => i.v));
  const top = Math.max(0, ...items.map((i) => i.v));
  const bars = items.map((i) => `<div class="rb-col${top > 0 && i.v === top ? " top" : ""}" title="${esc(i.l)}: ${i.v}"><b>${i.v || ""}</b><i style="height:${Math.round(i.v / max * h)}px"></i></div>`).join("");
  return `<div class="rb-cols">${bars}</div><div class="rb-col-l">${items.map((i) => `<span>${esc(i.l)}</span>`).join("")}</div>`;
}
function weekStart(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
function lastWeeks(n) {
  const out = [];
  let w = weekStart(Date.now());
  for (let i = 0; i < n; i++) { out.unshift(w); const d = new Date(w); d.setDate(d.getDate() - 7); w = d.getTime(); }
  return out;
}
function codeGroup(c) {
  const id = String(c.id || "");
  if (id.startsWith("welcome_")) return "Powitalny −5 zł";
  if (id.startsWith("bday_")) return "Urodzinowy";
  if (id.startsWith("promo_") && c.promo) return "Promo " + c.promo;
  const m = /^([A-Z0-9]{2,12})-/.exec(String(c.code || ""));
  return m ? m[1] + "-…" : "Przyznane ręcznie";
}
function renderCharts() {
  const body = $("rb-st-body");
  if (!statsEvents) { body.innerHTML = '<div class="rb-empty">Wczytuję…</div>'; return; }
  const me = (auth.currentUser || {}).uid;
  const staffIds = new Set(allStaff.map((x) => x.id));
  const visits = statsEvents.filter((e) => e.type === "stamp" || e.type === "reward");
  const pl = (n) => String(n).padStart(2, "0");
  const byWd = Array(7).fill(0);
  visits.forEach((e) => { byWd[(new Date(tsMs(e.at)).getDay() + 6) % 7]++; });
  const hrs = []; for (let h = 9; h <= 23; h++) hrs.push(h);
  const byH = hrs.map(() => 0);
  visits.forEach((e) => { const i = hrs.indexOf(new Date(tsMs(e.at)).getHours()); if (i >= 0) byH[i]++; });
  const weeks = lastWeeks(12);
  const wl = (w) => { const d = new Date(w); return pl(d.getDate()) + "." + pl(d.getMonth() + 1); };
  const vW = weeks.map(() => 0);
  visits.forEach((e) => { const i = weeks.indexOf(weekStart(tsMs(e.at))); if (i >= 0) vW[i]++; });
  const nW = weeks.map(() => 0);
  allUsers.filter((u) => u.id !== me && !staffIds.has(u.id)).forEach((u) => { const t = tsMs(u.createdAt); const i = t ? weeks.indexOf(weekStart(t)) : -1; if (i >= 0) nW[i]++; });
  const cust = allLoyal.filter((l) => l.id !== me && !staffIds.has(l.id));
  const bk = [0, 0, 0, 0, 0];
  cust.forEach((l) => { const n = l.total || 0; bk[n === 0 ? 0 : n === 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4]++; });
  const came = cust.filter((l) => (l.total || 0) >= 1).length, back = cust.filter((l) => (l.total || 0) >= 2).length;
  const g = {};
  allCoupons.forEach((c) => { const k = codeGroup(c); (g[k] ||= { n: 0, u: 0 }); g[k].n++; if (c.used) g[k].u++; });
  const rows = Object.entries(g).sort((a, b) => b[1].n - a[1].n);
  body.innerHTML =
    (visits.length ? "" : '<div class="rb-empty">W dzienniku nie ma jeszcze wizyt z ostatnich 90 dni.</div>') +
    "<h4>Wizyty według dnia tygodnia</h4>" + barsHtml(WD_LABELS.map((l, i) => ({ l, v: byWd[i] }))) +
    "<h4>Wizyty według godziny</h4>" + barsHtml(hrs.map((h, i) => ({ l: String(h), v: byH[i] }))) +
    "<h4>Wizyty tydzień po tygodniu</h4>" + barsHtml(weeks.map((w, i) => ({ l: wl(w), v: vW[i] }))) +
    "<h4>Nowi klienci tydzień po tygodniu</h4>" + barsHtml(weeks.map((w, i) => ({ l: wl(w), v: nW[i] }))) +
    "<h4>Klienci według liczby wizyt</h4>" + barsHtml([["0", 0], ["1", 1], ["2–4", 2], ["5–9", 3], ["10+", 4]].map(([l, i]) => ({ l, v: bk[i] }))) +
    `<div class="rb-meta">${came ? "Wróciło " + back + " z " + came + " klientów, którzy byli choć raz (" + Math.round(back / came * 100) + "%)." : "Nikt jeszcze nie ma pieczątki."}</div>` +
    "<h4>Kody: przyznane i wykorzystane</h4>" +
    (rows.length
      ? `<table class="rb-tbl"><tr><th>Rodzaj</th><th>Przyznane</th><th>Użyte</th><th>%</th></tr>` +
        rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}</td><td>${v.u}</td><td>${Math.round(v.u / v.n * 100)}%</td></tr>`).join("") + "</table>"
      : '<div class="rb-empty">Brak kodów.</div>');
}
const WD_LABELS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
async function refreshStats(force) {
  if (!isAdmin) return;
  const box = $("rb-st-box");
  if (!box.open) return;
  if (!statsEvents || force) {
    renderCharts();
    try {
      const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - 89);
      const snap = await getDocs(query(collection(db, "logs"), where("at", ">=", Timestamp.fromDate(since)), orderBy("at", "desc"), limit(5000)));
      statsEvents = snap.docs.map((d) => d.data());
      if (!loyalOk) await loadLoyaltyAll();
    } catch (err) {
      console.error(err);
      $("rb-st-body").innerHTML = '<div class="rb-msg err">' + esc(errText(err)) + "</div>";
      return;
    }
  }
  renderCharts();
}
$("rb-st-box").addEventListener("toggle", () => refreshStats(false));

/* ---------- odwiedziny strony (panel admina) ---------- */
let visitDocs = null;
const SRC_LABELS = [["s_search", "Wyszukiwarki (Google itp.)"], ["s_direct", "Wpisany adres / zakładka"], ["s_social", "Media społecznościowe"], ["s_app", "Zainstalowana aplikacja"], ["s_other", "Inne strony"]];
function renderVisits() {
  const body = $("rb-vis-body");
  if (!visitDocs) { body.innerHTML = '<div class="rb-empty">Wczytuję…</div>'; return; }
  const map = new Map(visitDocs.map((d) => [d.id, d]));
  const days = [];
  for (let i = 29; i >= 0; i--) { const dt = new Date(); dt.setDate(dt.getDate() - i); days.push(WARSAW_DAY(dt)); }
  const val = (k, f = "total") => (map.get(k) && map.get(k)[f]) || 0;
  const sum = (arr, f = "total") => arr.reduce((a, k) => a + val(k, f), 0);
  const today = days[29], yest = days[28];
  const w7 = sum(days.slice(-7)), m30 = sum(days);
  if (!visitDocs.length) { body.innerHTML = '<div class="rb-empty">Brak danych. Licznik zaczyna działać po opublikowaniu nowych reguł i strony; pierwsze wejścia pojawią się tu od razu.</div>'; return; }
  const first = visitDocs.map((d) => d.id).sort()[0];
  const pct = (n) => (m30 ? Math.round(n / m30 * 100) : 0);
  const dev = [["Telefon", sum(days, "mobile")], ["Komputer", sum(days, "desktop")]];
  body.innerHTML =
    '<div class="rb-stats">' +
    [["Dziś", val(today)], ["Wczoraj", val(yest)], ["7 dni", w7], ["30 dni", m30]].map(([l, v]) => `<div class="rb-stat"><b>${v}</b><span>${l}</span></div>`).join("") + "</div>" +
    "<h4>Ostatnie 30 dni</h4>" + barsHtml(days.map((k) => ({ l: k.slice(8) + "." + k.slice(5, 7), v: val(k) }))) +
    "<h4>Urządzenia (30 dni)</h4>" +
    `<table class="rb-tbl"><tr><th>Typ</th><th>Wejść</th><th>%</th></tr>${dev.map(([l, n]) => `<tr><td>${l}</td><td>${n}</td><td>${pct(n)}%</td></tr>`).join("")}</table>` +
    "<h4>Skąd przychodzą (30 dni)</h4>" +
    `<table class="rb-tbl"><tr><th>Źródło</th><th>Wejść</th><th>%</th></tr>${SRC_LABELS.map(([k, l]) => { const n = sum(days, k); return `<tr><td>${l}</td><td>${n}</td><td>${pct(n)}%</td></tr>`; }).join("")}</table>` +
    `<div class="rb-meta">Dane od ${esc(first)}. Wejścia z wyszukiwarek, mediów i aplikacji są rozpoznawane po stronie, z której przyszedł odwiedzający; wiele przeglądarek tego nie przekazuje, wtedy trafiają do „wpisany adres”.</div>`;
}
async function refreshVisits(force) {
  if (!isAdmin) return;
  if (!$("rb-vis-box").open) return;
  if (!visitDocs || force) {
    renderVisits();
    try {
      const from = new Date(); from.setDate(from.getDate() - 60);
      const snap = await getDocs(query(collection(db, "visits"), where(documentId(), ">=", WARSAW_DAY(from)), orderBy(documentId())));
      visitDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error(err);
      $("rb-vis-body").innerHTML = '<div class="rb-msg err">' + esc(errText(err)) + (err && err.code === "permission-denied" ? " (opublikuj najnowsze reguły Firestore)" : "") + "</div>";
      return;
    }
  }
  renderVisits();
}
$("rb-vis-box").addEventListener("toggle", () => refreshVisits(false));

/* ---------- kopia zapasowa i eksport klientów ---------- */
const bkMsg = $("rb-bk-msg");
const MAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
function plainTs(v) {
  if (v && typeof v.toDate === "function") { try { return v.toDate().toISOString(); } catch (_) { return null; } }
  if (Array.isArray(v)) return v.map(plainTs);
  if (v && typeof v === "object") { const o = {}; Object.keys(v).forEach((k) => { o[k] = plainTs(v[k]); }); return o; }
  return v;
}
function saveFile(name, mime, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function csvText(rows) {
  const cell = (c) => { let t = String(c == null ? "" : c); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  return "\ufeff" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
function exportableUsers() {
  const me = (auth.currentUser || {}).uid;
  const staffIds = new Set(allStaff.map((x) => x.id));
  return allUsers.filter((u) => u.id !== me && !staffIds.has(u.id) && MAIL_RE.test(u.email || ""));
}
const bdayShort = (u) => (u.bDay && u.bMonth ? String(u.bDay).padStart(2, "0") + "." + String(u.bMonth).padStart(2, "0") : "");
$("rb-bk-json").addEventListener("click", async () => {
  if (!isAdmin) return;
  const btn = $("rb-bk-json");
  btn.disabled = true;
  setMsg(bkMsg, "Pobieram dane…");
  const names = ["users", "loyalty", "points", "coupons", "templates", "promoCodes", "feedback", "staff", "site", "deletionRequests", "logs"];
  const out = { meta: { app: "wloskarobota.eu", createdAt: new Date().toISOString(), counts: {}, errors: [] }, data: {} };
  for (const name of names) {
    try {
      const snap = await getDocs(collection(db, name));
      out.data[name] = {};
      snap.docs.forEach((d) => { out.data[name][d.id] = plainTs(d.data()); });
      out.meta.counts[name] = snap.docs.length;
    } catch (err) { out.meta.errors.push(name + ": " + (err.code || err.message)); }
  }
  saveFile("kopia-wloska-robota-" + ymd(new Date()) + ".json", "application/json", JSON.stringify(out, null, 1));
  const total = Object.values(out.meta.counts).reduce((a, b) => a + b, 0);
  setMsg(bkMsg, "Pobrano kopię: " + total + " dokumentów." + (out.meta.errors.length ? " Nie udało się pobrać: " + out.meta.errors.join(", ") + "." : ""), out.meta.errors.length ? "err" : "ok");
  btn.disabled = false;
});
$("rb-bk-mkt").addEventListener("click", () => {
  if (!isAdmin) return;
  const list = exportableUsers().filter((u) => u.marketing === true);
  const rows = [["E-mail", "Imię", "Urodziny (dzień.miesiąc)"]].concat(list.map((u) => [u.email, u.name || "", bdayShort(u)]));
  saveFile("klienci-ze-zgoda-" + ymd(new Date()) + ".csv", "text/csv;charset=utf-8", csvText(rows));
  setMsg(bkMsg, "Pobrano listę: " + list.length + " klientów ze zgodą na e-mail.", "ok");
});
$("rb-bk-all").addEventListener("click", async () => {
  if (!isAdmin) return;
  if (!loyalOk) await loadLoyaltyAll();
  const lm = new Map(allLoyal.map((l) => [l.id, l]));
  const d0 = (ms) => (ms ? new Date(ms).toLocaleDateString("pl-PL") : "");
  const list = exportableUsers();
  const rows = [["E-mail", "Imię", "Konto od", "Pieczątek łącznie", "Pizz gratis", "Ostatnia wizyta", "Zgoda na e-mail", "Urodziny (dzień.miesiąc)"]]
    .concat(list.map((u) => { const L = lm.get(u.id); return [u.email, u.name || "", d0(tsMs(u.createdAt)), L ? (L.total || 0) : 0, L ? (L.rewards || 0) : 0, L ? d0(lastVisitMs(L)) : "", u.marketing === true ? "tak" : "nie", bdayShort(u)]; }));
  saveFile("klienci-" + ymd(new Date()) + ".csv", "text/csv;charset=utf-8", csvText(rows));
  setMsg(bkMsg, "Pobrano listę: " + list.length + " klientów.", "ok");
});

let feedbackItems = [];
const starStr = (n) => "★".repeat(n) + "☆".repeat(5 - n);
async function loadFeedback() {
  try {
    const snap = await getDocs(query(collection(db, "feedback"), orderBy("createdAt", "desc"), limit(500)));
    feedbackItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderFeedback();
    return true;
  } catch (err) {
    console.error(err);
    $("rb-fb-stats").innerHTML = "";
    $("rb-fb-bars").innerHTML = "";
    $("rb-fb-list").innerHTML = '<div class="rb-empty">Nie udało się wczytać opinii (' + esc(err.code || err.message) + ') — czy opublikowałeś nowe reguły?</div>';
    return false;
  }
}
function renderFeedback() {
  const items = feedbackItems.filter((f) => Number.isInteger(f.rating) && f.rating >= 1 && f.rating <= 5);
  const n = items.length;
  const avg = n ? items.reduce((a, f) => a + f.rating, 0) / n : 0;
  const low = items.filter((f) => f.rating <= 3).length;
  $("rb-fb-stats").innerHTML = [[n ? avg.toFixed(1).replace(".", ",") + " ★" : "–", "średnia"], [n, "ocen"], [low, "niskich (1–3)"]]
    .map(([v, l]) => `<div class="rb-stat"><b>${v}</b><span>${l}</span></div>`).join("");
  $("rb-fb-bars").innerHTML = n ? [5, 4, 3, 2, 1].map((r) => {
    const c = items.filter((f) => f.rating === r).length;
    return `<div class="rb-bar"><b>${r} ★</b><span><i style="width:${Math.round((c / n) * 100)}%"></i></span><em>${c}</em></div>`;
  }).join("") : "";
  const shown = items.filter((f) => !$("rb-fb-low").checked || f.rating <= 3).slice(0, 100);
  $("rb-fb-list").innerHTML = shown.length
    ? shown.map((f) => `<div class="rb-ev"><span class="rb-fb-stars">${starStr(f.rating)}</span> <b>${esc(f.name || "Klient")}</b>
        <div class="rb-meta">${fmtDateTime(f.createdAt)}</div>${f.comment ? `<div>${esc(f.comment)}</div>` : ""}
        <button type="button" class="rb-link" data-fbdel="${esc(f.id)}">Usuń opinię</button></div>`).join("")
    : '<div class="rb-empty">Brak opinii.</div>';
}
$("rb-fb-low").addEventListener("change", renderFeedback);
$("rb-fb-list").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-fbdel]");
  if (!b) return;
  if (!confirm("Usunąć tę opinię na stałe?")) return;
  try {
    await deleteDoc(doc(db, "feedback", b.dataset.fbdel));
    feedbackItems = feedbackItems.filter((f) => f.id !== b.dataset.fbdel);
    renderFeedback();
  } catch (err) { console.error(err); alert(errText(err)); }
});
$("rb-rp-csv").addEventListener("click", () => {
  const rows = [["Czas", "Zdarzenie", "Pracownik", "Klient", "Szczegóły"]];
  visibleEvents().forEach((e) => rows.push([fmtDateTime(e.at), EV_LABEL[e.type] || e.type, e.byName || "", e.customerName || "", e.detail || ""]));
  const csv = "﻿" + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "raport-" + ymd(new Date()) + ".csv";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
});

/* ---------- pulpit „Dziś” i zakładka Klienci (tylko admin) ---------- */
const KPAGE = 30;
const DAY = 86400000;
let allLoyal = [];
let loyalOk = false;
let welcomeMigrated = false;
let dataAt = 0;
let dataBusy = null;
let kShown = KPAGE;
let kRows = [];
const tdMsg = $("rb-td-msg");

const dayStart = (back) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - back); return d.getTime(); };
function agoText(ms) {
  if (!ms) return "nigdy";
  const d = Math.floor((Date.now() - ms) / DAY);
  if (d <= 0) return "dziś";
  if (d === 1) return "wczoraj";
  if (d < 60) return d + " dni temu";
  return Math.floor(d / 30) + " mies. temu";
}
const pl1 = (n) => (Math.round(n * 10) / 10).toString().replace(".", ",");

async function loadLoyaltyAll() {
  try {
    const s = await getDocs(collection(db, "loyalty"));
    allLoyal = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    loyalOk = true;
    return true;
  } catch (err) {
    console.warn("Karty lojalnościowe niedostępne (opublikuj nowe reguły):", err.code || err.message);
    loyalOk = false;
    return false;
  }
}
function ensureData(force) {
  if (!isAdmin) return Promise.resolve();
  if (dataBusy) return dataBusy;
  if (!force && dataAt && Date.now() - dataAt < 60000) { renderToday(); renderClients(); return Promise.resolve(); }
  setMsg(tdMsg, "Wczytuję dane…");
  dataBusy = (async () => {
    const res = await Promise.all([loadReport(), loadFeedback(), loadLoyaltyAll()]);
    if (!isAdmin) { reportEvents = []; feedbackItems = []; allLoyal = []; return; }
    dataAt = Date.now();
    const ok = res.every(Boolean);
    setMsg(tdMsg, ok ? "" : "Część danych się nie wczytała (czy opublikowałeś nowe reguły?).", ok ? "" : "err");
    renderToday();
    renderClients();
  })().finally(() => { dataBusy = null; });
  return dataBusy;
}
/* Istniejące kody powitalne bez terminu dostają ważność: miesiąc od założenia konta (dla starszych kont: kod od razu wygasa). */
async function migrateWelcome() {
  if (!isAdmin || welcomeMigrated) return;
  welcomeMigrated = true;
  const todo = allCoupons.filter((c) => String(c.id).startsWith("welcome_") && !c.used && c.expiresAt == null && tsMs(c.createdAt) > 0);
  if (!todo.length) return;
  try {
    for (let i = 0; i < todo.length; i += 400) {
      const batch = writeBatch(db);
      todo.slice(i, i + 400).forEach((c) => batch.update(doc(db, "coupons", c.id), { expiresAt: welcomeExpiry(tsMs(c.createdAt)) }));
      await batch.commit();
    }
    const note = $("rb-td-note");
    if (note) setMsg(note, "Ustawiono ważność miesiąca od założenia konta dla " + todo.length + " istniejących kodów powitalnych.", "ok");
  } catch (err) {
    console.warn("Nie udało się ustawić ważności kodów powitalnych:", err.code || err.message);
  }
}
function syncLoyalCache(uid, L) {
  if (!isAdmin || !L) return;
  const row = { id: uid, ...L };
  const i = allLoyal.findIndex((x) => x.id === uid);
  if (i >= 0) allLoyal[i] = row; else allLoyal.push(row);
  renderClients();
  renderToday();
}

/* wykrywanie duplikatów kont: ten sam adres Gmail z kropkami lub „+coś”, albo to samo imię i nazwisko */
function emailKey(e) {
  const s = String(e || "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at < 1) return s;
  let loc = s.slice(0, at).split("+")[0];
  let dom = s.slice(at + 1);
  if (dom === "googlemail.com") dom = "gmail.com";
  if (dom === "gmail.com") loc = loc.replace(/\./g, "");
  return loc + "@" + dom;
}
function nameKey(n) {
  const k = normTxt(n);
  return k.length >= 5 && k.split(" ").length >= 2 ? k : "";
}
function dupInfo() {
  const byE = new Map(), byN = new Map();
  allUsers.forEach((u) => {
    const ek = emailKey(u.email);
    if (ek) { if (!byE.has(ek)) byE.set(ek, []); byE.get(ek).push(u); }
    const nk = nameKey(u.name);
    if (nk) { if (!byN.has(nk)) byN.set(nk, []); byN.get(nk).push(u); }
  });
  const info = new Map();
  let groups = 0;
  byE.forEach((arr, key) => {
    if (arr.length < 2) return;
    groups++;
    arr.forEach((u) => info.set(u.id, { kind: "email", key, others: arr.filter((x) => x.id !== u.id) }));
  });
  byN.forEach((arr, key) => {
    if (arr.length < 2 || arr.every((u) => info.has(u.id))) return;
    groups++;
    arr.forEach((u) => { if (!info.has(u.id)) info.set(u.id, { kind: "name", key, others: arr.filter((x) => x.id !== u.id) }); });
  });
  return { info, groups };
}
const lastVisitMs = (L) => (L ? Math.max(tsMs(L.lastStampAt), tsMs(L.lastRewardAt)) : 0);

function clientRows(opts) {
  const f = (opts && opts.filter) || $("rb-k-filter").value;
  const days = (opts && opts.days) || Number($("rb-k-days").value) || 30;
  const q = opts && opts.noSearch ? "" : normTxt($("rb-k-search").value);
  const lm = new Map(allLoyal.map((l) => [l.id, l]));
  const dups = dupInfo();
  const now = Date.now();
  const me = (auth.currentUser || {}).uid;
  const staffIds = new Set(allStaff.map((s) => s.id));
  let rows = allUsers.filter((u) => u.id !== me).map((u) => { const L = lm.get(u.id); return { u, L, last: lastVisitMs(L), created: tsMs(u.createdAt) }; });
  if (q) rows = rows.filter((r) => normTxt(r.u.name).includes(q) || normTxt(r.u.email).includes(q));
  const label = (r) => normTxt(r.u.name || r.u.email);
  if (f === "full") rows = rows.filter((r) => r.L && (r.L.stamps || 0) >= LOYAL_GOAL).sort((a, b) => b.last - a.last);
  else if (f === "inactive") rows = rows.filter((r) => r.u.id !== me && !staffIds.has(r.u.id) && r.last > 0 && now - r.last >= days * DAY).sort((a, b) => a.last - b.last);
  else if (f === "never") rows = rows.filter((r) => r.u.id !== me && !staffIds.has(r.u.id) && !(r.L && ((r.L.total || 0) > 0 || (r.L.rewards || 0) > 0)) && (!r.created || now - r.created >= 2 * DAY)).sort((a, b) => a.created - b.created);
  else if (f === "vip") rows = rows.filter((r) => r.L && rewardsOf(r.L) >= 1).sort((a, b) => rewardsOf(b.L) - rewardsOf(a.L) || (b.L.total || 0) - (a.L.total || 0));
  else if (f === "rankup") rows = rows.filter((r) => { if (!r.L) return false; const li = rankOf(r.L); return !!li.next && li.left === 1 && (r.L.stamps || 0) >= 5; }).sort((a, b) => (b.L.stamps || 0) - (a.L.stamps || 0));
  else if (f === "refs") { const ord = { ready: 0, wait: 1, nobody: 2, paid: 3 }; rows = rows.filter((r) => r.u.refBy).sort((a, b) => ord[refInfo(a.u).state] - ord[refInfo(b.u).state] || label(a).localeCompare(label(b))); }
  else if (f === "bday") rows = rows.filter((r) => bdayInDays(r.u) <= 7).sort((a, b) => bdayInDays(a.u) - bdayInDays(b.u));
  else if (f === "mkt") rows = rows.filter((r) => r.u.marketing === true).sort((a, b) => label(a).localeCompare(label(b)));
  else if (f === "dups") rows = rows.filter((r) => dups.info.has(r.u.id)).sort((a, b) => dups.info.get(a.u.id).key.localeCompare(dups.info.get(b.u.id).key) || label(a).localeCompare(label(b)));
  else rows = rows.sort((a, b) => label(a).localeCompare(label(b)));
  return { rows, dups };
}

const DEF_WB = { inactive: "-10% na zamówienie (zapraszamy z powrotem!)", never: "-10% na pierwsze zamówienie" };
function syncKFilterUI() {
  const f = $("rb-k-filter").value;
  $("rb-k-days").hidden = f !== "inactive";
  const d = $("rb-k-wb-desc");
  if (DEF_WB[f] && (!d.value || Object.values(DEF_WB).includes(d.value))) d.value = DEF_WB[f];
}
const K_HINT = {
  all: "",
  full: "Mają komplet pieczątek. Pizza gratis czeka na wydanie.",
  inactive: "Byli w lokalu (mają pieczątkę), ale od dawna nie wrócili.",
  never: "Konto starsze niż 2 dni, ale jeszcze bez żadnej pieczątki.",
  vip: "Klienci na poziomie Srebro lub wyższym (według łącznej liczby wizyt), od najczęstszych gości.",
  refs: "Klienci, którzy weszli z polecenia. „Gotowe” = znajomy zrobił pierwszy zakup (ma pieczątkę), więc możesz przyznać nagrodę polecającemu.",
  bday: "Klienci, którzy podali urodziny i mają je dziś lub w ciągu najbliższych 7 dni.",
  mkt: "Klienci, którzy zaznaczyli zgodę na e-maile z promocjami.",
  dups: "Konta z tym samym adresem e-mail (kropki i „+coś” w Gmailu to ten sam adres) albo z tym samym imieniem i nazwiskiem. To tylko podejrzenie, więc sprawdź, zanim cokolwiek zrobisz."
};
/* ---------- statystyki rang i klientów (zakładka Klienci) ---------- */
let stPerkVisits = 0;
function stCostLine() {
  const el = $("rb-rs-costline"), inp = $("rb-rs-cost");
  if (!el || !inp) return;
  const c = Number(String(inp.value).replace(",", "."));
  el.textContent = Number.isFinite(c) && c >= 0 ? "Szacowany koszt przywilejów w ciągu 30 dni: ok. " + posMoney(stPerkVisits * c) + " (" + stPerkVisits + " wizyt × " + posMoney(c) + ")." : "";
}
function renderRankStats() {
  const box = $("rb-rs-body");
  if (!box || !isAdmin) return;
  if (!loyalOk) { box.innerHTML = '<div class="rb-meta">Dane kart jeszcze się nie wczytały — wejdź w zakładkę Dziś i kliknij „Odśwież”.</div>'; return; }
  const me = (auth.currentUser || {}).uid, staffIds = new Set(allStaff.map((s) => s.id)), now = Date.now();
  const cust = allUsers.filter((u) => u.id !== me && !staffIds.has(u.id));
  const lm = new Map(allLoyal.map((l) => [l.id, l]));
  let active = 0, cooling = 0, lost = 0, never = 0, fresh = 0, full = 0;
  cust.forEach((u) => {
    const L = lm.get(u.id), lv = lastVisitMs(L);
    if (!lv) never++; else { const d = (now - lv) / DAY; if (d <= 30) active++; else if (d <= 90) cooling++; else lost++; }
    if (tsMs(u.createdAt) && now - tsMs(u.createdAt) < 7 * DAY) fresh++;
    if (L && (L.stamps || 0) >= LOYAL_GOAL) full++;
  });
  const lvls = curLevels(), cnt = lvls.map(() => 0);
  const rows = cust.map((u) => ({ u, L: lm.get(u.id) })).filter((r) => r.L);
  rows.forEach((r) => { cnt[rankOf(r.L).idx]++; });
  const maxc = Math.max(1, ...cnt);
  const bars = lvls.map((l, i) => `<div class="rb-rs-bar"><span>${esc(l.ic)} ${esc(l.n)}</span><div><i style="width:${Math.round(cnt[i] / maxc * 100)}%"></i></div><b>${cnt[i]}</b></div>`).join("");
  const top = rows.slice().filter((r) => rewardsOf(r.L) > 0 || (r.L.total || 0) > 0)
    .sort((a, b) => rewardsOf(b.L) - rewardsOf(a.L) || (b.L.total || 0) - (a.L.total || 0)).slice(0, 10)
    .map((r, i) => { const li = rankOf(r.L); return `<div class="rb-rs-top"><b>${i + 1}.</b> ${esc(r.u.name || r.u.email || "—")} <span>${esc(li.lvl.ic)} ${esc(li.lvl.n)} · 🍕 ${rewardsOf(r.L)} · wizyt ${r.L.total || 0}</span></div>`; }).join("");
  const close = rows.filter((r) => { const li = rankOf(r.L); return li.next && li.left === 1 && (r.L.stamps || 0) >= 5; }).slice(0, 6)
    .map((r) => { const li = rankOf(r.L); return `<div class="rb-rs-top">${esc(r.u.name || r.u.email || "—")} <span>→ ${esc(li.next.ic)} ${esc(li.next.n)} (${r.L.stamps}/${LOYAL_GOAL} pieczątek)</span></div>`; }).join("");
  const rankIdx = new Map(rows.map((r) => [r.u.id, rankOf(r.L).idx]));
  const start = now - 30 * DAY;
  const ev = reportEvents.filter((e) => (e.type === "stamp" || e.type === "reward") && tsMs(e.at) >= start);
  stPerkVisits = ev.filter((e) => (rankIdx.get(e.customerUid) || 0) >= 1).length;
  const perkShare = ev.length ? Math.round(stPerkVisits / ev.length * 100) : 0;
  let cost = "4"; try { cost = localStorage.getItem("wr_perk_cost") || "4"; } catch (_) {}
  box.innerHTML = `<div class="rb-rs-grid">
      <div class="rb-rs-k"><b>${cust.length}</b><span>kont klientów</span></div>
      <div class="rb-rs-k"><b>${rows.length}</b><span>z kartą</span></div>
      <div class="rb-rs-k"><b>${active}</b><span>aktywnych (30 dni)</span></div>
      <div class="rb-rs-k"><b>${cooling}</b><span>wychładza się (30–90 dni)</span></div>
      <div class="rb-rs-k"><b>${lost}</b><span>zniknęło (&gt;90 dni)</span></div>
      <div class="rb-rs-k"><b>${never}</b><span>bez żadnej wizyty</span></div>
      <div class="rb-rs-k"><b>${fresh}</b><span>nowych (7 dni)</span></div>
      <div class="rb-rs-k"><b>${full}</b><span>pełnych kart</span></div>
    </div>
    <div class="rb-rs-h">Klienci w rangach</div>${bars}
    <div class="rb-rs-h">🏆 TOP 10 (wg darmowych pizz)</div>${top || '<div class="rb-meta">Jeszcze nikt nie ma wizyt.</div>'}
    <div class="rb-rs-h">🚀 Blisko awansu</div>${close || '<div class="rb-meta">Nikomu nie brakuje teraz jednej pizzy do awansu.</div>'}
    <div class="rb-rs-h">💰 Koszt przywilejów</div>
    <div class="rb-meta">W ciągu 30 dni było ${ev.length} wizyt (pieczątki i wydane pizze gratis), z czego ${stPerkVisits} (${perkShare}%) od klientów z rangą od drugiego poziomu wzwyż.</div>
    <div class="rb-adm-row"><div><label>Ile średnio kosztuje przywilej na jedną wizytę (zł)</label><input type="text" id="rb-rs-cost" inputmode="decimal" maxlength="6" value="${esc(cost)}"></div></div>
    <div class="rb-meta" id="rb-rs-costline"></div>`;
  const inp = $("rb-rs-cost");
  inp.addEventListener("input", () => { try { localStorage.setItem("wr_perk_cost", inp.value); } catch (_) {} stCostLine(); });
  stCostLine();
}

/* ---------- kopia zapasowa (Strona → Kopia): eksport i przywracanie jednym plikiem ---------- */
/* [kolekcja, opis, zaznaczona domyślnie, da się przywrócić] — reguły bazy pozwalają adminowi odtworzyć tylko część kolekcji */
const BK_COLS = [
  ["site", "Ustawienia strony i Straży", true, true],
  ["loyalty", "Karty lojalnościowe (pieczątki, darmowe pizze, rangi)", true, true],
  ["points", "Punkty z gier", true, true],
  ["coupons", "Kody rabatowe klientów", true, true],
  ["promoCodes", "Kody promocyjne", true, true],
  ["templates", "Własne szablony rabatów", true, true],
  ["staff", "Konta obsługi", true, true],
  ["blocked", "Zablokowane konta (Straż)", true, true],
  ["users", "Profile klientów (imię, urodziny, zgody)", true, false],
  ["feedback", "Oceny klientów", true, false],
  ["pollVotes", "Głosy w głosowaniach", true, false],
  ["dailyScratch", "Zdrapki dnia", true, false],
  ["pollProps", "Propozycje klientów w głosowaniach", true, false],
  ["pollMarks", "Znaczniki zgłoszonych propozycji", true, false],
  ["refs", "Kody polecające", true, false],
  ["visits", "Licznik odwiedzin", true, false],
  ["flags", "Flagi Straży", true, false],
  ["devices", "Urządzenia (Straż)", true, false],
  ["logs", "Dziennik zdarzeń (może być duży)", false, false]
];
function bkEnc(v) {
  if (v && typeof v.toMillis === "function") return { __ts: v.toMillis() };
  if (v instanceof Date) return { __ts: v.getTime() };
  if (Array.isArray(v)) return v.map(bkEnc);
  if (v && typeof v === "object") { const o = {}; Object.keys(v).forEach((k) => { if (v[k] !== undefined) o[k] = bkEnc(v[k]); }); return o; }
  return v;
}
function bkDec(v) {
  if (Array.isArray(v)) return v.map(bkDec);
  if (v && typeof v === "object") {
    if (Object.keys(v).length === 1 && typeof v.__ts === "number") return Timestamp.fromMillis(v.__ts);
    const o = {}; Object.keys(v).forEach((k) => { o[k] = bkDec(v[k]); }); return o;
  }
  return v;
}
function bkFillList() {
  const box = $("rb-kz-cols");
  if (!box || box.dataset.f) return;
  box.dataset.f = "1";
  box.innerHTML = BK_COLS.map((c) => `<label class="rb-check"><input type="checkbox" class="rb-kz-col" value="${c[0]}"${c[2] ? " checked" : ""}> ${esc(c[1])}${c[3] ? "" : ' <span class="rb-meta">(tylko do wglądu — nie da się przywrócić)</span>'}</label>`).join("");
  bkLast();
}
function bkLast() {
  let t = ""; try { t = localStorage.getItem("wr_last_backup") || ""; } catch (_) {}
  const el = $("rb-kz-last");
  if (!el) return;
  if (!t) { el.textContent = "Nie robiłeś jeszcze kopii na tym urządzeniu."; return; }
  const d = Math.floor((Date.now() - Number(t)) / DAY);
  el.textContent = "Ostatnia kopia z tego urządzenia: " + new Date(Number(t)).toLocaleDateString("pl-PL") + (d >= 14 ? " — minęło już " + d + " dni, warto zrobić nową." : ".");
}
$("rb-kz-export").addEventListener("click", async () => {
  const msg = $("rb-kz-msg"), picks = [...document.querySelectorAll(".rb-kz-col:checked")].map((c) => c.value);
  if (!picks.length) { setMsg(msg, "Zaznacz, co zapisać.", "err"); return; }
  const btn = $("rb-kz-export"); btn.disabled = true;
  setMsg(msg, "Pobieram dane…");
  try {
    const out = { app: "wloska-robota-backup", v: 1, createdAt: new Date().toISOString(), cols: {} };
    const stat = [];
    for (const name of picks) {
      const s = await getDocs(collection(db, name));
      out.cols[name] = s.docs.map((d) => ({ id: d.id, data: bkEnc(d.data()) }));
      stat.push(name + ": " + s.docs.length);
    }
    const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "wloskarobota-kopia-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    try { localStorage.setItem("wr_last_backup", String(Date.now())); } catch (_) {}
    bkLast();
    setMsg(msg, "✅ Zapisano plik kopii. " + stat.join(", ") + ". Trzymaj go w bezpiecznym miejscu (zawiera dane klientów).", "ok");
  } catch (err) {
    console.error(err);
    setMsg(msg, "Nie udało się: " + (err.code ? errText(err) : err.message), "err");
  }
  btn.disabled = false;
});
let bkData = null;
$("rb-kz-file").addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0], box = $("rb-kz-prev"), msg = $("rb-kz-msg");
  bkData = null; box.innerHTML = ""; $("rb-kz-restore").hidden = true; setMsg(msg, "");
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!j || j.app !== "wloska-robota-backup" || j.v !== 1 || !j.cols || typeof j.cols !== "object") throw new Error("To nie jest plik kopii Włoskiej Roboty.");
    bkData = j;
    const rows = BK_COLS.filter((c) => c[3] && Array.isArray(j.cols[c[0]])).map((c) => `<label class="rb-check"><input type="checkbox" class="rb-kz-rcol" value="${c[0]}" checked> ${esc(c[1])} — ${j.cols[c[0]].length} dok.</label>`).join("");
    box.innerHTML = `<div class="rb-meta">Kopia z ${esc(String(j.createdAt || "").slice(0, 16).replace("T", " "))}. Wybierz, co przywrócić:</div>${rows || '<div class="rb-msg err">W pliku nie ma niczego, co da się przywrócić.</div>'}<div class="rb-meta">Dokumenty z pliku <b>nadpiszą</b> obecne o tych samych identyfikatorach. Dokumenty, których nie ma w pliku, zostają bez zmian. Profili klientów, ocen i dziennika nie da się przywrócić z panelu (reguły bazy tego nie pozwalają).</div>`;
    $("rb-kz-restore").hidden = !rows;
  } catch (err) { setMsg(msg, err.message || "Nie udało się odczytać pliku.", "err"); }
});
$("rb-kz-restore").addEventListener("click", async () => {
  const msg = $("rb-kz-msg"), picks = [...document.querySelectorAll(".rb-kz-rcol:checked")].map((c) => c.value);
  if (!bkData || !picks.length) { setMsg(msg, "Wybierz plik i zaznacz, co przywrócić.", "err"); return; }
  const total = picks.reduce((a, n) => a + bkData.cols[n].length, 0);
  const word = prompt("Przywrócisz " + total + " dokumentów z kopii (" + picks.join(", ") + "). To nadpisze obecne dane o tych samych identyfikatorach.\n\nWpisz słowo PRZYWRÓĆ, żeby potwierdzić:");
  if (word === null) return;
  if (String(word).trim().toUpperCase() !== "PRZYWRÓĆ") { setMsg(msg, "Anulowano (nie wpisano słowa PRZYWRÓĆ).", "err"); return; }
  const btn = $("rb-kz-restore"); btn.disabled = true;
  setMsg(msg, "Przywracam…");
  try {
    let n = 0;
    for (const name of picks) {
      const docs = bkData.cols[name];
      for (let i = 0; i < docs.length; i += 400) {
        const b = writeBatch(db);
        docs.slice(i, i + 400).forEach((d) => { if (d && typeof d.id === "string" && d.id && d.data && typeof d.data === "object") { b.set(doc(db, name, d.id), bkDec(d.data)); n++; } });
        await b.commit();
      }
    }
    setMsg(msg, "✅ Przywrócono " + n + " dokumentów. Odśwież stronę (Ctrl+F5), żeby zobaczyć zmiany.", "ok");
    try { dataAt = 0; } catch (_) {}
  } catch (err) {
    console.error(err);
    setMsg(msg, "Nie udało się przywrócić (część mogła się zapisać): " + (err.code ? errText(err) : err.message), "err");
  }
  btn.disabled = false;
});

function renderClients() {
  if (!isAdmin) return;
  const list = $("rb-k-list");
  if (!list) return;
  try { renderRankStats(); } catch (e) { console.warn(e); }
  try { bkFillList(); } catch (_) {}
  renderMsgBox();
  const f = $("rb-k-filter").value;
  const needsLoyal = f === "full" || f === "inactive" || f === "never" || f === "vip" || f === "rankup" || f === "refs";
  if (needsLoyal && !loyalOk) {
    kRows = [];
    $("rb-k-wb").hidden = true;
    $("rb-k-more").hidden = true;
    $("rb-k-hint").textContent = "";
    list.innerHTML = '<div class="rb-empty">' + (dataAt ? "Nie udało się wczytać kart lojalnościowych. Kliknij „Odśwież” w zakładce Dziś (czy opublikowałeś nowe reguły?)." : "Wczytuję dane…") + "</div>";
    return;
  }
  const { rows, dups } = clientRows();
  kRows = rows;
  $("rb-k-hint").textContent = (K_HINT[f] ? K_HINT[f] + " " : "") + "Znaleziono: " + rows.length + ".";
  const wb = f === "inactive" || f === "never";
  $("rb-k-wb").hidden = !wb;
  if (wb) $("rb-k-wb-all").textContent = "Przyznaj wszystkim z listy (" + rows.length + ")";
  $("rb-k-wb-all").disabled = !rows.length;
  const shown = rows.slice(0, kShown);
  $("rb-k-more").hidden = rows.length <= kShown;
  if (!rows.length) { list.innerHTML = '<div class="rb-empty">Brak klientów w tym widoku.</div>'; return; }
  const now = Date.now();
  list.innerHTML = shown.map((r) => {
    const { u, L } = r;
    const n = L ? Math.min(LOYAL_GOAL, L.stamps || 0) : 0;
    const badges = [];
    if (L && (L.stamps || 0) >= LOYAL_GOAL) badges.push('<span class="rb-badge gold">Pełna karta</span>');
    if (r.created && now - r.created < 7 * DAY) badges.push('<span class="rb-badge">Nowy</span>');
    if (siteCfg.levelsOn && L) { const li = rankOf(L); if (li.idx >= 1) badges.push('<span class="rb-badge gold">' + esc(li.lvl.ic + " " + li.lvl.n) + "</span>"); }
    const di = dups.info.get(u.id);
    if (f === "dups") {
      const w = allCoupons.find((c) => c.id === "welcome_" + u.id);
      if (w) badges.push(w.used ? '<span class="rb-badge warn">kod powitalny użyty</span>' : '<span class="rb-badge bad">kod powitalny nieużyty</span>');
    }
    const stats = loyalOk ? "🍕 " + n + "/" + LOYAL_GOAL + " · wizyt: " + (L ? L.total || 0 : 0) + " · ostatnio: " + (r.last ? agoText(r.last) : "jeszcze nie było") : "";
    let refLine = "", refBtn = "";
    if (f === "refs") {
      const ri = refInfo(u), nm = ri.by ? esc(ri.by.name || ri.by.email || "?") : "nieznany kod " + esc(u.refBy);
      const st = { ready: "✅ gotowe do nagrody (ma już pierwszą pieczątkę)", wait: "⏳ czeka na pierwsze zamówienie znajomego", nobody: "❔ nie znaleziono polecającego", paid: "🎁 nagroda przyznana" }[ri.state];
      refLine = `<div class="rb-meta">🤝 Polecił(a): <b>${nm}</b> · ${st}</div>` + (di ? '<div class="rb-dup">⚠️ możliwy duplikat konta — sprawdź przed nagrodą</div>' : "");
      if (ri.state === "ready") refBtn = `<button type="button" class="rb-btn small" data-kref="${esc(u.id)}">🎁 Przyznaj polecającemu −5 zł</button>`;
    }
    const dupLine = f === "dups" && di
      ? '<div class="rb-dup">⚠️ ' + (di.kind === "email" ? "Ten sam adres e-mail co: " : "To samo imię i nazwisko co: ") + di.others.map((o) => esc(o.email)).join(", ") + "</div>" : "";
    return `<div class="rb-kcl"><div><b>${esc(u.name || "(bez imienia)")}</b>${badges.join("")}</div>
      <div class="rb-meta">${esc(u.email || "")}</div>
      ${refLine}${stats ? `<div class="rb-meta">${stats}</div>` : ""}${Number.isInteger(u.bMonth) ? `<div class="rb-meta">🎂 ${bdayText(u)}${f === "bday" ? " (" + (bdayInDays(u) === 0 ? "dziś" : "za " + bdayInDays(u) + " dni") + ")" : ""}</div>` : ""}${dupLine}
      <div class="rb-actions"><button type="button" class="rb-btn small" data-kopen="${esc(u.id)}">Karta klienta</button>${refBtn}
      ${wb ? `<button type="button" class="rb-btn secondary small" data-kwb="${esc(u.id)}">🎟 Wyślij kod</button>` : ""}</div></div>`;
  }).join("");
}

async function grantWinback(users) {
  const wm = $("rb-k-wb-msg");
  setMsg(wm, "");
  const description = $("rb-k-wb-desc").value.trim();
  const days = Math.floor(Number($("rb-k-wb-days").value));
  const prefix = $("rb-k-wb-prefix").value.trim().toUpperCase();
  if (!description) { setMsg(wm, "Wpisz opis rabatu.", "err"); return; }
  if (!(days >= 1 && days <= 365)) { setMsg(wm, "Ważność: od 1 do 365 dni.", "err"); return; }
  if (prefix && !/^[A-Z0-9-]{2,12}$/.test(prefix)) { setMsg(wm, "Przedrostek: 2–12 znaków (litery, cyfry, myślnik).", "err"); return; }
  const target = users.filter((u) => !allCoupons.some((c) => c.uid === u.id && c.description === description && !couponState(c).off));
  const skipped = users.length - target.length;
  if (!target.length) { setMsg(wm, "Każdy z listy ma już aktywny kod o takim opisie.", "err"); return; }
  if (target.length > 1 && !confirm("Przyznać kod „" + description + "” (" + target.length + " os.), ważny " + days + " dni?")) return;
  const end = new Date();
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 0);
  const expiresAt = Timestamp.fromDate(end);
  const taken = new Set(allCoupons.map((c) => c.code));
  const btns = [$("rb-k-wb-all"), ...document.querySelectorAll("#rb-k-list [data-kwb]")];
  btns.forEach((b) => { b.disabled = true; });
  try {
    for (let i = 0; i < target.length; i += 400) {
      const batch = writeBatch(db);
      target.slice(i, i + 400).forEach((u) => {
        let code;
        do { code = genCode(prefix); } while (taken.has(code));
        taken.add(code);
        batch.set(doc(collection(db, "coupons")), { uid: u.id, userEmail: u.email || "", code, description, expiresAt, used: false, createdAt: serverTimestamp() });
      });
      await batch.commit();
    }
    setMsg(wm, "Przyznano " + target.length + (target.length === 1 ? " kod" : " kodów") + (skipped ? " (pominięto " + skipped + ": już mają taki kod)" : "") + ". Klienci zobaczą je w Koncie na stronie.", "ok");
  } catch (err) {
    console.error(err);
    setMsg(wm, errText(err), "err");
  }
  btns.forEach((b) => { b.disabled = false; });
  renderClients();
}

$("rb-k-search").addEventListener("input", () => { kShown = KPAGE; renderClients(); });
$("rb-k-filter").addEventListener("change", () => { kShown = KPAGE; syncKFilterUI(); renderClients(); });
$("rb-k-days").addEventListener("change", () => { kShown = KPAGE; renderClients(); });
$("rb-k-more").addEventListener("click", () => { kShown += KPAGE; renderClients(); });
$("rb-k-wb-all").addEventListener("click", () => grantWinback(kRows.map((r) => r.u)));
$("rb-k-list").addEventListener("click", async (e) => {
  const open = e.target.closest("[data-kopen]");
  const wb = e.target.closest("[data-kwb]");
  const kref = e.target.closest("[data-kref]");
  if (kref) { rewardReferral(kref.dataset.kref); return; }
  if (open) {
    setMsg($("rb-k-msg"), "");
    const card = $("rb-k-card");
    await showCustomer(open.dataset.kopen, card, false);
    if (card.scrollIntoView) card.scrollIntoView({ block: "start", behavior: "smooth" });
    if (custView && custView.data) syncLoyalCache(custView.uid, custView.data.loyal);
  } else if (wb) {
    const r = kRows.find((x) => x.u.id === wb.dataset.kwb);
    if (r) grantWinback([r.u]);
  }
});
syncKFilterUI();

/* ---------- wiadomości e-mail do klientów (program pocztowy, adresy w UDW) ---------- */
const MSG_FOOTER = "\n\n—\nWłoska Robota, Głuponie 103, 64-316 Kuślin, tel. 668 862 396, wloskarobota.eu\nDostajesz tę wiadomość, bo zaznaczyłeś zgodę w zakładce Konto. Możesz ją wycofać w każdej chwili w tej samej zakładce lub odpisać na tego maila.";
const MSG_TPL = {
  bday: { subject: "🎂 Wszystkiego najlepszego od Włoskiej Roboty!", body: "Cześć!\n\nZ okazji urodzin życzymy Ci wszystkiego najlepszego! 🎉\n\nW dniu urodzin wejdź na wloskarobota.eu w zakładkę Konto, a dodamy Ci urodzinowy rabat na pizzę.\n\nSmacznego!\nZespół Włoskiej Roboty" },
  miss: { subject: "Tęsknimy za Tobą 🍕", body: "Cześć!\n\nDawno Cię nie było, a w piecu zawsze znajdzie się miejsce na Twoją ulubioną pizzę.\n\nZajrzyj do nas albo zadzwoń: 668 862 396. Aktualne menu i kody rabatowe znajdziesz na wloskarobota.eu w zakładce Konto.\n\nDo zobaczenia!\nZespół Włoskiej Roboty" },
  promo: { subject: "Specjalna akcja we Włoskiej Robocie 🍕", body: "Cześć!\n\nMamy dla Ciebie coś specjalnego: [opisz akcję, termin i ewentualny kod promocyjny].\n\nWpisz kod w zakładce Konto na wloskarobota.eu albo po prostu zadzwoń: 668 862 396.\n\nZapraszamy!\nZespół Włoskiej Roboty" },
  expire: { subject: "Twój rabat wkrótce wygaśnie ⏳", body: "Cześć!\n\nW zakładce Konto na wloskarobota.eu czeka na Ciebie rabat, który wkrótce wygaśnie ⏳\n\nWejdź, sprawdź kod i termin, a potem zadzwoń: 668 862 396 albo zajrzyj do nas.\n\nSmacznego!\nZespół Włoskiej Roboty" },
  custom: { subject: "", body: "" }
};
const MAIL_BATCH = 25;
const mMsg = $("rb-m-msg");
function mailAudience() {
  const aud = $("rb-m-aud").value;
  const me = (auth.currentUser || {}).uid;
  const staffIds = new Set(allStaff.map((x) => x.id));
  let list = allUsers.filter((u) => u.id !== me && !staffIds.has(u.id) && u.marketing === true && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(u.email || ""));
  if (aud === "bday0") list = list.filter((u) => bdayInDays(u) === 0);
  else if (aud === "bday7") list = list.filter((u) => bdayInDays(u) <= 7);
  else if (aud === "inactive") {
    const ok = new Set(clientRows({ filter: "inactive", days: 30, noSearch: true }).rows.map((r) => r.u.id));
    list = list.filter((u) => ok.has(u.id));
  } else if (aud === "expiring") {
    const t0 = Date.now(), t1 = t0 + 3 * 86400000;
    const ok = new Set(allCoupons.filter((c) => !c.used && tsMs(c.expiresAt) > t0 && tsMs(c.expiresAt) <= t1).map((c) => c.uid));
    list = list.filter((u) => ok.has(u.id));
  }
  return list;
}
function mailText() { return ($("rb-m-body").value.trim() + MSG_FOOTER).replace(/\r?\n/g, "\r\n"); }
function renderMsgBox() {
  if (!$("rb-m-box")) return;
  const aud = $("rb-m-aud").value;
  if (aud === "inactive" && !loyalOk) {
    $("rb-m-count").textContent = "Wczytuję dane klientów…";
    $("rb-m-btns").innerHTML = "";
    if (!dataAt || Date.now() - dataAt > 5000) ensureData(false);
    return;
  }
  const list = mailAudience();
  const totalOk = allUsers.filter((u) => u.marketing === true).length;
  $("rb-m-count").textContent = "Odbiorców: " + list.length + " (zgodę na e-mail ma " + totalOk + " z " + allUsers.length + " klientów).";
  const subj = $("rb-m-subj").value.trim();
  const body = mailText();
  const parts = [];
  for (let i = 0; i < list.length; i += MAIL_BATCH) parts.push(list.slice(i, i + MAIL_BATCH));
  $("rb-m-btns").innerHTML = parts.map((part, i) => {
    const bcc = part.map((u) => u.email.replace(/\+/g, "%2B")).join(",");
    const href = "mailto:?bcc=" + bcc + "&subject=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(body);
    const lbl = parts.length === 1 ? "✉ Otwórz w programie pocztowym (" + part.length + ")" : "✉ Część " + (i + 1) + " z " + parts.length + " (" + part.length + " adresów)";
    return `<a class="rb-btn" href="${href}">${lbl}</a>`;
  }).join("");
}
function applyMsgTpl() {
  const t = MSG_TPL[$("rb-m-tpl").value] || MSG_TPL.custom;
  $("rb-m-subj").value = t.subject;
  $("rb-m-body").value = t.body;
  renderMsgBox();
}
const AUD_TPL = { bday0: "bday", bday7: "bday", inactive: "miss", expiring: "expire" };
$("rb-m-aud").addEventListener("change", () => {
  // jeśli treść to nadal gotowy szablon (nic nie dopisywałeś), dobierz pasujący do grupy
  const cur = Object.values(MSG_TPL).some((t) => t.subject === $("rb-m-subj").value && t.body === $("rb-m-body").value);
  const want = AUD_TPL[$("rb-m-aud").value];
  if (cur && want && $("rb-m-tpl").value !== want) { $("rb-m-tpl").value = want; applyMsgTpl(); return; }
  renderMsgBox();
});
$("rb-m-tpl").addEventListener("change", applyMsgTpl);
["rb-m-subj", "rb-m-body"].forEach((id) => $(id).addEventListener("input", renderMsgBox));
async function copyTxt(txt, ok) {
  try { await navigator.clipboard.writeText(txt); setMsg(mMsg, ok, "ok"); }
  catch (_) { setMsg(mMsg, "Nie udało się skopiować. Zaznacz i skopiuj ręcznie.", "err"); }
}
$("rb-m-copymail").addEventListener("click", () => {
  const list = mailAudience();
  if (!list.length) { setMsg(mMsg, "Brak odbiorców.", "err"); return; }
  copyTxt(list.map((u) => u.email).join(", "), "Skopiowano " + list.length + " adresów. Wklej je w polu UDW.");
});
$("rb-m-copytext").addEventListener("click", () => copyTxt(($("rb-m-subj").value.trim() ? $("rb-m-subj").value.trim() + "\n\n" : "") + $("rb-m-body").value.trim() + MSG_FOOTER, "Skopiowano treść."));
applyMsgTpl();

function renderToday() {
  if (!isAdmin) return;
  const box = $("rb-td-stats");
  if (!box) return;
  const loaded = dataAt > 0;
  const now = Date.now();
  const t0 = dayStart(0), y0 = dayStart(1);
  const evCnt = (type, from, to) => reportEvents.filter((e) => e.type === type && tsMs(e.at) >= from && tsMs(e.at) < to).length;
  const usCnt = (from, to) => allUsers.filter((u) => { const m = tsMs(u.createdAt); return m >= from && m < to; }).length;
  const d30 = dayStart(29);
  const rows = [
    ["pieczątek dziś", evCnt("stamp", t0, now + DAY), evCnt("stamp", y0, t0), evCnt("stamp", d30, now + DAY) / 30],
    ["pizz gratis dziś", evCnt("reward", t0, now + DAY), evCnt("reward", y0, t0), evCnt("reward", d30, now + DAY) / 30],
    ["kodów dziś", evCnt("coupon", t0, now + DAY), evCnt("coupon", y0, t0), evCnt("coupon", d30, now + DAY) / 30],
    ["nowych klientów", usCnt(t0, now + DAY), usCnt(y0, t0), usCnt(d30, now + DAY) / 30]
  ];
  box.innerHTML = rows.map(([label, n, y, avg]) =>
    `<div class="rb-stat"><b>${loaded || label === "nowych klientów" ? n : "…"}</b><span>${label}</span><em>${loaded || label === "nowych klientów" ? "wczoraj " + y + " · śr. " + pl1(avg) : "wczytuję…"}</em></div>`).join("");
  $("rb-td-when").textContent = loaded
    ? "Stan na " + new Date(dataAt).toLocaleString("pl-PL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : "Wczytuję…";

  const alerts = [];
  const lows = feedbackItems.filter((f) => Number.isInteger(f.rating) && f.rating <= 3 && tsMs(f.createdAt) >= now - 7 * DAY)
    .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
  if (lows.length) {
    const f = lows[0];
    alerts.push({ cls: "bad", text: "⭐ " + lows.length + (lows.length === 1 ? " niska ocena" : " niskich ocen") + " (1–3 ★) z ostatnich 7 dni",
      sub: starStr(f.rating) + " " + (f.name || "Klient") + (f.comment ? ": „" + (f.comment.length > 90 ? f.comment.slice(0, 90) + "…" : f.comment) + "”" : ""), go: "report", btn: "Zobacz" });
  }
  const soonList = expiringSoon();
  const soon = soonList.length;
  if (soon) alerts.push({ cls: "", text: "🎟 " + soon + (soon === 1 ? " kod wygasa" : " kodów wygasa") + " w ciągu 7 dni",
    sub: soonList.slice(0, 3).map((c) => c.code + " — " + (c.userEmail || "?") + " (" + daysLeftText(tsMs(c.expiresAt)) + ")").join(" · ") + (soon > 3 ? " · …" : ""),
    go: "list", lfilter: "soon", btn: "Zobacz" });
  if (loaded && loyalOk) {
    const full = allLoyal.filter((l) => l.id !== (auth.currentUser || {}).uid && (l.stamps || 0) >= LOYAL_GOAL).length;
    if (full) alerts.push({ cls: "", text: "🍕 " + full + (full === 1 ? " klient ma" : " klientów ma") + " pełną kartę (pizza gratis czeka)", go: "clients", filter: "full", btn: "Pokaż" });
    const inact = clientRows({ filter: "inactive", days: 30, noSearch: true }).rows.length;
    if (inact) alerts.push({ cls: "", text: "😴 " + inact + (inact === 1 ? " klient nie był" : " klientów nie było") + " w lokalu od 30+ dni", sub: "Możesz wysłać im kod „zapraszamy z powrotem”.", go: "clients", filter: "inactive", btn: "Pokaż" });
  }
  const me0 = (auth.currentUser || {}).uid;
  const bd = allUsers.filter((u) => u.id !== me0 && bdayInDays(u) <= 7).sort((a, b) => bdayInDays(a) - bdayInDays(b));
  if (bd.length) alerts.push({ cls: "", text: "🎂 Urodziny klientów w ciągu 7 dni: " + bd.length,
    sub: bd.slice(0, 3).map((u) => (u.name || u.email || "?") + " — " + (bdayInDays(u) === 0 ? "dziś" : bdayText(u))).join(" · ") + (bd.length > 3 ? " · …" : ""),
    go: "clients", filter: "bday", btn: "Pokaż" });
  if (loaded && loyalOk && siteCfg.refOn) {
    const rdy = allUsers.filter((u) => u.refBy && refInfo(u).state === "ready").length;
    if (rdy) alerts.push({ cls: "", text: "🤝 Polecenia do nagrodzenia: " + rdy, sub: "Znajomy zrobił już pierwszy zakup — przyznaj nagrodę polecającemu.", go: "clients", filter: "refs", btn: "Pokaż" });
  }
  if (loaded && loyalOk && siteCfg.levelsOn) {
    const lv = allLoyal.filter((l) => l.id !== me0 && rewardsOf(l) > 0 && tsMs(l.lastRewardAt) >= now - 7 * DAY).map((l) => ({ l, li: rankOf(l) })).filter((x) => x.li.idx >= 1 && rewardsOf(x.l) === x.li.lvl.from);
    if (lv.length) alerts.push({ cls: "", text: "🏅 Nowe rangi w ostatnich 7 dniach: " + lv.length,
      sub: lv.slice(0, 3).map((x) => (x.l.name || x.l.email || "?") + " → " + x.li.lvl.ic + " " + x.li.lvl.n).join(" · ") + (lv.length > 3 ? " · …" : "") + ". Pamiętaj o przywileju przy kasie.", go: "clients", filter: "rankup", btn: "Pokaż" });
  }
  if (siteCfg.poll && siteCfg.poll.open) alerts.push({ cls: "", text: "🗳 Trwa głosowanie: " + siteCfg.poll.q, sub: siteCfg.poll.mode === "open" ? "Klienci zgłaszają propozycje i głosują. Zobacz stan i wyniki." : "Zobacz aktualne wyniki.", go: "site", subtab: "Głosowanie", btn: "Zobacz" });
  { let lb = 0; try { lb = Number(localStorage.getItem("wr_last_backup") || 0); } catch (_) {}
    const age = lb ? Math.floor((now - lb) / DAY) : -1;
    if (age < 0 || age >= 14) alerts.push({ cls: "", text: "💾 " + (age < 0 ? "Nie robiłeś jeszcze kopii zapasowej na tym urządzeniu" : "Ostatnia kopia zapasowa sprzed " + age + " dni"), sub: "Zapisz plik z danymi strony i klientów (kilka sekund).", go: "site", subtab: "Kopia", btn: "Zrób kopię" }); }
  const dg = dupInfo();
  if (dg.groups) alerts.push({ cls: "bad", text: "👥 Możliwe duplikaty kont: " + dg.info.size + " kont w " + dg.groups + (dg.groups === 1 ? " grupie" : " grupach"), sub: "Ten sam adres e-mail (aliasy) lub to samo imię i nazwisko.", go: "clients", filter: "dups", btn: "Sprawdź" });
  $("rb-td-alerts").innerHTML = alerts.length
    ? alerts.map((a) => `<div class="rb-alert ${a.cls}"><div>${esc(a.text)}${a.sub ? `<small>${esc(a.sub)}</small>` : ""}</div><button type="button" class="rb-btn secondary small" data-go="${a.go}"${a.filter ? ` data-filter="${a.filter}"` : ""}${a.lfilter ? ` data-lfilter="${a.lfilter}"` : ""}${a.subtab ? ` data-subtab="${a.subtab}"` : ""}>${a.btn}</button></div>`).join("")
    : (loaded ? '<div class="rb-alert ok"><div>✅ Nic pilnego. Wszystko w porządku.</div></div>' : '<div class="rb-empty">Wczytuję…</div>');

  const recent = reportEvents.slice().sort((a, b) => tsMs(b.at) - tsMs(a.at)).slice(0, 6);
  $("rb-td-recent").innerHTML = recent.length
    ? recent.map((e) => `<div class="rb-ev"><b>${esc(EV_LABEL[e.type] || e.type)}</b> — ${esc(e.customerName || "")}
        <div class="rb-meta">${fmtDateTime(e.at)} · ${esc(e.byName || "")}${e.detail ? " · " + esc(e.detail) : ""}</div></div>`).join("")
    : '<div class="rb-empty">' + (loaded ? "Brak zdarzeń." : "Wczytuję…") + "</div>";
}
$("rb-td-refresh").addEventListener("click", () => ensureData(true));
document.querySelector('#rb-admin .rb-pane[data-pane="today"]').addEventListener("click", (e) => {
  const b = e.target.closest("[data-go]");
  if (!b) return;
  if (b.dataset.lfilter) {
    $("rb-l-filter").value = b.dataset.lfilter;
    $("rb-l-search").value = "";
    renderAdminList();
  }
  if (b.dataset.filter) {
    $("rb-k-filter").value = b.dataset.filter;
    $("rb-k-search").value = "";
    kShown = KPAGE;
    syncKFilterUI();
  }
  setAdminTab(b.dataset.go);
  if (b.dataset.subtab) setTimeout(() => { const t = [...document.querySelectorAll(".rb-subtab")].find((x) => x.textContent.includes(b.dataset.subtab)); if (t) t.click(); }, 50);
});

/* ---------- zakładki panelu admina ---------- */
const cMsg = $("rb-c-msg");
const sMsg = $("rb-s-msg");
const TAB_ALIAS = { grant: ["builder", "new", "grant"], list: ["builder", "granted", ""] };
function setAdminTab(name) {
  let nsec = "";
  if (TAB_ALIAS[name]) { nsec = TAB_ALIAS[name][1]; if (TAB_ALIAS[name][2]) setNMode(TAB_ALIAS[name][2]); name = TAB_ALIAS[name][0]; }
  const adm = $("rb-admin"); if (adm) adm.dataset.tab = name;
  overlay.dataset.atab = name;
  document.querySelectorAll("#rb-admin .rb-atab").forEach((b) => b.classList.toggle("active", b.dataset.pane === name));
  document.querySelectorAll("#rb-admin .rb-pane").forEach((p) => { p.hidden = p.dataset.pane !== name; });
  const bar = document.querySelector("#rb-admin > .rb-tabs"), act = bar && bar.querySelector(".rb-atab.active");
  if (bar && bar.getBoundingClientRect().top <= 2) bar.scrollIntoView({ block: "start" });
  if (act && act.scrollIntoView) act.scrollIntoView({ inline: "center", block: "nearest" });
  if (name !== "check") stopScanner();
  if (name === "site") loadSite().then(fillSiteForm);
  if (name === "report") { loadReport(); loadFeedback(); }
  if (name === "straz" && window.WRStraz) window.WRStraz.open();
  if (name === "today" || name === "clients") ensureData(false);
  if (name === "clients") renderClients();
  if (name === "builder" && nsec) setNSec(nsec);
}
document.querySelectorAll("#rb-admin .rb-atab").forEach((b) => b.addEventListener("click", () => setAdminTab(b.dataset.pane)));
const szRef = $("rb-straz-refresh"); if (szRef) szRef.addEventListener("click", () => { if (window.WRStraz) window.WRStraz.open(); });

(function fillThemeOptions() {
  const sel = $("rb-site-theme");
  if (!sel || sel.dataset.filled) return;
  sel.dataset.filled = "1";
  (WRT.list || []).forEach((t) => { const o = document.createElement("option"); o.value = t.key; o.textContent = t.label; sel.appendChild(o); });
})();
function showThemeNow() {
  const el = $("rb-theme-now"), v = $("rb-site-theme").value;
  if (!el) return;
  const r = v === "auto" ? autoTheme() : (THEMES[v] ? { name: v } : null);
  el.textContent = "Dziś na stronie: " + themeLabel(r);
}
$("rb-site-theme").addEventListener("change", showThemeNow);

/* ---------- Strona: podmenu (jedna sekcja naraz, wyśrodkowane pod górnymi zakładkami) ---------- */
(function () {
  const pane = document.querySelector('#rb-admin .rb-pane[data-pane="site"]');
  if (!pane) return;
  const heads = [...pane.querySelectorAll(":scope > h4.rb-hsec")];
  const LABELS = { "Komunikat na górze strony": "📢 Komunikat", "Akcje i specjalne dni": "🎯 Akcje", "Pizza dnia": "🍕 Pizza dnia", "Dowóz": "🚚 Dowóz", "Motyw sezonowy": "🎨 Motyw", "Galeria zdjęć": "🖼️ Galeria", "Lojalność i polecenia": "🏅 Lojalność", "Opinie w Google": "⭐ Opinie", "Godziny otwarcia": "🕐 Godziny", "Plakat QR": "🖨 Plakat QR", "Głosowanie klientów": "🗳 Głosowanie", "Kopia zapasowa": "💾 Kopia", "Opinie z Google na stronie": "💬 Opinie klientów", "Własne produkty": "➕ Produkty", "Ceny i dostępność pozycji ze strony": "💲 Ceny" };
  const groups = heads.map((h) => {
    const g = document.createElement("div"); g.className = "rb-sub"; g.hidden = true;
    const label = LABELS[(h.querySelector("span") || h).textContent.trim()] || h.textContent.trim();
    h.before(g);
    let n = h; while (n) { const nx = n.nextSibling; g.appendChild(n); n = nx && !(nx.nodeType === 1 && nx.matches && nx.matches("h4.rb-hsec")) ? nx : null; }
    return { g, label };
  });
  const nav = document.createElement("div"); nav.className = "rb-subnav"; nav.setAttribute("role", "tablist");
  const order = [...groups]; const pi = order.findIndex((x) => x.label.includes("Ceny")); if (pi > 0) order.unshift(order.splice(pi, 1)[0]);
  const show = (i) => { order.forEach((x, k) => { x.g.hidden = k !== i; x.b.classList.toggle("active", k === i); x.b.setAttribute("aria-selected", k === i ? "true" : "false"); }); };
  order.forEach((x, i) => { const b = document.createElement("button"); b.type = "button"; b.className = "rb-subtab"; b.textContent = x.label; b.setAttribute("role", "tab"); b.addEventListener("click", () => show(i)); x.b = b; nav.appendChild(b); });
  ["rb-site-msg", "rb-site-toast"].forEach((id) => { const e = document.getElementById(id); if (e) pane.appendChild(e); });
  pane.prepend(nav);
  show(0);
})();

/* ---------- pomocnicze ---------- */
function fmtDateTime(ts) {
  return ts && ts.toDate ? ts.toDate().toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }) : "";
}
function pickFn(mod) {
  let f = mod && mod.default;
  if (f && typeof f !== "function" && typeof f.default === "function") f = f.default;
  return typeof f === "function" ? f : null;
}
function parseCode(raw) {
  let t = String(raw || "").trim().toUpperCase();
  if (t.startsWith("WR:")) t = t.slice(3);
  return /^[A-Z0-9-]{3,40}$/.test(t) ? t : "";
}
function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
  beep(Array.isArray(pattern) ? (pattern[0] === 120 ? "err" : "reward") : "ok");
}
let audioCtx = null;
function prepAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch (_) {}
}
function beep(kind) {
  const snd = $("rb-s-sound");
  if (!snd || !snd.checked) return;
  try {
    prepAudio();
    if (!audioCtx) return;
    const notes = kind === "err" ? [[220, 0, 0.3]] : kind === "reward" ? [[660, 0, 0.1], [990, 0.13, 0.2]] : [[880, 0, 0.12]];
    notes.forEach(([f, at, dur]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = kind === "err" ? "square" : "sine"; o.frequency.value = f; g.gain.value = 0.12;
      o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + at; o.start(t); o.stop(t + dur);
    });
  } catch (_) {}
}

/* ---------- wykorzystanie kodu (transakcja: nie da się użyć dwa razy) ---------- */
async function redeem(id) {
  const ref = doc(db, "coupons", id);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return { ok: false, reason: "Kod nie istnieje." };
      const d = snap.data();
      if (d.used) return { ok: false, reason: "Kod już wykorzystany." };
      if (d.expiresAt && d.expiresAt.toDate() < new Date()) return { ok: false, reason: "Kod wygasł." };
      tx.update(ref, { used: true, usedAt: serverTimestamp() });
      tx.set(newLogRef(), logData("coupon", { uid: d.uid, name: d.userEmail }, d.code + " — " + d.description));
      return { ok: true };
    });
  } catch (err) {
    console.error(err);
    return { ok: false, reason: errText(err) };
  }
}

/* ---------- kod QR na kuponie klienta ---------- */
const qrCache = new Map();
let QRfn = null;
function qrSvg(text) {
  const qr = QRfn(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), m = 4, size = n + m * 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += "M" + (c + m) + "," + (r + m) + "h1v1h-1z";
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size + '" shape-rendering="crispEdges" role="img" aria-label="Kod QR"><rect width="' + size + '" height="' + size + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
}
async function drawQRs(root) {
  const boxes = [...root.querySelectorAll(".rb-qr[data-qr],.rb-qr[data-qrfull],.qp-qr[data-qrfull]")];
  if (!boxes.length) return;
  try {
    if (!QRfn) QRfn = pickFn(await import("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm"));
    if (!QRfn) return;
    boxes.forEach((el) => {
      const text = el.dataset.qrfull || ("WR:" + el.dataset.qr);
      if (!qrCache.has(text)) qrCache.set(text, qrSvg(text));
      el.innerHTML = qrCache.get(text);
    });
  } catch (err) { console.warn("Kod QR niedostępny:", err); }
}

/* ---------- plakat QR do wydruku (Strona → Plakat QR) ---------- */
function qpCodes() {
  const g = (id) => $(id).checked;
  const list = [];
  const origin = location.origin && /^https?:/.test(location.origin) ? location.origin : "https://wloskarobota.eu";
  if (g("rb-qp-site")) list.push({ url: origin + "/", t: "Menu i zamówienia", s: "wloskarobota.eu" });
  if (g("rb-qp-rev")) list.push({ url: httpsUrl(siteCfg.googleReviewUrl) ? siteCfg.googleReviewUrl.trim() : GOOGLE_REVIEW_DEFAULT, t: "Zostaw opinię w Google", s: "Dziękujemy za każdą ⭐" });
  if (g("rb-qp-acc")) list.push({ url: origin + "/#konto", t: "Karta lojalnościowa", s: "Załóż konto i zbieraj pieczątki" });
  const cu = $("rb-qp-curl").value.trim();
  if (g("rb-qp-cus") && httpsUrl(cu)) list.push({ url: cu, t: $("rb-qp-clab").value.trim() || "Zeskanuj", s: "" });
  return list;
}
function qpHtml() {
  const codes = qpCodes(), sheet = $("rb-qp-layout").value === "sheet";
  const title = esc($("rb-qp-title").value.trim() || "Włoska Robota"), sub = esc($("rb-qp-sub").value.trim());
  if (!codes.length) return '<div class="rb-meta">Zaznacz co najmniej jeden kod (dla własnego wpisz adres zaczynający się od https://).</div>';
  if (sheet) {
    const c = codes[0], cell = '<div class="qp-cell"><div class="qp-qr" data-qrfull="' + esc(c.url) + '"></div><div class="qp-cl">' + esc(c.t) + "</div></div>";
    return '<div class="qp qp-sheet-wrap"><div class="qp-sheet">' + cell.repeat(12) + "</div></div>";
  }
  const w = codes.length === 1 ? "11cm" : codes.length === 2 ? "7.5cm" : "5.6cm";
  return '<div class="qp"><h1>' + title + "</h1>" + (sub ? '<div class="qp-sub">' + sub + "</div>" : "") + '<div class="qp-grid">'
    + codes.map((c) => '<div class="qp-item"><div class="qp-qr" style="width:' + w + '" data-qrfull="' + esc(c.url) + '"></div><div class="qp-t">' + esc(c.t) + "</div>" + (c.s ? '<div class="qp-s">' + esc(c.s) + "</div>" : "") + "</div>").join("")
    + '</div><div class="qp-foot">668 862 396 · Głuponie 103</div></div>';
}
async function qpPreview() {
  const box = $("rb-qp-prev");
  box.innerHTML = qpHtml();
  await drawQRs(box);
}
["rb-qp-site", "rb-qp-rev", "rb-qp-acc", "rb-qp-cus", "rb-qp-layout", "rb-qp-title", "rb-qp-sub", "rb-qp-curl", "rb-qp-clab"].forEach((id) => $(id).addEventListener("input", () => { qpPreview(); }));
$("rb-qp-print").addEventListener("click", async () => {
  if (!qpCodes().length) { qpPreview(); return; }
  let box = document.getElementById("print-poster");
  if (!box) { box = document.createElement("div"); box.id = "print-poster"; document.body.appendChild(box); }
  box.innerHTML = qpHtml();
  await drawQRs(box);
  const done = () => { document.body.classList.remove("printing-poster"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  document.body.classList.add("printing-poster");
  setTimeout(() => { try { window.print(); } catch (_) { done(); } }, 80);
});

/* ---------- skaner QR (tylko telefon) ---------- */
const IS_PHONE = matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const HAS_CAM = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
const PHONE_CAM = IS_PHONE && HAS_CAM;
$("rb-s-start").hidden = !PHONE_CAM;
(function () {
  const get = (k, d) => { try { const v = localStorage.getItem("wr_scan_" + k); return v === null ? d : v === "1"; } catch (_) { return d; } };
  const set = (k, v) => { try { localStorage.setItem("wr_scan_" + k, v ? "1" : "0"); } catch (_) {} };
  [["auto", true], ["quick", false], ["sound", true]].forEach(([k, d]) => {
    const el = $("rb-s-" + k);
    el.checked = get(k, d);
    el.addEventListener("change", () => set(k, el.checked));
  });
  $("rb-s-opts").hidden = !PHONE_CAM;
})();
if (!PHONE_CAM) {
  const hint = $("rb-s-hint");
  hint.hidden = false;
  hint.textContent = IS_PHONE
    ? "Aparat jest niedostępny w tej przeglądarce. Wpisz kod ręcznie."
    : "Skanowanie kodów QR działa na telefonie: otwórz stronę na telefonie i zaloguj się kontem administratora lub obsługi. Tutaj możesz wpisać kod ręcznie.";
}

let stream = null, scanning = false, busy = false, scanTimer = 0;
let detector = null, detectorBroken = false, jsQRfn = null, scanCanvas = null;
let lastRaw = "", lastRawAt = 0;

async function ensureReader() {
  if (detector || jsQRfn) return true;
  if (!detectorBroken && "BarcodeDetector" in window) {
    try { detector = new BarcodeDetector({ formats: ["qr_code"] }); return true; } catch (_) { detectorBroken = true; }
  }
  try { jsQRfn = pickFn(await import("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm")); return !!jsQRfn; }
  catch (_) { return false; }
}

async function startScanner() {
  setMsg(sMsg, "");
  prepAudio();
  if (stream) { resumeScan(); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
  } catch (err) {
    console.error(err);
    setMsg(sMsg, err && err.name === "NotAllowedError"
      ? "Zezwól na dostęp do aparatu (ikona kłódki przy adresie), potem spróbuj ponownie."
      : "Nie udało się włączyć aparatu.", "err");
    return;
  }
  const video = $("rb-s-video");
  video.srcObject = stream;
  $("rb-s-box").hidden = false;
  $("rb-s-start").hidden = true;
  try { await video.play(); } catch (_) {}
  if (!(await ensureReader())) {
    setMsg(sMsg, "Nie udało się wczytać czytnika kodów QR (sprawdź internet).", "err");
    stopScanner();
    return;
  }
  busy = false;
  scanning = true;
  scanLoop();
}

function stopScanner() {
  scanning = false;
  busy = false;
  clearTimeout(scanTimer);
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  const v = $("rb-s-video");
  if (v) v.srcObject = null;
  const box = $("rb-s-box");
  if (box) box.hidden = true;
  const st = $("rb-s-start");
  if (st) st.hidden = !PHONE_CAM;
}

function resumeScan() {
  if (!stream) { startScanner(); return; }
  busy = false;
  scanning = true;
  scanLoop();
}

function autoResume() {
  const a = $("rb-s-auto");
  if (!a || !a.checked || !stream) return;
  setTimeout(() => {
    const box = $("rb-s-box");
    if (stream && !scanning && !busy && box && !box.hidden) resumeScan();
  }, 1200);
}
let scanHist = [];
function renderScanHist() {
  const el = $("rb-s-hist");
  if (!el) return;
  el.innerHTML = scanHist.length
    ? "<h4>Ostatnio w tej zmianie</h4>" + scanHist.map((h) => `<div class="rb-meta">${h.t.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })} · ${esc(h.name)} · ${esc(h.what)}</div>`).join("")
    : "";
}
function scanHistPush(name, what) {
  scanHist.unshift({ t: new Date(), name: name || "", what });
  scanHist = scanHist.slice(0, 6);
  renderScanHist();
}
function custName() {
  const L = custView && custView.data && custView.data.loyal;
  return L ? (L.name || L.email || "") : "";
}
async function stampTx(uid) {
  const ref = doc(db, "loyalty", uid);
  let res = null;
  await runTransaction(db, async (tx) => {
    const sn = await tx.get(ref);
    if (!sn.exists()) throw new Error("Klient nie ma karty.");
    const d = sn.data();
    if ((d.stamps || 0) >= LOYAL_GOAL) throw new Error("Karta pełna — najpierw wydaj pizzę gratis.");
    tx.update(ref, { stamps: (d.stamps || 0) + 1, total: (d.total || 0) + 1, lastStampAt: serverTimestamp() });
    tx.set(newLogRef(), logData("stamp", { uid, name: d.name || d.email }, ((d.stamps || 0) + 1) + "/" + LOYAL_GOAL));
    res = { n: (d.stamps || 0) + 1, name: d.name || d.email || "" };
  });
  return res;
}
/* Tryb szybki: zeskanowanie klienta od razu dodaje pieczątkę (tylko gdy karta nie jest pełna i minęło 2 h od poprzedniej) */
async function quickStamp(uid, out) {
  custView = { uid, target: out, withNext: true, data: null };
  try {
    custView.data = await loadCustomer(uid);
    const L = custView.data.loyal;
    const last = L && L.lastStampAt && L.lastStampAt.toDate ? L.lastStampAt.toDate() : null;
    const cool = !!(last && last.getTime() + STAMP_COOLDOWN_H * 3600000 > Date.now());
    if (L && (L.stamps || 0) < LOYAL_GOAL && !cool) {
      const r = await stampTx(uid);
      custView.data = await loadCustomer(uid);
      renderCustomer();
      syncLoyalCache(uid, custView.data.loyal);
      setMsg(sMsg, "✅ Dodano pieczątkę: " + r.name + " (" + r.n + "/" + LOYAL_GOAL + ")", "ok");
      scanHistPush(r.name, "➕ pieczątka " + r.n + "/" + LOYAL_GOAL);
      buzz(150);
      autoResume();
      return;
    }
    renderCustomer();
    if (cool) { setMsg(sMsg, "Ten klient dostał pieczątkę niedawno (kolejna możliwa po " + STAMP_COOLDOWN_H + " h). Pokazuję kartę.", "err"); buzz([120, 60, 120]); }
    else if (L) { setMsg(sMsg, "Karta jest pełna: wydaj pizzę gratis.", "ok"); buzz([100, 50, 100]); }
    else buzz([120, 60, 120]);
  } catch (err) {
    console.error(err);
    out.innerHTML = '<div class="rb-res bad">❌ ' + esc(errText(err)) + "</div>";
    custView = null;
    buzz([120, 60, 120]);
  }
}
async function tick(video) {
  try {
    if (video.readyState < 2 || !video.videoWidth) return "";
    if (detector) {
      const r = await detector.detect(video);
      return r.length ? r[0].rawValue : "";
    }
    if (jsQRfn) {
      const w = Math.min(480, video.videoWidth);
      const h = Math.round(video.videoHeight * w / video.videoWidth);
      const cv = scanCanvas || (scanCanvas = document.createElement("canvas"));
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);
      const r = jsQRfn(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
      return r ? r.data : "";
    }
  } catch (err) {
    if (detector) { detector = null; detectorBroken = true; await ensureReader(); }
  }
  return "";
}

function scanLoop() {
  clearTimeout(scanTimer);
  if (!scanning) return;
  tick($("rb-s-video")).then((text) => {
    if (!scanning) return;
    if (text) {
      const now = Date.now();
      if (text === lastRaw && now - lastRawAt < 5000) { lastRawAt = now; scanTimer = setTimeout(scanLoop, 200); return; }
      lastRaw = text; lastRawAt = now;
      handleScan(text); return;
    }
    scanTimer = setTimeout(scanLoop, 120);
  });
}

function scanCard(kind, title, c, note, withUndo) {
  const body = c
    ? `<div class="rb-code" style="font-size:18px">${esc(c.code)}</div>
       <div class="rb-desc" style="font-size:18px">${esc(c.description)}</div>
       <div class="rb-meta">${esc(ownerName(c))}${c.expiresAt ? " · ważny do " + fmtDate(c.expiresAt) : ""}</div>`
    : "";
  return `<div class="rb-res big ${kind}">
    <div class="rb-big">${title}</div>
    ${body}
    ${note ? `<div class="rb-meta" style="margin-top:6px">${note}</div>` : ""}
    <div class="rb-actions">
      ${withUndo ? `<button type="button" class="rb-btn secondary small" data-act="undo" data-id="${esc(c.id)}">Cofnij (pomyłka)</button>` : ""}
      <button type="button" class="rb-btn small" data-act="next">Skanuj następny</button>
    </div>
  </div>`;
}

async function handleScan(raw) {
  if (busy) return;
  busy = true;
  scanning = false;
  const out = $("rb-s-result");
  try {
    const km = /^KL:([A-Za-z0-9]{10,40})$/.exec(String(raw).trim());
    if (km) {
      if ($("rb-s-quick").checked) { await quickStamp(km[1], out); return; }
      await showCustomer(km[1], out, true);
      buzz(120);
      return;
    }
    const code = parseCode(raw);
    if (!code) {
      out.innerHTML = scanCard("bad", "❌ To nie jest kod rabatowy", null, "Zeskanowano: " + esc(String(raw).slice(0, 40)));
      buzz([120, 60, 120]);
      return;
    }
    const matches = await lookupCode(code);
    const c = matches.find((x) => !couponState(x).off) || matches[0];
    if (!c) {
      out.innerHTML = scanCard("bad", "❌ Nie znaleziono kodu", null, "Kod: <b>" + esc(code) + "</b>");
      buzz([120, 60, 120]);
      return;
    }
    if (couponState(c).off) {
      const usedNote = c.used && c.usedAt ? "Wykorzystano: " + fmtDateTime(c.usedAt) : "";
      out.innerHTML = scanCard("bad", c.used ? "❌ Kod już wykorzystany" : "❌ Kod wygasł", c, usedNote);
      buzz([120, 60, 120]);
      return;
    }
    const r = await redeem(c.id);
    if (r.ok) {
      out.innerHTML = scanCard("ok", "✅ ZATWIERDZONE", c, "Kod został unieważniony. Nie da się go użyć ponownie.", true);
      buzz(200);
      scanHistPush(ownerName(c), "🎟 " + c.code);
      autoResume();
    } else {
      out.innerHTML = scanCard("bad", "❌ " + esc(r.reason), c, "");
      buzz([120, 60, 120]);
    }
  } finally {
    busy = false;
    out.scrollIntoView({ block: "nearest" });
  }
}

$("rb-s-start").addEventListener("click", startScanner);
$("rb-s-stop").addEventListener("click", stopScanner);
$("rb-s-result").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  if (b.dataset.act === "next") {
    lastRaw = "";
    if (custView && custView.target === $("rb-s-result")) custView = null;
    $("rb-s-result").innerHTML = "";
    resumeScan();
  } else if (b.dataset.act === "undo") {
    try {
      const ub = writeBatch(db);
      const uc = allCoupons.find((x) => x.id === b.dataset.id) || {};
      ub.update(doc(db, "coupons", b.dataset.id), { used: false, usedAt: null });
      ub.set(newLogRef(), logData("couponundo", { uid: uc.uid, name: uc.userEmail }, (uc.code || b.dataset.id) + " (cofnięcie po skanie)"));
      await ub.commit();
      $("rb-s-result").innerHTML = '<div class="rb-res"><div>↩️ Cofnięto. Kod znów jest aktywny.</div><div class="rb-actions"><button type="button" class="rb-btn small" data-act="next">Skanuj następny</button></div></div>';
    } catch (err) {
      console.error(err);
      setMsg(sMsg, errText(err), "err");
    }
  }
});
loadSite();
