# Optional full-document mode

The repository does not redistribute manufacturer PDFs. Public availability is not a redistribution license. The primary benchmark uses short, independently worded technical facts and source links and works without these files or internet access, apart from model API calls.

For private local testing, use **Benchmark inputs → Original documents → Get official PDF for local use**, or obtain the exact baseline documents from `data/sources.json` and save:

- `data/pdfs/fan.pdf`: Noctua NF-A4x10 5V detailed product specification, seven pages.
- `data/pdfs/sensor.pdf`: TI TMP117, SNOSD82D.
- `data/pdfs/driver.pdf`: TI TPS22919, SLVSEN5B.

The files are ignored by Git. Check applicable document and provider terms before uploading their extracted text to a provider. No auto-download happens during a run.

Choose **Full PDF text** in the dashboard or pass `--input-mode pdf_text`. Python `pypdf` extracts every page, once per experiment preparation. The same extracted page text goes to every provider. Page locations are `page-1`, `page-2`, etc. The three small normalized manufacturer fixtures are replaced, not appended. Requirements, project assumptions, the ID vocabulary and change descriptions remain identical. Source-registry numerical parameters for the baseline parts are omitted from prompts in both modes.

This is **shared full-PDF text ingestion**, not native multimodal PDF understanding, OCR, image recognition, or provider-specific PDF parsing. It tests how models use longer documents with a fixed parser. Full-page extracted text, original PDF SHA-256 hashes, parser dependency version and exact prompts are saved. Native PDF ingestion is deliberately outside this small implementation. Results are partitioned by mode and document hash. Primary reasoning results never include PDF-mode scores.

Relevant-page evidence checks assume the exact editions above. For a different edition, update the page mapping in `benchmark/evaluate.py`, review the reference facts and bump the dataset version before comparing results. No physical engineering verification is implied by either mode.

The in-app PDF.js viewer renders the actual local PDF, with page/zoom controls, accessible page text and a browser-viewer fallback. Source metadata shows page count and SHA-256, including a warning if it differs from the originally checked edition. Downloads happen only through an explicit source action, use allowlisted manufacturer URLs, and never overwrite an existing PDF. No PDF is committed or downloaded during a benchmark run.
