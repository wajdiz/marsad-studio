"""Train the MARSAD word models that Studio runs in the browser: sarcasm, hate speech and dialect region.

Each model is TF-IDF over MARSAD tokens (the same tokenize() the browser uses) followed by logistic regression, and is
written as plain JSON to marsad_analytics/resources/models/<name>.json in the format wordmodels.py reads. Held-out
scores are written into the same file ("evaluation") so the Help center and the cards can quote them.

Data (all public; clone each repository into --data):
  sarcasm   ArSarcasm-v2 (Abu Farha, Zaghouani and Magdy 2021), MIT licence
            github.com/iabufarha/ArSarcasm-v2
  hate      L-HSAB (Mulki et al. 2019)        github.com/Hala-Mulki/L-HSAB-First-Arabic-Levantine-HateSpeech-Dataset
            T-HSAB (Haddad et al. 2019)       github.com/Hala-Mulki/T-HSAB-A-Tunisian-Hate-Speech-and-Abusive-Dataset
            MLMA Arabic (Ousidhoum et al. 2019), MIT licence   github.com/HKUST-KnowComp/MLMA_hate_speech
  dialect   ArSarcasm-v2 dialect labels, and the QADI test set (Abdelali et al. 2021)  github.com/qcri/QADI
            Optional: MADAR Corpus-26 (--madar, a folder with the MADAR-Corpus-26-*.tsv files), which needs the
            MADAR licence.
  hope      Optional: --hope a CSV with columns text,label (label 1 = hope speech, 0 = not).

Usage:
  python -I train_browser_models.py --src /path/with/marsad_analytics --data /path/to/clones --out /path/to/models
"""
from __future__ import annotations

import argparse
import ast
import glob
import json
import os
import sys
from datetime import date

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_recall_fscore_support
from sklearn.model_selection import train_test_split

SEED = 7
REGIONS = ["MSA", "Gulf", "Levant", "Egypt-Sudan", "Maghreb", "Iraq", "Yemen"]
QADI_REGION = {"SA": "Gulf", "QA": "Gulf", "AE": "Gulf", "KW": "Gulf", "BH": "Gulf", "OM": "Gulf", "YE": "Yemen",
               "IQ": "Iraq", "SY": "Levant", "LB": "Levant", "JO": "Levant", "PL": "Levant", "EG": "Egypt-Sudan",
               "SD": "Egypt-Sudan", "MA": "Maghreb", "DZ": "Maghreb", "TN": "Maghreb", "LY": "Maghreb", "MSA": "MSA"}
ARSARC_REGION = {"msa": "MSA", "gulf": "Gulf", "levant": "Levant", "egypt": "Egypt-Sudan", "magreb": "Maghreb"}
# Nationality, sect and origin words, beyond the group list of FRAME-18, kept out of the hate model's features so that
# naming a group, a country or a sect cannot by itself raise the score.
EXTRA_GROUP_WORDS = """
سوري سوريين السوريين سوريا لبناني لبنانيين اللبنانيين لبنان تونسي تونسيين التونسيين تونس جزايري جزايريين الجزاير
مصري مصريين المصريين مصر سعودي السعوديين السعوديه عراقي العراقيين العراق فلسطيني الفلسطينيين فلسطين اردني الاردن
مغربي المغاربه المغرب ليبي ليبيا يمني اليمن خليجي الخليج قطري قطر اماراتي الامارات كويتي الكويت ايراني ايران الفرس
تركي تركيا الاتراك امريكي امريكا الامريكان اسرايلي اسرايل افريقي الافارقه افارقه كحلوش زنجي الزنوج اسود
مسيحي مسيحيين الموارنه ماروني درزي دروز الدروز علوي علويين العلويين نصيري النصيريه سنه سني السنه شيعي شيعه الشيعه
رافضي روافض الروافض يزيدي الايزيديين اباضي يهودي يهود اليهود صهيوني صهاينه مسلم مسلمين المسلمين اسلام الاسلام
كافر كفار الكفار ملحد ملحدين نصراني النصاري قبطي الاقباط كردي الكرد الاكراد امازيغي الامازيغ بربر البربر
لاجي لاجيين اللاجيين نازح النازحين مهاجر المهاجرين اجانب الاجانب نسوان النسوان مراه المراه النساء بنات البنات
مثلي المثليين شاذ الشواذ
""".split()


