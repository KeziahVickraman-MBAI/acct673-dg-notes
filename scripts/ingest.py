#!/usr/bin/env python3
"""Extract text from every file in the materials folder into data/raw/.

Output per source file: data/raw/<stem>.json  ->  {"file": ..., "unit": "page"|"slide", "pages": [{"n": 1, "text": "..."}]}
plus a human-readable data/raw/<stem>.txt with "=== Page N ===" markers.
Also writes data/raw/_index.json (all files) used by the Ask-a-Question backend.

Usage:  python3 scripts/ingest.py            (from project root)
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# The folder on disk is "materials " (trailing space); accept either spelling.
CANDIDATES = [ROOT / "materials", ROOT / "materials "]
OUT = ROOT / "data" / "raw"


def find_materials() -> Path:
    for c in CANDIDATES:
        if c.is_dir():
            return c
    sys.exit("No materials/ folder found")


def clean(t: str) -> str:
    t = t.replace("\f", "").replace(" ", " ")
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def pdf_pages(p: Path):
    if not shutil.which("pdftotext"):
        sys.exit("pdftotext not found (install poppler: brew install poppler)")
    info = subprocess.run(["pdfinfo", str(p)], capture_output=True, text=True).stdout
    n = int(re.search(r"Pages:\s+(\d+)", info).group(1))
    pages = []
    for i in range(1, n + 1):
        txt = subprocess.run(
            ["pdftotext", "-layout", "-f", str(i), "-l", str(i), str(p), "-"],
            capture_output=True, text=True,
        ).stdout
        pages.append({"n": i, "text": clean(txt)})
    return "page", pages


def pptx_pages(p: Path):
    from pptx import Presentation  # pip install python-pptx
    prs = Presentation(str(p))
    pages = []
    for i, slide in enumerate(prs.slides, 1):
        parts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                parts.append(shape.text_frame.text)
            if getattr(shape, "has_table", False) and shape.has_table:
                for row in shape.table.rows:
                    parts.append(" | ".join(c.text for c in row.cells))
        if slide.has_notes_slide:
            parts.append("[Notes] " + slide.notes_slide.notes_text_frame.text)
        pages.append({"n": i, "text": clean("\n".join(parts))})
    return "slide", pages


def docx_pages(p: Path):
    import docx  # pip install python-docx
    d = docx.Document(str(p))
    # DOCX has no fixed pages; chunk by ~40 paragraphs and label as "section".
    paras = [x.text for x in d.paragraphs if x.text.strip()]
    pages = [{"n": i // 40 + 1, "text": clean("\n".join(paras[i:i + 40]))} for i in range(0, len(paras), 40)]
    return "section", pages


HANDLERS = {".pdf": pdf_pages, ".pptx": pptx_pages, ".docx": docx_pages}


VISUAL = ROOT / "data" / "visual_notes.json"


def load_visual_notes():
    """Hand transcriptions of image-only slide content (charts, tables in images)."""
    if not VISUAL.exists():
        return {}
    notes = {}
    for n in json.loads(VISUAL.read_text()):
        notes.setdefault((n["file"], n["page"]), []).append(n["text"])
    return notes


def main():
    mat = find_materials()
    OUT.mkdir(parents=True, exist_ok=True)
    notes = load_visual_notes()
    index = []
    for f in sorted(mat.rglob("*")):
        h = HANDLERS.get(f.suffix.lower())
        if not h or f.name.startswith("~$"):
            continue
        try:
            unit, pages = h(f)
        except ImportError as e:
            print(f"SKIP {f.name}: {e}")
            continue
        for pg in pages:
            for t in notes.get((f.name, pg["n"]), []):
                pg["text"] += "\n\n[Slide image transcription] " + t
        rec = {"file": f.name, "unit": unit, "pages": pages}
        stem = f.stem
        (OUT / f"{stem}.json").write_text(json.dumps(rec, indent=1, ensure_ascii=False))
        with open(OUT / f"{stem}.txt", "w") as fh:
            for pg in pages:
                fh.write(f"=== {unit.title()} {pg['n']} ===\n{pg['text']}\n\n")
        index.append(rec)
        print(f"OK   {f.name}: {len(pages)} {unit}s, {sum(len(p['text']) for p in pages)} chars")
    (OUT / "_index.json").write_text(json.dumps(index, ensure_ascii=False))
    print(f"\n{len(index)} files -> {OUT}")


if __name__ == "__main__":
    main()
