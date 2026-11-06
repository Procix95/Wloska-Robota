#!/usr/bin/env python3
"""Generuje api/menu.json i api/info.json z index.html (menu, dane firmy).
Uruchom po każdej zmianie menu/cen/godzin w index.html:  python3 narzedzia/gen-api.py
Aktualne dane z panelu admina (ceny, niedostępne produkty, godziny, komunikat) pobiera na żywo api/wr-api.js."""
import json, re, datetime, pathlib
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / "index.html").read_text(encoding="utf-8")
BASE = "https://wloskarobota.eu"
CATS = [("klasyczne", "Klasyczne"), ("miesne", "Mięsne"), ("vege", "Wege"), ("sosy", "Sosy"), ("makarony", "Makarony"), ("dodatki", "Dodatki")]

class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.items = []; s.cur = None; s.field = None; s.depth = 0
    def handle_starttag(s, tag, a):
        a = dict(a); c = a.get("class", "").split()
        if tag == "div" and "menu-item" in c:
            s.cur = {"cat": (a.get("data-category") or "").split(), "name": "", "price": "", "desc": "", "tags": []}
        elif s.cur is not None:
            if "menu-item-title" in c: s.field = "name"
            elif "menu-item-price" in c: s.field = "price"
            elif "menu-item-desc" in c: s.field = "desc"
            elif "size-badge" in c: s.field = "tag"
    def handle_data(s, d):
        if s.cur is None or not s.field: return
        if s.field == "tag": s.cur["tags"].append(d.strip())
        else: s.cur[s.field] += d
    def handle_endtag(s, tag):
        if s.field and tag in ("h3", "span", "p"): s.field = None
        if tag == "div" and s.cur is not None and s.cur["name"] and s.cur["price"]:
            s.items.append(s.cur); s.cur = None

p = P(); p.feed(html[html.index('id="menuGrid"'):html.index('id="gallery"')])
def slug(t):
    t = t.lower().translate(str.maketrans("ąćęłńóśźż", "acelnoszz"))
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")
items = []
for it in p.items:
    name = re.sub(r"^\s*\d+\.\s*", "", it["name"]).strip()
    price_text = it["price"].replace(" ", " ").strip()
    m = re.search(r"\d+(?:[.,]\d+)?", price_text)
    items.append({
        "id": slug(name), "name": name.title() if name.isupper() else name,
        "key": name.lower(),  # tak panel admina nazywa produkt (klucz cen/dostępności)
        "category": it["cat"][0] if it["cat"] else "", "categories": it["cat"],
        "price": float(m.group(0).replace(",", ".")) if m else None, "priceText": price_text,
        "description": re.sub(r"\s+", " ", it["desc"]).strip(), "tags": it["tags"],
    })
menu = {
    "name": "Włoska Robota – menu", "url": BASE + "/#menu", "currency": "PLN",
    "note": "Stan bazowy ze strony. Ceny, dostępność i dodatkowe produkty ustawione w panelu admina są w api/wr-api.js (getMenu).",
    "updated": datetime.date.today().isoformat(),
    "categories": [{"id": i, "name": n} for i, n in CATS], "items": items,
}
(ROOT / "api" / "menu.json").write_text(json.dumps(menu, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

deliv = ["Głuponie", "Trzcianka", "Tomaszewo", "Michorzewo", "Kuślin", "Zygmuntowo", "Chraplewo", "Marszewo", "Michorzewko", "Wymysłowo", "Dąbrowa", "Łęczyce", "Dąbrowa Nowa", "Rudniki", "Wąsowo", "Jastrzębniki", "Krystianowo"]
# godziny domyślne (indeks 0 = niedziela), minuty od północy; muszą się zgadzać z WR_DEF_HOURS w index.html
dm = re.search(r"window\.WR_DEF_HOURS = (\[.*?\]);", html).group(1)
days = json.loads(re.sub(r"(\w+):", r'"\1":', dm))
names = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"]
fm = lambda m: "%02d:%02d" % (m // 60, m % 60)
hours = [{"day": i, "name": names[i], "open": fm(d["o"]) if d else None, "close": fm(d["c"]) if d else None, "closed": d is None} for i, d in enumerate(days)]
info = {
    "name": "Włoska Robota", "type": "Pizzeria", "url": BASE + "/", "description": "Pizza 30 cm z pieca, ciasto fermentowane 24 h, dowóz do okolicznych miejscowości.",
    "address": {"street": "Głuponie 103", "postalCode": "64-316", "city": "Kuślin", "locality": "Głuponie", "region": "wielkopolskie", "country": "PL"},
    "phone": "+48668862396", "email": "radtom72@gmail.com", "owner": "RadTom, Radosław Jaskuła",
    "orders": "telefonicznie (zamówień online nie ma)",
    "links": {"menu": BASE + "/#menu", "facebook": "https://www.facebook.com/profile.php?id=61591198263542", "googleReviews": "https://g.page/r/CUq2_T6CQcy5EAE",
              "map": "https://www.google.com/maps/search/?api=1&query=W%C5%82oska+Robota+G%C5%82uponie+103+Ku%C5%9Blin", "llms": BASE + "/llms.txt"},
    "delivery": {"places": deliv}, "timezone": "Europe/Warsaw",
    "hoursNote": "Godziny bazowe (domyślne). Aktualne godziny i dni wolne ustawia właściciel w panelu: api/wr-api.js (getHours, isOpenNow).",
    "hours": hours, "updated": datetime.date.today().isoformat(),
}
(ROOT / "api" / "info.json").write_text(json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("menu:", len(items), "pozycji; info OK")
