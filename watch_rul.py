"""
Watch RUL change live — confirm that speed changes actually affect
how fast engine health degrades.

Run: python watch_rul.py
Press Ctrl+C to stop.
"""
import httpx, time, os

prev = {}

print("Watching engine RUL... Press Ctrl+C to stop.")
print(f"{'Machine':<12} {'RUL':>7} {'Urgency':<10} {'Cycle':>7} {'Delta':>7}")
print("-" * 55)

while True:
    try:
        r = httpx.get("http://localhost:8000/snapshot", timeout=3)
        snap = r.json()
        
        ctrl = httpx.get("http://localhost:8000/control", timeout=2).json()
        speed = ctrl.get("speed_factor", 1)
        
        print(f"\n  --- speed={speed}x ---")
        for m in sorted(snap.get("machines", []), key=lambda x: x["machine_id"]):
            mid   = m["machine_id"]
            rul   = m["rul_mean"]
            level = m["urgency"]["level"]
            cycle = m["current_cycle"]
            delta = rul - prev.get(mid, rul)
            prev[mid] = rul
            
            urgency_icon = {"CRITICAL": "🔴", "WARNING": "🟠", "MONITOR": "🟡", "HEALTHY": "🟢"}.get(level, "⚪")
            delta_str = f"({delta:+.1f})" if prev else ""
            print(f"  {urgency_icon} {mid:<12} RUL={rul:6.1f}  cycle={cycle:5d}  {delta_str}")
        
    except Exception as e:
        print(f"  [error] {e}")
    
    time.sleep(2)
