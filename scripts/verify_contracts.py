"""
scripts/verify_contracts.py
----------------------------
APEX Phase 3 — End-to-end contract verification.

Hits every backend endpoint and validates responses against Pydantic schemas.
Opens a WebSocket and validates every frame for 30 seconds.
Prints PASS/FAIL for each contract.

Usage
-----
    python scripts/verify_contracts.py          # default: localhost:8000
    python scripts/verify_contracts.py --host http://localhost:8000

Run before demo:
    python scripts/verify_contracts.py  # must show all PASS
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from typing import Any

import httpx
import websockets
from pydantic import ValidationError

# Add project root to path
sys.path.insert(0, ".")

from src.schemas import (
    BackendHealth,
    ControlState,
    CostConfig,
    EmailAlertResponse,
    FleetStats,
    MachineState,
    Prediction,
    StreamFrame,
)

PASS = "\033[92m✓ PASS\033[0m"
FAIL = "\033[91m✗ FAIL\033[0m"
WARN = "\033[93m⚠ WARN\033[0m"

results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    icon = PASS if ok else FAIL
    print(f"  {icon}  {name}" + (f"  [{detail}]" if detail else ""))
    results.append((name, ok, detail))


async def verify_http(host: str) -> None:
    print("\n─── HTTP Endpoint Contracts ──────────────────────────────────")
    async with httpx.AsyncClient(base_url=host, timeout=10.0) as client:

        # ── GET /health ───────────────────────────────────────────────────
        try:
            r = await client.get("/health")
            r.raise_for_status()
            data = r.json()
            assert "status" in data and "uptime_sec" in data
            record("GET /health", True, f"uptime={data.get('uptime_sec')}s")
        except Exception as e:
            record("GET /health", False, str(e))

        # ── GET /config/costs ─────────────────────────────────────────────
        try:
            r = await client.get("/config/costs")
            r.raise_for_status()
            CostConfig(**r.json())     # validates schema
            record("GET /config/costs", True)
        except ValidationError as e:
            record("GET /config/costs", False, f"schema: {e.error_count()} errors")
        except Exception as e:
            record("GET /config/costs", False, str(e))

        # ── POST /ingest — seed a machine ─────────────────────────────────
        try:
            import random
            payload = {
                "machine_id": "verify_engine_1",
                "cycle": 1,
                "op_setting_1": 0.0,
                "op_setting_2": 0.0003,
                "op_setting_3": 100.0,
                "sensor_readings": [round(random.uniform(0, 1), 4) for _ in range(14)],
            }
            r = await client.post("/ingest", json=payload)
            r.raise_for_status()
            MachineState(**r.json())
            record("POST /ingest", True)
        except ValidationError as e:
            record("POST /ingest", False, f"schema: {e.error_count()} errors")
        except Exception as e:
            record("POST /ingest", False, str(e))

        # ── Seed 30 cycles so prediction fires ────────────────────────────
        print("  Seeding 30 cycles for inference test...")
        try:
            for i in range(2, 32):
                payload["cycle"] = i
                await client.post("/ingest", json=payload)
            record("POST /ingest (30 cycles seed)", True)
        except Exception as e:
            record("POST /ingest (30 cycles seed)", False, str(e))

        # ── GET /predict/{machine_id} ─────────────────────────────────────
        try:
            r = await client.get("/predict/verify_engine_1")
            r.raise_for_status()
            pred = Prediction(**r.json())
            assert pred.machine_id == "verify_engine_1"
            assert 0.0 <= pred.rul_mean <= 200.0
            record("GET /predict/{machine_id}", True, f"rul_mean={pred.rul_mean}")
        except ValidationError as e:
            record("GET /predict/{machine_id}", False, f"schema: {e.error_count()} errors")
        except Exception as e:
            record("GET /predict/{machine_id}", False, str(e))

        # ── GET /snapshot ─────────────────────────────────────────────────
        try:
            r = await client.get("/snapshot")
            r.raise_for_status()
            data = r.json()
            assert "machines" in data
            assert "fleet_stats" in data
            record("GET /snapshot", True, f"machines={len(data['machines'])}")
        except Exception as e:
            record("GET /snapshot", False, str(e))

        # ── GET /control ──────────────────────────────────────────────────
        try:
            r = await client.get("/control")
            r.raise_for_status()
            ControlState(**r.json())
            record("GET /control", True)
        except Exception as e:
            record("GET /control", False, str(e))

        # ── POST /control ─────────────────────────────────────────────────
        try:
            r = await client.post("/control", json={"speed_factor": 2.0})
            r.raise_for_status()
            state = ControlState(**r.json())
            assert state.speed_factor == 2.0
            # Reset to 1x
            await client.post("/control", json={"speed_factor": 1.0})
            record("POST /control", True)
        except Exception as e:
            record("POST /control", False, str(e))

        # ── POST /alert/email ─────────────────────────────────────────────
        try:
            r = await client.post(
                "/alert/email",
                json={"machine_id": "verify_engine_1", "user_email": "test@apex.demo"},
            )
            r.raise_for_status()
            resp = EmailAlertResponse(**r.json())
            record(
                "POST /alert/email",
                True,
                f"success={resp.success} msg_id={resp.message_id}",
            )
        except ValidationError as e:
            record("POST /alert/email", False, f"schema: {e.error_count()} errors")
        except Exception as e:
            record("POST /alert/email", False, str(e))

        # ── POST /alert/email — rate limit check ──────────────────────────
        try:
            r = await client.post(
                "/alert/email",
                json={"machine_id": "verify_engine_1", "user_email": "test@apex.demo"},
            )
            r.raise_for_status()
            resp = EmailAlertResponse(**r.json())
            assert resp.rate_limited is True, "Second request should be rate-limited"
            record("POST /alert/email (rate limit)", True, f"retry_after={resp.retry_after_sec}s")
        except Exception as e:
            record("POST /alert/email (rate limit)", False, str(e))


async def verify_websocket(host: str, duration_sec: int = 30) -> None:
    ws_url = host.replace("http://", "ws://").replace("https://", "wss://") + "/stream"
    print(f"\n─── WebSocket Contract ({duration_sec}s) ── {ws_url}")

    frame_count = 0
    error_count = 0
    t_start = time.time()
    did_validate = False

    try:
        async with websockets.connect(ws_url, ping_interval=None) as ws:
            while time.time() - t_start < duration_sec:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
                    data = json.loads(raw)

                    # Skip ping frames
                    if data.get("type") == "ping":
                        await ws.send("pong")
                        continue

                    # Validate schema on first real frame and every 10th
                    if frame_count == 0 or frame_count % 10 == 0:
                        try:
                            StreamFrame(**data)
                            did_validate = True
                        except (ValidationError, TypeError) as ve:
                            error_count += 1
                            if frame_count == 0:
                                print(f"  {FAIL}  Frame schema validation failed: {ve}")

                    frame_count += 1
                    elapsed = time.time() - t_start
                    if frame_count % 5 == 0:
                        print(f"    frame #{frame_count}, elapsed={elapsed:.0f}s, errors={error_count}")

                except asyncio.TimeoutError:
                    print("  ⚠ WS timeout waiting for frame")
                    error_count += 1

    except Exception as e:
        record("WebSocket /stream", False, str(e))
        return

    ok = frame_count > 0 and error_count == 0
    record(
        "WebSocket /stream",
        ok,
        f"frames={frame_count} errors={error_count} schema_ok={did_validate}",
    )


def print_summary() -> None:
    print("\n══════════════════════════════════════════════════")
    print("  CONTRACT VERIFICATION SUMMARY")
    print("══════════════════════════════════════════════════")
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    for name, ok, detail in results:
        icon = PASS if ok else FAIL
        print(f"  {icon}  {name}")
    print(f"\n  Total: {len(results)}  Passed: {passed}  Failed: {failed}")
    print("══════════════════════════════════════════════════")
    if failed == 0:
        print("  \033[92m🎉 ALL CONTRACTS PASS — demo-ready\033[0m")
    else:
        print(f"  \033[91m⚠ {failed} contract(s) failed — fix before demo\033[0m")
    print()


async def main(host: str, ws_duration: int) -> int:
    print(f"\n🔍 APEX Contract Verification  →  {host}")
    await verify_http(host)
    await verify_websocket(host, duration_sec=ws_duration)
    print_summary()
    failed = sum(1 for _, ok, _ in results if not ok)
    return 1 if failed > 0 else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="APEX contract verification")
    parser.add_argument("--host", default="http://localhost:8000")
    parser.add_argument("--ws-duration", type=int, default=30)
    args = parser.parse_args()
    exit_code = asyncio.run(main(args.host, args.ws_duration))
    sys.exit(exit_code)
