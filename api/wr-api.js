/*  Włoska Robota – API (bez serwera)
 *  Moduł ES: działa w przeglądarce (na dowolnej stronie) i w Node 18+.
 *    import { getMenu, getHours, isOpenNow, getNotice, getInfo } from "https://wloskarobota.eu/api/wr-api.js";
 *  Dane bazowe: api/menu.json, api/info.json (ze strony). Na wierzch nakładane jest to, co właściciel
 *  ustawił w panelu admina (ceny, niedostępne dziś, ukryte, dodatkowe produkty, godziny, dni wolne,
 *  komunikat, miejscowości dowozu) – pobierane na żywo z publicznego dokumentu site/config.
 *  Tylko odczyt. Gdy dane na żywo są niedostępne, zwracane są dane bazowe (pole live: false).
 */
const SITE = "https://wloskarobota.eu";
const FS = "https://firestore.googleapis.com/v1/projects/wloskarobota-4c044/databases/(default)/documents/site/config";
const TTL = 60000;
const TZ = "Europe/Warsaw";
const cache = {};
async function once(key, fn) {
  const c = cache[key];
  if (c && Date.now() - c.t < TTL) return c.v;
  const v = await fn();
  cache[key] = { t: Date.now(), v };
  return v;
}
const json = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url + " → " + r.status); return r.json(); };

/* Firestore REST → zwykłe obiekty */
export function fsDecode(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fsDecode);
  if ("mapValue" in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fsDecode(x); return o; }
  return null;
}
async function live() {
  return once("live", async () => {
    try { const d = await json(FS); return fsDecode({ mapValue: { fields: d.fields || {} } }) || {}; }
    catch (_) { return null; }
  });
}
const base = (name) => once(name, () => json(SITE + "/api/" + name + ".json"));
export const getInfo = async () => {
  const [i, l] = await Promise.all([base("info"), live()]);
  const places = l && l.delivery && Array.isArray(l.delivery.places) ? l.delivery.places : i.delivery.places;
  return { ...i, delivery: { places }, live: !!l };
};

