"""Unity ParticleSystem -> compact JSON for the web particle player (js/particles.js).

The characters' attack effects (muzzle fire, hit bursts, smoke, trails...) are ParticleSystems nested in the model
prefab and switched on by the attack clips (m_IsActive). build_sd.py calls export() for each one; the node keeps it
as n["ps"] and the page plays it whenever the node becomes active (Unity's playOnAwake).

Curves ("mm", MinMaxCurve):   {"m": state, "s": scalar, "a": minScalar, "c": [[t, v, in, out]...], "d": [...]}
  state 0 constant, 1 curve * scalar, 2 random between two curves, 3 random between two constants
Gradients ("mg", MinMaxGradient): {"m": state, "c0": rgba, "c1": rgba, "g0": grad, "g1": grad}
  state 0 colour, 1 gradient, 2 random between two colours, 3 random between two gradients, 4 random colour
  grad = {"c": [[t, r, g, b]...], "a": [[t, a]...], "f": fixed-mode}
"""
import math
import os
import re


def num(v, dv=0.0):
    if v is None:
        return dv
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if s in ("Infinity", "inf"):
        return math.inf
    if s in ("-Infinity", "-inf"):
        return -math.inf
    try:
        return float(s)
    except ValueError:
        return dv


def _f(v):
    v = num(v)
    if math.isinf(v):
        return 1e9 if v > 0 else -1e9
    return round(v, 4)


def keys(curve):
    out = []
    for k in (curve or {}).get("m_Curve") or []:
        out.append([_f(k.get("time")), _f(k.get("value")), _f(k.get("inSlope")), _f(k.get("outSlope"))])
    return out


def mm(c, dv=0.0):
    if not isinstance(c, dict):
        return {"m": 0, "s": dv}
    st = int(num(c.get("minMaxState"), 0))
    o = {"m": st, "s": _f(c.get("scalar", dv))}
    if st in (1, 2):
        o["c"] = keys(c.get("maxCurve"))
    if st == 2:
        o["d"] = keys(c.get("minCurve"))
    if st == 3:
        o["a"] = _f(c.get("minScalar", 0))
    return o


def col(c):
    c = c or {}
    return [round(num(c.get(k, 1)), 3) for k in "rgba"]


def grad(g):
    g = g or {}
    nc, na = int(num(g.get("m_NumColorKeys"), 2)), int(num(g.get("m_NumAlphaKeys"), 2))
    ck = [[round(num(g.get("ctime%d" % i)) / 65535, 4)] + col(g.get("key%d" % i))[:3] for i in range(nc)]
    ak = [[round(num(g.get("atime%d" % i)) / 65535, 4), col(g.get("key%d" % i))[3]] for i in range(na)]
    return {"c": ck, "a": ak, "f": int(num(g.get("m_Mode"), 0))}


def mg(c):
    if not isinstance(c, dict):
        return {"m": 0, "c0": [1, 1, 1, 1]}
    st = int(num(c.get("minMaxState"), 0))
    o = {"m": st}
    if st in (0, 2):
        o["c0"] = col(c.get("maxColor"))
    if st == 2:
        o["c1"] = col(c.get("minColor"))
    if st in (1, 3, 4):
        o["g0"] = grad(c.get("maxGradient"))
    if st == 3:
        o["g1"] = grad(c.get("minGradient"))
    return o


def v3(d, dv=(0, 0, 0)):
    d = d or {}
    return [round(num(d.get(a, dv[i])), 4) for i, a in enumerate("xyz")]


def mat_props(path):
    """_MainTex guid, _TintColor (Unity particle shaders multiply by 2 * tint), shader file name."""
    if not path or not os.path.exists(path):
        return None, None, ""
    t = open(path, encoding="utf-8", errors="ignore").read()
    m = re.search(r"_MainTex:\s*\n\s*m_Texture: \{fileID: \d+, guid: ([0-9a-f]+)", t)
    tint = None
    tm = re.search(r"- _TintColor: \{r: ([\d.e-]+), g: ([\d.e-]+), b: ([\d.e-]+), a: ([\d.e-]+)\}", t)
    if tm:
        tint = [round(float(x), 3) for x in tm.groups()]
    else:
        cm = re.search(r"- _Color: \{r: ([\d.e-]+), g: ([\d.e-]+), b: ([\d.e-]+), a: ([\d.e-]+)\}", t)
        if cm:
            tint = [round(float(x), 3) for x in cm.groups()]
            tint = [tint[0] * 0.5, tint[1] * 0.5, tint[2] * 0.5, tint[3] * 0.5]  # _Color is not doubled: store as tint/2
    sh = re.search(r"m_Shader: \{fileID: (\d+), guid: ([0-9a-f]+)", t)
    return (m.group(1) if m else None), tint, (sh.group(2) if sh else "")


