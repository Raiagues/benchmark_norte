# Original PDF inputs

New protocol 2.0 runs require these five local manufacturer PDFs. Use **Sources and provenance → Get official PDF for local use** for each source. The repository does not redistribute PDFs; public availability is not a redistribution license. Existing PDFs are never overwritten and no download happens during benchmark execution.

- `fan.pdf`: Noctua NF-A4x10 5V, seven-page product specification.
- `sensor.pdf`: TI TMP117, SNOSD82D.
- `driver.pdf`: TI TPS22919, SLVSEN5B.
- `alt-fan.pdf`: Noctua NF-A4x20 5V, alternative component specification.
- `alt-driver.pdf`: TI TPS22917, alternative switch datasheet.

Exact source URLs and editions are in `data/sources.json`. PDFs are Git-ignored. New runs have no controlled-text option. Missing documents block preparation before any benchmark API request.

Python `pypdf` extracts every page using the same parser for all providers. Full extracted text, PDF hashes, parser version and exact prompts are snapshotted. No hand-selected manufacturer excerpts or numerical source-registry summaries are appended. Project requirements, declared system configuration, architecture, verification procedures and proposed changes are also inputs. Expected entities/edges/impacts and no-impact labels stay out of the prompt. Explicit confirmed feedback is only supplied in the separately marked assisted experiment.

This is full-PDF **text extraction**, not native multimodal PDF understanding, OCR or diagram recognition. Scanned PDFs without extractable text are rejected. PDF.js displays the actual original pages in the browser; source metadata shows hashes and warns about edition mismatches. Evidence evaluation uses the page mapping for the registered editions.

Historical runs remain unchanged, including their earlier document modes. Their original prompts and outputs are available in the model explorer, marked with the previous-context notice. Never compare these protocols as equivalent or rewrite old scores to match the new protocol.
