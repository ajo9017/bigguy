# BIG GUY 아트 스타일: 과장된 개그 도트

결정: 2026-11-07. 근육 아저씨가 적을 기둥 밖으로 날려버리는 순간이 3초짜리 숏폼에서 웃기게 보이는 것을 최우선으로 한다.
근육은 **개그**로만 쓴다. 노출이나 성적인 연출은 하지 않는다(광고 거절, 스팀 노출 제한으로 마케팅비가 오른다).

## 고정 규격 (모든 그림이 지켜야 함)
| 항목 | 규칙 |
|---|---|
| 캔버스 | 일반 적 32×32, 주인공·덩치 48×48, 보스 96×96 (px) |
| 팔레트 | [ENDESGA 32](https://lospec.com/palette-list/endesga-32) 32색만 사용 |
| 외곽선 | 1px, `#181425` (순수 검정 금지) |
| 명암 | 광원은 왼쪽 위. 색 하나당 최대 3단계 |
| 시점 | 정면 기준 살짝 위에서 내려다본 3/4 시점, 기본은 오른쪽을 봄 (왼쪽은 좌우 반전) |
| 금지 | 안티앨리어싱, 흐림, 그라데이션, 반투명 픽셀, 점 크기가 섞인 "가짜 도트" |
| 배경 | 투명 PNG. AI로 그릴 때는 단색 마젠타 `#FF00FF` 배경으로 받은 뒤 지운다 |
| 게임 표시 | 정수 배율 확대(nearest neighbor)만 쓴다. 회전·찌그러뜨리기는 개그 연출(피격, 낙하)에만 |

## 캐릭터 비율과 개그 규칙
- 주인공: 2.5등신. 몸통이 키의 절반, 팔뚝이 머리만큼 굵고, 다리는 짧고 가늘다
- 표정은 과하게: 평소엔 자신만만한 씩 웃음, 맞으면 `> <` 눈 + 크게 벌린 입 + 땀방울
- 적은 동그란 몸 + 화난 눈썹. 날아갈 때 표정이 웃겨야 한다

## 프레임 목록 (주인공)
idle 2, walk 4, punch 3(준비, 뻗기, 회수), hurt 2, fall 1. 한 줄 스프라이트 시트, 프레임 간격 일정하게.

## GPT 프롬프트

### 1. 주인공 기준 그림 (가장 먼저, 마음에 들 때까지 반복)
```
Pixel art game character sprite in a comedy/gag style.
A ridiculously muscular middle-aged Japanese festival guy: huge chest and arms, tiny short legs,
short black hair, white hachimaki headband with a knot, open white happi coat with navy collar trim,
white shorts, black socks, stubble, smug confident grin, rosy cheeks. Fully clothed, not sexy, just funny.
Proportions: 2.5 heads tall, the torso is half of the body height.
Facing right, slightly top-down 3/4 view.
Exactly 48x48 pixel sprite, shown scaled up with nearest-neighbor: every pixel crisp and the same size,
no anti-aliasing, no blur, no gradients.
1-pixel dark outline (#181425), light from the top-left, at most 3 shades per color, ENDESGA 32 palette only.
Solid flat #FF00FF magenta background. One character centered, nothing else in the image.
```

### 2. 주인공 동작 시트 (1번 그림을 첨부해서)
```
Using the attached character EXACTLY (same pixel size, same palette, same proportions and outfit),
make a sprite sheet: one row of 6 frames, each 48x48 pixels, evenly spaced:
1 idle, 2 walk A, 3 walk B, 4 punch wind-up, 5 punch fully extended, 6 hurt
(eyes squeezed shut like > <, mouth wide open, sweat drops flying).
Same rules: crisp pixels, no anti-aliasing, #181425 outline, solid #FF00FF background.
```

### 3. 적 3종 (1번 그림을 첨부해서)
```
In the same pixel art style as the attached hero (same pixel size, palette, outline, lighting),
draw 3 enemy sprites in one row, each centered in its own cell:
1) Grunt, 32x32: small round green blob creature with angry eyebrows and tiny fists.
2) Charger, 32x32: round orange guy with a single bone horn on top, determined squint, leaning forward.
3) Brute, 48x48: big round purple bruiser with two lower fangs and thick eyebrows.
All facing right, slightly top-down 3/4 view, funny angry faces.
Crisp pixels, no anti-aliasing, #181425 outline, solid #FF00FF background.
```

## 화풍 유지 요령
- 새 그림을 요청할 때마다 **마음에 든 기준 그림(1번 결과)을 첨부**하고 "same style as attached"를 넣는다
- AI 결과는 보정 도구로 정확한 격자와 ENDESGA 32 팔레트로 맞춘 뒤 `art/` 아래에 저장한다
