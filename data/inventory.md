# ACCT673 Data Governance and Quality: Materials Inventory

Source folder: `materials /` (note: folder name has a trailing space). 9 files, all PDF slide decks, 184 pages total.
No PPTX, DOCX or reading files are present. The "Recommended reading materials" slides list external links
(BCBS 239, DCAM, IMDA valuation guide, etc.); those readings are **not** in the folder and are not used as sources.

## Proposed pop-quiz mapping (please confirm)

Derived from the "Lecture structure" table, **L1 p.6**, which ticks the *Pop quiz* column for Lectures 3, 5, 6, 7 and 8,
and **L1 p.4**: "5 MCQ pop quizzes – 25%". A "Pop Quiz – 10 min quiz" slide also appears at the end of L3 (p.16), L5 (p.20), L6 (p.16), L7 (p.20).

| Quiz | Held after | Assumed coverage | Status |
|---|---|---|---|
| Pop Quiz 1 | Lecture 3 (21 Nov) | Lectures 1, 2, 3 | assumed, since no quiz was held after L1 or L2 |
| Pop Quiz 2 | Lecture 5 (26 Nov) | Lectures 4, 5 | assumed |
| Pop Quiz 3 | Lecture 6 (28 Nov) | Lecture 6 | assumed |
| Pop Quiz 4 | Lecture 7 (30 Nov) | Lecture 7 | assumed |
| Pop Quiz 5 | Lecture 8 (3 Dec) | Lecture 8 | assumed. L8 has no "Pop Quiz" slide, but the L1 p.6 table ticks it |
| (none) | Lecture 9 (5 Dec) | Lecture 9 | not quizzed per L1 p.6; tagged "Not on a pop quiz" |

Format: **MCQ**, about 10 minutes (L1 p.4, L3 p.16). No sample quiz questions are in the materials.

## Files

| # | File | Pages | Date (L1 p.6) | Topic | Theme (L1 p.5) | Quiz |
|---|---|---|---|---|---|---|
| 1 | SMU ACCT673 - Lecture 1.pdf | 28 | 16 Nov | Overview of data management in practice: course admin, benefits of DG, bakery analogy, DAMA-DMBOK & DCAM, building blocks of DG, three lines of defence, BCBS 239, CBIRC | Business aspects of data management | 1 |
| 2 | SMU ACCT673 - Lecture 2.pdf | 22 | 19 Nov | Data management strategy: business challenges, financial value of data, oOh!/DataSpark case, strategy characteristics & document, MIT monetisation (IWS), preparing data for sale, data valuation (market/cost/income) | Business aspects of data management | 1 |
| 3 | SMU ACCT673 - Lecture 3.pdf | 16 | 21 Nov | Data management organisation: data office maturity, CDO reporting lines, CDAO, centralised/federated/decentralised, typical DG structure (BoD, DGC, CDO/DMO) | Business aspects of data management | 1 |
| 4 | SMU ACCT673 - Lecture 4.pdf | 17 | 23 Nov | Data governance: key terms, data stakeholders & roles, data ownership principles, critical data elements (criteria, worked example), data culture | Data governance | 2 |
| 5 | SMU ACCT673 - Lecture 5.pdf | 21 | 26 Nov | Data documentation: DG framework components, data policies (DM, DQ, sharing), metadata, business glossary, data dictionary, data flow diagram, data lineage | Data governance | 2 |
| 6 | SMU ACCT673 - Lecture 6.pdf | 17 | 28 Nov | Data quality part 1: why DQ matters, root causes, 7 DQ dimensions, data controls per dimension, traditional DQ approach, AI/ML preventive controls | Data quality | 3 |
| 7 | SMU ACCT673 - Lecture 7.pdf | 21 | 30 Nov | Data quality part 2: DQ rules design (profiling, data type classification, rules per dimension), measurement process, thresholds, manual vs automated, dashboards, remediation | Data quality | 4 |
| 8 | SMU ACCT673 - Lecture 8.pdf | 22 | 3 Dec | Data & technology architecture: definitions, components, data domains, taxonomy, reference data, data platform, MDM & metadata tools, common taxonomies (BIRD, DRR, FIBO, ESG) | Data architecture & trends | 5 |
| 9 | SMU ACCT673 - Lecture 9.pdf | 20 | 5 Dec | Emerging trends: DQ recap, 5 trends, AI/ML & knowledge graphs, data for AI, MAS FEAT, cloud controls (CDMC), ASEAN DMF & model clauses, data as an asset, data distress, Finance's role | Data architecture & trends | none |

## Extraction notes
- Raw text: `data/raw/<file>.txt` (page markers) and `.json`; combined `data/raw/_index.json`.
- 27 slides are mostly images (charts, tables, screenshots). Their content was transcribed by reading the rendered
  slide and stored in `data/visual_notes.json`; ingestion appends it to the page text tagged `[Slide image transcription]`.
  Most important: L1 p.18 (BCBS 239, 14 principles), L1 p.26 (CBIRC fines), L2 pp.17–20 (data-for-sale process; market/cost/income valuation),
  L3 p.10 (decentralised/federated/centralised pros & cons), L5 pp.13–14 (glossary/dictionary templates), L9 p.11 (CDMC 14 cloud controls),
  L9 p.12 (ASEAN DMF), L9 p.13 (ASEAN model clauses), L9 p.14 (data value drivers).
- Slides that are only a class-discussion prompt (e.g. "What is the difference between data management and data governance?", L1 p.19)
  have **no answer in the materials**. They are not turned into facts.
- Gaps between learning outcomes and content: L7 p.3 lists "business rules, technical rules" but no slide defines the two separately.
  L5 p.17 and L1 p.9 contain only a video or an image, with no further text.
