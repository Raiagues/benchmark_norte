import io

import httpx
import pytest
from pypdf import PdfWriter
from fastapi.testclient import TestClient
from benchmark import artifacts, storage


def pdf_bytes():
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=200)
    stream = io.BytesIO()
    writer.write(stream)
    return stream.getvalue()


def test_local_pdf_has_real_page_count_and_fingerprint_without_touching_results(
    db, monkeypatch, tmp_path
):
    monkeypatch.setattr(artifacts, "ROOT", tmp_path)
    path = tmp_path / "data/pdfs/fan.pdf"
    path.parent.mkdir(parents=True)
    path.write_bytes(pdf_bytes())
    rows = artifacts.sources()
    source = next(s for s in rows if s["document_id"] == "FAN")
    assert source["available"] and source["pages"] == 1
    assert len(source["sha256"]) == 64
    assert source["matches_checked_document"] is False
    assert storage.list_runs(db) == []
    assert next(s for s in rows if s["document_id"] == "SENSOR")["available"] is False


def test_local_pdf_route_and_path_traversal_are_read_only(monkeypatch, tmp_path):
    from benchmark.api import app

    monkeypatch.setattr(artifacts, "ROOT", tmp_path)
    path = tmp_path / "data/pdfs/fan.pdf"
    path.parent.mkdir(parents=True)
    path.write_bytes(pdf_bytes())
    with TestClient(app) as client:
        response = client.get("/api/sources/FAN/pdf")
        assert response.status_code == 200
        assert response.content == path.read_bytes()
        assert response.headers["content-type"] == "application/pdf"
        assert client.get("/api/sources/UNKNOWN/pdf").status_code == 404
        assert client.post("/api/sources/FAN/cache").status_code == 403
        assert client.get("/api/runs").json() == []
    assert artifacts.source_path({"local_pdf": "../.env"}) is None


def test_explicit_source_download_uses_registry_and_never_overwrites(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(artifacts, "ROOT", tmp_path)
    body = pdf_bytes()
    requests = []
    source = {
        "document_id": "FAN",
        "local_pdf": "data/pdfs/fan.pdf",
        "official_datasheet_url": "https://cdn.noctua.at/official.pdf",
    }
    monkeypatch.setattr(artifacts, "find_source", lambda _: source)

    def respond(request):
        requests.append(request)
        return httpx.Response(200, content=body)

    client = httpx.Client(transport=httpx.MockTransport(respond))
    monkeypatch.setattr(artifacts.httpx, "Client", lambda **_: client)
    artifacts.cache_source("FAN")
    assert len(requests) == 1
    assert (tmp_path / "data/pdfs/fan.pdf").read_bytes() == body
    artifacts.cache_source("FAN")
    assert len(requests) == 1


def test_source_redirect_cannot_fetch_arbitrary_urls(monkeypatch, tmp_path):
    monkeypatch.setattr(artifacts, "ROOT", tmp_path)
    monkeypatch.setattr(
        artifacts,
        "find_source",
        lambda _: {
            "document_id": "FAN",
            "local_pdf": "data/pdfs/fan.pdf",
            "official_datasheet_url": "https://cdn.noctua.at/official.pdf",
        },
    )
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(302, headers={"Location": "http://127.0.0.1/private"})

    client = httpx.Client(transport=httpx.MockTransport(respond))
    monkeypatch.setattr(artifacts.httpx, "Client", lambda **_: client)
    with pytest.raises(ValueError, match="allowlist"):
        artifacts.cache_source("FAN")
    assert len(requests) == 1
    assert not (tmp_path / "data/pdfs/fan.pdf").exists()


def test_malformed_manufacturer_pdf_is_not_cached(monkeypatch, tmp_path):
    monkeypatch.setattr(artifacts, "ROOT", tmp_path)
    client = httpx.Client(
        transport=httpx.MockTransport(
            lambda _: httpx.Response(200, content=b"%PDF-1.7\ninvalid")
        )
    )
    monkeypatch.setattr(artifacts.httpx, "Client", lambda **_: client)
    with pytest.raises(ValueError, match="unreadable PDF"):
        artifacts.cache_source("FAN")
    assert not (tmp_path / "data/pdfs/fan.pdf").exists()
