"""Render the original game's NGUI panel prefabs to PNG (reference images for the web UI).

NGUI's scripts are not in the asset dump, so widgets are recognised by their serialized fields:
UISprite (mAtlas + mSpriteName), UILabel (mText), UITexture (mTexture), UIPanel (mClipping/mAlpha).
Positions are the authored transforms (anchors were already resolved when the prefab was saved).

  python tools/ui_ref/ngui.py Panel_StageBattle [Panel_MissionComplete ...]
  python tools/ui_ref/ngui.py --sprites BattleAtlas      # contact sheet of an atlas with sprite names
"""
import json
import os
import re
import sys

import yaml
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = "E:/LAO_Google_QA/Assets"
OUT = os.path.join(HERE, "out")
W, H = 1920, 1080  # UIRoot content size used by the game (16:9)

YL = getattr(yaml, "CSafeLoader", yaml.SafeLoader)
HDR = re.compile(r"^--- !u!(\d+) &(-?\d+).*$", re.M)
_gi = None


def guid_index():
    global _gi
    if _gi is None:
        cache = os.path.join(HERE, "guid_index.json")
        if os.path.exists(cache):
            _gi = json.load(open(cache, encoding="utf-8"))
        else:
            _gi = {}
            for base in ("AssetBundleResource", "AssetBundleResourceSub", "font", "Resources", "GraphicResources"):
                for dp, _, fn in os.walk(os.path.join(ROOT, base)):
                    for f in fn:
                        if f.endswith(".meta"):
                            with open(os.path.join(dp, f), encoding="utf-8", errors="ignore") as h:
                                h.readline()
                                m = re.search(r"guid: ([0-9a-f]+)", h.readline())
                                if m:
                                    _gi[m.group(1)] = os.path.join(dp, f[:-5]).replace("\\", "/")
            json.dump(_gi, open(cache, "w", encoding="utf-8"))
    return _gi


def load_docs(path):
    text = open(path, encoding="utf-8", errors="ignore").read()
    text = "\n".join(l for l in text.split("\n") if not l.startswith("%"))
    parts = HDR.split(text)
    docs = {}
    for i in range(1, len(parts), 3):
        try:
            d = yaml.load(parts[i + 2], Loader=YL)
        except Exception:
            continue
        if isinstance(d, dict) and d:
            docs[parts[i + 1]] = (int(parts[i]), list(d.values())[0])
    return docs


# ── atlases ──────────────────────────────────────────────
_atlas = {}
_img = {}


def image(path):
    if path not in _img:
        _img[path] = Image.open(path).convert("RGBA") if path and os.path.exists(path) else None
    return _img[path]


def atlas(guid):
    """NGUI UIAtlas prefab → {name: sprite}, image."""
    if guid in _atlas:
        return _atlas[guid]
    path = guid_index().get(guid)
    res = None
    if path and path.endswith(".prefab"):
        for cls, d in load_docs(path).values():
            if cls != 114 or "mSprites" not in d and "mReplacement" not in d:
                continue
            rep = (d.get("mReplacement") or {}).get("guid")
            if rep and not d.get("mSprites"):
                res = atlas(rep)
                break
            mat = guid_index().get((d.get("material") or {}).get("guid", ""))
            tex = None
            if mat:
                m = re.search(r"_MainTex:\s*\n\s*m_Texture: \{fileID: \d+, guid: ([0-9a-f]+)", open(mat, encoding="utf-8", errors="ignore").read())
                tex = guid_index().get(m.group(1)) if m else None
            sprites = {s["name"]: s for s in d.get("mSprites") or []}
            res = {"img": image(tex), "sprites": sprites, "path": path}
            break
    _atlas[guid] = res
    return res


def sprite_img(at, name):
    s = at["sprites"].get(name) if at else None
    if not s or at["img"] is None:
        return None, None
    x, y, w, h = int(s["x"]), int(s["y"]), int(s["width"]), int(s["height"])
    return at["img"].crop((x, y, x + w, y + h)), s


