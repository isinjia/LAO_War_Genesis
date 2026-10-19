# 원작 Unity 렌더링 대비 비교 (V0.74)

`python tools/build_compare.py --all`로 원작 Unity 패스가 프레임 단위로 구워 둔 이펙트 54개(투사체·피격, Defence 프로젝트
`tools/unity_ref/Fx.cs`로 구운 `js/fx/*.js`) 전부를 리그와 같은 방식으로 내보내고(`cmp.js`, 생성물), 같은 시점에 나란히 그려
비교했다 (게임 페이지에서 `tools/compare/harness.js` → `await CMPH.init(); CMPH.runAll()`).

- 시점: 원작 굽기 길이의 15 / 40 / 65 / 90% (굽기 프레임 시각에 맞춤).
- 점수(프레임당 100점): 밝기 총량 35 · 평균 색 25 · 퍼짐 20 · 중심 위치 20. 파티클은 무작위라 이펙트마다 16번 재생해 평균.
- 300×220 해상도. 둘 다 거의 빈 화면이면 일치로 본다.
- 기준은 굽기 데이터 그대로(`FXB.raw`: 게임용 손보정 TINT 없이).
- 굽기 조건 재현(비교에서만, Fx.cs 그대로): 1/30초 고정 스텝, 투사체는 T에 목표에서 멈추고 그 자리에서 계속 시뮬레이션.
  굽기 스크립트는 TrailRenderer 시간을 진행시키지 않아 꼬리가 사라지지 않고 0.1초부터 보인다 (`SDPS.trailBake`).
  게임의 꼬리는 원작 런타임대로 시간이 지나면 사라진다.

**전체 평균 96.8 · 90점 이상 50 / 54** (90점 미만: 보리 ※ 75, 테티스 미사일 86·89, 아자젤 탄환 89) (V0.70: 95.1 · 45, V0.69: 86.7 · 31)

| 이펙트 | 15% | 40% | 65% | 90% | 평균 |
|---|---|---|---|---|---|
| 2rpg_bullet_fx | 100 | 100 | 100 | 100 | 100 |
| Azazel_skill1_Hit_m | 88 | 76 | 100 | 100 | 91 |
| Azazel_skill1_bullet | 91 | 91 | 87 | 86 | 89 |
| Brownie_bullet | 100 | 100 | 100 | 100 | 100 |
| Constantia_hit | 91 | 100 | 100 | 100 | 98 |
| FX_Leprechaun_bullet | 100 | 100 | 100 | 100 | 100 |
| FX_Raven_skill1_bullet | 95 | 97 | 96 | 100 | 97 |
| FX_bullet_Gun_ConstantiaS2 | 99 | 99 | 99 | 99 | 99 |
| FX_hit_bori ※ | 100 | 0 | 100 | 100 | 75 |
| Gnome_bullet | 99 | 99 | 99 | 99 | 99 |
| Harpy_skill12_bullet | 93 | 97 | 98 | 98 | 97 |
| Harpy_skill12_bullet2 | 97 | 96 | 97 | 99 | 97 |
| Harpy_skill12_bullet_ver2 | 97 | 97 | 98 | 98 | 98 |
| Harpy_skill1_bullet_Hit | 100 | 100 | 100 | 100 | 100 |
| Harpy_skill2_missile_last_Hit | 91 | 100 | 100 | 100 | 98 |
| KunoicheZero_skill1_bullet_hit | 77 | 100 | 100 | 100 | 94 |
| KunoichiZero_skill1_Bullet | 99 | 99 | 99 | 99 | 99 |
| Kunoichi_skill2_after_Lighting | 100 | 100 | 100 | 100 | 100 |
| Meca_1_paticle | 100 | 100 | 100 | 100 | 100 |
| Mercury_N_Skill2_Hit | 100 | 83 | 89 | 90 | 91 |
| Phoenix_skill1_bullet | 99 | 99 | 99 | 99 | 99 |
| Phoenix_skill1_hit | 94 | 100 | 100 | 100 | 99 |
| RPG_skill2_hit | 87 | 100 | 100 | 100 | 97 |
| Ramiel_N_bullet | 84 | 91 | 90 | 93 | 90 |
| Raven_skill1_Hit | 92 | 100 | 100 | 100 | 98 |
| Raven_skill2_Scofe_Dot | 91 | 91 | 100 | 100 | 96 |
| Sleipnir_bullet | 99 | 99 | 99 | 99 | 99 |
| Sleipnir_bullet2 | 100 | 100 | 100 | 100 | 100 |
| Sleipnir_hit | 100 | 100 | 100 | 100 | 100 |
| Sleipnir_hit2 | 100 | 100 | 100 | 100 | 100 |
| Sleipnir_skill1_last_hit | 100 | 100 | 100 | 100 | 100 |
| Sleipnir_skill1_lastfire_bullet | 99 | 98 | 100 | 100 | 99 |
| Thetis_Skill2_Chaff_Hit | 89 | 79 | 100 | 100 | 92 |
| Thetis_skill1_Ground_Hit | 80 | 100 | 100 | 100 | 95 |
| Thetis_skill2_Hit | 100 | 100 | 100 | 100 | 100 |
| Thetis_skill2_Small_Missile | 86 | 86 | 85 | 85 | 86 |
| Thetis_skill2_big_Missile | 89 | 89 | 87 | 89 | 89 |
| Tiamat_Duke_skill1_bullet | 99 | 98 | 99 | 99 | 99 |
| Titania_skill1_Ground_ice | 93 | 100 | 100 | 83 | 94 |
| Titania_skill1_Ground_ice_smoke | 89 | 80 | 100 | 100 | 92 |
| Undine_skill1_Hit | 91 | 100 | 100 | 100 | 98 |
| Undine_skill1_bullet | 100 | 100 | 100 | 100 | 100 |
| Undine_skill2_Hit | 95 | 100 | 100 | 100 | 99 |
| Undine_skill2_bullet | 94 | 94 | 95 | 96 | 95 |
| hand_gun_shot | 99 | 99 | 99 | 99 | 99 |
| hnadgun_hit | 85 | 100 | 100 | 100 | 96 |
| rpg_bullet_fx | 100 | 100 | 100 | 100 | 100 |
| simple_explosion | 97 | 100 | 100 | 100 | 99 |
| skill_hit_simple | 84 | 100 | 100 | 100 | 96 |
| valkyrie_Hit_skill1 | 96 | 98 | 100 | 100 | 99 |
| valkyrie_Hit_skill2 | 95 | 97 | 100 | 100 | 98 |
| vfx_Tiamet_NS3_skill1_bullet_Hit | 100 | 100 | 100 | 100 | 100 |
| violet_bullet | 100 | 100 | 100 | 100 | 100 |
| violet_skill2_bullet | 100 | 100 | 100 | 100 | 100 |

