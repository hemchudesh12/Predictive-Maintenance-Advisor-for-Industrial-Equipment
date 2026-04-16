"""
src/api/main.py
---------------
APEX Phase 3 — Production FastAPI backend.

Endpoints
---------
  POST /ingest                — ingest one sensor cycle; runs inference if ready
  GET  /predict/{machine_id} — full per-machine prediction frame
  GET  /snapshot             — full state of all machines (for WS reconnect)
  GET  /config/costs         — dollar cost config (frontend reads this)
  POST /alert/email          — send maintenance alert (rate-limited 1/60s per machine)
  POST /control              — set simulator replay speed
  GET  /control              — read current replay speed
  GET  /health               — server uptime, p99 latency, machine count
  WS  /stream                — canonical StreamFrame broadcast (1 Hz)

Resilience
----------
  - Inference errors per-machine are caught; machine is marked "degraded"
  - Missing checkpoint at startup → fallback predictor (plausible mocks,
    mode="fallback" in every frame) — demo still runs
  - WebSocket disconnects are handled cleanly; no uncaught exceptions
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import warnings
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

import numpy as np
import torch
import yaml
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from src.api.attribution import attribute
from src.api.similar_failures import get_cached, preload
from src.api.urgency import classify
from src.models.cnn_bilstm import CNNBiLSTMRul, MCDropoutPredictor
from src.schemas import (
    BackendHealth,
    ComponentAttribution,
    ControlRequest,
    ControlState,
    CostConfig,
    EmailAlertRequest,
    EmailAlertResponse,
    FleetStats,
    MachineFrame,
    MachineState,
    Prediction,
    SensorPayload,
    StreamFrame,
    UrgencyInfo,
)

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
)
log = logging.getLogger("apex.api")

# ── Globals ───────────────────────────────────────────────────────────────────
_BUFFER_SIZE: int = 30
_buffers: Dict[str, deque[SensorPayload]] = {}
_latest_frames: Dict[str, MachineFrame] = {}   # snapshot for reconnect
_degraded: Set[str] = set()                     # machines with inference errors

_predictor: Optional[MCDropoutPredictor] = None
_scaler = None
_fallback_mode: bool = False
_cfg: dict = {}
_start_time: float = time.time()

# WebSocket connection set
_ws_clients: Set[WebSocket] = set()

# Broadcast sequence counter
_seq_id: int = 0

# p99 latency tracker (ring of last 100)
_latencies_ms: deque[float] = deque(maxlen=100)

# Email rate-limiter: {machine_id → last_sent_timestamp}
_email_last_sent: Dict[str, float] = {}

# Replay control state
_control: ControlState = ControlState(speed_factor=1.0, paused=False)

# Sensor name map for snapshot dict
_SENSOR_NAMES = [
    "bearing_temp", "winding_temp", "motor_current", "discharge_pressure",
    "vibration_1x_rpm", "vibration_rms", "suction_pressure", "flow_rate",
    "motor_current_asym", "vibration_hf", "bearing_temp_2",
    "seal_pressure_delta", "cool_air_hpt", "cool_air_lpt",
]


# ── Helper: get or create buffer ─────────────────────────────────────────────
def _get_or_create_buffer(machine_id: str) -> deque[SensorPayload]:
    if machine_id not in _buffers:
        _buffers[machine_id] = deque(maxlen=_BUFFER_SIZE)
    return _buffers[machine_id]


# ── Helper: build MachineFrame from inference output ─────────────────────────
def _build_frame(
    machine_id: str,
    buf: deque[SensorPayload],
    rul_mean: float,
    rul_std: float,
    latency_ms: float,
    mode: str = "live",
) -> MachineFrame:
    rul_cap = _cfg.get("data", {}).get("rul_cap", 125)
    rul_mean = float(np.clip(rul_mean, 0, rul_cap))
    rul_std = float(max(rul_std, 0.0))

    # Urgency classification
    urg = classify(rul_mean, rul_std)
    urgency_info = UrgencyInfo(
        level=urg["level"],
        score=urg["score"],
        color_token=urg["color"],
        bg_color=urg["bg_color"],
        fail_prob_30=urg["fail_prob_30"],
        lower_bound=urg["lower_bound"],
    )

    # Component attribution (needs numpy window)
    if len(buf) >= _BUFFER_SIZE:
        window = np.array(
            [p.sensor_readings for p in list(buf)], dtype=np.float32
        )
        attr = attribute(window)
    else:
        attr = {
            "component": "Generic degradation",
            "confidence": 0.0,
            "triggered_rule": "insufficient data",
            "recommendation": "Continue monitoring.",
        }

    comp_attr = ComponentAttribution(
        component=attr["component"],
        confidence=attr["confidence"],
        triggered_rule=attr["triggered_rule"],
        recommendation=attr["recommendation"],
        driver_sensors=[],
    )

    # Sensor snapshot from last cycle
    last_readings = list(buf)[-1].sensor_readings if buf else [0.0] * 14
    sensor_snap = {
        name: round(val, 4)
        for name, val in zip(_SENSOR_NAMES, last_readings)
    }

    # Lifecycle position (how close to end of life: 0=new, 1=failing)
    lifecycle = float(np.clip(1.0 - (rul_mean / rul_cap), 0.0, 1.0))

    # Similar failures (pre-cached, zero latency)
    similar = get_cached(urg["level"], attr["component"])

    # Actual engine cycle from last buffer entry
    current_cycle = int(list(buf)[-1].cycle) if buf else 0

    return MachineFrame(
        machine_id=machine_id,
        current_cycle=current_cycle,
        rul_mean=round(rul_mean, 2),
        rul_std=round(rul_std, 2),
        rul_lower_95=round(max(0.0, rul_mean - 1.645 * rul_std), 2),
        rul_upper_95=round(min(float(rul_cap), rul_mean + 1.645 * rul_std), 2),
        fail_prob_30=urg["fail_prob_30"],
        urgency=urgency_info,
        component_attribution=comp_attr,
        sensor_snapshot=sensor_snap,
        lifecycle_position=round(lifecycle, 4),
        last_update_ms=round(latency_ms, 1),
        buffer_length=len(buf),
        mode=mode,
        similar_failures=similar,
    )


# ── Helper: compute fleet stats ───────────────────────────────────────────────
def _fleet_stats() -> FleetStats:
    counts = {"CRITICAL": 0, "WARNING": 0, "MONITOR": 0, "HEALTHY": 0}
    for frame in _latest_frames.values():
        level = frame.urgency.level
        if level in counts:
            counts[level] += 1
    return FleetStats(
        critical=counts["CRITICAL"],
        warning=counts["WARNING"],
        monitor=counts["MONITOR"],
        healthy=counts["HEALTHY"],
        total=len(_latest_frames),
    )


# ── Helper: build backend health ──────────────────────────────────────────────
def _backend_health() -> BackendHealth:
    p99 = float(np.percentile(list(_latencies_ms), 99)) if _latencies_ms else 0.0
    return BackendHealth(
        p99_latency_ms=round(p99, 1),
        uptime_sec=round(time.time() - _start_time, 1),
        machine_count=len(_buffers),
    )


# ── Broadcast loop (adaptive Hz — scales with replay speed) ───────────────────
async def _broadcast_loop() -> None:
    """Push StreamFrame to all connected WebSocket clients.

    Rate adapts to _control.speed_factor so the UI feels responsive at
    every speed:
        1x   →  1 Hz  (baseline, smooth enough for 1 cy/s)
        5x   →  2 Hz
        10x  →  4 Hz
        25x  →  8 Hz
        50x  → 12 Hz
        100x → 15 Hz  (cap — browser can handle this fine)
    """
    global _seq_id
    while True:
        speed = max(1.0, _control.speed_factor)
        # Smooth sqrt scaling: broadcast_hz = clamp(sqrt(speed) * 1.5, 1, 15)
        broadcast_hz = min(15.0, max(1.0, (speed ** 0.55) * 1.2))
        sleep_s = 1.0 / broadcast_hz
        await asyncio.sleep(sleep_s)

        if not _ws_clients or not _latest_frames:
            continue

        _seq_id += 1
        frame = StreamFrame(
            timestamp=datetime.utcnow(),
            sequence_id=_seq_id,
            machines=list(_latest_frames.values()),
            fleet_stats=_fleet_stats(),
            backend_health=_backend_health(),
        )
        payload = frame.model_dump(mode="json")
        payload_str = json.dumps(payload, default=str)

        dead: Set[WebSocket] = set()
        for ws in list(_ws_clients):
            try:
                await ws.send_text(payload_str)
            except Exception:
                dead.add(ws)
        _ws_clients -= dead


# ── Fallback predictor: plausible mock when checkpoint is missing ─────────────
def _fallback_predict(machine_id: str, buf: deque[SensorPayload]):
    """Return plausible mock RUL. Starts healthy, degrades with cycle count."""
    rng = sum(ord(c) for c in machine_id) % 37   # deterministic per machine
    last_cycle = buf[-1].cycle if buf else 1
    rul_mean = max(5.0, 90.0 - (last_cycle * 0.4) + rng)
    rul_std = 8.0 + (rng % 5)
    return rul_mean, rul_std


# ── Application lifespan ─────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global _predictor, _scaler, _fallback_mode, _cfg

    # Load config
    try:
        with open("config.yaml") as f:
            _cfg = yaml.safe_load(f)
        log.info("[APEX] Config loaded.")
    except Exception as e:
        log.warning(f"[APEX] config.yaml missing: {e}. Using defaults.")
        _cfg = {
            "data": {"window_size": 30, "rul_cap": 125},
            "model": {"hidden": 64, "dropout": 0.3, "mc_samples": 50},
            "costs": {"cost_per_failure": 250000, "cost_per_maintenance": 12000, "savings_per_prevention": 238000},
        }

    # Load checkpoint
    ckpt_path = Path(_cfg.get("checkpoint", {}).get("path", "checkpoints/cnn_bilstm_fd001.pt"))
    if ckpt_path.exists():
        try:
            ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
            model = CNNBiLSTMRul(
                n_features=14,
                window=_cfg["data"]["window_size"],
                hidden=_cfg["model"]["hidden"],
                dropout=_cfg["model"]["dropout"],
            )
            model.load_state_dict(ckpt["model_state_dict"])
            _predictor = MCDropoutPredictor(model, n_samples=_cfg["model"]["mc_samples"])
            _scaler = ckpt.get("scaler", None)
            _fallback_mode = False
            log.info(f"[APEX] Checkpoint loaded from {ckpt_path}. val_rmse={ckpt.get('val_rmse', 'N/A')}")
        except Exception as e:
            log.error(f"[APEX] Failed to load checkpoint: {e}. Activating fallback mode.")
            _fallback_mode = True
    else:
        log.warning(f"[APEX] Checkpoint not found at {ckpt_path}. Running in FALLBACK mode.")
        _fallback_mode = True

    # Pre-warm similar failures cache
    preload()
    log.info("[APEX] Similar failures cache pre-warmed.")

    # Start broadcast loop
    broadcast_task = asyncio.create_task(_broadcast_loop())
    log.info("[APEX] Broadcast loop started. API ready.")

    yield

    # Shutdown
    broadcast_task.cancel()
    try:
        await broadcast_task
    except asyncio.CancelledError:
        pass
    log.info("[APEX] API shutting down.")


# ── FastAPI application ───────────────────────────────────────────────────────
app = FastAPI(
    title="APEX Predictive Maintenance API",
    description="Phase 3 production API — real inference, canonical WS frame, 6-feature backend.",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── POST /ingest ──────────────────────────────────────────────────────────────
@app.post("/ingest", response_model=MachineState, summary="Ingest one sensor cycle")
async def ingest(payload: SensorPayload) -> MachineState:
    """Append sensor cycle. Runs inference if buffer is full (≥30 cycles)."""
    buf = _get_or_create_buffer(payload.machine_id)
    buf.append(payload)

    latest_pred: Optional[Prediction] = None

    if len(buf) >= _BUFFER_SIZE:
        t0 = time.perf_counter()
        try:
            if _fallback_mode or _predictor is None:
                rul_mean, rul_std = _fallback_predict(payload.machine_id, buf)
                mode = "fallback"
            else:
                # Scale window if scaler available
                window_raw = np.array(
                    [p.sensor_readings for p in list(buf)], dtype=np.float32
                )
                if _scaler is not None:
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore", UserWarning)
                        window_raw = _scaler.transform(window_raw)
                x = torch.from_numpy(window_raw).unsqueeze(0)     # (1, 30, 14)
                means, stds = _predictor.predict(x)
                rul_mean = float(means[0])
                rul_std = float(stds[0])
                mode = "live"

            latency_ms = (time.perf_counter() - t0) * 1000
            _latencies_ms.append(latency_ms)

            frame = _build_frame(payload.machine_id, buf, rul_mean, rul_std, latency_ms, mode)
            _latest_frames[payload.machine_id] = frame

            # Remove from degraded set on successful inference
            _degraded.discard(payload.machine_id)

            latest_pred = Prediction(
                machine_id=payload.machine_id,
                cycle=payload.cycle,
                rul_mean=frame.rul_mean,
                rul_std=frame.rul_std,
                confidence=round(1.0 - frame.urgency.fail_prob_30, 4),
                timestamp=payload.timestamp,
            )

        except Exception as exc:
            log.error(f"[APEX] Inference error on {payload.machine_id}: {exc}")
            _degraded.add(payload.machine_id)
            # Keep last good frame with degraded mode flag
            if payload.machine_id in _latest_frames:
                existing = _latest_frames[payload.machine_id]
                _latest_frames[payload.machine_id] = existing.model_copy(
                    update={"mode": "degraded"}
                )

    return MachineState(
        machine_id=payload.machine_id,
        last_cycle=payload.cycle,
        buffer_length=len(buf),
        latest_prediction=latest_pred,
        is_ready=len(buf) >= _BUFFER_SIZE,
    )


# ── GET /predict/{machine_id} ─────────────────────────────────────────────────
@app.get(
    "/predict/{machine_id}",
    response_model=Prediction,
    summary="Get latest RUL prediction for a machine",
)
async def predict(machine_id: str) -> Prediction:
    """Returns the latest cached prediction for *machine_id*."""
    if machine_id not in _latest_frames:
        buf = _get_or_create_buffer(machine_id)
        return Prediction(
            machine_id=machine_id,
            cycle=buf[-1].cycle if buf else 0,
            rul_mean=125.0,
            rul_std=0.0,
            confidence=1.0,
            timestamp=datetime.utcnow(),
        )

    frame = _latest_frames[machine_id]
    return Prediction(
        machine_id=machine_id,
        cycle=_buffers[machine_id][-1].cycle if machine_id in _buffers and _buffers[machine_id] else 0,
        rul_mean=frame.rul_mean,
        rul_std=frame.rul_std,
        confidence=round(1.0 - frame.urgency.fail_prob_30, 4),
        timestamp=frame.urgency.model_fields_set and datetime.utcnow() or datetime.utcnow(),
    )


# ── GET /snapshot ─────────────────────────────────────────────────────────────
@app.get("/snapshot", summary="Full state snapshot for all machines (WS reconnect recovery)")
async def snapshot() -> dict:
    """Returns the latest frames for all machines so reconnecting
    clients can restore state without waiting for the next broadcast."""
    if not _latest_frames:
        return {"machines": [], "fleet_stats": FleetStats().model_dump(), "mode": "waiting"}

    return {
        "machines": [f.model_dump(mode="json") for f in _latest_frames.values()],
        "fleet_stats": _fleet_stats().model_dump(),
        "backend_health": _backend_health().model_dump(),
        "fallback_mode": _fallback_mode,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ── GET /config/costs ─────────────────────────────────────────────────────────
@app.get("/config/costs", response_model=CostConfig, summary="Cost configuration (single source of truth)")
async def cost_config() -> CostConfig:
    """Returns dollar cost values. Frontend reads this instead of hardcoding."""
    costs = _cfg.get("costs", {})
    return CostConfig(
        cost_per_failure=costs.get("cost_per_failure", 250000),
        cost_per_maintenance=costs.get("cost_per_maintenance", 12000),
        savings_per_prevention=costs.get("savings_per_prevention", 238000),
    )


# ── POST /alert/email ────────────────────────────────────────────────────────
@app.post("/alert/email", response_model=EmailAlertResponse, summary="Send maintenance alert email")
async def alert_email(req: EmailAlertRequest) -> EmailAlertResponse:
    """Rate-limited (1/60s per machine) email alert endpoint.

    For the demo, sends a console log and returns success — no real email
    service required. Wire to Resend/SendGrid post-hackathon.
    """
    rate_limit_sec = _cfg.get("email", {}).get("rate_limit_seconds", 60)
    now = time.time()
    last = _email_last_sent.get(req.machine_id, 0.0)
    elapsed = now - last

    if elapsed < rate_limit_sec:
        retry_in = int(rate_limit_sec - elapsed)
        log.info(f"[APEX] Email rate-limited for {req.machine_id}, retry in {retry_in}s")
        return EmailAlertResponse(
            success=False,
            rate_limited=True,
            retry_after_sec=retry_in,
            error=f"Rate limited. Try again in {retry_in}s.",
        )

    _email_last_sent[req.machine_id] = now
    message_id = f"apex-{req.machine_id}-{int(now)}"

    # Demo: console log only (replace body with Resend call post-hackathon)
    frame = _latest_frames.get(req.machine_id)
    rul = frame.rul_mean if frame else "N/A"
    urgency = frame.urgency.level if frame else "UNKNOWN"
    log.info(
        f"[APEX] 📧 ALERT EMAIL → {req.user_email} | {req.machine_id} | "
        f"RUL={rul} cycles | urgency={urgency} | msg_id={message_id}"
    )

    return EmailAlertResponse(
        success=True,
        message_id=message_id,
        rate_limited=False,
    )


# ── POST /control (replay speed) ──────────────────────────────────────────────
@app.post("/control", response_model=ControlState, summary="Set simulator replay speed")
async def set_control(req: ControlRequest) -> ControlState:
    """Sets replay speed factor. Frontend time axis adapts based on this value."""
    global _control
    _control = ControlState(speed_factor=req.speed_factor, paused=False)
    log.info(f"[APEX] Replay speed set to {req.speed_factor}x")
    return _control


@app.get("/control", response_model=ControlState, summary="Get current replay speed state")
async def get_control() -> ControlState:
    return _control


# ── GET /health ───────────────────────────────────────────────────────────────
@app.get("/health", summary="Backend health metrics")
async def health() -> dict:
    bh = _backend_health()
    fs = _fleet_stats()
    return {
        "status": "ok",
        "fallback_mode": _fallback_mode,
        "uptime_sec": bh.uptime_sec,
        "p99_latency_ms": bh.p99_latency_ms,
        "machine_count": bh.machine_count,
        "fleet_stats": fs.model_dump(),
        "ws_clients": len(_ws_clients),
        "degraded_machines": list(_degraded),
        "version": "3.0.0",
    }


# ── WebSocket /stream ─────────────────────────────────────────────────────────
@app.websocket("/stream")
async def stream(websocket: WebSocket) -> None:
    """Canonical stream endpoint — stable long-lived connection.

    Protocol:
      • Data pushed by broadcast loop every 1 s.
      • Backend pings client every 10 s of silence; client replies 'pong'.
      • Client may send 'ping'; backend replies 'pong'.
      • Connection stays open until client closes or network failure.
    """
    await websocket.accept()
    _ws_clients.add(websocket)
    log.info(f"[APEX] WS client connected. Total: {len(_ws_clients)}")

    # ── Immediate snapshot on connect (avoids 1 s blank) ─────────────────
    if _latest_frames:
        snap_frame = StreamFrame(
            timestamp=datetime.utcnow(),
            sequence_id=_seq_id,
            machines=list(_latest_frames.values()),
            fleet_stats=_fleet_stats(),
            backend_health=_backend_health(),
        )
        try:
            await websocket.send_text(
                json.dumps(snap_frame.model_dump(mode="json"), default=str)
            )
        except Exception:
            pass

    # ── Keep-alive receive loop ───────────────────────────────────────────
    try:
        while True:
            try:
                # Wait up to 10 s for any message from client
                data = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
                # Handle both directions of ping/pong
                if data in ("ping", "pong"):
                    if data == "ping":
                        await websocket.send_text("pong")
                    # 'pong' is a keepalive ack; nothing to do
            except asyncio.TimeoutError:
                # 10 s of silence → send keepalive ping to client
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break   # client gone, exit loop
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        log.debug(f"[APEX] WS loop ended: {exc}")
    finally:
        _ws_clients.discard(websocket)
        log.info(f"[APEX] WS client disconnected. Remaining: {len(_ws_clients)}")

