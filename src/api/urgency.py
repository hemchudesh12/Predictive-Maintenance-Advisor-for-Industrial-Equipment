"""
src/api/urgency.py
------------------
Phase 2B — Urgency classifier for APEX predictive maintenance.

Converts (rul_mean, rul_std) from MC Dropout into a human-interpretable
urgency level using a Gaussian-based failure probability model.

Levels (descending severity)
-----------------------------
CRITICAL : Immediate action required. High probability of failure within 30 cycles.
WARNING  : Schedule maintenance within 1 week.
MONITOR  : Watch closely; no immediate action needed.
HEALTHY  : Normal operating range.
"""

from __future__ import annotations

import math
from typing import TypedDict


# ── Color tokens (passed to frontend) ────────────────────────────────────────
_LEVEL_COLORS: dict[str, str] = {
    "CRITICAL": "#FF2D2D",
    "WARNING":  "#FF9500",
    "MONITOR":  "#FFD60A",
    "HEALTHY":  "#34C759",
}

_LEVEL_BG: dict[str, str] = {
    "CRITICAL": "#501313",
    "WARNING":  "#412402",
    "MONITOR":  "#3D3300",
    "HEALTHY":  "#173404",
}


class UrgencyResult(TypedDict):
    """Return type of :func:`classify`."""
    level: str           # CRITICAL | WARNING | MONITOR | HEALTHY
    score: float         # 0.0 – 1.0 composite urgency score
    color: str           # hex colour for frontend badge
    bg_color: str        # hex background colour
    fail_prob_30: float  # P(failure within 30 cycles)
    lower_bound: float   # rul_mean − 1.645 * rul_std  (5th percentile)


def _norm_cdf(x: float, mu: float, sigma: float) -> float:
    """Gaussian CDF: P(X ≤ x) where X ~ N(mu, sigma)."""
    if sigma <= 0:
        return 1.0 if x >= mu else 0.0
    z = (x - mu) / sigma
    return (1.0 + math.erf(z / math.sqrt(2))) / 2.0


def classify(rul_mean: float, rul_std: float) -> UrgencyResult:
    """Map (rul_mean, rul_std) to an urgency classification.

    Uses a Gaussian model of RUL distribution to estimate the probability
    of failure within 30 cycles.  The 5th-percentile lower bound (1.645σ)
    provides a conservative early-warning trigger.

    Parameters
    ----------
    rul_mean : Predicted mean RUL in cycles (from MCDropoutPredictor).
    rul_std  : Epistemic uncertainty std in cycles.

    Returns
    -------
    UrgencyResult dict with level, score, color, fail_prob_30, lower_bound.
    """
    sigma = max(rul_std, 1e-6)          # guard against zero std
    lower = rul_mean - 1.645 * sigma    # 5th percentile
    fail_prob = _norm_cdf(30.0, rul_mean, sigma)  # P(RUL ≤ 30)

    # ── Classification rules ──────────────────────────────────────────────────
    if fail_prob > 0.70 or lower < 10:
        level = "CRITICAL"
    elif fail_prob > 0.40 or lower < 30:
        level = "WARNING"
    elif fail_prob > 0.15 or rul_mean < 60:
        level = "MONITOR"
    else:
        level = "HEALTHY"

    # ── Composite urgency score (0 = healthy, 1 = certain failure) ────────────
    # Smoothly interpolates: healthy≈0, critical→1
    score = min(1.0, fail_prob + max(0.0, (30 - lower) / 60))

    return UrgencyResult(
        level=level,
        score=round(score, 4),
        color=_LEVEL_COLORS[level],
        bg_color=_LEVEL_BG[level],
        fail_prob_30=round(fail_prob, 4),
        lower_bound=round(lower, 2),
    )
