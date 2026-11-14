<img src="assets/marsad-logo-256.png" alt="MARSAD" width="88" align="right">

# MARSAD Studio

A social media and text analysis dashboard that runs entirely in your browser. Load a file and get 102
analyses over it. Nothing is installed, no account is needed, and the file never leaves your computer:
the Python that does the work runs inside the page itself.

**Live: https://wajdiz.github.io/marsad-studio**

Studio is the analysis half of MARSAD Analytics. It reads files and nothing else. It makes no request to
any platform, holds no API key, and has no login. Collection happens elsewhere, in the MARSAD platform or in
a tool like Zeeschuimer, and this page reads what those produce.

## What it does

**Reads the files researchers already have.** CSV, Excel, JSON or NDJSON, also inside a ZIP or GZ file. Exports from CrowdTangle, Meta
Content Library, Meltwater, Communalytic, Zeeschuimer and the common API dumps are recognised and mapped
automatically, so no column has to be renamed. A file it does not recognise is read generically, and it
tells you which columns it matched to what.

**Checks the file before it counts anything.** Duplicate text, posts too short to analyse, missing
engagement columns, mixed time zones, reach reported where interactions are not: each one is stated above
the results in plain words, with the number of rows it affects.

**Runs 102 analyses**, in the sections the menu shows.

| Section | Analyses |
| --- | --- |
| Society | 17 |
| Words | 13 |
| Spread and facts | 11 |
| Ways of speaking | 10 |
| Reactions | 10 |
| Check my data | 8 |
| When | 8 |
| People | 8 |
| Feelings and tone | 9 |
| Topics | 5 |
| My report | 3 |

Every one of them runs here. Analyses that need a GPU, a Python package with no browser build, or an API
are not in this version at all, rather than listed with a notice that they cannot run. What is left
covers the same ground in two ways:

- **Word models and word lists built for Arabic**, which run on the file at once: sentiment, emotion,
  offensive language, sarcasm, hate speech, dialect region, propaganda-technique wording and the Society
  measures, and names mentioned together. They are small (TF-IDF and logistic regression, stored as JSON) and score 50,000 posts in a
  few seconds. Each one's held-out scores are in its Help page and in the notes under its result.
- **A language model the page runs itself**, for the analyses that need meaning rather than words:
  *Posts about an idea*, *Posts like this one*, *How the meaning moves over time*, *Same message,
  different words* and, once one of these has run, *Main topics*. The model reads the posts once; all five
  use that one reading. Three more analyses work the same way: *Positive or negative?* (CAMeLBERT Mix
  sentiment for Arabic posts, XLM-T sentiment for the rest), *Toxic language* (toxic-bert, English posts)
  and *Named entities (language model)* (CAMeLBERT Mix NER). The page asks first, downloads the model
  once (about 135 MB: an Arabic model for Arabic files, a multilingual one otherwise), runs it in a
  background thread of the browser, and keeps the result in the browser so the same file is not redone.
  On a large file it reads a random sample of 5,000 posts unless you ask for all of them.

| Analysis | How it works here | Held-out result |
| --- | --- | --- |
| Sarcasm (FRAME-21) | Word model, ArSarcasm-v2 | macro F1 0.64 (always "not sarcastic": 0.42). Marked experimental |
| Hate speech (FRAME-22) | Word model, L-HSAB, T-HSAB and MLMA | macro F1 0.68; 0.56 to 0.62 on a dataset it did not see. Marked experimental |
| Dialect region (DATA-3) | Word model, ArSarcasm-v2 and QADI | macro F1 0.61 on the 31% of posts it is sure of; 0.41 on all. Marked experimental |
| Words used in the same way (TOPIC-2) | Word vectors learned from your file (PPMI and SVD) | no training data; nothing downloaded |
| Posts about an idea (TOPIC-3) | ATM-V2 or multilingual MiniLM, in the browser | see the model cards on Hugging Face |
| Posts like this one (TOPIC-4) | Same model; closest posts to one you pick | as above |
| How the meaning moves over time (TOPIC-5) | Same model; average meaning per period | as above |
| Same message, different words (SPREAD-14) | Same model; groups of posts with nearly the same meaning, at most 10,000 compared | as above |
| Positive or negative? (FRAME-7) | CAMeLBERT Mix sentiment, in the browser, Arabic posts | macro F1 0.612 on the ArSarcasm-v2 test tweets (word model: 0.54); may include tweets from its training data |
| Positive or negative? (FRAME-7), other languages | XLM-T sentiment, in the browser, posts not in Arabic script | not measured here; its model page reports no scores |
| Toxic language (FRAME-9) | toxic-bert (Detoxify original), in the browser, English posts: six scores | not measured here; trained on Wikipedia talk-page comments |
| Named entities (WORDS-13) | CAMeLBERT Mix NER, in the browser, Arabic posts; says which names the name list lacked | not measured; trained on MSA news |
| Names mentioned together (WORDS-12) | Name list; a co-occurrence network, not relations | no model |
| How the text is cleaned (DATA-8) | Each cleaning rule counted, and the spellings each counted word stands for | no model |

