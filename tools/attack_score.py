"""How close each unit's attack / skill is to the original, from the original's own data (0-100 per clip).

  original effects (40)  the clip switches on the rig's particle effects, or the unit fires an original projectile
  projectile (25)        a clip with EventThrowProjectileFire has an original projectile (Unity bake or our export)
  motion (15)            a clip with EventMoveMotion timings dashes (js/game.js reads ANIM_EV mv)
  hit effect (10)        something original lands on the target: a projectile's hit effect, a spawned ground hit,
                         or (instant hits) the original hit flash
  no stand-ins (10)      the generic stand-in effects stay off (the clip has original effects of its own)
Usage: python tools/attack_score.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_sd as B  # noqa: E402

ROOT = os.path.join(HERE, "..")
REF = os.path.join(HERE, "unity_ref") if os.path.exists(os.path.join(HERE, "unity_ref", "fx_meta.json")) else r"E:/LAO_MINI_GAME/5_LAO_Defence/tools/unity_ref"


def load_js_obj(path):
    s = open(path, encoding="utf-8").read()
    return json.loads(s[s.index("=", s.index("[") if "SD_DATA[" in s else 0) + 1:].strip().rstrip(";")) if "SD_DATA[" in s else json.loads(s[s.index("{"):s.rindex("}") + 1])


def main():
    fxm = json.load(open(os.path.join(REF, "fx_meta.json"), encoding="utf-8"))
    ev_all = load_js_obj(os.path.join(ROOT, "js", "anim_events.js"))
    rows = []
    for uid, model in B.UNITS.items():
        d = load_js_obj(os.path.join(ROOT, "js", "sd", uid + ".js"))
        nodes = d["nodes"]
        idx = {n["path"]: i for i, n in enumerate(nodes)}
        anc, det_anc = set(), set()
        for i, n in enumerate(nodes):
            if n.get("ps"):
                p = i
                while p >= 0:
                    anc.add(p)
                    if n["ps"].get("det"):
                        det_anc.add(p)
                    p = nodes[p]["p"]
        rank = None
        for line in open(os.path.join(ROOT, "js", "data.js"), encoding="utf-8"):
            if line.strip().startswith("['%s'," % uid):
                rank = line.split("'")[5]
        clips = ["atk"] + (["skill"] if rank in ("S", "SS") else [])
        for clip in clips:
            c = d["clips"].get(clip) or {"tracks": []}
            toggled = {idx[t["p"]] for t in c["tracks"] if t["k"] == "a" and t["p"] in idx and idx[t["p"]] in anc and idx[t["p"]] != 0}
            det_on = any(i in det_anc for i in toggled)
            ev = (ev_all.get(uid) or {}).get(clip) or {}
            fires = any(x >= 1 for x in ev.get("f") or [])
            # original projectile: Unity bake (fx_meta uses) or our export (rig data shots)
            baked = [n for n, us in fxm["uses"].items() if any(u[0] == uid and u[1] == clip and u[2].startswith("EventThrowProjectile") for u in us)]
            baked = [n for n in baked if fxm["meta"].get(n, {}).get("type", -1) >= 0]
            own = (d.get("shots") or {}).get(clip)
            statics = [n for n, us in fxm["uses"].items() if any(u[0] == uid and u[1] == clip and u[2].startswith("EventThrowEffect") for u in us)]
            has_proj = bool(baked or own)
            named_hit = (d.get("hits") or {}).get(clip)  # the clip's EventHit effect, played on the target
            s_fx = 40 if (toggled or has_proj or statics or named_hit) else 0
            s_proj = 25 if (not fires or has_proj) else 0
            s_mv = 15  # every mv clip dashes (game.js); clips without mv need none
            hit = named_hit or (baked and any(fxm["meta"][n].get("hit") for n in baked)) or (own and own.get("hit")) or det_on or statics \
                or (not has_proj and toggled)  # instant hits keep the original hit flash
            s_hit = 10 if hit else 0
            s_ns = 10 if (toggled or has_proj or statics or named_hit) else 0
            total = s_fx + s_proj + s_mv + s_hit + s_ns
            rows.append((uid, clip, total, s_fx, s_proj, s_mv, s_hit, s_ns, len(toggled), int(fires), "bake" if baked else "own" if own else "-", int(bool(ev.get("mv")))))
    print("%-16s %-5s %5s  fx proj mv hit ns | toggles fires proj mv" % ("unit", "clip", "score"))
    for r in rows:
        print("%-16s %-5s %5d  %2d %4d %2d %3d %2d | %7d %5d %4s %2d" % r)
    avg = sum(r[2] for r in rows) / len(rows)
    low = [(r[0], r[1], r[2]) for r in rows if r[2] < 90]
    print("\naverage %.1f over %d clips; below 90: %s" % (avg, len(rows), low))


if __name__ == "__main__":
    main()
