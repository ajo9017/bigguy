// 게임 콘텐츠/밸런스 데이터. 새 적·웨이브 추가나 수치 조정은 여기서 한다.
// 거리 단위: 기둥 반지름(arena.radius) 기준 월드 좌표. 시간 단위: 초.
// 넉백은 (knockback * (1 + 피해% / 80) / mass) 로 계산된다. 처치는 오직 낙하로만.
window.GAME_DATA = {
  arena: { radius: 320 },

  player: {
    radius: 34,
    mass: 1.6,
    speed: 230,
    // 일반 공격: 3타째가 강타(finisher)
    attack: { range: 78, arc: 110, damage: 6, knockback: 420, duration: 0.24, active: [0.05, 0.14], comboWindow: 0.45, finisherMul: 2.0, lunge: 70 },
    // 밀치기: 데미지는 낮고 넉백이 크다
    shove: { range: 92, arc: 150, damage: 2, knockback: 980, duration: 0.3, active: [0.08, 0.18], cooldown: 1.1, lunge: 140 },
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

  // 웨이브별 등장 마릿수. 마지막 웨이브 이후에는 endlessScale 배율로 계속 늘어난다.
  waves: [
    { grunt: 3 },
    { grunt: 5 },
    { grunt: 4, charger: 2 },
    { grunt: 5, charger: 2, brute: 1 },
    { grunt: 6, charger: 3, brute: 2 },
  ],
  endlessScale: 1.25,
  spawnInterval: 0.9,
  maxAlive: 7,
};
