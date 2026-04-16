# APEX — Predictive Maintenance Foundation

> **This is Phase 1 (30% scope). Training, UI, and deployment are Phase 2+.**

APEX is a five-phase predictive maintenance system for turbofan engines built on the NASA CMAPSS FD001 dataset. This repository contains **only the Phase 1 foundation layer** — data pipeline, model architecture definition, API skeleton, and sensor simulator scaffolding.

---

## What is built in Phase 1

| Module | File | Status |
|---|---|---|
| Project scaffold | `config.yaml`, `requirements.txt`, `.gitignore` | ✅ Phase 1 |
| Pydantic schema contracts | `src/schemas.py` | ✅ Phase 1 |
| CMAPSS data pipeline | `src/data/preprocessing.py` | ✅ Phase 1 |
| CNN-BiLSTM architecture | `src/models/cnn_bilstm.py` | ✅ Phase 1 |
| MC-Dropout wrapper | `src/models/cnn_bilstm.py` | ✅ Phase 1 |
| FastAPI skeleton | `src/api/main.py` | ✅ Phase 1 |
| Sensor simulator | `src/simulator/replay.py` | ✅ Phase 1 |
| Training stub | `train.py` | ✅ Phase 1 (stub only) |

## What is NOT built yet

- ❌ Model training (Phase 2)
- ❌ Frontend / dashboard / visualisations (Phase 3)
- ❌ ONNX export and quantisation (Phase 3)
- ❌ Authentication and security hardening (Phase 3)
- ❌ Docker / cloud deployment (Phase 4)
- ❌ Unit and integration tests (Phase 2)

---

## Setup

```bash
# Create a virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

# Install pinned dependencies
pip install -r requirements.txt
```

## Drop the dataset

Place the CMAPSS FD001 files in `data/raw/`:

```
data/raw/
├── train_FD001.txt
├── test_FD001.txt
└── RUL_FD001.txt
```

The `data/raw/` directory is excluded from version control (see `.gitignore`).

## Verify Phase 1 imports

```bash
python -c "from src.models.cnn_bilstm import CNNBiLSTMRul; m = CNNBiLSTMRul(); print(m)"
python -c "from src.api.main import app; print(app.title)"
python -c "from src.data.preprocessing import build_dataloaders; print('OK')"
python -c "from src.schemas import SensorPayload, Prediction, MachineState; print('OK')"
```

## Run the API (Phase 1 — mock responses only)

```bash
uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
```

Endpoints available in Phase 1:
- `POST /ingest` — ingest a sensor cycle
- `GET /predict/{machine_id}` — returns mock prediction (Phase 2 wires real inference)
- `WS /stream` — heartbeat WebSocket

---

## Architecture

```
SensorPayload (Pydantic) ──► POST /ingest ──► ring buffer (deque, maxlen=30)
                                                      │
                                              GET /predict/{id}
                                                      │
                                          MCDropoutPredictor ◄── CNNBiLSTMRul
                                          (Phase 2 wired here)
                                                      │
                                            Prediction (Pydantic)
                                                      │
                                              WS /stream ──► client
```

---

## Configuration

All hyperparameters are in `config.yaml`. Phase 2 may override values via CLI flags passed to `train.py`.

---

*APEX Phase 1 — Tensor '26 Hackathon, PS07*
