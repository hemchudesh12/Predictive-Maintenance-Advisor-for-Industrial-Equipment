"""
src/data/preprocessing.py
--------------------------
CMAPSS FD001 data pipeline for APEX Phase 1.

Responsibilities
----------------
1. Load train_FD001.txt and test_FD001.txt from ``data/raw/``.
2. Drop constant sensors (1, 5, 6, 10, 16, 18, 19) — they carry no degradation signal.
3. Compute Remaining Useful Life (RUL) per engine unit from the training set.
4. Clip RUL at ``rul_cap`` (125 cycles) — piecewise-linear target common in the literature.
5. Fit MinMaxScaler **on training data only** then transform both splits (no leakage).
6. Build overlapping sliding windows of size ``window_size`` (30) with stride 1.
7. Return ``CMAPSSDataset`` (a ``torch.utils.data.Dataset``) and a ``DataLoader`` factory.

Phase 2 will call ``build_dataloaders`` to obtain ready-to-train splits.
"""

from __future__ import annotations

from pathlib import Path
from typing import Tuple

import numpy as np
import pandas as pd
import torch
from sklearn.preprocessing import MinMaxScaler
from torch.utils.data import DataLoader, Dataset

# ── Column layout of FD001 flat files ──────────────────────────────────────────
_RAW_COLS: list[str] = (
    ["unit", "cycle", "op1", "op2", "op3"]
    + [f"s{i}" for i in range(1, 22)]
)

# Sensors with near-zero variance across all operating conditions — drop them.
_DROP_SENSORS: list[str] = ["s1", "s5", "s6", "s10", "s16", "s18", "s19"]

# The 14 informative feature columns (sensors 2,3,4,7,8,9,11–15,17,20,21).
_FEATURE_COLS: list[str] = [
    "s2", "s3", "s4", "s7", "s8", "s9",
    "s11", "s12", "s13", "s14", "s15", "s17", "s20", "s21",
]


def load_raw(path: Path) -> pd.DataFrame:
    """Read a CMAPSS flat file into a DataFrame with named columns.

    Parameters
    ----------
    path:
        Absolute or relative path to a CMAPSS ``*.txt`` file.

    Returns
    -------
    pd.DataFrame
        Raw sensor matrix with columns defined by ``_RAW_COLS``.
    """
    df = pd.read_csv(path, sep=r"\s+", header=None, names=_RAW_COLS)
    return df


def compute_rul(df: pd.DataFrame, rul_cap: int = 125) -> pd.DataFrame:
    """Append a clipped RUL column to a training DataFrame.

    RUL at cycle *t* for unit *u* = (max cycle of *u*) − *t*.
    Values above ``rul_cap`` are clipped to ``rul_cap`` (piecewise-linear scheme).

    Parameters
    ----------
    df:
        Raw training DataFrame with ``unit`` and ``cycle`` columns.
    rul_cap:
        Maximum RUL value; defaults to 125 cycles per CMAPSS convention.

    Returns
    -------
    pd.DataFrame
        Input DataFrame with an additional ``rul`` column.
    """
    max_cycle = df.groupby("unit")["cycle"].max().rename("max_cycle")
    df = df.join(max_cycle, on="unit")
    df["rul"] = (df["max_cycle"] - df["cycle"]).clip(upper=rul_cap)
    df.drop(columns=["max_cycle"], inplace=True)
    return df


def drop_constant_sensors(df: pd.DataFrame) -> pd.DataFrame:
    """Remove the seven constant-variance sensor columns from *df*.

    Parameters
    ----------
    df:
        DataFrame containing raw CMAPSS sensor columns.

    Returns
    -------
    pd.DataFrame
        DataFrame without columns listed in ``_DROP_SENSORS``.
    """
    return df.drop(columns=_DROP_SENSORS, errors="ignore")


def make_windows(
    df: pd.DataFrame,
    window_size: int = 30,
    stride: int = 1,
) -> Tuple[np.ndarray, np.ndarray]:
    """Build overlapping sliding windows from a scaled sensor DataFrame.

    Windows are created **per unit** so no cross-unit contamination occurs.
    Only windows where the full ``window_size`` fits within the unit's history
    are included.

    Parameters
    ----------
    df:
        DataFrame with columns ``unit``, ``rul``, and the 14 feature sensor
        columns (already scaled).
    window_size:
        Number of consecutive cycles per window (default 30).
    stride:
        Step size between consecutive windows (default 1).

    Returns
    -------
    X : np.ndarray of shape (N, window_size, n_features)
        Sensor windows.
    y : np.ndarray of shape (N,)
        RUL label corresponding to the *last* cycle in each window.
    """
    X_list: list[np.ndarray] = []
    y_list: list[float] = []

    for _, unit_df in df.groupby("unit", sort=False):
        features = unit_df[_FEATURE_COLS].values  # (T, 14)
        labels = unit_df["rul"].values             # (T,)
        T = len(features)

        for start in range(0, T - window_size + 1, stride):
            end = start + window_size
            X_list.append(features[start:end])
            y_list.append(labels[end - 1])

    X = np.stack(X_list, axis=0).astype(np.float32)   # (N, 30, 14)
    y = np.array(y_list, dtype=np.float32)              # (N,)
    return X, y


