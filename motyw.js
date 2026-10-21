/* Włoska Robota — silnik motywów sezonowych (wspólny dla strony głównej i podstron).
   Wystawia window.WRTheme: THEMES, list, auto(), label(), apply(), easter().
   Zmiana motywu: panel admina → Konto → Strona → Motyw sezonowy. */
(function () {
  "use strict";

  /* ---------- dane motywów ----------
     c1/c2   – kolory przewodnie            grad – gradient (tytuły, przyciski)
     bar     – pasek u góry / na kartach    icons – spadające ozdoby (dir:"up" = lecą w górę)
     card    – 2 emotki na rogach kart menu title – emotki przy tytułach sekcji
     row     – rząd emotek (baner w hero, stopka, podstrony)      logo – emotka przy logo
     pat     – 2 emotki wzoru tła sekcji    tint – barwa nałożona na hero */
  var THEMES = {
    halloween: {
      label: "🎃 Halloween", range: "18.10 – 31.10",
      greet: "🎃 Happy Halloween we Włoskiej Robocie!",
      icons: ["🎃", "🦇", "👻", "🕸️", "🕷️", "💀"], dir: "down",
      c1: "#ff7a00", c2: "#7b2fb5", grad: "linear-gradient(90deg,#ff7a00,#8b3fc7)",
      bar: "repeating-linear-gradient(90deg,#ff7a00 0 28px,#2b1140 28px 40px,#7b2fb5 40px 68px,#2b1140 68px 80px)",
      card: ["🎃", "👻"], title: ["🎃", "🦇"], row: "🎃 🦇 👻 🕸️ 🕷️ 💀 🦇 🎃", logo: "🎃",
      pat: ["🦇", "🎃"], tint: "rgba(107,47,160,.55)", tint2: "rgba(255,122,0,.35)"
    },
    niepodleglosc: {
      label: "🦅 Święto Niepodległości", range: "9.11 – 11.11",
      greet: "🦅 Wszystkiego dobrego w Dniu Niepodległości!",
      icons: ["❤️", "🤍", "🦅", "✨", "❤️", "🤍"], dir: "down",
      c1: "#dc143c", c2: "#8f0f27", grad: "linear-gradient(90deg,#dc143c,#8f0f27)",
      bar: "linear-gradient(180deg,#fff 0 50%,#dc143c 50% 100%)",
      card: ["🦅", "❤️"], title: ["🦅", "🦅"], row: "🤍 ❤️ 🦅 🤍 ❤️ 🦅 🤍 ❤️", logo: "🦅",
      pat: ["🦅", "❤️"], tint: "rgba(220,20,60,.5)", tint2: "rgba(255,255,255,.25)"
    },
    andrzejki: {
      label: "🔮 Andrzejki", range: "24.11 – 30.11",
      greet: "🔮 Andrzejki! Wróżymy z… pizzy 🍕",
      icons: ["🔮", "🕯️", "✨", "💫", "🥂", "👠"], dir: "down",
      c1: "#7b3fe4", c2: "#d4af37", grad: "linear-gradient(90deg,#7b3fe4,#d4af37)",
      bar: "repeating-linear-gradient(90deg,#7b3fe4 0 30px,#d4af37 30px 44px,#2a1a5e 44px 74px,#d4af37 74px 88px)",
      card: ["🔮", "🕯️"], title: ["🔮", "✨"], row: "🔮 🕯️ ✨ 💫 🥂 💫 ✨ 🔮", logo: "🔮",
      pat: ["✨", "🔮"], tint: "rgba(80,40,160,.55)", tint2: "rgba(212,175,55,.3)"
    },
    mikolaj: {
      label: "🎅 Mikołajki / Boże Narodzenie", range: "1.12 – 26.12",
      greet: "🎄 Wesołych Świąt!",
      icons: ["❄️", "❄️", "🎄", "⭐", "🎁", "🎅", "❄️"], dir: "down",
      c1: "#c8102e", c2: "#1b8a3a", grad: "linear-gradient(90deg,#c8102e,#1b8a3a)",
      bar: "repeating-linear-gradient(90deg,#c8102e 0 24px,#fff 24px 36px,#1b8a3a 36px 60px,#fff 60px 72px)",
      card: ["🎄", "🎁"], title: ["🎄", "🎅"], row: "🎄 🎁 ❄️ 🎅 ⭐ 🎅 ❄️ 🎁 🎄", logo: "🎅",
      pat: ["❄️", "⭐"], tint: "rgba(200,16,46,.5)", tint2: "rgba(27,138,58,.3)"
    },
    sylwester: {
      label: "🎆 Sylwester / Nowy Rok", range: "27.12 – 6.01",
      greet: "🎆 Szczęśliwego Nowego Roku!",
      icons: ["🎆", "🥂", "✨", "🎇", "🍾", "🎉"], dir: "up",
      c1: "#c9a227", c2: "#5b3fc4", grad: "linear-gradient(90deg,#d4af37,#6a4cc9)",
      bar: "repeating-linear-gradient(90deg,#d4af37 0 30px,#1a1440 30px 42px,#6a4cc9 42px 72px,#1a1440 72px 84px)",
      card: ["🥂", "🎆"], title: ["🎆", "🥂"], row: "🥂 🎆 ✨ 🍾 🎉 🍾 ✨ 🎆 🥂", logo: "🥂",
      pat: ["✨", "🎆"], tint: "rgba(40,20,110,.6)", tint2: "rgba(212,175,55,.35)"
    },
    zima: {
      label: "❄️ Zima", range: "7.01 – 6.02",
      greet: "❄️ Zimowa pizza prosto z pieca – ogrzej się!",
      icons: ["❄️", "❄️", "⛄", "🧣", "☕", "✨"], dir: "down",
      c1: "#2a7fd4", c2: "#5fb6f5", grad: "linear-gradient(90deg,#2a7fd4,#7fd0ff)",
      bar: "repeating-linear-gradient(90deg,#2a7fd4 0 26px,#fff 26px 38px,#8fd3ff 38px 64px,#fff 64px 76px)",
      card: ["⛄", "❄️"], title: ["❄️", "⛄"], row: "❄️ ⛄ 🧣 ☕ ❄️ ☕ 🧣 ⛄ ❄️", logo: "🧣",
      pat: ["❄️", "✨"], tint: "rgba(30,90,170,.55)", tint2: "rgba(180,225,255,.3)"
    },
    tlusty: {
      label: "🍩 Tłusty Czwartek", range: "jeden dzień, wg kalendarza",
      greet: "🍩 Tłusty Czwartek! Pączek? My mamy pizzę 😉",
      icons: ["🍩", "🍩", "🍕", "✨", "🍩"], dir: "down",
      c1: "#d9822b", c2: "#c2185b", grad: "linear-gradient(90deg,#d9822b,#c2185b)",
      bar: "repeating-linear-gradient(90deg,#d9822b 0 26px,#fff4d6 26px 38px,#c2185b 38px 64px,#fff4d6 64px 76px)",
      card: ["🍩", "🍕"], title: ["🍩", "🍩"], row: "🍩 🍕 🍩 🍕 🍩 🍕 🍩 🍕", logo: "🍩",
      pat: ["🍩", "🍕"], tint: "rgba(194,24,91,.45)", tint2: "rgba(217,130,43,.35)"
    },
    pizza: {
      label: "🍕 Światowy Dzień Pizzy", range: "9.02",
      greet: "🍕 Dziś Światowy Dzień Pizzy – świętujemy razem!",
      icons: ["🍕", "🍕", "🍅", "🧀", "🌿", "🍕"], dir: "down",
      c1: "#cd212a", c2: "#009246", grad: "linear-gradient(90deg,#009246,#cd212a)",
      bar: "linear-gradient(90deg,#009246 0 33.3%,#fff 33.3% 66.6%,#cd212a 66.6%)",
      card: ["🍕", "🍅"], title: ["🍕", "🍕"], row: "🍕 🍅 🧀 🌿 🍕 🌿 🧀 🍅 🍕", logo: "🍕",
      pat: ["🍕", "🍅"], tint: "rgba(205,33,42,.5)", tint2: "rgba(0,146,70,.35)"
    },
    walentynki: {
      label: "💘 Walentynki", range: "7.02 – 14.02",
      greet: "💘 Walentynki w Włoskiej Robocie – pizza dla dwojga!",
      icons: ["❤️", "💕", "💗", "🌹", "💘", "💖"], dir: "up",
      c1: "#ff4d79", c2: "#c2185b", grad: "linear-gradient(90deg,#ff4d79,#c2185b)",
      bar: "repeating-linear-gradient(90deg,#ff4d79 0 26px,#ffd3e0 26px 38px,#c2185b 38px 64px,#ffd3e0 64px 76px)",
      card: ["❤️", "🌹"], title: ["💘", "💘"], row: "❤️ 💕 🌹 💗 💘 💗 🌹 💕 ❤️", logo: "💘",
      pat: ["💕", "🌹"], tint: "rgba(255,77,121,.5)", tint2: "rgba(194,24,91,.35)"
    },
    kobiet: {
      label: "🌷 Dzień Kobiet", range: "7.03 – 8.03",
      greet: "🌷 Wszystkiego dobrego w Dniu Kobiet!",
      icons: ["🌷", "🌸", "💐", "🌹", "🌼", "🌷"], dir: "down",
      c1: "#d6336c", c2: "#f06595", grad: "linear-gradient(90deg,#d6336c,#f783ac)",
      bar: "repeating-linear-gradient(90deg,#d6336c 0 26px,#ffe3ee 26px 38px,#f06595 38px 64px,#ffe3ee 64px 76px)",
      card: ["🌷", "💐"], title: ["🌷", "🌸"], row: "🌷 🌸 💐 🌹 🌼 🌹 💐 🌸 🌷", logo: "🌷",
      pat: ["🌸", "🌷"], tint: "rgba(214,51,108,.45)", tint2: "rgba(247,131,172,.3)"
    },
    wielkanoc: {
      label: "🐣 Wielkanoc", range: "tydzień przed Wielkanocą do Lanego Poniedziałku",
      greet: "🐣 Wesołych Świąt Wielkanocnych!",
      icons: ["🐣", "🐰", "🥚", "🌷", "🌼", "🐇", "🥚"], dir: "down",
      c1: "#6aa300", c2: "#f2b705", grad: "linear-gradient(90deg,#6aa300,#f2b705)",
      bar: "repeating-linear-gradient(90deg,#7cb518 0 26px,#fff6c9 26px 38px,#f2b705 38px 64px,#fff6c9 64px 76px)",
      card: ["🐣", "🥚"], title: ["🐣", "🐰"], row: "🐣 🥚 🐰 🌷 🌼 🌷 🐰 🥚 🐣", logo: "🐰",
      pat: ["🥚", "🌼"], tint: "rgba(106,163,0,.45)", tint2: "rgba(242,183,5,.35)"
    },
    majowka: {
      label: "☀️ Majówka", range: "1.05 – 3.05",
      greet: "☀️ Majówka z Włoską Robotą – pizza na piknik!",
      icons: ["☀️", "🧺", "🌿", "🍕", "🦋", "🌼"], dir: "down",
      c1: "#e8890c", c2: "#2e9e4f", grad: "linear-gradient(90deg,#f59e0b,#2e9e4f)",
      bar: "repeating-linear-gradient(90deg,#f59e0b 0 26px,#fff 26px 38px,#2e9e4f 38px 64px,#fff 64px 76px)",
      card: ["🧺", "☀️"], title: ["☀️", "🌿"], row: "☀️ 🧺 🌿 🍕 🦋 🍕 🌿 🧺 ☀️", logo: "☀️",
      pat: ["🌼", "🦋"], tint: "rgba(245,158,11,.4)", tint2: "rgba(46,158,79,.35)"
    },
    matki: {
      label: "💐 Dzień Matki", range: "24.05 – 26.05",
      greet: "💐 Dla Mamy – najlepsze życzenia w Dniu Matki!",
      icons: ["💐", "💖", "🌸", "🌷", "💕", "🌺"], dir: "up",
      c1: "#e0518a", c2: "#f4a6c1", grad: "linear-gradient(90deg,#e0518a,#f7a8c8)",
      bar: "repeating-linear-gradient(90deg,#e0518a 0 26px,#fff0f6 26px 38px,#f4a6c1 38px 64px,#fff0f6 64px 76px)",
      card: ["💐", "💖"], title: ["💐", "🌸"], row: "💐 🌸 💖 🌷 🌺 🌷 💖 🌸 💐", logo: "💐",
      pat: ["🌸", "💖"], tint: "rgba(224,81,138,.45)", tint2: "rgba(247,168,200,.3)"
    },
    dziecka: {
      label: "🎈 Dzień Dziecka", range: "30.05 – 1.06",
      greet: "🎈 Wszystkiego pizzowego w Dniu Dziecka!",
      icons: ["🎈", "🎉", "🍕", "🧸", "🍭", "🎠", "🎈"], dir: "up",
      c1: "#f2683c", c2: "#2f95e8", grad: "linear-gradient(90deg,#f2683c,#2f95e8)",
      bar: "repeating-linear-gradient(90deg,#f2683c 0 22px,#ffd43b 22px 44px,#2f95e8 44px 66px,#51cf66 66px 88px)",
      card: ["🎈", "🧸"], title: ["🎈", "🎉"], row: "🎈 🎉 🍕 🧸 🍭 🧸 🍕 🎉 🎈", logo: "🎈",
      pat: ["🎈", "🍭"], tint: "rgba(47,149,232,.4)", tint2: "rgba(242,104,60,.35)"
    },
    lato: {
      label: "🏖️ Lato / Wakacje", range: "22.06 – 31.08",
      greet: "☀️ Wakacyjne lato z pizzą prosto z pieca!",
      icons: ["☀️", "🌴", "🍉", "🏖️", "🍦", "🕶️"], dir: "down",
      c1: "#ef7d00", c2: "#0096c7", grad: "linear-gradient(90deg,#ff9800,#0096c7)",
      bar: "repeating-linear-gradient(90deg,#ff9800 0 26px,#fff3d0 26px 38px,#00b4d8 38px 64px,#fff3d0 64px 76px)",
      card: ["🍉", "🌴"], title: ["🌴", "☀️"], row: "☀️ 🌴 🍉 🏖️ 🍦 🏖️ 🍉 🌴 ☀️", logo: "🕶️",
      pat: ["🌴", "🍉"], tint: "rgba(0,150,199,.4)", tint2: "rgba(255,152,0,.4)"
    },
    jesien: {
      label: "🍂 Jesień", range: "23.09–17.10 i 2.11–23.11",
      greet: "🍂 Jesienna pizza na rozgrzewkę",
      icons: ["🍂", "🍁", "🍄", "🌰", "🍂", "🍃"], dir: "down",
      c1: "#c1581a", c2: "#9a6b00", grad: "linear-gradient(90deg,#d2691e,#b8860b)",
      bar: "repeating-linear-gradient(90deg,#d2691e 0 26px,#f6e7c8 26px 38px,#8b5a14 38px 64px,#f6e7c8 64px 76px)",
      card: ["🍁", "🍄"], title: ["🍂", "🍁"], row: "🍂 🍁 🍄 🌰 🍃 🌰 🍄 🍁 🍂", logo: "🍂",
      pat: ["🍂", "🍁"], tint: "rgba(160,80,20,.5)", tint2: "rgba(200,140,30,.3)"
    }
  };

  var ORDER = ["halloween", "niepodleglosc", "andrzejki", "mikolaj", "sylwester", "zima", "tlusty", "pizza", "walentynki", "kobiet", "wielkanoc", "majowka", "matki", "dziecka", "lato", "jesien"];

  /* ---------- data wielkanocy (algorytm Meeusa/Jonesa/Butchera) ---------- */
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return Date.UTC(y, mo - 1, da);
  }

  /* ---------- motyw „automatycznie”: według daty (czas warszawski) ---------- */
  function warsawParts() {
    var s;
    try { s = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date()); }
    catch (_) { var n = new Date(); s = n.getFullYear() + "-" + (n.getMonth() + 1) + "-" + n.getDate(); }
    var p = s.split("-");
    return { y: +p[0], m: +p[1], d: +p[2] };
  }
  function autoTheme(now) {
    var t = now || warsawParts(), y = t.y, m = t.m, d = t.d, md = m * 100 + d, ts = Date.UTC(y, m - 1, d), DAY = 864e5;
    var es = easter(y);
    if (ts === es - 52 * DAY) return { name: "tlusty" };                                     // Tłusty Czwartek
    if (ts >= es - 7 * DAY && ts <= es + 1 * DAY) return { name: "wielkanoc", greet: ts < es - 1 * DAY ? "🐣 Wielkanoc tuż-tuż – zamów pizzę na świąteczny stół!" : "🐣 Wesołych Świąt Wielkanocnych!" };
    if (md === 209) return { name: "pizza" };
    if (md >= 207 && md <= 214) return { name: "walentynki" };
    if (md === 307 || md === 308) return { name: "kobiet" };
    if (md >= 501 && md <= 503) return { name: "majowka", greet: md === 503 ? "☀️ Majówka – i Święto Konstytucji 3 Maja!" : null };
    if (md >= 524 && md <= 526) return { name: "matki" };
    if (md === 530 || md === 531 || md === 601) return { name: "dziecka" };
    if (md >= 1018 && md <= 1031) return { name: "halloween" };
    if (md >= 1109 && md <= 1111) return { name: "niepodleglosc" };
    if (md >= 1124 && md <= 1130) return { name: "andrzejki" };
    if (md >= 1201 && md <= 1226) return { name: "mikolaj", greet: md <= 1206 ? "🎅 Mikołajki we Włoskiej Robocie!" : "🎄 Wesołych Świąt!" };
    if (md >= 1227 || md <= 106) return { name: "sylwester", greet: md >= 1227 && md <= 1231 ? "🎆 Szczęśliwego Nowego Roku!" : md === 106 ? "👑 Trzech Króli – pizza na dobry początek roku!" : "🎆 Szczęśliwego Nowego Roku!" };
    if (md >= 107 && md <= 206) return { name: "zima" };
    if (md >= 622 && md <= 831) return { name: "lato" };
    if ((md >= 923 && md <= 1017) || (md >= 1102 && md <= 1108) || (md >= 1112 && md <= 1123)) return { name: "jesien" };
    return null;
  }
  function label(res) { return res && THEMES[res.name] ? THEMES[res.name].label : "żaden (zwykła strona)"; }

  /* ---------- wygląd ---------- */
  function q(s) { return JSON.stringify(s); }
  function patUrl(a, b) {
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'>" +
      "<text x='16' y='50' font-size='30' opacity='.15'>" + a + "</text>" +
      "<text x='88' y='122' font-size='28' opacity='.15' transform='rotate(-14 88 122)'>" + b + "</text></svg>";
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }
  var VARS = ["--th1", "--th2", "--th-grad", "--th-bar", "--th-c1", "--th-c2", "--th-tl", "--th-tr", "--th-row", "--th-logo", "--th-tint", "--th-tint2", "--th-pat"];

  function clearAll(b) {
    delete b.dataset.theme;
    VARS.forEach(function (v) { b.style.removeProperty(v); });
    ["theme-deco", "theme-bar", "theme-banner", "theme-subrow"].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); });
    var g = document.getElementById("theme-greet"); if (g) g.hidden = true;
  }
  function el(tag, id, cls) { var e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; e.setAttribute("aria-hidden", "true"); return e; }

  function apply(setting) {
    var b = document.body; if (!b) return;
    var res = setting === "auto" ? autoTheme() : (THEMES[setting] ? { name: setting } : null);
    var t = res && THEMES[res.name], name = res && res.name;
    if (!t) { clearAll(b); return; }

    var s = b.style;
    s.setProperty("--th1", t.c1); s.setProperty("--th2", t.c2); s.setProperty("--th-grad", t.grad); s.setProperty("--th-bar", t.bar);
    s.setProperty("--th-c1", q(t.card[0])); s.setProperty("--th-c2", q(t.card[1]));
    s.setProperty("--th-tl", q(t.title[0])); s.setProperty("--th-tr", q(t.title[1]));
    s.setProperty("--th-row", q(t.row)); s.setProperty("--th-logo", q(t.logo));
    s.setProperty("--th-tint", t.tint); s.setProperty("--th-tint2", t.tint2);
    s.setProperty("--th-pat", patUrl(t.pat[0], t.pat[1]));
    b.dataset.theme = name;

    var sub = !document.getElementById("home");
    if (sub) b.dataset.page = "sub";

    var bar = document.getElementById("theme-bar");
    if (!bar) { bar = el("div", "theme-bar"); b.appendChild(bar); }

    var greet = document.getElementById("theme-greet");
    var gtxt = res.greet || t.greet;
    if (!greet && sub) {
      greet = document.createElement("div"); greet.id = "theme-greet"; greet.className = "theme-greet theme-greet-sub";
      var main = document.querySelector("main"); if (main) main.insertBefore(greet, main.firstChild);
    }
    if (greet) { greet.textContent = gtxt; greet.hidden = false; }

    /* baner emotek na dole hero (strona główna) albo rząd pod treścią (podstrony) */
    var oldBanner = document.getElementById("theme-banner");
    if (oldBanner && oldBanner.dataset.t !== name) oldBanner.remove();
    var oldRow = document.getElementById("theme-subrow");
    if (oldRow && oldRow.dataset.t !== name) oldRow.remove();
    var hero = document.getElementById("home");
    if (hero && !document.getElementById("theme-banner")) {
      var bn = el("div", "theme-banner"); bn.dataset.t = name;
      var row = document.createElement("div"); row.className = "tb-row";
      t.row.split(" ").forEach(function (e, i) {
        var sp = document.createElement("span"); sp.textContent = e; sp.style.animationDelay = (-i * 0.45) + "s"; row.appendChild(sp);
      });
      bn.appendChild(row); hero.appendChild(bn);
    }
    if (sub && !document.getElementById("theme-subrow")) {
      var sr = el("div", "theme-subrow"); sr.dataset.t = name; sr.textContent = t.row;
      var mn = document.querySelector("main"); if (mn) mn.appendChild(sr);
    }

    /* spadające / unoszące się ozdoby */
    var deco = document.getElementById("theme-deco");
    if (deco && deco.dataset.t === name) return;
    if (deco) deco.remove();
    deco = el("div", "theme-deco"); deco.dataset.t = name;
    var small = innerWidth < 700, n = small ? 14 : 28, up = t.dir === "up";
    for (var i = 0; i < n; i++) {
      var sp2 = document.createElement("span");
      sp2.textContent = t.icons[i % t.icons.length];
      if (up) sp2.className = "up";
      var size = (small ? 16 : 20) + Math.round(Math.random() * (small ? 16 : 26));
      sp2.style.cssText = "left:" + Math.round((i + Math.random() * 0.8) / n * 100) + "%;--s:" + size + "px;--d:" + (9 + Math.round(Math.random() * 11)) +
        "s;--w:-" + Math.round(Math.random() * 18) + "s;--x:" + (Math.round(Math.random() * 90) - 45) + "px";
      deco.appendChild(sp2);
    }
    b.appendChild(deco);
  }

  /* lista do selecta w panelu admina */
  var list = ORDER.map(function (k) { return { key: k, label: THEMES[k].label + " (" + THEMES[k].range + ")" }; });

  window.WRTheme = { THEMES: THEMES, order: ORDER, list: list, auto: autoTheme, label: label, apply: apply, easter: easter };

  /* podstrony: motyw z pamięci strony głównej (jeśli klient ją odwiedził), inaczej wg daty */
  function boot() {
    if (document.getElementById("home")) return;           // strona główna sama woła apply() po wczytaniu ustawień
    var s = "auto";
    try {
      var c = JSON.parse(localStorage.getItem("wr_site_cfg_v1") || "null");
      if (c && typeof c.theme === "string") s = c.theme;
    } catch (_) {}
    apply(s);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
