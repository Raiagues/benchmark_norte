"""HTTP delivery tests use temporary files/database, never benchmark responses."""

from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient


def test_navigation_fetches_current_html_and_run_state(monkeypatch, tmp_path):
    from benchmark.api import app

    folder = tmp_path / "web"
    folder.mkdir()
    (folder / "index.html").write_text(
        '<script src="/assets/current-hash.js"></script>'
    )
    (folder / "assets").mkdir()
    (folder / "assets/current-hash.js").write_text("// Isolated static delivery test")
    monkeypatch.setattr(
        app.router, "routes", [r for r in app.routes if r.name != "frontend"]
    )
    app.mount("/", StaticFiles(directory=folder, html=True), name="frontend")
    with TestClient(app) as client:
        for path in ("/", "/index.html", "/?ui=study-view"):
            response = client.get(path)
            assert response.status_code == 200
            assert "current-hash.js" in response.text
            assert response.headers["cache-control"] == "no-store"
        conditional = client.get(
            "/", headers={"If-None-Match": response.headers["etag"]}
        )
        assert conditional.status_code == 304
        assert conditional.headers["cache-control"] == "no-store"
        for path in ("/api/live", "/api/summary?by_study=true"):
            response = client.get(path)
            assert response.status_code == 200 and response.json() == []
            assert response.headers["cache-control"] == "no-store"
        asset = client.get("/assets/current-hash.js")
        assert asset.status_code == 200
        assert "no-store" not in asset.headers.get("cache-control", "")
        assert client.post("/api/runs", json={}).status_code == 403
