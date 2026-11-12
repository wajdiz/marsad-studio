/* MARSAD Help center: renders docs.json. Used by the dashboard (index.html) and the standalone docs page (docs.html).
   MarsadHelp.init(data, {nav(route), app(cardId), colors, icon(name)})
   routes: {view: "home"} | {view: "cat", id} | {view: "art", slug} | {view: "search", q}
*/
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  let D = null, SOURCE = null, O = {}, TEXT = {};
  const isAr = () => document.documentElement.lang === "ar";
  const tx = (en, ar) => isAr() ? ar : en;
  function useLocale() {
    if (!SOURCE) return;
    if (!isAr() || !SOURCE.ar) { D = SOURCE; }
    else {
      const A = SOURCE.ar;
      D = {...SOURCE,
        groups: SOURCE.groups.map(g => ({...g, title: A.groups[g.id] || g.title})),
        categories: SOURCE.categories.map(c => { const x = A.categories[c.id]; return x ? {...c, title:x[0], intro:x[1]} : c; }),
        articles: SOURCE.articles.map(x => {
          const title = (x.card && A.cards[x.card] && A.cards[x.card][0]) || A.articles[x.slug] || x.title;
          const description = x.card && A.details[x.card];
          const arContent = description ? `<div class="hc-ar-summary"><p>${esc(description.what)}</p><h3>كيف يُحسب التحليل؟</h3><p>${esc(description.how)}</p><h3>تنبيه مهم</h3><p>${esc(description.note)}</p></div>` : '';
          const original = `<details class="hc-en-details"><summary>عرض الدليل التقني الأصلي بالإنجليزية</summary><div lang="en" dir="ltr">${x.html}</div></details>`;
          return {...x,title,summary: description ? description.what : (A.articles[x.slug] || x.summary),
            html: arContent + (description ? original : `<p class="hc-ar-note">تتوفر التفاصيل التقنية لهذه الصفحة بالإنجليزية حاليًا.</p>${original}`)};
        }),
        faq: SOURCE.faq.map(f=>({...f,group:A.faq_groups[f.group] || f.group,q:A.faq[f.q] || f.q,a:esc(A.faq_answers[f.q] || f.a)})),
        status_labels:{...SOURCE.status_labels,...A.status}};
    }
    TEXT = {};
    for(const x of D.articles) TEXT[x.slug] = (x.title + " " + (x.summary || "") + " " + x.html.replace(/<[^>]+>/g, " ")).toLowerCase();
  }
  const SECOF = {"an-data": "data", "an-time": "time", "an-words": "words", "an-topics": "topics", "an-feelings": "feelings",
    "an-framing": "framing", "an-people": "people", "an-reactions": "reactions", "an-spread": "spread", "an-society": "society"};
  const color = cat => (O.colors || {})[SECOF[cat]] || "#2f6db3";
  const icon = n => (O.icon ? O.icon(n) : "");
  const cat = id => D.categories.find(c => c.id === id);
  const arts = id => D.articles.filter(a => a.cat === id);
  const art = slug => D.articles.find(a => a.slug === slug);
  const chip = st => st === "ready" ? "" : `<span class="hc-st hc-${st}">${esc(D.status_labels[st] || st)}</span>`;
  const crumbs = parts => `<nav class="crumbs" aria-label="You are here">${parts.length > 1 ? `<button class="backbtn" data-hgo="${parts[parts.length - 2][1]}">‹ Back to ${esc(parts[parts.length - 2][0])}</button>` : ""}${parts.map(([l, k], i) => i === parts.length - 1 ? `<span class="here" aria-current="page">${esc(l)}</span>` : `<button class="lnk" data-hgo="${k}">${esc(l)}</button><span class="sep" aria-hidden="true">›</span>`).join("")}</nav>`;
  const searchBox = (q = "") => `<div class="hc-search"><input type="search" id="hcq" placeholder="${tx("Search the help center","ابحث في مركز المساعدة")}" aria-label="${tx("Search the help center","ابحث في مركز المساعدة")}" value="${esc(q)}"></div>`;

  function home() {
    const groups = D.groups.map(g => {
      const cs = D.categories.filter(c => c.group === g.id);
      return `<h2 class="hc-group">${esc(g.title)}</h2><div class="hc-grid">${cs.map(c => {
        const list = arts(c.id), show = list.slice(0, 6);
        return `<section class="hc-card" style="--sec:${color(c.id)}"><button class="hc-card-head" data-hgo="cat:${c.id}"><span class="hc-ico">${icon(c.icon)}</span><span class="hc-ct">${esc(c.title)}</span><span class="hc-n" aria-label="${c.count} pages">${c.count}</span></button>
          <ul>${show.map(a => `<li><button class="hc-link" data-hgo="art:${a.slug}">${esc(a.title)}</button>${chip(a.status)}</li>`).join("")}</ul>
          ${list.length > show.length ? `<button class="hc-more" data-hgo="cat:${c.id}">${tx("See all", "عرض الكل")} ${list.length}</button>` : ""}</section>`;
      }).join("")}</div>`;
    }).join("");
    const fg = [...new Set(D.faq.map(f => f.group))];
    const faq = `<h2 class="hc-group" id="hc-faq">${tx("Frequently asked questions", "الأسئلة الشائعة")}</h2><div class="hc-faq">${fg.map(g => `<div><h3>${esc(g)}</h3>${D.faq.filter(f => f.group === g).map(f => `<details><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`).join("")}</div>`).join("")}</div>`;
    return `<h1 class="page-title">${tx("Help center", "مركز المساعدة")}</h1>${searchBox()}${groups}${faq}<p class="hc-foot">${tx(`MARSAD Analytics v${esc(D.version)} documentation`, `دليل MARSAD Analytics الإصدار ${esc(D.version)}`)}</p>`;
  }

  function category(id) {
    const c = cat(id); if (!c) return home();
    return `${crumbs([[tx("Help center", "مركز المساعدة"), "home"], [c.title, "cat:" + id]])}
      <div class="sec-band" style="--sec:${color(id)}"><span class="sec-ico">${icon(c.icon)}</span><div><h1 class="page-title">${esc(c.title)}</h1>${c.intro ? `<div class="sec-q">${esc(c.intro)}</div>` : ""}</div></div>
      <div class="hc-list">${arts(id).map(a => `<button class="hc-row" data-hgo="art:${a.slug}"><span class="hc-rt">${esc(a.title)} ${chip(a.status)}</span><span class="hc-rs">${esc(a.summary || "")}</span></button>`).join("")}</div>`;
  }

  function article(slug) {
    const a = art(slug); if (!a) return home();
    const c = cat(a.cat), list = arts(a.cat), i = list.findIndex(x => x.slug === slug), prev = list[i - 1], next = list[i + 1];
    return `${crumbs([[tx("Help center", "مركز المساعدة"), "home"], [c.title, "cat:" + c.id], [a.title, "art:" + slug]])}
      <div class="sec-tag" style="--sec:${color(c.id)}">${icon(c.icon)}${esc(c.title)}</div>
      <div class="title-row"><h1 class="page-title">${esc(a.title)}</h1><div class="head-actions">${a.card && a.status !== "planned" ? `<button class="btn" data-app="${esc(a.card)}">${tx("Open in the dashboard","فتح في لوحة التحليلات")}</button>` : ""}</div></div>
      ${a.status !== "ready" ? `<div class="hc-banner hc-${a.status}">${esc(D.status_labels[a.status])}${a.status === "placeholder" ? ": this part of MARSAD is not built yet." : a.status === "server" ? ": runs in the Colab notebook or on the MARSAD server, or on files that already have the labels." : a.status === "service" ? ": runs when the MARSAD service is connected, or on files that already have the labels." : ": shown in the dashboard as a placeholder."}</div>` : ""}
      <article class="hc-body">${a.html}</article>
      <nav class="pager" aria-label="Other pages in ${esc(c.title)}">${prev ? `<button class="btn" data-hgo="art:${prev.slug}">‹ ${esc(prev.title)}</button>` : `<button class="btn" data-hgo="cat:${c.id}">‹ ${esc(c.title)}</button>`}<span class="pos">${i + 1} of ${list.length} in ${esc(c.title)}</span>${next ? `<button class="btn" data-hgo="art:${next.slug}">${esc(next.title)} ›</button>` : `<button class="btn" data-hgo="home">${tx("Help center", "مركز المساعدة")} ›</button>`}</nav>`;
  }

  function search(q) {
    const t = q.trim().toLowerCase();
    if (!t) return home();
    const words = t.split(/\s+/);
    const hits = D.articles.map(a => {
      const title = a.title.toLowerCase(), body = TEXT[a.slug];
      let score = 0;
      for (const w of words) { if (title.includes(w)) score += 5; if ((a.summary || "").toLowerCase().includes(w)) score += 2; if (body.includes(w)) score += 1; else if (!title.includes(w)) return null; }
      return {a, score};
    }).filter(Boolean).sort((x, y) => y.score - x.score).slice(0, 40);
    const fq = D.faq.filter(f => words.every(w => (f.q + " " + f.a).toLowerCase().includes(w)));
    return `${crumbs([[tx("Help center", "مركز المساعدة"), "home"], [tx("Search", "بحث"), "home"]])}<h1 class="page-title">${tx("Search", "بحث")}</h1>${searchBox(q)}
      <p class="hc-count">${hits.length} page${hits.length === 1 ? "" : "s"}${fq.length ? ` and ${fq.length} question${fq.length === 1 ? "" : "s"}` : ""}</p>
      <div class="hc-list">${hits.map(({a}) => `<button class="hc-row" data-hgo="art:${a.slug}"><span class="hc-rt">${esc(a.title)} ${chip(a.status)}</span><span class="hc-rs">${esc(cat(a.cat).title)} · ${esc(a.summary || "")}</span></button>`).join("")}</div>
      ${fq.length ? `<div class="hc-faq"><div>${fq.map(f => `<details open><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`).join("")}</div></div>` : ""}`;
  }

  function render(route) {
    if (!SOURCE) return `<div class="msg grey">${tx("Loading the help center…","جارٍ تحميل مركز المساعدة…")}</div>`;
    useLocale();
    if (route.view === "cat") return category(route.id);
    if (route.view === "art") return article(route.slug);
    if (route.view === "search") return search(route.q || "");
    return home();
  }

  function bind(root) {
    root.querySelectorAll("[data-hgo]").forEach(b => b.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      const k = b.dataset.hgo;
      O.nav(k === "home" ? {view: "home"} : k.startsWith("cat:") ? {view: "cat", id: k.slice(4)} : {view: "art", slug: k.slice(4)});
    }));
    root.querySelectorAll("[data-doc]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); O.nav({view: "art", slug: b.dataset.doc}); }));
    root.querySelectorAll("[data-app]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); O.app(b.dataset.app); }));
    const q = root.querySelector("#hcq");
    if (q) {
      let t = null;
      q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => O.nav({view: "search", q: q.value}, true), 250); });
      if (q.value) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    }
  }

  function routeFromHash(h) {          // "help", "help/c/<id>", "help/a/<slug>", "help/s/<query>"
    const p = h.replace(/^#?/, "").split("/");
    if (p[1] === "c") return {view: "cat", id: p[2]};
    if (p[1] === "a") return {view: "art", slug: p[2]};
    if (p[1] === "s") return {view: "search", q: decodeURIComponent(p.slice(2).join("/"))};
    return {view: "home"};
  }
  function hashFor(r) {
    return "help" + (r.view === "cat" ? "/c/" + r.id : r.view === "art" ? "/a/" + r.slug : r.view === "search" ? "/s/" + encodeURIComponent(r.q || "") : "");
  }

  window.MarsadHelp = {
    init(data, opts) { SOURCE = data; O = opts || {}; useLocale(); },
    ready: () => !!D, render, bind, routeFromHash, hashFor,
    slugForCard: id => D && D.articles.some(a => a.card === id) ? id.toLowerCase() : null,
  };
})();