## 게임에서 실제로 그리는 경로 (90점 미만 3개)

위 점수는 우리 파티클 엔진(리그 내보내기)의 재현도다. 게임은 원작 굽기 투사체·이펙트가 있으면 그것을 먼저 재생한다
(`js/game.js` hit(): `own && !(orig && orig.bullet)`, origShot / spawnStatic). 전투에서 FXB.create / SDPS.shot 호출을 세어 확인했다.

| 이펙트 | 파티클 엔진 점수 | 게임에서 그리는 것 | 확인 |
|---|---|---|---|
| Thetis_skill2_Small_Missile | 86 | 원작 굽기 재생 (FXB) | 테티스 스킬 전투: FXB 2회, 파티클 투사체 0회 |
| Thetis_skill2_big_Missile | 89 | 원작 굽기 재생 (FXB) | 같은 스킬의 다른 탄 (FX_META.uses) |
| FX_hit_bori | 75 | 원작 굽기 재생 (FXB) | 콘스탄티아 스킬 3회: 보리 3회 (V0.73에서 탄환과 함께 나오게 고침) |

V0.73: 콘스탄티아 스킬은 원작에서 탄환(EventThrowProjectile)과 보리 돌격(EventThrowEffect)이 함께 나오는데, 게임은 탄환이 있으면
던지는 이펙트를 건너뛰어 보리가 한 번도 나오지 않았다. 이제 스킬 첫 타격 때 목표 지점 바닥에서 보리가 달려와 들이받는다.

※ FX_hit_bori: 콘스탄티아 스킬의 강아지 돌격(스킨드 메시 캐릭터 + 뼈대 애니메이션)이라 파티클 엔진 대상이 아니다. 게임에서는
EventThrowEffect로 이 Unity 굽기 데이터 자체를 재생하므로(`js/fxbake.js`, FX_META.uses) 화면은 원작 출력과 같다.

V0.74에서 고친 엔진 차이:
- 루프는 시간이 길이를 "넘을 때" 넘어간다(Unity): 30fps에서 0.1초 루프의 버스트가 원작처럼 4·7·10·13프레임에 생긴다
  (이전에는 3·6·9·12프레임으로 한 프레임 일렀다).

V0.72에서 고친 엔진 차이:
- 메시 파티클의 텍스처 시트 애니메이션(번개 메시가 2×2 불꽃 시트의 한 프레임만 쓰는 것), 노드 회전 그대로의 방향
  (테티스 미사일의 번개 구 껍질이 극축을 뒤로 향해 꼬리에서 부채꼴로 퍼짐), 루프로 겹치는 개수만큼의 그리기 여유.
- Limit Velocity: 이번 스텝 이동에 바로 적용, 감쇠는 30fps 기준으로 프레임률과 무관하게.
- 루프가 넘어가는 스텝에 새 주기의 버스트를 바로 낸다(Unity와 같은 박자).
- 정점 알파를 텍스처 알파와 곱하기 전에 1로 자르지 않는다(Unity 파티클 셰이더 순서).

V0.71에서 비교로 찾아 고친 엔진 차이:
- 밉맵: Unity 이펙트 텍스처는 밉맵이 없다. 몇 px로 눌린 선(노미·권총·콘스탄티아 탄환)이 텍스처 전체 평균이 아닌 밝은 심을
  보이도록 파티클 재질은 밉 레벨 0을 읽는다 (노미 88→99, 권총 92→99).
- Mesh 렌더 모드: 입자 수가 적은 메시 파티클은 실제 메시 폴리곤으로 그린다(정점 z도 rig 공간으로 반전, View 정렬).
- 비교 기준의 손보정(TINT) 제외, 굽기 조건(투사체 정지·꼬리) 재현.

V0.70: TrailRenderer, 렌더러 피벗, 메시 크기(FBX 파일 단위), 이펙트 안의 FBX 모델 + 애니메이터 색 커브.

남은 차이: 테티스 미사일 2종(86·89)·아자젤 탄환(89). 번개 부채꼴 모양·위치·퍼짐·색·버스트 박자는 원작과 맞는다.
남은 감점은 "같은 순간의 밝기 총량"이다. 원작 굽기는 고정 시드(12345)로 입자마다 크기를 뽑는다. 테티스 작은 미사일의 불꽃
스프라이트는 굽기에서 2.3 → 3.0 → 3.3 → 4.2 순으로 뽑혀(분포 2~5), 프레임별 밝기가 그 순서로 출렁인다. 무작위로 뽑는 우리
엔진은 평균은 같아도 그 순서를 재현할 수 없다(Unity 내부 난수 생성기를 재현해야 함).
