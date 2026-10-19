# 원작 Unity 렌더링 대비 비교 (V0.71)

`python tools/build_compare.py --all`로 원작 Unity 패스가 프레임 단위로 구워 둔 이펙트 54개(투사체·피격, Defence 프로젝트
`tools/unity_ref/Fx.cs`로 구운 `js/fx/*.js`) 전부를 리그와 같은 방식으로 내보내고(`cmp.js`, 생성물), 같은 시점에 나란히 그려
비교했다 (게임 페이지에서 `tools/compare/harness.js` → `await CMPH.init(); CMPH.runAll()`).

- 시점: 원작 굽기 길이의 15 / 40 / 65 / 90% (굽기 프레임 시각에 맞춤).
- 점수(프레임당 100점): 밝기 총량 35 · 평균 색 25 · 퍼짐 20 · 중심 위치 20. 파티클은 무작위라 이펙트마다 8번 재생해 평균.
- 300×220 해상도. 둘 다 거의 빈 화면이면 일치로 본다.
- 기준은 굽기 데이터 그대로(`FXB.raw`: 게임용 손보정 TINT 없이).
- 굽기 조건 재현(비교에서만): 투사체는 T에 목표에서 멈추고 그 뒤 방출을 멈춘다. 굽기 스크립트는 TrailRenderer 시간을
  진행시키지 않아 꼬리가 사라지지 않고 0.1초부터 보인다 (`SDPS.trailBake`). 게임의 꼬리는 원작 런타임대로 시간이 지나면 사라진다.

**전체 평균 96.7 · 90점 이상 52 / 54** (V0.70: 95.1 · 45 / 54, V0.69: 86.7 · 31 / 54)

