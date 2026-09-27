"""Read-only source explorer. URLs are allowlisted in the existing source registry."""

import hashlib
import io
from urllib.parse import urlsplit

import httpx
from pypdf import PdfReader
from pypdf.errors import PyPdfError

from .dataset import ROOT, load_dataset


def source_path(source):
    path = (
        ROOT
        / (source.get("local_pdf") or f"data/pdfs/{source['document_id'].lower()}.pdf")
    ).resolve()
    if not path.is_relative_to((ROOT / "data/pdfs").resolve()):
        return None
    return path if path.is_file() else None


def sources():
    rows = []
    for source in load_dataset()["sources"]:
        path = source_path(source)
        row = dict(
            source,
            available=bool(path),
            pages=None,
            sha256=None,
            matches_checked_document=None,
        )
        if path:
            row["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
            row["matches_checked_document"] = (
                row["sha256"] == source.get("checked_document_sha256")
                if source.get("checked_document_sha256")
                else None
            )
            try:
                row["pages"] = len(PdfReader(path).pages)
            except Exception:
                row["read_error"] = "unreadable_pdf"
        rows.append(row)
    return rows


def find_source(document_id):
    return next(
        (s for s in load_dataset()["sources"] if s["document_id"] == document_id), None
    )


def cache_source(document_id):
    """Explicit local-only download. No URL supplied by the browser, no overwrite."""
    source = find_source(document_id)
    if not source:
        raise ValueError("Unknown source")
    if source_path(source):
        return
    url = source["official_datasheet_url"]
    allowed = {"www.ti.com", "ti.com", "cdn.noctua.at", "noctua.at", "www.noctua.at"}
    with httpx.Client(timeout=45, follow_redirects=False) as client:
        for _ in range(4):
            parsed = urlsplit(url)
            if parsed.scheme != "https" or parsed.hostname not in allowed:
                raise ValueError(
                    "Source redirect is outside the manufacturer allowlist"
                )
            with client.stream("GET", url) as response:
                if response.is_redirect:
                    from urllib.parse import urljoin

                    url = urljoin(url, response.headers["location"])
                    continue
                response.raise_for_status()
                chunks, size = [], 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > 25 * 1024 * 1024:
                        raise ValueError("Source PDF exceeds the local size limit")
                    chunks.append(chunk)
                body = b"".join(chunks)
                break
        else:
            raise ValueError("Too many source redirects")
    if not body.startswith(b"%PDF-"):
        raise ValueError("Manufacturer did not return a PDF")
    try:
        if not PdfReader(io.BytesIO(body)).pages:
            raise ValueError("PDF has no pages")
    except PyPdfError as exc:
        raise ValueError("Manufacturer returned an unreadable PDF") from exc
    path = (
        ROOT / (source.get("local_pdf") or f"data/pdfs/{document_id.lower()}.pdf")
    ).resolve()
    if not path.is_relative_to((ROOT / "data/pdfs").resolve()):
        raise ValueError("Invalid local source path")
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("xb") as f:
            f.write(body)
    except FileExistsError:
        pass
