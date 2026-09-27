import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TASKS = [
    "entity_extraction",
    "relationship_extraction",
    "change_impact",
    "impact_explanation",
    "one_hop",
]
DOC_FILES = {
    "FAN": "motor.txt",
    "SENSOR": "temperature_sensor.txt",
    "DRIVER": "motor_driver.txt",
    "REQUIREMENTS": "requirements.txt",
    "PROJECT": "project.txt",
}


def read_json(path):
    return json.loads(Path(path).read_text())


def digest(value):
    if not isinstance(value, bytes):
        value = json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(value).hexdigest()


def load_dataset(mode="controlled_text", db=None, use_local=True):
    documents = {}
    for doc, filename in DOC_FILES.items():
        lines = (ROOT / "data/normalized" / filename).read_text().splitlines()
        documents[doc] = {
            m[1]: m[2] for line in lines if (m := re.match(r"\[(.+?)\] (.*)", line))
        }
    gt = {
        key: read_json(ROOT / f"data/ground_truth/{key}.json")
        for key in ("entities", "relationships", "requirements", "change_scenarios")
    }
    result = {
        "manifest": read_json(ROOT / "data/manifest.json"),
        "documents": documents,
        "system_config": read_json(ROOT / "data/normalized/system_config.json"),
        "scope": read_json(ROOT / "data/task_scope.json"),
        "sources": read_json(ROOT / "data/sources.json"),
        "ground_truth": gt,
        "input_mode": mode,
        "pdf_hashes": {},
    }
    if use_local:
        from .workbench import active_revision

        revision = active_revision(db)
        if revision:
            result = revision["dataset"]
    documents = result["documents"]
    pdf_hashes = {}
    if mode == "pdf_text":
        from pypdf import PdfReader

        for doc in ("FAN", "SENSOR", "DRIVER"):
            path = ROOT / f"data/pdfs/{doc.lower()}.pdf"
            if not path.exists():
                raise ValueError(
                    f"Missing {path.relative_to(ROOT)}; see data/pdfs/README.md"
                )
            pdf_hashes[doc] = digest(path.read_bytes())
            documents[doc] = {
                f"page-{i}": page.extract_text() or ""
                for i, page in enumerate(PdfReader(path).pages, 1)
            }
            if not any(t.strip() for t in documents[doc].values()):
                raise ValueError(
                    f"No extractable text in {doc}; scanned PDFs need OCR outside this prototype"
                )
    elif mode != "controlled_text":
        raise ValueError("Unknown input mode")
    result.update(documents=documents, input_mode=mode, pdf_hashes=pdf_hashes)
    return result


def public_scenario(s):
    return {
        k: s[k]
        for k in (
            "id",
            "change_type",
            "difficulty",
            "split",
            "description",
            "changed_entity",
        )
    }


def cases_for_task(dataset, task, difficulty):
    if task in ("entity_extraction", "relationship_extraction"):
        return []
    return [
        s
        for s in dataset["ground_truth"]["change_scenarios"]
        if s["difficulty"] == difficulty
    ]


def task_plan(tasks):
    return [
        (task, level)
        for task in tasks
        for level in (
            ["L1_DIRECT", "L2_ONE_HOP"]
            if task == "impact_explanation"
            else ["L2_ONE_HOP"]
            if task == "one_hop"
            else ["L1_DIRECT"]
        )
    ]


def prompt_bundle(db=None, use_local=True):
    if use_local:
        from .workbench import active_revision

        revision = active_revision(db)
        if revision:
            return revision["prompts"]
    return {p.stem: p.read_text() for p in sorted((ROOT / "prompts").glob("*.txt"))}


def make_prompt(dataset, prompts, task, difficulty, schema, feedback):
    docs = {d: dict(lines) for d, lines in dataset["documents"].items()}
    if difficulty == "L2_ONE_HOP":
        # Explicit traceability hints removed in this separate reasoning level.
        docs["PROJECT"].pop("PROJECT-05", None)
        docs["PROJECT"].pop("PROJECT-06", None)
    # Do not leak normalized manufacturer values through the source registry in PDF mode.
    sources = [
        {
            k: v
            for k, v in s.items()
            if k != "parameters" or s["document_id"].startswith("ALT-")
        }
        for s in dataset["sources"]
    ]
    payload = {
        "documents": docs,
        "system_config": dataset["system_config"],
        "scope": dataset["scope"],
        "sources": sources,
        "scenarios": [
            public_scenario(s) for s in cases_for_task(dataset, task, difficulty)
        ],
        "confirmed_feedback": feedback,
    }
    return (
        prompts["common"]
        + "\n"
        + prompts[task]
        + "\nRESPONSE SCHEMA\n"
        + json.dumps(schema)
        + "\nINPUT\n"
        + json.dumps(payload, ensure_ascii=False)
    )
