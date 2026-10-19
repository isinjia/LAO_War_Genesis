"""Side-by-side check of the web particle player against the original Unity output.

The Defence project's Unity pass baked some effects frame by frame (js/fx/<name>.js, played by js/fxbake.js): that is
what the original engine draws. This exports the same prefabs the way the rigs carry them (tools/particles.py via
build_sd.fx_tree) into tools/compare/cmp.js, so tools/compare/compare.html-style page code can play both at the same
moments. Usage: python tools/build_compare.py
"""
import base64
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_sd as B  # noqa: E402

NAMES = ["Azazel_skill1_Hit_m", "Constantia_hit", "Phoenix_skill1_hit", "Raven_skill1_Hit", "Sleipnir_hit",
         "Thetis_skill1_Ground_Hit", "Titania_skill1_Ground_ice", "Undine_skill1_Hit", "valkyrie_Hit_skill1",
         "Mercury_N_Skill2_Hit", "Harpy_skill1_bullet_Hit", "KunoicheZero_skill1_bullet_hit", "simple_explosion",
         "Thetis_skill2_Hit", "Undine_skill2_Hit", "valkyrie_Hit_skill2"]


def main():
    atlas = B.Atlas()
    trees = {}
    for n in NAMES:
        p = B.fx_prefab(n)
        t = B.fx_tree(p, atlas, 2.0) if p else []
        if t:
            trees[n] = t
    meta, files = B.packed_atlas([p for _, p, _, _ in atlas.textures])
    out = os.path.join(HERE, "compare")
    os.makedirs(out, exist_ok=True)
    js = "window.CMP=%s;" % json.dumps({"trees": trees, "rects": meta["rects"], "img": files["a50"]}, separators=(",", ":"))
    open(os.path.join(out, "cmp.js"), "w", encoding="utf-8").write(js)
    print("compare set:", len(trees), "effects,", len(meta["rects"]), "textures")


if __name__ == "__main__":
    main()