def load_marsad(src):
    sys.path.insert(0, src)
    from marsad_analytics.textnorm import article_stem, tokenize, tokenize_term
    from marsad_analytics.wordmodels import feature_tokens
    return tokenize, tokenize_term, article_stem, feature_tokens


def group_words(src, tokenize_term):
    """GROUPS from cards/combined.py (read without importing plotly), the extra list above, and one-word names from the
    Wojood person and place lists."""
    tree = ast.parse(open(os.path.join(src, "marsad_analytics", "cards", "combined.py"), encoding="utf-8").read())
    groups = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "GROUPS":
            groups = ast.literal_eval(node.value)
    words = set()
    for terms in groups.values():
        for t in terms:
            words.update(tokenize_term(t))
    for w in EXTRA_GROUP_WORDS:
        words.update(tokenize_term(w))
    for cat in ("ent_person", "ent_place"):
        p = os.path.join(src, "marsad_analytics", "lexicons", "packs", "named_entities", "categories", f"{cat}.json")
        for name in json.load(open(p, encoding="utf-8")).get("ar", []):
            tt = tokenize_term(name)
            if len(tt) == 1:
                words.add(tt[0])
    return words


# ---------------------------------------------------------------- data
def arsarcasm(data):
    d = os.path.join(data, "ArSarcasm-v2", "ArSarcasm-v2")
    return pd.read_csv(os.path.join(d, "training_data.csv")), pd.read_csv(os.path.join(d, "testing_data.csv"))


def hate_sets(data):
    lh = pd.read_csv(glob.glob(os.path.join(data, "L-HSAB*", "Dataset", "L-HSAB"))[0], sep="\t")
    lh = pd.DataFrame({"text": lh["Tweet"], "hate": lh["Class"].eq("hate").astype(int), "dataset": "L-HSAB"})
    th = pd.read_excel(glob.glob(os.path.join(data, "T-HSAB*", "T-HSAB Corpus", "T-HSAB.xlsx"))[0], header=None)
    th = pd.DataFrame({"text": th[0], "hate": th[1].astype(str).str.strip().eq("hate").astype(int), "dataset": "T-HSAB"})
    ml = pd.read_csv(os.path.join(data, "MLMA_hate_speech", "mlma", "hate_speech_mlma", "ar_dataset.csv"))
    ml = pd.DataFrame({"text": ml["tweet"], "hate": ml["sentiment"].astype(str).str.contains("hateful").astype(int),
                       "dataset": "MLMA"})
    d = pd.concat([lh, th, ml], ignore_index=True).dropna(subset=["text"])
    d["text"] = d["text"].astype(str)
    return d.drop_duplicates("text")


def dialect_sets(data, madar=None):
    tr, te = arsarcasm(data)
    a_tr = pd.DataFrame({"text": tr["tweet"], "label": tr["dialect"].map(ARSARC_REGION), "dataset": "ArSarcasm-v2"})
    a_te = pd.DataFrame({"text": te["tweet"], "label": te["dialect"].map(ARSARC_REGION), "dataset": "ArSarcasm-v2"})
    q = pd.read_csv(os.path.join(data, "QADI", "testset", "QADI_test.txt"), sep="\t", header=None, quoting=3,
                    names=["text", "country"])
    q = pd.DataFrame({"text": q["text"], "label": q["country"].map(QADI_REGION), "dataset": "QADI"}).dropna()
    q_tr, q_te = train_test_split(q, test_size=0.3, random_state=SEED, stratify=q["label"])
    parts_tr, parts_te = [a_tr, q_tr], [a_te, q_te]
    if madar:
        from_madar = []
        for f in glob.glob(os.path.join(madar, "*.tsv")):
            m = pd.read_csv(f, sep="\t", quoting=3)
            col = [c for c in m.columns if c.lower() in ("lang", "dialect", "city")][0]
            txt = [c for c in m.columns if c.lower() in ("sent", "sentence", "text")][0]
            from_madar.append(pd.DataFrame({"text": m[txt], "label": m[col].astype(str).str.upper().map(MADAR_CITY),
                                            "dataset": "MADAR-26"}))
        md = pd.concat(from_madar).dropna()
        m_tr, m_te = train_test_split(md, test_size=0.2, random_state=SEED, stratify=md["label"])
        parts_tr.append(m_tr)
        parts_te.append(m_te)
    return pd.concat(parts_tr, ignore_index=True).dropna(), pd.concat(parts_te, ignore_index=True).dropna()


