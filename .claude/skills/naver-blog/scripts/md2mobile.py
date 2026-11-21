"""블로그 글(.md)을 휴대폰용 '복사 버튼' 페이지(Artifact용 HTML 조각)로 만든다.

사용: python3 -I md2mobile.py 글.md 출력.html 사진1.jpg 사진2.jpg ...
글은 [사진N: 설명] 줄을 기준으로 나눈다. N번째 구역 = 사진N 바로 앞에 붙일 글.
'[확인 필요' 로 시작하는 줄부터는 페이지 맨 아래 메모로만 보여준다.
"""
import sys, re, base64, io, html, json
from PIL import Image, ImageOps

md, out, *imgs = sys.argv[1:]


def thumb(p):
    im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
    im.thumbnail((360, 360))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=72)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def tidy(lines):
    text, blank = [], False
    for l in lines:
        if l.strip() in ("", "---"):
            if text and not blank:
                text.append("")
            blank = True
        else:
            text.append(l)
            blank = False
    while text and text[-1] == "":
        text.pop()
    return "\n".join(text)


raw = open(md, encoding="utf-8").read().split("\n")
title = raw[0].replace("제목:", "").strip()
lines, notes = [], []
for i, l in enumerate(raw[1:]):
    if l.startswith("[확인 필요"):
        notes = [x.lstrip("- ").strip() for x in raw[i + 2:] if x.strip()]
        break
    lines.append(l)

# 구역 나누기: (글, 뒤에 오는 사진 번호 또는 None)
chunks, cur, photos = [], [], []
for l in lines:
    m = re.match(r"\[사진(\d+):\s*(.*?)\]", l.strip())
    if m:
        chunks.append((tidy(cur), int(m.group(1)), m.group(2)))
        cur = []
    else:
        cur.append(l)
chunks.append((tidy(cur), None, ""))

# 사진만 연달아 있는 곳은 글이 비므로 앞 구역에 사진을 묶는다
steps = []
for text, n, desc in chunks:
    if not text and steps and n:
        steps[-1]["photos"].append((n, desc))
        continue
    steps.append({"text": text, "photos": [(n, desc)] if n else []})

full = tidy(lines)
total = len(imgs)

E = html.escape
parts = []
for i, s in enumerate(steps):
    ps = s["photos"]
    if ps:
        nums = ", ".join(str(n) for n, _ in ps)
        where = f"사진 {nums} 위에 붙여넣기"
    else:
        where = "마지막 사진 아래에 붙여넣기"
    figs = "".join(
        f'<figure><img src="{thumb(imgs[n-1])}" alt="사진 {n}: {E(d)}" loading="lazy"><figcaption>사진 {n} · {E(d)}</figcaption></figure>'
        for n, d in ps if 0 < n <= total
    )
    parts.append(f'''<section class="step" id="s{i+1}">
  <div class="head"><span class="no">{i+1}/{len(steps)}</span><span class="where">{E(where)}</span>
  <button type="button" class="copy" data-k="{i}">복사</button></div>
  <p class="text">{E(s["text"])}</p>
  {f'<div class="figs">{figs}</div>' if figs else ''}
</section>''')

data = json.dumps({"title": title, "full": full, "steps": [s["text"] for s in steps]}, ensure_ascii=False).replace("</", "<\\/")
note_html = "".join(f"<li>{E(n)}</li>" for n in notes)

