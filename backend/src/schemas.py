"""
src/schemas.py
--------------
Pydantic v2 schema contracts for APEX (Phase 1 ++ Phase 3).

These models define the data exchange contracts between:
  - The sensor simulator  → API (/ingest)
  - The API               → downstream consumers (/predict, /stream, /snapshot)
  - The frontend          → alert + control endpoints

Phase 3 additions: UrgencyInfo, ComponentAttribution, SensorSnapshot,
MachineFrame, FleetStats, BackendHealth, StreamFrame, EmailAlertRequest,
EmailAlertResponse, ControlRequest.
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────────
# Phase 1 schemas (unchanged field names / types — backward compatible)
# ─────────────────────────────────────────────────────────────────────────────

class SensorPayload(BaseModel):
    """A single cycle of raw sensor readings from one machine."""

    machine_id: str = Field(
        ...,
        description="Unique identifier for the engine/machine unit.",
        examples=["engine_1"],
    )
    cycle: int = Field(..., ge=1, description="Operational cycle index (1-indexed).")
    op_setting_1: float = Field(..., description="Operational setting 1.")
    op_setting_2: float = Field(..., description="Operational setting 2.")
    op_setting_3: float = Field(..., description="Operational setting 3.")
    sensor_readings: List[float] = Field(
        ...,
        min_length=14,
        max_length=14,
        description=(
            "14 sensor values corresponding to feature_sensors "
            "[2,3,4,7,8,9,11,12,13,14,15,17,20,21] in that order."
        ),
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="UTC wall-clock time when this payload was ingested.",
    )


class Prediction(BaseModel):
    """Legacy model output for one machine at a given cycle (kept for /predict compat)."""

    machine_id: str = Field(..., description="Engine/machine unit identifier.")
    cycle: int = Field(..., description="Cycle at which prediction was made.")
    rul_mean: float = Field(..., ge=0.0, description="Predicted mean RUL (cycles).")
    rul_std: float = Field(..., ge=0.0, description="Epistemic uncertainty (std).")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Normalised confidence.")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="UTC wall-clock time of this prediction.",
    )


class MachineState(BaseModel):
    """Aggregated operational state of one machine (Phase 1 /ingest response)."""

    machine_id: str = Field(..., description="Engine/machine unit identifier.")
    last_cycle: int = Field(..., description="Most recently ingested cycle index.")
    buffer_length: int = Field(..., ge=0, description="Cycles in ring buffer.")
    latest_prediction: Optional[Prediction] = Field(default=None)
    is_ready: bool = Field(..., description="True when buffer_length >= 30.")


# ─────────────────────────────────────────────────────────────────────────────
# Phase 3 schemas — canonical WebSocket frame + supporting types
# ─────────────────────────────────────────────────────────────────────────────

class UrgencyInfo(BaseModel):
    """Urgency classification for one machine."""

    level: str = Field(
        ..., description="CRITICAL | WARNING | MONITOR | HEALTHY"
    )
    score: float = Field(..., ge=0.0, le=1.0, description="Composite urgency 0–1.")
    color_token: str = Field(..., description="Hex colour for frontend badge.")
    bg_color: str = Field(..., description="Hex background colour.")
    fail_prob_30: float = Field(..., description="P(failure within 30 cycles).")
    lower_bound: float = Field(..., description="5th-percentile RUL lower bound.")


class ComponentAttribution(BaseModel):
    """Which physical component is most likely degrading and why."""

    component: str = Field(..., description="Human-readable component name.")
    confidence: float = Field(..., ge=0.0, le=1.0)
    triggered_rule: str = Field(..., description="Rule expression that fired.")
    recommendation: str = Field(..., description="Short action sentence.")
    driver_sensors: List[str] = Field(
        default_factory=list,
        description="Sensor names that drove the rule.",
    )


class SimilarFailure(BaseModel):
    """A historical failure case similar to current machine state."""

    case_id: str
    component: str
    rul_at_detection: float
    outcome: str                         # e.g. "Planned maintenance — $12k"
    sparkline: List[float] = Field(      # last-N RUL values for mini-chart
        default_factory=list
    )


class MachineFrame(BaseModel):
    """Complete state for one machine within a WebSocket frame."""

    machine_id: str
    current_cycle: int = Field(default=0, description="Actual engine cycle number from the data buffer.")
    rul_mean: float
    rul_std: float
    rul_lower_95: float
    rul_upper_95: float
    fail_prob_30: float
    urgency: UrgencyInfo
    component_attribution: ComponentAttribution
    sensor_snapshot: Dict[str, float] = Field(default_factory=dict)
    lifecycle_position: float = Field(..., ge=0.0, le=1.0)
    last_update_ms: float = Field(..., description="Inference latency in ms.")
    buffer_length: int = Field(..., description="Current buffer fill (max 30).")
    mode: str = Field(default="live", description="live | fallback | warming_up")
    similar_failures: List[SimilarFailure] = Field(default_factory=list)


class FleetStats(BaseModel):
    """Aggregate fleet health counts for the header bar."""

    critical: int = 0
    warning: int = 0
    monitor: int = 0
    healthy: int = 0
    total: int = 0


class BackendHealth(BaseModel):
    """Server-side performance metrics returned in every frame."""

    p99_latency_ms: float = 0.0
    uptime_sec: float = 0.0
    machine_count: int = 0


class StreamFrame(BaseModel):
    """Canonical WebSocket broadcast frame (one per second)."""

    timestamp: datetime = Field(default_factory=datetime.utcnow)
    sequence_id: int
    machines: List[MachineFrame]
    fleet_stats: FleetStats
    backend_health: BackendHealth


# ─────────────────────────────────────────────────────────────────────────────
# Alert / control endpoint schemas
# ─────────────────────────────────────────────────────────────────────────────

class EmailAlertRequest(BaseModel):
    machine_id: str
    user_email: str = Field(..., description="Recipient email address.")


class EmailAlertResponse(BaseModel):
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None
    rate_limited: bool = False
    retry_after_sec: Optional[int] = None


class ControlRequest(BaseModel):
    speed_factor: float = Field(
        ..., ge=1.0, le=100.0, description="Replay speed multiplier."
    )


class ControlState(BaseModel):
    speed_factor: float
    paused: bool = False


class CostConfig(BaseModel):
    cost_per_failure: float
    cost_per_maintenance: float
    savings_per_prevention: float