**Handles a file too large for a browser.** Above 40 MB the file is not opened. It is read in slices
instead, which costs no memory, and you are told how many rows it has and what columns it carries. From
there you can keep a sample (at random, the most engaged, keeping the share of any column, or spread
evenly over time), set a word-length range and a date range, drop repeated text, or split the file into
parts. Every sample records its seed, so the same settings return the same rows. A sample can also be
downloaded as a pack ready for annotation: one file per annotator with the same posts in a different
order, a shared calibration set, and a record of how it was drawn.

**Works in Arabic and English.** The whole interface switches, right to left included. The Arabic language
tools (dialect identification, sentiment, stance, named entities, politeness, sarcasm) are built for Arabic
specifically rather than translated from English ones. Arabic writes the conjunction, the preposition and
the article joined to the next word, so before anything is counted those come off: الحكومة، والحكومة،
بالحكومة and للحكومة are one word, not four. A word that merely begins with one of those letters, such as
وزير or فلسطين, is left alone. The switch sits beside the time zone and can be turned off.

**Gives the work back.** Every chart downloads as PNG or SVG, every table as Excel or CSV, the network
graphs as GraphML for Gephi, the whole session as a draft report, and the cleaned dataset itself as a CSV
so any number on screen can be checked by hand.

## Running it

It is a static site. Open `index.html` over HTTP, or publish the folder with GitHub Pages. There is no
build step and no server to run. The first load fetches about 25 MB of Python runtime and word lists, then
caches them.

### Four files to add before it will run

The Python runtime, the chart library and the word lists are third-party files, identical to the ones in
the `marsad-analytics` repository and unchanged by this build. They are not in this archive because of
their size. Copy them across, keeping the paths:

| From `marsad-analytics` | Size |
| --- | --- |
| `pyodide/` (the whole folder, 9 files) | 42 MB |
| `bundle_py.zip.wasm` | 6.8 MB |
| `wordfreq_data.zip.wasm` | 6.6 MB |
| `plotly.min.js` | 4.8 MB |

The page will load without them and then stop at "Loading", because the analyses have nowhere to run.

## The logos

`assets/logo-nuq.png`, `assets/logo-qrdi.png` and `assets/logo-hbku.png` are placeholders. Replace the three
files, keeping the names, and the footer picks them up. They are shown 46 px tall, so supply them at roughly
three times that height with a transparent background. Nothing else needs editing.

## Privacy

The file you open is read inside the browser. No part of it is uploaded. The page makes no request to any
server other than the one serving these files, except the visit counter when it is switched on (see Counting
visits) and one more you are asked about first: the two
analyses that use a language model (seven of them) download the model files from Hugging Face (or from the host set in
`nlp/models.js`, which can be your own server). The model runs in your browser; your posts are not sent
with that request or any other. Closing the tab discards your file. The model files and the results the
model computed stay in the browser's storage so the next visit is quicker; clearing the site's data in the
browser removes them.

## Counting visits

