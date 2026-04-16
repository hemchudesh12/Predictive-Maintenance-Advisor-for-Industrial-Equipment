import httpx, time

for _ in range(3):
    r = httpx.get("http://localhost:8000/snapshot")
    snap = r.json()
    for m in snap.get("machines", []):
        print(f"{m['machine_id']}: RUL={m['rul_mean']:.1f}  urgency={m['urgency']['level']}  cycle={m['current_cycle']}")
    print("---")
    time.sleep(2)
