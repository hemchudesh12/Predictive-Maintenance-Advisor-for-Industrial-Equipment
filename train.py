"""
train.py
--------
Phase 2A — Full CNN-BiLSTM training loop for CMAPSS FD001.

Training protocol
-----------------
- Huber loss (delta = 1.0)
- Adam optimizer, lr = 1e-3, weight_decay = 1e-5
- CosineAnnealingLR schedule (T_max = max_epochs)
- Gradient clipping (max_norm = 1.0)
- Early stopping on val RMSE, patience = 7
- Seed = 42 everywhere
- 80/20 unit-wise train/val split (no cross-unit leakage)

Outputs
-------
- Checkpoint  : checkpoints/cnn_bilstm_fd001.pt
- Training log: logs/train.log
- Eval results: results/fd001_eval.json
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import time
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import yaml
from sklearn.metrics import f1_score, mean_absolute_error, mean_squared_error
from sklearn.preprocessing import MinMaxScaler
from torch.optim import Adam
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader

from src.data.preprocessing import (
    CMAPSSDataset,
    _FEATURE_COLS,
    compute_rul,
    drop_constant_sensors,
    load_raw,
    make_windows,
)
from src.models.cnn_bilstm import CNNBiLSTMRul, MCDropoutPredictor

# ── Constants ─────────────────────────────────────────────────────────────────
SEED = 42
LOG_DIR = Path("logs")
CKPT_DIR = Path("checkpoints")
RESULTS_DIR = Path("results")


# ── Reproducibility ───────────────────────────────────────────────────────────
def set_seed(seed: int = SEED) -> None:
    """Fix all global random seeds for full reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


