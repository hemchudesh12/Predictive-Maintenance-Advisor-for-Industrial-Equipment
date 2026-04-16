"""
src/api/main.py
---------------
FastAPI application skeleton for APEX Phase 1.

Endpoints defined here
----------------------
  POST /ingest
      Accepts a ``SensorPayload`` and appends it to the in-memory ring buffer
      for the referenced machine.  Returns the updated ``MachineState``.

  GET /predict/{machine_id}
      Returns a **mock** ``Prediction`` object.
      Phase 2 replaces the mock with real ``MCDropoutPredictor`` inference once
      the model is trained and the checkpoint is available.

  WebSocket /stream
      Echo / heartbeat channel.  Sends a JSON heartbeat every second.
      Phase 2 will push live predictions over this socket.

Pre-warm hook
-------------
  ``startup_event`` is an async lifespan hook skeleton.  Phase 2 will load the
  trained model checkpoint here so the first /predict call is not cold.

CORS
----
  All origins permitted in Phase 1 (no authentication in scope).
  Phase 2 will restrict origins to the dashboard domain.
"""

from __future__ import annotations

import asyncio
import json
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, AsyncGenerator, Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from src.schemas import MachineState, Prediction, SensorPayload

# ── In-memory ring buffer ─────────────────────────────────────────────────────
# Keyed by machine_id; each value is a deque(maxlen=buffer_size).
# Phase 2 may optionally persist snapshots to Redis/SQLite without changing this API.
_BUFFER_SIZE: int = 30
_buffers: Dict[str, deque[SensorPayload]] = {}


def _get_or_create_buffer(machine_id: str) -> deque[SensorPayload]:
    """Return the ring buffer for *machine_id*, creating it if absent.

    Parameters
    ----------
    machine_id:
        Unique engine/machine identifier.

    Returns
    -------
    deque
        Ring buffer with ``maxlen`` equal to ``_BUFFER_SIZE``.
    """
    if machine_id not in _buffers:
        _buffers[machine_id] = deque(maxlen=_BUFFER_SIZE)
    return _buffers[machine_id]


# ── Application lifespan (pre-warm hook skeleton) ─────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager.

    Startup
    -------
    Phase 2 will load the trained model checkpoint here, e.g.::

        global _model
        _model = CNNBiLSTMRul()
        _model.load_state_dict(torch.load("checkpoints/best.pt"))
        _model.eval()

    Shutdown
    --------
    Release any resources acquired during startup.
    """
    # ── Startup ───────────────────────────────────────────────────────────────
    # TODO (Phase 2): load model checkpoint and assign to module-level _model.
    print("[APEX] API starting up — model pre-warm stub ready for Phase 2.")
    yield
    # ── Shutdown ──────────────────────────────────────────────────────────────
    print("[APEX] API shutting down.")


# ── FastAPI application ───────────────────────────────────────────────────────
app = FastAPI(
    title="APEX Predictive Maintenance API",
    description=(
        "Phase 1 skeleton — /ingest, /predict, /stream endpoints. "
        "Model inference wired in Phase 2."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Phase 2 will restrict to dashboard origin
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── POST /ingest ──────────────────────────────────────────────────────────────
@app.post("/ingest", response_model=MachineState, summary="Ingest one sensor cycle")
async def ingest(payload: SensorPayload) -> MachineState:
    """Append one sensor cycle to the ring buffer for *machine_id*.

    Parameters
    ----------
    payload:
        Validated ``SensorPayload`` with 14 sensor readings and metadata.

    Returns
    -------
    MachineState
        Current buffer snapshot including ``is_ready`` flag.
    """
    buf = _get_or_create_buffer(payload.machine_id)
    buf.append(payload)

    return MachineState(
        machine_id=payload.machine_id,
        last_cycle=payload.cycle,
        buffer_length=len(buf),
        latest_prediction=None,   # Phase 2 will populate after inference
        is_ready=len(buf) >= _BUFFER_SIZE,
    )


# ── GET /predict/{machine_id} ─────────────────────────────────────────────────
@app.get(
    "/predict/{machine_id}",
    response_model=Prediction,
    summary="Get RUL prediction for a machine (mock in Phase 1)",
)
async def predict(machine_id: str) -> Prediction:
    """Return a mock RUL prediction for *machine_id*.

    Phase 1 always returns ``rul_mean=125.0`` (healthy baseline) with zero
    uncertainty.  Phase 2 replaces this body with real ``MCDropoutPredictor``
    inference once the buffer has ``window_size`` cycles and a checkpoint exists.

    Parameters
    ----------
    machine_id:
        Engine/machine identifier matching a prior ``/ingest`` call.

    Returns
    -------
    Prediction
        Mock prediction object with Phase 1 placeholder values.
    """
    buf = _get_or_create_buffer(machine_id)
    last_cycle = buf[-1].cycle if buf else 0

    # ── TODO (Phase 2): replace mock block below with MCDropoutPredictor call ─
    mock_rul_mean = 125.0
    mock_rul_std = 0.0
    mock_confidence = 1.0
    # ──────────────────────────────────────────────────────────────────────────

    return Prediction(
        machine_id=machine_id,
        cycle=last_cycle,
        rul_mean=mock_rul_mean,
        rul_std=mock_rul_std,
        confidence=mock_confidence,
        timestamp=datetime.utcnow(),
    )


# ── WebSocket /stream ─────────────────────────────────────────────────────────
@app.websocket("/stream")
async def stream(websocket: WebSocket) -> None:
    """Heartbeat WebSocket endpoint.

    Accepts any client connection and emits a JSON heartbeat every second.
    Phase 2 will push live ``Prediction`` objects over this socket after each
    inference cycle instead of (or in addition to) the heartbeat.

    Parameters
    ----------
    websocket:
        FastAPI WebSocket connection object.
    """
    await websocket.accept()
    try:
        while True:
            heartbeat: Dict[str, Any] = {
                "type": "heartbeat",
                "timestamp": datetime.utcnow().isoformat(),
                "status": "ok",
            }
            await websocket.send_text(json.dumps(heartbeat))
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        # Client disconnected — clean exit, no action required.
        pass