`analytics.js` counts visits with [GoatCounter](https://www.goatcounter.com) (free for non-commercial use) or
Cloudflare Web Analytics, and is off until you put your site code in it. When it is on, it sends that the page was
opened (the country comes from the network address; also the referring site, browser and screen size), which
analyses are opened, and that a file was loaded with its rough size and source type. It never sends the file, its
name, its posts or any result. Neither service sets cookies. Visitors whose browser asks not to be tracked are not
counted, and the start page says that visits are counted.

The numbers are close, not exact: browsers and extensions that block trackers also block these counters, and a
"unique visitor" is one browser on one day, so a person who comes back the next day counts twice.

## Language models in the browser

The `nlp/` folder holds the runtime: Transformers.js 4.3.2 (`transformers.min.js`, Apache-2.0) and the
WebAssembly build of ONNX Runtime it needs (`ort-wasm-simd-threaded.asyncify.mjs` and the engine itself, MIT,
fetched only when a model is used). The engine is 27 MB, over GitHub's 25 MB upload limit, so it is stored gzipped as
`ort-wasm-simd-threaded.asyncify.wasm.gz` (7 MB) and unpacked in the browser by `nlp/worker.js`. `nlp/models.js` lists the models and is the one file to edit:

- `embeddings.ar`: [Arabic Triplet Matryoshka V2](https://huggingface.co/Omartificial-Intelligence-Space/Arabic-Triplet-Matryoshka-V2)
  in the INT8 export [adelpro/atm-v2-web](https://huggingface.co/adelpro/atm-v2-web), Apache-2.0. Vectors
  are cut to their first 256 dimensions, which Matryoshka training allows.
- `embeddings.multi`: [paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
  in the ONNX export [Xenova/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2).
- `sentiment`: [CAMeLBERT Mix SA](https://huggingface.co/CAMeL-Lab/bert-base-arabic-camelbert-mix-sentiment)
  in the INT8 export [wajdiz/camelbert-mix-sentiment-onnx](https://huggingface.co/wajdiz/camelbert-mix-sentiment-onnx),
  Apache-2.0.
- `sentiment_multi`: [XLM-T sentiment](https://huggingface.co/cardiffnlp/twitter-xlm-roberta-base-sentiment)
  (Barbieri, Espinosa Anke and Camacho-Collados 2022; fine-tuned on tweets in Arabic, English, French, German,
  Hindi, Italian, Portuguese and Spanish) in the INT8 export
  [onnx-community/twitter-xlm-roberta-base-sentiment-ONNX](https://huggingface.co/onnx-community/twitter-xlm-roberta-base-sentiment-ONNX),
  about 280 MB, for posts not written in Arabic script. Its model page states no licence; check it before
  any use beyond research.
- `toxicity`: [toxic-bert](https://huggingface.co/unitary/toxic-bert) (Detoxify's original model, Apache-2.0)
  in the INT8 export [Xenova/toxic-bert](https://huggingface.co/Xenova/toxic-bert), about 110 MB, English posts:
  toxicity, severe toxicity, obscene, threat, insult and identity attack. Detoxify's multilingual model has
  no browser export yet; Arabic posts are covered by the offensive-language and hate speech word models. The
  network analyzer's toxicity filter uses these scores, or the offensive-language word model for Arabic
  posts when Toxicity has not been run.
- `ner`: [CAMeLBERT Mix NER](https://huggingface.co/CAMeL-Lab/bert-base-arabic-camelbert-mix-ner) in the INT8
  export [wajdiz/camelbert-mix-ner-onnx](https://huggingface.co/wajdiz/camelbert-mix-ner-onnx), Apache-2.0.
  The two CAMeLBERT models were converted with `research_tools/convert_models_colab.ipynb`, which runs
  `research_tools/convert_to_onnx.py`. Set any of these to `null` to hide its analysis.

Speed depends on the computer. GitHub Pages cannot send the headers that let WebAssembly use more than one
processor core, so the model runs on one core there; the progress bar shows the time left after the first
batches.

## Word models

`research_tools/train_browser_models.py` trains the sarcasm, hate speech and dialect models from public
data, writes them to `marsad_analytics/resources/models/`, and checks that the JSON model gives exactly the
same labels as the scikit-learn one. It also takes MADAR Corpus-26 (`--madar`), which should improve the
dialect model a good deal, and a hope speech file (`--hope`). The data: ArSarcasm-v2 (Abu Farha, Zaghouani
and Magdy 2021, MIT), L-HSAB (Mulki et al. 2019), T-HSAB (Haddad, Mulki and Oueslati 2019), the Arabic part
of MLMA (Ousidhoum et al. 2019, MIT) and the QADI test set (Abdelali et al. 2021). L-HSAB, T-HSAB and QADI
are released for research with a request to cite them and state no licence; the model files hold learned
word weights, not their posts.

`research_tools/evaluate_word_models.py` runs the shipped sentiment, sarcasm, hate speech, dialect and emotion
models on their held-out test sets, stops if it cannot reproduce the scores already stored in them, and writes a
confusion matrix into each model file (plus the emotion model's per-label scores, which it lacked). The tables
are in the Help page *Arabic word models and named entities*. The hate speech, sarcasm and dialect results carry
an "Experimental" banner above the chart, in English and Arabic.

## Licence and credit

This repository has no licence declared yet. Until one is added, the default applies: all rights reserved,
and others may read the code but may not reuse it. Add a LICENSE file to change that.

Built for the MARSAD Observatory at Northwestern University in Qatar. When MARSAD Analytics contributes to
published work, please cite the observatory.
