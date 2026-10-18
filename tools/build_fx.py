"""Convert Unity-baked projectile / effect sequences (tools/unity_ref/proj/fx/*.json) into
js/fx/<name>.js for the web runtime (js/fxbake.js).

Each frame becomes two triangle lists (normal / additive blend) with positions in
projectile-local units, uvs remapped into one packed atlas and premixed vertex colours.
"""
import base64
import io
import json
import os
import re
import struct
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
# Unity-baked dumps and usage table: made by the defence project's Unity pass (same source assets)
REF = os.path.join(HERE, "unity_ref") if os.path.exists(os.path.join(HERE, "unity_ref", "fx_meta.json")) else r"E:/LAO_MINI_GAME/5_LAO_Defence/tools/unity_ref"
SRC = os.path.join(REF, "proj", "fx")
ASSETS = r"E:/LAO_Google_QA/Assets"
OUT = os.path.join(HERE, "..", "js", "fx")
MAX_TEX = 1024
BIG = 1_500_000      # packed bytes above which an effect is baked at half its frame rate
GROUPS = ("rn", "n", "ra", "a")


FORMAT = 1  # baked effect data format: keep equal to FXB.FORMAT in js/fxbake.js

def blend_of(shader):
    if re.search(r"Additive|Clipping_ColorChange", shader or ""):
        return "a"
    return "n"


def load_tex(path):
    if not path.startswith("Assets/Ref/"):
        return None
    src = ASSETS + "/" + path[len("Assets/Ref/"):]
    if not os.path.exists(src):
        return None
    im = Image.open(src).convert("RGBA")
    # honour the Unity importer's alpha source (0 none, 1 from input, 2 from grayscale)
    meta = open(src + ".meta", encoding="utf-8", errors="ignore").read() if os.path.exists(src + ".meta") else ""
    m = re.search(r"alphaSource: (\d)", meta) or re.search(r"alphaUsage: (\d)", meta)
    mode = int(m.group(1)) if m else 1
    if mode == 2:
        r, g, b, _ = im.split()
        im.putalpha(Image.merge("RGB", (r, g, b)).convert("L"))
    elif mode == 0:
        im.putalpha(255)
    if max(im.size) > MAX_TEX:
        k = MAX_TEX / max(im.size)
        im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
    return im


def pack(images):
    """Shelf-pack images; returns atlas image and per-image (u0, v0, su, sv) in GL uv space."""
    white = Image.new("RGBA", (8, 8), (255, 255, 255, 255))
    imgs = [im or white for im in images] + [white]
    order = sorted(range(len(imgs)), key=lambda i: -imgs[i].height)
    W = max(256, max(im.width for im in imgs) + 4)
    if sum(im.width * im.height for im in imgs) > W * W:
        W = min(2048, max(W, int((sum(im.width * im.height for im in imgs)) ** 0.5) + 64))
    GAP = 2  # texels between packed textures (uvs map exactly, no inset)
    pos, x, y, rowh = {}, 0, 0, 0
    for i in order:
        im = imgs[i]
        if x + im.width > W:
            x, y, rowh = 0, y + rowh + GAP, 0
        pos[i] = (x, y)
        x += im.width + GAP
        rowh = max(rowh, im.height)
    H = y + rowh
    atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rects = []
    for i, im in enumerate(imgs):
        px, py = pos[i]
        atlas.paste(im, (px, py))
        # same texel centres as sampling the texture on its own
        rects.append((px / W, (H - py - im.height) / H, im.width / W, im.height / H))
    return atlas, rects


