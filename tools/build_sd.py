"""Convert Last Origin SD (cut-out) characters from the Unity project into JS data.

For each character this reads:
  * the prefab (Transform tree + SpriteRenderers),
  * the sprite atlas textures (+ .meta sprite rects/pivots),
  * a few AnimationClips (.anim) which are sampled into simple keyframe arrays.
Output: js/sd/<id>.js  ->  window.SD_DATA[id] = {...}

Usage: python tools/build_sd.py [id ...]   (no ids: every unit and enemy of this game)

Same SD rig pipeline as 5_LAO_Defence (prefab + Puppet2D + clips -> js/sd/<id>.js, played by js/sd.js).
Source assets: E:/LAO_Google_QA/Assets. The extraction caches made there (Unity mesh exports, FBX dumps,
guid index) are read from CACHE_DIRS when they are not in this project.
"""
import base64
import io
import json
import math
import os
import re
import sys

import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import particles  # noqa: E402
from PIL import Image

ROOT = r"E:/LAO_Google_QA/Assets"
CHAR_DIRS = [ROOT + "/AssetBundleResource/Character", ROOT + "/AssetBundleResourceSub/Character"]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "sd")
FPS = 24
TEX_SCALE = 0.5

HERE = os.path.dirname(os.path.abspath(__file__))
# extraction caches: this project's own first, then the defence project's (same source assets)
CACHE_DIRS = [os.path.join(HERE), r"E:/LAO_MINI_GAME/5_LAO_Defence/tools"]


def cache_path(rel):
    for d in CACHE_DIRS:
        p = os.path.join(d, rel)
        if os.path.exists(p):
            return p
    return os.path.join(CACHE_DIRS[0], rel)


# game unit id -> Unity model name (tools/roster.py, js/data.js UNITS)
sys.path.insert(0, HERE)
from roster import UNITS  # noqa: E402
# rigs that are not units: our base is the Orca's AGS Fortress (the enemy base is the worms' Fortress)
EXTRA = {"base_orca": "AGS_Fortress_N"}

# enemy image key (data.js) -> monster prefab
LAYER_NAMES = ["3D_BG", "FX_back", "Default", "BG_top", "FX_self", "bone_and_ik", "UI", "OverFX"]
LAYER_IDS = {175830887: 0, 2320800499: 1, 0: 2, 3417033155: 3, 3865075951: 4, 4047528637: 5, 3106374313: 6, 211725069: 7}
for _lid in list(LAYER_IDS):
    LAYER_IDS[_lid - (1 << 32)] = LAYER_IDS[_lid]  # ids are serialized as signed ints
GIZMO_LAYER = 5
BONE_SCRIPT = "414b3d7083efd4b3ab1599da5679e694"  # Puppet2D_Bone (editor gizmo)
IK_SCRIPT = "62fc74be5d0ea434fa84a6add19b6c84"  # Puppet2D_IKHandle
PC_SCRIPT = "ce5b497186e7941f3818d3304a18c909"  # Puppet2D_ParentControl
GC_SCRIPT = "4b26f48954cb147b3aa11d49d1ad9513"  # Puppet2D_GlobalControl
PUPPET_SCRIPTS = (IK_SCRIPT, PC_SCRIPT, GC_SCRIPT)


def v3_from(d, dv):
    return [num((d or {}).get(a, dv[i])) for i, a in enumerate("xyz")]

ENEMIES = {k: "Model_MP_" + k for k in """NightChick_N Drone_N Legion_N Fallen_N Centurion_N Gigantes_N
Intruder_N Phalangites_N Rampart_N Juggernaut_N BigChick_N Fortress_N Destroyer_N
EmperorChick_N Executioner_EW IronPrince_N Nest_B07 HauntedFortress_N UnderWatcher_B05""".split()}
MONSTER_DIR = ROOT + "/AssetBundleResource/monster"

CLIPS = {
    "idle": [r"^idle_?1$", r"^stand$", r"^idle"],
    "atk": [r"^skil+_?1$", r"^attack_?01$", r"^skil+1"],
    "skill": [r"^skil+_?2$", r"^attack_?02$", r"^skil+2"],
    "hit": [r"^hit_?0?1$"],
    "win": [r"^victory$", r"^win$"],
    "move": [r"^move", r"walk", r"run"],
    "die": [r"^die"],
}

YLoader = getattr(yaml, "CSafeLoader", yaml.SafeLoader)
HDR = re.compile(r"^--- !u!(\d+) &(-?\d+).*$", re.M)

_guid_index = None


def guid_index():
    global _guid_index
    cache = cache_path(os.path.join("lab", "guid_index.json"))
    if _guid_index is None and os.path.exists(cache):
        _guid_index = json.load(open(cache, encoding="utf-8"))  # delete the file after the asset set changes
    if _guid_index is None:
        _guid_index = {}
        for base in [ROOT + "/AssetBundleResource", ROOT + "/AssetBundleResourceSub"]:
            for dp, _, fn in os.walk(base):
                for f in fn:
                    if f.endswith(".meta"):
                        with open(os.path.join(dp, f), encoding="utf-8", errors="ignore") as h:
                            h.readline()
                            m = re.search(r"guid: ([0-9a-f]+)", h.readline())
                            if m:
                                _guid_index[m.group(1)] = os.path.join(dp, f[:-5]).replace("\\", "/")
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        json.dump(_guid_index, open(cache, "w", encoding="utf-8"))
    return _guid_index


def load_docs(path):
    text = open(path, encoding="utf-8", errors="ignore").read()
    text = "\n".join(l for l in text.split("\n") if not l.startswith("%"))
    docs = {}
    parts = HDR.split(text)
    # parts: [pre, cls, id, body, cls, id, body, ...]
    for i in range(1, len(parts), 3):
        cls, fid, body = int(parts[i]), parts[i + 1], parts[i + 2]
        data = yaml.load(body, Loader=YLoader) or {}
        docs[fid] = (cls, next(iter(data.values())) if data else {})
    return docs


def num(v):
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v)
    if "Infinity" in s:
        return -math.inf if s.startswith("-") else math.inf
    try:
        return float(s)
    except ValueError:
        return 0.0


# ── sprites ───────────────────────────────────────────────
class Atlas:
    def __init__(self):
        self.textures = []      # [(guid, path)]
        self.tex_ix = {}
        self.sprites = {}       # key -> [tex, x, y, w, h, px, py, ppu]
        self.names = {}         # key -> sprite name
        self.outlines = {}      # key -> Unity's Tight outline paths (px, relative to the rect centre)
        self.meta_cache = {}

    def meta(self, guid):
        if guid not in self.meta_cache:
            path = guid_index().get(guid)
            if not path or not path.lower().endswith(".png"):
                self.meta_cache[guid] = None
            else:
                m = yaml.load(open(path + ".meta", encoding="utf-8").read(), Loader=YLoader)
                imp = m.get("TextureImporter", {})
                w, h = Image.open(path).size
                self.meta_cache[guid] = (path, imp, w, h)
        return self.meta_cache[guid]

    def texture(self, guid):
        info = self.meta(guid)
        if not info:
            return None
        if guid not in self.tex_ix:
            self.tex_ix[guid] = len(self.textures)
            self.textures.append((guid, info[0], info[2], info[3]))
        return self.tex_ix[guid]

    def sprite(self, ref):
        if not ref or not ref.get("guid") or str(ref.get("guid")).startswith("0000"):
            return None
        guid, fid = ref["guid"], int(ref["fileID"])
        key = "%s:%d" % (guid[:8], fid)
        if key in self.sprites:
            return key
        info = self.meta(guid)
        if not info:
            return None
        path, imp, tw, th = info
        ppu = num(imp.get("spritePixelsToUnits", 100))
        rect = None
        sheet = (imp.get("spriteSheet") or {}).get("sprites") or []
        names = {}
        for e in imp.get("internalIDToNameTable") or []:
            first = e.get("first") or {}
            for _, v in first.items():
                names[int(v)] = e.get("second")
        for s in sheet:
            if int(s.get("internalID", -1)) == fid or (fid in names and s.get("name") == names[fid]):
                r = s["rect"]
                rect = (num(r["x"]), num(r["y"]), num(r["width"]), num(r["height"]))
                piv = s.get("pivot") or {"x": 0.5, "y": 0.5}
                align = int(s.get("alignment", 0))
                px, py = alignment_pivot(align, piv)
                self.names[key] = str(s.get("name", ""))
                if int(imp.get("spriteMeshType", 1)) == 1 and s.get("outline"):
                    self.outlines[key] = (rect, (px, py), [[(num(q["x"]), num(q["y"])) for q in path] for path in s["outline"] if len(path) >= 3])
                break
        if rect is None:
            self.names[key] = os.path.splitext(os.path.basename(path))[0]
            if int(imp.get("spriteMode", 1)) == 1 or not sheet:
                rect = (0.0, 0.0, float(tw), float(th))
                piv = imp.get("spritePivot") or {"x": 0.5, "y": 0.5}
                px, py = alignment_pivot(int(imp.get("alignment", 0)), piv)
            else:
                return None
        if guid not in self.tex_ix:
            self.tex_ix[guid] = len(self.textures)
            self.textures.append((guid, path, tw, th))
        t = self.tex_ix[guid]
        self.sprites[key] = [t, rect[0] / tw, rect[1] / th, rect[2] / tw, rect[3] / th,
                             round(px, 4), round(py, 4), round(rect[2] / ppu, 4), round(rect[3] / ppu, 4)]
        return key


