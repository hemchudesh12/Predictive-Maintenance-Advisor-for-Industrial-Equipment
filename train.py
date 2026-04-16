"""
train.py
--------
Training entry-point stub for APEX.

THIS FILE IS A STUB — DO NOT EXECUTE IN PHASE 1.

Phase 2 (Human-AI Co-Curation) will implement the training loop body,
add experiment tracking (e.g., MLflow), and run the actual training run.

The function signatures and parameters defined here form the contract that
Phase 2 must satisfy.  Do not change the function names or argument names
without updating the Phase 2 implementation plan.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional


def train(
    data_dir: str | Path = "data/raw",
    config_path: str | Path = "config.yaml",
    checkpoint_dir: str | Path = "checkpoints",
    epochs: int = 50,
    batch_size: int = 64,
    learning_rate: float = 1e-3,
    device: Optional[str] = None,
) -> None:
    """Train the CNNBiLSTMRul model on CMAPSS FD001.

    Parameters
    ----------
    data_dir:
        Directory containing ``train_FD001.txt`` and ``test_FD001.txt``.
    config_path:
        Path to ``config.yaml`` providing hyperparameter overrides.
    checkpoint_dir:
        Directory where best-model checkpoints will be saved.
    epochs:
        Number of training epochs.
    batch_size:
        Mini-batch size for the training DataLoader.
    learning_rate:
        Initial learning rate for the Adam optimiser.
    device:
        PyTorch device string (``"cuda"``, ``"mps"``, ``"cpu"``).
        Auto-detected if ``None``.

    Raises
    ------
    NotImplementedError
        Always — this function body is reserved for Phase 2.
    """
    raise NotImplementedError(
        "Training loop is out of scope for Phase 1. "
        "Implement in Phase 2 (Human-AI Co-Curation)."
    )


# ── Guard: prevents accidental execution ─────────────────────────────────────
if __name__ == "__main__":
    raise SystemExit(
        "train.py is a Phase 1 stub and must not be executed. "
        "Complete Phase 2 before running training."
    )