def build(name):
    d = json.load(open(os.path.join(SRC, name + ".json"), encoding="utf-8"))
    images = [load_tex(t) for t in d["textures"]]
    atlas, rects = pack(images)
    white = rects[-1]
    frames = []
    for fr in d["frames"]:
        out = {g: [[], [], [], []] for g in ("n", "a", "rn", "ra")}  # pos, uv, col, idx; r* = trails
        for it in fr:
            b = blend_of(d["shaders"][it["s"]])
            if "Distortion" in d["shaders"][it["s"]]:
                continue
            tgt = out[("r" + b) if it.get("tr") else b]
            base = len(tgt[0]) // 2
            r = rects[it["t"]] if images[it["t"]] is not None else white
            k = list(it["k"])
            v, u, c = it["v"], it["u"], it["c"]
            for j in range(len(v) // 2):
                tgt[0] += [round(v[j * 2], 4), round(v[j * 2 + 1], 4)]
                uu, vv = u[j * 2], u[j * 2 + 1]
                if images[it["t"]] is None:
                    uu, vv = 0.5, 0.5
                tgt[1] += [round(r[0] + uu * r[2], 5), round(r[1] + vv * r[3], 5)]
                # colour and alpha are stored at half scale (material colour/opacity = 2) so 2x tints survive
                # and the product is clamped by the GPU after multiplying, as in Unity
                tgt[2] += [min(255, int(c[j * 4] * k[0] / 2)), min(255, int(c[j * 4 + 1] * k[1] / 2)),
                           min(255, int(c[j * 4 + 2] * k[2] / 2)), min(255, int(c[j * 4 + 3] * k[3] / 2))]
            tgt[3] += [base + i for i in it["i"]]
        frames.append(out)
    buf = io.BytesIO()
    atlas.save(buf, "WEBP", quality=90, method=6)
    fps, org = d["fps"], d.get("org", [])
    packed = pack_frames(frames)
    step = 1
    if sum(len(v) for v in packed[0].values()) > BIG:
        # heavy smoke / debris: every other frame (playback indexes frames by time * fps)
        frames, fps, org, step = frames[::2], fps / 2, org[::2], 2
        packed = pack_frames(frames)
    bins, table, scale = packed
    data = {"fmt": FORMAT, "name": name, "mode": d["mode"], "T": d["T"], "dist": d["dist"], "fps": fps,
            "cx": d["cx"], "cy": d["cy"], "half": d["half"], "org": org, "scale": scale, "step": step,
            "atlas": "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode(),
            "nf": len(frames), "tab": table, "bin": {k: base64.b64encode(v).decode() for k, v in bins.items()}}
    os.makedirs(OUT, exist_ok=True)
    js = "window.FX_DATA=window.FX_DATA||{};FX_DATA[%s]=%s;\n" % (json.dumps(name), json.dumps(data, separators=(",", ":")))
    open(os.path.join(OUT, name + ".js"), "w", encoding="utf-8").write(js)  # file://
    import binfiles
    binfiles.write_fx(OUT, name, data, buf.getvalue(), bins)  # http(s): .m.js + .webp + .bin
    return len(js)


def pack_frames(frames):
    """Binary frames for the GPU as-is: positions int16 (normalised by `scale`), uvs uint16, colours uint8,
    indices uint16; per frame and group a table row [vertexOffset, vertexCount, indexOffset, indexCount]."""
    import math
    fin = lambda v: v if math.isfinite(v) else 0.0  # a few Unity bakes contain NaN vertices: collapse them
    scale = max([abs(fin(v)) for f in frames for g in GROUPS for v in f[g][0]] + [1e-6])
    P, U, C, I = bytearray(), bytearray(), bytearray(), bytearray()
    table, nv, ni = [], 0, 0
    for f in frames:
        row = []
        for g in GROUPS:
            pos, uv, col, idx = f[g]
            n = len(pos) // 2
            if not idx:
                row.append(0)
                continue
            assert n < 65536
            P += struct.pack("<%dh" % len(pos), *[max(-32767, min(32767, int(round(fin(v) / scale * 32767)))) for v in pos])
            U += struct.pack("<%dH" % len(uv), *[max(0, min(65535, int(round(fin(v) * 65535)))) for v in uv])
            C += bytes(max(0, min(255, int(v))) for v in col)
            I += struct.pack("<%dH" % len(idx), *idx)
            row.append([nv, n, ni, len(idx)])
            nv += n
            ni += len(idx)
        table.append(row)
    return {"p": bytes(P), "u": bytes(U), "c": bytes(C), "i": bytes(I)}, table, round(scale, 5)


if __name__ == "__main__":
    meta_all = json.load(open(os.path.join(REF, "fx_meta.json")))
    sys.path.insert(0, HERE)
    from roster import UNITS
    # this game's roster: every effect its attack / skill clips throw, and the hits of those projectiles
    used = {n for n, us in meta_all["uses"].items() if any(u[0] in UNITS for u in us)}
    used |= {meta_all["meta"][n]["hit"] for n in list(used) if meta_all["meta"].get(n, {}).get("hit")}
    names = sys.argv[1:] or sorted(n for n in used if os.path.exists(os.path.join(SRC, n + ".json")))
    total = 0
    for n in names:
        total += build(n)
    meta = meta_all
    # file sizes let the game skip the heaviest effects on phones before downloading them
    meta["size"] = {os.path.splitext(f)[0]: os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith(".js") and not f.endswith(".m.js") and not f.startswith("_")}
    open(os.path.join(OUT, "_meta.js"), "w", encoding="utf-8").write("window.FX_META=" + json.dumps(meta) + ";\n")
    print("fx:", len(names), "%.1f MB" % (total / 1e6))
    import stamp_build
    stamp_build.main()  # new data -> new service-worker cache
