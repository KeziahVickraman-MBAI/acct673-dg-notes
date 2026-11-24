#!/usr/bin/env python3
"""Build data/flashcards.json from knowledge.json + hand-written data/flashcards.extra.json.

- Every concept gets an auto 'Explain this concept' card (front = name, back = summary + key terms),
  unless a hand-written card of kind 'definition' already covers it.
- Each card inherits theme + quizzes from its concept.
- Fails if any card references an unknown concept or a citation page that doesn't exist,
  or if any concept ends up without a card.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
k = json.loads((ROOT / "data/knowledge.json").read_text())
extra = json.loads((ROOT / "data/flashcards.extra.json").read_text())
raw = {r["file"]: {p["n"] for p in r["pages"]} for r in json.loads((ROOT / "data/raw/_index.json").read_text())}
concepts = {c["id"]: c for c in k["concepts"]}

errors = []


def cite_ok(c):
    lec, page = c.split(":")
    return int(page) in raw.get(k["sources"].get(lec, ""), set())


cards = []
has_def = {e["conceptId"] for e in extra if e["kind"] == "definition"}
for c in k["concepts"]:
    if c["id"] in has_def:
        continue
    back = c["summary"]
    if c.get("flags", {}).get("notDefinedInSlides"):
        back = "Not defined in slides. " + back
    cards.append({
        "id": f"auto-{c['id']}", "conceptId": c["id"], "kind": "definition", "auto": True,
        "front": c["name"], "prompt": "Explain this concept",
        "back": back, "keyTerms": c["keyTerms"][:6], "cites": c["citations"][:3],
    })
for e in extra:
    cards.append({**e, "auto": False})

ids = set()
for card in cards:
    c = concepts.get(card["conceptId"])
    if not c:
        errors.append(f"{card['id']}: unknown concept {card['conceptId']}")
        continue
    if card["id"] in ids:
        errors.append(f"duplicate card id {card['id']}")
    ids.add(card["id"])
    card["theme"] = c["theme"]
    card["quizzes"] = c["quizzes"]
    for ct in card["cites"]:
        if not cite_ok(ct):
            errors.append(f"{card['id']}: bad citation {ct}")

covered = {c["conceptId"] for c in cards}
missing = [cid for cid in concepts if cid not in covered]
if missing:
    errors.append(f"concepts with no flashcard: {missing}")

for e in errors:
    print("ERROR", e)
(ROOT / "data/flashcards.json").write_text(json.dumps(cards, indent=1, ensure_ascii=False))
by_q = {}
for card in cards:
    key = f"Q{min(card['quizzes'])}" if card["quizzes"] else "Bonus"
    by_q[key] = by_q.get(key, 0) + 1
print(f"{len(cards)} cards ({sum(1 for c in cards if c['auto'])} auto, {len(extra)} hand-written); "
      f"{len(covered)}/{len(concepts)} concepts covered; first-taught: {dict(sorted(by_q.items()))}")
sys.exit(1 if errors else 0)
