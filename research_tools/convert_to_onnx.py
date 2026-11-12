"""Convert a Hugging Face classifier into the folder layout Transformers.js loads in the browser, check it, and
(optionally) upload it to your Hugging Face account. Studio then downloads it from there.

Two kinds of model:
  --kind sentiment   text classification, one label per post (for example CAMeL-Lab/bert-base-arabic-camelbert-mix-sentiment)
  --kind ner         token classification, one label per word (for example CAMeL-Lab/bert-base-arabic-camelbert-mix-ner)

Run it in Colab (research_tools/convert_models_colab.ipynb does every step), or on any computer that reaches Hugging Face:

  pip install "optimum-onnx[onnxruntime]" huggingface_hub pandas scikit-learn
  python convert_to_onnx.py --kind sentiment --model CAMeL-Lab/bert-base-arabic-camelbert-mix-sentiment \
      --out camelbert-mix-sentiment-onnx --arsarcasm ArSarcasm-v2/ArSarcasm-v2/testing_data.csv \
      --push <your-account>/camelbert-mix-sentiment-onnx

Since Optimum 2, the ONNX tools are in the separate package optimum-onnx; "optimum[onnxruntime]" no longer installs them.

The output folder holds config.json, the tokenizer files, a README with the source and licence, and
onnx/model_quantized.onnx (INT8 dynamic quantization, about a quarter of the full size): what Transformers.js fetches
for dtype "q8". The uploaded repository must be public, because the browser downloads it without a login.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil

README = """---
license: {licence}
base_model: {model}
library_name: transformers.js
tags: [onnx, transformers.js, arabic]
---

# {name}

INT8 ONNX export of [{model}](https://huggingface.co/{model}) for Transformers.js, made with
`research_tools/convert_to_onnx.py` of MARSAD Studio. The weights are those of the original model, quantized to 8 bits
(dynamic quantization); the licence and the citation are the original model's. {score}
"""


def export(model_id: str, out: str, kind: str) -> str:
    from optimum.onnxruntime import ORTModelForSequenceClassification, ORTModelForTokenClassification, ORTQuantizer
    from optimum.onnxruntime.configuration import AutoQuantizationConfig
    from transformers import AutoTokenizer

    tmp = out + "_fp32"
    cls = ORTModelForTokenClassification if kind == "ner" else ORTModelForSequenceClassification
    cls.from_pretrained(model_id, export=True).save_pretrained(tmp)
    AutoTokenizer.from_pretrained(model_id, use_fast=True).save_pretrained(tmp)   # writes tokenizer.json
    ORTQuantizer.from_pretrained(tmp).quantize(
        quantization_config=AutoQuantizationConfig.avx2(is_static=False, per_channel=False), save_dir=out)
    os.makedirs(os.path.join(out, "onnx"), exist_ok=True)
    q = [f for f in os.listdir(out) if f.endswith(".onnx")][0]
    shutil.move(os.path.join(out, q), os.path.join(out, "onnx", "model_quantized.onnx"))
    for f in os.listdir(tmp):            # config and tokenizer files at the top of the folder
        if f.endswith((".json", ".txt", ".model")) and not os.path.exists(os.path.join(out, f)):
            shutil.copy(os.path.join(tmp, f), out)
    shutil.rmtree(tmp)
    if not os.path.exists(os.path.join(out, "tokenizer.json")):
        raise SystemExit("No tokenizer.json was written: Transformers.js needs it. Check that the model has a fast tokenizer.")
    return os.path.join(out, "onnx", "model_quantized.onnx")


def _session(out):
    import onnxruntime as ort
    from transformers import AutoTokenizer
    s = ort.InferenceSession(os.path.join(out, "onnx", "model_quantized.onnx"))
    return AutoTokenizer.from_pretrained(out), s, {i.name for i in s.get_inputs()}


def evaluate_sentiment(out: str, test_csv: str) -> dict:
    """Macro F1 on the ArSarcasm-v2 test tweets (NEG/NEU/POS), the set the MARSAD word model reports on (0.54)."""
    import pandas as pd
    from sklearn.metrics import f1_score
    cfg = json.load(open(os.path.join(out, "config.json")))
    id2label = {int(k): v.lower() for k, v in cfg["id2label"].items()}
    d = pd.read_csv(test_csv)
    tok, sess, names = _session(out)
    pred = []
    for i in range(0, len(d), 32):
        enc = tok(d["tweet"].iloc[i:i + 32].tolist(), padding=True, truncation=True, max_length=128, return_tensors="np")
        pred += [id2label[j] for j in sess.run(None, {k: v for k, v in enc.items() if k in names})[0].argmax(1)]
    gold = d["sentiment"].map({"NEG": "negative", "NEU": "neutral", "POS": "positive"})
    unknown = sorted(set(pred) - {"negative", "neutral", "positive"})
    return {"macro_f1_arsarcasm_test": round(f1_score(gold, pred, average="macro"), 3), "test_items": int(len(d)),
            "labels_returned": sorted(set(pred)),
            "labels_to_map_in_models_js": unknown or "none: the labels are already negative, neutral and positive"}


def check_ner(out: str) -> dict:
    """A quick look at what the NER model finds in two sentences, and its label set."""
    import numpy as np
    cfg = json.load(open(os.path.join(out, "config.json")))
    id2label = {int(k): v for k, v in cfg["id2label"].items()}
    tok, sess, names = _session(out)
    found = []
    for text in ["زار أمير قطر الشيخ تميم بن حمد العاصمة الفرنسية باريس", "أعلنت منظمة الصحة العالمية عن خطة جديدة في جنيف"]:
        enc = tok([text], return_tensors="np", truncation=True, max_length=128)
        lab = sess.run(None, {k: v for k, v in enc.items() if k in names})[0][0].argmax(-1)
        words = tok.convert_ids_to_tokens(enc["input_ids"][0])
        found.append([(w, id2label[int(l)]) for w, l in zip(words, lab) if id2label[int(l)] != "O"])
    return {"labels": sorted(set(id2label.values())), "examples": found}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=["sentiment", "ner"], default="sentiment")
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--arsarcasm", default=None, help="ArSarcasm-v2 testing_data.csv, to score a sentiment model")
    ap.add_argument("--licence", default="apache-2.0")
    ap.add_argument("--push", default=None, help="your-account/repo-name on Hugging Face (needs a write token)")
    a = ap.parse_args()
    path = export(a.model, a.out, a.kind)
    print("written", path, round(os.path.getsize(path) / 1048576), "MB")
    score = ""
    if a.kind == "sentiment" and a.arsarcasm:
        ev = evaluate_sentiment(a.out, a.arsarcasm)
        print(json.dumps(ev, indent=1, ensure_ascii=False))
        print("For comparison, the MARSAD word model (FRAME-15) scores macro F1 0.54 on the same test set.")
        score = (f"Macro F1 {ev['macro_f1_arsarcasm_test']} on the {ev['test_items']:,} ArSarcasm-v2 test tweets, "
                 "measured on this quantized version.")
    if a.kind == "ner":
        print(json.dumps(check_ner(a.out), indent=1, ensure_ascii=False))
    with open(os.path.join(a.out, "README.md"), "w", encoding="utf-8") as f:
        f.write(README.format(licence=a.licence, model=a.model, name=os.path.basename(a.out.rstrip("/")), score=score))
    if a.push:
        from huggingface_hub import HfApi
        api = HfApi()
        api.create_repo(a.push, exist_ok=True, private=False)
        api.upload_folder(folder_path=a.out, repo_id=a.push)
        print("uploaded: https://huggingface.co/" + a.push)


if __name__ == "__main__":
    main()
