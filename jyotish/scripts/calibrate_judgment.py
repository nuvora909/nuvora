"""Recompute the per-topic lean thresholds used by chat/judgment.py.

Samples a deterministic set of births, scores every topic's natal promise, and prints the
15th / 55th / 85th percentiles. Paste the printed dict into CALIBRATION in chat/judgment.py.
Leans then mean: top 15% "strong", next 30% "supportive", middle 40% "mixed", bottom 15% "demanding".

Usage (from the jyotish folder): .venv/Scripts/python scripts/calibrate_judgment.py [charts]
"""
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from vedic import BirthInput, Options, analyse  # noqa: E402
from chat.judgment import Judge  # noqa: E402
from chat.topics import TOPICS  # noqa: E402

NOW = datetime(2026, 11, 24, 6, 0, tzinfo=timezone.utc)
PLACES = [(28.61, 77.21, "Asia/Kolkata"), (19.08, 72.88, "Asia/Kolkata"), (13.08, 80.27, "Asia/Kolkata"),
          (22.57, 88.36, "Asia/Kolkata"), (26.91, 75.79, "Asia/Kolkata"), (51.51, -0.13, "Europe/London"),
          (40.71, -74.0, "America/New_York"), (25.20, 55.27, "Asia/Dubai")]


def main(n: int) -> None:
    rnd = random.Random(2026)
    scores = {k: [] for k in TOPICS}
    for _ in range(n):
        lat, lon, tz = rnd.choice(PLACES)
        birth = BirthInput(year=rnd.randint(1950, 2010), month=rnd.randint(1, 12), day=rnd.randint(1, 28),
                           hour=rnd.randint(0, 23), minute=rnd.randint(0, 59), lat=lat, lon=lon, tz_name=tz)
        chart, report = analyse(birth, Options(), NOW)
        judge = Judge(chart, report, NOW)
        for key, topic in TOPICS.items():
            scores[key].append(judge.promise_score(topic))
    out = {}
    for key, values in scores.items():
        values.sort()
        pick = lambda p: round(values[int(p * (len(values) - 1))], 2)
        out[key] = (pick(0.15), pick(0.55), pick(0.85))
    print("CALIBRATION = {")
    for key, row in out.items():
        print(f'    "{key}": {row},')
    print("}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 200)
