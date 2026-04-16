"""
src/schemas.py
--------------
Pydantic v2 schema contracts for APEX Phase 1.

These models define the data exchange contracts between:
  - The sensor simulator → API (/ingest)
  - The API → downstream consumers (/predict, /stream)

Phase 2 must not modify field names or types without a versioned migration.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class SensorPayload(BaseModel):
    """A single cycle of raw sensor readings from one machine.

    Matches the CMAPSS column schema after dropping constant sensors.
    The 14 feature_sensors are listed in config.yaml under data.feature_sensors.
    """

    machine_id: str = Field(
        ...,
        description="Unique identifier for the engine/machine unit.",
        examples=["engine_1"],
    )
    cycle: int = Field(
        ...,
        ge=1,
        description="Operational cycle index (1-indexed, monotonically increasing).",
    )
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
    """Model output for one machine at a given cycle.

    In Phase 1 the API returns a mock prediction.
    Phase 2 will replace mock values with real model inference.
    """

    machine_id: str = Field(..., description="Engine/machine unit identifier.")
    cycle: int = Field(..., description="Cycle at which prediction was made.")
    rul_mean: float = Field(
        ...,
        ge=0.0,
        description="Predicted mean Remaining Useful Life (cycles).",
    )
    rul_std: float = Field(
        ...,
        ge=0.0,
        description=(
            "Epistemic uncertainty (std) from MC-Dropout. "
            "Zero until Phase 2 wires real inference."
        ),
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Normalised confidence score derived from rul_std.",
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="UTC wall-clock time of this prediction.",
    )


class MachineState(BaseModel):
    """Aggregated operational state of one machine, stored in the ring buffer.

    The buffer is an in-memory deque of SensorPayload objects keyed by
    machine_id.  This schema represents the current summary snapshot.
    """

    machine_id: str = Field(..., description="Engine/machine unit identifier.")
    last_cycle: int = Field(..., description="Most recently ingested cycle index.")
    buffer_length: int = Field(
        ...,
        ge=0,
        description="Number of cycles currently held in the ring buffer.",
    )
    latest_prediction: Optional[Prediction] = Field(
        default=None,
        description="Last prediction returned for this machine (None before Phase 2).",
    )
    is_ready: bool = Field(
        ...,
        description=(
            "True when buffer_length >= window_size (30) so inference can run. "
            "Phase 2 checks this flag before calling the model."
        ),
    )
