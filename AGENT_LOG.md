# AGENT_LOG.md — APEX Phase 1 Reasoning Log

This file documents the agent's decomposition and reasoning for each module
built in Phase 1.  It exists so the jury can trace *why* each decision was made,
not just *what* was built.

---

## Module 0 — Project Scaffold

**Decision**: Created folder structure exactly as specified before writing any
code. This is intentional — Python's import system requires `__init__.py` files
to exist before any cross-module import can resolve.  The `.gitignore` excludes
`data/raw/*` (not `data/raw/`) so the directory is tracked via `.gitkeep` while
data files remain unversioned.  `requirements.txt` pins exact versions to
guarantee reproducibility across jury machines.

---

## Module 1 — config.yaml

**Decision**: A single `config.yaml` at the repo root is the canonical source of
truth for all hyperparameters. All modules read from this file (or accept kwargs
that default to these values) so Phase 2 can tune without touching source code.
The `feature_sensors` and `drop_sensors` lists are explicit — no magic inference
from data variance — to make the choice auditable.

---

## Module 2 — Pydantic Schemas (`src/schemas.py`)

**Decision**: Schemas are defined before any pipeline or API code so the data
contract is established first. `SensorPayload` uses `min_length=14, max_length=14`
on `sensor_readings` to enforce the exact 14-feature contract at the HTTP
boundary.  `MachineState.is_ready` is a boolean derived field (buffer_length ≥ 30)
that Phase 2 checks before invoking the model — separating buffer management from
inference logic.  `Prediction.rul_std=0.0` in Phase 1 is an explicit placeholder,
not a bug.

---

## Module 3 — Data Pipeline (`src/data/preprocessing.py`)

**Decision**: The scaler is fit **only** on training data and returned from
`build_dataloaders` so Phase 2 can persist it alongside the checkpoint.  Fitting
on test data would constitute data leakage.  Test windows use the last 30 cycles
per engine (the conventional CMAPSS evaluation protocol); shorter sequences are
zero-padded on the left rather than skipped, preserving all 100 test engines.
`make_windows` isolates windows per engine unit to prevent cross-unit
contamination at window boundaries.

---

## Module 4 — Model Architecture (`src/models/cnn_bilstm.py`)

**Decision**: The model code is transcribed verbatim from the specification and
then wrapped with docstrings and type hints.  No architectural changes were made.
`MCDropoutPredictor.predict` calls `model.train()` before inference (not
`model.eval()`) — this is the standard MC-Dropout protocol: `train()` keeps
Dropout active while `torch.no_grad()` disables gradient graph construction.
The `_build_default_model()` helper is provided so Phase 2 can import a
correctly-parameterised instance without manually specifying kwargs.

---

## Module 5 — FastAPI Skeleton (`src/api/main.py`)

**Decision**: The lifespan context manager is the correct FastAPI v0.111+
pattern (replaces deprecated `@app.on_event("startup")`).  The pre-warm hook
body is a stub comment block — Phase 2 replaces it with `torch.load`.  The
`/predict` endpoint returns a mock with `rul_mean=125.0` (the RUL cap) rather
than `0.0` so a connected dashboard in Phase 2 doesn't immediately trigger
false alarms.  The `/stream` WebSocket catches `WebSocketDisconnect` explicitly
for a clean exit without logging spurious errors.

---

## Module 6 — Sensor Simulator (`src/simulator/replay.py`)

**Decision**: `asyncio.gather` runs one coroutine per engine concurrently,
matching the real-world scenario where multiple engines report simultaneously.
`httpx.AsyncClient` is the async-native HTTP client in the approved dependency
list.  The `--rate` flag defaults to 1.0 (one cycle/second) to match the
spec but allows stress-testing at higher rates.  The file is guarded by
`if __name__ == "__main__"` — importing it (e.g., in Phase 2 tests) does not
trigger any network calls.

---

## Module 7 — train.py Stub

**Decision**: `train()` raises `NotImplementedError` immediately so Phase 2
cannot accidentally run an empty training loop that silently produces a
zero-loss checkpoint.  The `if __name__ == "__main__"` block raises `SystemExit`
rather than `NotImplementedError` because command-line invocation should produce
a clear human-readable error, not a traceback.  All argument names are finalised
here so Phase 2 can add `argparse` parsing without changing the function signature.

---

## Scope Boundary Enforcement

The agent explicitly did **not** build:
- Any HTML/CSS/JS frontend
- Model training loops that execute
- ONNX export
- Docker configuration
- Unit tests
- Database persistence
- Authentication

Every out-of-scope item was identified by checking the EXCLUSION LIST before
writing each file.  When in doubt, the item was skipped.
