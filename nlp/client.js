// MARSAD Studio: the page's side of the language-model worker (nlp/worker.js), and a small IndexedDB store so that
// posts embedded once are not embedded again when the same file is opened later in this browser.
window.MarsadNLP = (() => {
  const BASE = new URL(".", document.currentScript.src).href;
  let worker = null, seq = 0;
  const jobs = new Map();

  const supported = () => typeof Worker !== "undefined" && typeof WebAssembly === "object" && typeof indexedDB !== "undefined";

  function ensure() {
    if (worker) return worker;
    worker = new Worker(BASE + "worker.js", {type: "module"});
    worker.onmessage = e => {
      const m = e.data, j = jobs.get(m.id);
      if (!j) return;
      if (m.type === "result") { jobs.delete(m.id); j.resolve(m); }
      else if (m.type === "error") { jobs.delete(m.id); j.reject(new Error(m.message)); }
      else if (j.onProgress) j.onProgress(m);
    };
    worker.onerror = e => {
      const err = new Error(e.message || "The model worker stopped.");
      jobs.forEach(j => j.reject(err)); jobs.clear(); worker = null;
    };
    return worker;
  }

  function run(cmd, spec, texts, onProgress) {
    const cfg = window.MARSAD_MODELS || {};
    const id = ++seq;
    return new Promise((resolve, reject) => {
      jobs.set(id, {resolve, reject, onProgress});
      ensure().postMessage({cmd, id, spec, texts, batch: cfg.batch || 16, cfg: {host: cfg.host, local: cfg.local}});
    });
  }

  function cancel() { if (worker) worker.postMessage({cmd: "cancel"}); }

  // cyrb53: a fast 53-bit hash, enough to tell one list of posts from another
  function hash(texts) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (const t of texts) {
      for (let i = 0; i < t.length; i++) {
        const c = t.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
      }
      h1 = Math.imul(h1 ^ 1, 2654435761);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + "-" + texts.length;
  }

  function db() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open("marsad-nlp", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("results");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function cacheGet(key) {
    try {
      const d = await db();
      return await new Promise(res => {
        const q = d.transaction("results").objectStore("results").get(key);
        q.onsuccess = () => res(q.result || null); q.onerror = () => res(null);
      });
    } catch (e) { return null; }
  }
  async function cachePut(key, value) {
    try {
      const d = await db();
      await new Promise(res => {
        const tx = d.transaction("results", "readwrite");
        tx.objectStore("results").put(value, key);
        tx.oncomplete = res; tx.onerror = res; tx.onabort = res;
      });
    } catch (e) { /* a full or blocked store only costs a recomputation next time */ }
  }
  async function cacheClear() {
    try { const d = await db(); d.transaction("results", "readwrite").objectStore("results").clear(); } catch (e) {}
    try { await caches.delete("transformers-cache"); } catch (e) {}
  }

  return {supported, run, cancel, hash, cacheGet, cachePut, cacheClear};
})();
