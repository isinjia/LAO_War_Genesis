"""전 구간 10레벨 실측 결과를 검증하고 작전별 조정표로 반영한다."""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
BEGIN = "  // 열 레벨 작전 조정표 시작"
END = "  // 열 레벨 작전 조정표 끝"


def main():
    report = json.loads((ROOT / "tools/reports/campaign_fit.json").read_text(encoding="utf-8"))
    rows = report["rows"]
    expected = {f"{prefix}{chapter}-{stage}" for prefix in ["", "H"] for chapter in range(1, 9) for stage in range(1, 11)}
    assert report.get("complete") and report["cardLevel"] == 10
    assert len(rows) == 160 and {r["code"] for r in rows} == expected
    assert all(r["pass"] for r in rows), "미통과 작전이 남아 있습니다."
    override_path = ROOT / "tools/campaign_overrides.json"
    overrides = json.loads(override_path.read_text(encoding="utf-8")) if override_path.exists() else {}
    assert set(overrides).issubset(expected)
    lines = [BEGIN, "  // 적 체력 배율, 적 공격 배율, 적 요새 체력. 보상과 아군 기지는 유지한다.", "  const CAMPAIGN_TUNE = {"]
    for row in rows:
        hp, atk, fort = overrides.get(row["code"], [row["hpK"], row["atkK"], row["fort"]])
        assert 0 < hp <= 1 and 0 < atk <= 1 and fort >= 1200
        if hp != 1 or atk != 1:
            lines.append(f"    '{row['code']}': [{hp}, {atk}, {fort}],")
    lines.extend(["  };", "  for (const st of [...STAGES, ...HARD]) {", "    const tuning = CAMPAIGN_TUNE[st.code];", "    if (!tuning) continue;", "    [st.enemyHpK, st.enemyAtkK, st.baseHp] = tuning;", "  }", END, ""])
    path = ROOT / "js/data.js"
    source = path.read_text(encoding="utf-8")
    block = "\n".join(lines)
    if BEGIN in source:
        source = re.sub(re.escape(BEGIN) + r"[\s\S]*?" + re.escape(END) + r"\n?", lambda _: block, source)
    else:
        marker = "  // infinite front:"
        assert marker in source
        source = source.replace(marker, block + "\n" + marker, 1)
    path.write_text(source, encoding="utf-8")
    print("열 레벨 기준 작전별 조정표 반영 완료")


if __name__ == "__main__":
    main()
