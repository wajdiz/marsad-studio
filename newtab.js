/* Which links open a new tab, with the new-tab icon (the public pages do the same in site-nav.js):
   - other websites, always;
   - inside a tool (Analytics, Annotation, Studio: <script src="newtab.js" data-mode="tool">), also other MARSAD
     pages, so leaving the tool never throws away a loaded file or work in progress.
   On reading pages (the Help centre, data-mode="site") other MARSAD pages open in the same tab, so Back works.
   Left alone: links within the page, email links, logos, and links that already draw their own new-tab icon. */
(function () {
  if (window.__marsadNewTab) return; window.__marsadNewTab = true;
  var TOOL = ((document.currentScript || {}).dataset || {}).mode === "tool";
  var I = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'/%3E%3C/svg%3E";
  var M = "-webkit-mask:url(\"data:image/svg+xml," + I + "\") center/contain no-repeat;mask:url(\"data:image/svg+xml," + I + "\") center/contain no-repeat";
  var st = document.createElement("style");
  st.textContent = "a.nt::after{content:\"\";display:inline-block;width:.8em;height:.8em;margin-inline-start:.35em;vertical-align:-.04em;background:currentColor;opacity:.8;" + M + "}[dir=rtl] a.nt::after{transform:scaleX(-1)}";
  document.head.appendChild(st);
  var desc = document.createElement("span"); desc.id = "nt-desc"; desc.hidden = true;
  var say = function () { desc.textContent = (document.documentElement.lang === "ar" || document.documentElement.dir === "rtl") ? "يفتح في علامة تبويب جديدة" : "Opens in a new tab"; };
  var norm = function (p) { p = p.replace(/\.html$/, "").replace(/\/index$/, "").replace(/\/+$/, ""); return p || "/"; };
  function mark() {
    if (!desc.isConnected && document.body) { say(); document.body.appendChild(desc); }
    document.querySelectorAll("a[href]").forEach(function (a) {
      var h = a.getAttribute("href") || "";
      if (/^(#|mailto:|tel:|javascript:|blob:|data:)/i.test(h) || a.hasAttribute("download") || a.closest("[data-no-nt]")) return;
      if (a.querySelector("svg, .ico, img") && !a.textContent.trim()) return;               // a logo or an icon-only button
      if (a.querySelector(".ico.ext, svg.ext, .sh-pg") || /(^| )(sh-brand|branding|a-brand|brand)( |$)/.test(a.className)) return; // already shows the icon
      var u; try { u = new URL(a.href, location.href); } catch (e) { return; }
      if (u.origin === location.origin && norm(u.pathname) === norm(location.pathname)) return;
      if (u.origin === location.origin && !TOOL) {
        if (a.target === "_blank" && a.classList.contains("nt")) a.removeAttribute("target");
        return;
      }
      if (a.target !== "_blank") a.target = "_blank";
      if (!/noopener/.test(a.rel)) a.rel = (a.rel + " noopener").trim();
      if (!a.classList.contains("nt")) { a.classList.add("nt"); a.setAttribute("aria-describedby", "nt-desc"); }
    });
  }
  var pend = 0;
  var later = function () { if (!pend) pend = requestAnimationFrame(function () { pend = 0; mark(); }); };
  var start = function () {
    mark();
    new MutationObserver(later).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ["href"]});
    new MutationObserver(say).observe(document.documentElement, {attributes: true, attributeFilter: ["lang", "dir"]});
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