MADAR_CITY = {"MSA": "MSA", "DOH": "Gulf", "RIY": "Gulf", "JED": "Gulf", "MUS": "Gulf", "SAN": "Yemen", "BAG": "Iraq",
              "BAS": "Iraq", "MOS": "Iraq", "ALE": "Levant", "DAM": "Levant", "BEI": "Levant", "AMM": "Levant",
              "JER": "Levant", "SAL": "Levant", "CAI": "Egypt-Sudan", "ALX": "Egypt-Sudan", "ASW": "Egypt-Sudan",
              "KHA": "Egypt-Sudan", "TUN": "Maghreb", "SFX": "Maghreb", "ALG": "Maghreb", "RAB": "Maghreb",
              "FES": "Maghreb", "TRI": "Maghreb", "BEN": "Maghreb"}


# ---------------------------------------------------------------- fitting
class Featurizer:
    def __init__(self, tok, feat, spec=None, exclude=(), article_stem=None, max_features=30000):
        self.tok, self.feat, self.spec, self.max_features = tok, feat, spec, max_features
        self.exclude, self.astem = set(exclude), article_stem

    def units(self, texts):
        return [self.feat(self.tok(str(t)), self.spec) for t in texts]

    def _dropped(self, u):
        if u.startswith("c:"):
            return False
        return u in self.exclude or (self.astem is not None and self.astem(u) in self.exclude)

    def fit(self, texts):
        U = self.units(texts)
        probe = TfidfVectorizer(analyzer=lambda x: x, min_df=2, max_features=self.max_features + 5000)
        probe.fit(U)
        terms = sorted(probe.vocabulary_, key=probe.vocabulary_.get)
        df = np.asarray((probe.transform(U) > 0).sum(0)).ravel()
        keep = [t for t, _ in sorted(zip(terms, df), key=lambda x: -x[1]) if not self._dropped(t)][: self.max_features]
        self.vec = TfidfVectorizer(analyzer=lambda x: x, vocabulary=sorted(keep), sublinear_tf=True, norm="l2",
                                   smooth_idf=True)
        self.vec.fit(U)
        self.dropped = sum(self._dropped(t) for t in terms)
        return self

    def transform(self, texts):
        return self.vec.transform(self.units(texts))


def tune_lr(Xtr, ytr, Xdv, ydv, w=None, binary=False):
    best = None
    for C in (0.25, 0.5, 1, 2, 4, 8):
        m = LogisticRegression(C=C, max_iter=3000, class_weight=None if w is not None else "balanced")
        m.fit(Xtr, ytr, sample_weight=w)
        if binary:
            p = m.predict_proba(Xdv)[:, 1]
            thr, f = max(((t, f1_score(ydv, p >= t, average="macro")) for t in np.arange(0.2, 0.81, 0.025)),
                         key=lambda x: x[1])
        else:
            thr, f = None, f1_score(ydv, m.predict(Xdv), average="macro")
        if best is None or f > best[0]:
            best = (f, C, thr)
    return best


def balanced_weights(y, groups):
    """Each dataset weighs the same, and inside it both classes weigh the same."""
    df = pd.DataFrame({"y": y, "g": groups})
    n_g = df["g"].nunique()
    cell = df.groupby(["g", "y"]).size()
    n_y = df.groupby("g")["y"].nunique()
    return df.apply(lambda r: len(df) / (n_g * n_y[r.g] * cell[(r.g, r.y)]), axis=1).values


