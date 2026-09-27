import argparse


from . import storage
from .dataset import TASKS
from .runner import configuration, execute_run, prepare_runs


def main():
    parser = argparse.ArgumentParser(description="Norte engineering benchmark")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init", help="Create SQLite tables (idempotent)")
    sub.add_parser("list", help="List saved runs")
    run = sub.add_parser("run", help="Run selected models sequentially")
    run.add_argument(
        "--provider", choices=["openai", "anthropic", "gemini", "all"], default="all"
    )
    run.add_argument("--model", help="Exact model name from config/models.json")
    run.add_argument("--tasks", nargs="+", choices=TASKS, default=TASKS)
    run.add_argument("--repetitions", type=int, default=3)
    run.add_argument(
        "--input-mode",
        choices=["controlled_text", "pdf_text"],
        default="controlled_text",
    )
    run.add_argument(
        "--feedback-baseline", help="Run ID of completed first-pass baseline"
    )
    args = parser.parse_args()
    storage.init_db()
    if args.command == "init":
        print("SQLite ready at data/benchmark.sqlite3")
        return
    if args.command == "list":
        for r in storage.list_runs():
            print(r["id"], r["provider"], r["model"], r["status"], r["experiment"])
        return
    models = [
        m
        for m in configuration()["models"]
        if (args.provider == "all" or m["provider"] == args.provider)
        and (not args.model or m["model"] == args.model)
    ]
    try:
        ids = prepare_runs(
            models,
            args.tasks,
            args.repetitions,
            args.input_mode,
            "feedback_assisted" if args.feedback_baseline else "first_pass",
            args.feedback_baseline,
        )
    except ValueError as exc:
        parser.error(str(exc))
    failed = False
    for rid in ids:
        print(f"Running {rid}", flush=True)
        result = execute_run(rid)
        failed |= result["status"] != "completed"
        if result["status"] == "completed":
            print(
                f"Saved: results/{result['metadata']['provider']}/{rid}/run.json",
                flush=True,
            )
        else:
            print(
                f"Execution failed ({(result.get('failure') or {}).get('category', result['status'])}). Completed task results are preserved; inspect live history.",
                flush=True,
            )
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
