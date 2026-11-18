"""
첫 화면 글꼴 파일 다시 만들기 (docs/performance.md 3번, src/styles/fonts.css).
@fontsource-variable 원본(npm 패키지)에서 쓰는 굵기·글자만 남겨 src/assets/fonts/에 저장한다.

  python -m pip install fonttools brotli
  python scripts/build-fonts.py

  Bricolage Grotesque (여행자 제목): 굵기 600~700만, 광학 크기(opsz) 축은 그대로, 영문·숫자·문장부호만
  Inter (영문 본문): 굵기 400~800만, 같은 글자 범위 (한글은 Pretendard가 그린다)
글자 범위(U)를 바꾸면 fonts.css의 unicode-range도 똑같이 바꾼다.
"""
import io
import os
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

U = "U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2013-2014,U+2018-201E,U+2020-2022,U+2026,U+2030,U+2039-203A,U+20AC,U+2122,U+2190-2193,U+2212"
FEATURES = ["kern", "liga", "calt", "tnum", "case", "ccmp", "locl", "mark", "mkmk"]
FONTS = [
    ("node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2", {"wght": (600, 700)}, "src/assets/fonts/bricolage-latin-600-700.woff2"),
    ("node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", {"wght": (400, 800)}, "src/assets/fonts/inter-latin-400-800.woff2"),
]

for src, limits, out in FONTS:
    font = instancer.instantiateVariableFont(TTFont(src), limits)
    # 굵기 범위를 줄인 뒤 한 번 저장했다 다시 읽어야 글자 줄이기(subset)가 깨지지 않는다
    buf = io.BytesIO()
    font.save(buf)
    buf.seek(0)
    font = TTFont(buf)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = FEATURES
    opts.notdef_outline = True
    opts.name_IDs = ["*"]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(U))
    sub.subset(font)
    subset.save_font(font, out, opts)
    print(f"{out}: {os.path.getsize(src):,} -> {os.path.getsize(out):,} bytes")