def to_json(name, kind, classes, fz, model, threshold=None, extra=None):
    vocab = fz.vec.get_feature_names_out().tolist()
    out = {"name": name, "kind": kind, "classes": classes, "vocab": vocab,
           "idf": [round(float(x), 5) for x in fz.vec.idf_],
           "coef": [[round(float(x), 5) for x in row] for row in model.coef_],
           "intercept": [round(float(x), 5) for x in model.intercept_]}
    if fz.spec:
        out["features"] = fz.spec
    if threshold is not None:
        out["threshold"] = round(float(threshold), 3)
    out.update(extra or {})
    return out


def prf(y, p, labels):
    P, R, F, N = precision_recall_fscore_support(y, p, labels=labels, zero_division=0)
    return {str(l): {"precision": round(float(a), 2), "recall": round(float(b), 2), "f1": round(float(c), 2),
                     "test_items": int(n)} for l, a, b, c, n in zip(labels, P, R, F, N)}


# ---------------------------------------------------------------- models
def train_sarcasm(T, data):
    tok, feat, astem = T
    tr, te = arsarcasm(data)
    a, dv = train_test_split(tr, test_size=0.15, random_state=SEED, stratify=tr["sarcasm"])
    spec = {"char": [2, 4]}
    fz = Featurizer(tok, feat, spec=spec, max_features=40000).fit(a["tweet"])
    f, C, thr = tune_lr(fz.transform(a["tweet"]), a["sarcasm"].astype(int), fz.transform(dv["tweet"]),
                        dv["sarcasm"].astype(int), binary=True)
    fz = Featurizer(tok, feat, spec=spec, max_features=40000).fit(tr["tweet"])
    m = LogisticRegression(C=C, max_iter=3000, class_weight="balanced").fit(fz.transform(tr["tweet"]),
                                                                            tr["sarcasm"].astype(int))
    y = te["sarcasm"].astype(int).values
    p = m.predict_proba(fz.transform(te["tweet"]))[:, 1] >= thr
    ev = {"test_set": "ArSarcasm-v2 test (3,000 tweets)", "macro_f1": round(f1_score(y, p, average="macro"), 2),
          "majority_macro_f1": round(f1_score(y, np.zeros_like(y), average="macro"), 2),
          "classes": {"sarcastic": prf(y, p.astype(int), [1])["1"]}, "C": C}
    return to_json("sarcasm", "binary", ["sarcastic"], fz, m, thr, {
        "trained_on": "ArSarcasm-v2 train (12,548 tweets); threshold chosen on 15% of it",
        "sources": ["ArSarcasm-v2 (Abu Farha, Zaghouani and Magdy 2021), MIT licence"], "evaluation": ev,
        "eval_by_class": {"test_set": ev["test_set"], "classes": ev["classes"]}}), ev, (y, p, te)


