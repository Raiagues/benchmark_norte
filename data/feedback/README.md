# Local feedback

Feedback lives in `data/benchmark.sqlite3`, in the `feedback` table. Optional explanation reviews live in `human_reviews`. Neither table changes reference labels. Confirmations are explicit UI actions. Each assisted run snapshots exactly the confirmed corrections it received.

The SQLite file and generated run exports are ignored by Git. This directory is reserved for manually exported feedback; `*.json` exports here are also ignored.
