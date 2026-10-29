#!/usr/bin/env python3
"""Generuje strony lokalne /pizza-<miejscowosc>/index.html oraz wpisy do sitemap.xml
i listę linków do stopki strony głównej. Uruchom z katalogu głównego repozytorium:
    python3 narzedzia/gen-lokalne.py
Dane miejscowości (gmina, odmiana) są w tablicy MIEJSCA poniżej."""
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://wloskarobota.eu"
TEL, TEL_SP = "668862396", "668 862 396"
MAIL = "radtom72@gmail.com"
DATE = "2026-10-29"

# (nazwa, slug, dopełniacz "do …", miejscownik "w …", gmina)
MIEJSCA = [
    ("Głuponie", "gluponie", "Głupon", "Głuponiach", "Kuślin"),
    ("Kuślin", "kuslin", "Kuślina", "Kuślinie", "Kuślin"),
    ("Trzcianka", "trzcianka", "Trzcianki", "Trzciance", "Kuślin"),
    ("Tomaszewo", "tomaszewo", "Tomaszewa", "Tomaszewie", "Kuślin"),
    ("Michorzewo", "michorzewo", "Michorzewa", "Michorzewie", "Kuślin"),
    ("Michorzewko", "michorzewko", "Michorzewka", "Michorzewku", "Kuślin"),
    ("Chraplewo", "chraplewo", "Chraplewa", "Chraplewie", "Kuślin"),
    ("Wymysłowo", "wymyslowo", "Wymysłowa", "Wymysłowie", "Kuślin"),
    ("Dąbrowa", "dabrowa", "Dąbrowy", "Dąbrowie", "Kuślin"),
    ("Dąbrowa Nowa", "dabrowa-nowa", "Dąbrowy Nowej", "Dąbrowie Nowej", "Kuślin"),
    ("Wąsowo", "wasowo", "Wąsowa", "Wąsowie", "Kuślin"),
    ("Krystianowo", "krystianowo", "Krystianowa", "Krystianowie", "Kuślin"),
    ("Zygmuntowo", "zygmuntowo", "Zygmuntowa", "Zygmuntowie", "Lwówek"),
    ("Marszewo", "marszewo", "Marszewa", "Marszewie", "Lwówek"),
    ("Łęczyce", "leczyce", "Łęczyc", "Łęczycach", "Opalenica"),
    ("Rudniki", "rudniki", "Rudnik", "Rudnikach", "Opalenica"),
    ("Jastrzębniki", "jastrzebniki", "Jastrzębnik", "Jastrzębnikach", "Opalenica"),
]
GM_LOC = {"Kuślin": "gminie Kuślin", "Lwówek": "gminie Lwówek", "Opalenica": "gminie Opalenica"}
esc = html.escape


def intro(n, gen, loc, gm):
    if n == "Głuponie":
        return (f"Nasza pizzeria mieści się w Głuponiach (Głuponie 103), więc do mieszkańców Głupon mamy najbliżej. "
                f"Możesz zamówić z dowozem albo odebrać pizzę osobiście prosto z pieca.")
    if gm == "Kuślin":
        return (f"{n} leży w gminie Kuślin, tej samej, w której działa nasza pizzeria w Głuponiach. "
                f"Dowozimy pizzę do {gen} i wszystko jest robione na zamówienie: pieczemy dopiero po Twoim telefonie.")
    return (f"{n} leży w {GM_LOC[gm]}, która sąsiaduje z gminą Kuślin, gdzie mamy pizzerię (Głuponie 103). "
            f"Dowozimy pizzę również do {gen}. Pieczemy dopiero po Twoim telefonie, więc dojeżdża do Ciebie świeża.")


