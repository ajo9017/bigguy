// 게임 콘텐츠/밸런스 데이터. 새 적·웨이브·능력 추가나 수치 조정은 여기서 한다.
// 거리 단위: 기둥 반지름(arena.radius) 기준 월드 좌표. 시간 단위: 초.
// 넉백은 (knockback * (1 + 피해% / 80) / mass) 로 계산된다. 처치는 오직 낙하로만.
window.GAME_DATA = {
  arena: { radius: 320 },

  // 게임 안 '개선 요청' 채팅이 이슈를 만드는 GitHub 저장소
  // fn: 요청을 GitHub 이슈로 만들어 주는 Supabase Edge Function (supabase/functions/request)
  feedback: { repo: 'ajo9017/bigguy', fn: 'https://dpogvzcepzgjixfitcjm.supabase.co/functions/v1/clever-api' },

  // 전체 랭킹 저장소(Supabase). publishable 키는 공개용이고, 표는 읽기/추가만 허용된다(RLS)
  ranking: { url: 'https://dpogvzcepzgjixfitcjm.supabase.co', key: 'sb_publishable_A83NtpfCdZGCbVG8Q5DOHQ_Et4zovtQ', top: 30 },

  player: {
    radius: 34,
    mass: 1.6,
    speed: 230,
    // 공격 하나뿐. 연속 3타째가 강타(finisher)
    attack: { range: 78, arc: 110, damage: 6, knockback: 420, duration: 0.24, active: [0.05, 0.14], comboWindow: 0.45, finisherMul: 2.0, lunge: 70 },
    // 대시 버튼(PC: L / Shift): cooldown초마다 time초 동안 speed로 돌진하고 그동안 무적. 대시 능력(dash_*)이 수치를 바꾼다
    dash: { cooldown: 5, time: 0.18, speed: 1100, inv: 0.1 },
  },

  // behavior: 'walker' = 다가와서 휘두르기, 'charger' = 멀리서 조준 후 돌진
  // 그리기 옵션: horn(뿔), teeth(송곳니), spikes(가시), crown(왕관), square(네모 몸통)
  enemies: {
    grunt: {
      name: '졸개', color: '#e0453a', square: true, radius: 20, mass: 1, speed: 110, behavior: 'walker', score: 100,
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

    // 새 몬스터: 웨이브가 진행되면서 차례로 등장한다 (waves 참고)
    runner: {
      name: '날쌘이', color: '#6fd6c9', radius: 16, mass: 0.7, speed: 190, behavior: 'walker', score: 120,
      attack: { range: 38, windup: 0.3, recover: 0.5, damage: 6, force: 440 },
    },
    tank: {
      name: '철갑병', color: '#8a96a8', radius: 27, mass: 4, speed: 55, behavior: 'walker', score: 350,
      attack: { range: 56, windup: 0.9, recover: 1.1, damage: 14, force: 800 },
    },
    rusher: {
      name: '번개 돌격병', color: '#f2d23a', radius: 20, mass: 0.9, speed: 100, behavior: 'charger', score: 200, horn: true,
      attack: { range: 260, windup: 0.45, dashSpeed: 860, dashTime: 0.45, recover: 0.8, damage: 10, force: 700 },
    },
    spiky: {
      name: '가시돌이', color: '#d6556b', radius: 24, mass: 1.6, speed: 85, behavior: 'walker', score: 260, spikes: true,
      attack: { range: 48, windup: 0.5, recover: 0.7, damage: 11, force: 640 },
    },
    rhino: {
      name: '코뿔소', color: '#9b8f7a', radius: 30, mass: 3.4, speed: 80, behavior: 'charger', score: 400, horn: true,
      attack: { range: 280, windup: 0.9, dashSpeed: 700, dashTime: 0.6, recover: 1.1, damage: 16, force: 1000 },
    },
    ninja: {
      name: '닌자', color: '#4a4a66', radius: 17, mass: 0.8, speed: 150, behavior: 'charger', score: 280,
      attack: { range: 240, windup: 0.4, dashSpeed: 780, dashTime: 0.4, recover: 0.6, damage: 9, force: 640 },
    },
    golem: {
      name: '골렘', color: '#b08a5a', radius: 38, mass: 6, speed: 45, behavior: 'walker', score: 600, teeth: true,
      attack: { range: 70, windup: 1.0, recover: 1.2, damage: 22, force: 1100 },
    },
    hornet: {
      name: '말벌', color: '#ffc21f', radius: 13, mass: 0.5, speed: 220, behavior: 'walker', score: 150,
      attack: { range: 34, windup: 0.25, recover: 0.4, damage: 5, force: 400 },
    },
    ogre: {
      name: '오우거', color: '#5f9c4a', radius: 34, mass: 3.6, speed: 75, behavior: 'walker', score: 650, teeth: true,
      attack: { range: 66, windup: 0.7, recover: 0.9, damage: 20, force: 1000 },
    },
    reaper: {
      name: '저승사자', color: '#7a4fa8', radius: 22, mass: 1.3, speed: 110, behavior: 'charger', score: 700, horn: true,
      attack: { range: 320, windup: 0.5, dashSpeed: 900, dashTime: 0.55, recover: 0.7, damage: 18, force: 950 },
    },

    // 원거리 적 (16웨이브부터). behavior 'shooter' = 거리를 두고 shoot 발사체를 쏜다. zone = 일정 시간마다 플레이어 발밑에 장판(잠시 뒤 폭발)
    mage: {
      name: '마법사', color: '#5a7fd6', radius: 19, mass: 0.9, speed: 85, behavior: 'shooter', score: 450,
      attack: { range: 280, windup: 0.6, recover: 1.3, damage: 9, force: 620 },
      shoot: { speed: 330, radius: 11, color: '#7fb0ff', life: 700 },
    },
    witch: {
      name: '장판 마녀', color: '#b04fa8', radius: 21, mass: 1.1, speed: 70, behavior: 'shooter', score: 650,
      attack: { range: 300, windup: 0.7, recover: 1.5, damage: 9, force: 620 },
      shoot: { speed: 300, radius: 11, color: '#ff7fe0', life: 700 },
      zone: { every: 4.5, radius: 85, windup: 1.1, damage: 14, force: 900, count: 1 },
    },

    // 30웨이브 이후(무한 웨이브)에 섞여 나오는 공격 패턴이 다른 적
    // jumper = 멀리서 점프해 플레이어 자리에 내려찍기(attack.radius 범위), guard = 앞에서 맞으면 넉백·피해 x guard(옆·뒤나 연타로 뚫는다)
    // blink = every초마다 플레이어 등 뒤로 순간이동해서 바로 공격, ghost = 반투명하게 그린다
    frog: {
      name: '점프 개구리', color: '#3fbf6a', radius: 24, mass: 1.6, speed: 70, behavior: 'jumper', score: 500,
      attack: { range: 300, windup: 0.6, jumpTime: 0.7, recover: 0.9, radius: 75, damage: 14, force: 950 },
    },
    guard: {
      name: '방패병', color: '#6b7fa8', radius: 26, mass: 2.4, speed: 70, behavior: 'walker', score: 550, guard: 0.25,
      attack: { range: 56, windup: 0.6, recover: 0.8, damage: 16, force: 900 },
    },
    ghost: {
      name: '유령', color: '#c9d6ff', radius: 20, mass: 1.0, speed: 90, behavior: 'walker', score: 500, ghost: true,
      blink: { every: 4.5, dist: 75 },
      attack: { range: 50, windup: 0.45, recover: 0.7, damage: 14, force: 900 },
    },
    stomper: {
      name: '쿵쿵이', color: '#a85f3a', radius: 30, mass: 3.2, speed: 60, behavior: 'walker', score: 550, teeth: true,
      slam: { every: 3.5, radius: 120, windup: 0.75, damage: 13, force: 900 },
      attack: { range: 60, windup: 0.8, recover: 1.0, damage: 16, force: 900 },
    },

    // 보스: 5웨이브마다 하나씩, 매번 다른 보스가 나온다 (반복 없음). boss: true
    // slam = 일정 시간마다 내려찍기(범위 안 땅 위의 플레이어를 날림), summon = 일정 시간마다 부하 소환
    boss_king: {
      name: '왕졸개', color: '#4fae3f', radius: 46, mass: 7, speed: 70, behavior: 'walker', score: 2000, boss: true, crown: true,
      attack: { range: 80, windup: 0.8, recover: 0.9, damage: 18, force: 1000 },
      summon: { every: 7, type: 'grunt', count: 2 },
    },
    boss_rhino: {
      name: '철벽 대왕 코뿔소', color: '#7d7d8c', radius: 50, mass: 9, speed: 70, behavior: 'charger', score: 3000, boss: true, horn: true,
      attack: { range: 340, windup: 0.9, dashSpeed: 820, dashTime: 0.8, recover: 1.0, damage: 22, force: 1250 },
    },
    boss_quake: {
      name: '지진 거인', color: '#b5733a', radius: 54, mass: 10, speed: 55, behavior: 'walker', score: 4000, boss: true, teeth: true,
      attack: { range: 88, windup: 0.9, recover: 1.0, damage: 22, force: 1200 },
      slam: { every: 6, radius: 190, windup: 1.0, damage: 20, force: 1100 },
    },
    boss_storm: {
      name: '질풍 닌자왕', color: '#33334f', radius: 36, mass: 5, speed: 130, behavior: 'charger', score: 5000, boss: true, crown: true,
      attack: { range: 300, windup: 0.5, dashSpeed: 1000, dashTime: 0.6, recover: 0.5, damage: 16, force: 1100 },
      summon: { every: 8, type: 'ninja', count: 2 },
      zone: { every: 5, radius: 95, windup: 1.0, damage: 16, force: 1000, count: 2 },
    },
    boss_ogre: {
      name: '대왕 오우거', color: '#3f8a3a', radius: 56, mass: 11, speed: 70, behavior: 'walker', score: 6000, boss: true, teeth: true, crown: true,
      attack: { range: 92, windup: 0.7, recover: 0.8, damage: 25, force: 1300 },
      slam: { every: 5, radius: 210, windup: 0.9, damage: 22, force: 1200 },
      summon: { every: 10, type: 'ogre', count: 1 },
    },
    boss_reaper: {
      name: '기둥의 파괴신', color: '#8a2fb0', radius: 52, mass: 12, speed: 90, behavior: 'charger', score: 9000, boss: true, horn: true, crown: true, spikes: true,
      attack: { range: 360, windup: 0.6, dashSpeed: 1050, dashTime: 0.7, recover: 0.7, damage: 28, force: 1450 },
      slam: { every: 5, radius: 230, windup: 0.8, damage: 25, force: 1300 },
      summon: { every: 9, type: 'reaper', count: 1 },
      zone: { every: 4, radius: 105, windup: 0.9, damage: 18, force: 1100, count: 3 },
    },
  },

  // 웨이브 클리어 때 3개 중 하나를 고르는 특수능력. 최대 레벨은 abilityMaxLevel(능력별 max로 덮어쓸 수 있음).
  // lv[n]은 레벨 n+1일 때의 값이고, desc는 그 값을 받아 설명을 만든다. 효과 구현은 game.js에서 id로 찾는다.
  // lv 배열 다음 레벨부터는 마지막 한 단계 변화량 x abilityGrow(능력별 grow)씩 계속 변하고, cap에서 멈춘다(넘으면 안 되는 한계값)
  // melee: true = 근접 공격에서만 효과가 있는 능력(원거리 캐릭터 선택지에서 제외)
  abilityMaxLevel: 20,
  abilityGrow: 0.5,
  abilities: [
    { id: 'iron_fist',   icon: '👊', name: '강철 주먹',   lv: [1.2, 1.4, 1.65],  desc: v => `공격 넉백 x${v}` },
    { id: 'pump',        icon: '💪', name: '근육 펌핑',   lv: [1.3, 1.6, 2.0],   desc: v => `공격으로 올리는 피해% x${v}` },
    { id: 'heavy',       icon: '🪨', name: '묵직한 몸',   lv: [1.25, 1.5, 1.8],  desc: v => `몸무게 x${v} (덜 날아감)` },
    { id: 'quick_feet',  icon: '👟', name: '날쌘 발',     cap: 2.2, lv: [1.12, 1.24, 1.36], desc: v => `이동 속도 x${v}` },
    { id: 'long_reach',  icon: '🦍', name: '긴 팔',       cap: 2.5, lv: [1.15, 1.3, 1.45], desc: v => `공격 사거리 x${v}` },
    { id: 'wide_swing', melee: true,  icon: '🌀', name: '넓은 스윙',   cap: 250, lv: [30, 60, 90],      desc: v => `공격 범위 각도 +${v}°` },
    { id: 'rapid',       icon: '⚡', name: '연타',        cap: 2.5, lv: [1.15, 1.3, 1.45], desc: v => `공격 속도 x${v}` },
    { id: 'tough',       icon: '🛡️', name: '맷집',        cap: 0.3, lv: [0.85, 0.72, 0.6], desc: v => `받는 피해% x${v}` },
    { id: 'grip',        icon: '🦶', name: '발끝 버티기', cap: 0.25, lv: [0.8, 0.65, 0.5],  desc: v => `가장자리 근처에서 받는 넉백 x${v}` },
    { id: 'recovery',    icon: '🍙', name: '주먹밥',      cap: 45, lv: [7, 12, 17],       desc: v => `웨이브 클리어 때 피해% -${v} (선택 즉시도 회복)` },
    { id: 'cyclone', melee: true,     icon: '🌪️', name: '회오리 펀치', cap: 2, lv: [1, 1.15, 1.3],    desc: v => v > 1 ? `3타째가 360° 회전 공격 (범위 x${v})` : '3타째가 360° 회전 공격' },
    { id: 'shockwave', melee: true,   icon: '💥', name: '충격파',      cap: 320, lv: [120, 150, 185],   desc: v => `3타째 끝에 반경 ${v} 충격파` },
    { id: 'counter',     icon: '🔥', name: '분노 반격',   lv: [500, 700, 900],   desc: v => `맞으면 주변 적을 날려버림 (힘 ${v})` },
    { id: 'thorns',      icon: '🌵', name: '가시 근육',   lv: [8, 14, 20],       desc: v => `나를 때린 적 피해% +${v}, 튕겨냄` },
    { id: 'bowling',     icon: '🎳', name: '볼링',        lv: [1.4, 1.8, 2.2],   desc: v => `날아간 적끼리 부딪힐 때 충격 x${v}` },
    { id: 'bounty',      icon: '💰', name: '현상금',      lv: [1.25, 1.5, 2.0],  desc: v => `낙하 처치 점수 x${v}` },
    { id: 'intimidate',  icon: '😠', name: '위압감',      cap: 2.5, lv: [1.2, 1.4, 1.6],   desc: v => `적의 공격 준비 시간 x${v}` },
    { id: 'roar',        icon: '📣', name: '기합',        cap: 2, lv: [8, 6, 4.5],       desc: v => `${v}초마다 기합으로 주변 적을 밀어냄` },
    { id: 'adrenaline',  icon: '❤️‍🔥', name: '아드레날린', cap: 25, lv: [3, 6, 10],        desc: v => `적이 떨어질 때마다 체력회복 +${v}%` },
    { id: 'second_wind', icon: '🪽', name: '낙법',        max: 6, grow: 1, lv: [1, 2, 3],         desc: v => `떨어져도 기둥으로 복귀 (총 ${v}회)` },
    // every초마다 lv초 동안 몸집이 scale배: 사거리, 넉백, 몸무게도 같은 배율로 커진다
    { id: 'giant',       icon: '🗿', name: '거대화',      cap: 13, lv: [4, 6, 8], every: 15, scale: 1.6, desc: v => `15초마다 ${v}초간 거대화 (크기·힘·무게 x1.6)` },
    // 특별 능력: 효과는 game.js에서 id로 읽는다
    { id: 'vampire',     icon: '🧛', name: '흡혈',        cap: 0.5, lv: [0.1, 0.2, 0.3],         desc: v => `공격이 적중할 때마다 체력 회복 +${v}%` },
    { id: 'execute',     icon: '🎯', name: '마무리 일격', lv: [1.3, 1.6, 2.0],   desc: v => `피해% 100 이상인 적에게 넉백 x${v}` },
    { id: 'lunge', melee: true,       icon: '🚀', name: '돌격 펀치',   cap: 6, lv: [1.8, 2.6, 3.4],   desc: v => `공격할 때 앞으로 나가는 거리 x${v}` },
    { id: 'berserk',     icon: '🩸', name: '광전사',      lv: [0.3, 0.5, 0.8],   desc: v => `내 피해%가 높을수록 넉백 증가 (100%당 +${Math.round(v * 100)}%)` },
    { id: 'dodge',       icon: '🥷', name: '회피 본능',   cap: 2.5, lv: [0.8, 1.1, 1.5],   desc: v => `맞은 뒤 무적 시간 ${v}초` },
    { id: 'meat_lover',  icon: '🍖', name: '고기 사랑',   lv: [1.5, 2, 2.5],     desc: v => `회복 고기 효과 x${v}` },
    { id: 'stun',        icon: '💫', name: '기절 타격',   cap: 4, lv: [1.4, 1.8, 2.2],   desc: v => `맞은 적의 경직 시간 x${v}` },
    { id: 'chain',       icon: '🔗', name: '연쇄 유지',   cap: 6, lv: [1.6, 2.2, 3],     desc: v => `낙하 연쇄 점수 유지 시간 ${v}초` },
    { id: 'last_stand',  icon: '🧗', name: '배수진',      lv: [1.3, 1.6, 2.0],   desc: v => `기둥 가장자리 근처에서 공격 넉백 x${v}` },
    { id: 'shield',      icon: '🔮', name: '방패막',      cap: 2.5, lv: [14, 10, 7],       desc: v => `${v}초마다 첫 공격 한 번을 막아줌` },
    { id: 'gold_hand',   icon: '🪙', name: '황금손',      cap: 3, lv: [1.25, 1.5, 2.0],  desc: v => `게임이 끝날 때 얻는 골드 x${v}` },
    // 대시 능력: 대시 버튼은 처음부터 있고, 이 능력들이 대시를 강화한다
    { id: 'dash_cool',   icon: '⏱️', name: '대시 재충전', cap: 0.35, lv: [0.8, 0.65, 0.5], desc: v => `대시 쿨타임 x${v}` },
    { id: 'dash_far',    icon: '🏃', name: '멀리 대시',   cap: 2.6, lv: [1.25, 1.5, 1.8], desc: v => `대시 거리 x${v}` },
    { id: 'dash_ghost',  icon: '👻', name: '잔상 대시',   cap: 1.6, lv: [0.4, 0.7, 1.0],  desc: v => `대시 후 무적 시간 +${v}초` },
    { id: 'dash_ram',    icon: '🐗', name: '돌진 박치기', cap: 1400, lv: [450, 600, 780], desc: v => `대시로 부딪힌 적을 날려버림 (힘 ${v})` },
    { id: 'dash_quake',  icon: '🌋', name: '착지 충격',   cap: 300, lv: [100, 130, 165], desc: v => `대시가 끝나면 반경 ${v} 충격파` },
    // 속성 공격: 내 공격이 적중할 때 붙는 추가 효과
    { id: 'fire_fist',   icon: '🔥', name: '불꽃 주먹',   cap: 30, lv: [4, 7, 10],        desc: v => `공격에 맞은 적이 3초간 불타 초당 피해% +${v}` },
    { id: 'frost',       icon: '❄️', name: '얼음 타격',   cap: 2.5, lv: [0.5, 0.8, 1.1],   desc: v => `공격에 맞은 적이 ${v}초간 얼어붙음 (보스는 절반)` },
    { id: 'spark',       icon: '⚡', name: '번개 타격',   cap: 40, lv: [8, 13, 18],       desc: v => `공격 적중 시 주변 적 둘에게 번개가 튀어 피해% +${v}` },
    { id: 'regen',       icon: '🌿', name: '재생',        cap: 0.6, lv: [0.05, 0.1, 0.15],     desc: v => `5초마다 체력회복 +${+(v * 5).toFixed(2)}%` },
  ],

  // 게임이 끝나면 골드를 얻는다: round(점수 / perScore + 웨이브 * perWave). 골드로 캐릭터를 산다.
  gold: { perScore: 250, perWave: 0.8 },

  // 캐릭터 10종(근접 7 + 원거리 3). price 0 = 처음부터 사용 가능. skill = 시작할 때 Lv1로 가지고 시작하는 능력 id (abilities 참고).
  // attack = 기본 공격 수치를 덮어씀(player.attack 기준), mass/speed = 몸무게/이동속도 배율.
  // look = 외형(skin 피부, coat 겉옷, trim 깃/띠, shorts 바지, sock 양말, hair 머리색, band 머리띠, glove 주먹 색, mark 등 글자)
  //   + 장식: hat('toque' 요리사모, 'pirate' 해적모자, 'topknot' 상투, 'ears' 뾰족귀, 'wizard' 마법사 모자, 'helmet' 철모, 'hood' 후드), mask(복면), beard(수염), fangs(송곳니), cape(망토), bald(민머리), shades(선글라스)
  characters: [
    { id: 'bigguy', name: '빅가이', price: 0, skill: null, desc: '축제를 사랑하는 근육질 아저씨. 균형 잡힌 기본 캐릭터.',
      look: {} },
    { id: 'ninja', name: '쾌속 닌자', price: 100, skill: 'quick_feet', speed: 1.05, desc: '그림자처럼 빠르다. 가볍게 치고 빠지는 연타 공격.',
      attack: { range: 70, damage: 5, knockback: 360, duration: 0.19, active: [0.03, 0.1], comboWindow: 0.4, finisherMul: 2.3, lunge: 100 },
      look: { skin: '#d9a273', coat: '#2b2d42', trim: '#d62839', shorts: '#1c1d2b', sock: '#d62839', band: '#d62839', mask: '#2b2d42', mark: '影' } },
    { id: 'sumo', name: '스모 장사', price: 150, skill: 'heavy', mass: 1.25, speed: 0.9, desc: '산 같은 몸. 느리지만 한 방이 묵직하다.',
      attack: { range: 72, arc: 130, damage: 8, knockback: 540, duration: 0.34, active: [0.1, 0.2], comboWindow: 0.5, finisherMul: 1.8, lunge: 40 },
      look: { skin: '#e0b08a', coat: '#e8e0cc', trim: '#7a5230', shorts: '#2f6fb3', sock: '#e0b08a', hair: '#17171c', band: '#e8e0cc', hat: 'topknot', mark: '力' } },
    { id: 'boxer', name: '복서', price: 150, skill: 'rapid', desc: '번개 같은 잽. 좁지만 아주 빠르게 때린다.',
      attack: { range: 74, arc: 80, damage: 4, knockback: 330, duration: 0.15, active: [0.03, 0.09], comboWindow: 0.35, finisherMul: 2.8, lunge: 60 },
      look: { skin: '#b9774c', coat: '#c1121f', trim: '#ffd84a', shorts: '#c1121f', sock: '#ffffff', band: '#ffd84a', glove: '#e63946', mark: '拳' } },
    { id: 'general', name: '창술 장군', price: 200, skill: 'long_reach', desc: '긴 창을 휘두르듯 멀리서 찌른다. 범위는 좁다.',
      attack: { range: 128, arc: 45, damage: 6, knockback: 400, duration: 0.3, active: [0.07, 0.17], comboWindow: 0.45, finisherMul: 2.0, lunge: 30 },
      look: { skin: '#c98a5c', coat: '#2a6f4e', trim: '#ffd84a', shorts: '#244c3a', sock: '#ffd84a', hair: '#3b2213', band: '#ffd84a', beard: '#3b2213', mark: '將' } },
    { id: 'wrestler', name: '프로 레슬러', price: 300, skill: 'lunge', desc: '몸통 박치기! 크게 돌진하며 때리는 강타자.',
      attack: { range: 76, arc: 100, damage: 7, knockback: 470, duration: 0.26, active: [0.05, 0.15], comboWindow: 0.45, finisherMul: 2.1, lunge: 150 },
      look: { skin: '#d08a5a', coat: '#ffcf33', trim: '#1b1b8f', shorts: '#1b1b8f', sock: '#ffcf33', hair: '#6b3a1a', band: '#d62828', shades: true, glove: '#d62828', mark: '王' } },
    { id: 'chef', name: '불꽃 요리사', price: 300, skill: 'meat_lover', desc: '고기를 아는 사나이. 회복 고기 효과가 커진다.',
      attack: { range: 82, arc: 90, damage: 5, knockback: 400, duration: 0.24, active: [0.05, 0.14], comboWindow: 0.45, finisherMul: 2.2, lunge: 70 },
      look: { skin: '#e0a679', coat: '#ffffff', trim: '#d62828', shorts: '#3a3a4a', sock: '#ffffff', hair: '#5a3a1a', band: '#ffffff', hat: 'toque', mark: '肉' } },
    // 원거리 캐릭터: attack은 1~2타 근접 수치, 3타째(finisher)만 attack.ranged(발사체 설정)의 전용기술(fin)로 바뀐다. ranged.range = 발사체 최대 사거리
    { id: 'wizard', name: '마법사', price: 350, skill: 'execute', speed: 0.95, desc: '지팡이로 때리고, 3타째는 마력 구슬을 날린다. 전용기술 전용기술 [폭발 구슬]은 맞은 곳에서 터져 주변을 날려버린다.',
      attack: { range: 80, arc: 90, damage: 4, knockback: 240, duration: 0.3, active: [0.07, 0.15], comboWindow: 0.5, finisherMul: 1.4, lunge: 40,
        ranged: { range: 340, speed: 480, radius: 14, color: '#b57cff', shape: 'orb', fin: { boom: 100, color: '#ff7ce8', speed: 420, radius: 22 } } },
      look: { skin: '#e0b08a', coat: '#4b2e8a', trim: '#ffd84a', shorts: '#2a1a55', sock: '#2a1a55', hair: '#d8d8e8', band: '#ffd84a', beard: '#d8d8e8', hat: 'wizard', mark: '魔' } },
    { id: 'soldier', name: '군인', price: 450, skill: 'rapid', desc: '개머리판으로 때리고, 3타째는 소총을 쏜다. 전용기술 전용기술 [일제 사격]은 총알 5발을 부채꼴로 쏟아낸다.',
      attack: { range: 76, arc: 80, damage: 3, knockback: 230, duration: 0.2, active: [0.04, 0.1], comboWindow: 0.4, finisherMul: 1.2, lunge: 40,
        ranged: { range: 370, speed: 980, radius: 7, color: '#ffe37a', shape: 'bullet', fin: { count: 5, spread: 0.55, speed: 900 } } },
      look: { skin: '#c98a5c', coat: '#4f6b3a', trim: '#33472a', shorts: '#3b4f2b', sock: '#2a2a22', hair: '#2a1a0f', band: '#33472a', hat: 'helmet', glove: '#2a2a22', mark: '兵' } },
    { id: 'archer', name: '궁수', price: 500, skill: 'long_reach', desc: '활로 후려치고, 3타째는 화살을 쏜다. 전용기술 전용기술 [관통 삼연사]는 적을 꿰뚫는 화살 3발을 쏜다.',
      attack: { range: 84, arc: 70, damage: 4, knockback: 270, duration: 0.28, active: [0.06, 0.14], comboWindow: 0.45, finisherMul: 1.5, lunge: 40,
        ranged: { range: 430, speed: 820, radius: 9, color: '#f4e3b0', shape: 'arrow', fin: { count: 3, spread: 0.28, pierce: true, speed: 900 } } },
      look: { skin: '#d9a273', coat: '#2f7a46', trim: '#7a5230', shorts: '#5a3a1a', sock: '#5a3a1a', hair: '#7a4a22', band: '#7a5230', hat: 'hood', mark: '弓' } },
  ],

  // 웨이브별 등장 마릿수. 5웨이브마다(5, 10, 15...) 보스 웨이브. 마지막 웨이브 이후는 endless 설정을 따른다.
  waves: [
    { grunt: 3 },                                              // 1
    { grunt: 5 },                                              // 2
    { grunt: 4, charger: 2, runner: 2 },                       // 3 날쌘이 등장
    { grunt: 5, charger: 2, brute: 1, runner: 2 },             // 4
    { boss_king: 1, grunt: 3 },                                // 5 보스: 왕졸개
    { grunt: 4, charger: 3, tank: 2 },                         // 6 철갑병 등장
    { grunt: 5, brute: 2, tank: 2, runner: 3 },                // 7
    { charger: 3, rusher: 3, brute: 2, runner: 2 },            // 8 번개 돌격병 등장
    { grunt: 6, rusher: 3, tank: 2, brute: 2 },                // 9
    { boss_rhino: 1, charger: 3, grunt: 3 },                   // 10 보스: 철벽 대왕 코뿔소
    { grunt: 5, spiky: 4, tank: 2, rusher: 3 },                // 11 가시돌이 등장
    { charger: 4, brute: 3, spiky: 3, runner: 4 },             // 12
    { rhino: 2, spiky: 3, tank: 3, grunt: 5 },                 // 13 코뿔소 등장
    { rhino: 2, rusher: 4, brute: 3, spiky: 3 },               // 14
    { boss_quake: 1, brute: 3, spiky: 3, runner: 3 },          // 15 보스: 지진 거인
    { ninja: 4, rhino: 2, tank: 3, mage: 2 },                  // 16 닌자, 마법사 등장
    { ninja: 5, rusher: 4, brute: 3, mage: 2 },                // 17
    { golem: 2, ninja: 4, rhino: 2, tank: 3 },                 // 18 골렘 등장
    { golem: 2, ninja: 4, rusher: 4, mage: 2, witch: 1 },      // 19 장판 마녀 등장
    { boss_storm: 1, ninja: 4, rusher: 4, mage: 2 },           // 20 보스: 질풍 닌자왕
    { hornet: 8, golem: 2, rhino: 3, spiky: 4 },               // 21 말벌 등장
    { hornet: 8, mage: 3, witch: 2, tank: 4, rhino: 3 },       // 22
    { hornet: 6, golem: 3, rusher: 5, brute: 4, spiky: 4 },    // 23
    { ogre: 3, hornet: 6, golem: 2, ninja: 5 },                // 24 오우거 등장
    { boss_ogre: 1, ogre: 2, rhino: 3, hornet: 6 },            // 25 보스: 대왕 오우거
    { ogre: 4, golem: 3, mage: 3, witch: 2, hornet: 5 },       // 26
    { reaper: 3, ogre: 3, golem: 3, spiky: 5 },                // 27 저승사자 등장
    { reaper: 4, ogre: 4, ninja: 6, rhino: 3, hornet: 6 },     // 28
    { reaper: 4, ogre: 4, witch: 3, mage: 3, rusher: 5 },      // 29
    { boss_reaper: 1, reaper: 3, ogre: 3, golem: 3, ninja: 5 }, // 30 보스: 기둥의 파괴신
  ],
  // 회복 아이템: every 웨이브마다 한 번(3, 6, 9...), 웨이브 시작 delay초 뒤 기둥 위에 떨어진다. 주우면 피해% -heal
  meat: { every: 3, delay: 5, heal: 20, radius: 20 },

  // 필드 아이템: 매 웨이브 chance 확률로 delay[0]~delay[1]초 사이에 하나가 떨어진다(weight 가중치). life초 뒤 사라진다.
  // 주우면 효과가 바로 나거나(bomb, ice, gem) time초 동안 지속된다(star, drink, protein). 효과는 game.js의 useItem에서 id로 처리한다
  itemDrop: { chance: 0.75, delay: [4, 12], radius: 18 },
  items: [
    { id: 'bomb',    icon: '💣', name: '폭탄',         weight: 3, life: 15, range: 230, force: 950, desc: '주변 적을 모두 날려버림' },
    { id: 'star',    icon: '⭐', name: '무적 별',       weight: 2, life: 12, time: 6, desc: '6초 동안 무적' },
    { id: 'drink',   icon: '⚡', name: '에너지 드링크', weight: 3, life: 15, time: 8, mul: 1.4, desc: '8초 동안 이동·공격 속도 x1.4' },
    { id: 'protein', icon: '🥤', name: '프로틴',       weight: 3, life: 15, time: 10, mul: 1.5, desc: '10초 동안 공격 넉백 x1.5' },
    { id: 'ice',     icon: '🧊', name: '얼음 결정',     weight: 2, life: 15, time: 3, desc: '3초 동안 모든 적이 얼어붙음 (보스는 절반)' },
    { id: 'gem',     icon: '💎', name: '보석',          weight: 2, life: 10, score: 100, desc: '점수 +(100 x 웨이브)' },
  ],

  // 마지막 웨이브(30) 이후: 마릿수는 count로 고정하고 pool(가중치)에서 무작위로 섞는다.
  // 대신 웨이브마다 적이 단단해지고(몸무게 x(1 + tough * n), n = 30 이후 몇 번째 웨이브) 정예가 섞인다.
  // 정예: 확률 elite + eliteStep * n (최대 eliteMax), 몸무게 x eliteMass, 크기 x eliteScale, 금색 테두리
  endless: {
    count: 16, tough: 0.08, elite: 0.1, eliteStep: 0.02, eliteMax: 0.45, eliteMass: 1.7, eliteScale: 1.18,
    pool: { frog: 3, guard: 3, ghost: 3, stomper: 2, ogre: 2, reaper: 2, golem: 1, ninja: 2, rhino: 1, mage: 1, witch: 1, spiky: 1 },
  },
  spawnInterval: 0.9,
  maxAlive: 7,
};
