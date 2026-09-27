"""Scan Git-visible files and committed blobs. Print paths, never matching values."""

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = [
    re.compile(rb"sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}"),
    re.compile(rb"AIza[A-Za-z0-9_-]{30,}"),
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(
        rb"(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY)[ \t]*=[ \t]*['\"]?[A-Za-z0-9_./+=-]{12,}"
    ),
]


def git(*args):
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, check=False
    ).stdout


def suspicious(blob):
    return any(pattern.search(blob) for pattern in PATTERNS)


def main():
    found = set()
    files = git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split(
        b"\0"
    )
    for filename in files:
        if not filename:
            continue
        path = ROOT / filename.decode()
        if path.is_file() and suspicious(path.read_bytes()):
            found.add(str(path.relative_to(ROOT)))
    # Inspect the index too: a clean working copy does not imply a clean commit.
    for entry in git("ls-files", "--stage", "-z").split(b"\0"):
        if not entry:
            continue
        metadata, filename = entry.split(b"\t", 1)
        name = filename.decode(errors="replace")
        basename = Path(name).name
        if basename.startswith(".env") and basename != ".env.example":
            found.add("Staged environment file: " + name)
        blob = git("cat-file", "blob", metadata.split()[1].decode())
        if suspicious(blob):
            found.add("Git index: " + name)
    # Include keys removed from working files but still present in Git history.
    for line in git("rev-list", "--objects", "--all").splitlines():
        parts = line.split(b" ", 1)
        if (
            len(parts) == 2
            and git("cat-file", "-t", parts[0].decode()).strip() == b"blob"
        ):
            if suspicious(git("cat-file", "blob", parts[0].decode())):
                found.add("Git history: " + parts[1].decode(errors="replace"))
    ignored = (
        subprocess.run(["git", "check-ignore", "-q", ".env"], cwd=ROOT).returncode == 0
    )
    print(".env ignored:", "yes" if ignored else "NO")
    for name in sorted(found):
        print("Possible secret (value REDACTED):", name)
    if not found:
        print("No likely secrets found in Git-visible files or committed history.")
    raise SystemExit(1 if found or not ignored else 0)


if __name__ == "__main__":
    main()
