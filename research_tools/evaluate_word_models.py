"""Confusion matrices for the word models Studio ships, and held-out numbers for the emotion model.

The shipped JSON models are run through wordmodels.py, the same code the browser runs, on the same held-out data their
training used. Before anything is written, the script checks that it reproduces the scores already stored in each
model; if one does not match, it stops, because the test set would then not be the one the model was scored on.

  sentiment  ArSarcasm-v2 test (3,000 tweets)
  sarcasm    ArSarcasm-v2 test (3,000 tweets)
  hate       random 20% of L-HSAB, T-HSAB and MLMA Arabic (seed 7), as in train_browser_models.py
  dialect    ArSarcasm-v2 test dialect labels and 30% of the QADI test set, as in train_browser_models.py
  emotion    ExaAEC, the 30% left out of training (numpy RandomState(7) permutation, first 70% for training).
             The emotion model has no stored scores to compare with, so the split is checked another way: every
             word in the model must occur in the 70% training part, which only holds for the split it was built on.
  offensive  not covered yet: its 14 source datasets are not among the public clones above.

Each matrix is stored in the model's JSON as "confusion": rows are the true label, columns the label the model gave.

Usage:
  python -I evaluate_word_models.py --src /path/with/marsad_analytics --data /path/to/clones --exaaec ExaAEC.csv [--write]
"""
from __future__ import annotations

import argparse
import ast
import importlib.util
import json
import os
import sys
from collections import Counter

import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, f1_score, precision_recall_fscore_support


def trainer():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "train_browser_models.py")
    spec = importlib.util.spec_from_file_location("train_browser_models", p)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def matrix(y, p, labels, test_set):
    m = confusion_matrix(y, p, labels=labels)
    return {"test_set": test_set, "rows": "true label", "columns": "label given by the model",
            "labels": [str(x) for x in labels], "matrix": m.astype(int).tolist()}


def close(a, b, tol=0.006):
    return abs(float(a) - float(b)) <= tol


