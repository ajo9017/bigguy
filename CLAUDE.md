# BIG GUY

원기둥 위에서 적을 때리고 밀쳐 떨어뜨리는 2D 웹 게임. 빌드 과정 없이 `index.html`을 브라우저로 열면 바로 실행된다.
`main` 브랜치에 push하면 GitHub Pages(https://ajo9017.github.io/bigguy/)에 1~2분 뒤 자동 배포된다.

## 구조
- `index.html`: 캔버스, 시작/게임오버/능력 선택/기록/개선 요청 화면, 모바일 터치 버튼
- `data.js`: 콘텐츠와 밸런스 데이터(플레이어 수치, 적 종류, 웨이브, 특수능력 21종, 회복 고기). 새 적, 웨이브, 능력은 여기에 추가한다
- `game.js`: 게임 로직과 렌더링. 외부 라이브러리는 쓰지 않는다

## 규칙
- 콘텐츠 추가는 되도록 `data.js`만 수정한다. 새로운 행동 패턴이 필요할 때만 `game.js`를 고친다(적은 `updateEnemy`의 behavior, 능력은 `ab('id')`로 값을 읽는 곳)
- 모바일(터치)과 PC(키보드) 조작을 둘 다 유지한다. 공격 버튼은 하나만 둔다(밀치기는 너무 강해서 뺐다)
- 핵심 규칙: 피해%가 높을수록 넉백이 커진다(스매시브라더스 방식). 적 처치와 게임오버는 오직 기둥에서 떨어질 때만 일어난다
- 능력은 웨이브 클리어 때 3개 중 하나를 고르고, 같은 능력은 최대 Lv3까지 오른다
- 개인 기록(최고 점수, 플레이 횟수, 최근 30판)과 이름은 브라우저 localStorage(`bigguy.records`, `bigguy.name`)에 저장된다. 기기마다 따로 저장된다
- 전체 랭킹은 Supabase `scores` 표(name, score, wave, kills, created_at)에 저장된다. 접속 정보는 `data.js`의 `ranking`. publishable 키는 공개용이고, RLS로 읽기와 추가만 허용한다(수정, 삭제 불가). 다른 사람의 이름을 화면에 넣을 때는 반드시 textContent를 쓴다. secret 키는 절대 코드에 넣지 않는다
- 게임이 끝나면 골드를 얻고(`data.js`의 `gold`), 골드로 캐릭터 10종(`data.js`의 `characters`)을 산다. 캐릭터마다 시작 능력 1개, 공격 수치 덮어쓰기(`attack`), 외형(`look`)이 있다. 골드/보유/선택은 localStorage(`bigguy.gold`, `bigguy.chars`, `bigguy.char`)에 저장된다. 새 캐릭터는 `characters`에 추가한다
- 주인공은 레퍼런스(머리띠, 흰 핫피, 근육질 아저씨)를 바탕으로 캔버스 도형으로 그린다(`drawPlayer`). 나중에 스프라이트 이미지로 교체할 수 있다

## 개선 요청
게임 안 '💬 개선 요청' 버튼은 제목이 `[요청]`으로 시작하는 GitHub 이슈 작성 페이지를 연다.
열린 이슈 중 `[요청]` 이슈가 플레이어의 개선 요청이다.
- 자동 반영: `.github/workflows/requests.yml`이 저장소 주인(ajo9017)의 `[요청]` 이슈는 열리자마자, 다른 사람 것은 주인이 `반영` 댓글을 달면 Claude로 반영해서 `main`에 push한다. Secret `CLAUDE_CODE_OAUTH_TOKEN` 또는 `ANTHROPIC_API_KEY`가 필요하다
- 상태 라벨: `작업중`(자동 반영 진행 중), `일부 반영`(남은 부분 있음). 다 반영되면 커밋의 `Closes #번호`로 이슈가 닫힌다. 게임의 개선 요청 창 아래 '요청 현황'이 이 상태를 보여준다
- 수동 반영: "요청 처리해줘"라고 하면 `.claude/skills/requests` 스킬대로 확인 질문 없이 반영, 테스트, push까지 한다.
