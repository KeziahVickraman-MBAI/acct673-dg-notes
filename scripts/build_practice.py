#!/usr/bin/env python3
"""Merge data/practice.essays.json + data/practice.short.json into data/practice.json and validate.

Checks: unique ids; concepts exist; marking-guide marks sum to totalMarks; every inline [L#:#] citation
and every guide citation points at a real page; model answers are within the word range
(essays 370-470, short 90-175 words, excluding citation tokens and the italic 'illustrative' note).
Adds `quiz`: for short questions, the quiz that first teaches the newest lecture used (null = bonus);
essays are tagged 'essay'.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
k = json.loads((ROOT / "data/knowledge.json").read_text())
raw = {r["file"]: {p["n"] for p in r["pages"]} for r in json.loads((ROOT / "data/raw/_index.json").read_text())}
concepts = {c["id"] for c in k["concepts"]}
lec_to_quiz = {}
for q, v in k["quizzes"].items():
    for l in v["newLectures"]:
        lec_to_quiz[l] = int(q)

essays = json.loads((ROOT / "data/practice.essays.json").read_text())
short = json.loads((ROOT / "data/practice.short.json").read_text())
CITE = re.compile(r"\[(L\d:\d+(?:,\s*L\d:\d+)*)\]")
errors, ids, out = [], set(), []

def ok_cite(c):
    lec, page = c.split(":")
    return int(page) in raw.get(k["sources"].get(lec, ""), set())

def words(md):
    md = CITE.sub("", md)
    md = re.sub(r"^\*Illustrative[^\n]*\n", "", md)
    return len(re.findall(r"[A-Za-z0-9][A-Za-z0-9'’\-.%/]*", md))

for item in essays + short:
    i = item["id"]
    if i in ids: errors.append(f"duplicate {i}")
    ids.add(i)
    for c in item["conceptIds"]:
        if c not in concepts: errors.append(f"{i}: unknown concept {c}")
    tot = sum(g["marks"] for g in item["markingGuide"])
    if tot != item["totalMarks"]: errors.append(f"{i}: guide marks {tot} != totalMarks {item['totalMarks']}")
    inline = [c.strip() for m in CITE.findall(item["modelAnswer"]) for c in m.split(",")]
    if not inline: errors.append(f"{i}: model answer has no inline citations")
    for c in inline + [c for g in item["markingGuide"] for c in g["cites"]]:
        if not ok_cite(c): errors.append(f"{i}: bad citation {c}")
    n = words(item["modelAnswer"])
    lo, hi = (370, 470) if item["kind"] == "essay" else (90, 175)
    if not lo <= n <= hi: errors.append(f"{i}: model answer is {n} words (want {lo}-{hi})")
    if item.get("basedOn") and not ok_cite(item["basedOn"]): errors.append(f"{i}: bad basedOn")
    q = "essay" if item["kind"] == "essay" else lec_to_quiz.get(max(item["lectures"]))
    out.append({**item, "quiz": q, "cites": sorted(set(inline), key=inline.index), "words": n})

for e in errors: print("ERROR", e)
(ROOT / "data/practice.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
from collections import Counter
print(f"{len(out)} practice questions ({len(essays)} essays, {len(short)} short) | by quiz: {dict(Counter(str(x['quiz']) for x in out))}")
print("word counts:", ", ".join(f"{x['id']}={x['words']}" for x in out if x['kind']=='essay'), "| short range", min(x['words'] for x in out if x['kind']!='essay'), "-", max(x['words'] for x in out if x['kind']!='essay'))
sys.exit(1 if errors else 0)