def page(m):
    n, slug, gen, loc, gm = m
    url = f"{SITE}/pizza-{slug}/"
    same = [x for x in MIEJSCA if x[0] != n and x[4] == gm]
    other = [x for x in MIEJSCA if x[0] != n and x[4] != gm]
    link = lambda x: f'<a href="/pizza-{x[1]}/">{esc(x[0])}</a>'
    near = ", ".join(link(x) for x in same + other)
    title = f"Pizza {n} – dowóz z Włoskiej Roboty (Głuponie)"
    desc = (f"Pizza z dowozem do {gen}: Włoska Robota z Głupon. Pizza 30 cm z pieca, ciasto 24 h. "
            f"Zamówienia pod tel. {TEL_SP}, śr–pt 12–20, sob–nd 14–22.")
    q = [
        (f"Czy dowozicie pizzę do {gen}?", f"Tak, {n} jest na liście miejscowości, do których dowozimy. Zamówienie przyjmujemy telefonicznie pod numerem {TEL_SP}."),
        (f"Ile kosztuje dowóz do {gen}?", f"Koszt dowozu do {gen} zależy od cennika dowozu. Aktualną kwotę zobaczysz w sekcji „Dowóz” na stronie głównej i usłyszysz przy zamówieniu."),
        ("Jak zamówić?", f"Zadzwoń pod {TEL_SP} w godzinach otwarcia. Strona nie przyjmuje zamówień online. Zapłacisz gotówką lub kartą przy odbiorze albo dostawie."),
        ("W jakich godzinach pieczecie?", "Środa–piątek 12:00–20:00, sobota–niedziela 14:00–22:00. W poniedziałki i wtorki nie pracujemy. Zmiany (np. w święta) ogłaszamy na stronie głównej."),
    ]
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "Restaurant", "name": "Włoska Robota", "url": SITE + "/", "telephone": "+48" + TEL,
             "servesCuisine": ["Pizza", "Włoska"], "image": SITE + "/og-image-2.jpg",
             "address": {"@type": "PostalAddress", "streetAddress": "Głuponie 103", "addressLocality": "Głuponie", "postalCode": "64-316", "addressRegion": "wielkopolskie", "addressCountry": "PL"},
             "areaServed": {"@type": "Place", "name": n},
             "openingHoursSpecification": [
                 {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Wednesday", "Thursday", "Friday"], "opens": "12:00", "closes": "20:00"},
                 {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Saturday", "Sunday"], "opens": "14:00", "closes": "22:00"}]},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Włoska Robota", "item": SITE + "/"},
                {"@type": "ListItem", "position": 2, "name": f"Pizza {n}", "item": url}]},
            {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": a, "acceptedAnswer": {"@type": "Answer", "text": b}} for a, b in q]},
        ],
    }
    faq = "".join(f"<h3>{esc(a)}</h3><p>{esc(b)}</p>" for a, b in q)
    return f'''<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="index,follow"><link rel="canonical" href="{url}">
<meta name="theme-color" content="#CD212A">
<meta property="og:type" content="website"><meta property="og:locale" content="pl_PL"><meta property="og:site_name" content="Włoska Robota">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/og-image-2.jpg">
<link rel="icon" href="/favicon.ico">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<style>
:root{{--bg:#f7f7f4;--card:#fff;--text:#1a1a1a;--muted:#666;--green:#009246;--red:#CD212A;--line:rgba(127,127,127,.25)}}
@media (prefers-color-scheme:dark){{:root{{--bg:#121216;--card:#1e1e24;--text:#f3f3f5;--muted:#a2a2b0}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}}
.bar{{height:6px;background:linear-gradient(90deg,var(--green) 0 33.3%,#fff 33.3% 66.6%,var(--red) 66.6%)}}
main{{max-width:760px;margin:0 auto;padding:24px 16px 60px}}
.card{{background:var(--card);border-radius:16px;padding:22px 20px;margin-bottom:16px}}
h1{{margin:0 0 8px;font-size:27px;line-height:1.2}}h2{{margin:0 0 8px;font-size:20px}}h3{{margin:16px 0 2px;font-size:16px}}p,li{{margin:6px 0}}ul{{padding-left:22px}}
.muted{{color:var(--muted);font-size:14px}}a{{color:var(--green)}}
.back{{display:inline-block;margin-bottom:14px;text-decoration:none;font-weight:600}}
.call{{display:inline-block;margin:10px 8px 4px 0;padding:12px 22px;border-radius:50px;background:linear-gradient(135deg,var(--green),var(--red));color:#fff;font-weight:700;text-decoration:none}}
.ghost{{display:inline-block;margin:10px 0 4px;padding:11px 20px;border-radius:50px;border:2px solid var(--green);color:var(--green);font-weight:700;text-decoration:none}}
.facts{{display:grid;gap:12px;grid-template-columns:1fr 1fr}}@media(max-width:560px){{.facts{{grid-template-columns:1fr}}}}
.fact{{border:1px solid var(--line);border-radius:12px;padding:12px 14px}}.fact b{{display:block;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}}
.near a{{white-space:nowrap}}
</style>
<link rel="stylesheet" href="/motyw.css?v=1">
<script src="/motyw.js?v=1" defer></script>
</head><body><div class="bar"></div><main>
<a class="back" href="/">← Strona Włoskiej Roboty</a>
<div class="card">
<h1>Pizza z dowozem do {esc(gen)}</h1>
<p>{esc(intro(n, gen, loc, gm))}</p>
<p><a class="call" href="tel:{TEL}">📞 Zamów: {TEL_SP}</a><a class="ghost" href="/#menu">Zobacz menu</a></p>
</div>

<div class="card">
<h2>Dowóz i godziny</h2>
<div class="facts">
<div class="fact"><b>Dowóz do {esc(gen)}</b><span id="dow">Koszt dowozu podajemy przy zamówieniu oraz w sekcji <a href="/#dowoz">Dowóz</a> na stronie głównej.</span></div>
<div class="fact"><b>Godziny otwarcia</b><span id="godz">śr–pt 12:00–20:00<br>sob–nd 14:00–22:00<br>pon–wt nieczynne</span></div>
<div class="fact"><b>Zamówienia</b>Telefonicznie: <a href="tel:{TEL}">{TEL_SP}</a>. Płatność gotówką lub kartą przy odbiorze i dostawie.</div>
<div class="fact"><b>Odbiór osobisty</b>Głuponie 103, 64-316 Kuślin · <a href="https://www.google.com/maps/dir/?api=1&amp;destination=G%C5%82uponie+103%2C+Ku%C5%9Blin%2C+Wielkopolska" rel="noopener">trasa w Mapach Google</a></div>
</div>
<p class="muted">W święta godziny mogą się różnić. Aktualne informacje są zawsze na <a href="/">stronie głównej</a>.</p>
</div>

<div class="card">
<h2>Pizza, którą dowozimy {esc(loc and "do " + gen)}</h2>
<p>Pizzę o średnicy 30 cm pieczemy w piecu w wysokiej temperaturze, a ciasto fermentuje minimum 24 godziny, dzięki czemu jest lekkie i chrupiące. Na sosie z pomidorów San Marzano i mozzarelli fior di latte robimy m.in. Margheritę, Prosciutto, Cotto, Pepperoni czy Quattro Formaggi. Są też opcje wegetariańskie, sosy, frytki i makarony. Pełne menu z cenami: <a href="/#menu">wloskarobota.eu/#menu</a>.</p>
<p>Czas przygotowania zależy od liczby zamówień. Liczymy ok. 5 minut na pizzę, a przy dostawie dochodzi czas dojazdu. Orientacyjny czas podajemy przy zamówieniu. Więcej w <a href="/zasady-zamowien.html">zasadach zamówień i dowozu</a>.</p>
</div>

<div class="card">
<h2>Jak zamówić pizzę {esc("w " + loc)}</h2>
<ol>
<li>Zadzwoń: <a href="tel:{TEL}">{TEL_SP}</a> w godzinach otwarcia.</li>
<li>Powiedz, co chcesz zamówić, i podaj adres w miejscowości {esc(n)}.</li>
<li>Usłyszysz cenę i orientacyjny czas. Zapłacisz przy dostawie gotówką lub kartą.</li>
</ol>
<p class="muted">Masz konto we Włoskiej Robocie? Kod rabatowy lub kartę lojalnościową zgłoś przy zamówieniu.</p>
</div>

<div class="card">
<h2>Najczęstsze pytania</h2>
{faq}
</div>

<div class="card near">
<h2>Dowozimy też do</h2>
<p>{near}</p>
</div>

<p class="muted">Pizzeria „Włoska Robota”, Głuponie 103, 64-316 Kuślin · tel. <a href="tel:{TEL}">{TEL_SP}</a> · <a href="mailto:{MAIL}">{MAIL}</a><br>
<a href="/zasady-zamowien.html">Zasady zamówień</a> · <a href="/regulamin.html">Regulamin</a> · <a href="/polityka-prywatnosci.html">Polityka prywatności</a></p>
</main>
<script>
/* Aktualny koszt dowozu i godziny z ustawień strony (panel admina). Gdy się nie uda, zostaje tekst powyżej. */
(function(){{
var NAME={json.dumps(n, ensure_ascii=False)},GEN={json.dumps(gen, ensure_ascii=False)};
var num=function(v){{return v&&(v.doubleValue!=null?Number(v.doubleValue):v.integerValue!=null?Number(v.integerValue):null)}};
var zl=function(x){{return (Math.round(x*100)%100===0?String(Math.round(x)):x.toFixed(2).replace('.',','))+' zł'}};
var hm=function(m){{return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}};
fetch('https://firestore.googleapis.com/v1/projects/wloskarobota-4c044/databases/(default)/documents/site/config').then(function(r){{return r.ok?r.json():null}}).then(function(j){{
 var f=j&&j.fields;if(!f)return;
 try{{
  var ps=f.delivery.mapValue.fields.places.arrayValue.values||[],me=null;
  ps.forEach(function(p){{var x=p.mapValue.fields;if(x.name&&x.name.stringValue&&x.name.stringValue.toLowerCase()===NAME.toLowerCase())me=x}});
  var d=document.getElementById('dow');
  if(me){{var fee=num(me.fee),min=num(me.min),fr=num(me.freeFrom),t=[];
   if(fee!=null)t.push(fee===0?'dowóz gratis':'koszt dowozu '+zl(fee));
   if(min!=null)t.push('minimalne zamówienie '+zl(min));
   if(fee!==0&&fr!=null)t.push('dowóz gratis od '+zl(fr));
   if(t.length)d.textContent=t.join(' · ')}}
  else if(ps.length){{d.textContent='Aktualnie nie dowozimy do tej miejscowości. Zadzwoń, a sprawdzimy, czy da się to zorganizować.'}}
 }}catch(e){{}}
 try{{
  var dy=f.hours.mapValue.fields.days.arrayValue.values;if(dy.length!==7)return;
  var N=['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'],ord=[1,2,3,4,5,6,0],o=[];
  ord.forEach(function(i){{var m=dy[i].mapValue,x=m&&m.fields;o.push(N[i]+': '+(x?hm(num(x.o))+'–'+hm(num(x.c)):'nieczynne'))}});
  document.getElementById('godz').innerHTML=o.join('<br>');
 }}catch(e){{}}
}}).catch(function(){{}});
}})();
</script>
</body></html>
'''