def train_hate(T, data, exclude):
    tok, feat, astem = T
    d = hate_sets(data)
    strat = d["dataset"] + d["hate"].astype(str)
    tr, te = train_test_split(d, test_size=0.2, random_state=SEED, stratify=strat)
    a, dv = train_test_split(tr, test_size=0.15, random_state=SEED, stratify=tr["dataset"] + tr["hate"].astype(str))

    def fit(train, dev=None, C=None, thr=None):
        fz = Featurizer(tok, feat, exclude=exclude, article_stem=astem).fit(train["text"])
        w = balanced_weights(train["hate"].values, train["dataset"].values)
        if C is None:
            Xa = fz.transform(train["text"])
            _f, C, thr = tune_lr(Xa, train["hate"], fz.transform(dev["text"]), dev["hate"], w=w, binary=True)
        m = LogisticRegression(C=C, max_iter=3000).fit(fz.transform(train["text"]), train["hate"], sample_weight=w)
        return fz, m, C, thr

    _fz, _m, C, thr = fit(a, dv)
    fz, m, _, _ = fit(tr, C=C, thr=thr)
    y = te["hate"].values
    p = (m.predict_proba(fz.transform(te["text"]))[:, 1] >= thr).astype(int)
    per = {}
    for name, g in te.groupby("dataset"):
        pg = (m.predict_proba(fz.transform(g["text"]))[:, 1] >= thr).astype(int)
        per[name] = round(f1_score(g["hate"], pg, average="macro"), 2)
    lodo = {}
    for held in sorted(d["dataset"].unique()):
        train = d[d["dataset"] != held]
        fz2, m2, _, _ = fit(train, C=C, thr=thr)
        g = d[d["dataset"] == held]
        pg = (m2.predict_proba(fz2.transform(g["text"]))[:, 1] >= thr).astype(int)
        lodo[held] = round(f1_score(g["hate"], pg, average="macro"), 2)
    ev = {"test_set": f"random 20% of L-HSAB, T-HSAB and MLMA Arabic ({len(te):,} posts)",
          "macro_f1": round(f1_score(y, p, average="macro"), 2),
          "majority_macro_f1": round(f1_score(y, np.zeros_like(y), average="macro"), 2),
          "classes": {"hate": prf(y, p, [1])["1"]}, "macro_f1_by_dataset": per,
          "macro_f1_unseen_dataset": lodo, "C": C, "group_words_held_out": fz.dropped}
    return to_json("hate", "binary", ["hate"], fz, m, thr, {
        "trained_on": "L-HSAB, T-HSAB and MLMA Arabic, 80% random split (seed 7); datasets weighted equally; names, "
                      "places and religious, ethnic and national group words not used",
        "sources": ["L-HSAB (Mulki et al. 2019)", "T-HSAB (Haddad et al. 2019)",
                    "MLMA Arabic (Ousidhoum et al. 2019), MIT licence"], "evaluation": ev,
        "eval_by_class": {"test_set": ev["test_set"], "classes": ev["classes"]}}), ev, (y, p, te)


def train_dialect(T, data, madar=None):
    tok, feat, astem = T
    tr, te = dialect_sets(data, madar)
    spec = {"char": [2, 4]}
    a, dv = train_test_split(tr, test_size=0.15, random_state=SEED, stratify=tr["label"])
    fz = Featurizer(tok, feat, spec=spec, max_features=40000).fit(a["text"])
    _f, C, _ = tune_lr(fz.transform(a["text"]), a["label"], fz.transform(dv["text"]), dv["label"])
    fz = Featurizer(tok, feat, spec=spec, max_features=40000).fit(tr["text"])
    m = LogisticRegression(C=C, max_iter=3000, class_weight="balanced").fit(fz.transform(tr["text"]), tr["label"])
    classes = m.classes_.tolist()
    p = m.predict(fz.transform(te["text"]))
    ev = {"test_set": "ArSarcasm-v2 test dialect labels (3,000 tweets) and a held-out 30% of the QADI test set "
                      "(1,051 tweets)" + (" and 20% of MADAR-26" if madar else ""),
          "macro_f1": round(f1_score(te["label"], p, average="macro"), 2),
          "classes": prf(te["label"], p, classes), "C": C}
    q = te["dataset"].eq("QADI").values
    ev["macro_f1_qadi"] = round(f1_score(te["label"][q], p[q], average="macro"), 2)
    ev["classes_qadi"] = prf(te["label"][q], p[q], classes)
    pr = m.predict_proba(fz.transform(te["text"])).max(1)
    for cut in (0.4, 0.5):
        k = pr >= cut
        ev[f"min_score_{cut}"] = {"share_labelled": round(float(k.mean()), 2),
                                  "macro_f1_labelled": round(f1_score(te["label"][k], p[k], average="macro"), 2),
                                  "classes": prf(te["label"][k], p[k], classes)}
    return to_json("dialect", "multiclass", classes, fz, m, None, {
        "trained_on": "ArSarcasm-v2 train dialect labels and 70% of the QADI test set" + (" and 80% of MADAR-26" if madar else ""),
        "sources": ["ArSarcasm-v2 (Abu Farha, Zaghouani and Magdy 2021), MIT licence",
                    "QADI (Abdelali, Mubarak, Samih, Hassan and Darwish 2021)"] + (["MADAR (Bouamor et al. 2018)"] if madar else []),
        "min_score": 0.4, "evaluation": ev,
        "eval_by_class": {"test_set": ev["test_set"], "classes": ev["classes"]}}), ev, (te["label"].values, p, te)


