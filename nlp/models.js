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
// sentiment_multi  a text-classification model for the posts NOT in Arabic script in Sentiment (FRAME-7); Arabic
//             posts keep "sentiment". Set to null and only Arabic posts are labelled.
// toxicity    a multi-label text-classification model for Toxicity (FRAME-9): one score per attribute. "scope" says
//             which posts it reads ("english" = posts detected as English). Set to null, that analysis is hidden.
// preprocess  "twitter" replaces @names with @user and links with http before the model reads a post, as the
//             Cardiff Twitter models expect.
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
  sentiment_multi: {
    id: "onnx-community/twitter-xlm-roberta-base-sentiment-ONNX", dtype: "q8", mb: 279, label: "XLM-T sentiment",
    languages: "Arabic, English, French, German, Hindi, Italian, Portuguese and Spanish (other languages less reliably)",
    labels: {}, licence: "not stated on the model page", preprocess: "twitter",
    note: "XLM-T sentiment (Barbieri, Espinosa Anke and Camacho-Collados 2022; cardiffnlp/twitter-xlm-roberta-base-sentiment), "
        + "XLM-RoBERTa trained further on about 198 million tweets and fine-tuned for sentiment on tweets in eight languages, "
        + "run in the browser as an 8-bit ONNX export (onnx-community). Used for posts not written in Arabic script. Not "
        + "tested here, and its model page reports no scores; posts in languages outside its eight may be labelled less well.",
  },
  toxicity: {
    id: "Xenova/toxic-bert", dtype: "q8", mb: 111, label: "toxic-bert (Detoxify original)", scope: "english",
    languages: "English", licence: "Apache-2.0",
    note: "toxic-bert (unitary/toxic-bert, Detoxify's original model; Hanu and Unitary 2020), BERT trained on the Wikipedia "
        + "talk-page comments of the 2018 Jigsaw Toxic Comment Classification Challenge, run in the browser as an 8-bit ONNX "
        + "export (Xenova). Six scores per post: toxicity, severe toxicity, obscene, threat, insult and identity attack. "
        + "English posts only. Its authors note that swearing or insult words are likely to be scored toxic whatever the "
        + "tone, including jokes; it was trained on Wikipedia comments, not social media posts.",
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
