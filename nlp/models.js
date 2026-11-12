// Language models MARSAD Studio can run in the browser (Transformers.js, ONNX). Edit this file to change them.
//
// host        where model folders are fetched from. Hugging Face by default; to serve them yourself, copy each model
//             folder (config.json, tokenizer files, onnx/...) to your own server under <host><id>/resolve/main/ and
//             set host to that server.
// embeddings  sentence-embedding models for "Posts close to a concept" (TOPIC-3) and for Topics (TOPIC-1).
//             "ar" is offered first for Arabic files, "multi" for everything else.
// sentiment   a text-classification model for Sentiment (FRAME-7). Set to null, that analysis is hidden. Any model
//             in the Transformers.js layout works (research_tools/convert_to_onnx.py converts a Hugging Face one).
//             labels maps the model's own label names to negative, neutral and positive.
// ner         a token-classification model for Named entities (WORDS-13), BIO labels. Set to null, it is hidden.
//             types maps the model's entity types to the names shown.
window.MARSAD_MODELS = Object.assign({
  host: "https://huggingface.co/",
  embeddings: {
    ar: {
      id: "adelpro/atm-v2-web", dtype: "q8", pooling: "mean", dim: 768, keep_dim: 256, mb: 137,
      label: "Arabic Triplet Matryoshka V2 (ATM-V2)", languages: "Arabic", licence: "Apache-2.0",
      source: "Omartificial-Intelligence-Space/Arabic-Triplet-Matryoshka-V2, INT8 ONNX export by adelpro",
    },
    multi: {
      id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2", dtype: "q8", pooling: "mean", dim: 384, mb: 135,
      label: "paraphrase-multilingual-MiniLM-L12-v2", languages: "about 50 languages", licence: "Apache-2.0",
      source: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2, ONNX export by Xenova",
    },
  },
  sentiment: {
    id: "wajdiz/camelbert-mix-sentiment-onnx", dtype: "q8", mb: 110, label: "CAMeLBERT Mix sentiment", languages: "Arabic",
    labels: {}, licence: "Apache-2.0",
    note: "CAMeLBERT Mix SA (Inoue et al. 2021), fine-tuned on ASTD, ArSAS and SemEval-2017 Arabic tweets, run in the "
        + "browser as an 8-bit ONNX export. Macro F1 0.612 on the 3,000 ArSarcasm-v2 test tweets (the quick word model: "
        + "0.54); ArSarcasm-v2 reuses tweets from ASTD and SemEval-2017, so some test tweets may have been in its training "
        + "data and the figure on new posts can be lower. Arabic posts only; the first 600 characters of each.",
  },
  ner: {
    id: "wajdiz/camelbert-mix-ner-onnx", dtype: "q8", mb: 110, label: "CAMeLBERT Mix NER", languages: "Arabic",
    licence: "Apache-2.0",
    types: {PERS: "People", LOC: "Places", ORG: "Organizations", MISC: "Other names"},
    note: "CAMeLBERT Mix NER (Inoue et al. 2021), fine-tuned on ANERcorp (Modern Standard Arabic news; people, places, "
        + "organizations and other names), run in the browser as an 8-bit ONNX export. No score was measured here; trained "
        + "on news, it finds fewer names in dialect posts.",
  },
  sample: 5000,         // default number of posts for a first run on a large file
  batch: 16,
  local: null,          // a folder on this site holding model folders, used instead of host (testing, offline use)
}, window.MARSAD_MODELS_OVERRIDE || {});