def binary(W, T, name, texts, y, test_set, pos):
    on, _p = W.predict(name, list(texts))
    p = np.asarray(on).astype(int)
    stored = W.load(name)["evaluation"]
    pr, rc, _f, _ = precision_recall_fscore_support(y, p, average="binary", zero_division=0)
    got = {"macro_f1": f1_score(y, p, average="macro"), "precision": pr, "recall": rc}
    want = {"macro_f1": stored["macro_f1"], "precision": stored["classes"][pos]["precision"],
            "recall": stored["classes"][pos]["recall"]}
    ok = all(close(got[k], want[k]) for k in want)
    lab = np.where(p == 1, pos, "not " + pos)
    tru = np.where(np.asarray(y) == 1, pos, "not " + pos)
    return ok, got, want, matrix(tru, lab, ["not " + pos, pos], test_set)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--exaaec", required=True)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    sys.path.insert(0, a.src)
    from marsad_analytics import wordmodels as W
    from marsad_analytics.textnorm import tokenize
    T = trainer()
    from sklearn.model_selection import train_test_split

    out, report = {}, {}

    # sarcasm and sentiment: the ArSarcasm-v2 test set
    _tr, te = T.arsarcasm(a.data)
    ok, got, want, cm = binary(W, T, "sarcasm", te["tweet"], te["sarcasm"].astype(int).values,
                               "ArSarcasm-v2 test (3,000 tweets)", "sarcastic")
    out["sarcasm"], report["sarcasm"] = cm, {"reproduced": ok, "got": got, "stored": want}

    lab, _ = W.predict("sentiment", list(te["tweet"]))
    lab, y = np.asarray(lab).astype(str), te["sentiment"].astype(str).values
    stored = W.load("sentiment")["eval_by_class"]["classes"]
    names = {"NEG": "negative", "NEU": "neutral", "POS": "positive"}
    P, R, _F, _ = precision_recall_fscore_support(y, lab, labels=list(names), zero_division=0)
    ok = all(close(P[i], stored[n]["precision"]) and close(R[i], stored[n]["recall"]) for i, n in enumerate(names.values()))
    out["sentiment"] = matrix([names[v] for v in y], [names[v] for v in lab], list(names.values()),
                              "ArSarcasm-v2 test (3,000 tweets)")
    report["sentiment"] = {"reproduced": ok, "macro_f1": round(f1_score(y, lab, average="macro"), 3)}

    # hate: the split in train_browser_models.train_hate
    d = T.hate_sets(a.data)
    _tr, te = train_test_split(d, test_size=0.2, random_state=T.SEED, stratify=d["dataset"] + d["hate"].astype(str))
    ok, got, want, cm = binary(W, T, "hate", te["text"], te["hate"].values,
                               f"random 20% of L-HSAB, T-HSAB and MLMA Arabic ({len(te):,} posts)", "hate")
    out["hate"], report["hate"] = cm, {"reproduced": ok, "got": got, "stored": want}

    # dialect: every test post, and the posts at or above the model's min_score (the ones Studio counts)
    _tr, te = T.dialect_sets(a.data)
    m = W.load("dialect")
    lab, pr = W.predict("dialect", list(te["text"]))
    lab, y = np.asarray(lab).astype(str), te["label"].astype(str).values
    classes = m["classes"]
    got = f1_score(y, lab, average="macro")
    k = pr >= m.get("min_score", 0.4)
    got_k = f1_score(y[k], lab[k], average="macro")
    ok = close(got, m["evaluation"]["macro_f1"]) and close(got_k, m["evaluation"]["min_score_0.4"]["macro_f1_labelled"])
    ts = m["evaluation"]["test_set"]
    out["dialect"] = matrix(y, lab, classes, ts)
    out["dialect"]["confident_only"] = matrix(y[k], lab[k], classes, ts + f", posts with a score of at least "
                                              f"{m.get('min_score', 0.4)} ({int(k.sum()):,} of {len(k):,})")["matrix"]
    report["dialect"] = {"reproduced": ok, "macro_f1": round(got, 3), "macro_f1_confident": round(got_k, 3)}

    # emotion: ExaAEC, the 30% the model was not trained on
    ex = pd.read_csv(a.exaaec)
    m = W.load("emotion")
    EMO = m["classes"]
    gold = ex["label"].map(lambda s: set(ast.literal_eval(s)))
    Y = np.array([[e in g for e in EMO] for g in gold], dtype=int)
    idx = np.random.RandomState(7).permutation(len(ex))
    cut = int(0.7 * len(ex))
    trn, tst = idx[:cut], idx[cut:]
    words = [w for w in m["vocab"] if not w.startswith("c:")]
    df = Counter(w for i in trn for w in set(tokenize(str(ex.text.iloc[i]))))
    split_ok = all(df[w] > 0 for w in words)
    _labs, P = W.predict("emotion", list(ex.text.iloc[tst]))
    pred = (P >= np.asarray(m["thresholds"])).astype(int)
    Yt = Y[tst]
    per, counts = {}, {}
    for j, e in enumerate(EMO):
        p_, r_, f_, _ = precision_recall_fscore_support(Yt[:, j], pred[:, j], average="binary", zero_division=0)
        per[e] = {"precision": round(float(p_), 2), "recall": round(float(r_), 2), "f1": round(float(f_), 2),
                  "test_items": int(Yt[:, j].sum())}
        tn, fp, fn, tp = confusion_matrix(Yt[:, j], pred[:, j], labels=[0, 1]).ravel()
        counts[e] = {"true_positive": int(tp), "false_positive": int(fp), "false_negative": int(fn), "true_negative": int(tn)}
    macro = float(np.mean([v["f1"] for v in per.values()]))
    top = P.argmax(1)
    top_hit = float(np.mean([Yt[r, i] == 1 for r, i in enumerate(top)]))
    # the label Studio shows is the most likely one; how often it is one of the tweet's own labels, per label shown
    shown = {}
    for j, e in enumerate(EMO):
        s = top == j
        shown[e] = {"posts_given_this_label": int(s.sum()),
                    "share_where_it_is_one_of_the_true_labels": round(float(Yt[s, j].mean()), 2) if s.any() else None}
    ts = f"ExaAEC, the 30% left out of training ({len(tst):,} tweets; a tweet has one or two of ten labels)"
    out["emotion_eval"] = {"test_set": ts, "macro_f1": round(macro, 2),
                           "classes": per, "threshold": 0.5,
                           "most_likely_label_is_a_true_label": round(top_hit, 2), "most_likely_label": shown}
    out["emotion"] = {"test_set": ts, "rows": "each label separately, at a probability of 0.5",
                      "labels": EMO, "counts": counts}
    report["emotion"] = {"split_reproduced": split_ok, "macro_f1": round(macro, 3), "top_label_hit": round(top_hit, 3)}

    print(json.dumps(report, ensure_ascii=False, indent=1, default=float))
    bad = [k for k, v in report.items() if not v.get("reproduced", v.get("split_reproduced"))]
    if bad:
        sys.exit("Stored scores not reproduced for: " + ", ".join(bad) + ". Nothing written.")
    if a.write:
        for name in ("sentiment", "sarcasm", "hate", "dialect", "emotion"):
            p = os.path.join(W.MODEL_DIR, f"{name}.json")
            js = json.load(open(p, encoding="utf-8"))
            js["confusion"] = out[name]
            if name == "emotion":
                js["evaluation"] = out["emotion_eval"]
            with open(p, "w", encoding="utf-8") as f:
                json.dump(js, f, ensure_ascii=False, separators=(",", ":"))
            print("wrote", p)


if __name__ == "__main__":
    main()
