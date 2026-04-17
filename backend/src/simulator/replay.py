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
# (FIX 1) Start all engines very close to 0 to ensure they are initally Healthy
_STAGGER_OFFSETS = [0.0, 0.01, 0.02, 0.03, 0.04]

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
    stagger_frac: float,
) -> None:
    """
    Continuously stream degrading sensor data for one engine.

    Speed-aware BURST mode — the KEY fix for 1x vs 100x variation:
      1x   → advances 1 dataset row per tick  → slow degradation
      10x  → advances ~3 dataset rows per tick
      25x  → advances ~5 dataset rows per tick
      100x → advances 20 dataset rows per tick → RUL drops visibly fast

    This ensures that switching from 1x to 100x immediately produces
    DIFFERENT sensor readings (deeper in the degradation curve), so the
    model outputs a genuinely different RUL value.
    """
    machine_id = f"engine_{engine_id}"
    rows       = engine_df.to_dict("records")
    total_rows = len(rows)
    abs_cycle  = 0
    loop_num   = 0

    # Start offset into the dataset for fleet staggering
    row_ptr = int(stagger_frac * total_rows)

    print(
        f"[{machine_id}] {total_rows} training cycles | "
        f"starting at dataset row {row_ptr}/{total_rows} "
        f"({int(stagger_frac*100)}% into lifecycle)"
    )

    while True:
        # ── Poll speed every N cycles ─────────────────────────────────────
        if abs_cycle % _POLL_EVERY_N == 0:
            await poll_speed(host, client)

        speed = max(0.1, _cached_speed)

        # ── How many dataset rows to advance this tick ────────────────────
        # At 1x:   step=1      (navigate slowly through lifecycle)
        # At 10x:  step~3      (faster lifecycle progression)
        # At 100x: step=20     (RUL drops fast, urgency changes clearly)
        if speed >= 50:
            step = max(1, int(speed / 5))   # 100x → step=20
        elif speed >= 10:
            step = max(1, int(speed / 7))   # 25x  → step~4
        else:
            step = 1                         # 1x–5x → 1 row per tick

        # Current row to send
        current_row = rows[row_ptr % total_rows]
        abs_cycle  += step

        payload: dict = {
            "machine_id":      machine_id,
            "cycle":           abs_cycle,
            "op_setting_1":    float(current_row["op1"]),
            "op_setting_2":    float(current_row["op2"]),
            "op_setting_3":    float(current_row["op3"]),
            "sensor_readings": [float(current_row[c]) for c in _FEATURE_COLS],
        }

        try:
            resp = await client.post(
                f"{host}/ingest", json=payload, timeout=5.0
            )
            resp.raise_for_status()
            if abs_cycle % 60 == 0:
                pct = (row_ptr % total_rows) / total_rows * 100
                print(
                    f"[{machine_id}] abs={abs_cycle:6d} | "
                    f"lifecycle {pct:5.1f}% | {speed:.0f}x | step={step}"
                )
        except httpx.HTTPError as exc:
            print(f"[{machine_id}] FAILED cycle={abs_cycle}: {exc}")

        # Advance dataset pointer
        row_ptr += step
        if row_ptr >= total_rows:
            row_ptr = row_ptr % total_rows
            loop_num += 1
            print(f"[{machine_id}] Lifecycle #{loop_num} complete. Engine replaced (0%).")

        interval_s = 1.0 / (base_rate * speed)
        await asyncio.sleep(interval_s)


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
    print("  APEX Simulator - STAGGERED BURST-SPEED mode")
    print(f"  Engines : {selected}")
    print(f"  Mode    : Staggered starts + speed-aware row stepping")
    print(f"  Rate    : {rate} cy/s per engine at 1x (speed from /control)")
    print(f"  Host    : {host}")
    print("=" * 64)

    async with httpx.AsyncClient() as client:
        await poll_speed(host, client)

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
        description="APEX sensor simulator - staggered burst-speed degradation."
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