| 이펙트 | 15% | 40% | 65% | 90% | 평균 |
|---|---|---|---|---|---|
| 2rpg_bullet_fx | 100 | 100 | 100 | 100 | 100 |
| Azazel_skill1_Hit_m | 88 | 80 | 100 | 100 | 92 |
| Azazel_skill1_bullet | 91 | 93 | 92 | 94 | 93 |
| Brownie_bullet | 100 | 100 | 100 | 100 | 100 |
| Constantia_hit | 91 | 100 | 100 | 100 | 98 |
| FX_Leprechaun_bullet | 100 | 100 | 100 | 100 | 100 |
| FX_Raven_skill1_bullet | 95 | 96 | 96 | 99 | 97 |
| FX_bullet_Gun_ConstantiaS2 | 99 | 99 | 99 | 99 | 99 |
| FX_hit_bori ※ | 100 | 0 | 100 | 100 | 75 |
| Gnome_bullet | 99 | 99 | 99 | 99 | 99 |
| Harpy_skill12_bullet | 95 | 94 | 97 | 98 | 96 |
| Harpy_skill12_bullet2 | 97 | 93 | 98 | 94 | 96 |
| Harpy_skill12_bullet_ver2 | 94 | 97 | 97 | 99 | 97 |
| Harpy_skill1_bullet_Hit | 100 | 100 | 100 | 100 | 100 |
| Harpy_skill2_missile_last_Hit | 91 | 100 | 100 | 100 | 98 |
| KunoicheZero_skill1_bullet_hit | 69 | 100 | 100 | 100 | 92 |
| KunoichiZero_skill1_Bullet | 99 | 82 | 94 | 97 | 93 |
| Kunoichi_skill2_after_Lighting | 100 | 100 | 100 | 100 | 100 |
| Meca_1_paticle | 100 | 100 | 100 | 100 | 100 |
| Mercury_N_Skill2_Hit | 100 | 84 | 89 | 94 | 92 |
| Phoenix_skill1_bullet | 99 | 99 | 99 | 99 | 99 |
| Phoenix_skill1_hit | 94 | 100 | 100 | 100 | 99 |
| RPG_skill2_hit | 89 | 100 | 100 | 100 | 97 |
| Ramiel_N_bullet | 84 | 91 | 90 | 94 | 90 |
| Raven_skill1_Hit | 93 | 100 | 100 | 100 | 98 |
| Raven_skill2_Scofe_Dot | 89 | 89 | 100 | 100 | 95 |
| Sleipnir_bullet | 99 | 99 | 99 | 99 | 99 |
| Sleipnir_bullet2 | 100 | 100 | 100 | 100 | 100 |
| Sleipnir_hit | 100 | 100 | 100 | 100 | 100 |
| Sleipnir_hit2 | 100 | 100 | 100 | 100 | 100 |
| Sleipnir_skill1_last_hit | 100 | 100 | 100 | 100 | 100 |
| Sleipnir_skill1_lastfire_bullet | 99 | 98 | 99 | 99 | 99 |
| Thetis_Skill2_Chaff_Hit | 91 | 77 | 100 | 100 | 92 |
| Thetis_skill1_Ground_Hit | 75 | 100 | 100 | 100 | 94 |
| Thetis_skill2_Hit | 100 | 100 | 100 | 100 | 100 |
| Thetis_skill2_Small_Missile | 83 | 85 | 83 | 85 | 84 |
| Thetis_skill2_big_Missile | 93 | 90 | 90 | 90 | 91 |
| Tiamat_Duke_skill1_bullet | 99 | 95 | 99 | 99 | 98 |
| Titania_skill1_Ground_ice | 93 | 100 | 100 | 83 | 94 |
| Titania_skill1_Ground_ice_smoke | 89 | 82 | 100 | 100 | 93 |
| Undine_skill1_Hit | 92 | 100 | 100 | 100 | 98 |
| Undine_skill1_bullet | 100 | 100 | 100 | 100 | 100 |
| Undine_skill2_Hit | 95 | 100 | 100 | 100 | 99 |
| Undine_skill2_bullet | 96 | 94 | 95 | 96 | 95 |
| hand_gun_shot | 99 | 99 | 99 | 99 | 99 |
| hnadgun_hit | 97 | 100 | 100 | 100 | 99 |
| rpg_bullet_fx | 100 | 100 | 100 | 100 | 100 |
| simple_explosion | 95 | 100 | 100 | 100 | 99 |
| skill_hit_simple | 70 | 100 | 100 | 100 | 93 |
| valkyrie_Hit_skill1 | 96 | 100 | 100 | 100 | 99 |
| valkyrie_Hit_skill2 | 97 | 100 | 100 | 100 | 99 |
| vfx_Tiamet_NS3_skill1_bullet_Hit | 100 | 100 | 100 | 100 | 100 |
| violet_bullet | 100 | 100 | 100 | 100 | 100 |
| violet_skill2_bullet | 100 | 100 | 100 | 100 | 100 |

※ FX_hit_bori: 콘스탄티아 스킬의 강아지 돌격(스킨드 메시 캐릭터 + 뼈대 애니메이션)이라 파티클 엔진 대상이 아니다. 게임에서는
EventThrowEffect로 이 Unity 굽기 데이터 자체를 재생하므로(`js/fxbake.js`, FX_META.uses) 화면은 원작 출력과 같다.

V0.71에서 비교로 찾아 고친 엔진 차이:
- 밉맵: Unity 이펙트 텍스처는 밉맵이 없다. 몇 px로 눌린 선(노미·권총·콘스탄티아 탄환)이 텍스처 전체 평균이 아닌 밝은 심을
  보이도록 파티클 재질은 밉 레벨 0을 읽는다 (노미 88→99, 권총 92→99).
- Mesh 렌더 모드: 입자 수가 적은 메시 파티클은 실제 메시 폴리곤으로 그린다(정점 z도 rig 공간으로 반전, View 정렬).
- 비교 기준의 손보정(TINT) 제외, 굽기 조건(투사체 정지·꼬리) 재현.

V0.70: TrailRenderer, 렌더러 피벗, 메시 크기(FBX 파일 단위), 이펙트 안의 FBX 모델 + 애니메이터 색 커브.

남은 차이: Thetis_skill2_Small_Missile(84) — 원작 굽기는 고정 시드로 0.1초마다 번개 메시가 같은 박자로 터져 밝기가 크게
출렁이고, 우리 무작위 재생은 평균적으로 고르게 보인다. 형태·위치·색은 맞고 시점별 밝기 박자가 다르다.
