"""Name the service worker's cache after the built data, so any rebuild of rigs / effects / assets
retires the old cache (sw.js `const CACHE = ...`). The build scripts call this at the end.
  python tools/stamp_build.py
"""
import hashlib
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def main():
    h = hashlib.sha1()
    for sub in ("js/sd", "js/fx", "assets", "js/assets.js", "js/ui_assets.js"):
        p = os.path.join(ROOT, sub)
        files = [p] if os.path.isfile(p) else sorted(os.path.join(dp, f) for dp, _, fs in os.walk(p) for f in fs)
        for f in files:
            st = os.stat(f)
            h.update(("%s:%d:%d" % (os.path.relpath(f, ROOT), st.st_size, int(st.st_mtime))).encode())
    tag = h.hexdigest()[:10]
    sw = os.path.join(ROOT, "sw.js")
    s = open(sw, encoding="utf-8").read()
    s = re.sub(r"const CACHE = '[^']*';", "const CACHE = 'lao-war-genesis-%s';" % tag, s)
    open(sw, "w", encoding="utf-8").write(s)
    print("sw cache:", tag)


if __name__ == "__main__":
    main()
