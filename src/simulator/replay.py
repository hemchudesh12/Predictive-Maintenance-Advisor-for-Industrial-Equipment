"""
src/simulator/replay.py
-----------------------
Async sensor simulator for APEX Phase 1.

Reads ``test_FD001.txt`` from ``data/raw/`` and POSTs one sensor cycle per
second per selected engine to the ``/ingest`` endpoint.

Usage (Phase 2 — do not execute in Phase 1)
-------------------------------------------
::

    python -m src.simulator.replay --engines 1 2 3 --rate 1.0

CLI flags
---------
--engines   One or more integer engine unit IDs to simulate (default: all).
--rate      Cycles per second to POST per engine (default: 1.0).
--host      API host (default: http://localhost:8000).
--data-dir  Directory containing FD001 flat files (default: data/raw).

This script is async so multiple engines are interleaved with asyncio, not
threads.  Each engine runs as a separate coroutine.
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

# ── Column layout shared with preprocessing.py ────────────────────────────────
_RAW_COLS: list[str] = (
    ["unit", "cycle", "op1", "op2", "op3"]
    + [f"s{i}" for i in range(1, 22)]
)
_DROP_SENSORS: list[str] = ["s1", "s5", "s6", "s10", "s16", "s18", "s19"]
_FEATURE_COLS: list[str] = [
    "s2", "s3", "s4", "s7", "s8", "s9",
    "s11", "s12", "s13", "s14", "s15", "s17", "s20", "s21",
]
_OP_COLS: list[str] = ["op1", "op2", "op3"]


def load_test_data(data_dir: Path) -> pd.DataFrame:
    """Load and lightly clean the FD001 test file.

    Parameters
    ----------
    data_dir:
        Directory containing ``test_FD001.txt``.

    Returns
    -------
    pd.DataFrame
        Test data with constant sensors removed.
    """
    df = pd.read_csv(
        data_dir / "test_FD001.txt",
        sep=r"\s+",
        header=None,
        names=_RAW_COLS,
    )
    df.drop(columns=_DROP_SENSORS, errors="ignore", inplace=True)
    return df


async def replay_engine(
    engine_id: int,
    engine_df: pd.DataFrame,
    host: str,
    rate: float,
    client: httpx.AsyncClient,
) -> None:
    """Stream one engine's cycles to ``/ingest`` at ``rate`` cycles/second.

    Parameters
    ----------
    engine_id:
        Integer engine unit ID (matches CMAPSS ``unit`` column).
    engine_df:
        Rows of the test DataFrame belonging to this engine.
    host:
        Base URL of the APEX API (e.g. ``http://localhost:8000``).
    rate:
        Cycles per second to POST (default 1.0).
    client:
        Shared ``httpx.AsyncClient`` instance.
    """
    interval_s = 1.0 / rate
    machine_id = f"engine_{engine_id}"

    for _, row in engine_df.iterrows():
        payload: dict = {
            "machine_id": machine_id,
            "cycle": int(row["cycle"]),
            "op_setting_1": float(row["op1"]),
            "op_setting_2": float(row["op2"]),
            "op_setting_3": float(row["op3"]),
            "sensor_readings": [float(row[c]) for c in _FEATURE_COLS],
        }
        try:
            resp = await client.post(f"{host}/ingest", json=payload, timeout=5.0)
            resp.raise_for_status()
            print(f"[{machine_id}] cycle={payload['cycle']} → {resp.status_code}")
        except httpx.HTTPError as exc:
            print(f"[{machine_id}] cycle={payload['cycle']} FAILED: {exc}")

        await asyncio.sleep(interval_s)


async def run_simulation(
    engines: list[int] | None,
    rate: float,
    host: str,
    data_dir: Path,
) -> None:
    """Launch one coroutine per selected engine and await all completions.

    Parameters
    ----------
    engines:
        List of engine unit IDs to replay.  ``None`` means all engines.
    rate:
        Cycles per second (applied independently per engine coroutine).
    host:
        Base URL of the APEX API.
    data_dir:
        Directory containing ``test_FD001.txt``.
    """
    df = load_test_data(data_dir)

    available_engines: list[int] = sorted(df["unit"].unique().tolist())
    selected_engines: list[int] = engines if engines else available_engines

    async with httpx.AsyncClient() as client:
        tasks = [
            replay_engine(
                engine_id=eid,
                engine_df=df[df["unit"] == eid].reset_index(drop=True),
                host=host,
                rate=rate,
                client=client,
            )
            for eid in selected_engines
            if eid in available_engines
        ]
        await asyncio.gather(*tasks)


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the simulator.

    Returns
    -------
    argparse.Namespace
        Parsed argument namespace with ``engines``, ``rate``, ``host``,
        and ``data_dir`` attributes.
    """
    parser = argparse.ArgumentParser(
        description="APEX sensor simulator — replays FD001 test data to /ingest."
    )
    parser.add_argument(
        "--engines",
        nargs="+",
        type=int,
        default=None,
        metavar="ID",
        help="Engine unit IDs to simulate (default: all engines in test set).",
    )
    parser.add_argument(
        "--rate",
        type=float,
        default=1.0,
        help="Cycles per second per engine (default: 1.0).",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="http://localhost:8000",
        help="APEX API base URL (default: http://localhost:8000).",
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default="data/raw",
        dest="data_dir",
        help="Directory containing FD001 flat files (default: data/raw).",
    )
    return parser.parse_args()


# ── Entry point — NOT called during Phase 1 ──────────────────────────────────
if __name__ == "__main__":
    args = parse_args()
    asyncio.run(
        run_simulation(
            engines=args.engines,
            rate=args.rate,
            host=args.host,
            data_dir=Path(args.data_dir),
        )
    )
