"""Storage interface shared by the Lambdas (DynamoRepo) and local tools (LocalRepo).

Return shapes (both implementations):
  get_climatology(district) -> list of {"district", "doy", "et0_p90", "tmax_p90", "et0_mean"}
  get_config()              -> {pk: item} e.g. {"district#Mandya": {...}, "crop#paddy": {...}, "lake#KRS": {...}}
  get_status(district)      -> Status item dict or None
  put_status(item)          -> None
"""
import json
from abc import ABC, abstractmethod
from pathlib import Path


class Repo(ABC):
    @abstractmethod
    def get_climatology(self, district):
        ...

    @abstractmethod
    def get_config(self):
        ...

    @abstractmethod
    def get_status(self, district):
        ...

    @abstractmethod
    def put_status(self, item):
        ...


class LocalRepo(Repo):
    """Reads data/out/*.json. Status items live in <base_dir>/status/{district}.json.

    base_dir defaults to <repo>/data/out (resolved from this file's location)."""

    def __init__(self, base_dir=None, status_dir=None):
        if base_dir is None:
            base_dir = Path(__file__).resolve().parents[4] / "data" / "out"
        self.base = Path(base_dir)
        self.status_dir = Path(status_dir) if status_dir else self.base / "status"
        self._clim = None
        self._config = None

    def get_climatology(self, district):
        if self._clim is None:
            self._clim = json.loads((self.base / "climatology.json").read_text())
        return [c for c in self._clim if c["district"] == district]

    def get_config(self):
        if self._config is None:
            items = json.loads((self.base / "config_items.json").read_text())
            self._config = {i["pk"]: i for i in items}
        return self._config

    def get_status(self, district):
        p = self.status_dir / f"{district}.json"
        return json.loads(p.read_text()) if p.exists() else None

    def put_status(self, item):
        p = self.status_dir / f"{item['district']}.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n")


class MemoryRepo(Repo):
    """In-memory repo for tests."""

    def __init__(self, climatology=None, config=None, status=None):
        self.clim = climatology or []
        self.config = config or {}
        self.status = dict(status or {})

    def get_climatology(self, district):
        return [c for c in self.clim if c["district"] == district]

    def get_config(self):
        return self.config

    def get_status(self, district):
        return self.status.get(district)

    def put_status(self, item):
        self.status[item["district"]] = item
