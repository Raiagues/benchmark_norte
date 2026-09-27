import pytest

from benchmark import storage
from benchmark.dataset import load_dataset


@pytest.fixture
def ds():
    return load_dataset()


@pytest.fixture
def db(tmp_path):
    path = tmp_path / "test.sqlite3"
    storage.init_db(path)
    return path


@pytest.fixture(autouse=True)
def isolate_credentials_and_storage(monkeypatch, tmp_path):
    # Tests must never read the user's .env or write real local benchmark records.
    from benchmark import security

    monkeypatch.setattr(security, "ROOT", tmp_path)
    monkeypatch.setattr(storage, "ROOT", tmp_path)
    for name in security.KEY_NAMES.values():
        monkeypatch.delenv(name, raising=False)