page = f'''<title>{E(title.split("|")[0].strip())} 블로그 복사</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap">
<style>
/* 한 줄 세로 흐름: 단계마다 '어디에 붙일지 → 복사 → 글 → 사진 미리보기' */
:root {{
  --bg: #fbf8f6; --surface: #ffffff; --fg: #261d1b; --muted: #77675f;
  --line: #eadfd9; --accent: #b3352c; --accent-fg: #ffffff; --done: #2f7a4f;
  --font: "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg: #1a1513; --surface: #241d1a; --fg: #f3ebe7; --muted: #b09f97;
  --line: #3a2f2b; --accent: #e0625a; --accent-fg: #1a1513; --done: #6cc391; color-scheme: dark }} }}
:root[data-theme="dark"] {{
  --bg: #1a1513; --surface: #241d1a; --fg: #f3ebe7; --muted: #b09f97;
  --line: #3a2f2b; --accent: #e0625a; --accent-fg: #1a1513; --done: #6cc391; color-scheme: dark }}
body {{ background: var(--bg); color: var(--fg); font-family: var(--font); font-size: 15px; line-height: 1.7;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 20px 48px; }}
main {{ max-width: 640px; margin: 0 auto; display: grid; gap: 20px; }}
h1 {{ font-size: 20px; line-height: 1.4; margin: 0; text-wrap: balance; }}
.how {{ margin: 0; padding: 0 0 0 20px; color: var(--muted); font-size: 14px; display: grid; gap: 4px; }}
.bar {{ display: flex; flex-wrap: wrap; gap: 8px; }}
button {{ font: inherit; font-weight: 700; border: 0; border-radius: 10px; padding: 10px 16px; cursor: pointer;
  background: var(--accent); color: var(--accent-fg); min-height: 44px; }}
button.ghost {{ background: transparent; color: var(--accent); box-shadow: inset 0 0 0 1.5px var(--accent); }}
button.ok {{ background: var(--done); color: var(--accent-fg); }}
button:focus-visible {{ outline: 3px solid var(--fg); outline-offset: 2px; }}
.step {{ background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: grid; gap: 10px; min-width: 0; }}
.step.used {{ opacity: .6; }}
.head {{ display: flex; align-items: center; gap: 10px; }}
.no {{ font-size: 12px; font-weight: 700; color: var(--muted); font-variant-numeric: tabular-nums; letter-spacing: .02em; }}
.where {{ flex: 1; min-width: 0; font-weight: 700; font-size: 14px; }}
.text {{ margin: 0; white-space: pre-wrap; word-break: keep-all; overflow-wrap: anywhere; }}
.figs {{ display: flex; gap: 8px; overflow-x: auto; }}
figure {{ margin: 0; flex: 0 0 auto; width: 120px; }}
figure img {{ width: 120px; height: 120px; object-fit: cover; border-radius: 8px; display: block; }}
figcaption {{ font-size: 12px; color: var(--muted); line-height: 1.4; margin-top: 4px; }}
.notes {{ font-size: 13px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 12px; }}
.notes ul {{ margin: 4px 0 0; padding-left: 18px; }}
.toast {{ position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  background: var(--fg); color: var(--bg); padding: 8px 16px; border-radius: 999px; font-size: 14px; }}
@media (prefers-reduced-motion: no-preference) {{ .step {{ transition: opacity .2s; }} }}
</style>
<main>
  <h1>{E(title)}</h1>
  <ol class="how">
    <li>블로그 앱 글쓰기에서 사진 {total}장을 1번부터 순서대로 한 번에 넣어요 (개별사진).</li>
    <li>아래 단계마다 <b>복사</b>를 누르고, 적힌 사진 위에 붙여넣어요.</li>
    <li>붙여넣은 단계는 흐리게 바뀌어요.</li>
  </ol>
  <div class="bar">
    <button type="button" class="ghost" id="copyTitle">제목 복사</button>
    <button type="button" class="ghost" id="copyAll">글 전체 복사</button>
  </div>
  {"".join(parts)}
  {f'<div class="notes"><b>올리기 전에 확인</b><ul>{note_html}</ul></div>' if note_html else ''}
</main>
<div class="toast" id="toast" hidden></div>
<script>
const D = {data};
const toast = document.getElementById("toast");
let t;
function show(msg) {{ toast.textContent = msg; toast.hidden = false; clearTimeout(t); t = setTimeout(() => toast.hidden = true, 1600); }}
function fallback(text) {{
  const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", "");
  ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
  let ok = false; try {{ ok = document.execCommand("copy"); }} catch (e) {{}}
  ta.remove(); return ok;
}}
function copy(text, btn, label) {{
  const done = () => {{ show(label + " 복사했어요"); if (btn) {{ btn.textContent = "복사됨"; btn.classList.add("ok"); }} }};
  const fail = () => {{ fallback(text) ? done() : show("복사가 막혔어요. 글을 길게 눌러 직접 복사해 주세요"); }};
  try {{ navigator.clipboard.writeText(text).then(done, fail); }} catch (e) {{ fail(); }}
}}
document.querySelectorAll(".copy").forEach(b => b.addEventListener("click", () => {{
  const k = +b.dataset.k; copy(D.steps[k], b, (k + 1) + "단계");
  b.closest(".step").classList.add("used");
}}));
document.getElementById("copyTitle").addEventListener("click", e => copy(D.title, e.currentTarget, "제목"));
document.getElementById("copyAll").addEventListener("click", e => copy(D.full, e.currentTarget, "글 전체"));
</script>
'''
open(out, "w", encoding="utf-8").write(page)
print(out, len(steps), "단계")