class CMAPSSDataset(Dataset):
    """PyTorch Dataset wrapping CMAPSS sliding-window arrays.

    Parameters
    ----------
    X:
        Sensor window array of shape (N, window_size, n_features).
    y:
        RUL label array of shape (N,).
    """

    def __init__(self, X: np.ndarray, y: np.ndarray) -> None:
        self.X = torch.from_numpy(X)          # (N, 30, 14) float32
        self.y = torch.from_numpy(y)          # (N,)        float32

    def __len__(self) -> int:
        return len(self.y)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        return self.X[idx], self.y[idx]


def build_dataloaders(
    data_dir: str | Path = "data/raw",
    window_size: int = 30,
    stride: int = 1,
    rul_cap: int = 125,
    batch_size: int = 64,
    num_workers: int = 0,
) -> Tuple[DataLoader, DataLoader, MinMaxScaler]:
    """Full pipeline: load → clean → scale → window → DataLoader.

    The scaler is fit **only** on the training split to prevent data leakage.
    Test windows use the last ``window_size`` cycles of each engine (no RUL label
    available in FD001 test file — labels are in RUL_FD001.txt for evaluation).

    Parameters
    ----------
    data_dir:
        Directory containing ``train_FD001.txt`` and ``test_FD001.txt``.
    window_size:
        Sliding window length (cycles).
    stride:
        Step between windows.
    rul_cap:
        Maximum RUL cap applied to training labels.
    batch_size:
        Mini-batch size for both DataLoaders.
    num_workers:
        DataLoader worker processes (0 = main process only).

    Returns
    -------
    train_loader : DataLoader
    test_loader  : DataLoader
    scaler       : MinMaxScaler  (fitted on train — Phase 2 saves this for inference)
    """
    data_dir = Path(data_dir)

    # ── Load raw files ────────────────────────────────────────────────────────
    train_raw = load_raw(data_dir / "train_FD001.txt")
    test_raw = load_raw(data_dir / "test_FD001.txt")

    # ── Drop constant sensors ─────────────────────────────────────────────────
    train_raw = drop_constant_sensors(train_raw)
    test_raw = drop_constant_sensors(test_raw)

    # ── Compute training RUL labels ───────────────────────────────────────────
    train_raw = compute_rul(train_raw, rul_cap=rul_cap)

    # ── Fit scaler on training features only ─────────────────────────────────
    scaler = MinMaxScaler()
    train_raw[_FEATURE_COLS] = scaler.fit_transform(train_raw[_FEATURE_COLS])
    test_raw[_FEATURE_COLS] = scaler.transform(test_raw[_FEATURE_COLS])

    # ── Build sliding windows ─────────────────────────────────────────────────
    X_train, y_train = make_windows(train_raw, window_size, stride)

    # Test set: take the last `window_size` cycles per engine as a single window.
    X_test_list: list[np.ndarray] = []
    for _, unit_df in test_raw.groupby("unit", sort=False):
        features = unit_df[_FEATURE_COLS].values
        if len(features) >= window_size:
            X_test_list.append(features[-window_size:])
        else:
            # Pad with zeros on the left if sequence is shorter than window
            pad = np.zeros((window_size - len(features), len(_FEATURE_COLS)), dtype=np.float32)
            X_test_list.append(np.vstack([pad, features]))

    X_test = np.stack(X_test_list, axis=0).astype(np.float32)
    # Test labels are all-zero placeholders; Phase 2 loads RUL_FD001.txt for eval.
    y_test = np.zeros(len(X_test), dtype=np.float32)

    train_ds = CMAPSSDataset(X_train, y_train)
    test_ds = CMAPSSDataset(X_test, y_test)

    train_loader = DataLoader(
        train_ds,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=True,
    )
    test_loader = DataLoader(
        test_ds,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True,
    )

    return train_loader, test_loader, scaler
