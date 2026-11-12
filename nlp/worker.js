// MARSAD Studio: runs Transformers.js models off the page's main thread. The posts are processed here, inside this
// browser tab, and are never sent anywhere; only the model files are downloaded (from the host in nlp/models.js).
import { pipeline, env } from "./transformers.min.js";

const pipes = new Map();
let cancelled = false;

// The ONNX Runtime engine is 27 MB, over GitHub's 25 MB upload limit, so it is stored gzipped (7 MB) and unpacked
// here once per worker. Handing ONNX Runtime the bytes (wasmBinary) means it never asks for the unpacked file.
let ortBinary = null;
async function ortWasm() {
  if (ortBinary) return ortBinary;
  const url = new URL("./ort-wasm-simd-threaded.asyncify.wasm.gz", import.meta.url);
  const r = await fetch(url);
  if (!r.ok) throw new Error("could not load the language-model engine (" + r.status + "): nlp/ort-wasm-simd-threaded.asyncify.wasm.gz");
  if (typeof DecompressionStream === "undefined") throw new Error("this browser cannot unpack the language-model engine; use a recent Chrome, Edge, Firefox or Safari");
  ortBinary = await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  return ortBinary;
}

async function setup(cfg) {
  env.allowLocalModels = !!cfg.local;
  env.allowRemoteModels = !cfg.local;
  if (cfg.local) env.localModelPath = cfg.local;
  if (cfg.host) env.remoteHost = cfg.host;
  env.useBrowserCache = true;                       // model files are kept in the browser's Cache Storage
  const wasm = env.backends.onnx.wasm;
  wasm.wasmPaths = new URL("./", import.meta.url).href;   // the ONNX Runtime files served next to this file
  if (!wasm.wasmBinary) wasm.wasmBinary = await ortWasm();
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

// Names from token labels. BERT splits a word into pieces ("##" marks a piece that continues the word before); models
// like CAMeLBERT NER are trained on the first piece of each word only, so the label of a word is the label of its first
// piece, whatever the other pieces got. Words are then joined into names by their B-/I- tags.
export function groupNames(tokens) {
  const words = [];
  for (const t of tokens) {
    const w = String(t.word);
    if (/^\[(PAD|CLS|SEP|UNK|MASK)\]$/.test(w)) { words.push({text: "", entity: "O", score: 0}); continue; }
    if (w.startsWith("##") && words.length) words[words.length - 1].text += w.slice(2);
    else words.push({text: w, entity: t.entity, score: t.score});
  }
  const names = [];
  let open = null;
  for (const w of words) {
    const m = /^([BI])-(.+)$/.exec(w.entity || "");
    if (!m || !/\p{L}/u.test(w.text)) { open = null; continue; }     // punctuation never belongs to a name
    const [, tag, type] = m;
    if (tag === "I" && open && open.type === type) { open.text += " " + w.text; open.scores.push(w.score); }
    else { open = {text: w.text, type, scores: [w.score]}; names.push(open); }
  }
  return names.filter(n => /\p{L}/u.test(n.text))            // a name has at least one letter
              .map(n => [n.text, n.type, n.scores.reduce((a, b) => a + b, 0) / n.scores.length]);
}

async function ner({id, spec, texts, batch}) {
  const {p, device} = await getPipe("token-classification", spec, id);
  const n = texts.length, bs = batch || 16, order = byLength(texts), out = new Array(n);
  const t0 = performance.now();
  for (let i = 0; i < n; i += bs) {
    if (cancelled) throw new Error("cancelled");
    const idx = order.slice(i, i + bs);
    let res = await p(idx.map(k => texts[k] || " "), {ignore_labels: []});
    if (idx.length === 1 && !Array.isArray(res[0])) res = [res];
    idx.forEach((k, j) => { out[k] = groupNames(res[j] || []); });
    self.postMessage({id, type: "progress", done: Math.min(n, i + bs), total: n, ms: performance.now() - t0, device});
  }
  self.postMessage({id, type: "result", names: out, device});
}

self.onmessage = async e => {
  const m = e.data;
  if (m.cmd === "cancel") { cancelled = true; return; }
  cancelled = false;
  try {
    await setup(m.cfg || {});
    if (m.cmd === "embed") await embed(m);
    else if (m.cmd === "classify") await classify(m);
    else if (m.cmd === "ner") await ner(m);
    else throw new Error("unknown command " + m.cmd);
  } catch (err) {
    self.postMessage({id: m.id, type: "error", message: String(err && err.message || err)});
  }
};
