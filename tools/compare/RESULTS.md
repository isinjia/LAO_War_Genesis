# 원작 Unity 렌더링 대비 비교 (V0.69)

`python tools/build_compare.py`로 원작 이펙트 프리팹 16개를 리그와 같은 방식으로 내보내고(`cmp.js`, 생성물),
원작 Unity가 프레임 단위로 구워 둔 같은 이펙트(`js/fx/*.js`, Defence 프로젝트의 Unity 패스)와
같은 시점(0.05 / 0.15 / 0.3 / 0.5초, 원작 굽기 프레임 시각에 맞춤)에 나란히 그려 비교했다.

점수(프레임당 100점): 밝기 총량 35 · 평균 색 25 · 퍼짐 20 · 중심 위치 20.
파티클은 무작위로 흩어지므로 픽셀 1:1 대신 장면 특성으로 비교한다. 둘 다 거의 빈 화면이면 일치로 본다.
원작 굽기 카메라의 화면 높이는 Unity Max Particle Size 제한을 맞추기 위해 0.55로 둔다(0.35~0.815 중 최적).

| 이펙트 | 0.05 | 0.15 | 0.3 | 0.5 | 평균 |
|---|---|---|---|---|---|
| Azazel_skill1_Hit_m | 94 | 91 | 86 | 86 | 89 |
| Constantia_hit | 93 | 91 | 91 | 100 | 94 |
| Phoenix_skill1_hit | 94 | 76 | 79 | 100 | 87 |
| Raven_skill1_Hit | 73 | 98 | 88 | 83 | 86 |
| Sleipnir_hit | 85 | 89 | 100 | 100 | 94 |
| Thetis_skill1_Ground_Hit | 73 | 85 | 82 | 100 | 85 |
| Titania_skill1_Ground_ice | 100 | 77 | 77 | 77 | 83 |
| Undine_skill1_Hit | 97 | 97 | 89 | 92 | 94 |
| valkyrie_Hit_skill1 | 98 | 94 | 94 | 95 | 95 |
| Mercury_N_Skill2_Hit | 100 | 100 | 100 | 100 | 100 |
| Harpy_skill1_bullet_Hit | 88 | 80 | 100 | 100 | 92 |
| KunoicheZero_skill1_bullet_hit | 86 | 78 | 93 | 90 | 87 |
| simple_explosion | 97 | 99 | 95 | 91 | 96 |
| Thetis_skill2_Hit | 96 | 77 | 100 | 100 | 93 |
| Undine_skill2_Hit | 99 | 96 | 94 | 93 | 96 |
| valkyrie_Hit_skill2 | 99 | 96 | 86 | 86 | 92 |
| **전체 평균** | | | | | **91.1** |

비교로 찾아 고친 엔진 차이:
- Unity 내장 셰이더 10720(Mobile/Particles/Additive)을 알파 블렌드로 그리던 버그: 빛무리가 갈색 원판으로 보였다.
- Unity Max Particle Size(화면 높이 비율) 제한: 거대한 빛무리 크기를 Unity와 같은 규칙으로 자른다.
- Render Alignment = Local: 노드 평면에 눕는 파티클(바닥의 고리·연기)을 카메라를 향해 세워 그리던 것.

남은 차이: 티타니아(Mesh 렌더 모드를 사각형으로 근사, 약간 아래·어둡게), 테티스(줄 파티클이 오른쪽으로 치우침).
