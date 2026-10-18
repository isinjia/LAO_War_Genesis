"""Binary side files served over http(s) next to the data scripts (file:// keeps using the base64 scripts).

Rig atlases:   js/sd/<id>.<a35|a50>.webp
Baked effects: js/fx/<name>.m.js (metadata, no payload) + <name>.webp / .h.webp (atlas, desktop / phones) + <name>.bin
               .bin = positions int16 | uvs uint16 | indices uint16 | colours uint8, offsets in "bo" (2-byte aligned)
"""
import io
import json
import os

from PIL import Image

GPU_MAX = 4096  # the page never uploads a larger texture


def atlas_variants(raw_webp):
    """Effect atlas files at upload size: <name>.webp (desktop, capped at GPU_MAX) and <name>.h.webp (phones, half):
    the page uploads them as they are, with no main-thread canvas downscale."""
    im = Image.open(io.BytesIO(raw_webp))
    out = []
    for suffix, k in ((".webp", 1.0), (".h.webp", 0.5)):
        k = min(k, GPU_MAX / max(im.size))
        if k >= 0.999:
            out.append((suffix, raw_webp))
            continue
        small = im.convert("RGBA").resize((max(4, round(im.width * k)), max(4, round(im.height * k))), Image.LANCZOS)
        buf = io.BytesIO()
        small.save(buf, "WEBP", quality=90, method=6)
        out.append((suffix, buf.getvalue()))
    return out


def write_rig_atlas(out_dir, uid, tag, raw_webp):
    with open(os.path.join(out_dir, "%s.%s.webp" % (uid, tag)), "wb") as f:
        f.write(raw_webp)


def write_fx(out_dir, name, data, raw_atlas, bins):
    """bins: {"p","u","c","i"} raw bytes. Returns the bytes written."""
    order = ("p", "u", "i", "c")  # 2-byte types first: every view starts on an even offset
    bo, off = {}, 0
    for k in order:
        bo[k] = [off, len(bins[k])]
        off += len(bins[k])
    meta = {k: v for k, v in data.items() if k not in ("atlas", "bin")}
    meta["bo"] = bo
    js = "window.FX_DATA=window.FX_DATA||{};FX_DATA[%s]=%s;\n" % (json.dumps(name), json.dumps(meta, separators=(",", ":")))
    with open(os.path.join(out_dir, name + ".m.js"), "w", encoding="utf-8") as f:
        f.write(js)
    for suffix, data_ in atlas_variants(raw_atlas):
        with open(os.path.join(out_dir, name + suffix), "wb") as f:
            f.write(data_)
    with open(os.path.join(out_dir, name + ".bin"), "wb") as f:
        for k in order:
            f.write(bins[k])
    return len(js) + len(raw_atlas) + off
