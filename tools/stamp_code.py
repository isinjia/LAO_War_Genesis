"""Cache-bust the page's code: every <script src> / stylesheet <link> in index.html gets ?v=<hash of that file>,
so a changed file has a new URL and no browser or service-worker copy of the old one can be served.
Run before every push:
  python tools/stamp_code.py
"""
import hashlib
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def main():
    p = os.path.join(ROOT, "index.html")
    s = open(p, encoding="utf-8").read()
    n = 0

    def stamp(m):
        nonlocal n
        attr, path = m.group(1), m.group(2)
        f = os.path.join(ROOT, path)
        if not os.path.isfile(f):
            return m.group(0)
        n += 1
        tag = hashlib.sha1(open(f, "rb").read()).hexdigest()[:8]
        return '%s="%s?v=%s"' % (attr, path, tag)

    s = re.sub(r'(src|href)="((?:js|css)/[^"?]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"', stamp, s)
    open(p, "w", encoding="utf-8").write(s)
    print("stamped", n, "files")


if __name__ == "__main__":
    main()
