# Original import fixtures

These short texts and archives were authored for LEXIS tests. They contain no private or externally licensed books, dictionary definitions or recordings. The source text is deliberately small; volume tests generate 1,001 original synthetic rows at runtime.

- `original-reading.txt`: original English paragraphs.
- `vocabulary.csv`: UTF-8 BOM, mixed English/Russian, two senses of one lemma.
- `reverso-supplied.tsv`: a supported user-supplied tabular layout; this does not represent a connection to Reverso.
- `original-book.epub`: DRM-free EPUB 3 ZIP with uncompressed mimetype, container, package, navigation and two XHTML chapters.
- `original-vocabulary.xlsx`: minimal OPC workbook with inline strings and one worksheet; no formulas, macros or external links.

Adversarial ZIP, XML, formula and cancellation fixtures are constructed in `tests/unit/materials-ingest.test.ts`, so their properties remain reviewable.