def nine(src, s, w, h, fill_center=True):
    """NGUI sliced sprite."""
    w, h = max(1, int(round(w))), max(1, int(round(h)))
    bl, br, bt, bb = int(s.get("borderLeft", 0)), int(s.get("borderRight", 0)), int(s.get("borderTop", 0)), int(s.get("borderBottom", 0))
    sw, sh = src.size
    if not (bl or br or bt or bb):
        return src.resize((w, h), Image.BILINEAR)
    k = min(1.0, w / max(1, bl + br), h / max(1, bt + bb))
    dl, dr, dt, db = int(bl * k), int(br * k), int(bt * k), int(bb * k)
    out = Image.new("RGBA", (w, h))
    xs = [(0, bl, 0, dl), (bl, sw - br, dl, w - dr), (sw - br, sw, w - dr, w)]
    ys = [(0, bt, 0, dt), (bt, sh - bb, dt, h - db), (sh - bb, sh, h - db, h)]
    for j, (sy0, sy1, dy0, dy1) in enumerate(ys):
        for i, (sx0, sx1, dx0, dx1) in enumerate(xs):
            if i == 1 and j == 1 and not fill_center:
                continue
            if sx1 <= sx0 or sy1 <= sy0 or dx1 <= dx0 or dy1 <= dy0:
                continue
            out.paste(src.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.BILINEAR), (dx0, dy0))
    return out


def tint(im, c, alpha=1.0):
    r, g, b, a = (c.get("r", 1), c.get("g", 1), c.get("b", 1), c.get("a", 1)) if isinstance(c, dict) else c
    a *= alpha
    if (r, g, b, a) == (1, 1, 1, 1):
        return im
    ch = im.split()
    lut = lambda f: [min(255, int(i * f)) for i in range(256)]
    return Image.merge("RGBA", (ch[0].point(lut(r)), ch[1].point(lut(g)), ch[2].point(lut(b)), ch[3].point(lut(a))))


# ── fonts ────────────────────────────────────────────────
FALLBACK = ROOT + "/font/GodoB.ttf"
_fonts = {}


def font(guid, size, bold):
    path = guid_index().get(guid or "", "")
    if not path.lower().endswith((".ttf", ".otf")):
        path = FALLBACK
    key = (path, size)
    if key not in _fonts:
        try:
            _fonts[key] = ImageFont.truetype(path, max(6, int(size)))
        except Exception:
            _fonts[key] = ImageFont.truetype(FALLBACK, max(6, int(size)))
    return _fonts[key]


BB = re.compile(r"\[[0-9a-fA-F]{6,8}\]|\[-\]|\[/?[bisu]\]|\[/?c\]|\[sub\]|\[/sub\]|\[sup\]|\[/sup\]")

PIV = {0: (0, 1), 1: (0.5, 1), 2: (1, 1), 3: (0, 0.5), 4: (0.5, 0.5), 5: (1, 0.5), 6: (0, 0), 7: (0.5, 0), 8: (1, 0)}


