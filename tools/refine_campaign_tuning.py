"""별도 출격 패턴에서 발견된 실패만 추가 조정한다. 원시 검증 기록은 보존한다."""
import json
import pathlib
import argparse
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description="실패한 작전의 추가 조정값을 만든다.")
    parser.add_argument("--report-set", default="campaign")
    parser.add_argument("--attack-scale", type=float, default=0.78)
    args = parser.parse_args()
    assert re.fullmatch(r"[a-z][a-z_]{0,40}", args.report_set)
    assert 0 < args.attack_scale < 1
    report = json.loads((ROOT / f"tools/reports/{args.report_set}_verify.json").read_text(encoding="utf-8"))
    assert report.get("complete") and report["cardLevel"] == 10 and len(report["rows"]) == 160
    path = ROOT / "tools/campaign_overrides.json"
    overrides = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    failures = [r for r in report["rows"] if not r["pass"]]
    for row in failures:
        runs = row["runs"] + ([row["expanded"]] if row.get("expanded") else [])
        last = row["code"].endswith("-10")
        target = 300 if last else 240 if row["hard"] else 180 if row["chapter"] == 0 else 210
        minimum = 0.2 if row["hard"] else 0.4
        hp, atk, fort = row["hpK"], row["atkK"], row["fort"]
        if any(r["over"] == "lose" for r in runs):
            atk = round(max(0.03, atk * args.attack_scale), 4)
        elif any(r["base"] < minimum for r in runs):
            atk = round(max(0.03, atk * 0.85), 4)
        worst_time = max(r["t"] for r in runs)
        if worst_time > target:
            k = min(0.9, max(0.65, target / worst_time * 0.9))
            hp = round(max(0.03, hp * k), 4)
            fort = max(1200, round(fort * 0.95 / 100) * 100)
        overrides[row["code"]] = [hp, atk, fort]
    path.write_text(json.dumps(overrides, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    archive = ROOT / "tools/reports"
    index = 1
    while (archive / f"{args.report_set}_verify_round{index}.json").exists():
        index += 1
    (archive / f"{args.report_set}_verify_round{index}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"미통과 작전 {len(failures)}개 추가 조정 기록 완료")


if __name__ == "__main__":
    main()
