"""
src/models/cnn_bilstm.py
------------------------
CNN-BiLSTM model architecture for turbofan RUL prediction (APEX Phase 1).

Architecture
------------
  Conv1D(14→32, k=5) → Conv1D(32→64, k=3) → Dropout
  → BiLSTM(64, hidden=64, layers=2) → Dropout
  → Linear(128→32) → ReLU → Linear(32→1)

The model is **defined and instantiated here only**.
Training occurs in Phase 2 via ``train.py``.

MC-Dropout uncertainty quantification is provided by ``MCDropoutPredictor``,
which keeps dropout active at inference time and aggregates N stochastic passes.
"""

from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn


class CNNBiLSTMRul(nn.Module):
    """CNN-BiLSTM regressor for Remaining Useful Life prediction.

    Input shape : ``(batch, window, n_features)`` — e.g. ``(64, 30, 14)``.
    Output shape: ``(batch,)``                    — scalar RUL per sample.

    Parameters
    ----------
    n_features:
        Number of sensor features per time-step (14 after dropping constants).
    window:
        Sliding-window length in cycles (30, as set in config.yaml).
    hidden:
        BiLSTM hidden dimension per direction (64); output dim = hidden * 2 = 128.
    dropout:
        Dropout probability applied after both the CNN block and the LSTM block.
    """

    def __init__(
        self,
        n_features: int = 14,
        window: int = 30,
        hidden: int = 64,
        dropout: float = 0.3,
    ) -> None:
        super().__init__()
        self.conv1 = nn.Conv1d(n_features, 32, kernel_size=5, padding=2)
        self.conv2 = nn.Conv1d(32, 64, kernel_size=3, padding=1)
        self.drop_cnn = nn.Dropout(dropout)
        self.lstm = nn.LSTM(
            64,
            hidden,
            num_layers=2,
            batch_first=True,
            bidirectional=True,
            dropout=dropout,
        )
        self.drop_lstm = nn.Dropout(dropout)
        self.fc1 = nn.Linear(hidden * 2, 32)
        self.fc2 = nn.Linear(32, 1)
        self.act = nn.ReLU()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass.

        Parameters
        ----------
        x:
            Input tensor of shape ``(batch, window, n_features)``.

        Returns
        -------
        torch.Tensor
            RUL predictions of shape ``(batch,)``.
        """
        # Conv1d expects (batch, channels, length) → transpose time & feature axes
        x = x.transpose(1, 2)                  # (B, n_features, window)
        x = self.act(self.conv1(x))             # (B, 32, window)
        x = self.act(self.conv2(x))             # (B, 64, window)
        x = self.drop_cnn(x)
        x = x.transpose(1, 2)                  # (B, window, 64)
        out, _ = self.lstm(x)                  # (B, window, hidden*2)
        out = self.drop_lstm(out[:, -1, :])    # take last time-step → (B, hidden*2)
        out = self.act(self.fc1(out))           # (B, 32)
        return self.fc2(out).squeeze(-1)        # (B,)


class MCDropoutPredictor:
    """Monte-Carlo Dropout wrapper for epistemic uncertainty estimation.

    Keeps dropout **active** during inference by calling ``model.train()``
    before each forward pass.  Runs ``n_samples`` stochastic forward passes
    and returns the sample mean and standard deviation as numpy arrays.

    Parameters
    ----------
    model:
        A trained (or untrained, for Phase 1 smoke-testing) ``CNNBiLSTMRul``.
    n_samples:
        Number of stochastic forward passes (50 as set in config.yaml).
    """

    def __init__(self, model: CNNBiLSTMRul, n_samples: int = 50) -> None:
        self.model = model
        self.n_samples = n_samples

    def predict(
        self, x: torch.Tensor
    ) -> tuple[np.ndarray, np.ndarray]:
        """Run N stochastic forward passes and return (mean, std).

        Parameters
        ----------
        x:
            Input tensor of shape ``(batch, window, n_features)``.

        Returns
        -------
        mean : np.ndarray of shape ``(batch,)``
            Mean predicted RUL across ``n_samples`` passes.
        std : np.ndarray of shape ``(batch,)``
            Standard deviation across ``n_samples`` passes — epistemic uncertainty.
        """
        # Keep dropout active (model.train()) but disable gradient computation.
        self.model.train()
        with torch.no_grad():
            samples = torch.stack(
                [self.model(x) for _ in range(self.n_samples)],
                dim=0,
            )  # (n_samples, batch)

        mean: np.ndarray = samples.mean(dim=0).cpu().numpy()
        std: np.ndarray = samples.std(dim=0).cpu().numpy()
        return mean, std


# ── Smoke-test instantiation (not executed during import) ─────────────────────
def _build_default_model() -> CNNBiLSTMRul:
    """Instantiate the model with Phase 1 default hyperparameters.

    Called by Phase 2 training script and unit tests.

    Returns
    -------
    CNNBiLSTMRul
        Randomly-initialised model ready for training.
    """
    return CNNBiLSTMRul(n_features=14, window=30, hidden=64, dropout=0.3)