def render(name, out=None, size=(W, H), only=None, scale=1.0):
    path = ROOT + "/AssetBundleResource/UI/" + name + ".prefab"
    if not os.path.exists(path):
        found = [p for g, p in guid_index().items() if p.endswith("/" + name + ".prefab")]
        path = found[0] if found else path
    docs = load_docs(path)
    go = {k: d for k, (c, d) in docs.items() if c == 1}
    tr = {k: d for k, (c, d) in docs.items() if c in (4, 224) and "m_GameObject" in d}
    comps = {}
    for k, (c, d) in docs.items():
        if c == 114 and "m_GameObject" in d:
            comps.setdefault(str(d["m_GameObject"]["fileID"]), []).append(d)
    roots = [k for k, d in tr.items() if int(d["m_Father"]["fileID"]) == 0]
    items = []

    def walk(tid, M, active, panel_depth, alpha, path):
        t = tr[tid]
        g = go.get(str(t["m_GameObject"]["fileID"]), {})
        nm = str(g.get("m_Name", "?"))
        act = active and int(g.get("m_IsActive", 1)) == 1
        p, s = t["m_LocalPosition"], t["m_LocalScale"]
        q = t["m_LocalRotation"]
        import math
        ang = 2 * math.atan2(q["z"], q["w"])  # 2D z rotation only
        ca, sa = math.cos(ang), math.sin(ang)
        a, b, c, d, e, f = M
        # M * T * R * S
        tx, ty = a * p["x"] + c * p["y"] + e, b * p["x"] + d * p["y"] + f
        na, nb = (a * ca + c * sa) * s["x"], (b * ca + d * sa) * s["x"]
        nc, nd = (-a * sa + c * ca) * s["y"], (-b * sa + d * ca) * s["y"]
        M2 = (na, nb, nc, nd, tx, ty)
        cs = comps.get(str(t["m_GameObject"]["fileID"]), [])
        for cpt in cs:
            if "mClipping" in cpt and "mAlpha" in cpt:  # UIPanel
                panel_depth = int(cpt.get("mDepth", 0))
                alpha = alpha * float(cpt.get("mAlpha", 1))
            elif "mAlpha" in cpt and "mWidgets" in cpt:
                alpha = alpha * float(cpt.get("mAlpha", 1))
        if act:
            for cpt in cs:
                if "mWidth" in cpt and "mPivot" in cpt and int(cpt.get("m_Enabled", 1)):
                    items.append((panel_depth, int(cpt.get("mDepth", 0)), len(items), M2, cpt, alpha, path + "/" + nm))
        for ch in t.get("m_Children") or []:
            if str(ch["fileID"]) in tr:
                walk(str(ch["fileID"]), M2, act, panel_depth, alpha, path + "/" + nm)

    for r in roots:
        walk(r, (scale, 0, 0, -scale, size[0] / 2, size[1] / 2), True, 0, 1.0, "")
    items.sort(key=lambda x: (x[0], x[1], x[2]))
    canvas = Image.new("RGBA", size, (22, 24, 28, 255))
    log = []
    for pd, dp, _, M, w, alpha, wpath in items:
        if only and not re.search(only, wpath):
            continue
        a, b, c, d, e, f = M
        sx, sy = (a * a + b * b) ** 0.5, (c * c + d * d) ** 0.5
        ww, hh = float(w["mWidth"]), float(w["mHeight"])
        px, py = PIV.get(int(w["mPivot"]), (0.5, 0.5))
        x0, y0 = -px * ww, -py * hh  # widget-local rect
        col = w.get("mColor") or {}
        if col.get("a", 1) * alpha <= 0.003:
            continue
        el = None
        if "mSpriteName" in w:
            at = atlas((w.get("mAtlas") or {}).get("guid", ""))
            src, sp = sprite_img(at, w.get("mSpriteName"))
            if src is None:
                continue
            typ = int(w.get("mType", 0))
            W_, H_ = max(1, int(round(ww * sx))), max(1, int(round(hh * sy)))
            if typ == 1 or typ == 4:  # sliced / advanced
                el = nine(src, sp, ww, hh, int(w.get("mFillCenter", 1)) == 1).resize((W_, H_), Image.BILINEAR)
            elif typ == 2:  # tiled
                el = Image.new("RGBA", (int(ww), int(hh)))
                for yy in range(0, int(hh), max(1, src.height)):
                    for xx in range(0, int(ww), max(1, src.width)):
                        el.paste(src, (xx, yy))
                el = el.resize((W_, H_))
            else:
                el = src.resize((W_, H_), Image.BILINEAR)
                if typ == 3 and float(w.get("mFillAmount", 1)) < 1:  # filled (horizontal/vertical approximation)
                    fa = float(w.get("mFillAmount", 1))
                    fd = int(w.get("mFillDirection", 0))
                    m = Image.new("L", el.size, 0)
                    dr = ImageDraw.Draw(m)
                    if fd == 1:
                        dr.rectangle((0, el.height * (1 - fa), el.width, el.height), fill=255)
                    else:
                        dr.rectangle((0, 0, el.width * fa, el.height), fill=255)
                    el.putalpha(Image.composite(el.split()[3], Image.new("L", el.size, 0), m))
            flip = int(w.get("mFlip", 0))
            if flip in (1, 3):
                el = el.transpose(Image.FLIP_LEFT_RIGHT)
            if flip in (2, 3):
                el = el.transpose(Image.FLIP_TOP_BOTTOM)
            el = tint(el, col, alpha)
        elif "mTexture" in w:
            tpath = guid_index().get((w.get("mTexture") or {}).get("guid", ""))
            src = image(tpath)
            if src is None:
                continue
            r = w.get("mRect") or {"x": 0, "y": 0, "width": 1, "height": 1}
            iw, ih = src.size
            cx0, cy0 = r["x"] * iw, (1 - r["y"] - r["height"]) * ih
            src = src.crop((int(cx0), int(cy0), int(cx0 + r["width"] * iw), int(cy0 + r["height"] * ih)))
            el = tint(src.resize((max(1, int(ww * sx)), max(1, int(hh * sy))), Image.BILINEAR), col, alpha)
        elif "mText" in w:
            text = BB.sub("", str(w.get("mText") or ""))
            if not text.strip():
                continue
            fs = float(w.get("mFontSize", 20)) * sy
            fnt = font((w.get("mTrueTypeFont") or {}).get("guid"), fs, int(w.get("mFontStyle", 0)) & 1)
            el = Image.new("RGBA", (max(1, int(ww * sx)), max(1, int(hh * sy))))
            dr = ImageDraw.Draw(el)
            al = int(w.get("mAlignment", 0))
            ha = {0: px, 1: 0, 2: 0.5, 3: 1, 4: 0}.get(al, px)
            lines = text.split("\n")
            lh = fs * 1.15 + float(w.get("mSpacingY", 0)) * sy
            th = lh * len(lines)
            ty = (el.height - th) * (1 - py)
            eff = int(w.get("mEffectStyle", 0))
            ec = w.get("mEffectColor") or {"r": 0, "g": 0, "b": 0, "a": 1}
            fill = tuple(int(255 * col.get(k, 1)) for k in "rgb") + (int(255 * col.get("a", 1) * alpha),)
            efill = tuple(int(255 * ec.get(k, 0)) for k in "rgb") + (int(255 * ec.get("a", 1) * alpha),)
            for i, ln in enumerate(lines):
                tw = dr.textlength(ln, font=fnt)
                tx = (el.width - tw) * ha
                yy = ty + i * lh
                if eff == 1:
                    dr.text((tx + 1, yy + 1), ln, font=fnt, fill=efill)
                elif eff >= 2:
                    dr.text((tx, yy), ln, font=fnt, fill=fill, stroke_width=max(1, int(fs / 14)), stroke_fill=efill)
                dr.text((tx, yy), ln, font=fnt, fill=fill)
        if el is None:
            continue
        # place: widget-local rect corner (x0, y0+hh) is the top-left in screen space
        X = a * x0 + c * (y0 + hh) + e
        Y = b * x0 + d * (y0 + hh) + f
        if a < 0:
            el = el.transpose(Image.FLIP_LEFT_RIGHT); X -= el.width
        if d > 0:
            el = el.transpose(Image.FLIP_TOP_BOTTOM); Y -= el.height
        if abs(b) > 1e-3:  # rotated widget
            import math
            deg = math.degrees(math.atan2(b, a))
            cxw, cyw = X + el.width / 2, Y + el.height / 2
            el = el.rotate(deg, expand=True, resample=Image.BILINEAR)
            X, Y = cxw - el.width / 2, cyw - el.height / 2
        canvas.alpha_composite(el, (int(round(X)), int(round(Y)))) if 0 <= int(X) < size[0] and 0 <= int(Y) < size[1] else _paste_clip(canvas, el, int(round(X)), int(round(Y)))
        log.append("%d %d %s" % (pd, dp, wpath))
    os.makedirs(OUT, exist_ok=True)
    out = out or os.path.join(OUT, name + ".png")
    canvas.convert("RGB").save(out)
    open(out[:-4] + ".txt", "w", encoding="utf-8").write("\n".join(log))
    return out