/* Menu: baza + ceny, ukrycia, dostępność i własne produkty z panelu */
export async function getMenu({ includeHidden = false } = {}) {
  const [m, l] = await Promise.all([base("menu"), live()]);
  const cfg = l || {};
  const prices = cfg.prices || {}, hidden = cfg.hidden || {}, unavail = cfg.unavailable || {};
  const priceNum = (t) => { const x = /\d+(?:[.,]\d+)?/.exec(String(t || "")); return x ? parseFloat(x[0].replace(",", ".")) : null; };
  let items = m.items.map((it) => {
    const pt = prices[it.key] || it.priceText;
    return { ...it, price: priceNum(pt), priceText: pt, available: !unavail[it.key], hidden: !!hidden[it.key], custom: false };
  });
  const cats = m.categories.map((c) => c.id);
  (Array.isArray(cfg.products) ? cfg.products : []).forEach((p) => {
    if (!p || !p.name || !p.price) return;
    const cat = cats.includes(p.cat) ? p.cat : "dodatki", name = String(p.name);
    items.push({ id: "wlasny-" + (p.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")), name, key: name.toLowerCase(), category: cat, categories: [cat], price: priceNum(p.price), priceText: String(p.price),
      description: String(p.desc || ""), tags: Array.isArray(p.tags) ? p.tags : [], available: !p.unavail, hidden: false, custom: true });
  });
  if (!includeHidden) items = items.filter((x) => !x.hidden);
  return { name: m.name, currency: m.currency, url: m.url, categories: m.categories, items, live: !!l };
}

/* Święta ustawowo wolne (z Wielkanocą liczoną algorytmem Gaussa) – te same klucze co w panelu */
function holidays(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const mon = Math.floor((hh + l - 7 * m + 114) / 31), day = ((hh + l - 7 * m + 114) % 31) + 1;
  const iso = (dt) => dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
  const easter = new Date(y, mon - 1, day), at = (n) => { const x = new Date(easter); x.setDate(x.getDate() + n); return x; }, fx = (mm, dd) => new Date(y, mm - 1, dd);
  const list = [["ny", "Nowy Rok", fx(1, 1)], ["tk", "Trzech Króli", fx(1, 6)], ["wn", "Wielkanoc", easter], ["pw", "Poniedziałek Wielkanocny", at(1)], ["m1", "Święto Pracy", fx(5, 1)], ["m3", "Święto Konstytucji 3 Maja", fx(5, 3)],
    ["zs", "Zielone Świątki", at(49)], ["bc", "Boże Ciało", at(60)], ["wa", "Wniebowzięcie NMP", fx(8, 15)], ["ws", "Wszystkich Świętych", fx(11, 1)], ["nn", "Narodowe Święto Niepodległości", fx(11, 11)]];
  if (y >= 2025) list.push(["wi", "Wigilia Bożego Narodzenia", fx(12, 24)]);
  list.push(["b1", "Boże Narodzenie (1. dzień)", fx(12, 25)], ["b2", "Boże Narodzenie (2. dzień)", fx(12, 26)]);
  return list.map(([key, name, dt]) => ({ key, name, date: iso(dt) }));
}
const ALL_HOL = ["ny", "tk", "wn", "pw", "m1", "m3", "zs", "bc", "wa", "ws", "nn", "wi", "b1", "b2"];
const fm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

/* Godziny: dni tygodnia (0 = niedziela) + dni wolne (z panelu i święta) */
export async function getHours() {
  const [i, l] = await Promise.all([base("info"), live()]);
  const h = l && l.hours && Array.isArray(l.hours.days) && l.hours.days.length === 7 ? l.hours : null;
  const days = h ? h.days.map((d, n) => (d && Number.isInteger(d.o) && Number.isInteger(d.c) && d.o < d.c
    ? { day: n, name: i.hours[n].name, open: fm(d.o), close: fm(d.c), closed: false } : { day: n, name: i.hours[n].name, open: null, close: null, closed: true })) : i.hours;
  const on = h && Array.isArray(h.hol) ? h.hol : ALL_HOL, y0 = new Date().getFullYear();
  const names = {};
  [y0, y0 + 1].forEach((y) => holidays(y).forEach((x) => { if (on.includes(x.key)) names[x.date] = x.name; }));
  const closedDates = [...new Set([...(h && Array.isArray(h.closed) ? h.closed : []), ...Object.keys(names)])].sort();
  return { timezone: TZ, days, closedDates, holidayNames: names, live: !!h };
}

/* Czy teraz otwarte? date = Date (domyślnie teraz). Czas liczony w strefie Europe/Warsaw. */
export async function isOpenNow(date = new Date()) {
  const H = await getHours();
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(date).map((x) => [x.type, x.value]));
  const iso = p.year + "-" + p.month + "-" + p.day, min = (Number(p.hour) % 24) * 60 + Number(p.minute);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), d = H.days[wd];
  const toMin = (s) => { const [a, b] = s.split(":").map(Number); return a * 60 + b; };
  if (H.closedDates.includes(iso)) return { open: false, reason: H.holidayNames[iso] ? "holiday" : "closed-day", note: H.holidayNames[iso] || "dzień wolny", live: H.live };
  if (!d || d.closed) return { open: false, reason: "closed-weekday", live: H.live };
  const o = toMin(d.open), c = toMin(d.close);
  if (min >= o && min < c) return { open: true, closesAt: d.close, live: H.live };
  return { open: false, reason: min < o ? "before-opening" : "after-closing", opensAt: min < o ? d.open : null, live: H.live };
}

/* Aktualny komunikat z góry strony (ręczny albo z kalendarza akcji), albo null */
export async function getNotice(now = new Date()) {
  const l = await live();
  if (!l) return null;
  const t = now.getTime(), n = l.notice;
  if (n && n.active && n.text && (!n.until || n.until > t) && (!n.from || n.from <= t)) return { text: n.text, type: n.type || "info" };
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((x) => [x.type, x.value]));
  const min = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  const hm = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const c = (Array.isArray(l.campaigns) ? l.campaigns : []).find((x) => {
    if (!x || !x.active || !x.text) return false;
    if ((x.from && t < x.from) || (x.until && t > x.until)) return false;
    const a = hm(x.hFrom), b = hm(x.hTo);
    return a !== null && b !== null ? (a <= b ? min >= a && min < b : min >= a || min < b) : true;
  });
  return c ? { text: c.text, type: c.type || "info" } : null;
}
