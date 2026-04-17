"""
scripts/verify_model.py
------------------------
Phase 2A smoke test — load checkpoint, run MC Dropout on a single
test sequence, print mean + std.

Usage
-----
    python scripts/verify_model.py --checkpoint checkpoints/cnn_bilstm_fd001.pt
    python scripts/verify_model.py  # uses default checkpoint path
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch

# Ensure project root is on sys.path regardless of invocation directory.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.models.cnn_bilstm import CNNBiLSTMRul, MCDropoutPredictor  # noqa: E402


def verify(checkpoint_path: str | Path = "checkpoints/cnn_bilstm_fd001.pt") -> None:
    """Load checkpoint and run MC Dropout on a single test window.

    Parameters
    ----------
    checkpoint_path : path to the saved checkpoint .pt file.

    Raises
    ------
    FileNotFoundError if checkpoint does not exist.
    """
    ckpt_path = Path(checkpoint_path)
    if not ckpt_path.exists():
        raise FileNotFoundError(
            f"Checkpoint not found: {ckpt_path}\n"
            "Run `python train.py` first to generate the checkpoint."
        )

    print(f"[verify] Loading checkpoint: {ckpt_path}")
    ckpt = torch.load(ckpt_path, map_location="cpu")

    # Rebuild model from saved config
    cfg = ckpt.get("config", {})
    model_cfg = cfg.get("model", {})
    data_cfg = cfg.get("data", {})

    model = CNNBiLSTMRul(
        n_features=14,
        window=data_cfg.get("window_size", 30),
        hidden=model_cfg.get("hidden", 64),
        dropout=model_cfg.get("dropout", 0.3),
    )
    model.load_state_dict(ckpt["model_state_dict"])
    print(f"[verify] Model loaded. Val RMSE at save: {ckpt.get('val_rmse', 'N/A'):.4f}")

    # ── Single test sequence (random, for smoke-test only) ────────────────────
    torch.manual_seed(42)
    x_demo = torch.randn(1, 30, 14)  # (batch=1, window=30, features=14)

    predictor = MCDropoutPredictor(model=model, n_samples=50)
    mean_rul, std_rul = predictor.predict(x_demo)

    print("\n" + "=" * 50)
    print("MC DROPOUT SMOKE TEST  (random input — sanity check only)")
    print("=" * 50)
    print(f"  mean RUL : {mean_rul[0]:.4f} cycles")
    print(f"  std  RUL : {std_rul[0]:.4f} cycles  (epistemic uncertainty)")
    print(f"  95% CI   : [{mean_rul[0] - 1.96*std_rul[0]:.2f}, "
          f"{mean_rul[0] + 1.96*std_rul[0]:.2f}]")
    print("=" * 50)

    # ── Load eval results if available ────────────────────────────────────────
    results_path = ROOT / "results" / "fd001_eval.json"
    if results_path.exists():
        with open(results_path) as f:
            results = json.load(f)
        print("\nTest evaluation results (from training run):")
        for k, v in results.items():
            print(f"  {k:<25}: {v}")
    else:
        print("\n[verify] results/fd001_eval.json not found — run training first.")

    print("\n[verify] ✓ Model imports and runs cleanly. Phase 2A gate PASSED.")


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="APEX model verification smoke test.")
    p.add_argument(
        "--checkpoint",
        default="checkpoints/cnn_bilstm_fd001.pt",
        help="Path to .pt checkpoint file.",
    )
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    verify(args.checkpoint)
