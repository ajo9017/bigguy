// 게임 콘텐츠/밸런스 데이터. 새 적·웨이브·능력 추가나 수치 조정은 여기서 한다.
// 거리 단위: 기둥 반지름(arena.radius) 기준 월드 좌표. 시간 단위: 초.
// 넉백은 (knockback * (1 + 피해% / 80) / mass) 로 계산된다. 처치는 오직 낙하로만.
window.GAME_DATA = {
  arena: { radius: 320 },

  // 게임 안 '개선 요청' 채팅이 이슈를 만드는 GitHub 저장소
  feedback: { repo: 'ajo9017/bigguy' },

  player: {
    radius: 34,
    mass: 1.6,
    speed: 230,
    // 공격 하나뿐. 연속 3타째가 강타(finisher)
    attack: { range: 78, arc: 110, damage: 6, knockback: 420, duration: 0.24, active: [0.05, 0.14], comboWindow: 0.45, finisherMul: 2.0, lunge: 70 },
  },

  // behavior: 'walker' = 다가와서 휘두르기, 'charger' = 멀리서 조준 후 돌진
  enemies: {
    grunt: {
      name: '졸개', color: '#7bc96f', radius: 20, mass: 1, speed: 110, behavior: 'walker', score: 100,
      attack: { range: 44, windup: 0.45, recover: 0.6, damage: 8, force: 520 },
    },
    charger: {
      name: '돌격병', color: '#f2a33a', radius: 22, mass: 1.1, speed: 90, behavior: 'charger', score: 150, horn: true,
      attack: { range: 230, windup: 0.7, dashSpeed: 620, dashTime: 0.5, recover: 0.9, damage: 12, force: 760 },
    },
    brute: {
      name: '덩치', color: '#9a6bd6', radius: 32, mass: 3, speed: 65, behavior: 'walker', score: 300, teeth: true,
      attack: { range: 62, windup: 0.8, recover: 1.0, damage: 18, force: 900 },
    },
  },

  // 웨이브 클리어 때 3개 중 하나를 고르는 특수능력. lv 배열 길이 = 최대 레벨(3).
  // lv[n]은 레벨 n+1일 때의 값이고, desc는 그 값을 받아 설명을 만든다. 효과 구현은 game.js에서 id로 찾는다.
  abilities: [
    { id: 'iron_fist',   icon: '👊', name: '강철 주먹',   lv: [1.2, 1.4, 1.65],  desc: v => `공격 넉백 x${v}` },
    { id: 'pump',        icon: '💪', name: '근육 펌핑',   lv: [1.3, 1.6, 2.0],   desc: v => `공격으로 올리는 피해% x${v}` },
    { id: 'heavy',       icon: '🪨', name: '묵직한 몸',   lv: [1.25, 1.5, 1.8],  desc: v => `몸무게 x${v} (덜 날아감)` },
    { id: 'quick_feet',  icon: '👟', name: '날쌘 발',     lv: [1.12, 1.24, 1.36], desc: v => `이동 속도 x${v}` },
    { id: 'long_reach',  icon: '🦍', name: '긴 팔',       lv: [1.15, 1.3, 1.45], desc: v => `공격 사거리 x${v}` },
    { id: 'wide_swing',  icon: '🌀', name: '넓은 스윙',   lv: [30, 60, 90],      desc: v => `공격 범위 각도 +${v}°` },
    { id: 'rapid',       icon: '⚡', name: '연타',        lv: [1.15, 1.3, 1.45], desc: v => `공격 속도 x${v}` },
    { id: 'tough',       icon: '🛡️', name: '맷집',        lv: [0.85, 0.72, 0.6], desc: v => `받는 피해% x${v}` },
    { id: 'grip',        icon: '🦶', name: '발끝 버티기', lv: [0.8, 0.65, 0.5],  desc: v => `가장자리 근처에서 받는 넉백 x${v}` },
    { id: 'recovery',    icon: '🍙', name: '주먹밥',      lv: [20, 35, 50],      desc: v => `웨이브 클리어 때 피해% -${v} (선택 즉시도 회복)` },
    { id: 'cyclone',     icon: '🌪️', name: '회오리 펀치', lv: [1, 1.15, 1.3],    desc: v => v > 1 ? `3타째가 360° 회전 공격 (범위 x${v})` : '3타째가 360° 회전 공격' },
    { id: 'shockwave',   icon: '💥', name: '충격파',      lv: [120, 150, 185],   desc: v => `3타째 끝에 반경 ${v} 충격파` },
    { id: 'counter',     icon: '🔥', name: '분노 반격',   lv: [500, 700, 900],   desc: v => `맞으면 주변 적을 날려버림 (힘 ${v})` },
    { id: 'thorns',      icon: '🌵', name: '가시 근육',   lv: [8, 14, 20],       desc: v => `나를 때린 적 피해% +${v}, 튕겨냄` },
    { id: 'bowling',     icon: '🎳', name: '볼링',        lv: [1.4, 1.8, 2.2],   desc: v => `날아간 적끼리 부딪힐 때 충격 x${v}` },
    { id: 'bounty',      icon: '💰', name: '현상금',      lv: [1.25, 1.5, 2.0],  desc: v => `낙하 처치 점수 x${v}` },
    { id: 'intimidate',  icon: '😠', name: '위압감',      lv: [1.2, 1.4, 1.6],   desc: v => `적의 공격 준비 시간 x${v}` },
    { id: 'roar',        icon: '📣', name: '기합',        lv: [8, 6, 4.5],       desc: v => `${v}초마다 기합으로 주변 적을 밀어냄` },
    { id: 'adrenaline',  icon: '❤️‍🔥', name: '아드레날린', lv: [3, 6, 10],        desc: v => `적이 떨어질 때마다 피해% -${v}` },
    { id: 'second_wind', icon: '🪽', name: '낙법',        lv: [1, 2, 3],         desc: v => `떨어져도 기둥으로 복귀 (총 ${v}회)` },
    // every초마다 lv초 동안 몸집이 scale배: 사거리, 넉백, 몸무게도 같은 배율로 커진다
    { id: 'giant',       icon: '🗿', name: '거대화',      lv: [4, 6, 8], every: 15, scale: 1.6, desc: v => `15초마다 ${v}초간 거대화 (크기·힘·무게 x1.6)` },
  ],

  // 웨이브별 등장 마릿수. 마지막 웨이브 이후에는 endlessScale 배율로 계속 늘어난다.
  waves: [
    { grunt: 3 },
    { grunt: 5 },
    { grunt: 4, charger: 2 },
    { grunt: 5, charger: 2, brute: 1 },
    { grunt: 6, charger: 3, brute: 2 },
  ],
  // 회복 아이템: every 웨이브마다 한 번(3, 6, 9...), 웨이브 시작 delay초 뒤 기둥 위에 떨어진다. 주우면 피해% -heal
  meat: { every: 3, delay: 5, heal: 40, radius: 20 },

  endlessScale: 1.25,
  spawnInterval: 0.9,
  maxAlive: 7,
};
