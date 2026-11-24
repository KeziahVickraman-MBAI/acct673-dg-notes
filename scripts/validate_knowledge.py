#!/usr/bin/env python3
"""Validate data/knowledge.json: ids unique, related ids exist, citations point at real pages, themes valid."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
k = json.loads((ROOT / "data/knowledge.json").read_text())
raw = {r["file"]: {p["n"] for p in r["pages"]} for r in json.loads((ROOT / "data/raw/_index.json").read_text())}

errors = []
ids = [c["id"] for c in k["concepts"]]
dupes = {i for i in ids if ids.count(i) > 1}
if dupes:
    errors.append(f"duplicate ids: {dupes}")
idset = set(ids)
themes = {t["id"] for t in k["themes"]}


def check_cite(c, where):
    try:
        lec, page = c.split(":")
        f = k["sources"][lec]
        if int(page) not in raw.get(f, set()):
            errors.append(f"{where}: citation {c} -> page not found in {f}")
    except Exception:
        errors.append(f"{where}: bad citation {c!r}")


for t in k["themes"]:
    for c in t["citations"]:
        check_cite(c, f"theme {t['id']}")
    for l in t["links"]:
        if l["to"] not in themes:
            errors.append(f"theme {t['id']} links to unknown {l['to']}")

for c in k["concepts"]:
    for field in ["id", "name", "theme", "quizzes", "summary", "explanation", "keyTerms", "examples", "citations", "related"]:
        if field not in c:
            errors.append(f"{c.get('id')}: missing {field}")
    if c["theme"] not in themes:
        errors.append(f"{c['id']}: unknown theme {c['theme']}")
    if not c["citations"]:
        errors.append(f"{c['id']}: no citations")
    for cite in c["citations"]:
        check_cite(cite, c["id"])
    for r in c["related"]:
        if r["id"] not in idset:
            errors.append(f"{c['id']}: related id {r['id']} not found")

for e in errors:
    print("ERROR", e)
by_theme = {}
for c in k["concepts"]:
    by_theme.setdefault(c["theme"], 0)
    by_theme[c["theme"]] += 1
print(f"{len(ids)} concepts, {len(themes)} themes, {sum(len(c['related']) for c in k['concepts'])} links; per theme: {by_theme}")
sys.exit(1 if errors else 0)