def _area(poly):
    return sum(poly[i - 1][0] * poly[i][1] - poly[i][0] * poly[i - 1][1] for i in range(len(poly))) / 2  # > 0: counter-clockwise


def triangulate(poly):
    """Ear clipping for one simple polygon; returns index triples into poly."""
    n = len(poly)
    if n < 3:
        return []
    idx = list(range(n)) if _area(poly) > 0 else list(range(n))[::-1]  # walk it counter-clockwise
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    def inside(p, a, b, c):
        d1, d2, d3 = cross(a, b, p), cross(b, c, p), cross(c, a, p)
        return d1 >= 0 and d2 >= 0 and d3 >= 0
    tris, guard = [], 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        m = len(idx)
        for k in range(m):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % m]
            a, b, c = poly[i0], poly[i1], poly[i2]
            if cross(a, b, c) <= 1e-9:  # reflex (polygon is counter-clockwise here)
                continue
            if any(inside(poly[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            tris.append((i0, i1, i2))
            idx.pop(k)
            break
        else:  # degenerate leftovers: fan the rest
            break
    if len(idx) >= 3:
        for k in range(1, len(idx) - 1):
            tris.append((idx[0], idx[k], idx[k + 1]))
    return tris


def outline_meshes(atlas):
    """Unity draws Tight sprites with a mesh made from the sprite outline (.meta): the full-rect quad would show
    the neighbouring sprites of a tightly packed sheet (Nest_B07's leg). Same format as the exported spriteMesh."""
    out = {}
    for key, (rect, (px, py), paths) in atlas.outlines.items():
        t = atlas.sprites[key][0]
        _, _, tw, th = atlas.textures[t]
        ppu_w, ppu_h = atlas.sprites[key][7], atlas.sprites[key][8]
        rx, ry, rw, rh = rect
        v, u, tri = [], [], []
        for path in paths:
            base = len(v) // 2
            for (ox, oy) in path:
                fx, fy = (ox + rw / 2) / rw, (oy + rh / 2) / rh
                v += [round((fx - px) * ppu_w, 4), round((fy - py) * ppu_h, 4)]
                u += [round((rx + ox + rw / 2) / tw, 5), round((ry + oy + rh / 2) / th, 5)]
            tri += [base + i for t3 in triangulate(path) for i in t3]
        if tri:
            out[key] = [v, u, tri]
    return out


def alignment_pivot(align, piv):
    table = {0: (0.5, 0.5), 1: (0, 1), 2: (0.5, 1), 3: (1, 1), 4: (0, 0.5), 5: (1, 0.5), 6: (0, 0), 7: (0.5, 0), 8: (1, 0)}
    if align == 9:
        return num(piv.get("x", 0.5)), num(piv.get("y", 0.5))
    return table.get(align, (0.5, 0.5))


# ── spawned FX prefabs (PlayMaker CreateObject) ───────────
_fx_docs = {}


def spawned_fx(fx_path, parent, ppath, nodes, atlas):
    """Append the FX prefab's transforms under the spawner node; their particle systems are 'det' (detached: once
    spawned they stay where they were created and play out even after the spawner turns off)."""
    if fx_path not in _fx_docs:
        try:
            _fx_docs[fx_path] = load_docs(fx_path)
        except Exception:  # noqa: BLE001
            _fx_docs[fx_path] = None
    docs = _fx_docs[fx_path]
    if not docs:
        return
    go = {k: d for k, (c, d) in docs.items() if c == 1}
    tr = {k: d for k, (c, d) in docs.items() if c in (4, 224) and "m_GameObject" in d}
    psys, prend = {}, {}
    for k, (c, d) in docs.items():
        if c == 198 and "m_GameObject" in d:
            psys[str(d["m_GameObject"]["fileID"])] = d
        elif c == 199 and "m_GameObject" in d:
            prend[str(d["m_GameObject"]["fileID"])] = d
    if not psys:
        return
    roots = [k for k, d in tr.items() if int(d["m_Father"]["fileID"]) == 0]
    base = (ppath + "/" if ppath else "") + "~fx:" + os.path.splitext(os.path.basename(fx_path))[0]

    def walk(tid, par, pth, top):
        t = tr[tid]
        gid = str(t["m_GameObject"]["fileID"])
        g = go.get(gid, {})
        p, q, sc = t["m_LocalPosition"], t["m_LocalRotation"], t["m_LocalScale"]
        n = {"n": g.get("m_Name", "?"), "p": par,
             "t": [0, 0, 0] if top else [round(num(p["x"]), 5), round(num(p["y"]), 5), round(num(p["z"]), 5)],
             "q": [round(num(q["x"]), 6), round(num(q["y"]), 6), round(num(q["z"]), 6), round(num(q["w"]), 6)],
             "s": [round(num(sc["x"]), 5), round(num(sc["y"]), 5), round(num(sc["z"]), 5)],
             "a": int(g.get("m_IsActive", 1)), "path": pth}
        if gid in psys:
            ex = particles.export(psys[gid], prend.get(gid), atlas, guid_index(), mat_additive)
            if ex:
                ex["det"] = 1
                ex.pop("subs", None)
                n["ps"] = ex
        ix = len(nodes)
        nodes.append(n)
        for ch in t.get("m_Children") or []:
            cid = str(ch["fileID"])
            if cid in tr:
                walk(cid, ix, pth + "/" + go.get(str(tr[cid]["m_GameObject"]["fileID"]), {}).get("m_Name", "?"), False)

    for r in roots:
        walk(r, parent, base, True)


# ── original projectiles (Bullet_Effect prefabs) that the Unity bake lacks ─────
# the attack (Skil_1) / skill (Skil_2) projectile per unit, by the original's naming; the projectile script gives
# the flight time, path type, easing curve and hit effect name
SHOT_PREFABS = {
    "daphne": {"atk": "daphne_bullet"},
    "andvari": {"atk": "Andvari_skill1_bullet"},
    "hraesvelgr": {"atk": "Hraesvelgr_skill1_Lazer_bullet"},
    "eternity": {"atk": "Eternity_skill1_bullet"},
    "blacklilith": {"atk": "FX_blackLilith_bullet"},
    "brunhild": {"atk": "Brunhild_N_Skill1_bullet"},
    "undine": {"skill": "Undine_skill2_bullet"},
    "thetis": {"skill": "Thetis_skill2_Small_Missile"},
    # base models whose own projectile is not in the assets: the original shares projectiles between units
    # (Nymph fires Leprechaun's), so these use the one their weapon matches
    "amy": {"atk": "hand_gun_shot"},           # her rig's muzzle effect is "handgun_shot", Leona's handgun round
    "sylphid": {"atk": "FX_Leprechaun_bullet"},  # SMG rounds, as Leprechaun / Nymph
    "khan": {"atk": "Khan_NS2_skill1_bullet"},   # her own attack's projectile (the skin's copy is the one kept)
}
_fx_by_name = None


def fx_prefab(name):
    """An FX / bullet prefab file by its name."""
    global _fx_by_name
    if _fx_by_name is None:
        _fx_by_name = {}
        for base in [ROOT + "/AssetBundleResource", ROOT + "/AssetBundleResourceSub"]:
            for sub in ("Bullet_Effect", "FX"):  # a bullet's own prefab (with its projectile script) before FX copies
                for dp, _, fn in os.walk(os.path.join(base, sub)):
                    for f in fn:
                        if f.endswith(".prefab"):
                            _fx_by_name.setdefault(f[:-7], os.path.join(dp, f).replace("\\", "/"))
    return _fx_by_name.get(name)


def fx_tree(path, atlas, life):
    """A prefab's transforms as a small node list {p, t, q, s, ps} (particle systems, and sprites as one-particle
    systems aligned to their node) for effects played outside the rig (projectiles, hit effects)."""
    try:
        docs = load_docs(path)
    except Exception:  # noqa: BLE001
        return []
    go = {k: d for k, (c, d) in docs.items() if c == 1}
    tr = {k: d for k, (c, d) in docs.items() if c in (4, 224) and "m_GameObject" in d}
    byg = {}
    for k, (c, d) in docs.items():
        if "m_GameObject" in d and c in (198, 199, 212, 96):
            byg.setdefault(str(d["m_GameObject"]["fileID"]), {})[c] = d
    out = []

    def walk(tid, par):
        t = tr[tid]
        gid = str(t["m_GameObject"]["fileID"])
        g = go.get(gid, {})
        p, q, sc = t["m_LocalPosition"], t["m_LocalRotation"], t["m_LocalScale"]
        n = {"n": g.get("m_Name", "?"), "p": par,
             "t": [round(num(p["x"]), 5), round(num(p["y"]), 5), round(num(p["z"]), 5)] if par >= 0 else [0, 0, 0],
             "q": [round(num(q["x"]), 6), round(num(q["y"]), 6), round(num(q["z"]), 6), round(num(q["w"]), 6)],
             "s": [round(num(sc["x"]), 5), round(num(sc["y"]), 5), round(num(sc["z"]), 5)],
             "a": int(g.get("m_IsActive", 1))}
        cs = byg.get(gid, {})
        if 96 in cs:
            tx = particles.export_trail(cs[96], atlas, guid_index(), mat_additive)
            if tx:
                n["tr"] = tx
        if 198 in cs:
            ex = particles.export(cs[198], cs.get(199), atlas, guid_index(), mat_additive)
            if ex:
                ex.pop("subs", None)
                n["ps"] = ex
        elif 212 in cs and int(num(cs[212].get("m_Enabled", 1))):
            d = cs[212]
            key = atlas.sprite(d.get("m_Sprite"))
            if key:
                tx, x, y, w, h, px, py, ww, hh = atlas.sprites[key]
                col = d.get("m_Color") or {}
                mats = d.get("m_Materials") or []
                mguid = mats[0].get("guid") if mats else None
                n["ps"] = {"dur": life, "loop": 0, "awake": 1, "delay": {"m": 0, "s": 0}, "space": 0, "sim": 1, "scl": 2,
                           "life": {"m": 0, "s": life}, "speed": {"m": 0, "s": 0}, "size": {"m": 0, "s": ww}, "s3": 1,
                           "sy": {"m": 0, "s": hh}, "rot": {"m": 0, "s": 0},
                           "color": {"m": 0, "c0": [round(num(col.get(k, 1)), 3) for k in "rgba"]},
                           "grav": {"m": 0, "s": 0}, "max": 1,
                           "emit": {"rate": {"m": 0, "s": 0}, "b": [{"t": 0, "n": {"m": 0, "s": 1}, "cyc": 1, "iv": 0.01, "p": 1}]},
                           "r": {"t": tx, "add": mat_additive(mguid), "tint": None, "mode": 5, "ls": 2, "vs": 0,
                                 "so": int(num(d.get("m_SortingOrder", 0))), "sub": [x, y, w, h],
                                 "off": [round((0.5 - px) * ww, 4), round((0.5 - py) * hh, 4)],
                                 "fx": int(num(d.get("m_FlipX", 0)))}}
        ix = len(out)
        out.append(n)
        for ch in t.get("m_Children") or []:
            cid = str(ch["fileID"])
            if cid in tr:
                walk(cid, ix)
            elif cid in docs and "m_PrefabInstance" in docs[cid][1]:
                m = mesh_instance(docs, docs[cid][1], ix, atlas)
                if m:
                    out.append(m)

    for r in [k for k, d in tr.items() if int(d["m_Father"]["fileID"]) == 0]:
        walk(r, -1)
    return out if any(n.get("ps") or n.get("tr") for n in out) else []


def _anim_color(docs, name):
    """material._Color curves an effect's own Animator plays on a child renderer (Titania's ice aura fades in and out
    every 2 s): [clip length, loop, {r,g,b,a: keys}] or None."""
    for _, (c, d) in docs.items():
        if c != 95 or not d.get("m_Controller"):
            continue
        cp = guid_index().get(d["m_Controller"].get("guid", ""), "")
        if not cp or not os.path.exists(cp):
            return None
        for mg in re.findall(r"m_Motion: \{fileID: \d+, guid: ([0-9a-f]+)", open(cp, encoding="utf-8", errors="ignore").read()):
            ap = guid_index().get(mg, "")
            if not ap.endswith(".anim"):
                continue
            for _, (ac, clip) in load_docs(ap).items():
                if ac != 74:
                    continue
                ch = {}
                for fc in clip.get("m_FloatCurves") or []:
                    at = fc.get("attribute", "")
                    if fc.get("path") == name and re.match(r"material\._(Tint)?Color\.[rgba]$", at):
                        ch[at[-1]] = particles.keys(fc.get("curve"))
                if ch:
                    st = clip.get("m_AnimationClipSettings") or {}
                    return [max(0.05, num(st.get("m_StopTime", 1))), int(num(st.get("m_LoopTime", 0))), ch]
    return None


def mesh_instance(docs, stub, par, atlas):
    """A model (FBX) placed inside an effect prefab (a PrefabInstance): its mesh drawn as one quad the mesh's size in
    its node's plane, with the material's texture and the Animator's colour curves (if any)."""
    pi = docs.get(str(stub["m_PrefabInstance"]["fileID"]), (0, {}))[1]
    src = guid_index().get((pi.get("m_SourcePrefab") or {}).get("guid", ""), "")
    if not src.lower().endswith(".fbx"):
        return None
    mods, mat = {}, None
    for m in (pi.get("m_Modification") or {}).get("m_Modifications") or []:
        fid, pp = int((m.get("target") or {}).get("fileID", 0)), m.get("propertyPath", "")
        if pp == "m_Materials.Array.data[0]":
            mat = (m.get("objectReference") or {}).get("guid")
        elif fid in (100000, 400000) or pp == "m_Name":
            mods[pp] = m.get("value")
    if mods.get("m_IsActive") in (0, "0"):
        return None
    ext = particles.mesh_extent(src)
    tex_guid, tint, _ = particles.mat_props(guid_index().get(mat or "", ""))
    t = atlas.texture(tex_guid) if tex_guid else None
    if not ext or t is None:
        return None
    g = lambda k, dv: round(num(mods.get(k, dv)), 6)
    name = mods.get("m_Name") or os.path.splitext(os.path.basename(src))[0]
    dur, loop, col = 1.0, 0, None
    an = _anim_color(docs, name)
    if an:
        dur, loop, ch = an
        ts = [i / 10 for i in range(11)]
        cv = lambda k, u, dv: particles_curve(ch[k], u * dur) if k in ch else dv
        base = [v * 2 for v in tint] if tint else [1, 1, 1, 1]
        col = {"m": 1, "g0": {"c": [[u] + [round(cv(k, u, base[i]), 3) for i, k in enumerate("rgb")] for u in ts],
                              "a": [[u, round(cv("a", u, base[3]), 3)] for u in ts], "f": 0}}
        tint = [0.5, 0.5, 0.5, 0.5]  # the animated colour replaces the material's
    ps = {"dur": dur, "loop": loop, "awake": 1, "delay": {"m": 0, "s": 0}, "space": 0, "sim": 1, "scl": 0,
          "life": {"m": 0, "s": dur}, "speed": {"m": 0, "s": 0}, "size": {"m": 0, "s": 1}, "rot": {"m": 0, "s": 0},
          "color": {"m": 0, "c0": [1, 1, 1, 1]}, "grav": {"m": 0, "s": 0}, "max": 1,
          "emit": {"rate": {"m": 0, "s": 0}, "b": [{"t": 0, "n": {"m": 0, "s": 1}, "cyc": 1, "iv": 0.01, "p": 1}]},
          "r": {"t": t, "add": mat_additive(mat), "tint": tint, "mode": 4, "ls": 2, "vs": 0, "so": 0, "maxs": 100,
                "align": 2, "piv": [0, 0, 0], "flip": [0, 0, 0], "mx": ext}}
    geo = particles.mesh_geom(src)
    if geo and len(geo["p"]) // 12 <= 500:
        ps["r"]["geo"] = geo  # the real mesh (a ring the texture wraps around), not its bounding quad
    if col:
        ps["col"] = col
    return {"n": name, "p": par, "t": [g("m_LocalPosition.x", 0), g("m_LocalPosition.y", 0), g("m_LocalPosition.z", 0)],
            "q": [g("m_LocalRotation.x", 0), g("m_LocalRotation.y", 0), g("m_LocalRotation.z", 0), g("m_LocalRotation.w", 1)],
            "s": [g("m_LocalScale.x", 1), g("m_LocalScale.y", 1), g("m_LocalScale.z", 1)], "a": 1, "ps": ps}


def particles_curve(k, t):
    """Hermite evaluation of exported keys [[time, value, inSlope, outSlope]...] (as js/particles.js curve())."""
    if not k:
        return 1.0
    if t <= k[0][0]:
        return k[0][1]
    for a, b in zip(k, k[1:]):
        if a[0] <= t <= b[0]:
            dt = b[0] - a[0]
            if dt <= 0 or abs(a[3]) > 1e8 or abs(b[2]) > 1e8:
                return a[1] if dt > 0 else b[1]
            u = (t - a[0]) / dt
            u2, u3 = u * u, u * u * u
            return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * a[3] * dt + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * b[2] * dt
    return k[-1][1]


def hit_data(anim_paths, atlas):
    """The hit effect each clip names in its EventHit events (data: the FX prefab, e.g. LRL's "Hit_x2"; "noHit"
    means none): played on the target at every hit that has no projectile of its own."""
    out = {}
    for clip in ("atk", "skill"):
        p = anim_paths.get(clip)
        if not p or not os.path.exists(p):
            continue
        names = re.findall(r"functionName: EventHit\n    data: (\S+)", open(p, encoding="utf-8", errors="ignore").read())
        names = [n for n in names if not n.lower().startswith("nohit")]
        if not names:
            continue
        name = max(set(names), key=names.count)
        path = fx_prefab(name)
        tree = fx_tree(path, atlas, 1.0) if path else []
        if tree:
            out[clip] = {"name": name, "t": tree}
    return out


def shot_data(uid, atlas):
    out = {}
    for clip, name in SHOT_PREFABS.get(uid, {}).items():
        path = fx_prefab(name)
        if not path:
            continue
        sc = {}
        for k, (c, d) in load_docs(path).items():
            if c == 114 and "_projectileEndTime" in d:
                sc = d
                break
        T = max(0.05, num(sc.get("_projectileEndTime", 0.3)))
        shot = {"T": round(T, 3), "type": int(num(sc.get("_eProJectileType", 0))),
                "curve": particles.keys(sc.get("animationCurve")), "b": fx_tree(path, atlas, T + 0.05)}
        if re.search(r"lazer|laser|beam", name, re.I):
            shot["laser"] = 1  # a beam anchored at the muzzle, aimed at the target (it does not fly)
        hn = sc.get("_hitEffectName")
        hp = fx_prefab(hn) if hn else None
        if hp:
            shot["hit"] = fx_tree(hp, atlas, 1.0)
            shot["hs"] = round(num(sc.get("_scaleHitEffect", 1)), 3)
        if shot["b"]:
            out[clip] = shot
    return out


# ── prefab ────────────────────────────────────────────────
def build_prefab(path, atlas):
    docs = load_docs(path)
    go = {k: d for k, (c, d) in docs.items() if c == 1}
    tr = {k: d for k, (c, d) in docs.items() if c in (4, 224) and "m_GameObject" in d}
    comps = {}
    for k, (c, d) in docs.items():
        if c in (212, 137, 95) or (c == 114 and (d.get("m_Script") or {}).get("guid") in PUPPET_SCRIPTS + (BONE_SCRIPT,)):
            comps.setdefault(str(d["m_GameObject"]["fileID"]), []).append((c, d))
    # particle systems (198) and their renderers (199): the attack effects nested in the model
    psys, prend, trails = {}, {}, {}
    for k, (c, d) in docs.items():
        if c == 198 and "m_GameObject" in d:
            psys[str(d["m_GameObject"]["fileID"])] = (k, d)
        elif c == 199 and "m_GameObject" in d:
            prend[str(d["m_GameObject"]["fileID"])] = d
        elif c == 96 and "m_GameObject" in d:
            trails[str(d["m_GameObject"]["fileID"])] = d
    ps_node = {}  # ParticleSystem component id -> node index (sub-emitter links)
    # PlayMaker FSMs that CreateObject an FX prefab when their object is switched on (ground hits, smoke...)
    spawns = {}
    for k, (c, d) in docs.items():
        if c == 114 and isinstance(d.get("fsm"), dict) and "m_GameObject" in d:
            fs = json.dumps(d["fsm"])
            if "CreateObject" not in fs:
                continue
            paths = [guid_index().get(g, "") for g in sorted(set(re.findall(r'"guid": "([0-9a-f]{32})"', fs)))]
            paths = [x for x in paths if x.endswith(".prefab") and "/FX/" in x]
            main = [x for x in paths if not x.endswith("FX_shot_flash.prefab")] or paths
            if main:
                spawns.setdefault(str(d["m_GameObject"]["fileID"]), []).extend(main)
    root = next(k for k, d in tr.items() if int(d["m_Father"]["fileID"]) == 0)
    go_tr = {str(d["m_GameObject"]["fileID"]): k for k, d in tr.items()}
    nodes, index = [], {}

    def walk(tid, parent, path):
        t = tr[tid]
        g = go.get(str(t["m_GameObject"]["fileID"]), {})
        name = g.get("m_Name", "?")
        p, q, s = t["m_LocalPosition"], t["m_LocalRotation"], t["m_LocalScale"]
        n = {
            "n": name, "p": parent,
            "t": [round(num(p["x"]), 5), round(num(p["y"]), 5), round(num(p["z"]), 5)],
            "q": [round(num(q["x"]), 6), round(num(q["y"]), 6), round(num(q["z"]), 6), round(num(q["w"]), 6)],
            "s": [round(num(s["x"]), 5), round(num(s["y"]), 5), round(num(s["z"]), 5)],
            "a": int(g.get("m_IsActive", 1)),
            "path": path,
        }
        is_bone = any(c == 114 and (d.get("m_Script") or {}).get("guid") == BONE_SCRIPT
                      for c, d in comps.get(str(t["m_GameObject"]["fileID"]), []))
        for c, d in comps.get(str(t["m_GameObject"]["fileID"]), []):
            if c == 212:
                key = atlas.sprite(d.get("m_Sprite"))
                col = d.get("m_Color") or {}
                mats = d.get("m_Materials") or []
                mguid = mats[0].get("guid") if mats else None
                mpath = guid_index().get(mguid, "") if mguid else ""
                n["sr"] = {
                    "s": key, "o": int(d.get("m_SortingOrder", 0)), "L": LAYER_IDS.get(int(d.get("m_SortingLayerID", 0)), 2),
                    "c": [round(num(col.get(k, 1)), 3) for k in "rgba"],
                    "fx": int(d.get("m_FlipX", 0)), "fy": int(d.get("m_FlipY", 0)), "e": int(d.get("m_Enabled", 1)),
                    "add": mat_additive(mguid),
                }
                nm = atlas.names.get(key, "") if key else ""
                if n["sr"]["L"] == GIZMO_LAYER or "Control" in nm or "ffd" in nm or is_bone:
                    n["sr"]["s"] = None  # Puppet2D gizmo: hidden in game
            elif c == 95:
                n["animator"] = 1
            elif c == 114:
                guid = d["m_Script"]["guid"]
                ref = lambda k: str((d.get(k) or {}).get("fileID", 0))
                v3 = lambda k, dv: [num((d.get(k) or {}).get(a, dv[i])) for i, a in enumerate("xyz")]
                q4 = lambda k: [num((d.get(k) or {}).get(a, 0 if a != "w" else 1)) for a in "xyzw"] if d.get(k) else [0, 0, 0, 1]
                if guid == IK_SCRIPT:
                    ss = d.get("scaleStart") or [{}]
                    n["ik"] = {"t": ref("topJointTransform"), "m": ref("middleJointTransform"), "b": ref("bottomJointTransform"),
                               "f": int(d.get("Flip", 0)), "sq": int(d.get("SquashAndStretch", 0)), "sc": int(d.get("Scale", 0)),
                               "up": v3("UpDirection", [0, 0, 0]), "ss0": v3_from(ss[0] if ss else {}, [1, 1, 1]),
                               "os": v3("OffsetScale", [1, 1, 1]), "off": q4("Offset"), "multi": int(d.get("numberIkBonesIndex", 0)),
                               "end": ref("endTransform"), "start": ref("startTransform"),
                               "it": int(d.get("iterations", 10)), "damp": num(d.get("damping", 1))}
                elif guid == PC_SCRIPT:
                    n["pc"] = {"bone": "go:" + ref("bone"), "pt": int(d.get("Point", 0)), "or": int(d.get("Orient", 0)),
                               "sc": int(d.get("Scale", 0)), "cp": int(d.get("ConstrianedPosition", 0)),
                               "mo": int(d.get("MaintainOffset", 0)), "op": v3("OffsetPos", [0, 0, 0]),
                               "os": v3("OffsetScale", [1, 1, 1]), "oo": q4("OffsetOrient")}
                elif guid == GC_SCRIPT:
                    oo = d.get("OnOff")
                    n["gc"] = {"fc": int(d.get("_flipCorrection", 1)), "flip": int(d.get("flip", 0)),
                               "en": int(d.get("ControlsEnabled", 1)), "lu": int(d.get("lateUpdate", 1)),
                               "type": int(d.get("Type", 0)),
                               "onoff": [num(oo.get(a, 1)) for a in "xyzw"] if isinstance(oo, dict) else [1, 1, 1, 1]}
            elif c == 137:
                mats = d.get("m_Materials") or []
                n["skin"] = {
                    "mesh": [d["m_Mesh"].get("guid"), int(d["m_Mesh"].get("fileID", 0))],
                    "bones": [str(b["fileID"]) for b in d.get("m_Bones") or []],
                    # the layer by its id, as for sprites (m_SortingLayer is only a cached value: 0 on some prefabs, e.g.
                    # Daphne's hair and hat, which then sorted under the whole body)
                    "o": int(d.get("m_SortingOrder", 0)),
                    "L": LAYER_IDS.get(int(d["m_SortingLayerID"]), 2) if "m_SortingLayerID" in d else int(d.get("m_SortingLayer", 0)),
                    "e": int(d.get("m_Enabled", 1)),
                    "mat": mats[0].get("guid") if mats else None,
                }
        gid = str(t["m_GameObject"]["fileID"])
        if gid in psys:
            pk, pd = psys[gid]
            ex = particles.export(pd, prend.get(gid), atlas, guid_index(), mat_additive)
            if ex:
                n["ps"] = ex
        if gid in trails:
            tx = particles.export_trail(trails[gid], atlas, guid_index(), mat_additive)
            if tx:
                n["tr"] = tx
        ix = len(nodes)
        if gid in psys:
            ps_node[str(psys[gid][0])] = ix
        nodes.append(n)
        index[tid] = ix
        for fxp in spawns.get(gid, []):
            spawned_fx(fxp, ix, path, nodes, atlas)
        for ch in t.get("m_Children") or []:
            cid = str(ch["fileID"])
            if cid in tr:
                walk(cid, ix, (path + "/" if path else "") + go.get(str(tr[cid]["m_GameObject"]["fileID"]), {}).get("m_Name", "?"))

    walk(root, -1, "")
    # animation paths are relative to the Animator's GameObject
    an = next((i for i, n in enumerate(nodes) if n.pop("animator", 0)), 0)
    base = nodes[an]["path"]
    for n in nodes:
        if base and n["path"].startswith(base + "/"):
            n["path"] = n["path"][len(base) + 1:]
        elif n["path"] == base:
            n["path"] = ""
        elif base:
            n["path"] = "~" + n["path"]
    # sub-emitters: the parent's links become node indices; a sub system only plays when its parent triggers it
    for n in nodes:
        ps = n.get("ps")
        if ps and ps.get("subs"):
            ps["subs"] = [[ps_node.get(fid, -1), ty] for fid, ty in ps["subs"] if ps_node.get(fid, -1) >= 0]
            for si, _ in ps["subs"]:
                if nodes[si].get("ps"):
                    nodes[si]["ps"]["isSub"] = 1
    for n in nodes:
        if isinstance(n.get("skin"), dict):
            n["skin"]["bones"] = [index.get(b, -1) for b in n["skin"]["bones"]]
        if n.get("ik"):
            ik = n["ik"]
            for k in ("t", "m", "b", "end", "start"):
                ik[k] = index.get(ik[k], -1)
            if ik["multi"] != 1 and min(ik["t"], ik["m"], ik["b"]) < 0:
                n.pop("ik")
        if n.get("pc"):
            n["pc"]["bone"] = index.get(go_tr.get(n["pc"]["bone"][3:], ""), -1)
            if n["pc"]["bone"] < 0:
                n.pop("pc")
    return nodes


# ── animation ─────────────────────────────────────────────
def hermite(keys, t, comp=None):
    """Evaluate a Unity AnimationCurve (Hermite, or weighted Bezier when keys are weighted)."""
    def g(k, f, dv=0.0):
        v = k.get(f, dv)
        if isinstance(v, dict):
            v = v.get(comp, dv)
        return num(v)
    if t <= num(keys[0]["time"]):
        return g(keys[0], "value")
    for i in range(len(keys) - 1):
        k0, k1 = keys[i], keys[i + 1]
        t0, t1 = num(k0["time"]), num(k1["time"])
        if t0 <= t <= t1:
            dt = t1 - t0
            if dt <= 0:
                return g(k1, "value")
            v0, v1 = g(k0, "value"), g(k1, "value")
            m0, m1 = g(k0, "outSlope"), g(k1, "inSlope")
            if math.isinf(m0) or math.isinf(m1):
                return v0
            w_out = int(k0.get("weightedMode", 0)) & 2
            w_in = int(k1.get("weightedMode", 0)) & 1
            if w_out or w_in:
                wo = g(k0, "outWeight", 1 / 3) if w_out else 1 / 3
                wi = g(k1, "inWeight", 1 / 3) if w_in else 1 / 3
                return bezier(t, t0, v0, t0 + wo * dt, v0 + wo * dt * m0, t1 - wi * dt, v1 - wi * dt * m1, t1, v1)
            u = (t - t0) / dt
            u2, u3 = u * u, u * u * u
            return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 * dt + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * m1 * dt
    return g(keys[-1], "value")


def bezier(t, x0, y0, x1, y1, x2, y2, x3, y3):
    """Value of a 2D cubic Bezier at x = t (solve for the curve parameter by bisection)."""
    lo, hi = 0.0, 1.0
    for _ in range(40):
        u = (lo + hi) / 2
        x = (1 - u) ** 3 * x0 + 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u * u * x2 + u ** 3 * x3
        if x < t:
            lo = u
        else:
            hi = u
    u = (lo + hi) / 2
    return (1 - u) ** 3 * y0 + 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u * u * y2 + u ** 3 * y3


def euler_to_quat(x, y, z):
    # Unity applies Z, then X, then Y (q = qy * qx * qz)
    rx, ry, rz = (math.radians(a) / 2 for a in (x, y, z))
    qx = (math.sin(rx), 0, 0, math.cos(rx))
    qy = (0, math.sin(ry), 0, math.cos(ry))
    qz = (0, 0, math.sin(rz), math.cos(rz))
    return qmul(qmul(qy, qx), qz)


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz)


def compress(vals, width):
    frames = [tuple(vals[i:i + width]) for i in range(0, len(vals), width)]
    if all(f == frames[0] for f in frames):
        return list(frames[0])
    return vals


QUANT_KINDS = ("q", "t", "s", "ca", "cr", "cg", "cb", "mt")


def quantize_clips(clips):
    """Long continuous tracks -> uint16 over the track's own range, base64 (half the bytes of JSON numbers and
    no number parsing on phones). Step tracks (activity, flips, sprites...) stay exact."""
    import struct
    for c in clips.values():
        for t in c["tracks"]:
            d = t.get("d")
            if t.get("k") not in QUANT_KINDS or not isinstance(d, list) or len(d) <= 8:
                continue
            lo, hi = min(d), max(d)
            rng = (hi - lo) or 1.0
            q = [int(round((v - lo) / rng * 65535)) for v in d]
            t["d"] = {"b": base64.b64encode(struct.pack("<%dH" % len(q), *q)).decode(), "m": lo, "x": hi}


def build_clip(path, atlas):
    docs = load_docs(path)
    clip = next(d for c, d in docs.values() if c == 74)
    st = clip.get("m_AnimationClipSettings") or {}
    dur = max(1.0 / FPS, num(st.get("m_StopTime", 1)) - num(st.get("m_StartTime", 0)))
    n = int(round(dur * FPS)) + 1
    times = [min(dur, i / FPS) for i in range(n)]
    tracks = []

    for kind, field in (("t", "m_PositionCurves"), ("s", "m_ScaleCurves"), ("e", "m_EulerCurves"), ("q", "m_RotationCurves")):
        for c in clip.get(field) or []:
            keys = c["curve"]["m_Curve"]
            if not keys:
                continue
            vals = []
            for t in times:
                if kind == "q":
                    q = [hermite(keys, t, k) for k in "xyzw"]
                    l = math.sqrt(sum(a * a for a in q)) or 1
                    vals += [round(a / l, 5) for a in q]
                else:
                    v = [hermite(keys, t, k) for k in "xyz"]
                    if kind == "e":
                        vals += [round(a, 5) for a in euler_to_quat(*v)]
                    else:
                        vals += [round(a, 4) for a in v]
            k2 = "q" if kind in ("e", "q") else kind
            tracks.append({"p": (c.get("path") or ""), "k": k2, "d": compress(vals, 4 if k2 == "q" else 3)})

    for c in clip.get("m_FloatCurves") or []:
        attr = c.get("attribute", "")
        keys = c["curve"]["m_Curve"]
        if not keys:
            continue
        kmap = {"m_IsActive": "a", "m_Enabled": "en", "m_Color.a": "ca", "m_Color.r": "cr", "m_Color.g": "cg",
                "m_Color.b": "cb", "m_FlipX": "fx", "m_FlipY": "fy", "m_SortingOrder": "so"}
        k = kmap.get(attr)
        if attr.startswith("material.") and int(c.get("classID", 0)) in (212, 137, 23):
            prop = attr[len("material."):]
            ch = ""
            if prop[-2:] in (".r", ".g", ".b", ".a", ".x", ".y", ".z", ".w"):
                prop, ch = prop[:-2], prop[-1]
            if prop not in MAT_PROPS:
                continue
            vals = [round(hermite(keys, t), 4) for t in times]
            tracks.append({"p": (c.get("path") or ""), "k": "mt", "prop": prop, "ch": ch, "d": compress(vals, 1)})
            continue
        if int(c.get("classID", 0)) == 114:
            k = {"Flip": "ikflip", "OnOff.x": "on0", "OnOff.y": "on1", "OnOff.z": "on2", "OnOff.w": "on3"}.get(attr)
        if not k:
            continue
        if k == "en" and int(c.get("classID", 0)) != 212:
            continue
        step = k in ("a", "en", "fx", "fy", "so", "ikflip", "on0", "on1", "on2", "on3")
        vals = []
        for t in times:
            if step:
                v = num(keys[0]["value"])
                for kk in keys:
                    if num(kk["time"]) <= t + 1e-6:
                        v = num(kk["value"])
                vals.append(int(round(v)))
            else:
                vals.append(round(hermite(keys, t), 3))
        tracks.append({"p": (c.get("path") or ""), "k": k, "d": compress(vals, 1)})

    for c in clip.get("m_PPtrCurves") or []:
        if c.get("attribute") != "m_Sprite":
            continue
        ks = [(num(k["time"]), atlas.sprite(k["value"])) for k in c.get("curve") or []]
        vals = []
        for t in times:
            v = ks[0][1] if ks else None
            for kt, kv in ks:
                if kt <= t + 1e-6:
                    v = kv
            vals.append(v)
        tracks.append({"p": (c.get("path") or ""), "k": "sp", "d": vals if len(set(vals)) > 1 else vals[:1]})

    return {"dur": round(dur, 4), "n": n, "loop": int(st.get("m_LoopTime", 0)), "tracks": tracks}


LAB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lab")


def mesh_name(fbx_path, fid):
    m = yaml.load(open(fbx_path + ".meta", encoding="utf-8").read(), Loader=YLoader)
    imp = m.get("ModelImporter", {})
    names = {int(k): v for k, v in (imp.get("fileIDToRecycleName") or {}).items()}
    for e in imp.get("internalIDToNameTable") or []:
        for _, v in (e.get("first") or {}).items():
            names[int(v)] = e.get("second")
    return names.get(fid)


_mat_add = {}


def mat_additive(guid):
    """1 when the material blends additively (by blend factors or shader name)."""
    if not guid or guid.startswith("0000"):
        return 0
    if guid not in _mat_add:
        path = guid_index().get(guid)
        add = 0
        if path and path.endswith(".mat") and os.path.exists(path):
            t = open(path, encoding="utf-8", errors="ignore").read()
            m = re.search(r"_DstBlend: ([\d.]+)", t)
            sh = re.search(r"m_Shader: \{fileID: (\d+), guid: ([0-9a-f]+)", t)
            shname = os.path.basename(guid_index().get(sh.group(2), "")) if sh else ""
            # Unity built-in particle shaders: 200 Additive, 201 Additive (Soft), 10720 Mobile/Particles/Additive
            # (203 / 10721 are Alpha Blended)
            builtin_add = sh and sh.group(2).startswith("0000") and sh.group(1) in ("200", "201", "10720")
            add = 1 if (m and float(m.group(1)) == 1) or (re.search(r"add", shname, re.I) and not re.search(r"cloak", shname, re.I)) or builtin_add else 0
        _mat_add[guid] = add
    return _mat_add[guid]


def mat_texture(guid):
    path = guid_index().get(guid or "")
    if not path or not os.path.exists(path):
        return None
    m = re.search(r"_MainTex:\s*\n\s*m_Texture: \{fileID: \d+, guid: ([0-9a-f]+)", open(path, encoding="utf-8", errors="ignore").read())
    return m.group(1) if m else None


def resolve_skins(nodes, atlas, manifest):
    """Attach FBX geometry (from tools/lab/out dumps) to skinned renderer nodes."""
    missing = 0
    for n in nodes:
        sk = n.get("skin")
        if not isinstance(sk, dict):
            continue
        guid, fid = sk.pop("mesh")
        fbx = guid_index().get(guid or "")
        tex_guid = mat_texture(sk.pop("mat"))
        if not fbx or not tex_guid:
            n.pop("skin"); continue
        key = guid[:12]
        manifest[key] = fbx
        name = mesh_name(fbx, fid)
        dump_path = cache_path(os.path.join("lab", "out", key + ".json"))
        if not os.path.exists(dump_path):
            missing += 1
            n.pop("skin"); continue
        dump = json.load(open(dump_path, encoding="utf-8"))
        mesh = next((m for m in dump["meshes"] if m["name"] == name), None)
        if not mesh:
            n.pop("skin"); continue
        # FBX bone names -> prefab node indices (prefer the renderer's own bone list)
        cand = {nodes[b]["n"]: b for b in sk["bones"] if b >= 0}
        allnames = {}
        for i, x in enumerate(nodes):
            allnames.setdefault(x["n"], i)
        def side_swap(name):
            # mesh shared by mirrored renderers (e.g. left/right hair): swap the side token
            t = re.sub(r"(^|_)L(_|$)", r"@R@", name)
            t = re.sub(r"(^|_)R(_|$)", r"L", t)
            return t.replace("@R@", "R")
        bones = []
        for b in mesh["bones"]:
            i = cand.get(b)
            if i is None:
                i = cand.get(side_swap(b))
            if i is None:
                i = allnames.get(b, -1)
            bones.append(i)
        if any(i < 0 for i in bones) and len(sk["bones"]) == len(mesh["bones"]):
            # bone names differ from the prefab: Unity binds by order
            bones = list(sk["bones"])
        # FBX native units -> Unity units, from matching bone translations
        ratios = []
        for bn, bp in dump["bonePos"].items():
            i = cand.get(bn, allnames.get(bn))
            if i is None:
                continue
            lf = math.sqrt(sum(a * a for a in bp))
            lu = math.sqrt(sum(a * a for a in nodes[i]["t"]))
            if lf > 1e-4 and lu > 1e-5:
                ratios.append(lu / lf)
        # bones parented the same way in FBX and prefab give the exact unit ratio,
        # so take the most common value rather than the median
        from collections import Counter
        common = Counter(float("%.3g" % r) for r in ratios).most_common(1)
        sf = common[0][0] if common and common[0][1] >= 2 else 0.01
        sk.update({
            "tex": atlas.texture(tex_guid), "bones": bones, "sf": round(sf, 6),
            "inv": mesh["inv"], "bind": mesh["bind"], "pos": mesh["pos"], "uv": mesh["uv"],
            "idx": mesh["idx"], "si": mesh["si"], "sw": mesh["sw"],
        })
    return missing


def prune(nodes, clips):
    """Drop transforms that never render anything (UI anchors, empty groups)."""
    keep = set()
    for i, n in enumerate(nodes):
        if (n.get("sr") and n["sr"].get("s")) or isinstance(n.get("skin"), dict) or n.get("mesh"):
            keep.add(i)
            for m in n.get("mesh") or []:
                keep.update(b for b in m.get("bones", []) if b >= 0)
            if isinstance(n.get("skin"), dict):
                keep.update(b for b in n["skin"]["bones"] if b >= 0)
        if n.get("ik") or n.get("pc") or n.get("gc") or n.get("ps") or n.get("tr"):
            keep.add(i)
        if n.get("ik"):
            keep.update(n["ik"][k] for k in ("t", "m", "b", "end", "start") if n["ik"][k] >= 0)
        if n.get("pc"):
            keep.add(n["pc"]["bone"])
    for i in list(keep):
        p = nodes[i]["p"]
        while p >= 0 and p not in keep:
            keep.add(p)
            p = nodes[p]["p"]
    keep.add(0)
    order = sorted(keep)
    remap = {old: new for new, old in enumerate(order)}
    out = []
    for old in order:
        n = dict(nodes[old])
        n["p"] = remap.get(n["p"], -1)
        if isinstance(n.get("skin"), dict):
            n["skin"] = dict(n["skin"], bones=[remap.get(b, -1) for b in n["skin"]["bones"]])
        if n.get("ik"):
            n["ik"] = dict(n["ik"], **{k: remap.get(n["ik"][k], -1) for k in ("t", "m", "b", "end", "start")})
        if n.get("pc"):
            n["pc"] = dict(n["pc"], bone=remap.get(n["pc"]["bone"], -1))
        if n.get("ps") and n["ps"].get("subs"):
            n["ps"] = dict(n["ps"], subs=[[remap.get(si, -1), ty] for si, ty in n["ps"]["subs"]])
        if n.get("mesh"):
            n["mesh"] = [dict(m, bones=[remap.get(b, -1) for b in m["bones"]]) if "bones" in m else m for m in n["mesh"]]
        out.append(n)
    paths = {n["path"] for n in out}
    for c in clips.values():
        c["tracks"] = [t for t in c["tracks"] if t["p"] in paths]
    return out


SRC_ROOT_ASSETS = ROOT

MAT_PROPS = ("_Color", "_SecondColour", "_TintColor", "_AdditionalAlpha", "_cloaking_On", "_change", "_MainTex_ST")


def shader_code(name):
    """Classify the game's shaders into the colour models the web runtime implements."""
    n = name or ""
    if n in ("", "Sprites/Default", "Hidden/InternalErrorShader"):
        return "def"
    if n == "LastOne/LO_Sprite":
        return "lo"
    if "Particles/Additive" in n:
        return "padd"
    if "Particles/Alpha Blended" in n:
        return "pab"
    if "Additional_Alpha" in n or "Addittional_Alpha" in n:
        return "aa"
    if "Cloaking" in n:
        return "cloak"
    if "Hologram" in n and "add" in n.lower():
        return "holo"
    if "Distortion" in n:
        return "hide"
    if "bori_hide" in n:
        return "bori"
    return "def"


def mat_spec(mat):
    if not mat:
        return None
    code = shader_code(mat.get("shader"))
    raw = mat.get("p") or {}
    props = {k: v for k, v in raw.items() if k in MAT_PROPS}
    spec = {"sh": code, "p": props}
    if int(raw.get("_Cull", 0) or 0):  # 1 = cull front faces, 2 = cull back faces (3D effect meshes)
        spec["cull"] = int(raw["_Cull"])
    return spec


def is_additive(spec):
    return 1 if spec and spec["sh"] in ("padd", "holo") else 0


def blend_spec(mat):
    """The LO shaders' configurable blend: _Src/_Dst = One/One is additive."""
    p = (mat or {}).get("p") or {}
    return 1 if p.get("_Src") == 1 and p.get("_Dst") == 1 else 0

def unity_mesh(uid):
    return cache_path(os.path.join("unity_ref", "proj", "mesh", uid + ".json"))


def apply_unity_meshes(nodes, uid, atlas):
    """Attach skinned/static meshes exactly as exported from Unity (RefMesh)."""
    path = unity_mesh(uid)
    if not os.path.exists(path):
        return False
    data = json.load(open(path, encoding="utf-8"))
    for n in nodes:
        n.pop("skin", None)
    by_path = {}
    for i, n in enumerate(nodes):
        by_path.setdefault(n["path"], []).append(i)
    seen = {}
    for part in data["parts"]:
        key = (part["path"], part["sib"])
        if key not in seen:
            seen[key] = sum(1 for k in seen if k[0] == part["path"])
        cands = by_path.get(part["path"], [])
        if seen[key] >= len(cands):
            continue
        ni = cands[seen[key]]
        tex = -1
        if part["tex"].startswith("Assets/Ref/"):
            src = SRC_ROOT_ASSETS + "/" + part["tex"][len("Assets/Ref/"):]
            if os.path.exists(src + ".meta"):
                g = re.search(r"guid: ([0-9a-f]+)", open(src + ".meta", encoding="utf-8", errors="ignore").read())
                if g:
                    t = atlas.texture(g.group(1))
                    tex = -1 if t is None else t
        layer = LAYER_NAMES.index(part["layer"]) if part["layer"] in LAYER_NAMES else 2
        if layer == GIZMO_LAYER:
            continue
        sc = shader_code(part["shader"])
        m = {"kind": part["kind"], "e": part["on"], "L": layer, "o": part["order"],
             "add": 1 if sc in ("padd", "holo") or blend_spec(part.get("mat")) else 0,
             "col": [1, 1, 1, 1], "tex": tex, "mat": mat_spec(part.get("mat")),
             "pos": [round(x, 5) for x in part["pos"]], "uv": [round(x, 5) for x in part["uv"]], "idx": part["idx"]}
        if part["kind"] == "skin" and part.get("bones"):
            first = {}
            for i, nn in enumerate(nodes):
                first.setdefault(nn["path"], i)
            m["bones"] = [first.get(b, -1) for b in part["bones"]]
            m["si"], m["sw"] = part["si"], [round(x, 4) for x in part["sw"]]
            m["bind"] = [round(x, 6) for x in part["bind"]]
        nodes[ni].setdefault("mesh", []).append(m)
    seen = {}
    for sp in data.get("sprites", []):
        key = (sp["path"], sp["sib"])
        if key not in seen:
            seen[key] = sum(1 for k in seen if k[0] == sp["path"])
        cands = by_path.get(sp["path"], [])
        if seen[key] >= len(cands):
            continue
        sr = nodes[cands[seen[key]]].get("sr")
        spec = mat_spec(sp.get("mat"))
        if sr and spec and (spec["sh"] != "def" or spec["p"] or blend_spec(sp.get("mat"))):
            sr["mat"] = spec
            sr["add"] = 1 if is_additive(spec) or blend_spec(sp.get("mat")) else 0
    return True


def find_char(model):
    for base in CHAR_DIRS:
        for d in os.listdir(base):
            p = os.path.join(base, d, "Model_" + model + ".prefab")
            if os.path.exists(p):
                return os.path.join(base, d), p
    raise FileNotFoundError(model)


def find_anims(char_dir, model):
    folder = os.path.join(char_dir, "Model_" + model)
    anims = {}
    for dp, dn, fn in os.walk(folder):
        if os.path.basename(dp).lower() == "old":
            continue
        for f in fn:
            if f.endswith(".anim"):
                anims.setdefault(f[:-5].lower(), os.path.join(dp, f))
    out = {}
    for key, pats in CLIPS.items():
        for pat in pats:
            hit = sorted(k for k in anims if re.search(pat, k))
            if hit:
                out[key] = anims[hit[0]]
                break
    return out


def controller_anims(prefab):
    """State name -> .anim path, read from the prefab's AnimatorController."""
    text = open(prefab, encoding="utf-8", errors="ignore").read()
    m = re.search(r"m_Controller: \{fileID: \d+, guid: ([0-9a-f]+)", text)
    ctrl = guid_index().get(m.group(1)) if m else None
    out = {}
    if not ctrl:
        return out
    for cls, d in load_docs(ctrl).values():
        if cls == 1102:
            g = (d.get("m_Motion") or {}).get("guid")
            p = guid_index().get(g or "")
            if p and p.endswith(".anim"):
                out.setdefault(re.sub(r"^anim_", "", str(d.get("m_Name", "")).lower()), p)
                out.setdefault(os.path.basename(p)[:-5].lower(), p)
    return out


def pick_clips(anims):
    out = {}
    for key, pats in CLIPS.items():
        for pat in pats:
            hit = sorted(k for k in anims if re.search(pat, k))
            if hit:
                out[key] = anims[hit[0]]
                break
    return out


FORMAT = 1  # rig data format: keep equal to SD.FORMAT in js/sd.js
ATLAS_SCALE = 0.5  # the shipped atlases are at the game's display scales: desktop
MOBILE_ATLAS_SCALE = 0.35  # phones (js/sd/<id>.a35.js)


def hires_ids():
    """Bosses and the enemy base are drawn ~2-3x a unit's size: their textures keep the source resolution."""
    return {"e_EmperorChick_N", "e_Executioner_EW", "e_IronPrince_N", "e_Fortress_N", "e_Gigantes_N", "e_BigChick_N"}


def tex_image(path, hires=False):
    im = Image.open(path).convert("RGBA")
    # the Unity importer's alpha source (effect textures): 2 = alpha from grayscale, 0 = no alpha
    meta = open(path + ".meta", encoding="utf-8", errors="ignore").read() if os.path.exists(path + ".meta") else ""
    m = re.search(r"alphaSource: (\d)", meta) or re.search(r"alphaUsage: (\d)", meta)
    mode = int(m.group(1)) if m else 1
    if mode == 2:
        r, g, b, _ = im.split()
        im.putalpha(Image.merge("RGB", (r, g, b)).convert("L"))
    elif mode == 0 and not path.lower().endswith(".png"):
        im.putalpha(255)
    if TEX_SCALE != 1 and min(im.size) >= 256 and not hires:
        im = im.resize((max(1, int(im.width * TEX_SCALE)), max(1, int(im.height * TEX_SCALE))), Image.LANCZOS)
    return im


def packed_atlas(paths, hires=False):
    """One atlas per rig, packed here instead of on the phone: same shelf packing as js/sd.js packAtlas
    (tallest first, 2048 wide, white tile last), gaps so neighbours survive downscaling, saved at ATLAS_SCALE."""
    imgs = [tex_image(p, hires) for p in paths] + [Image.new("RGBA", (8, 8), (255, 255, 255, 255))]
    gap = 6
    order = sorted(range(len(imgs)), key=lambda i: -imgs[i].height)
    def shelf(W):
        pos, x, y, row = {}, 0, 0, 0
        for i in order:
            im = imgs[i]
            if x + im.width > W:
                x, y, row = 0, y + row + gap, 0
            pos[i] = (x, y)
            x += im.width + gap
            row = max(row, im.height)
        return pos, y + row
    # wider shelves until the desktop atlas fits a 4096 texture (phones and many GPUs stop there)
    W = max([im.width for im in imgs] + ([2048] if len(imgs) > 1 else [0]))
    pos, H = shelf(W)
    while H * ATLAS_SCALE > 4096 and W * 2 * ATLAS_SCALE <= 4096:
        W *= 2
        pos, H = shelf(W)
    atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rects = []
    for i, im in enumerate(imgs):
        atlas.paste(im, pos[i])
        rects.append([round(pos[i][0] / W, 6), round((H - pos[i][1] - im.height) / H, 6), round(im.width / W, 6), round(im.height / H, 6)])
    # one file per display scale (desktop 0.5, phones 0.35): the page loads only its own, no runtime downscale
    files = {}
    for tag, sc, q in (("a50", ATLAS_SCALE, 90), ("a35", MOBILE_ATLAS_SCALE, 88)):
        im = atlas.resize((max(4, round(W * sc)), max(4, round(H * sc))), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=q, method=6)
        files[tag] = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    return {"rects": rects, "s": ATLAS_SCALE, "v": [ATLAS_SCALE, MOBILE_ATLAS_SCALE]}, files


def tex_uri(path):
    im = Image.open(path).convert("RGBA")
    if TEX_SCALE != 1 and min(im.size) >= 256:
        im = im.resize((max(1, int(im.width * TEX_SCALE)), max(1, int(im.height * TEX_SCALE))), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=88, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def build(uid):
    if uid.startswith("e_"):
        model = ENEMIES[uid[2:]]
        prefab = MONSTER_DIR + "/" + model + ".prefab"
        anim_paths = pick_clips(controller_anims(prefab))
    else:
        model = UNITS.get(uid) or EXTRA[uid]
        char_dir, prefab = find_char(model)
        anim_paths = find_anims(char_dir, model)
        if "move" not in anim_paths or "idle" not in anim_paths:
            anim_paths = dict(pick_clips(controller_anims(prefab)), **anim_paths)
    atlas = Atlas()
    nodes = build_prefab(prefab, atlas)
    manifest = {}
    missing = 0
    if not apply_unity_meshes(nodes, uid, atlas):
        missing = resolve_skins(nodes, atlas, manifest)
    man_path = os.path.join(LAB, "fbx_manifest.json")
    allman = json.load(open(man_path)) if os.path.exists(man_path) else {}
    allman.update(manifest)
    os.makedirs(os.path.join(LAB, "fbx"), exist_ok=True)
    for k, p in manifest.items():
        dst = os.path.join(LAB, "fbx", k + ".fbx")
        if not os.path.exists(dst):
            import shutil
            shutil.copyfile(p, dst)
    json.dump(allman, open(man_path, "w"), indent=1)
    if missing:
        print("  %d skinned meshes waiting for FBX dumps" % missing)
    clips = {}
    for k, p in anim_paths.items():
        if k not in ("idle", "atk", "skill", "win", "move", "die"):
            continue
        try:
            clips[k] = build_clip(p, atlas)
        except Exception as e:  # keep going; a missing clip just falls back to idle
            print("  clip fail", uid, k, e)
    nodes = prune(nodes, clips)
    quantize_clips(clips)
    shots = shot_data(uid, atlas) if not uid.startswith("e_") else {}
    hits = hit_data(anim_paths, atlas) if not uid.startswith("e_") else {}
    atlas_meta, atlas_files = packed_atlas([p for _, p, _, _ in atlas.textures], uid in hires_ids())
    data = {
        "fmt": FORMAT, "id": uid, "model": model, "nodes": nodes, "clips": clips,
        "sprites": atlas.sprites, "atlas": atlas_meta,
    }
    if shots:
        data["shots"] = shots
    if hits:
        data["hits"] = hits
    # Unity's own sprite meshes (tight sheets would bleed neighbouring sprites through a full-rect quad)
    mpath = unity_mesh(uid)
    if os.path.exists(mpath):
        sm = json.load(open(mpath, encoding="utf-8")).get("spriteMesh") or {}
        data["spriteMesh"] = {k: [[round(x, 4) for x in g["v"]], [round(x, 5) for x in g["u"]], g["t"]]
                              for k, g in sm.items() if k in atlas.sprites}
    # no export: build the same meshes from the .meta outlines (Tight sprites only)
    om = {k: g for k, g in outline_meshes(atlas).items() if k not in (data.get("spriteMesh") or {})}
    if om:
        data["spriteMesh"] = dict(data.get("spriteMesh") or {}, **om)
    os.makedirs(OUT, exist_ok=True)
    js = "window.SD_DATA=window.SD_DATA||{};SD_DATA[%s]=%s;\n" % (json.dumps(uid), json.dumps(data, separators=(",", ":")))
    with open(os.path.join(OUT, uid + ".js"), "w", encoding="utf-8") as f:
        f.write(js)
    import binfiles
    for tag, uri in atlas_files.items():
        binfiles.write_rig_atlas(OUT, uid, tag, base64.b64decode(uri.split(",", 1)[1]))  # http(s)
        with open(os.path.join(OUT, "%s.%s.js" % (uid, tag)), "w", encoding="utf-8") as f:
            f.write("window.SD_ATLAS=window.SD_ATLAS||{};SD_ATLAS[%s]=%s;\n" % (json.dumps(uid + "." + tag), json.dumps(uri)))
    print("%-11s nodes=%d sprites=%d tex=%d clips=%s  %.0fKB" % (uid, len(nodes), len(atlas.sprites), len(atlas.textures),
                                                             ",".join(clips), len(js) / 1024))


if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["enemies"]:
        args = ["e_" + k for k in ENEMIES]
    ids = args or list(UNITS) + list(EXTRA) + ["e_" + k for k in ENEMIES]
    for uid in ids:
        build(uid)
    import stamp_build
    stamp_build.main()  # new data -> new service-worker cache
