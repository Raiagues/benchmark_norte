# Sourced by start/stop. Only manage a process started from this checkout.
site_running() {
    [[ -f .runtime/site.pid ]] || return 1
    local site_pid
    read -r site_pid < .runtime/site.pid
    [[ "$site_pid" =~ ^[0-9]+$ ]] || return 1
    kill -0 "$site_pid" 2>/dev/null || return 1
    python3 - "$site_pid" "$PWD/.venv/bin/python" <<'PY'
import subprocess, sys
command = subprocess.run(['ps', '-p', sys.argv[1], '-o', 'args='], capture_output=True, text=True).stdout.strip()
expected = sys.argv[2] + ' -m uvicorn benchmark.api:app '
sys.exit(0 if command.startswith(expected) else 1)
PY
}
