import sys, re, base64, io, html
from PIL import Image, ImageOps
md, out, *imgs = sys.argv[1:]
def b64(p):
    im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
    im.thumbnail((1200, 1200))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()
lines = open(md, encoding="utf-8").read().split("\n")
title = lines[0].replace("제목:", "").strip()
body = []
for l in lines[1:]:
    if l.startswith("[확인 필요"): break
    m = re.match(r"\[사진(\d+):", l)
    if m:
        i = int(m.group(1)) - 1
        body.append(f'<p><img src="data:image/jpeg;base64,{b64(imgs[i])}" style="max-width:100%"></p>')
    elif l.strip() in ("", "---"):
        if body and body[-1] != "<p><br></p>": body.append("<p><br></p>")
    else: body.append(f"<p>{html.escape(l)}</p>")
open(out, "w", encoding="utf-8").write(f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title>
<style>body{{max-width:720px;margin:24px auto;padding:0 16px;font-family:sans-serif;line-height:1.7;background:#fff;color:#222}} p{{margin:0}} .guide{{background:#fff4d6;padding:12px;border-radius:8px;font-size:14px}}</style></head><body>
<div class="guide">제목을 복사해 블로그 제목 칸에 넣고, 아래 회색 선 밑의 본문을 처음부터 끝까지 드래그(또는 Ctrl+A 후 이 안내와 제목은 지우기) → Ctrl+C → 네이버 블로그 본문에 Ctrl+V</div>
<h2>{html.escape(title)}</h2><hr>
{chr(10).join(body)}
</body></html>""")
print(out)
