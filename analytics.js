// Visit counting for MARSAD Studio. Off until a code is filled in below.
//
// goatcounter  the code of your GoatCounter site (goatcounter.com, free for non-commercial use). If your dashboard is
//              https://marsad-studio.goatcounter.com, the code is "marsad-studio".
// cloudflare   or the token of a Cloudflare Web Analytics site (dash.cloudflare.com, Web Analytics, Add a site).
// prefix       put in front of every event, so two sites can share one GoatCounter dashboard and stay apart.
//
// What is sent: that the page was opened (with the referring site, browser, screen size and, from the network
// address, the country), which analyses are opened (their ids, such as TOPIC-3), and that a file was loaded, with
// its rough size and its source type (CrowdTangle, Meltwater ...). Never the file, its name, its posts or results.
// Neither service sets cookies. Visitors whose browser asks not to be tracked (Do Not Track or Global Privacy
// Control) are not counted.
window.MARSAD_ANALYTICS = Object.assign({
  goatcounter: "marsad-studio",
  cloudflare: "",
  prefix: "studio/",
  respect_do_not_track: true,
}, window.MARSAD_ANALYTICS_OVERRIDE || {});

window.MarsadStats = (() => {
  const cfg = window.MARSAD_ANALYTICS;
  const asked = navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl === true;
  const on = !!(cfg.goatcounter || cfg.cloudflare) && !(cfg.respect_do_not_track && asked);
  const queue = [];
  if (on && cfg.goatcounter) {
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://gc.zgo.at/count.js";
    s.dataset.goatcounter = `https://${cfg.goatcounter}.goatcounter.com/count`;
    s.onload = () => { while (queue.length) send(queue.shift()); };
    document.head.appendChild(s);
  }
  if (on && cfg.cloudflare) {
    const s = document.createElement("script");
    s.defer = true;
    s.src = "https://static.cloudflareinsights.com/beacon.min.js";
    s.dataset.cfBeacon = JSON.stringify({token: cfg.cloudflare, spa: false});
    document.head.appendChild(s);
  }
  function send(name) {
    const p = (cfg.prefix || "") + name;
    try { window.goatcounter.count({path: p, title: p, event: true}); } catch (e) { /* a blocked counter is fine */ }
  }
  // name: a short path such as "analysis/TOPIC-3"; only ids and counts, never text from the file
  function event(name) {
    if (!on || !cfg.goatcounter) return;
    if (window.goatcounter && window.goatcounter.count) send(name); else if (queue.length < 50) queue.push(name);
  }
  const sizeBand = n => n < 1000 ? "under-1k" : n < 10000 ? "1k-10k" : n < 50000 ? "10k-50k" : "50k-plus";
  return {on, event, sizeBand, service: cfg.goatcounter ? "GoatCounter" : cfg.cloudflare ? "Cloudflare Web Analytics" : ""};
})();
