#!/usr/bin/env python3
"""Merge data/questions.part*.json into data/questions.json and validate.

Checks: unique ids; concept exists and is not flagged noQuiz; answers valid
(single = exactly 1, multi = 2+); options unique; citations point to real pages;
no question uses figures flagged as not-to-quiz (L3 p.4 conflict).
"""
import json, re, sys, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
k = json.loads((ROOT / "data/knowledge.json").read_text())
raw = {r["file"]: {p["n"] for p in r["pages"]} for r in json.loads((ROOT / "data/raw/_index.json").read_text())}
concepts = {c["id"]: c for c in k["concepts"]}
qs = []
for p in sorted((ROOT / "data").glob("questions.part*.json")):
    qs += json.loads(p.read_text())

errors, ids = [], set()
for q in qs:
    w = q["id"]
    if w in ids: errors.append(f"duplicate id {w}")
    ids.add(w)
    c = concepts.get(q["conceptId"])
    if not c: errors.append(f"{w}: unknown concept {q['conceptId']}"); continue
    if c.get("flags", {}).get("noQuiz"): errors.append(f"{w}: concept {c['id']} is flagged noQuiz")
    n = len(q["options"])
    if n < 3 or len(set(q["options"])) != n: errors.append(f"{w}: needs >=3 unique options")
    a = q["answer"]
    if any(i < 0 or i >= n for i in a) or len(set(a)) != len(a): errors.append(f"{w}: bad answer indices")
    if q["multi"] and len(a) < 2: errors.append(f"{w}: multi-select needs 2+ correct answers")
    if not q["multi"] and len(a) != 1: errors.append(f"{w}: single-answer needs exactly 1 correct")
    for ct in q["cites"]:
        lec, page = ct.split(":")
        if int(page) not in raw.get(k["sources"][lec], set()): errors.append(f"{w}: bad citation {ct}")
    for fig in c.get("flags", {}).get("noQuizFigures", []):
        num = re.match(r"[\d.]+%", fig).group(0)
        if num in q["q"] + " ".join(q["options"]): errors.append(f"{w}: uses no-quiz figure {fig}")

for e in errors: print("ERROR", e)
(ROOT / "data/questions.json").write_text(json.dumps(qs, indent=1, ensure_ascii=False))
by_l = collections.Counter(q["lecture"] for q in qs)
multi = collections.Counter(q["lecture"] for q in qs if q["multi"])
types = collections.Counter(q["type"] for q in qs)
print(f"{len(qs)} questions | per lecture: " + ", ".join(f"L{l}={by_l[l]} ({multi[l]} multi)" for l in sorted(by_l)))
print("types:", dict(types))
sys.exit(1 if errors else 0)
