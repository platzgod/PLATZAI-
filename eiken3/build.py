"""app.html（Artifact 用の本文）から、ブラウザで直接開ける index.html を作る。"""
from pathlib import Path

here = Path(__file__).resolve().parent
body = (here / "app.html").read_text(encoding="utf-8")
head = (
    '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);"
    "padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}"
    "[hidden]{display:none!important}</style></head><body>\n"
)
(here / "index.html").write_text(head + body + "\n</body></html>\n", encoding="utf-8")
print("wrote", here / "index.html")