def _paste_clip(canvas, el, X, Y):
    x0, y0 = max(0, X), max(0, Y)
    x1, y1 = min(canvas.width, X + el.width), min(canvas.height, Y + el.height)
    if x1 <= x0 or y1 <= y0:
        return
    canvas.alpha_composite(el.crop((x0 - X, y0 - Y, x1 - X, y1 - Y)), (x0, y0))


def contact(atlas_name, cols=10, cell=180):
    """Sheet of every sprite in an atlas with its name (for picking UI pieces)."""
    p = ROOT + "/AssetBundleResource/Atlas/" + atlas_name + ".prefab"
    g = re.search(r"guid: ([0-9a-f]+)", open(p + ".meta").read()).group(1)
    at = atlas(g)
    names = sorted(at["sprites"])
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * (cell + 16)), (40, 42, 48, 255))
    dr = ImageDraw.Draw(sheet)
    fnt = ImageFont.truetype(FALLBACK, 11)
    for i, n in enumerate(names):
        im, s = sprite_img(at, n)
        x, y = (i % cols) * cell, (i // cols) * (cell + 16)
        if im is not None:
            k = min((cell - 8) / max(1, im.width), (cell - 8) / max(1, im.height), 1)
            t = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))))
            sheet.alpha_composite(t, (x + (cell - t.width) // 2, y + (cell - t.height) // 2))
        dr.text((x + 3, y + cell + 1), "%s %dx%d" % (n[:24], int(s["width"]), int(s["height"])), font=fnt, fill=(230, 230, 230, 255))
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, "atlas_" + atlas_name + ".png")
    sheet.convert("RGB").save(out)
    return out


if __name__ == "__main__":
    a = sys.argv[1:]
    if a and a[0] == "--sprites":
        for n in a[1:]:
            print(contact(n))
    else:
        for n in a:
            print(render(n))
