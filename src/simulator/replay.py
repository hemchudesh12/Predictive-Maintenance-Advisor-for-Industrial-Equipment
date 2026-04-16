"""
src/simulator/replay.py
-----------------------
APEX continuous sensor simulator with STAGGERED lifecycle starts.

Each engine starts at a different phase of its lifecycle, so the fleet
ALWAYS shows a spread of urgency levels (HEALTHY, MONITOR, WARNING, CRITICAL).
At higher speed, all engines degrade faster — you see urgency badges change
in real time.

Stagger offsets (fraction of total lifecycle):
    engine 1 → starts at   0% (brand new)
    engine 2 → starts at  25% (mild wear)
    engine 3 → starts at  50% (moderate wear)
    engine 4 → starts at  75% (heavy wear)
    engine 5 → starts at  90% (near failure)

After each engine completes its lifecycle it restarts from 0% (new engine).
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

import httpx
import pandas as pd

# ── Column layout ────────────────────────────────────────────────────────────
_RAW_COLS: list[str] = (
    ["unit", "cycle", "op1", "op2", "op3"]
    + [f"s{i}" for i in range(1, 22)]
)
_DROP_SENSORS: list[str] = ["s1", "s5", "s6", "s10", "s16", "s18", "s19"]
_FEATURE_COLS: list[str] = [
    "s2", "s3", "s4", "s7", "s8", "s9",
    "s11", "s12", "s13", "s14", "s15", "s17", "s20", "s21",
]

# Stagger: each slot index → fraction into the lifecycle to start at
# 5 engines → offsets 0%, 20%, 40%, 60%, 80%
_STAGGER_OFFSETS = [0.0, 0.20, 0.40, 0.60, 0.80]

# Speed polling
_cached_speed: float = 1.0
_POLL_EVERY_N: int   = 5


# ── Data loading ─────────────────────────────────────────────────────────────

def load_train_data(data_dir: Path) -> pd.DataFrame:
    path = data_dir / "train_FD001.txt"
    df   = pd.read_csv(path, sep=r"\s+", header=None, names=_RAW_COLS)
    df.drop(columns=_DROP_SENSORS, errors="ignore", inplace=True)
    return df


# ── Speed polling ─────────────────────────────────────────────────────────────

async def poll_speed(host: str, client: httpx.AsyncClient) -> float:
    global _cached_speed
    try:
        resp          = await client.get(f"{host}/control", timeout=2.0)
        _cached_speed = float(resp.json().get("speed_factor", 1.0))
    except Exception:
        pass
    return _cached_speed


# ── Per-engine coroutine ──────────────────────────────────────────────────────

async def replay_engine(
    engine_id:    int,
    engine_df:    pd.DataFrame,
    host:         str,
    base_rate:    float,
    client:       httpx.AsyncClient,
    stagger_frac: float,     # 0.0 = start from beginning, 0.8 = start near end
) -> None:
    """
    Continuously stream degrading sensor data for one engine.

    On the FIRST pass:  start from stagger_frac into the lifecycle.
    On subsequent loops: always start from cycle 0 (fresh engine).

    This means:
      engine_1 starts fresh       (RUL ~120,  HEALTHY)
      engine_2 starts at 20%      (RUL ~90,   HEALTHY-MONITOR)
      engine_3 starts at 40%      (RUL ~60,   MONITOR)
      engine_4 starts at 60%      (RUL ~35,   WARNING)
      engine_5 starts at 80%      (RUL ~10,   CRITICAL)
    """
    machine_id  = f"engine_{engine_id}"
    rows        = engine_df.to_dict("records")
    total_rows  = len(rows)
    abs_cycle   = 0
    loop_num    = 0

    # First-pass: start offset
    start_idx = int(stagger_frac * total_rows)
    print(
        f"[{machine_id}] {total_rows} training cycles | "
        f"first pass starts at dataset row {start_idx}/{total_rows} "
        f"({int(stagger_frac*100)}% into lifecycle)"
    )

    while True:
        loop_num  += 1
        first_pass = (loop_num == 1)
        slice_rows = rows[start_idx:] if first_pass else rows

        for row in slice_rows:
            if abs_cycle % _POLL_EVERY_N == 0:
                await poll_speed(host, client)

            speed      = max(0.1, _cached_speed)
            interval_s = 1.0 / (base_rate * speed)
            abs_cycle += 1

            payload: dict = {
                "machine_id":      machine_id,
                "cycle":           abs_cycle,
                "op_setting_1":    float(row["op1"]),
                "op_setting_2":    float(row["op2"]),
                "op_setting_3":    float(row["op3"]),
                "sensor_readings": [float(row[c]) for c in _FEATURE_COLS],
            }

            try:
                resp = await client.post(
                    f"{host}/ingest", json=payload, timeout=5.0
                )
                resp.raise_for_status()
                if abs_cycle % 30 == 0:
                    pct = (abs_cycle % total_rows) / total_rows * 100
                    print(
                        f"[{machine_id}] abs={abs_cycle:6d} | "
                        f"lifecycle {pct:5.1f}% | {speed:.0f}x | loop#{loop_num}"
                    )
            except httpx.HTTPError as exc:
                print(f"[{machine_id}] FAILED cycle={abs_cycle}: {exc}")

            await asyncio.sleep(interval_s)

        # After completing a lifecycle, always restart from the beginning
        start_idx = 0
        print(f"[{machine_id}] Lifecycle #{loop_num} complete. Engine replaced - restarting from 0%.")


# ── Orchestrator ──────────────────────────────────────────────────────────────

async def run_simulation(
    engines:  list[int] | None,
    rate:     float,
    host:     str,
    data_dir: Path,
) -> None:
    df        = load_train_data(data_dir)
    available = sorted(df["unit"].unique().tolist())
    selected  = engines if engines else available[:5]

    print("=" * 64)
    print("  APEX Simulator - STAGGERED CONTINUOUS mode")
    print(f"  Engines : {selected}")
    print(f"  Mode    : Each engine starts at different lifecycle phase")
    print(f"  Rate    : {rate} cy/s per engine at 1x (speed from /control)")
    print(f"  Host    : {host}")
    print("=" * 64)

    async with httpx.AsyncClient() as client:
        await poll_speed(host, client)

        # Assign stagger offset per engine slot (wraps if more than 5 engines)
        tasks = [
            replay_engine(
                engine_id    = eid,
                engine_df    = df[df["unit"] == eid].reset_index(drop=True),
                host         = host,
                base_rate    = rate,
                client       = client,
                stagger_frac = _STAGGER_OFFSETS[i % len(_STAGGER_OFFSETS)],
            )
            for i, eid in enumerate(eid for eid in selected if eid in available)
        ]
        await asyncio.gather(*tasks)


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="APEX sensor simulator - staggered continuous degradation."
    )
    p.add_argument("--engines",  nargs="+", type=int, default=None, metavar="ID")
    p.add_argument("--rate",     type=float, default=1.0)
    p.add_argument("--host",     type=str,   default="http://localhost:8000")
    p.add_argument("--data-dir", type=str,   default="data/raw", dest="data_dir")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(
        run_simulation(
            engines  = args.engines,
            rate     = args.rate,
            host     = args.host,
            data_dir = Path(args.data_dir),
        )
    )
