# 원작 Unity 렌더링 대비 비교 (V0.70)

`python tools/build_compare.py --all`로 원작 Unity 패스가 프레임 단위로 구워 둔 이펙트 54개(투사체·피격, Defence 프로젝트의
`js/fx/*.js`) 전부를 리그와 같은 방식으로 내보내고(`cmp.js`, 생성물), 같은 시점에 나란히 그려 비교했다
(게임 페이지에서 `tools/compare/harness.js` → `await CMPH.init(); CMPH.runAll()`).

- 시점: 원작 굽기 길이의 15 / 40 / 65 / 90% (굽기 프레임 시각에 맞춤).
- 점수(프레임당 100점): 밝기 총량 35 · 평균 색 25 · 퍼짐 20 · 중심 위치 20. 파티클은 무작위라 이펙트마다 6번 재생해 평균.
- 300×220 해상도(얇은 선 이펙트가 1px로 뭉개지지 않게). 둘 다 거의 빈 화면이면 일치로 본다.

**전체 평균 95.1 · 90점 이상 45 / 54** (V0.69: 16개만 비교 91.1, 54개 기준 86.7 / 90점 이상 31개)

| 이펙트 | 15% | 40% | 65% | 90% | 평균 |
|---|---|---|---|---|---|
| 2rpg_bullet_fx | 100 | 100 | 100 | 100 | 100 |
| Azazel_skill1_Hit_m | 87 | 76 | 100 | 100 | 91 |
| Azazel_skill1_bullet | 88 | 89 | 85 | 83 | 86 |
| Brownie_bullet | 100 | 100 | 100 | 100 | 100 |
| Constantia_hit | 92 | 100 | 100 | 100 | 98 |
| FX_Leprechaun_bullet | 98 | 98 | 98 | 98 | 98 |
| FX_Raven_skill1_bullet | 98 | 95 | 94 | 97 | 96 |
| FX_bullet_Gun_ConstantiaS2 | 92 | 92 | 92 | 92 | 92 |
| FX_hit_bori | 100 | 0 | 100 | 100 | 75 |
| Gnome_bullet | 88 | 88 | 88 | 88 | 88 |
| Harpy_skill12_bullet | 93 | 95 | 95 | 93 | 94 |
| Harpy_skill12_bullet2 | 96 | 90 | 84 | 77 | 87 |
| Harpy_skill12_bullet_ver2 | 95 | 96 | 86 | 77 | 89 |
| Harpy_skill1_bullet_Hit | 100 | 100 | 100 | 100 | 100 |
| Harpy_skill2_missile_last_Hit | 88 | 100 | 100 | 100 | 97 |
| KunoicheZero_skill1_bullet_hit | 89 | 100 | 100 | 100 | 97 |
| KunoichiZero_skill1_Bullet | 75 | 84 | 95 | 81 | 84 |
| Kunoichi_skill2_after_Lighting | 100 | 100 | 100 | 100 | 100 |
| Meca_1_paticle | 100 | 100 | 100 | 100 | 100 |
| Mercury_N_Skill2_Hit | 100 | 100 | 89 | 100 | 97 |
| Phoenix_skill1_bullet | 99 | 99 | 99 | 98 | 99 |
| Phoenix_skill1_hit | 96 | 100 | 100 | 100 | 99 |
| RPG_skill2_hit | 85 | 100 | 100 | 100 | 96 |
| Ramiel_N_bullet | 84 | 91 | 90 | 93 | 90 |
| Raven_skill1_Hit | 87 | 55 | 100 | 100 | 86 |
| Raven_skill2_Scofe_Dot | 76 | 86 | 100 | 100 | 91 |
| Sleipnir_bullet | 99 | 99 | 99 | 99 | 99 |
| Sleipnir_bullet2 | 100 | 100 | 100 | 100 | 100 |
| Sleipnir_hit | 100 | 100 | 100 | 100 | 100 |
| Sleipnir_hit2 | 100 | 100 | 100 | 100 | 100 |
| Sleipnir_skill1_last_hit | 100 | 100 | 100 | 100 | 100 |
| Sleipnir_skill1_lastfire_bullet | 99 | 99 | 99 | 94 | 98 |
| Thetis_Skill2_Chaff_Hit | 88 | 77 | 100 | 100 | 91 |
| Thetis_skill1_Ground_Hit | 75 | 100 | 100 | 100 | 94 |
| Thetis_skill2_Hit | 100 | 100 | 100 | 100 | 100 |
| Thetis_skill2_Small_Missile | 92 | 82 | 84 | 82 | 85 |
| Thetis_skill2_big_Missile | 91 | 86 | 90 | 86 | 88 |
| Tiamat_Duke_skill1_bullet | 94 | 95 | 87 | 87 | 91 |
| Titania_skill1_Ground_ice | 93 | 100 | 100 | 83 | 94 |
| Titania_skill1_Ground_ice_smoke | 90 | 78 | 100 | 100 | 92 |
| Undine_skill1_Hit | 93 | 100 | 100 | 100 | 98 |
| Undine_skill1_bullet | 100 | 100 | 100 | 100 | 100 |
| Undine_skill2_Hit | 93 | 100 | 100 | 100 | 98 |
| Undine_skill2_bullet | 96 | 95 | 96 | 94 | 95 |
| hand_gun_shot | 92 | 92 | 92 | 92 | 92 |
| hnadgun_hit | 98 | 100 | 100 | 100 | 100 |
| rpg_bullet_fx | 100 | 100 | 100 | 100 | 100 |
| simple_explosion | 96 | 100 | 100 | 100 | 99 |
| skill_hit_simple | 69 | 100 | 100 | 100 | 92 |
| valkyrie_Hit_skill1 | 96 | 100 | 100 | 100 | 99 |
| valkyrie_Hit_skill2 | 95 | 100 | 100 | 100 | 99 |
| vfx_Tiamet_NS3_skill1_bullet_Hit | 100 | 100 | 100 | 100 | 100 |
| violet_bullet | 100 | 100 | 100 | 100 | 100 |
| violet_skill2_bullet | 100 | 100 | 100 | 100 | 100 |

V0.70에서 비교로 찾아 고친 엔진 차이:
- TrailRenderer(꼬리): 투사체·리그의 꼬리를 폭 곡선·색 그라데이션·텍스처 띠로 그린다 (쿠노이치·티아마트·하피·라벤 등).
- 렌더러 피벗(Pivot): 테티스 미사일 화염처럼 입자 크기 비율만큼 비켜 그리는 설정.
- Mesh 렌더 모드: 메시 크기(FBX 파일 단위 = UnitScaleFactor/100)의 사각형으로 그린다.
- 이펙트 안에 넣은 FBX 모델(PrefabInstance): 실제 메시 폴리곤을 그리고, 이펙트 Animator의 재질 색 커브로 깜빡인다 (티타니아 얼음 바닥 소용돌이).

남은 차이:
- FX_hit_bori: 콘스탄티아의 강아지 소환(뼈대 애니메이션 캐릭터)이라 파티클 엔진 범위 밖.
- Raven_skill1_Hit: 원작 텍스처는 흰색인데 원작 화면에서는 갈색으로 보인다(굽기 환경 차이로 추정).
- 노미·쿠노이치·하피 꼬리: 원작 꼬리가 약 1.4배 길게 남는다(원작 굽기의 시간 처리 차이로 추정).