def export(ps, rend, atlas, guid_index, mat_additive):
    """One ParticleSystem (+ its renderer) -> dict, or None when it never draws."""
    if not ps or not rend or not int(num(rend.get("m_Enabled"), 1)):
        return None
    mats = rend.get("m_Materials") or []
    mguid = mats[0].get("guid") if mats else None
    tex_guid, tint, _ = mat_props(guid_index.get(mguid or "", ""))
    t = atlas.texture(tex_guid) if tex_guid else None
    if t is None:
        return None
    im = ps.get("InitialModule") or {}
    # a full-screen flash / dimmer (huge quad, e.g. Cyclops Princess's "white"): not part of the unit, as SCREEN_FX
    sz = mm(im.get("startSize"), 1)
    if max(abs(sz.get("s", 0)), abs(sz.get("a", 0))) >= 400:
        return None
    o = {
        "dur": _f(ps.get("lengthInSec", 5)), "loop": int(num(ps.get("looping"), 0)),
        "pre": int(num(ps.get("prewarm"), 0)), "awake": int(num(ps.get("playOnAwake"), 1)),
        "delay": mm(ps.get("startDelay")), "space": int(num(ps.get("moveWithTransform"), 0)),
        "sim": _f(ps.get("simulationSpeed", 1)), "scl": int(num(ps.get("scalingMode"), 1)),
        "life": mm(im.get("startLifetime"), 5), "speed": mm(im.get("startSpeed"), 5), "size": mm(im.get("startSize"), 1),
        "s3": int(num(im.get("size3D"), 0)), "sy": mm(im.get("startSizeY"), 1),
        "rot": mm(im.get("startRotation")), "color": mg(im.get("startColor")), "grav": mm(im.get("gravityModifier")),
        "max": int(num(im.get("maxNumParticles"), 1000)), "rdir": _f(im.get("randomizeRotationDirection", 0)),
    }
    em = ps.get("EmissionModule") or {}
    if int(num(em.get("enabled"), 1)):
        bursts = []
        for b in em.get("m_Bursts") or []:
            if "countCurve" in b:
                cc = mm(b.get("countCurve"))
            else:  # older serialisation: minCount / maxCount
                cc = {"m": 3, "s": _f(b.get("maxCount", 0)), "a": _f(b.get("minCount", 0))}
            bursts.append({"t": _f(b.get("time", 0)), "n": cc, "cyc": int(num(b.get("cycleCount"), 1)),
                           "iv": _f(b.get("repeatInterval", 0.01)), "p": _f(b.get("probability", 1))})
        o["emit"] = {"rate": mm(em.get("rateOverTime")), "dist": mm(em.get("rateOverDistance")), "b": bursts}
    else:
        o["emit"] = {"rate": {"m": 0, "s": 0}, "b": []}
    sh = ps.get("ShapeModule") or {}
    if int(num(sh.get("enabled"), 1)):
        rad = sh.get("radius")
        arc = sh.get("arc")
        o["shape"] = {
            "type": int(num(sh.get("type"), 4)), "angle": _f(sh.get("angle", 25)), "len": _f(sh.get("length", 5)),
            "r": _f(rad.get("value", 1) if isinstance(rad, dict) else rad if rad is not None else 1),
            "rt": _f(sh.get("radiusThickness", 1)),
            "arc": _f(arc.get("value", 360) if isinstance(arc, dict) else arc if arc is not None else 360),
            "pos": v3(sh.get("m_Position")), "rotd": v3(sh.get("m_Rotation")), "sc": v3(sh.get("m_Scale"), (1, 1, 1)),
            "box": v3(sh.get("boxThickness")), "rd": _f(sh.get("randomDirectionAmount", 0)),
            "sd": _f(sh.get("sphericalDirectionAmount", 0)), "align": int(num(sh.get("alignToDirection"), 0)),
        }
    mods = [("ColorModule", "col", lambda m: mg(m.get("gradient"))),
            ("SizeModule", "sz", lambda m: {"c": mm(m.get("curve"), 1), "y": mm(m.get("y"), 1), "sep": int(num(m.get("separateAxes"), 0))}),
            ("RotationModule", "rv", lambda m: mm(m.get("curve"))),
            ("VelocityModule", "vel", lambda m: {"x": mm(m.get("x")), "y": mm(m.get("y")), "z": mm(m.get("z")),
                                                 "w": int(num(m.get("inWorldSpace"), 0))}),
            ("ForceModule", "frc", lambda m: {"x": mm(m.get("x")), "y": mm(m.get("y")), "z": mm(m.get("z")),
                                              "w": int(num(m.get("inWorldSpace"), 0))}),
            ("ClampVelocityModule", "clamp", lambda m: {"mag": mm(m.get("magnitude"), 1), "damp": _f(m.get("dampen", 0)),
                                                        "drag": mm(m.get("drag"))}),
            ("UVModule", "uv", lambda m: {"tx": int(num(m.get("tilesX"), 1)), "ty": int(num(m.get("tilesY"), 1)),
                                          "anim": int(num(m.get("animationType"), 0)), "row": int(num(m.get("rowIndex"), 0)),
                                          "rr": int(num(m.get("randomRow"), 0)) if "randomRow" in m else int(num(m.get("rowMode"), 0) == 1),
                                          "fot": mm(m.get("frameOverTime"), 1), "sf": mm(m.get("startFrame")),
                                          "cyc": _f(m.get("cycles", 1)), "mode": int(num(m.get("mode"), 0)),
                                          "tm": int(num(m.get("timeMode"), 0)), "fps": _f(m.get("fps", 30))})]
    for key, short, fn in mods:
        m = ps.get(key) or {}
        if int(num(m.get("enabled"), 0)):
            o[short] = fn(m)
    o["r"] = {
        "t": t, "add": mat_additive(mguid), "tint": tint, "mode": int(num(rend.get("m_RenderMode"), 0)),
        "ls": _f(rend.get("m_LengthScale", 2)), "vs": _f(rend.get("m_VelocityScale", 0)),
        "so": int(num(rend.get("m_SortingOrder"), 0)), "maxs": _f(rend.get("m_MaxParticleSize", 0.5)),
        "align": int(num(rend.get("m_RenderAlignment"), 0)), "piv": v3(rend.get("m_Pivot")),
        "flip": v3(rend.get("m_Flip")),
    }
    sub = ps.get("SubModule") or {}
    if int(num(sub.get("enabled"), 0)):
        o["subs"] = [[str((s.get("emitter") or {}).get("fileID", 0)), int(num(s.get("type"), 0))]
                     for s in sub.get("subEmitters") or []]
    return o
