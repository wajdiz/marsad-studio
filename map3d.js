/* MARSAD 3D map view.
   Draws the engine's 3D similarity maps (a Plotly figure whose traces are "scatter3d" markers, one trace per topic)
   on a canvas: drag to turn, scroll or pinch to zoom, auto-rotate, topic names that do not overlap, a topic list
   with counts and words that shows or hides each topic, Top / Front / Side views, and a click on a dot opens the post.
   The engine's figure stays the source of truth: downloads and copied images still use the Plotly chart. */
(function () {
  "use strict";

  function nums(v) {
    if (Array.isArray(v)) return v.map(Number);
    if (v && typeof v === "object" && v.bdata) {
      const raw = atob(v.bdata), u = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
      const T = {f8: Float64Array, f4: Float32Array, i4: Int32Array, u4: Uint32Array, i2: Int16Array, u2: Uint16Array, i1: Int8Array, u1: Uint8Array}[v.dtype];
      return T ? Array.from(new T(u.buffer)) : null;
    }
    return null;
  }
  const isPts = t => t && t.type === "scatter3d" && String(t.mode || "markers").includes("markers");

  // Is this figure a 3D map the view can draw?
  function is(fig) {
    const d = (fig && fig.data) || [];
    return d.some(isPts) && d.every(t => t.type === "scatter3d");
  }

  const strip = s => String(s == null ? "" : s).replace(/[\u2066-\u2069\u200e\u200f]/g, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));

  // Figure -> {groups, pts}
  function parse(fig, tr) {
    const groups = [], pts = [];
    for (const t of fig.data) {
      if (!isPts(t)) continue;
      const x = nums(t.x) || [], y = nums(t.y) || [], z = nums(t.z) || [];
      const m = t.marker || {}, meta = t.meta || {};
      const raw = String(meta.label || t.name || "");
      const mm = /^Cluster (\d+):\s*(.*)$/.exec(raw);
      const noise = meta.topic === -1 || /no topic|^outliers$/i.test(raw);
      const num = meta.topic != null && meta.topic !== -1 ? meta.topic : (mm ? +mm[1] : null);
      const title = noise ? tr("Posts in no topic") : (mm ? mm[2] : raw);
      const hov = Array.isArray(t.hovertext) ? t.hovertext : Array.isArray(t.text) ? t.text : [];
      const cdv = Array.isArray(t.customdata) ? t.customdata : [];
      const g = {num, title: strip(title), words: strip(meta.words || ""), n: meta.n || x.length, posts: meta.posts || "", noise,
                 colour: typeof m.color === "string" ? m.color : (noise ? "#c4cbd0" : "#178d90"),
                 hidden: t.visible === "legendonly" || t.visible === false, idx: []};
      g.i = groups.length;
      groups.push(g);
      for (let i = 0; i < x.length; i++) {
        if (!Number.isFinite(x[i]) || !Number.isFinite(y[i]) || !Number.isFinite(z[i])) continue;
        let h = strip(hov[i] || "");
        const nl = h.indexOf("\n"); if (nl >= 0) h = h.slice(nl + 1);   // the topic name is shown in colour above it
        let c = cdv[i]; if (Array.isArray(c)) c = c[0];
        // Plotly draws z as up: keep it as the height here so the map looks the same and "Top" looks down on it
        g.idx.push(pts.length);
        pts.push({x: x[i], y: z[i], z: y[i], g: g.i, t: h, c: typeof c === "string" ? c : ""});
      }
    }
    return {groups, pts};
  }

  const CSS = `
.m3{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,290px);gap:14px;color:var(--ink,#243543)}
.m3-title{grid-column:1/-1;margin:0;font-size:15px;font-weight:600;line-height:1.4}
.m3-stage{position:relative;background:var(--m3-bg,#fbfcfe);border:1px solid var(--border,#dbe3e8);border-radius:12px;overflow:hidden;min-width:0}
.m3-stage canvas{display:block;width:100%;height:100%;cursor:grab;touch-action:none;outline:none}
.m3-stage canvas:active{cursor:grabbing}
.m3-stage canvas:focus-visible{box-shadow:0 0 0 3px var(--teal,#178d90) inset}
.m3-hint{position:absolute;inset-inline-start:60px;bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--muted,#5b6b77);background:var(--white,#fff);border:1px solid var(--border,#dbe3e8);border-radius:999px;padding:3px 12px;pointer-events:none;transition:opacity .4s;max-width:calc(100% - 260px)}
.m3-tools{position:absolute;inset-inline-end:10px;top:10px;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.m3-views{position:absolute;inset-inline-end:10px;bottom:10px;display:flex;gap:6px}
.m3 button.m3-b{border:1px solid var(--border,#dbe3e8);background:var(--white,#fff);color:inherit;border-radius:8px;padding:5px 10px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;line-height:1.2}
.m3 button.m3-b:hover{border-color:var(--teal,#178d90)}
.m3 button.m3-b[aria-pressed=true]{background:var(--teal,#178d90);border-color:var(--teal,#178d90);color:#fff}
.m3 button.m3-b:focus-visible,.m3-tog:focus-visible,.m3-posts:focus-visible{outline:2px solid var(--teal,#178d90);outline-offset:2px}
.m3-tip{position:absolute;pointer-events:none;background:var(--white,#fff);border:1px solid var(--border,#dbe3e8);border-radius:8px;padding:8px 10px;box-shadow:0 6px 20px rgba(0,0,0,.18);max-width:280px;font-size:13px;line-height:1.45;display:none;z-index:2}
.m3-tip b{display:block;margin-bottom:2px}.m3-tip span{display:block;unicode-bidi:plaintext}.m3-tip small{display:block;margin-top:4px;color:var(--muted,#5b6b77)}
.m3-side{min-width:0;display:flex;flex-direction:column}
.m3-side h4{margin:0 0 4px;font-size:13.5px}
.m3-side p.m3-note{margin:0 0 8px;font-size:12px;color:var(--muted,#5b6b77)}
.m3-list{overflow:auto;min-height:0;flex:1;padding-inline-end:2px}
.m3-row{display:flex;align-items:stretch;border:1px solid var(--border,#dbe3e8);border-radius:10px;margin-bottom:8px;background:var(--white,#fff)}
.m3-row:hover{border-color:var(--teal,#178d90)}
.m3-row.off .m3-tog{opacity:.42}
.m3-tog{flex:1;min-width:0;display:flex;gap:10px;align-items:flex-start;text-align:start;background:none;border:0;color:inherit;font:inherit;padding:9px 10px;cursor:pointer;border-radius:10px}
.m3-tog i{flex:none;width:12px;height:12px;border-radius:50%;margin-top:4px}
.m3-tog span.m3-txt{flex:1;min-width:0}
.m3-tog b{display:block;font-size:13.5px;line-height:1.35;unicode-bidi:plaintext;overflow-wrap:anywhere}
.m3-tog em{display:block;font-style:normal;font-size:12px;color:var(--muted,#5b6b77);unicode-bidi:plaintext;overflow-wrap:anywhere}
.m3-tog u{display:block;height:4px;border-radius:2px;margin-top:6px;text-decoration:none}
.m3-tog strong{font-size:12.5px;white-space:nowrap;margin-inline-start:auto}
.m3-posts{flex:none;align-self:center;background:none;border:0;border-inline-start:1px solid var(--border,#eef2f4);color:var(--teal-dark,#0f6e70);font:inherit;font-size:12px;font-weight:600;padding:6px 10px;cursor:pointer;height:100%}
.m3-posts:hover{text-decoration:underline}
.m3-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px;font-size:12.5px;color:var(--muted,#5b6b77)}
.m3-foot input{vertical-align:middle;accent-color:var(--teal,#178d90)}
.m3-foot a{color:var(--teal-dark,#0f6e70);cursor:pointer;text-decoration:underline}
.m3-cap{grid-column:1;margin:0;font-size:12.5px;color:var(--muted,#5b6b77)}
@media (max-width:860px){.m3{grid-template-columns:1fr}.m3-cap{grid-column:1}.m3-hint{display:none}.m3-list{max-height:320px}}
`;

  function el(tag, attrs, parent) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "text") e.textContent = v; else if (k === "html") e.innerHTML = v; else e.setAttribute(k, v);
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  function render(host, fig, opt) {
    opt = opt || {};
    const AR = opt.lang === "ar";
    const T = (en, ar) => (AR ? ar : en);
    const tr = opt.tr || (x => x);
    if (!document.getElementById("m3-css")) el("style", {id: "m3-css", text: CSS}, document.head);
    const {groups, pts} = parse(fig, tr);
    const token = {};
    host.__m3 = token;
    host.innerHTML = "";
    host.dataset.m3 = "1";
    const L = fig.layout || {};
    const H = Math.round(Math.min(680, Math.max(420, (L.height || 640) - 110)));
    const box = el("div", {class: "m3"}, host);
    const title = strip((L.title && (L.title.text ?? L.title)) || "").replace(/\n/g, " ");
    if (title) el("p", {class: "m3-title", text: AR && /^3D similarity map/.test(title) ? "خريطة التشابه ثلاثية الأبعاد: المنشورات المتقاربة متشابهة في المعنى" : tr(title)}, box);

    // ---------- stage
    const stage = el("div", {class: "m3-stage", style: "height:" + H + "px"}, box);
    const cv = el("canvas", {tabindex: "0", role: "img",
      "aria-label": T(`3D map of ${pts.length} posts in ${groups.filter(g => !g.noise).length} topics. Nearby dots are similar posts. Arrow keys turn the map, plus and minus zoom, the list beside it shows or hides topics and opens their posts.`,
                      `خريطة ثلاثية الأبعاد لـ${pts.length} منشورًا في ${groups.filter(g => !g.noise).length} موضوعات. النقاط المتقاربة منشورات متشابهة. الأسهم تدير الخريطة، وزر الجمع والطرح للتكبير، والقائمة بجانبها تُظهر المواضيع أو تخفيها وتفتح منشوراتها.`)}, stage);
    const ctx = cv.getContext("2d");
    const hint = el("div", {class: "m3-hint", text: T("Drag to turn · Scroll or pinch to zoom · Click a dot to open the post", "اسحب للتدوير · مرّر أو اقرص للتكبير · انقر نقطة لفتح المنشور")}, stage);
    const tools = el("div", {class: "m3-tools"}, stage);
    const bRot = el("button", {type: "button", class: "m3-b", "aria-pressed": "true", text: T("Auto-rotate", "دوران تلقائي")}, tools);
    const bLab = el("button", {type: "button", class: "m3-b", "aria-pressed": "true", text: T("Labels", "الأسماء")}, tools);
    const bIn = el("button", {type: "button", class: "m3-b", title: T("Zoom in", "تكبير"), "aria-label": T("Zoom in", "تكبير"), text: "+"}, tools);
    const bOut = el("button", {type: "button", class: "m3-b", title: T("Zoom out", "تصغير"), "aria-label": T("Zoom out", "تصغير"), text: "−"}, tools);
    const bFit = el("button", {type: "button", class: "m3-b", text: T("Reset view", "إعادة العرض")}, tools);
    const views = el("div", {class: "m3-views", role: "group", "aria-label": T("Look from", "انظر من")}, stage);
    const VIEWS = {top: [0, 1.5, T("Top", "أعلى")], front: [0, 0, T("Front", "أمام")], side: [Math.PI / 2, 0, T("Side", "جانب")]};
    for (const [k, v] of Object.entries(VIEWS)) el("button", {type: "button", class: "m3-b", "data-v": k, text: v[2]}, views);
    const tip = el("div", {class: "m3-tip", role: "status"}, stage);

    // ---------- side list
    const side = el("div", {class: "m3-side"}, box);
    const fitSide = () => { side.style.height = box.clientWidth > 860 ? H + "px" : ""; };
    el("h4", {text: T("Topics (click to show or hide)", "المواضيع (انقر للإظهار أو الإخفاء)")}, side);
    el("p", {class: "m3-note", text: T("Double-click a topic to show it alone.", "انقر مرتين على موضوع لعرضه وحده.")}, side);
    const list = el("div", {class: "m3-list"}, side);
    const foot = el("div", {class: "m3-foot"}, side);
    const szLab = el("label", {}, foot);
    szLab.appendChild(document.createTextNode(T("Dot size ", "حجم النقاط ")));
    const sz = el("input", {type: "range", min: "2", max: "9", value: "4", "aria-label": T("Dot size", "حجم النقاط")}, szLab);
    const showAll = el("a", {role: "button", tabindex: "0", text: T("Show all", "إظهار الكل")}, foot);
    const sampled = groups.reduce((a, g) => a + g.n, 0) > pts.length;
    el("p", {class: "m3-cap", text: sampled
      ? T(`Each dot is one post; ${pts.length.toLocaleString()} posts are drawn, picked at random. Dots that sit close together talk about similar things. Colour = topic.`,
          `كل نقطة منشور واحد؛ رُسم ${pts.length.toLocaleString()} منشورًا مختارًا عشوائيًا. النقاط المتقاربة تتحدث عن أمور متشابهة. اللون = الموضوع.`)
      : T("Each dot is one post. Dots that sit close together talk about similar things. Colour = topic.",
          "كل نقطة منشور واحد. النقاط المتقاربة تتحدث عن أمور متشابهة. اللون = الموضوع.")}, box);

    // ---------- state
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let yaw = 0.6, pitch = 0.35, zoom = 1, auto = !reduce, labels = true, size = 4;
    let W = 0, Hh = 0, dpr = 1, drag = null, moved = 0, hover = null, proj = [], tgt = null, dirty = true, alive = true;
    const pointers = new Map(); let pinch0 = null;
    bRot.setAttribute("aria-pressed", String(auto));

    function bounds() {
      const v = pts.filter(p => !groups[p.g].hidden);
      if (!v.length) return {cx: 0, cy: 0, cz: 0, r: 1};
      const a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
      for (const p of v) {
        if (p.x < a[0]) a[0] = p.x; if (p.y < a[1]) a[1] = p.y; if (p.z < a[2]) a[2] = p.z;
        if (p.x > b[0]) b[0] = p.x; if (p.y > b[1]) b[1] = p.y; if (p.z > b[2]) b[2] = p.z;
      }
      return {cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, cz: (a[2] + b[2]) / 2,
              r: Math.max(b[0] - a[0], b[1] - a[1], b[2] - a[2], 1e-6) / 2 * 1.05};
    }
    let B = bounds(), Bt = {...B};
    function rot(x, y, z) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
    }
    function P(x, y, z) {
      const k = Math.min(W, Hh) * 0.42 / B.r * zoom;
      const [a, b, c] = rot(x - B.cx, y - B.cy, z - B.cz);
      const f = 1 / (1 - c / B.r * 0.18);
      return {x: W / 2 + a * k * f, y: Hh / 2 - b * k * f, d: c / B.r, f};
    }
    function resize() {
      dpr = window.devicePixelRatio || 1;
      W = stage.clientWidth; Hh = stage.clientHeight;
      cv.width = Math.max(1, W * dpr); cv.height = Math.max(1, Hh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
    }
    let C = {};
    function colours() {
      const cs = getComputedStyle(host);
      const v = (n, d) => (cs.getPropertyValue(n).trim() || d);
      C = {line: v("--border", "#dbe3e8"), ink: v("--ink", "#243543"), card: v("--white", "#fff"), muted: v("--muted", "#5b6b77")};
      const dk = document.documentElement.getAttribute("data-theme") === "dark" || (opt.dark && !document.documentElement.getAttribute("data-theme"));
      stage.style.setProperty("--m3-bg", dk ? "rgba(255,255,255,.025)" : "#fbfcfe");
    }
    colours();

    // centre of each topic, as the median of its points (a few far-off posts do not drag the name away)
    const centre = groups.map(g => {
      if (g.noise || !g.idx.length) return null;
      const med = k => { const a = g.idx.map(i => pts[i][k]).sort((p, q) => p - q); return a[a.length >> 1]; };
      return {x: med("x"), y: med("y"), z: med("z")};
    });
    const labelled = groups.filter(g => !g.noise && centre[g.i]).sort((a, b) => b.n - a.n).slice(0, 10).map(g => g.i);

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    }
    const short = (s, n) => (s.length > n ? s.slice(0, n - 1).trim() + "…" : s);

    function draw() {
      ctx.clearRect(0, 0, W, Hh);
      // floor grid, under the lowest posts
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.globalAlpha = 0.9;
      const g = B.r * 1.25, fy = B.cy - B.r * 1.05;
      for (let i = -4; i <= 4; i++) {
        const t = i / 4 * g;
        let a = P(B.cx + t, fy, B.cz - g), b = P(B.cx + t, fy, B.cz + g);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        a = P(B.cx - g, fy, B.cz + t); b = P(B.cx + g, fy, B.cz + t);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // posts, far ones first
      proj = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]; if (groups[p.g].hidden) continue;
        const q = P(p.x, p.y, p.z); q.i = i; proj.push(q);
      }
      proj.sort((a, b) => a.d - b.d);
      for (const q of proj) {
        const p = pts[q.i], gr = groups[p.g], on = hover === q.i;
        const s0 = gr.noise ? size * 0.6 : size;
        const r = Math.max(1.4, s0 * q.f * (0.75 + 0.25 * (q.d + 1) / 2)) * (on ? 2 : 1);
        ctx.globalAlpha = on ? 1 : gr.noise ? 0.35 : Math.max(0.4, 0.55 + q.d * 0.45);
        ctx.fillStyle = gr.colour;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.fill();
        if (on) { ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
      // topic names: biggest topics placed first, the others moved up until they do not overlap
      if (labels) {
        const placed = [];
        ctx.font = "700 12px Arial, 'Noto Naskh Arabic', sans-serif";
        for (const gi of labelled) {
          const gr = groups[gi]; if (gr.hidden) continue;
          const c = centre[gi], q = P(c.x, c.y, c.z);
          const txt = (gr.num != null ? gr.num + "  " : "") + short(gr.title, 30);
          const w = ctx.measureText(txt).width + 18, h = 22;
          const hit = (x, y) => placed.some(b => x < b.x + b.w + 4 && x + w + 4 > b.x && y < b.y + b.h + 3 && y + h + 3 > b.y);
          const top = 50, bottom = Hh - 46;    // clear of the buttons
          let x = 0, y = 0, ok = false;
          // nearest free spot: above the topic first, then below, then to the sides, a step further each round
          outer: for (let r = 0; r < 7; r++) {
            for (const [dx, dy] of [[0, -36 - r * 26], [0, 14 + r * 26], [-(w * 0.6) * (r + 1), -36], [(w * 0.6) * (r + 1), -36]]) {
              const cx = Math.min(Math.max(4, q.x - w / 2 + dx), W - w - 4), cy = Math.min(Math.max(top, q.y + dy), bottom - h);
              if (!hit(cx, cy)) { x = cx; y = cy; ok = true; break outer; }
            }
          }
          if (!ok) { x = Math.min(Math.max(4, q.x - w / 2), W - w - 4); y = Math.min(Math.max(top, q.y - 36), bottom - h); }
          placed.push({x, y, w, h});
          ctx.strokeStyle = gr.colour; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(Math.min(Math.max(q.x, x + 8), x + w - 8), y + h / 2 < q.y ? y + h : y); ctx.stroke();
          ctx.beginPath(); ctx.arc(q.x, q.y, 2.5, 0, 6.2832); ctx.fillStyle = gr.colour; ctx.fill();
          ctx.fillStyle = C.card; ctx.lineWidth = 2; roundRect(x, y, w, h, 11); ctx.fill(); ctx.stroke();
          ctx.fillStyle = C.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.direction = /[\u0600-\u06ff]/.test(gr.title) ? "rtl" : "ltr";
          ctx.fillText(txt, x + w / 2, y + h / 2 + 0.5);
        }
        ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"; ctx.direction = "ltr";
      }
      // which way is up
      const o = [34, Hh - 30];
      [["#d1495b", 1, 0, 0], ["#5c946e", 0, 1, 0], ["#2f6db3", 0, 0, 1]].forEach(a => {
        const [x, y] = rot(a[1], a[2], a[3]);
        ctx.strokeStyle = a[0]; ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(o[0] + x * 20, o[1] - y * 20); ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    let frame = 0;
    function loop() {
      if (!alive) return;
      if (host.__m3 !== token || !cv.isConnected) { alive = false; return; }
      if (++frame % 45 === 0) colours();
      if (auto && !drag && pointers.size === 0) { yaw += 0.004; dirty = true; }
      for (const k of ["cx", "cy", "cz", "r"]) { const d = Bt[k] - B[k]; if (Math.abs(d) > 1e-6) { B[k] += d * 0.12; dirty = true; } }
      if (tgt) {
        yaw += (tgt.y - yaw) * 0.15; pitch += (tgt.p - pitch) * 0.15; zoom += (tgt.z - zoom) * 0.15; dirty = true;
        if (Math.abs(tgt.y - yaw) + Math.abs(tgt.p - pitch) + Math.abs(tgt.z - zoom) < 0.004) tgt = null;
      }
      if (dirty && W > 0) { draw(); dirty = false; }
      requestAnimationFrame(loop);
    }

    // ---------- interaction
    function stopAuto() { auto = false; bRot.setAttribute("aria-pressed", "false"); hint.style.opacity = "0"; }
    function nearest(mx, my) {
      let best = null, bd = 1e9;
      for (let j = proj.length - 1; j >= 0; j--) {     // front-most first
        const q = proj[j], d = Math.hypot(q.x - mx, q.y - my);
        if (d < bd && d < 10) { bd = d; best = q.i; }
      }
      return best;
    }
    function showTip(i, mx, my) {
      if (i == null) { tip.style.display = "none"; return; }
      const p = pts[i], gr = groups[p.g];
      tip.innerHTML = `<b style="color:${esc(gr.colour)}">${gr.num != null ? gr.num + ". " : ""}${esc(gr.title)}</b><span dir="auto">${esc(p.t)}</span>` +
        (p.c ? `<small>${esc(T("Click to open the post", "انقر لفتح المنشور"))}</small>` : "");
      tip.style.display = "block";
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.max(4, Math.min(mx + 14, W - tw - 6)) + "px";
      tip.style.top = (my + 14 + th > Hh ? Math.max(4, my - th - 10) : my + 14) + "px";
    }
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener("pointerdown", e => {
      pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* old browsers */ }
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = {d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom}; drag = null; }
      else { drag = {x: e.clientX, y: e.clientY}; moved = 0; }
      stopAuto(); tgt = null;
    });
    cv.addEventListener("pointermove", e => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (pinch0 && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        zoom = Math.max(0.4, Math.min(8, pinch0.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch0.d)));
        dirty = true; return;
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        moved += Math.abs(dx) + Math.abs(dy);
        yaw += dx * 0.008; pitch = Math.max(-1.5, Math.min(1.5, pitch + dy * 0.008));
        drag = {x: e.clientX, y: e.clientY}; dirty = true;
        if (moved > 4) { tip.style.display = "none"; hover = null; }
        return;
      }
      const [mx, my] = pos(e), h = nearest(mx, my);
      if (h !== hover) { hover = h; dirty = true; }
      cv.style.cursor = h != null && pts[h].c ? "pointer" : "";
      showTip(h, mx, my);
    });
    const up = e => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch0 = null;
      if (drag && moved < 5 && e.type === "pointerup") {
        const [mx, my] = pos(e), h = nearest(mx, my);
        if (h != null && pts[h].c && opt.onPosts) opt.onPosts(pts[h].c, groups[pts[h].g].title);
      }
      drag = null;
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("pointerleave", () => { if (!drag) { hover = null; tip.style.display = "none"; dirty = true; } });
    cv.addEventListener("wheel", e => { e.preventDefault(); stopAuto(); zoom = Math.max(0.4, Math.min(8, zoom * (e.deltaY < 0 ? 1.12 : 0.9))); dirty = true; }, {passive: false});
    cv.addEventListener("keydown", e => {
      const k = e.key; let used = true;
      if (k === "ArrowLeft") yaw -= 0.12; else if (k === "ArrowRight") yaw += 0.12;
      else if (k === "ArrowUp") pitch = Math.max(-1.5, pitch - 0.12); else if (k === "ArrowDown") pitch = Math.min(1.5, pitch + 0.12);
      else if (k === "+" || k === "=") zoom = Math.min(8, zoom * 1.15); else if (k === "-" || k === "_") zoom = Math.max(0.4, zoom / 1.15);
      else if (k === "0") bFit.click(); else if (k === " ") { bRot.click(); } else used = false;
      if (used) { e.preventDefault(); if (k !== " ") stopAuto(); dirty = true; }
    });
    bRot.onclick = () => { auto = !auto; bRot.setAttribute("aria-pressed", String(auto)); };
    bLab.onclick = () => { labels = !labels; bLab.setAttribute("aria-pressed", String(labels)); dirty = true; };
    bIn.onclick = () => { stopAuto(); tgt = {y: yaw, p: pitch, z: Math.min(8, zoom * 1.3)}; };
    bOut.onclick = () => { stopAuto(); tgt = {y: yaw, p: pitch, z: Math.max(0.4, zoom / 1.3)}; };
    bFit.onclick = () => { groups.forEach(g => { g.hidden = false; }); renderList(); Bt = bounds(); tgt = {y: 0.6, p: 0.35, z: 1}; };
    views.querySelectorAll("button").forEach(b => b.onclick = () => {
      stopAuto(); const v = VIEWS[b.dataset.v];
      // turn the short way round
      const y = v[0] + Math.round((yaw - v[0]) / (2 * Math.PI)) * 2 * Math.PI;
      tgt = {y, p: v[1], z: zoom};
    });
    sz.oninput = () => { size = +sz.value; dirty = true; };
    const refit = () => { Bt = bounds(); dirty = true; renderList(); };
    showAll.onclick = () => { groups.forEach(g => { g.hidden = false; }); refit(); };
    showAll.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showAll.click(); } };

    function renderList() {
      list.innerHTML = "";
      const mx = Math.max(1, ...groups.filter(g => !g.noise).map(g => g.n));
      const order = groups.filter(g => !g.noise).concat(groups.filter(g => g.noise));
      for (const g of order) {
        const row = el("div", {class: "m3-row" + (g.hidden ? " off" : "")}, list);
        const b = el("button", {type: "button", class: "m3-tog", "aria-pressed": String(!g.hidden),
          title: T("Click to show or hide. Double-click to show only this topic.", "انقر للإظهار أو الإخفاء. انقر مرتين لعرض هذا الموضوع وحده.")}, row);
        el("i", {style: "background:" + g.colour}, b);
        const tx = el("span", {class: "m3-txt"}, b);
        el("b", {text: (g.num != null ? g.num + ". " : "") + g.title}, tx);
        if (g.words && g.words.split(", ").slice(0, 4).join(", ") !== g.title) el("em", {text: g.words}, tx);
        if (!g.noise) el("u", {style: `background:${g.colour};width:${Math.max(5, g.n / mx * 100)}%`}, tx);
        el("strong", {text: g.n.toLocaleString()}, b);
        let clickT = null;
        b.onclick = () => { clearTimeout(clickT); clickT = setTimeout(() => { g.hidden = !g.hidden; refit(); }, 220); };
        b.ondblclick = () => {
          clearTimeout(clickT);
          const alone = groups.every(o => o === g || o.hidden) && !g.hidden;
          groups.forEach(o => { o.hidden = alone ? false : o !== g; });
          refit();
        };
        if (g.posts && opt.onPosts) {
          const pb = el("button", {type: "button", class: "m3-posts", text: T("Posts", "المنشورات"),
            "aria-label": T("Show the posts of ", "عرض منشورات ") + g.title}, row);
          pb.onclick = () => opt.onPosts(g.posts, g.title);
        }
      }
      showAll.style.display = groups.some(g => g.hidden) ? "" : "none";
    }
    renderList();
    fitSide();
    Bt = bounds(); B = {...Bt};

    resize();
    if (window.ResizeObserver) new ResizeObserver(() => { fitSide(); if (Math.abs(stage.clientWidth - W) > 1 || Math.abs(stage.clientHeight - Hh) > 1) resize(); }).observe(stage);
    else window.addEventListener("resize", resize);
    if (window.matchMedia) { const mq = matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) mq.addEventListener("change", () => { colours(); dirty = true; }); }
    requestAnimationFrame(loop);
    return Promise.resolve();
  }

  window.MarsadMap3D = {is, render, parse};
})();