def main():
    for m in MIEJSCA:
        d = os.path.join(ROOT, f"pizza-{m[1]}")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(page(m))
    # sitemap
    p = os.path.join(ROOT, "sitemap.xml")
    s = open(p, encoding="utf-8").read()
    s = re.sub(r"\s*<url>\s*<loc>https://wloskarobota\.eu/pizza-[^<]*</loc>.*?</url>", "", s, flags=re.S)
    add = "".join(f"\n  <url>\n    <loc>{SITE}/pizza-{m[1]}/</loc>\n    <lastmod>{DATE}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>" for m in MIEJSCA)
    s = s.replace("</urlset>", add + "\n</urlset>")
    open(p, "w", encoding="utf-8").write(s)
    # stopka strony głównej
    p = os.path.join(ROOT, "index.html")
    s = open(p, encoding="utf-8").read()
    links = " · ".join(f'<a href="/pizza-{m[1]}/" style="color:inherit;opacity:.8">{esc(m[0])}</a>' for m in MIEJSCA)
    block = f'<!--lokalne--><p style="margin-top:.6rem;font-size:.85rem;line-height:1.8"><b>Dowozimy pizzę do:</b> {links}</p><!--/lokalne-->'
    if "<!--lokalne-->" in s:
        s = re.sub(r"<!--lokalne-->.*?<!--/lokalne-->", lambda _: block, s, flags=re.S)
    else:
        anchor = '<p style="margin-top:.6rem"><button type="button" class="pwa-btn"'
        assert anchor in s
        s = s.replace(anchor, block + "\n      " + anchor, 1)
    open(p, "w", encoding="utf-8").write(s)
    print("OK", len(MIEJSCA), "stron")


if __name__ == "__main__":
    main()
