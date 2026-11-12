// MARSAD Studio: runs Transformers.js models off the page's main thread. The posts are processed here, inside this
// browser tab, and are never sent anywhere; only the model files are downloaded (from the host in nlp/models.js).
import { pipeline, env } from "./transformers.min.js";

const pipes = new Map();
let cancelled = false;

function setup(cfg) {
  env.allowLocalModels = !!cfg.local;
  env.allowRemoteModels = !cfg.local;
  if (cfg.local) env.localModelPath = cfg.local;
  if (cfg.host) env.remoteHost = cfg.host;
  env.useBrowserCache = true;                       // model files are kept in the browser's Cache Storage
  const wasm = env.backends.onnx.wasm;
  wasm.wasmPaths = new URL("./", import.meta.url).href;   // the ONNX Runtime files served next to this file
  if (self.crossOriginIsolated) wasm.numThreads = Math.min(8, self.navigator?.hardwareConcurrency || 4);
}

async function getPipe(task, spec, id) {
  const key = task + "|" + spec.id + "|" + (spec.dtype || "");
  if (pipes.has(key)) return pipes.get(key);
  const progress = x => {
    if (x && (x.status === "progress" || x.status === "done"))
      self.postMessage({id, type: "download", file: x.file, loaded: x.loaded || 0, total: x.total || 0, status: x.status});
  };
  const device = spec.device || "wasm";
  const p = await pipeline(task, spec.id, {dtype: spec.dtype, device, progress_callback: progress});
  const r = {p, device};
  pipes.set(key, r);
  return r;
}

// Shortest posts first, so a batch holds posts of similar length and little time goes on padding.
const byLength = texts => [...texts.keys()].sort((a, b) => texts[a].length - texts[b].length);

async function embed({id, spec, texts, batch}) {
  const {p, device} = await getPipe("feature-extraction", spec, id);
  const n = texts.length, keep = spec.keep_dim || spec.dim, bs = batch || 16, order = byLength(texts);
  const out = new Float32Array(n * keep);
  const t0 = performance.now();
  for (let i = 0; i < n; i += bs) {
    if (cancelled) throw new Error("cancelled");
    const idx = order.slice(i, i + bs);
    const t = await p(idx.map(k => texts[k] || " "), {pooling: spec.pooling || "mean", normalize: false});
    const d = t.dims[t.dims.length - 1], data = t.data;
    // Matryoshka models keep their meaning in the first dimensions: cut, then scale to length 1
    idx.forEach((k, j) => {
      let s = 0;
      for (let c = 0; c < keep; c++) { const v = data[j * d + c]; out[k * keep + c] = v; s += v * v; }
      s = Math.sqrt(s) || 1;
      for (let c = 0; c < keep; c++) out[k * keep + c] /= s;
    });
    if (t.dispose) t.dispose();
    self.postMessage({id, type: "progress", done: Math.min(n, i + bs), total: n, ms: performance.now() - t0, device});
  }
  self.postMessage({id, type: "result", data: out, dim: keep, device}, [out.buffer]);
}

async function classify({id, spec, texts, batch}) {
  const {p, device} = await getPipe("text-classification", spec, id);
  const n = texts.length, bs = batch || 16, order = byLength(texts);
  const labels = new Array(n), scores = new Float32Array(n), map = spec.labels || {};
  const t0 = performance.now();
  for (let i = 0; i < n; i += bs) {
    if (cancelled) throw new Error("cancelled");
    const idx = order.slice(i, i + bs);
    let res = await p(idx.map(k => texts[k] || " "), {top_k: 1});
    if (!Array.isArray(res)) res = [res];
    idx.forEach((k, j) => {
      const r = Array.isArray(res[j]) ? res[j][0] : res[j];
      const raw = String(r.label);
      labels[k] = map[raw] || map[raw.toLowerCase()] || raw.toLowerCase();
      scores[k] = r.score;
    });
    self.postMessage({id, type: "progress", done: Math.min(n, i + bs), total: n, ms: performance.now() - t0, device});
  }
  self.postMessage({id, type: "result", labels, scores, device}, [scores.buffer]);
}

self.onmessage = async e => {
  const m = e.data;
  if (m.cmd === "cancel") { cancelled = true; return; }
  cancelled = false;
  try {
    setup(m.cfg || {});
    if (m.cmd === "embed") await embed(m);
    else if (m.cmd === "classify") await classify(m);
    else throw new Error("unknown command " + m.cmd);
  } catch (err) {
    self.postMessage({id: m.id, type: "error", message: String(err && err.message || err)});
  }
};