# ── Metrics ───────────────────────────────────────────────────────────────────
def nasa_score(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """NASA asymmetric scoring function for RUL.

    Late predictions (pred < true → negative d) are penalized with exp(-d/13).
    Early predictions (pred > true → positive d) are penalized with exp(d/10).
    Lower is better.

    Parameters
    ----------
    y_true : true RUL values.
    y_pred : predicted RUL values.
    """
    d = y_pred - y_true
    scores = np.where(d < 0, np.exp(-d / 13) - 1, np.exp(d / 10) - 1)
    return float(np.sum(scores))


def f1_fail_30(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """F1 for binary "will fail in ≤30 cycles" classification.

    Positive class = engine expected to fail within 30 cycles.
    """
    y_true_bin = (y_true <= 30).astype(int)
    y_pred_bin = (y_pred <= 30).astype(int)
    return float(f1_score(y_true_bin, y_pred_bin, zero_division=0))


# ── Data utilities ────────────────────────────────────────────────────────────
def unit_wise_split(
    data_dir: str | Path,
    rul_cap: int = 125,
    val_ratio: float = 0.2,
    seed: int = SEED,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Split FD001 training data 80/20 by unit number.

    Splitting by unit (not by window) prevents the model from seeing future
    windows of a unit in training while evaluating on its earlier windows.

    Parameters
    ----------
    data_dir : directory containing train_FD001.txt.
    rul_cap  : RUL clipping value.
    val_ratio: fraction of units held out for validation.
    seed     : random seed for reproducibility.

    Returns
    -------
    train_df, val_df : DataFrames with rul column, ready for make_windows().
    """
    rng = np.random.default_rng(seed)
    df = load_raw(Path(data_dir) / "train_FD001.txt")
    df = drop_constant_sensors(df)
    df = compute_rul(df, rul_cap=rul_cap)

    units = df["unit"].unique().copy()
    rng.shuffle(units)
    n_val = max(1, int(len(units) * val_ratio))

    val_units = set(units[:n_val])
    train_units = set(units[n_val:])

    train_df = df[df["unit"].isin(train_units)].copy()
    val_df = df[df["unit"].isin(val_units)].copy()
    return train_df, val_df


def load_test_with_labels(
    data_dir: str | Path,
    scaler: MinMaxScaler,
    window_size: int = 30,
) -> Tuple[np.ndarray, Optional[np.ndarray]]:
    """Load test windows and true RUL labels from RUL_FD001.txt.

    Parameters
    ----------
    data_dir    : directory containing test_FD001.txt and RUL_FD001.txt.
    scaler      : MinMaxScaler fitted on training data.
    window_size : sliding window length.

    Returns
    -------
    X_test   : float32 array of shape (100, window_size, 14).
    true_rul : float32 array of shape (100,) or None if labels file missing.
    """
    data_dir = Path(data_dir)
    test_df = load_raw(data_dir / "test_FD001.txt")
    test_df = drop_constant_sensors(test_df)
    test_df[_FEATURE_COLS] = scaler.transform(test_df[_FEATURE_COLS])

    # True RUL labels
    rul_path = data_dir / "RUL_FD001.txt"
    true_rul: Optional[np.ndarray] = None
    if rul_path.exists():
        true_rul = pd.read_csv(rul_path, header=None)[0].values.astype(np.float32)

    # Last window_size cycles per engine
    X_test_list: list[np.ndarray] = []
    for _, unit_df in test_df.groupby("unit", sort=False):
        features = unit_df[_FEATURE_COLS].values
        if len(features) >= window_size:
            X_test_list.append(features[-window_size:])
        else:
            pad = np.zeros(
                (window_size - len(features), len(_FEATURE_COLS)), dtype=np.float32
            )
            X_test_list.append(np.vstack([pad, features]))

    X_test = np.stack(X_test_list, axis=0).astype(np.float32)
    return X_test, true_rul


# ── Training loop ─────────────────────────────────────────────────────────────
def train(
    data_dir: str | Path = "data/raw",
    config_path: str | Path = "config.yaml",
    checkpoint_dir: str | Path = "checkpoints",
    epochs: int = 50,
    batch_size: int = 256,
    learning_rate: float = 1e-3,
    device: Optional[str] = None,
) -> dict:
    """Train CNNBiLSTMRul on CMAPSS FD001 and evaluate on the test set.

    Parameters
    ----------
    data_dir       : directory containing FD001 flat files.
    config_path    : path to config.yaml.
    checkpoint_dir : where to save the best checkpoint.
    epochs         : maximum training epochs.
    batch_size     : mini-batch size.
    learning_rate  : initial Adam learning rate.
    device         : 'cuda', 'mps', or 'cpu'. Auto-detected if None.

    Returns
    -------
    dict with RMSE, NASA score, F1, MAE, training_time.
    """
    set_seed(SEED)

    # ── Directory setup ───────────────────────────────────────────────────────
    LOG_DIR.mkdir(exist_ok=True)
    CKPT_DIR.mkdir(exist_ok=True)
    RESULTS_DIR.mkdir(exist_ok=True)
    Path(checkpoint_dir).mkdir(exist_ok=True)

    # ── Device ────────────────────────────────────────────────────────────────
    if device is None:
        if torch.cuda.is_available():
            device = "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"
    dev = torch.device(device)

    # ── Logging ───────────────────────────────────────────────────────────────
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)s  %(message)s",
        handlers=[
            logging.FileHandler(LOG_DIR / "train.log", mode="w", encoding="utf-8"),
            logging.StreamHandler(),
        ],
        force=True,
    )
    log = logging.getLogger("apex.train")
    log.info("=" * 70)
    log.info("APEX Phase 2A — CNN-BiLSTM FD001 Training")
    log.info("=" * 70)

    # ── Config ────────────────────────────────────────────────────────────────
    with open(config_path) as f:
        cfg = yaml.safe_load(f)
    window_size: int = cfg["data"]["window_size"]
    rul_cap: int = cfg["data"]["rul_cap"]
    hidden: int = cfg["model"]["hidden"]
    dropout: float = cfg["model"]["dropout"]
    log.info(f"Config loaded: window={window_size}, rul_cap={rul_cap}, device={device}")

    t_start = time.time()

    # ── Data ──────────────────────────────────────────────────────────────────
    log.info("Building unit-wise 80/20 train/val split …")
    train_df, val_df = unit_wise_split(data_dir, rul_cap=rul_cap, seed=SEED)
    n_train_units = train_df["unit"].nunique()
    n_val_units = val_df["unit"].nunique()
    log.info(f"Train units: {n_train_units} | Val units: {n_val_units}")

    # Scaler fit on training units only
    scaler = MinMaxScaler()
    train_df[_FEATURE_COLS] = scaler.fit_transform(train_df[_FEATURE_COLS])
    val_df[_FEATURE_COLS] = scaler.transform(val_df[_FEATURE_COLS])

    X_train, y_train = make_windows(train_df, window_size=window_size, stride=1)
    X_val, y_val = make_windows(val_df, window_size=window_size, stride=1)
    log.info(f"Train windows: {len(X_train)} | Val windows: {len(X_val)}")

    train_loader = DataLoader(
        CMAPSSDataset(X_train, y_train),
        batch_size=batch_size,
        shuffle=True,
        num_workers=0,
        pin_memory=(device == "cuda"),
    )
    val_loader = DataLoader(
        CMAPSSDataset(X_val, y_val),
        batch_size=batch_size,
        shuffle=False,
        num_workers=0,
    )

    # ── Model ─────────────────────────────────────────────────────────────────
    model = CNNBiLSTMRul(
        n_features=14, window=window_size, hidden=hidden, dropout=dropout
    ).to(dev)
    optimizer = Adam(model.parameters(), lr=learning_rate, weight_decay=1e-5)
    scheduler = CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-5)
    criterion = nn.HuberLoss(delta=1.0)

    log.info(f"Model parameters: {sum(p.numel() for p in model.parameters()):,}")

    # ── Training loop ─────────────────────────────────────────────────────────
    best_val_rmse = float("inf")
    patience_counter = 0
    best_epoch = 0
    patience = 7
    ckpt_path = Path(checkpoint_dir) / "cnn_bilstm_fd001.pt"

    for epoch in range(1, epochs + 1):
        # Train
        model.train()
        train_losses: list[float] = []
        for X_b, y_b in train_loader:
            X_b, y_b = X_b.to(dev), y_b.to(dev)
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(X_b), y_b)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_losses.append(loss.item())

        # Validate
        model.eval()
        val_preds_list: list[np.ndarray] = []
        val_targets_list: list[np.ndarray] = []
        with torch.no_grad():
            for X_b, y_b in val_loader:
                val_preds_list.append(model(X_b.to(dev)).cpu().numpy())
                val_targets_list.append(y_b.numpy())

        vp = np.concatenate(val_preds_list)
        vt = np.concatenate(val_targets_list)
        train_loss = float(np.mean(train_losses))
        val_rmse = float(np.sqrt(mean_squared_error(vt, vp)))
        val_mae = float(mean_absolute_error(vt, vp))

        scheduler.step()

        log.info(
            f"Epoch {epoch:03d}/{epochs} | "
            f"train_loss={train_loss:.4f} | "
            f"val_rmse={val_rmse:.2f} | "
            f"val_mae={val_mae:.2f} | "
            f"lr={scheduler.get_last_lr()[0]:.2e}"
        )

        # Best checkpoint
        if val_rmse < best_val_rmse:
            best_val_rmse = val_rmse
            best_epoch = epoch
            torch.save(
                {
                    "epoch": epoch,
                    "val_rmse": val_rmse,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "scaler": scaler,
                    "config": cfg,
                    "seed": SEED,
                },
                ckpt_path,
            )
            log.info(f"  ✓ Best checkpoint saved (val_rmse={val_rmse:.2f})")
            patience_counter = 0
        else:
            patience_counter += 1
            log.info(f"  patience {patience_counter}/{patience}")
            if patience_counter >= patience:
                log.info(f"Early stopping triggered at epoch {epoch} (best: {best_epoch})")
                break

    training_time = time.time() - t_start
    log.info(f"Training complete in {training_time:.1f}s | Best val RMSE: {best_val_rmse:.2f}")

    # ── Test evaluation ───────────────────────────────────────────────────────
    log.info("Loading best checkpoint for test evaluation …")
    ckpt = torch.load(ckpt_path, map_location=dev)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    X_test, true_rul = load_test_with_labels(data_dir, scaler, window_size=window_size)
    X_test_t = torch.from_numpy(X_test).to(dev)

    with torch.no_grad():
        test_preds = model(X_test_t).cpu().numpy()

    test_preds = np.clip(test_preds, 0.0, rul_cap)

    if true_rul is not None:
        rmse = float(np.sqrt(mean_squared_error(true_rul, test_preds)))
        mae = float(mean_absolute_error(true_rul, test_preds))
        nasa = nasa_score(true_rul, test_preds)
        f1 = f1_fail_30(true_rul, test_preds)

        log.info("=" * 50)
        log.info(f"TEST RESULTS  FD001")
        log.info(f"  RMSE        : {rmse:.4f}")
        log.info(f"  MAE         : {mae:.4f}")
        log.info(f"  NASA Score  : {nasa:.2f}")
        log.info(f"  F1 (30-cy)  : {f1:.4f}")
        log.info("=" * 50)

        results = {
            "dataset": "FD001",
            "rmse": round(rmse, 4),
            "nasa_score": round(nasa, 4),
            "f1_30cycle": round(f1, 4),
            "mae": round(mae, 4),
            "n_test_units": int(len(X_test)),
            "checkpoint": str(ckpt_path),
            "training_time_sec": round(training_time, 2),
        }
        with open(RESULTS_DIR / "fd001_eval.json", "w") as f:
            json.dump(results, f, indent=2)
        log.info(f"Results → {RESULTS_DIR / 'fd001_eval.json'}")

        # ── Checkpoint gate check ─────────────────────────────────────────────
        if rmse > 20:
            log.error(
                f"RMSE={rmse:.2f} > 20. STOPPING — check data leak or target issue."
            )
        elif rmse > 16:
            log.warning(
                f"RMSE={rmse:.2f} is 16–20 (acceptable, not winning). Proceeding."
            )
        else:
            log.info(f"RMSE={rmse:.2f} ≤ 16 ✓ Phase 2A checkpoint gate PASSED.")

        return results
    else:
        log.warning("RUL_FD001.txt not found — test metrics unavailable.")
        return {"error": "no_labels", "training_time_sec": round(training_time, 2)}


# ── CLI ───────────────────────────────────────────────────────────────────────
def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="APEX Phase 2A training script.")
    p.add_argument("--data-dir", default="data/raw", help="FD001 data directory")
    p.add_argument("--config", default="config.yaml", help="Config YAML path")
    p.add_argument("--epochs", type=int, default=50)
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--device", default=None, choices=["cuda", "mps", "cpu", None])
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    train(
        data_dir=args.data_dir,
        config_path=args.config,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        device=args.device,
    )