def train_hope(T, path):
    tok, feat, astem = T
    d = pd.read_csv(path).dropna(subset=["text", "label"])
    d["label"] = d["label"].astype(int)
    tr, te = train_test_split(d, test_size=0.2, random_state=SEED, stratify=d["label"])
    a, dv = train_test_split(tr, test_size=0.15, random_state=SEED, stratify=tr["label"])
    fz = Featurizer(tok, feat).fit(a["text"])
    _f, C, thr = tune_lr(fz.transform(a["text"]), a["label"], fz.transform(dv["text"]), dv["label"], binary=True)
    fz = Featurizer(tok, feat).fit(tr["text"])
    m = LogisticRegression(C=C, max_iter=3000, class_weight="balanced").fit(fz.transform(tr["text"]), tr["label"])
    y = te["label"].values
    p = (m.predict_proba(fz.transform(te["text"]))[:, 1] >= thr).astype(int)
    ev = {"test_set": f"random 20% of {os.path.basename(path)} ({len(te):,} posts)",
          "macro_f1": round(f1_score(y, p, average="macro"), 2), "classes": {"hope": prf(y, p, [1])["1"]}, "C": C}
    return to_json("hope", "binary", ["hope"], fz, m, thr, {"trained_on": os.path.basename(path), "sources": [path],
                                                            "evaluation": ev}), ev, (y, p, te)


def check_parity(src, out_dir, name, texts, expected):
    """The JSON model, run through wordmodels.py exactly as the browser runs it, must give the sklearn predictions."""
    import importlib
    W = importlib.import_module("marsad_analytics.wordmodels")
    W.MODEL_DIR = out_dir
    W.load.cache_clear(); W._arrays.cache_clear()
    got, _ = W.predict(name, list(texts))
    got, exp = np.asarray(got), np.asarray(expected)
    if got.dtype == bool or exp.dtype == bool:
        got, exp = got.astype(int), exp.astype(int)
    agree = float((got == exp).mean())
    return agree


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="sarcasm,hate,dialect")
    ap.add_argument("--madar", default=None)
    ap.add_argument("--hope", default=None)
    a = ap.parse_args()
    tok, tterm, astem, feat = load_marsad(a.src)
    T = (tok, feat, astem)
    os.makedirs(a.out, exist_ok=True)
    jobs = a.only.split(",") + (["hope"] if a.hope else [])
    report = {}
    for job in jobs:
        if job == "sarcasm":
            js, ev, (y, p, te) = train_sarcasm(T, a.data); texts = te["tweet"]
        elif job == "hate":
            js, ev, (y, p, te) = train_hate(T, a.data, group_words(a.src, tterm)); texts = te["text"]
        elif job == "dialect":
            js, ev, (y, p, te) = train_dialect(T, a.data, a.madar); texts = te["text"]
        elif job == "hope":
            js, ev, (y, p, te) = train_hope(T, a.hope); texts = te["text"]
        else:
            continue
        js["trained"] = str(date.today())
        with open(os.path.join(a.out, f"{job}.json"), "w", encoding="utf-8") as f:
            json.dump(js, f, ensure_ascii=False, separators=(",", ":"))
        ev["json_matches_sklearn"] = check_parity(a.src, a.out, job, texts, np.asarray(p))
        ev["size_kb"] = round(os.path.getsize(os.path.join(a.out, f"{job}.json")) / 1024)
        report[job] = ev
        print(job, json.dumps(ev, ensure_ascii=False))
    with open(os.path.join(a.out, "training_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
