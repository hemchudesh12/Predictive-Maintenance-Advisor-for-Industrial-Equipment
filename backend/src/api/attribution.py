"""
src/api/attribution.py
-----------------------
Phase 2B — Component attribution rule engine for APEX.

Maps normalized CMAPSS sensor z-scores to the most likely failing pump
component using an SME-defined ontology.  Since CMAPSS turbofan sensors
don't map 1:1 to pump channels, we use a sensor-to-component mapping
defined in config.yaml under ``sensor_mapping``.

CMAPSS → Pump sensor mapping (documented in AGENT_LOG.md)
----------------------------------------------------------
The FD001 dataset contains 14 informative sensors after constant-sensor
removal.  We map them to pump-equivalent channels based on physical
analogy:

  s2  (fan inlet temp)         → bearing_temp
  s3  (LPC outlet temp)        → winding_temp
  s4  (HPC outlet temp)        → motor_current
  s7  (HPC outlet pressure)    → discharge_pressure
  s8  (fan speed)              → vibration_1x_rpm
  s9  (core speed)             → vibration_rms
  s11 (HPC outlet static p)    → suction_pressure
  s12 (ratio of fuel)          → flow_rate
  s13 (corrected fan speed)    → motor_current_asymmetry
  s14 (corrected core speed)   → vibration_hf
  s15 (bypass ratio)           → bearing_temp  (secondary)
  s17 (bleed enthalpy)         → seal_pressure_delta  → used for seal rule
  s20 (HPT cool air flow)      → (unused — mapped to generic)
  s21 (LPT cool air flow)      → (unused — mapped to generic)
"""

from __future__ import annotations

from typing import TypedDict

import numpy as np


class AttributionResult(TypedDict):
    """Return type of :func:`attribute`."""
    component: str       # human-readable failing component name
    confidence: float    # 0.0–1.0 rule match strength
    triggered_rule: str  # textual rule that fired
    recommendation: str  # short action sentence for the dashboard


# ── Sensor index map (into the 14-element feature vector) ────────────────────
# Order matches _FEATURE_COLS = [s2,s3,s4,s7,s8,s9,s11,s12,s13,s14,s15,s17,s20,s21]
_IDX = {
    "bearing_temp":           0,   # s2
    "winding_temp":           1,   # s3
    "motor_current":          2,   # s4
    "discharge_pressure":     3,   # s7
    "vibration_1x_rpm":       4,   # s8
    "vibration_rms":          5,   # s9
    "suction_pressure":       6,   # s11
    "flow_rate":              7,   # s12
    "motor_current_asym":     8,   # s13
    "vibration_hf":           9,   # s14
    "bearing_temp_2":         10,  # s15
    "seal_pressure_delta":    11,  # s17
}


def _z(window: np.ndarray, idx: int) -> float:
    """Z-score of the last cycle value relative to the window mean/std."""
    col = window[:, idx]
    mu, sigma = col.mean(), col.std()
    if sigma < 1e-8:
        return 0.0
    return float((col[-1] - mu) / sigma)


def attribute(window: np.ndarray) -> AttributionResult:
    """Apply component attribution rules to the last sensor window.

    Rules are evaluated in priority order (highest severity first).
    The first matching rule is returned.  If no rule fires, returns
    'Generic degradation' as a fallback.

    Parameters
    ----------
    window : float32 array of shape (window_size, 14) — the current ring
             buffer contents for one machine.  Values are MinMax-scaled
             to [0, 1].

    Returns
    -------
    AttributionResult with component, confidence, rule, recommendation.
    """
    # Compute z-scores for relevant channels
    z_bearing_temp  = _z(window, _IDX["bearing_temp"])
    z_winding_temp  = _z(window, _IDX["winding_temp"])
    z_motor_cur     = _z(window, _IDX["motor_current"])
    z_motor_asym    = _z(window, _IDX["motor_current_asym"])
    z_discharge_p   = _z(window, _IDX["discharge_pressure"])
    z_suction_p     = _z(window, _IDX["suction_pressure"])
    z_vib_1x        = _z(window, _IDX["vibration_1x_rpm"])
    z_vib_rms       = _z(window, _IDX["vibration_rms"])
    z_vib_hf        = _z(window, _IDX["vibration_hf"])
    z_flow          = _z(window, _IDX["flow_rate"])
    z_seal          = _z(window, _IDX["seal_pressure_delta"])

    # ── Rule evaluation (priority: most-specific first) ───────────────────────

    # Cavitation: high-frequency vibration + low suction pressure
    if z_vib_hf > 2.5 and z_suction_p < -2.0:
        return AttributionResult(
            component="Cavitation",
            confidence=round(min(1.0, (z_vib_hf - 2.5 + abs(z_suction_p) - 2.0) / 3), 3),
            triggered_rule="vibration_hf_z > 2.5 AND suction_pressure_z < -2.0",
            recommendation="Check suction valve and NPSH margin immediately.",
        )

    # Bearing: vibration + temperature rising
    if z_vib_rms > 2.0 and z_bearing_temp > 1.5:
        return AttributionResult(
            component="Bearing",
            confidence=round(min(1.0, (z_vib_rms - 2.0 + z_bearing_temp - 1.5) / 3), 3),
            triggered_rule="vibration_rms_z > 2.0 AND bearing_temp_z > 1.5",
            recommendation="Schedule bearing inspection within 48 hours.",
        )

    # Impeller: 1x RPM vibration + reduced flow
    if z_vib_1x > 2.0 and z_flow < -1.0:
        return AttributionResult(
            component="Impeller",
            confidence=round(min(1.0, (z_vib_1x - 2.0 + abs(z_flow) - 1.0) / 3), 3),
            triggered_rule="vibration_1x_rpm_z > 2.0 AND flow_rate_z < -1.0",
            recommendation="Inspect impeller for erosion or imbalance.",
        )

    # Seal: falling discharge pressure + rising current
    if z_discharge_p < -1.5 and z_motor_cur > 1.0:
        return AttributionResult(
            component="Seal",
            confidence=round(min(1.0, (abs(z_discharge_p) - 1.5 + z_motor_cur - 1.0) / 3), 3),
            triggered_rule="discharge_pressure_z < -1.5 AND motor_current_z > 1.0",
            recommendation="Inspect mechanical seal for wear — pressure loss detected.",
        )

    # Motor: asymmetric current draw OR winding temperature spike
    if z_motor_asym > 1.5 or z_winding_temp > 2.0:
        triggered = (
            "motor_current_asymmetry_z > 1.5"
            if z_motor_asym > 1.5
            else "winding_temp_z > 2.0"
        )
        return AttributionResult(
            component="Motor",
            confidence=round(min(1.0, max(z_motor_asym - 1.5, z_winding_temp - 2.0) / 2), 3),
            triggered_rule=triggered,
            recommendation="Check motor windings and current balance across phases.",
        )

    # Fallback: generic degradation
    return AttributionResult(
        component="Generic degradation",
        confidence=0.0,
        triggered_rule="no specific rule matched",
        recommendation="Continue monitoring; schedule next planned maintenance.",
    )
