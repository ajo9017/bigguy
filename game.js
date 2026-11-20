(() => {
  'use strict';

  const D = window.GAME_DATA;
  const R = D.arena.radius;
  const SQ = 0.6;          // 원근감: 바닥 세로 압축 비율
  const FRICTION = 4;      // 넉백 속도 감쇠
  const GRAVITY = 1700;
  const ABIL = Object.fromEntries(D.abilities.map(a => [a.id, a]));
  const ITEM = Object.fromEntries(D.items.map(it => [it.id, it]));
  const EQUIP = Object.fromEntries(D.equips.map(e => [e.id, e]));
  const TREE = Object.fromEntries(D.tree.map(n => [n.id, n]));
  const STAGE = Object.fromEntries(D.stages.map(s => [s.id, s]));

  const canvas = document.getElementById('game');
  let ctx = canvas.getContext('2d');
  const mainCtx = ctx;
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  const $ = id => document.getElementById(id);
  const ui = {
    title: $('title'), over: $('over'), overStats: $('overStats'), touch: $('touch'), btnAtk: $('btnAtk'), help: $('help'),
    pick: $('pick'), pickTitle: $('pickTitle'), cards: $('cards'), btnReroll: $('btnReroll'),
    chat: $('chat'), chatText: $('chatText'), chatHist: $('chatHist'), btnChat: $('btnChat'), chatSend: $('chatSend'), chatMsg: $('chatMsg'),
    ownerToggle: $('ownerToggle'), ownerRow: $('ownerRow'), ownerCode: $('ownerCode'),
    skillInfo: $('skillInfo'), skillCards: $('skillCards'), chars: $('chars'), charList: $('charList'), charNow: $('charNow'),
    records: $('records'), recBody: $('recBody'), rankBody: $('rankBody'), rankList: $('rankList'), rankReset: $('rankReset'), myName: $('myName'), nameInput: $('nameInput'),
    overTitle: $('overTitle'), titleDia: $('titleDia'), stages: $('stages'), stageList: $('stageList'),
    tree: $('tree'), treeSvg: $('treeSvg'), treeInfo: $('treeInfo'), treeDia: $('treeDia'),
    codex: $('codex'), codexList: $('codexList'), shop: $('shop'), shopOffers: $('shopOffers'), shopGold: $('shopGold'), shopEq: $('shopEq'), shopReroll: $('shopReroll'),
  };

  // ---------- 화면 ----------
  let W = 0, H = 0, DPR = 1, S = 1, CX = 0, CY = 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    S = Math.min(W / (2 * R + 70), H * 0.78 / (2 * R * SQ + 120));
    CX = W / 2; CY = H * 0.48;
  }
  // 개선 요청 창에서 모바일 키보드가 뜨면 창 높이가 바뀌는데, 이때 캔버스를 다시 만들면 한글 입력(IME) 조합이 끊긴다. 채팅 중엔 건너뛰고 닫을 때 한 번 맞춘다
  window.addEventListener('resize', () => { if (!chatOpen) resize(); });
  resize();

  // ---------- 도트 스프라이트 (art/STYLE.md 규칙, 파일은 art/sprites) ----------
  // 프레임은 가로 한 줄, 기본은 오른쪽을 본다(왼쪽은 좌우 반전). 확대는 정수 배율 + nearest neighbor만 쓴다.
  // 그림이 아직 안 불러와졌거나 없는 캐릭터·적은 기존 도형 그리기를 그대로 쓴다
  // 모든 스프라이트가 같은 점 크기를 쓴다(STYLE.md: 점 크기가 섞이면 안 됨). 캐릭터끼리 크기 차이는 그림 픽셀 수로만 난다.
  // ART_UNIT: 그림 1픽셀 = 게임 단위 몇. 키우면 모두 같이 커진다
  // baseR: data.js의 기본 반지름. 거대화·정예처럼 r이 커지면 그 비율만큼 같이 커진다
  const ART_UNIT = 1.9;
  const SPRITES = {};
  function loadSprite(key, fw, fh, baseR) {
    const s = SPRITES[key] = { img: new Image(), fw, fh, baseR, ok: false, tints: {} };
    s.img.onload = () => { s.ok = true; };
    s.img.src = `art/sprites/${key}.png`;
  }
  // 빅가이 프레임: 0 서기, 1 걷기(발 벌림), 2 걷기(발 모음), 3 펀치 준비, 4 펀치 뻗기, 5 맞음/낙하
  loadSprite('bigguy', 48, 48, D.player.radius);
  for (const k of ['grunt', 'charger', 'brute']) loadSprite(k, k === 'brute' ? 48 : 32, k === 'brute' ? 48 : 32, D.enemies[k].radius);

  // 피격 반짝임 등에 쓰는 단색 실루엣 (색마다 한 번만 만든다)
  function spriteTint(s, color) {
    let c = s.tints[color];
    if (!c) {
      c = document.createElement('canvas'); c.width = s.img.width; c.height = s.img.height;
      const g = c.getContext('2d');
      g.drawImage(s.img, 0, 0);
      g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
      s.tints[color] = c;
    }
    return c;
  }

  // 원점 = 몸 중심, 발끝 = +r 에 맞춰 그린다. over: 위에 덮을 단색(없으면 null)
  // 배율은 r과 화면 DPR로만 정한다. 기울기·찌그러짐(ctx 변환)을 배율 계산에 넣으면 연출 중에 2배↔3배로 튀어서 크기가 갑자기 바뀐다
  function drawSprite(s, frame, r, flip, over, overA) {
    const k = Math.max(1, Math.round(ART_UNIT * (r / s.baseR) * DPR)) / DPR;
    const w = s.fw * k, h = s.fh * k, x = -w / 2, y = r - h;
    ctx.save();
    if (flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.img, frame * s.fw, 0, s.fw, s.fh, x, y, w, h);
    if (over) {
      ctx.globalAlpha *= overA;
      ctx.drawImage(spriteTint(s, over), frame * s.fw, 0, s.fw, s.fh, x, y, w, h);
    }
    ctx.restore();
  }

  function bigguyFrame(e) {
    if (e.falling || e.hurt > 0) return 5;
    const a = e.atk;
    if (a && a.def) { const u = a.t / a.def.duration; return u < 0.2 || u > 0.85 ? 3 : 4; }
    if (e.sprMoving) return Math.floor(e.walk / (Math.PI / 2)) % 2 ? 2 : 1;
    return 0;
  }

  const sx = x => CX + x * S;
  const sy = (y, z) => CY + (y * SQ - z) * S;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const angDiff = (a, b) => {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  function shuffle(arr) {
    for (let j = arr.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [arr[j], arr[k]] = [arr[k], arr[j]];
    }
    return arr;
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => clamp(Math.round(c * (1 + amt)), 0, 255);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  const storage = {
    get(key, dflt) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? dflt; } catch (e) { return dflt; } },
    set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 저장소 없음 */ } },
  };

  // ---------- 영구 성장: 다이아, 성장 트리, 스테이지 기록 (localStorage 'bigguy.meta') ----------
  // dia = 보유 다이아, tree = 산 노드 id, cleared = 클리어한 스테이지 id, best = 스테이지별 최고 웨이브
  const meta = Object.assign({ dia: 0, tree: ['root'], cleared: [], best: {} }, storage.get('bigguy.meta', {}));
  const saveMeta = () => storage.set('bigguy.meta', meta);
  const hasNode = id => meta.tree.includes(id);
  // 스테이지는 앞 스테이지를 클리어해야 열린다 (무한은 3스테이지 클리어 뒤)
  const stageOpen = s => s.id === 1 || meta.cleared.includes(s.id - 1);
  // 노드 type별 효과 합: 더하는 값(startGold, saves, shop)과 곱하는 값(discount, dia)
  function treeVal(type) {
    const mul = type === 'discount' || type === 'dia';
    let v = mul ? 1 : 0;
    for (const id of meta.tree) { const n = TREE[id]; if (n && n.type === type) v = mul ? v * n.value : v + n.value; }
    return v;
  }
  // 해금 노드에 묶인 아이템·능력은 그 노드를 사야 나온다. 어느 노드에도 없으면 처음부터 열려 있다
  const lockedBy = (key, id) => D.tree.find(n => n[key] && n[key].includes(id));
  const itemOpen = id => { const n = lockedBy('items', id); return !n || hasNode(n.id); };
  const skillOpenFn = id => { const n = lockedBy('skills', id); return !n || hasNode(n.id); };

  // 성장 트리(영구) + 장비 + 장비 세트 보너스(이번 판)의 능력치 합. heal, reroll은 더하고 나머지는 곱한다
  const ADD_STATS = new Set(['heal', 'reroll']);
  function activeSets(eq) {
    const cnt = {};
    for (const id of eq || []) { const s = EQUIP[id].set; if (s) cnt[s] = (cnt[s] || 0) + 1; }
    const out = [];
    for (const s in cnt) { if (cnt[s] >= 2) out.push(D.sets[s][2]); if (cnt[s] >= 3) out.push(D.sets[s][3]); }
    return out;
  }
  function st(key, onlyTree) {
    const add = ADD_STATS.has(key);
    let v = add ? 0 : 1;
    const apply = s => { if (s && s[key] != null) v = add ? v + s[key] : v * s[key]; };
    for (const id of meta.tree) { const n = TREE[id]; if (n && n.type === 'stat') apply(n.stats); }
    if (!onlyTree && player && player.eq) {
      for (const id of player.eq) apply(EQUIP[id].stats);
      for (const b of activeSets(player.eq)) apply(b);
    }
    return v;
  }

  // ---------- 사운드 (합성음) ----------
  const Sfx = {
    ctx: null, noiseBuf: null,
    unlock() {
      if (!this.ctx) {
        try {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
          const len = this.ctx.sampleRate;
          this.noiseBuf = this.ctx.createBuffer(1, len, len);
          const d = this.noiseBuf.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        } catch (e) { this.ctx = null; }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(f0, f1, dur, type, vol, delay = 0) {
      const c = this.ctx, t = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + dur);
    },
    noise(dur, vol, freq) {
      const c = this.ctx, t = c.currentTime;
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noiseBuf;
      f.type = 'lowpass'; f.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f).connect(g).connect(c.destination);
      s.start(t); s.stop(t + dur);
    },
    play(name) {
      if (!this.ctx) return;
      switch (name) {
        case 'swish': this.noise(0.08, 0.12, 3500); break;
        case 'whoosh': this.noise(0.2, 0.25, 1200); this.tone(220, 90, 0.18, 'sine', 0.12); break;
        case 'hit': this.tone(190, 70, 0.1, 'square', 0.12); this.noise(0.06, 0.25, 2600); break;
        case 'bighit': this.tone(150, 40, 0.22, 'square', 0.2); this.noise(0.14, 0.4, 1800); break;
        case 'hurt': this.tone(340, 70, 0.32, 'sawtooth', 0.22); this.noise(0.18, 0.5, 900); break;
        case 'fall': this.tone(800, 110, 0.9, 'triangle', 0.14); break;
        case 'windup': this.tone(520, 760, 0.1, 'square', 0.035); break;
        case 'wave': this.tone(440, 880, 0.25, 'square', 0.07); break;
        case 'pick': this.tone(600, 1200, 0.18, 'triangle', 0.12); break;
        case 'roar': this.tone(120, 60, 0.4, 'sawtooth', 0.15); this.noise(0.3, 0.2, 600); break;
        case 'fanfare':
          // 빰빠밤 빠~밤!
          [[523, 0, 0.14], [523, 0.15, 0.1], [523, 0.27, 0.1], [659, 0.39, 0.32], [523, 0.75, 0.14], [784, 0.92, 0.7]].forEach(([f, d, l]) => {
            this.tone(f, f * 1.003, l, 'square', 0.07, d);
            this.tone(f / 2, f / 2, l, 'triangle', 0.08, d);
          });
          break;
        case 'pop': this.noise(0.35, 0.35, 2400); this.tone(900, 300, 0.25, 'sine', 0.05); break;
      }
    },
  };

  // ---------- 상태 ----------
  const game = {
    state: 'title', wave: 0, score: 0, kills: 0, time: 0, queue: [], spawnT: 0, meatT: -1, itemT: -1, clearT: -1, overT: 0, filled: -1,
    chainN: 0, chainT: 0, banner: null, bossT: -1, picking: false, rerolls: 1, choices: [], fireworks: [],
    stage: D.stages[0], gold: 0, shopping: false, offers: [],
  };
  const fx = { shake: 0, red: 0, zoom: 0, hitstop: 0, slow: 0 };
  let player, enemies = [], particles = [], items = [], shots = [], eshots = [], zones = [], webs = [], meteors = [];
  let chatOpen = false;
  let skillOpen = false, abilRects = [];

  // ---------- 입력 ----------
  const keys = new Set();
  let attackBuf = -1;
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const STICK_R = 55;

  function pressAttack() { attackBuf = performance.now(); Sfx.unlock(); }
  function consumeAttack() {
    if (performance.now() - attackBuf < 180) { attackBuf = -1; return true; }
    return false;
  }
  let dashBuf = -1;
  function pressDash() { dashBuf = performance.now(); Sfx.unlock(); }
  function consumeDash() {
    if (performance.now() - dashBuf < 180) { dashBuf = -1; return true; }
    return false;
  }
  let btnAtkHeld = false;
  function attackHeld() { return btnAtkHeld || keys.has('KeyJ') || keys.has('KeyK') || keys.has('Space'); }
  function releaseInput() { btnAtkHeld = false; keys.clear(); stick.id = null; stick.x = stick.y = 0; }

  // e.code를 써야 한글 입력 상태에서도 WASD가 동작한다
  addEventListener('keydown', e => {
    if (chatOpen || e.isComposing || e.target.closest && e.target.closest('textarea, input')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyJ' || e.code === 'KeyK' || e.code === 'Space') pressAttack();
    if (e.code === 'KeyL' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') pressDash();
    if (game.picking && /^Digit[1-3]$/.test(e.code)) choose(+e.code.slice(5) - 1);
    if (game.picking && e.code === 'KeyR') reroll();
    const lobbyFree = [ui.records, ui.chars, ui.stages, ui.tree, ui.codex].every(el => el.classList.contains('hidden'));
    if (e.code === 'Enter' && game.state !== 'play' && !chatOpen && lobbyFree) { if (game.state === 'over') startGame(game.stage.id); else openStages(); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', releaseInput);

  canvas.addEventListener('pointerdown', e => {
    Sfx.unlock();
    if (game.state === 'play' && !game.picking && !game.shopping && !chatOpen && !skillOpen) {
      const hit = abilRects.find(r => e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h);
      if (hit) { openSkillInfo(); return; }
    }
    if (e.pointerType === 'mouse' || stick.id !== null || e.clientX > W * 0.6) return;
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== stick.id) return;
    const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, m = Math.hypot(dx, dy);
    const k = m > STICK_R ? STICK_R / m : 1;
    stick.x = dx * k / STICK_R; stick.y = dy * k / STICK_R;
  });
  const endStick = e => { if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; } };
  canvas.addEventListener('pointerup', endStick);
  canvas.addEventListener('pointercancel', endStick);

  ui.btnAtk.addEventListener('pointerdown', e => { e.preventDefault(); pressAttack(); btnAtkHeld = true; ui.btnAtk.classList.add('on'); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) ui.btnAtk.addEventListener(t, () => { btnAtkHeld = false; ui.btnAtk.classList.remove('on'); });

  const btnDash = $('btnDash');
  if (!isTouch) ui.touch.classList.add('pc');
  btnDash.addEventListener('pointerdown', e => { e.preventDefault(); pressDash(); btnDash.classList.add('on'); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) btnDash.addEventListener(t, () => btnDash.classList.remove('on'));

  $('btnStart').addEventListener('click', () => { Sfx.unlock(); openStages(); });
  $('btnRetry').addEventListener('click', () => { Sfx.unlock(); startGame(game.stage.id); });
  $('btnLobby').addEventListener('click', () => { ui.over.classList.add('hidden'); ui.title.classList.remove('hidden'); game.state = 'title'; updateLobby(); });
  for (const id of ['btnRec', 'btnRec2']) $(id).addEventListener('click', () => openRecords('rank'));
  for (const tab of document.querySelectorAll('#records .tab[data-tab]')) tab.addEventListener('click', () => openRecords(tab.dataset.tab));
  for (const b of document.querySelectorAll('#rankTabs .sub')) b.addEventListener('click', () => { rankPeriod = b.dataset.period; loadRanking(); });
  $('recClose').addEventListener('click', () => ui.records.classList.add('hidden'));
  if (isTouch) ui.help.innerHTML = '왼쪽 화면 드래그로 이동 · 오른쪽 버튼으로 공격<br>3번 연속 치면 강타! 맞을수록 피해%가 오르고 더 멀리 날아갑니다';

  function moveInput() {
    let x = 0, y = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
    if (stick.id !== null) { x += stick.x; y += stick.y; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  // ---------- 능력 ----------
  const lvl = id => (player && player.abil[id]) || 0;
  const maxLv = a => a.max || D.abilityMaxLevel;
  // 레벨 l(1부터)의 값. lv 배열을 넘는 레벨은 마지막 변화량 x grow씩 이어가고 cap에서 멈춘다
  function abVal(a, l) {
    const n = a.lv.length;
    if (l <= n) return a.lv[l - 1];
    const step = a.lv[n - 1] - a.lv[n - 2];
    let v = a.lv[n - 1] + step * (a.grow || D.abilityGrow) * (l - n);
    if (a.cap != null) v = step > 0 ? Math.min(v, a.cap) : Math.max(v, a.cap);
    return Math.round(v * 100) / 100;
  }
  // 장비 시너지: 그 능력을 이미 가지고 있으면 장비의 boost만큼 레벨이 더 오른다(효과 계산에서만. 선택지의 레벨은 그대로)
  const eqBoost = id => { let b = 0; for (const e of (player && player.eq) || []) b += EQUIP[e].boost[id] || 0; return b; };
  const ab = (id, dflt) => { const l = lvl(id); return l ? abVal(ABIL[id], l + eqBoost(id)) : dflt; };
  // 이 판에서 올린 전용 능력 레벨 합 (시너지 계산용)
  const ownedCount = () => Object.entries(player.abil).reduce((s, [id, l]) => s + (ABIL[id].only ? l : 0), 0);
  const abilSummary = () => Object.entries(player.abil).map(([id, l]) => `${ABIL[id].name} Lv${l}`).join(', ');

  function openPick() {
    // melee: true 능력은 근접 공격에만 효과가 있어서 원거리 캐릭터에게는 나오지 않는다. cap에 닿아 더 오르지 않는 능력도 뺀다
    const ranged = !!player.attackDef.ranged;
    const pool = D.abilities.filter(a => lvl(a.id) < maxLv(a) && !(lvl(a.id) && abVal(a, lvl(a.id) + 1) === abVal(a, lvl(a.id))) && !(ranged && a.melee) && (!a.only || a.only === player.ch.id) && !(a.not && a.not.includes(player.ch.id))
      && (skillOpenFn(a.id) || lvl(a.id) > 0));
    if (!pool.length) { afterPick(); return; }
    // 전용 능력은 뽑힐 확률이 D.onlyWeight배(가중치 추첨, 중복 없이 3개)
    const picked = [];
    while (picked.length < 3 && pool.length) {
      let r = Math.random() * pool.reduce((s, a) => s + (a.only ? D.onlyWeight : 1), 0), k = 0;
      for (; k < pool.length - 1; k++) { r -= pool[k].only ? D.onlyWeight : 1; if (r < 0) break; }
      picked.push(pool.splice(k, 1)[0]);
    }
    game.choices = picked;
    game.picking = true;
    releaseInput();
    ui.pickTitle.textContent = `WAVE ${game.wave + 1} CLEAR! · 능력을 하나 고르세요`;
    ui.cards.innerHTML = '';
    game.choices.forEach((a, i) => {
      const cur = lvl(a.id);
      const b = document.createElement('button');
      b.className = 'card';
      b.innerHTML = `<div class="icon">${a.icon}</div><div class="ctext"><div class="cname">${a.only ? '⭐ ' : ''}${a.name}</div>` +
        `<div class="clv">${cur ? `Lv ${cur} → ${cur + 1}` : 'NEW'}</div><div class="cdesc">${a.desc(abVal(a, cur + 1))}</div></div>` +
        (isTouch ? '' : `<div class="ckey">${i + 1}</div>`);
      b.addEventListener('click', () => choose(i));
      ui.cards.appendChild(b);
    });
    ui.btnReroll.textContent = `🎲 리롤 (${game.rerolls})` + (isTouch ? '' : ' [R]');
    ui.btnReroll.disabled = game.rerolls <= 0;
    ui.pick.classList.remove('hidden');
    ui.touch.classList.add('hidden');
  }

  // 능력 선택지를 다시 뽑는다 (시작 1회, 10스테이지 클리어마다 1회 충전)
  function reroll() {
    if (!game.picking || game.rerolls <= 0) return;
    game.rerolls--;
    openPick();
  }
  $('btnReroll').addEventListener('click', reroll);

  function choose(i) {
    const a = game.choices[i];
    if (!game.picking || !a) return;
    player.abil[a.id] = lvl(a.id) + 1;
    if (a.id === 'heavy') player.mass = D.player.mass * ab('heavy');
    if (a.id === 'second_wind') player.saves++;
    if (a.id === 'recovery') player.pct = Math.max(0, player.pct - ab('recovery'));
    game.picking = false;
    ui.pick.classList.add('hidden');
    ui.touch.classList.remove('hidden');
    Sfx.play('pick');
    afterPick();
  }

  // 능력 선택 다음: 7웨이브마다 장비상인, 아니면 바로 다음 웨이브
  function afterPick() {
    if ((game.wave + 1) % D.merchant.every === 0) openShop(true);
    else startWave(game.wave + 1);
  }

  // ---------- 장비상인 (골드로 이번 판 장비를 산다) ----------
  const shopSlots = () => D.merchant.offers + treeVal('shop');
  const priceOf = e => Math.max(1, Math.round(e.price * treeVal('discount')));
  function rollOffers() {
    const pool = shuffle(D.equips.filter(e => !player.eq.includes(e.id)));
    game.offers = pool.slice(0, shopSlots()).map(e => ({ id: e.id, sold: false }));
  }
  function openShop(fresh) {
    if (fresh) rollOffers();
    game.shopping = true;
    releaseInput();
    renderShop();
    ui.shop.classList.remove('hidden');
    ui.touch.classList.add('hidden');
  }
  function eqDesc(e) {
    const S = { knock: '공격 넉백', fin: '3타째 넉백', dmg: '주는 피해%', speed: '이동 속도', range: '사거리', taken: '받는 피해%', kbTaken: '받는 넉백',
      dash: '대시 쿨타임', cool: '능력 쿨타임', gold: '골드 획득', heal: '웨이브 클리어 회복 +', reroll: '능력 리롤 +' };
    const parts = Object.entries(e.stats).map(([k, v]) => ADD_STATS.has(k) ? `${S[k]}${v}` : `${S[k]} x${v}`);
    const bs = Object.entries(e.boost).map(([id, n]) => ABIL[id] ? `${ABIL[id].icon}${ABIL[id].name}` + (n > 1 ? ` +${n}` : '') : '').filter(Boolean);
    return { stats: parts.join(', '), boost: bs.length ? `보유 시 Lv+: ${bs.join(' · ')}` : '' };
  }
  function eqCard(e, extra) {
    const s = e.set && D.sets[e.set], d = eqDesc(e);
    return `<div class="icon">${e.icon}</div><div class="ctext"><div class="cname">${e.name}</div>` +
      (s ? `<div class="clv" style="color:${s.color}">${s.icon} ${s.name} 세트</div>` : '<div class="clv" style="color:#aaa">단품</div>') +
      `<div class="cdesc">${d.stats}</div>` + (d.boost ? `<div class="cdesc boost">${d.boost}</div>` : '') + (extra || '') + '</div>';
  }
  function renderShop() {
    ui.shopGold.textContent = `🪙 ${game.gold}`;
    ui.shopOffers.innerHTML = '';
    const full = player.eq.length >= D.merchant.maxSlots;
    game.offers.forEach((o, i) => {
      const e = EQUIP[o.id], price = priceOf(e);
      const b = document.createElement('button');
      b.className = 'card eq' + (o.sold ? ' sold' : '');
      b.disabled = o.sold || full || game.gold < price;
      b.innerHTML = eqCard(e, `<div class="price">${o.sold ? '구매 완료' : `🪙 ${price}`}</div>`);
      b.addEventListener('click', () => buyEquip(i));
      ui.shopOffers.appendChild(b);
    });
    ui.shopReroll.textContent = `🔄 새로 진열 (🪙 ${D.merchant.rerollCost})`;
    ui.shopReroll.disabled = game.gold < D.merchant.rerollCost;
    const sets = {};
    for (const id of player.eq) { const s = EQUIP[id].set; if (s) sets[s] = (sets[s] || 0) + 1; }
    ui.shopEq.innerHTML = `<div class="histTitle">내 장비 (${player.eq.length}/${D.merchant.maxSlots})${full ? ' · 장비 칸이 꽉 찼어요' : ''}</div>` +
      (player.eq.length ? `<div class="eqIcons">${player.eq.map(id => `<span title="${EQUIP[id].name}">${EQUIP[id].icon}</span>`).join('')}</div>` : '<div class="chatNote">아직 장비가 없어요</div>') +
      Object.entries(sets).map(([s, n]) => `<div class="chatNote" style="color:${D.sets[s].color}">${D.sets[s].icon} ${D.sets[s].name} ${n}/3` +
        (n >= 2 ? ` · ${D.sets[s].desc[0]}` : '') + (n >= 3 ? ` · ${D.sets[s].desc[1]}` : '') + '</div>').join('');
  }
  function buyEquip(i) {
    const o = game.offers[i], e = o && EQUIP[o.id];
    if (!e || o.sold || player.eq.length >= D.merchant.maxSlots || game.gold < priceOf(e)) return;
    game.gold -= priceOf(e);
    player.eq.push(e.id);
    o.sold = true;
    if (e.stats.reroll) game.rerolls += e.stats.reroll;
    if (e.boost.heavy) player.mass = D.player.mass * ab('heavy', 1);
    Sfx.play('pick');
    renderShop();
  }
  $('shopReroll').addEventListener('click', () => {
    if (game.gold < D.merchant.rerollCost) return;
    game.gold -= D.merchant.rerollCost;
    rollOffers(); renderShop();
  });
  $('shopLeave').addEventListener('click', () => {
    if (!game.shopping) return;
    game.shopping = false;
    ui.shop.classList.add('hidden');
    ui.touch.classList.remove('hidden');
    startWave(game.wave + 1);
  });

  // 보유 능력 아이콘을 누르면 일시정지하고 능력 설명을 보여준다
  function openSkillInfo() {
    skillOpen = true;
    releaseInput();
    ui.skillCards.innerHTML = '';
    for (const [id, l] of Object.entries(player.abil)) {
      const a = ABIL[id];
      const d = document.createElement('div');
      d.className = 'card';
      d.style.cssText = 'cursor:default;width:100%;max-width:none;flex:none;flex-direction:row;align-items:center;text-align:left';
      d.innerHTML = `<div class="icon">${a.icon}</div><div class="ctext"><div class="cname">${a.only ? '⭐ ' : ''}${a.name}</div>` +
        `<div class="clv">Lv ${l}${eqBoost(id) ? ` (+${eqBoost(id)} 장비)` : ''}</div><div class="cdesc">${a.desc(ab(id))}</div></div>`;
      ui.skillCards.appendChild(d);
    }
    // 이번 판 장비
    for (const id of player.eq) {
      const d = document.createElement('div');
      d.className = 'card';
      d.style.cssText = 'cursor:default;width:100%;max-width:none;flex:none;flex-direction:row;align-items:center;text-align:left';
      d.innerHTML = eqCard(EQUIP[id]);
      ui.skillCards.appendChild(d);
    }
    ui.skillInfo.classList.remove('hidden');
  }
  function closeSkillInfo() { skillOpen = false; ui.skillInfo.classList.add('hidden'); }
  $('skillClose').addEventListener('click', closeSkillInfo);
  ui.skillInfo.addEventListener('click', e => { if (e.target === ui.skillInfo) closeSkillInfo(); });

  // ---------- 개선 요청 채팅 ----------
  // Supabase Edge Function이 GitHub 이슈를 대신 만든다. 게임을 떠나지 않고 보낼 수 있다
  function openChat() {
    chatOpen = true;
    releaseInput();
    ui.chat.classList.remove('hidden');
    ui.btnChat.classList.add('hidden');
    // 능력 선택 화면이 뒤에 열려 있으면 포커스와 키보드(한글 IME) 입력을 가로채지 못하게 잠근다
    ui.pick.inert = true;
    // 이름 입력칸 등에 남은 포커스를 먼저 빼고, 탭 직후(사용자 동작 안)에 바로 포커스를 줘야 모바일에서 키보드가 이 입력칸으로 뜬다
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    ui.chatText.focus({ preventScroll: true });
    if (document.activeElement !== ui.chatText) requestAnimationFrame(() => ui.chatText.focus({ preventScroll: true }));
    renderChatHist();
  }
  function closeChat() {
    chatOpen = false;
    ui.chat.classList.add('hidden');
    ui.btnChat.classList.remove('hidden');
    ui.pick.inert = false;
    ui.chatText.blur();
    resize();
  }
  // 요청 현황: 공개 GitHub API로 [요청] 이슈 상태를 읽는다 (로그인 불필요). 실패하면 이 기기에서 보낸 목록만 보여준다
  function reqStatus(i) {
    const labels = i.labels.map(l => l.name);
    if (i.state === 'closed') return i.state_reason === 'not_planned' ? ['no', '반영 안 함'] : (Date.now() - new Date(i.closed_at).getTime() < 5 * 60000 ? ['work', '🚀 배포 중 (곧 적용)'] : ['done', '✅ 적용 완료']);
    if (labels.includes('작업중')) return ['work', '🔧 작업 중'];
    if (labels.includes('반영대기')) return ['work', '🕒 반영 예정'];
    if (labels.includes('일부 반영')) return ['part', '🟡 일부 반영'];
    return ['wait', '⏳ 대기 중'];
  }
  function renderChatHist() {
    ui.chatHist.innerHTML = '<div class="histTitle">요청 현황</div><div class="chatNote">불러오는 중...</div>';
    fetch(`https://api.github.com/repos/${D.feedback.repo}/issues?state=all&per_page=40`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(list => {
        const reqs = list.filter(i => !i.pull_request && i.title.startsWith('[요청]'));
        ui.chatHist.innerHTML = '<div class="histTitle">요청 현황</div>';
        if (!reqs.length) ui.chatHist.innerHTML += '<div class="chatNote">아직 접수된 요청이 없어요</div>';
        for (const i of reqs) {
          const [cls, label] = reqStatus(i);
          const a = document.createElement('a');
          a.className = 'reqItem'; a.href = i.html_url; a.target = '_blank'; a.rel = 'noopener';
          a.innerHTML = `<span class="badge ${cls}">${label}</span><span class="rt"></span><span class="rn">#${i.number}</span>`;
          a.querySelector('.rt').textContent = i.title.replace(/^\[요청\]\s*/, '');
          ui.chatHist.appendChild(a);
        }
        if (reqs.length) {
          const n = document.createElement('div');
          n.className = 'chatNote';
          n.textContent = `주인(${D.feedback.repo.split('/')[0]})의 요청은 자동으로 반영돼요. 다른 사람의 요청은 대기 중으로 남고, 주인이 그 이슈에 '반영' 댓글을 달면 작업을 시작해요. 코드가 끝나도 배포에 1~2분 걸려서, '적용 완료'가 뜬 요청부터 게임에 실제로 들어가 있어요(안 보이면 새로고침).`;
          ui.chatHist.appendChild(n);
        }
      })
      .catch(() => {
        const list = storage.get('bigguy.requests', []);
        ui.chatHist.innerHTML = '<div class="histTitle">내가 보낸 요청</div><div class="chatNote">요청 현황을 불러오지 못했어요</div>';
        for (const r of list) {
          const d = document.createElement('div');
          d.className = 'histItem'; d.textContent = r.text;
          ui.chatHist.appendChild(d);
        }
      });
  }
  function setChatMsg(text, ok) {
    ui.chatMsg.textContent = text;
    ui.chatMsg.className = 'chatMsg' + (ok === true ? ' ok' : ok === false ? ' err' : '');
  }
  let sending = false;
  async function sendRequest() {
    const text = ui.chatText.value.trim();
    if (text.length < 2) { ui.chatText.focus(); setChatMsg('요청 내용을 적어주세요', false); return; }
    if (sending) return;
    sending = true;
    ui.chatSend.disabled = true;
    setChatMsg('보내는 중...');
    const info = [
      `웨이브: ${game.state === 'title' ? '-' : game.wave + 1}`,
      `능력: ${abilSummary() || '없음'}`,
      `기기: ${isTouch ? '모바일' : 'PC'} ${W}x${H}`,
    ].join('\n');
    try {
      const res = await fetch(D.feedback.fn, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: D.ranking.key },
        body: JSON.stringify({ text, name: playerName, info, code: storage.get('bigguy.ownerCode', '') }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || res.status);
      const list = storage.get('bigguy.requests', []);
      list.unshift({ text, date: Date.now(), number: out.number });
      storage.set('bigguy.requests', list.slice(0, 10));
      ui.chatText.value = '';
      setChatMsg(out.owner ? `✅ 접수됐어요 (#${out.number}). 바로 자동 반영을 시작해요` : `✅ 접수됐어요 (#${out.number}). 주인이 확인한 뒤 반영돼요`, true);
      renderChatHist();
    } catch (e) {
      setChatMsg(`보내지 못했어요: ${e.message}. 잠시 후 다시 시도해 주세요`, false);
    } finally {
      sending = false;
      ui.chatSend.disabled = false;
    }
  }
  // 주인 코드: 이 기기에서 보낸 요청을 주인 요청으로 인정받기 위한 암호 (Edge Function의 OWNER_CODE와 같아야 함)
  function syncOwnerUI() {
    const has = !!storage.get('bigguy.ownerCode', '');
    ui.ownerToggle.textContent = has ? '🔑 주인 코드 등록됨 (바꾸기)' : '🔑 주인이신가요?';
  }
  ui.ownerToggle.addEventListener('click', () => {
    ui.ownerRow.classList.toggle('hidden');
    if (!ui.ownerRow.classList.contains('hidden')) ui.ownerCode.focus();
  });
  $('ownerSave').addEventListener('click', () => {
    storage.set('bigguy.ownerCode', ui.ownerCode.value.trim());
    ui.ownerCode.value = '';
    ui.ownerRow.classList.add('hidden');
    syncOwnerUI();
    setChatMsg(storage.get('bigguy.ownerCode', '') ? '주인 코드를 저장했어요. 맞는 코드면 요청이 바로 자동 반영돼요' : '주인 코드를 지웠어요', true);
  });
  syncOwnerUI();
  ui.btnChat.addEventListener('click', openChat);
  $('chatClose').addEventListener('click', closeChat);
  ui.chatSend.addEventListener('click', sendRequest);
  ui.chat.addEventListener('click', e => { if (e.target === ui.chat) closeChat(); });
  for (const chip of document.querySelectorAll('#chat .chip')) {
    chip.addEventListener('click', () => {
      ui.chatText.value = `[${chip.textContent}] ` + ui.chatText.value.replace(/^\[[^\]]*\]\s*/, '');
      ui.chatText.focus();
    });
  }

  // ---------- 기록 ----------
  function loadRecords() {
    const r = storage.get('bigguy.records', null);
    if (r) return r;
    const old = storage.get('bigguy.best', 0);
    return { best: old ? { score: old, wave: 0, kills: 0, date: null } : null, bestWave: 0, plays: 0, totalKills: 0, totalTime: 0, history: [] };
  }
  let records = loadRecords();

  // ---------- 캐릭터 해금 (성장 트리의 캐릭터 노드) ----------
  // 예전 업적 방식으로 이미 해금한 캐릭터(bigguy.chars)는 그대로 쓸 수 있다
  const CHARS = D.characters;
  const charById = id => CHARS.find(c => c.id === id) || CHARS[0];
  const legacyOwned = new Set([].concat(storage.get('bigguy.chars', [])));
  const charNode = id => D.tree.find(n => n.type === 'char' && n.char === id);
  const charOwned = id => id === CHARS[0].id || legacyOwned.has(id) || (charNode(id) && hasNode(charNode(id).id));
  let selChar = charOwned(storage.get('bigguy.char', '')) ? storage.get('bigguy.char', '') : CHARS[0].id;
  const saveChars = () => storage.set('bigguy.char', selChar);

  const fmtTime = s => `${Math.floor(s / 60)}분 ${Math.floor(s % 60)}초`;
  const fmtDate = t => {
    if (!t) return '-';
    const d = new Date(t), p = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const icons = abil => (abil || []).map(([id, l]) => ABIL[id] ? ABIL[id].icon + (l > 1 ? l : '') : '').join(' ');

  // ---------- 이름과 전체 랭킹 (Supabase REST) ----------
  const RANK = D.ranking;
  const rankHeaders = { apikey: RANK.key, 'Content-Type': 'application/json' };
  const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 12);
  let playerName = cleanName(storage.get('bigguy.name', ''));
  if (!playerName) {
    playerName = `빅가이${Math.floor(1000 + Math.random() * 9000)}`;
    storage.set('bigguy.name', playerName);
  }
  ui.nameInput.value = playerName;
  function saveName() {
    const n = cleanName(ui.nameInput.value);
    if (n) { playerName = n; storage.set('bigguy.name', n); }
    ui.nameInput.value = playerName;
  }
  ui.nameInput.addEventListener('change', saveName);
  ui.nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) { saveName(); ui.nameInput.blur(); Sfx.unlock(); startGame(); }
  });

  // 기록을 올리고, 나보다 높은 점수 개수로 내 순위를 계산한다
  async function submitScore(entry) {
    const body = {
      name: playerName, score: Math.min(entry.score, 10000000),
      wave: clamp(entry.wave, 1, 1000), kills: Math.min(entry.kills, 100000),
    };
    const res = await fetch(`${RANK.url}/rest/v1/scores`, {
      method: 'POST', headers: { ...rankHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(res.status);
    const cnt = await fetch(`${RANK.url}/rest/v1/scores?select=id&score=gt.${body.score}`, {
      method: 'HEAD', headers: { ...rankHeaders, Prefer: 'count=exact' },
    });
    const total = +((cnt.headers.get('content-range') || '').split('/')[1]);
    return Number.isFinite(total) ? total + 1 : null;
  }

  // 다른 사람이 정한 이름이 들어가므로 textContent로만 넣는다
  function cell(tr, text, cls) {
    const td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    tr.appendChild(td);
  }

  let rankPeriod = 'today';
  const periodSince = p => {
    if (p === 'all') return '';
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (p === 'week') d.setDate(d.getDate() - 6);
    return `&created_at=gte.${encodeURIComponent(d.toISOString())}`;
  };

  // 오늘 랭킹은 자정에 초기화되고, 주간(최근 7일)은 자정마다 가장 오래된 하루가 빠진다
  function updateRankReset() {
    if (rankPeriod === 'all') { ui.rankReset.textContent = ''; return; }
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    const s = Math.max(0, Math.floor((next - Date.now()) / 1000));
    const t = `${Math.floor(s / 3600)}시간 ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}분 ${String(s % 60).padStart(2, '0')}초`;
    ui.rankReset.textContent = rankPeriod === 'today' ? `⏳ 초기화까지 ${t}` : `⏳ 다음 갱신(가장 오래된 하루 제외)까지 ${t}`;
  }
  setInterval(() => { if (!ui.records.classList.contains('hidden') && !ui.rankBody.classList.contains('hidden')) updateRankReset(); }, 1000);

  async function loadRanking() {
    const period = rankPeriod;
    updateRankReset();
    for (const b of document.querySelectorAll('#rankTabs .sub')) b.classList.toggle('on', b.dataset.period === period);
    ui.rankList.innerHTML = '<div class="chatNote">불러오는 중...</div>';
    try {
      const res = await fetch(`${RANK.url}/rest/v1/scores?select=name,score,wave,kills&order=score.desc,created_at.asc&limit=${RANK.top}${periodSince(period)}`, { headers: rankHeaders });
      if (!res.ok) throw new Error(res.status);
      const rows = await res.json();
      if (period !== rankPeriod) return;
      ui.rankList.innerHTML = '';
      if (!rows.length) {
        ui.rankList.insertAdjacentHTML('beforeend', '<div class="histTitle">아직 이 기간의 랭킹 기록이 없어요. 첫 번째 주인공이 되어보세요!</div>');
        return;
      }
      const table = document.createElement('table');
      table.className = 'recTable';
      table.innerHTML = '<tr><th>순위</th><th>이름</th><th>점수</th><th>웨이브</th><th>처치</th></tr>';
      const medals = ['🥇', '🥈', '🥉'];
      rows.forEach((row, i) => {
        const tr = document.createElement('tr');
        if (row.name === playerName) tr.className = 'me';
        cell(tr, medals[i] || String(i + 1));
        cell(tr, row.name, 'nm');
        cell(tr, String(row.score));
        cell(tr, String(row.wave));
        cell(tr, String(row.kills));
        table.appendChild(tr);
      });
      ui.rankList.appendChild(table);
    } catch (e) {
      if (period === rankPeriod) ui.rankList.innerHTML = '<div class="histTitle">랭킹을 불러오지 못했어요. 인터넷 연결을 확인해 주세요</div>';
    }
  }

  function openRecords(tab) {
    for (const t of document.querySelectorAll('#records .tab[data-tab]')) t.classList.toggle('on', t.dataset.tab === tab);
    ui.rankBody.classList.toggle('hidden', tab !== 'rank');
    ui.recBody.classList.toggle('hidden', tab !== 'mine');
    ui.records.classList.remove('hidden');
    if (tab === 'rank') { ui.myName.textContent = `내 이름: ${playerName}`; loadRanking(); return; }
    const r = records;
    let html = `<div class="recGrid">
      <div><b>${r.best ? r.best.score : 0}</b><span>최고 점수</span></div>
      <div><b>${r.bestWave}</b><span>최고 웨이브</span></div>
      <div><b>${r.plays}</b><span>플레이 횟수</span></div>
      <div><b>${r.totalKills}</b><span>누적 처치</span></div>
      <div class="wide"><b>${fmtTime(r.totalTime)}</b><span>총 플레이 시간</span></div>
    </div>`;
    if (r.history.length) {
      html += '<div class="histTitle">최근 플레이 (점수 높은 순)</div><table class="recTable"><tr><th>날짜</th><th>점수</th><th>웨이브</th><th>처치</th><th>능력</th></tr>';
      for (const h of [...r.history].sort((a, b) => b.score - a.score)) {
        const isBest = r.best && h.date === r.best.date;
        html += `<tr${isBest ? ' class="best"' : ''}><td>${fmtDate(h.date)}</td><td>${h.score}</td><td>${h.wave}</td><td>${h.kills}</td><td class="ab">${icons(h.abil)}</td></tr>`;
      }
      html += '</table>';
    } else {
      html += '<div class="histTitle">아직 플레이 기록이 없어요</div>';
    }
    ui.recBody.innerHTML = html;
  }

  // ---------- 캐릭터 선택 화면 ----------
  function updateCharUi() {
    ui.charNow.textContent = charById(selChar).name;
  }

  // 미리보기는 별도 캔버스에 같은 그리기 함수(drawPlayer)로 그린다
  function drawPreview(cv, ch) {
    const dpr = 2, w = 90, h = 110;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(w / 2, h * 0.58);
    drawPlayer({ ch, face: Math.PI / 2, pct: 0, walk: 0, atk: null, falling: false, hurt: 0, flash: 0, combo: 0 }, 27);
    ctx = mainCtx;
  }

  function skillText(ch) {
    const a = ch.skill && ABIL[ch.skill];
    return a ? `${a.icon} ${a.name}: ${a.desc(a.lv[0])}` : '시작 능력 없음';
  }

  function attackText(ch) {
    if (!ch.attack) return '';
    const b = D.player.attack, a = ch.attack, t = [];
    if (a.ranged) return '🏹 1~4타 근접 · 5타째 원거리 전용기술';
    if (a.range && a.range !== b.range) t.push(a.range > b.range ? '사거리 길다' : '사거리 짧다');
    if (a.duration && a.duration !== b.duration) t.push(a.duration < b.duration ? '공격 빠름' : '공격 느림');
    if (a.knockback && a.knockback > b.knockback) t.push('넉백 강함');
    if (a.knockback && a.knockback < b.knockback) t.push('넉백 약함');
    if (a.arc && a.arc !== b.arc) t.push(a.arc > b.arc ? '범위 넓음' : '범위 좁음');
    if (a.lunge && a.lunge > b.lunge) t.push('돌진 큼');
    return t.join(' · ');
  }

  function openChars() {
    ui.chars.classList.remove('hidden');
    ui.btnChat.classList.add('hidden');
    renderChars();
  }

  function renderChars() {
    updateCharUi();
    ui.charList.innerHTML = '';
    for (const ch of CHARS) {
      const has = charOwned(ch.id), sel = ch.id === selChar;
      const card = document.createElement('div');
      card.className = 'charCard' + (sel ? ' sel' : '') + (has ? '' : ' locked');
      const cv = document.createElement('canvas');
      cv.className = 'charPrev';
      const info = document.createElement('div');
      info.className = 'charInfo';
      const nm = document.createElement('div'); nm.className = 'charName'; nm.textContent = ch.name;
      const ds = document.createElement('div'); ds.className = 'charDesc'; ds.textContent = ch.desc;
      const sk = document.createElement('div'); sk.className = 'charSkill'; sk.textContent = skillText(ch);
      const at = document.createElement('div'); at.className = 'charAtk'; at.textContent = attackText(ch);
      const btn = document.createElement('button');
      btn.className = 'charBtn';
      if (sel) { btn.textContent = '선택됨'; btn.disabled = true; }
      else if (has) { btn.textContent = '선택'; btn.addEventListener('click', () => { selChar = ch.id; saveChars(); renderChars(); }); }
      else {
        const n = charNode(ch.id);
        btn.textContent = '🔒 잠김';
        btn.disabled = true;
        const un = document.createElement('div'); un.className = 'charUnlock';
        un.textContent = n ? `🌳 성장 트리에서 해금 (💎 ${n.cost})` : '🔒 잠김';
        info.appendChild(un);
      }
      info.prepend(nm, ds, sk);
      if (at.textContent) info.insertBefore(at, info.children[3] || null);
      card.append(cv, info, btn);
      ui.charList.appendChild(card);
      drawPreview(cv, ch);
    }
  }
  for (const id of ['btnChars', 'btnChars2']) $(id).addEventListener('click', () => { Sfx.unlock(); openChars(); });
  $('charClose').addEventListener('click', () => { ui.chars.classList.add('hidden'); ui.btnChat.classList.remove('hidden'); });
  updateCharUi();

  // ---------- 로비: 다이아 표시, 스테이지 선택, 성장 트리, 장비 도감 ----------
  function updateLobby() {
    ui.titleDia.textContent = `💎 ${meta.dia}`;
  }
  const lobbyPanels = () => [ui.stages, ui.tree, ui.codex, ui.chars, ui.records];
  function showPanel(el) {
    for (const p of lobbyPanels()) p.classList.add('hidden');
    el.classList.remove('hidden');
    ui.btnChat.classList.add('hidden');
  }
  function closePanel(el) {
    el.classList.add('hidden');
    ui.btnChat.classList.remove('hidden');
    updateLobby();
  }

  function openStages() {
    saveName();
    ui.stageList.innerHTML = '';
    for (const S of D.stages) {
      const open = stageOpen(S), done = meta.cleared.includes(S.id), best = meta.best[S.id] || 0;
      const b = document.createElement('button');
      b.className = 'stageCard' + (open ? '' : ' locked') + (done ? ' done' : '');
      b.disabled = !open;
      b.style.setProperty('--c', S.color);
      b.innerHTML = `<div class="stName">${open ? '' : '🔒 '}${S.name}${done ? ' ✅' : ''}</div>` +
        `<div class="stSub">${S.sub} · ${S.endless ? '끝없는 웨이브' : `${S.waves}웨이브`} · 적 강화 x${S.mul}</div>` +
        `<div class="stSub">${open ? (S.endless ? `최고 ${best}웨이브` : `최고 ${best}/${S.waves}웨이브`) : `${STAGE[S.id - 1].name}를 클리어하면 열려요`}</div>`;
      b.addEventListener('click', () => { Sfx.unlock(); startGame(S.id); });
      ui.stageList.appendChild(b);
    }
    showPanel(ui.stages);
  }
  $('stagesClose').addEventListener('click', () => closePanel(ui.stages));

  // 성장 트리: 가운데에서 바깥으로 뻗는 방사형. 노드 위치는 가지 각도 + lane, 반지름 = depth
  const nodePos = n => {
    if (!n.branch) return { x: 0, y: 0 };
    const a = (D.treeBranches[n.branch].angle + (n.lane || 0) * 13) * Math.PI / 180, r = n.depth * 64;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  };
  const nodeDesc = n => n.desc || (n.type === 'char' ? `캐릭터 [${charById(n.char).name}] 해금` :
    n.type === 'skill' ? `능력 해금: ${n.skills.map(id => ABIL[id].icon + ABIL[id].name).join(', ')}` : '');
  const nodeBuyable = n => !hasNode(n.id) && (!n.req || hasNode(n.req));
  let treeSel = 'root';
  function renderTree() {
    ui.treeDia.textContent = `💎 ${meta.dia}`;
    let lines = '', dots = '';
    for (const [k, b] of Object.entries(D.treeBranches)) {
      const a = b.angle * Math.PI / 180;
      dots += `<text x="${Math.cos(a) * 322}" y="${Math.sin(a) * 322 + 5}" class="brName" fill="${b.color}">${b.icon} ${b.name}</text>`;
    }
    for (const n of D.tree) {
      if (!n.req) continue;
      const p = nodePos(n), q = nodePos(TREE[n.req]), on = hasNode(n.id);
      lines += `<line x1="${q.x}" y1="${q.y}" x2="${p.x}" y2="${p.y}" class="edge${on ? ' on' : ''}" stroke="${on ? D.treeBranches[n.branch].color : ''}"/>`;
    }
    for (const n of D.tree) {
      const p = nodePos(n), own = hasNode(n.id), can = nodeBuyable(n), col = n.branch ? D.treeBranches[n.branch].color : '#ffd84a';
      const cls = own ? 'own' : can ? 'can' : 'lock';
      dots += `<g class="node ${cls}${n.id === treeSel ? ' sel' : ''}" data-id="${n.id}" transform="translate(${p.x},${p.y})">` +
        `<circle r="${n.branch ? 21 : 26}" style="--c:${col}"/><text y="7">${n.icon}</text></g>`;
    }
    ui.treeSvg.innerHTML = lines + dots;
    for (const g of ui.treeSvg.querySelectorAll('.node')) g.addEventListener('click', () => { treeSel = g.dataset.id; renderTree(); });
    const n = TREE[treeSel], own = hasNode(n.id), can = nodeBuyable(n);
    ui.treeInfo.innerHTML = `<div class="tiName">${n.icon} ${n.name}${n.branch ? ` <span class="dim">· ${D.treeBranches[n.branch].name}</span>` : ''}</div>` +
      `<div class="tiDesc">${nodeDesc(n)}</div>` +
      (own ? '<div class="tiState ok">✅ 보유 중</div>' : can ? '' : `<div class="tiState">🔒 먼저 [${TREE[n.req].name}]을(를) 사야 해요</div>`);
    if (!own && can) {
      const b = document.createElement('button');
      b.className = 'big'; b.textContent = `💎 ${n.cost} 로 구매`;
      b.disabled = meta.dia < n.cost;
      b.addEventListener('click', () => {
        if (meta.dia < n.cost || !nodeBuyable(n)) return;
        meta.dia -= n.cost; meta.tree.push(n.id); saveMeta();
        Sfx.unlock(); Sfx.play('pick');
        renderTree();
      });
      ui.treeInfo.appendChild(b);
      if (meta.dia < n.cost) ui.treeInfo.insertAdjacentHTML('beforeend', '<div class="tiState">다이아가 부족해요. 5웨이브마다 나오는 보스를 처치하면 받아요</div>');
    }
  }
  $('btnTree').addEventListener('click', () => { Sfx.unlock(); renderTree(); showPanel(ui.tree); });
  $('treeClose').addEventListener('click', () => closePanel(ui.tree));

  // 장비 도감: 모든 장비와 세트 효과
  function renderCodex() {
    let html = '';
    const groups = [...Object.keys(D.sets), null];
    for (const s of groups) {
      const list = D.equips.filter(e => (e.set || null) === s);
      const S = s && D.sets[s];
      html += `<div class="cxHead" style="color:${S ? S.color : '#ccc'}">${S ? `${S.icon} ${S.name} 세트` : '🎒 단품 장비'}</div>`;
      if (S) html += `<div class="chatNote">2개: ${S.desc[0]} · 3개: ${S.desc[1]}</div>`;
      html += '<div class="cxGrid">' + list.map(e => `<div class="card eq">${eqCard(e, `<div class="price">🪙 ${e.price}</div>`)}</div>`).join('') + '</div>';
    }
    ui.codexList.innerHTML = html;
  }
  $('btnCodex').addEventListener('click', () => { renderCodex(); showPanel(ui.codex); });
  $('codexClose').addEventListener('click', () => closePanel(ui.codex));
  updateLobby();

  // ---------- 게임 흐름 ----------
  function makeEntity(kind, def, x, y) {
    return {
      kind, def, x, y, z: 0, vx: 0, vy: 0, vz: 0, r: def.radius, mass: def.mass,
      pct: 0, face: Math.PI / 2, state: 'chase', st: 0, hitstun: 0, flash: 0, hurt: 0, inv: 0,
      falling: false, dead: false, sqx: 1, sqy: 1, tilt: 0, spin: 0, walk: 0, atk: null,
    };
  }

  function resetGame() {
    player = makeEntity('player', D.player, 0, 0);
    const ch = charById(selChar);
    Object.assign(player, { combo: 0, comboT: 0, abil: {}, saves: 0, saveT: 0, roarT: 0, dashCd: 0, dashT: 0, dashHit: null, giantT: 0, giant: 0, grow: 1, shieldT: 0, pt: {}, clone: null, ghost: 0, revengeT: 0, starT: 0, hasteT: 0, powerT: 0, slowT: 0, slowMul: 1, ch,
      attackDef: { ...D.player.attack, ...(ch.attack || {}) } });
    if (ch.skill && ABIL[ch.skill]) {
      player.abil[ch.skill] = 1;
      if (ch.skill === 'second_wind') player.saves++;
    }
    player.eq = [];
    player.saves += treeVal('saves');
    enemies = []; particles = []; items = []; shots = []; eshots = []; zones = []; webs = [];
    Object.assign(game, { wave: 0, score: 0, kills: 0, time: 0, queue: [], spawnT: 0, meatT: -1, itemT: -1, clearT: -1, overT: 0, filled: -1, chainN: 0, chainT: 0, banner: null, picking: false,
      rerolls: 1 + st('reroll', true), choices: [], fireworks: [], gold: treeVal('startGold'), shopping: false, offers: [], diaGot: 0 });
    Object.assign(fx, { shake: 0, red: 0, zoom: 0, hitstop: 0, slow: 0 });
  }

  function startGame(stageId) {
    const S = STAGE[stageId] || D.stages[0];
    if (!stageOpen(S)) return;
    game.stage = S;
    closeSkillInfo();
    saveName();
    resetGame();
    game.state = 'play';
    for (const el of [ui.title, ui.over, ui.pick, ui.records, ui.chars, ui.stages, ui.tree, ui.codex, ui.shop]) el.classList.add('hidden');
    ui.touch.classList.remove('hidden');
    startWave(0);
  }

  // 게임 끝: 떨어졌을 때(gameOver) 또는 스테이지의 마지막 웨이브를 클리어했을 때(stageClear). 장비와 골드는 여기서 사라진다
  function gameOver() { finishRun(false); }
  function stageClear() { finishRun(true); }
  function finishRun(cleared) {
    game.state = 'over';
    game.shopping = false; game.picking = false;
    const r = records, S = game.stage;
    const entry = {
      date: Date.now(), score: game.score, wave: game.wave + 1, kills: game.kills, time: Math.round(game.time),
      abil: Object.entries(player.abil), stage: S.id, cleared,
    };
    meta.best[S.id] = Math.max(meta.best[S.id] || 0, cleared ? S.waves : game.wave);
    let opened = null;
    if (cleared && !meta.cleared.includes(S.id)) {
      meta.cleared.push(S.id);
      opened = STAGE[S.id + 1] || null;
    }
    saveMeta();
    ui.overTitle.textContent = cleared ? `${S.name} 클리어!` : '낙하!';
    ui.overTitle.classList.toggle('clear', cleared);
    const isNew = !r.best || entry.score > r.best.score;
    if (isNew) r.best = entry;
    r.bestWave = Math.max(r.bestWave, entry.wave);
    r.plays++;
    r.totalKills += entry.kills;
    r.totalTime += entry.time;
    r.history.unshift(entry);
    r.history = r.history.slice(0, 30);
    storage.set('bigguy.records', r);

    ui.overStats.innerHTML = (isNew && entry.score > 0 ? '<div class="newrec">🏆 신기록!</div>' : '') +
      `${S.name} · 점수 <b>${entry.score}</b> · WAVE ${entry.wave} · 처치 ${entry.kills} · ${fmtTime(entry.time)}<br>` +
      `<span class="dim">최고 기록 ${r.best.score} · 총 ${r.plays}판 플레이</span><br>` +
      `<span class="goldLine">💎 이번 판 다이아 +${game.diaGot} (보유 ${meta.dia})</span><br>` +
      (opened ? `<span class="goldLine">🔓 ${opened.name} 개방!</span><br>` : '') +
      (player.eq.length ? `<div class="dim">장비는 사라졌어요: ${player.eq.map(id => EQUIP[id].icon).join(' ')}</div>` : '') +
      (entry.abil.length ? `<div class="abrow">${icons(entry.abil)}</div>` : '') +
      '<div class="rankLine" id="rankLine"></div>';
    const rankLine = $('rankLine');
    if (entry.score > 0) {
      rankLine.textContent = '🌏 랭킹 등록 중...';
      submitScore(entry)
        .then(rank => { rankLine.textContent = rank ? `🌏 전체 랭킹 ${rank}위!` : '🌏 랭킹에 등록했어요'; })
        .catch(() => { rankLine.textContent = '랭킹 등록에 실패했어요 (인터넷 연결 확인)'; });
    }
    ui.over.classList.remove('hidden');
    ui.touch.classList.add('hidden');
  }

  // 같은 스테이지·웨이브는 항상 같은 구성이 나오도록 번호로 정하는 난수 (mulberry32)
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 웨이브 구성 {적 id: 마릿수}. boss: 1 은 그 스테이지의 고정 보스 (stageBoss)
  // 1~30웨이브는 data.js waves 표, 31웨이브부터와 무한 스테이지는 endless.pool에서 뽑는다
  function waveSpec(i, S = game.stage) {
    if (!S.endless && i < D.waves.length) return D.waves[i];
    const E = D.endless, G = D.gen, kinds = Object.keys(E.pool).filter(k => D.enemies[k]);
    const total = kinds.reduce((t, k) => t + E.pool[k], 0);
    const bossWave = (i + 1) % 5 === 0;
    const count = bossWave ? G.bossAdds : S.endless ? E.count : Math.min(G.max, G.base + Math.floor((i - D.waves.length) / G.every));
    const rnd = seeded(S.id * 100003 + i * 7919 + 17);
    const spec = bossWave ? { boss: 1 } : {};
    for (let n = 0; n < count; n++) {
      let r = rnd() * total, k = kinds[0];
      for (const c of kinds) { r -= E.pool[c]; if (r <= 0) { k = c; break; } }
      spec[k] = (spec[k] || 0) + 1;
    }
    return spec;
  }
  // 웨이브 i(0부터)의 고정 보스: 5웨이브마다 stages[].bosses를 순서대로 (무한은 반복)
  const bossIndex = i => Math.floor((i + 1) / 5) - 1;
  const stageBoss = (i, S = game.stage) => S.bosses[bossIndex(i) % S.bosses.length];

  // 지금 웨이브의 적 구성을 queue에 채운다. 보스는 먼저 나온다 (queue는 뒤에서부터 꺼낸다)
  function fillQueue() {
    const spec = waveSpec(game.wave);
    const isBoss = k => D.enemies[k] && D.enemies[k].boss;
    const q = [];
    for (const k in spec) for (let n = 0; n < spec[k]; n++) q.push(k === 'boss' ? stageBoss(game.wave) : k);
    shuffle(q);
    const first = game.filled !== game.wave;
    game.filled = game.wave;
    const boss = first ? q.filter(isBoss) : [];
    game.queue = q.filter(k => !isBoss(k)).concat(boss);
  }

  function startWave(i) {
    game.wave = i;
    // 아이템 효과는 웨이브가 끝날 때까지만 간다
    for (const k of ['starT', 'hasteT', 'powerT']) player[k] = 0;
    fillQueue();
    const boss = game.queue.filter(k => D.enemies[k] && D.enemies[k].boss);
    game.spawnT = 1.2;
    game.bossT = -1;
    game.clearT = -1;
    game.meatT = (i + 1) % D.meat.every === 0 ? D.meat.delay : -1;
    game.itemT = Math.random() < D.itemDrop.chance ? rand(D.itemDrop.delay[0], D.itemDrop.delay[1]) : -1;
    const S = game.stage;
    game.banner = boss.length ? { text: `BOSS WAVE ${i + 1}`, t: 2.4, max: 2.4 } : { text: `WAVE ${i + 1}`, t: 2, max: 2 };
    game.banner.sub = `${S.name}${S.waves ? ` · ${i + 1}/${S.waves}` : ''}` + (S.mul > 1 ? ` · 적 강화 x${S.mul}` : '');
    if (endlessN()) game.banner.sub += ` · 맷집 x${(1 + D.endless.tough * hardN()).toFixed(2)} · 정예 ${Math.round(eliteChance() * 100)}%`;
    Sfx.play('wave');
  }

  // 무한 스테이지에서 몇 번째 웨이브인지 (다른 스테이지는 0)
  const endlessN = () => game.stage.endless ? game.wave + 1 : 0;
  // 난이도 단계: 무한 스테이지 late.from 웨이브 이후로는 n이 boost배 빨리 오른다
  const hardN = () => {
    const n = endlessN(), L = D.endless.late;
    return L && n ? n + Math.max(0, n - L.from) * (L.boost - 1) : n;
  };
  const eliteChance = () => Math.min(D.endless.eliteMax, D.endless.elite + D.endless.eliteStep * hardN());

  function spawnEnemy(type) {
    const def = D.enemies[type];
    if (!def) return;
    const rr = R - def.radius - 6;
    let bestA = 0, bestD = -1;
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2);
      const d = Math.hypot(Math.cos(a) * rr - player.x, Math.sin(a) * rr - player.y);
      if (d > bestD) { bestD = d; bestA = a; }
      if (d > 260) break;
    }
    const e = makeEntity('enemy', def, def.boss ? 0 : Math.cos(bestA) * rr, def.boss ? 0 : Math.sin(bestA) * rr);
    e.type = type; e.skillT = 0; const fs = k => def[k] ? (def.boss ? Math.min(3, def[k].every) : def[k].every) : 0; // 보스는 착지 3초 뒤 특수기술을 바로 쓴다
    e.slamT = fs('slam'); e.sumT = fs('summon'); e.zoneT = fs('zone');
    if (def.boss) text(e.x, e.y, 120, `${def.name} 등장!`, '#ff6b6b', 28);
    e.state = 'spawn'; e.z = def.boss ? 520 : -80; e.face = def.boss ? Math.atan2(player.y, player.x) : bestA + Math.PI;
    if (def.boss) { e.drop = true; e.mass *= 1 + D.bossStep * Math.max(0, bossIndex(game.wave)); } // 보스는 그 스테이지에서 뒤에 나올수록 묵직해진다
    // 스테이지 강화: 몸무게(덜 날아감)와 공격력(피해%, 넉백)이 스테이지마다 2배
    e.mass *= game.stage.mul; e.atkMul = game.stage.mul;
    if (def.blink) e.blinkT = def.blink.every * rand(0.5, 1);
    if (def.web) e.webT = def.web.every * rand(0.4, 1);
    if (def.phase) { e.phaseC = def.phase.every * rand(0.3, 0.9); e.invulnT = 0; }
    if (def.pull) e.pullT = def.pull.every * rand(0.6, 1);
    const n = endlessN();
    if (n && !def.boss) {
      e.mass *= 1 + D.endless.tough * hardN();
      if (Math.random() < eliteChance()) { e.elite = true; e.mass *= D.endless.eliteMass; e.r *= D.endless.eliteScale; }
    }
    enemies.push(e);
  }

  function updateWaves(dt) {
    if (game.banner) { game.banner.t -= dt; if (game.banner.t <= 0) game.banner = null; }
    if (player.falling) return;
    if (game.meatT > 0 && (game.meatT -= dt) <= 0) dropMeat();
    if (game.itemT > 0 && (game.itemT -= dt) <= 0) dropItem();
    const alive = enemies.filter(e => !e.falling).length;
    // 적을 모두 내보내고 모두 쓰러뜨리면 스테이지 클리어: 잠깐 뒤 능력 선택 (선택 전까지 게임이 멈춘다)
    if (!game.queue.length && !alive) {
      if (game.clearT < 0) {
        game.clearT = 1.4;
        // 골드 정산: 웨이브마다 base + perWave x 웨이브번호 (골드 획득 배율 적용)
        const g = Math.round((D.gold.base + D.gold.perWave * (game.wave + 1)) * st('gold'));
        game.gold += g;
        text(player.x, player.y, player.r * 4, `🪙 +${g}`, '#ffd84a', 24);
        if (!game.banner || !game.banner.boss) game.banner = { text: `WAVE ${game.wave + 1} CLEAR!`, sub: `🪙 +${g}`, t: 1.4, max: 1.4 };
        Sfx.play('fanfare');
      }
      if ((game.clearT -= dt) <= 0) {
        game.clearT = -1;
        const heal = ab('recovery', 0) + st('heal');
        if (heal && player.pct > 0) {
          player.pct = Math.max(0, player.pct - heal);
          text(player.x, player.y, player.r * 2.6, `-${heal}%`, '#7dff9a', 24);
        }
        // 마지막 웨이브를 클리어하면 스테이지 클리어
        if (game.stage.waves && game.wave + 1 >= game.stage.waves) { stageClear(); return; }
        // 10웨이브 클리어마다 리롤 1회 충전
        if ((game.wave + 1) % 10 === 0) game.rerolls++;
        openPick();
      }
      return;
    }
    game.spawnT -= dt;
    const next = game.queue[game.queue.length - 1];
    if (game.spawnT <= 0 && alive < D.maxAlive) {
      if (D.enemies[next] && D.enemies[next].boss) {
        // 보스 등장 연출: 경고 문구와 붉은 화면, 흔들림 뒤에 등장한다
        if (game.bossT < 0) {
          game.bossT = 1.8;
          game.banner = { text: '⚠ WARNING ⚠', sub: D.enemies[next].name + ' 접근 중...', color: '#ff4a4a', t: 1.8, max: 1.8 };
          Sfx.play('roar');
        }
        game.bossT -= dt;
        fx.red = Math.max(fx.red, 0.35 + 0.2 * Math.sin(game.bossT * 14));
        fx.shake = Math.max(fx.shake, 3 + (1.8 - game.bossT) * 3);
        if (game.bossT <= 0) { game.bossT = -1; fx.shake = 24; fx.zoom = 0.08; spawnEnemy(game.queue.pop()); game.spawnT = D.spawnInterval; }
      } else { spawnEnemy(game.queue.pop()); game.spawnT = D.spawnInterval; }
    }
  }

  // ---------- 회복 고기 ----------
  function dropMeat() {
    const a = rand(0, Math.PI * 2), d = rand(0.15, 0.6) * R;
    items.push({ kind: 'meat', x: Math.cos(a) * d, y: Math.sin(a) * d, z: 500, vz: 0, r: D.meat.radius, t: 0 });
    text(0, 0, 200, '고기 투하!', '#ffb36b', 24);
  }

  // 필드 아이템 (data.js의 items). id를 주면 그 아이템, 없으면 가중치대로 무작위. 성장 트리에서 해금하지 않은 아이템은 나오지 않는다
  function dropItem(id) {
    const list = D.items.filter(it => itemOpen(it.id)), total = list.reduce((t, it) => t + it.weight, 0);
    if (!list.length) return;
    let def = list.find(it => it.id === id);
    if (!def) {
      let r = Math.random() * total;
      def = list.find(it => (r -= it.weight) <= 0) || list[0];
    }
    const a = rand(0, Math.PI * 2), d = rand(0.15, 0.65) * R;
    items.push({ kind: def.id, def, x: Math.cos(a) * d, y: Math.sin(a) * d, z: 500, vz: 0, r: D.itemDrop.radius, t: 0, life: def.life });
    text(Math.cos(a) * d, Math.sin(a) * d, 200, `${def.icon} ${def.name}!`, '#ffffff', 20);
  }

  function useItem(it) {
    const p = player, def = it.def;
    text(p.x, p.y, p.r * 3.4, `${def.icon} ${def.name}`, '#ffffff', 22);
    if (def.id !== 'gem') text(p.x, p.y, p.r * 4.4, def.desc, '#ffe9a8', 17);
    switch (def.id) {
      case 'bomb':
        pushAround(p, def.range, 10, def.force, true);
        ring(p.x, p.y, 4, '#ffb347', def.range / 3);
        burst(p.x, p.y, p.r, '#ffb347', 24, 520);
        fx.shake = Math.max(fx.shake, 24); fx.zoom = 0.06;
        Sfx.play('bighit'); Sfx.play('fall');
        break;
      case 'star': p.starT = Infinity; break;
      case 'drink': p.hasteT = Infinity; break;
      case 'protein': p.powerT = Infinity; break;
      case 'ice':
        for (const e of enemies) {
          if (!activeEnemy(e)) continue;
          e.frozen = e.def.boss ? def.time / 2 : def.time;
          e.state = 'stun'; e.st = 0; e.hitstun = e.frozen; e.vx = e.vy = 0;
          burst(e.x, e.y, e.r, '#bfe8ff', 8, 220);
        }
        fx.shake = Math.max(fx.shake, 8 * 0.8);
        break;
      case 'gem': {
        const pts = def.score * (game.wave + 1);
        game.score += pts;
        text(p.x, p.y, p.r * 2.2, `+${pts}`, '#ffd84a', 24);
        break;
      }
    }
    Sfx.play('pick');
  }

  function updateItems(dt) {
    for (const it of items) {
      it.t += dt;
      if (it.life != null && (it.life -= dt) <= 0) { it.taken = true; burst(it.x, it.y, 6, '#ffffff', 6, 150); continue; }
      if (it.z > 0) {
        it.vz -= GRAVITY * dt; it.z += it.vz * dt;
        if (it.z <= 0) { it.z = 0; it.vz = 0; burst(it.x, it.y, 2, '#d8d2c0', 8, 200); }
        continue;
      }
      const p = player;
      if (p.falling || Math.hypot(p.x - it.x, p.y - it.y) > p.r + it.r) continue;
      it.taken = true;
      if (it.kind !== 'meat') { useItem(it); continue; }
      const mh = Math.round(D.meat.heal * ab('meat_lover', 1));
      const heal = Math.min(mh, Math.round(p.pct));
      p.pct = Math.max(0, p.pct - mh);
      burst(it.x, it.y, 10, '#7dff9a', 12, 260);
      text(p.x, p.y, p.r * 3, heal > 0 ? `냠! -${heal}%` : '냠!', '#7dff9a', 26);
      Sfx.play('pick');
    }
    items = items.filter(it => !it.taken);
  }

  // ---------- 파티클 ----------
  function burst(x, y, z, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(0.4, 1) * spd, life = rand(0.2, 0.4);
      particles.push({ type: 'spark', x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(-0.3, 1) * s * 0.6, life, max: life, color, size: rand(2, 4) });
    }
  }
  // size는 최종적으로 퍼지는 반지름의 약 1/3
  function ring(x, y, z, color, size) {
    particles.push({ type: 'ring', x, y, z, life: 0.3, max: 0.3, color, size });
  }
  function cross(x, y, z, color, size) {
    particles.push({ type: 'cross', x, y, z, vz: 60, life: 0.9, max: 0.9, color, size });
  }
  function text(x, y, z, str, color, size) {
    particles.push({ type: 'text', x, y, z, vz: 70, life: 0.9, max: 0.9, str, color, size });
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      if (p.type === 'spark') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const f = Math.exp((p.fw ? -1.8 : -5) * dt); p.vx *= f; p.vy *= f; p.vz *= f;
        if (p.fw) p.vz -= 220 * dt;
      } else if (p.type === 'text' || p.type === 'cross') {
        p.z += p.vz * dt; p.vz *= Math.exp(-2 * dt);
      }
    }
    particles = particles.filter(p => p.life > 0);
  }

  // ---------- 전투 ----------
  // 점프 중인 적(jumper의 attack 상태)은 무적이라 공격·충격파·아이템에 맞지 않는다
  const activeEnemy = e => !e.falling && e.state !== 'spawn' && !(e.jump && e.state === 'attack');

  function nearestEnemy(p, maxD) {
    let best = null, bd = maxD;
    for (const e of enemies) {
      if (!activeEnemy(e)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // 반경 안의 적을 바깥으로 밀어낸다 (충격파, 기합, 반격 공용)
  function pushAround(p, radius, dmg, force, heavy, skip) {
    for (const e of enemies) {
      if (!activeEnemy(e) || (skip && skip.has(e))) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > radius + e.r) continue;
      hitEnemy(e, dx / d, dy / d, dmg, force, heavy);
    }
    ring(p.x, p.y, 4, heavy ? '#8fd3ff' : '#ffffff', radius / 3.2);
  }

  const CLONE_DELAY = 1;
  function startAttack(p) {
    const a = p.attackDef;
    p.combo = (p.comboT > 0 ? p.combo : 0) + 1;
    const cycle = a.ranged ? Math.max(3, (a.ranged.every || 5) - ab('m_flow', 0) - ab('so_flow', 0) - ab('ar_flow', 0)) : 3;
    if (p.combo > cycle) p.combo = 1;
    p.comboT = a.comboWindow + a.duration;
    const finisher = p.combo === cycle;
    const spin = finisher && !a.ranged && lvl('cyclone') > 0;
    const ranged = finisher && !!a.ranged;
    const range = ranged ? a.ranged.range : a.range * ab('long_reach', 1) * st('range') * (spin ? ab('cyclone') : 1) * (1 + (p.grow - 1) * (a.growReach ?? 1)) * (finisher && a.finRange || 1) * (finisher ? ab('g_sweep', 1) : 1);
    p.atk = { def: a, t: 0, hit: new Set(), finisher, spin: spin && !ranged, ranged, fired: false, shocked: false, range, arc: spin && !ranged ? 360 : a.arc + (ranged ? 0 : ab('wide_swing', 0) + (finisher ? ab('w_lariat', 0) : 0)),
      pose: p.idleT >= 1.5 };
    p.idleT = 0;
    const tgt = nearestEnemy(p, range + 70);
    if (tgt) p.face = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    if (p.clone) p.clone.q.push({ at: p.clone.clk + CLONE_DELAY, def: a, finisher, spin: spin && !ranged, ranged, range, arc: p.atk.arc, face: p.face });
    // 캐릭터 전용: 3타째를 시작할 때 나가는 효과 (스모 기합, 요리사 플랑베, 닌자 수리검, 장군 투창)
    if (finisher && !ranged) {
      if (lvl('s_shout')) { pushAround(p, ab('s_shout'), 3, 520, true); fx.shake = Math.max(fx.shake, 8); }
      if (lvl('c_flambe')) {
        for (const e of enemies) {
          if (!activeEnemy(e) || e.z < -1 || Math.hypot(e.x - p.x, e.y - p.y) > ab('c_flambe') + e.r) continue;
          e.burnT = 3 + ab('c_spice', 0); e.burnDps = Math.max(e.burnDps || 0, 6 + ab('c_flame', 0));
        }
        ring(p.x, p.y, p.r, '#ff8a3c', ab('c_flambe') / 3.2);
      }
      if (lvl('n_shuriken')) throwShots(p, Math.round(ab('n_shuriken')), 0.9, 560, 4, 380, false, '#dfe6f0', 'bullet');
      if (lvl('g_javelin')) throwShots(p, 1, 0, 900, 6, ab('g_javelin'), true, '#f4e3b0', 'arrow');
    }
    if (!spin && a.lunge) {
      const lg = a.lunge * (finisher && a.finLunge || 1) * ab('lunge', 1) * (finisher ? ab('w_rope', 1) : 1);
      p.vx += Math.cos(p.face) * lg;
      p.vy += Math.sin(p.face) * lg;
    }
    Sfx.play(finisher ? 'whoosh' : 'swish');
  }

  // 원거리 공격: 발사체를 쏜다. 5타째(ranged.every)는 캐릭터 전용기술(ranged.fin)로 바뀐다
  function fireShots(p, a) {
    const R0 = a.def.ranged, fin = a.finisher ? R0.fin : null;
    // 전용 능력: 전용기술 발사체 수 증가(구슬 분열, 점사, 다발 사격), 넉백/폭발/관통 강화
    const extra = a.finisher ? Math.round(ab('m_split', 0) + ab('so_burst', 0) + ab('ar_multi', 0)) : 0;
    const n = ((fin && fin.count) || 1) + extra, spread = Math.max((fin && fin.spread) || 0, extra ? 0.22 * (n - 1) : 0);
    const dmg = a.def.damage * ab('pump', 1) * (a.finisher ? 1.5 : 1) * st('dmg');
    let kb = a.def.knockback * ab('iron_fist', 1) * (a.finisher ? a.def.finisherMul * ab('so_snipe', 1) * ab('ar_power', 1) * st('fin') : 1) / (n > 1 ? 1.4 : 1) * st('knock');
    const boom = a.finisher ? ((fin && fin.boom) || 0) + (fin && fin.boom ? ab('m_boom', 0) : 0) + ab('so_grenade', 0) : 0;
    const pierce = a.finisher && (!!(fin && fin.pierce) || lvl('so_pierce') > 0 || lvl('ar_pierce') > 0);
    if (a.finisher && lvl('m_ward')) p.inv = Math.max(p.inv, ab('m_ward'));
    kb *= (1 + p.pct / 100 * ab('berserk', 0)) * (p.powerT > 0 ? ITEM.protein.mul : 1);
    if (Math.hypot(p.x, p.y) > R * 0.7) kb *= ab('last_stand', 1);
    const sp = (fin && fin.speed) || R0.speed;
    for (let i = 0; i < n; i++) {
      const ang = p.face + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
      shots.push({
        x: p.x + Math.cos(ang) * p.r, y: p.y + Math.sin(ang) * p.r, ang, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        r: (fin && fin.radius) || R0.radius, hitScale: R0.hitScale || 1, color: (fin && fin.color) || R0.color, shape: R0.shape, left: a.range,
        dmg, kb, heavy: a.finisher, pierce: pierce && !boom, boom, bounce: boom && a.finisher ? Math.round(ab('m_bounce', 0)) : 0, hit: new Set(), fin: a.finisher,
      });
    }
    burst(p.x + Math.cos(p.face) * p.r * 1.4, p.y + Math.sin(p.face) * p.r * 1.4, p.r * 0.6, R0.color, a.finisher ? 8 : 4, 200);
    Sfx.play(a.finisher ? 'whoosh' : 'swish');
  }

  // 전용 능력 발사체(수리검, 투창): 능력 효과라 다른 능력 배율은 붙지 않는다
  function throwShots(p, n, spread, speed, r, kb, pierce, color, shape) {
    for (let i = 0; i < n; i++) {
      const ang = p.face + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
      shots.push({
        x: p.x + Math.cos(ang) * p.r, y: p.y + Math.sin(ang) * p.r, ang, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        r, color, shape, left: R * 1.4, dmg: 4, kb, heavy: pierce, pierce, boom: 0, hit: new Set(), special: true,
      });
    }
  }

  // 운석: 자리 표시 -> 낙하 -> 착지(폭발과 피해)
  function updateMeteors(dt) {
    for (const m of meteors) {
      m.t += dt;
      if (m.hit || m.t < m.warn + m.fall) continue;
      m.hit = true;
      const e = enemies.find(o => activeEnemy(o) && o.z > -1 && Math.hypot(o.x - m.x, o.y - m.y) < 40);
      pushAround({ x: m.x, y: m.y, r: 0 }, 80, 8, 650, true, new Set(e ? [e] : []));
      if (e) hitEnemy(e, Math.random() - 0.5, Math.random() - 0.5, 8, 650, true);
      burst(m.x, m.y, 10, '#ff8a3c', 30, 460);
      ring(m.x, m.y, 10, '#ff8a3c', 90);
      fx.shake = Math.max(fx.shake, 12);
    }
    meteors = meteors.filter(m => !m.hit);
  }

  function updateShots(dt) {
    for (const s of shots) {
      const step = Math.hypot(s.vx, s.vy) * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.left -= step;
      if (s.rehit) for (const [e, t] of s.hitT) { if (t <= dt) s.hitT.delete(e); else s.hitT.set(e, t - dt); }
      for (const e of enemies) {
        if (s.dead || !activeEnemy(e) || e.z < -1) continue;
        if (s.rehit ? s.hitT.has(e) : s.hit.has(e)) continue;
        const dx = e.x - s.x, dy = e.y - s.y;
        if (Math.hypot(dx, dy) > e.r + s.r * (s.hitScale || 1)) continue;
        s.hit.add(e);
        if (s.rehit) s.hitT.set(e, s.rehit);
        let kb = s.kb;
        if (e.pct >= 100) kb *= ab('execute', 1);
        if (!s.special) kb *= specialKb(player);
        const nx = Math.cos(s.ang), ny = Math.sin(s.ang);
        hitEnemy(e, nx, ny, s.dmg, kb, s.heavy);
        if (!s.special) elementHit(e);
        if (s.fin && lvl('ar_fire')) { e.burnT = 3; e.burnDps = ab('ar_fire'); }
        const vamp = s.special ? 0 : ab('vampire', 0);
        if (vamp && player.pct > 0) player.pct = Math.max(0, player.pct - vamp);
        if (s.boom) {
          if (s.fin && lvl('m_curse')) for (const o of enemies) {
            if (o !== e && activeEnemy(o) && !o.invulnT && Math.hypot(o.x - s.x, o.y - s.y) < s.boom + o.r) o.pct += ab('m_curse');
          }
          if (s.fin && lvl('m_curse') && !e.invulnT) e.pct += ab('m_curse');
          ring(s.x, s.y, 6, s.color, s.boom / 3);
          burst(s.x, s.y, 8, s.color, 14, 420);
          pushAround({ x: s.x, y: s.y }, s.boom, 3, 520, true, s.hit);
          fx.shake = Math.max(fx.shake, 12 * 0.64);
          // 튕기는 구슬: 터진 뒤 가까운 다른 적에게 방향을 바꿔 다시 날아간다
          let nt = null, nd = 320;
          if (s.bounce > 0) for (const o of enemies) {
            const d = Math.hypot(o.x - s.x, o.y - s.y);
            if (!s.hit.has(o) && activeEnemy(o) && o.z > -1 && d < nd) { nt = o; nd = d; }
          }
          if (nt) {
            s.bounce--;
            s.ang = Math.atan2(nt.y - s.y, nt.x - s.x);
            const sp = Math.hypot(s.vx, s.vy);
            s.vx = Math.cos(s.ang) * sp; s.vy = Math.sin(s.ang) * sp;
            s.left = Math.max(s.left, nd + 80);
          } else s.dead = true;
        } else if (!s.pierce) s.dead = true;
      }
      if (s.left <= 0 || Math.hypot(s.x, s.y) > R * 1.6) s.dead = true;
    }
    shots = shots.filter(s => !s.dead);
  }

  // 적 발사체와 장판
  function updateEnemyShots(dt) {
    const p = player, grounded = !p.falling && p.z <= 20 && game.state === 'play';
    for (const s of eshots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.left -= Math.hypot(s.vx, s.vy) * dt;
      if (grounded && Math.hypot(p.x - s.x, p.y - s.y) < p.r + s.r) {
        const l = Math.hypot(s.vx, s.vy) || 1;
        const vuln = !(p.inv > 0 || p.starT > 0);
        hitPlayer(s.from, s.vx / l, s.vy / l, s.from.def.attack);
        if (s.slow && vuln) { p.slowT = s.slow.time; p.slowMul = s.slow.mul; text(p.x, p.y, p.r * 3.6, '느려졌다!', '#bfe9ff', 18); }
        burst(s.x, s.y, s.r, s.color, 8, 300);
        s.dead = true;
      }
      if (s.left <= 0 || Math.hypot(s.x, s.y) > R * 1.6) s.dead = true;
    }
    eshots = eshots.filter(s => !s.dead);
    for (const w of webs) {
      w.t += dt;
      if (grounded && !p.ghost && Math.hypot(p.x - w.x, p.y - w.y) < w.r + p.r * 0.3) { p.slowT = Math.max(p.slowT, 0.25); p.slowMul = w.slow; }
    }
    webs = webs.filter(w => w.t < w.life);
    for (const z of zones) {
      z.t += dt;
      if (z.t < z.windup) continue;
      z.dead = true;
      ring(z.x, z.y, 2, '#ff7fe0', z.r * 0.4);
      burst(z.x, z.y, 2, '#ff9bea', 14, 320);
      fx.shake = Math.max(fx.shake, 10);
      Sfx.play('fall');
      const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy);
      if (grounded && d <= z.r + p.r) hitPlayer(z.from, dx / (d || 1), dy / (d || 1), { damage: z.dmg, force: z.force });
    }
    zones = zones.filter(z => !z.dead);
  }

  // 특별 스킬: every초마다 저절로 발동한다(p.pt[id] = 쌓인 시간)
  // 쿨타임 감소 능력(skill_cool): 몇 초마다 발동하는 능력의 대기 시간 배율
  const coolMul = () => ab('skill_cool', 1) * st('cool');
  function specialReady(p, id, dt) {
    if (!lvl(id)) return false;
    p.pt[id] = (p.pt[id] || 0) + dt;
    if (p.pt[id] < ABIL[id].every * coolMul()) return false;
    p.pt[id] = 0;
    return true;
  }
  function updateSpecials(p, dt) {
    if (p.revengeT > 0) p.revengeT -= dt;
    // 바위 굴리기: 큰 바위가 앞으로 굴러가며 맞은 적을 날린다
    if (specialReady(p, 'rock_roll', dt)) {
      const tgt = nearestEnemy(p, R * 1.5);
      const ang = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.face, sp = 360;
      shots.push({
        x: p.x + Math.cos(ang) * p.r, y: p.y + Math.sin(ang) * p.r, ang, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        r: 36, color: '#8b857a', shape: 'rock', left: R * 1.7, dmg: 8, kb: ab('rock_roll'), heavy: true, pierce: true, boom: 0, hit: new Set(), rehit: 0.1, hitT: new Map(), special: true,
      });
      text(p.x, p.y, p.r * 3, '바위 굴러간다!', '#d9d2c4', 20);
      Sfx.play('whoosh');
    }
    // 분신술: 잠시 분신이 곁을 돌며 주변 적을 밀친다
    if (!p.clone && specialReady(p, 'clone', dt)) {
      p.clone = { x: p.x, y: p.y, t: ab('clone'), clk: 0, trail: [{ t: 0, x: p.x, y: p.y, face: p.face }], q: [], atk: null, face: p.face };
      ring(p.x, p.y, p.r, '#9fe6ff', p.r * 2);
      text(p.x, p.y, p.r * 3, '분신술!', '#9fe6ff', 24);
      Sfx.play('roar');
    } else if (p.clone) {
      const c = p.clone;
      c.t -= dt; c.clk += dt;
      // 분신은 내가 1초 전에 한 움직임과 공격을 그대로 따라 한다
      c.trail.push({ t: c.clk, x: p.x, y: p.y, face: p.face });
      while (c.trail.length > 2 && c.trail[1].t <= c.clk - CLONE_DELAY) c.trail.shift();
      const past = c.trail[0];
      c.x = past.x; c.y = past.y; c.face = past.face;
      if (Math.hypot(c.x, c.y) > R * 0.95) { const k = R * 0.95 / Math.hypot(c.x, c.y); c.x *= k; c.y *= k; }
      while (c.q.length && c.q[0].at <= c.clk) {
        const ev = c.q.shift();
        c.face = ev.face;
        c.atk = { def: ev.def, t: 0, finisher: ev.finisher, spin: ev.spin, ranged: ev.ranged, range: ev.range, arc: ev.arc, face: ev.face, hit: new Set(), done: false };
      }
      if (c.atk) {
        const a = c.atk, def = a.def;
        a.t += dt;
        c.face = a.face ?? c.face;
        if (!a.done && a.t >= def.active[0]) {
          a.done = true;
          const fxv = Math.cos(c.face), fyv = Math.sin(c.face);
          for (const e of enemies) {
            if (!activeEnemy(e)) continue;
            const dx = e.x - c.x, dy = e.y - c.y, d = Math.hypot(dx, dy);
            const rng = a.ranged ? 260 : a.range;
            if (d > rng + e.r) continue;
            if (Math.abs(angDiff(Math.atan2(dy, dx), c.face)) > a.arc * Math.PI / 360 && d > p.r + e.r) continue;
            const mix = a.spin ? 0 : 0.6;
            let nx = dx / (d || 1) + fxv * mix, ny = dy / (d || 1) + fyv * mix;
            const nl = Math.hypot(nx, ny) || 1;
            hitEnemy(e, nx / nl, ny / nl, def.damage * (a.finisher ? 1.5 : 1), def.knockback * (a.finisher ? def.finisherMul : 1) * 0.8, a.finisher);
          }
          ring(c.x, c.y, 4, '#9fe6ff', a.finisher ? 30 : 20);
        }
        if (a.t >= def.duration) c.atk = null;
      }
      if (c.t <= 0) { ring(c.x, c.y, 20, '#9fe6ff', 50); p.clone = null; }
    }
    // 유령화: 잠깐 공격을 받지 않고 적을 통과한다
    if (p.ghost > 0) {
      p.ghost -= dt;
      p.inv = Math.max(p.inv, 0.1);
    } else if (specialReady(p, 'ghost', dt)) {
      p.ghost = ab('ghost');
      ring(p.x, p.y, p.r, '#e8e8ff', p.r * 2);
      text(p.x, p.y, p.r * 3, '유령화!', '#e8e8ff', 24);
      Sfx.play('roar');
    }
    // 운석 소환: 가까운 적부터 위에서 떨어진다
    if (specialReady(p, 'meteor', dt)) {
      const list = enemies.filter(e => activeEnemy(e) && e.z > -1).sort(() => Math.random() - 0.5).slice(0, ab('meteor'));
      for (const e of list) meteors.push({ x: e.x, y: e.y, t: 0, warn: 0.7, fall: 0.35, hit: false });
      if (list.length) { text(p.x, p.y, p.r * 3, '운석!', '#ff8a3c', 24); Sfx.play('fall'); }
    }
    // 시간 정지: 모든 적이 잠깐 얼어붙는다
    if (specialReady(p, 'time_stop', dt)) {
      const t = ab('time_stop');
      for (const e of enemies) {
        if (!activeEnemy(e)) continue;
        e.frozen = Math.max(e.frozen || 0, e.def.boss ? t / 2 : t);
        e.vx *= 0.3; e.vy *= 0.3;
      }
      ring(p.x, p.y, p.r, '#c8b8ff', 400);
      text(p.x, p.y, p.r * 3, '시간 정지!', '#c8b8ff', 26);
      Sfx.play('pick');
    }
    // 대지진
    if (specialReady(p, 'stomp', dt)) {
      pushAround(p, ab('stomp'), 6, 750, true);
      fx.shake = Math.max(fx.shake, 20); fx.zoom = Math.max(fx.zoom, 0.05);
      burst(p.x, p.y, p.r, '#b08a5a', 20, 520);
      text(p.x, p.y, p.r * 3, '쿵!', '#ffd9a0', 30);
      Sfx.play('bighit');
    }
    // 대포: 가장 가까운 적에게 폭탄을 쏜다
    if (specialReady(p, 'cannon', dt)) {
      const tgt = nearestEnemy(p, R * 2);
      if (tgt) {
        const ang = Math.atan2(tgt.y - p.y, tgt.x - p.x), sp = 600;
        shots.push({
          x: p.x + Math.cos(ang) * p.r, y: p.y + Math.sin(ang) * p.r, ang, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          r: 13, color: '#ff6a3c', shape: 'bomb', left: R * 2, dmg: 6, kb: 520, heavy: true, pierce: false, boom: ab('cannon'), hit: new Set(), special: true,
        });
        Sfx.play('whoosh');
      } else p.pt.cannon = ABIL.cannon.every * coolMul() - 0.5;
    }
  }

  // 공격 넉백에 붙는 특별 스킬 배율: 치명타, 복수
  function specialKb(p) {
    let m = 1;
    if (lvl('crit') && Math.random() < ab('crit')) {
      m *= 2.5;
      text(p.x, p.y, p.r * 3.5, '치명타!', '#ff5a5a', 24);
    }
    if (p.revengeT > 0) m *= ab('revenge', 1);
    return m;
  }

  function updatePlayer(p, dt) {
    if (p.falling) return;
    p.comboT = Math.max(0, p.comboT - dt);
    if (game.state !== 'play') return;

    if (lvl('roar')) {
      p.roarT += dt;
      if (p.roarT >= ab('roar') * coolMul()) {
        p.roarT = 0;
        pushAround(p, 140, 2, 650, false);
        text(p.x, p.y, p.r * 3, '흐읍!', '#ffffff', 22);
        Sfx.play('roar');
      }
    }

    if (lvl('shield') && p.shieldT < ab('shield') * coolMul()) p.shieldT += dt;
    updateSpecials(p, dt);
    // 아이템 지속 효과
    for (const k of ['starT', 'hasteT', 'powerT']) if (p[k] > 0) p[k] -= dt;
    const haste = p.hasteT > 0 ? ITEM.drink.mul : 1, power = p.powerT > 0 ? ITEM.protein.mul : 1;

    // 재생: 5초마다 한 번, 1초당 회복량의 5배를 회복하고 초록 십자가가 뜬다
    const rg = ab('regen', 0);
    if (rg) {
      p.regenT = (p.regenT || 0) + dt;
      if (p.regenT >= 5 * coolMul()) {
        p.regenT = 0;
        if (p.pct > 0) {
          p.pct = Math.max(0, p.pct - rg * 5);
          cross(p.x, p.y, p.r * 2.2, '#3dff6a', p.r * 0.9);
        }
      }
    }

    // 거대화: 일정 시간마다 몸집이 커졌다가 돌아온다
    if (lvl('giant')) {
      const G = ABIL.giant;
      if (p.giant > 0) {
        p.giant -= dt;
        if (p.giant <= 0) p.giantT = 0;
      } else if ((p.giantT += dt) >= G.every * coolMul()) {
        p.giant = ab('giant');
        fx.shake = Math.max(fx.shake, 16 * 0.8);
        ring(p.x, p.y, p.r, '#ffd84a', p.r * 2);
        text(p.x, p.y, p.r * 4, '거대화!', '#ffd84a', 30);
        Sfx.play('roar');
      }
    }
    p.grow += ((p.giant > 0 ? ABIL.giant.scale : 1) - p.grow) * Math.min(1, dt * 6);
    p.r = D.player.radius * p.grow;
    p.mass = D.player.mass * (p.ch.mass || 1) * ab('heavy', 1) * p.grow * (1 + Math.min(p.pct, 200) / 100 * ab('s_dohyo', 0));
    if (p.counterT > 0) p.counterT -= dt;

    // 대시: 쿨타임이 차면 버튼으로 바라보는(또는 움직이는) 방향으로 돌진한다
    const DS = D.player.dash;
    const dashFull = DS.cooldown * ab('dash_cool', 1) * (p.ch.dashCool || 1) * st('dash');
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.hitstun <= 0 && p.dashT <= 0 && p.dashCd <= 0 && consumeDash()) {
      const mv = moveInput();
      if (Math.hypot(mv.x, mv.y) > 0.2) p.face = Math.atan2(mv.y, mv.x);
      p.dashT = DS.time; p.dashCd = dashFull; p.dashHit = new Set(); p.atk = null;
      // 닌자 연막탄: 대시를 시작한 자리 주변 적이 잠깐 멈춘다
      if (lvl('n_smoke')) {
        for (const e of enemies) {
          if (!activeEnemy(e) || e.z < -1 || Math.hypot(e.x - p.x, e.y - p.y) > 180 + e.r) continue;
          const t = ab('n_smoke') * (e.def.boss ? 0.5 : 1);
          if (t > (e.frozen || 0)) e.frozen = t;
        }
        burst(p.x, p.y, p.r * 1.5, '#9aa0b4', 14, 220); ring(p.x, p.y, p.r, '#9aa0b4', 60);
      }
      p.inv = Math.max(p.inv, DS.time + ab('dash_ghost', 0) + DS.inv);
      ring(p.x, p.y, p.r, '#8fd3ff', p.r * 1.6);
      Sfx.play('roar');
    }
    if (p.dashT > 0 && p.hitstun > 0) p.dashT = 0;
    if (p.dashT > 0) {
      p.dashT -= dt;
      const sp = DS.speed * ab('dash_far', 1);
      p.x += Math.cos(p.face) * sp * dt;
      p.y += Math.sin(p.face) * sp * dt;
      p.walk += dt * 30;
      if (Math.random() < 0.8) burst(p.x, p.y, p.r * 0.6, '#bfe8ff', 1, 120);
      const ram = ab('dash_ram', 0), shade = ab('n_shadow', 0);
      if (ram || shade) for (const e of enemies) {
        if (p.dashHit.has(e) || !activeEnemy(e)) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > p.r + e.r + 10) continue;
        p.dashHit.add(e);
        if (ram) hitEnemy(e, dx / d, dy / d, 4, ram, true);
        if (shade && !e.invulnT) {
          e.pct += shade; e.flash = 0.12;
          ring(e.x, e.y, e.r, '#c9b8ff', e.r * 0.8);
          text(e.x, e.y, e.r * 2.2, `${Math.round(e.pct)}%`, '#c9b8ff', 16);
        }
      }
      if (p.dashT <= 0) {
        p.vx *= 0.3; p.vy *= 0.3;
        const q = ab('dash_quake', 0);
        if (q) { pushAround(p, q, 3, 500, true); fx.shake = Math.max(fx.shake, 14 * 0.8); }
      }
      return;
    }

    if (p.hitstun > 0) {
      p.hitstun -= dt;
    } else {
      const mv = moveInput();
      const m = Math.hypot(mv.x, mv.y);
      if (p.slowT > 0) p.slowT -= dt;
      const speed = D.player.speed * (p.ch.speed || 1) * ab('quick_feet', 1) * st('speed') * haste * (p.atk ? Math.min(1, 0.35 * ab('n_swift', 1)) : 1) * (p.slowT > 0 ? p.slowMul : 1);
      if (m < 0.2) p.idleT = (p.idleT || 0) + dt; else p.idleT = 0;
      p.x += mv.x * speed * dt;
      p.y += mv.y * speed * dt;
      if (m > 0.2 && !p.atk) p.face = Math.atan2(mv.y, mv.x);
      p.walk += m * dt * 12;
      if (!p.atk && (consumeAttack() || attackHeld())) startAttack(p);
    }

    const a = p.atk;
    if (!a) return;
    let spd = ab('rapid', 1) * haste;
    if (p.pct >= 50) spd *= ab('b_headband', 1);
    if (p.counterT > 0) spd *= ab('x_counter', 1);
    if (a.finisher) spd *= ab('g_drill', 1); else spd *= ab('x_jab', 1);
    a.t += dt * spd;
    const def = a.def;
    if (a.ranged) {
      if (!a.fired && a.t >= (def.ranged.at ?? def.active[0])) { a.fired = true; fireShots(p, a); }
    } else if (a.t >= def.active[0] && a.t <= def.active[1]) {
      const fxv = Math.cos(p.face), fyv = Math.sin(p.face);
      for (const e of enemies) {
        if (a.hit.has(e) || !activeEnemy(e)) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
        if (d > a.range + e.r) continue;
        const off = Math.abs(angDiff(Math.atan2(dy, dx), p.face));
        if (off > a.arc * Math.PI / 360 && d > p.r + e.r) continue;
        a.hit.add(e);
        // 위치 방향과 공격 방향을 섞어서 날린다 (회전 공격은 바깥으로)
        const mix = a.spin ? 0 : 0.6;
        let nx = dx / (d || 1) + fxv * mix, ny = dy / (d || 1) + fyv * mix;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        const dmg = def.damage * ab('pump', 1) * (a.finisher ? 1.5 : 1) * st('dmg');
        let kb = def.knockback * ab('iron_fist', 1) * (a.finisher ? def.finisherMul * st('fin') : 1) * p.grow * power * st('knock');
        kb *= 1 + p.pct / 100 * ab('berserk', 0);
        if (e.pct >= 100) kb *= ab('execute', 1);
        if (Math.hypot(p.x, p.y) > R * 0.7) kb *= ab('last_stand', 1);
        kb *= specialKb(p);
        // 캐릭터 전용 능력의 넉백 배율
        kb *= 1 + Math.min(game.chainN, 10) * ab('b_festival', 0) / 100;
        if (a.finisher) kb *= ab('x_hook', 1);
        if (a.pose) kb *= ab('w_pose', 1);
        if (d > a.range * 0.65) kb *= ab('g_tip', 1);
        if (e.pct < 30) kb *= ab('g_first', 1);
        if (e.pct >= 100) kb *= ab('w_spirit', 1);
        if (e.burnT > 0) kb *= ab('c_pan', 1);
        // 전용 능력 2차(캐릭터별 개성 + 시너지)
        if (p.pct < 20) kb *= ab('b_encore', 1);
        if (lvl('n_blur') && p.dashT > 0) kb *= ab('n_blur');
        if (a.finisher) kb *= ab('s_thrust', 1);
        if (e.pct >= 60) kb *= ab('g_charge', 1);
        if (p.pct >= 60) kb *= ab('w_comeback', 1);
        if (e.burnT > 0 && a.finisher) kb *= ab('c_sear', 1);
        kb *= 1 + Math.max(0, ownedCount() - D.onlySynergy.from) * D.onlySynergy.pct / 100; // 전용 능력을 많이 올린 시너지
        if (lvl('n_backstab') && Math.cos(e.face) * fxv + Math.sin(e.face) * fyv > 0.3) { kb *= ab('n_backstab'); text(e.x, e.y - e.r, e.r * 3, '암습!', '#d6d6e8', 20); }
        hitEnemy(e, nx, ny, dmg, kb, a.finisher);
        // 캐릭터 개성: 잽은 오래 경직(stunMul), 강타는 불붙임(finBurn)
        if (!a.finisher && def.stunMul) e.hitstun *= def.stunMul;
        if (a.finisher && def.finBurn && !(e.burnT > 0)) { e.burnT = 3 + ab('c_spice', 0); e.burnDps = def.finBurn + ab('c_flame', 0); }
        if (!a.finisher) e.hitstun *= ab('x_dizzy', 1);
        if (a.finisher) {
          e.hitstun += ab('s_salt', 0);
          const hl = ab('w_headlock', 0) * (e.def.boss ? 0.5 : 1);
          if (hl > (e.frozen || 0)) { e.frozen = hl; ring(e.x, e.y, e.r, '#ffd0a8', e.r * 0.8); }
          if (lvl('b_fireworks')) {
            ring(e.x, e.y, 4, '#ff7ce8', ab('b_fireworks') / 3.2);
            burst(e.x, e.y, e.r, '#ff7ce8', 12, 420);
            pushAround(e, ab('b_fireworks'), 2, 450, true, a.hit);
          }
        }
        elementHit(e);
        const vamp = ab('vampire', 0);
        if (vamp && p.pct > 0) {
          p.pct = Math.max(0, p.pct - vamp);
          text(p.x, p.y, p.r * 3, `-${vamp}%`, '#7dff9a', 16);
        }
      }
    }
    if (!a.ranged && a.finisher && !a.shocked && a.t > def.active[1] && lvl('shockwave')) {
      a.shocked = true;
      pushAround(p, ab('shockwave'), 4, 450, true, a.hit);
    }
    // 스모: 강타가 끝나면 발을 굴러 주변을 밀어낸다(finQuake = 반경)
    if (!a.ranged && a.finisher && def.finQuake && !a.quaked && a.t > def.active[1]) {
      a.quaked = true;
      pushAround(p, def.finQuake + ab('s_quake', 0), 3, 380, true, a.hit);
      fx.shake = Math.max(fx.shake, 10 * 0.64);
    }
    if (a.t >= def.duration) p.atk = null;
  }

  // 속성 능력(불꽃 주먹, 얼음 타격, 번개 타격): 내 공격이 적중했을 때만 붙는다
  function elementHit(e) {
    // 배쉬: 확률로 적을 크게 밀쳐내고 주변 적도 함께 날린다
    if (lvl('bash') && Math.random() < ab('bash')) {
      const dx = e.x - player.x, dy = e.y - player.y, d = Math.hypot(dx, dy) || 1;
      e.vx += dx / d * 700 * (1 + e.pct / 80) / e.mass; e.vy += dy / d * 700 * (1 + e.pct / 80) / e.mass;
      pushAround(e, 130, 4, 700, true, new Set([e]));
      text(e.x, e.y - e.r, e.r * 3.5, '배쉬!', '#ffb347', 26);
      burst(e.x, e.y, e.r, '#ffb347', 14, 480);
      fx.shake = Math.max(fx.shake, 12);
    }
    if (lvl('fire_fist')) { e.burnT = 3; e.burnDps = ab('fire_fist'); }
    if (lvl('frost')) {
      const t = ab('frost') * (e.def.boss ? 0.5 : 1);
      if (t > (e.frozen || 0)) { e.frozen = t; ring(e.x, e.y, e.r, '#a8dcff', e.r * 0.8); }
    }
    if (lvl('spark')) {
      const near = enemies.filter(o => o !== e && activeEnemy(o) && o.z > -1 && Math.hypot(o.x - e.x, o.y - e.y) < 170)
        .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y)).slice(0, 2);
      for (const o of near) {
        if (!o.invulnT) o.pct += ab('spark');
        o.flash = 0.12;
        ring(o.x, o.y, o.r, '#fff35c', o.r * 0.7);
        text(o.x, o.y, o.r * 2.2, `${Math.round(o.pct)}%`, '#fff35c', 16);
      }
    }
  }

  function hitEnemy(e, nx, ny, dmg, kb, heavy) {
    // 방패병: 정면에서 맞으면 막는다 (밀리는 방향이 바라보는 방향의 반대 = 앞에서 맞음). 경직 중에는 못 막는다
    if (e.def.guard && e.state !== 'stun' && nx * Math.cos(e.face) + ny * Math.sin(e.face) < -0.4) {
      dmg *= e.def.guard; kb *= e.def.guard;
      text(e.x, e.y, e.r * 3, '막음!', '#a8c8ff', 18);
      ring(e.x + Math.cos(e.face) * e.r, e.y + Math.sin(e.face) * e.r, e.r, '#a8c8ff', e.r * 0.6);
    }
    // 위상술사: 무적인 동안은 피해도 넉백도 없다
    if (e.invulnT > 0) {
      text(e.x, e.y, e.r * 3, '무적!', '#ffe9a8', 18);
      ring(e.x, e.y, e.r, '#ffe9a8', e.r * 0.7);
      return;
    }
    e.pct += dmg;
    let power = kb * (1 + e.pct / 80) / e.mass;
    // 철옹성: 체력이 0(피해 200%)이 되기 전에는 절대 밀리지 않고, 0이 되면 기둥 밖으로 날아간다
    if (e.def.anchor) {
      if (e.pct < 200) { power = 0; text(e.x, e.y - e.r, e.r * 3, '꿈쩍 않는다', '#c8ccd8', 16); }
      else power = Math.max(power, R * 2.2 * FRICTION);
    }
    e.vx += nx * power; e.vy += ny * power;
    // 보스는 슈퍼아머: 언제 맞아도 경직되지 않는다(넉백과 피해는 그대로). 기절·빙결 같은 상태이상은 따로 적용된다
    if (!e.def.boss) {
      e.state = 'stun'; e.st = 0;
      e.hitstun = Math.min(1.2, 0.15 + power / 1500) * ab('stun', 1);
    }
    e.flash = 0.12; e.sqx = 1.35; e.sqy = 0.7; e.tilt = (nx >= 0 ? 1 : -1) * 0.45;
    // 타격감: 퍼센트가 높을수록 멈춤과 흔들림이 커지고, 모든 타격에 충격 링과 불꽃이 번진다
    const big = Math.min(1, power / 900);
    fx.hitstop = Math.max(fx.hitstop, (heavy ? 0.09 : 0.055) + big * 0.04);
    fx.shake = Math.max(fx.shake, ((heavy ? 10 : 6) + big * 6) * (heavy ? 0.64 : 0.2));
    if (heavy) fx.zoom = Math.max(fx.zoom, 0.03 + big * 0.03);
    e.sqx = 1.5; e.sqy = 0.62;
    burst(e.x, e.y, e.r, heavy ? '#ffb347' : '#ffffff', heavy ? 16 : 10, heavy ? 420 : 300);
    burst(e.x, e.y, e.r, '#ffe066', heavy ? 8 : 4, 520);
    ring(e.x, e.y, e.r, heavy ? '#ffd84a' : '#ffffff', e.r * (heavy ? 1.3 : 0.9));
    text(e.x, e.y, e.r * 2.2, `${Math.round(e.pct)}%`, heavy ? '#ffb347' : '#ffffff', heavy ? 22 : 16);
    Sfx.play(heavy ? 'bighit' : 'hit');
  }

  const SHOUTS = ['으악!', '컥!', '아얏!', '크헉!', '끄악!'];

  function hitPlayer(e, nx, ny, A = e.def.attack) {
    const p = player;
    if (p.inv > 0 || p.starT > 0 || p.falling) return;
    if (lvl('shield') && p.shieldT >= ab('shield') * coolMul()) {
      p.shieldT = 0; p.inv = 0.5;
      burst(p.x, p.y, p.r, '#b8a0ff', 14, 320); ring(p.x, p.y, p.r, '#b8a0ff', p.r * 2.2);
      text(p.x, p.y, p.r * 3, '막았다!', '#d6c8ff', 22);
      Sfx.play('pick');
      return;
    }
    const emul = (D.enemyAttackMul || 1) * ((e && e.atkMul) || 1);
    const dmg = A.damage * emul * ab('tough', 1) * (p.atk ? ab('x_weave', 1) : 1) * st('taken');
    p.pct += dmg;
    let power = A.force * emul * (1 + p.pct / 80) / p.mass * ab('b_belly', 1) * (p.atk ? ab('s_stance', 1) : 1) * st('kbTaken');
    p.counterT = lvl('x_counter') ? 4 : 0;
    // 기둥 중앙 근처에서는 한 방에 밖으로 날아가지 않게, 가장자리 직전까지만 밀린다
    if (p.pct < 198 && Math.hypot(p.x, p.y) < R * 0.5) {
      const b = p.x * nx + p.y * ny, c = p.x * p.x + p.y * p.y - R * R;
      const edge = -b + Math.sqrt(Math.max(0, b * b - c));
      power = Math.min(power, Math.max(0, edge - p.r * 1.5) * 0.9 * FRICTION);
    }
    if (lvl('grip') && Math.hypot(p.x, p.y) > R * 0.7) power *= ab('grip');
    // 체력 1% 이하(피해 198%+)면 아무리 작은 공격에도 기둥 밖으로 날아간다
    if (p.pct >= 198) {
      power = Math.max(power, R * 2.2 * FRICTION);
      text(p.x, p.y - p.r * 2, p.r * 3, '체력 바닥!', '#ff4a4a', 24);
    }
    p.vx += nx * power; p.vy += ny * power;
    p.hitstun = 0.22 + power / 1800;
    p.inv = ab('dodge', 0.5); p.revengeT = lvl('revenge') ? 4 : 0; p.hurt = 0.7; p.flash = 0.18; p.atk = null;
    p.sqx = 1.45; p.sqy = 0.6; p.tilt = (nx >= 0 ? 1 : -1) * 0.7;
    fx.hitstop = 0.12 + Math.min(0.1, power / 9000);
    fx.shake = Math.min(40, 12 + power / 35);
    fx.red = 0.55; fx.zoom = 0.07;
    burst(p.x, p.y, p.r, '#ffe066', 16, 440);
    burst(p.x, p.y, p.r, '#ff4a4a', 8, 300);
    ring(p.x, p.y, p.r, '#ffffff', p.r * 1.2);
    text(p.x, p.y, p.r * 3, `+${Math.round(dmg)}%`, '#ff4a4a', 30);
    text(p.x + nx * 40, p.y + ny * 40, p.r * 2, SHOUTS[Math.floor(Math.random() * SHOUTS.length)], '#ffffff', 20);
    // 낙하 궤도면 슬로모션
    if (Math.hypot(p.x + p.vx / FRICTION, p.y + p.vy / FRICTION) > R + p.r * 0.6) fx.slow = 0.8;
    Sfx.play('hurt');

    if (lvl('thorns')) hitEnemy(e, -nx, -ny, ab('thorns'), ab('thorns') * 35, false);
    if (lvl('counter')) {
      pushAround(p, 110, 3, ab('counter'), true);
      text(p.x, p.y, p.r * 4, '분노!', '#ff8a3d', 22);
    }
  }

  function updateEnemy(e, dt) {
    if (e.falling) return;
    if (e.burnT > 0) {
      e.burnT -= dt; if (!(e.invulnT > 0)) e.pct += e.burnDps * dt;
      if (Math.random() < dt * 10) burst(e.x, e.y, e.r, '#ff8a3c', 1, 90);
    }
    if (e.frozen > 0) {
      e.frozen -= dt;
      if (e.state !== 'spawn') { e.state = 'stun'; e.hitstun = Math.max(e.hitstun, e.frozen); }
    }
    e.st += dt;
    if (e.def.phase && e.state !== 'spawn') {
      const PH = e.def.phase;
      if (e.invulnT > 0) e.invulnT -= dt;
      else if ((e.phaseC += dt) >= PH.every) {
        e.phaseC = 0; e.invulnT = PH.time;
        ring(e.x, e.y, e.r, '#ffe9a8', e.r * 1.6);
        text(e.x, e.y, e.r * 3, '무적!', '#ffe9a8', 22);
        Sfx.play('pick');
      }
    }
    if (e.state === 'spawn') {
      if (e.drop) {
        const u = clamp(e.st / 0.55, 0, 1);
        e.z = 520 * (1 - u * u);
        if (u >= 1) {
          e.z = 0; e.state = 'chase'; e.st = 0; e.drop = false;
          fx.shake = Math.max(fx.shake, 28); fx.zoom = 0.08;
          burst(e.x, e.y, 2, '#d8d2c0', 28, 420);
          pushAround(e, 200, 4, 700, true, new Set([e]));
        }
        return;
      }
      const u = clamp(e.st / 0.7, 0, 1);
      e.z = -80 * (1 - u) * (1 - u);
      if (u >= 1) { e.z = 0; e.state = 'chase'; e.st = 0; }
      return;
    }
    const p = player, A = e.def.attack;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
    const charger = e.def.behavior === 'charger';
    const playerGone = p.falling || p.z > 30 || game.state !== 'play';
    // 돌진병은 최소 0.7초 예고하고, 조준은 0.3초까지만 따라간 뒤 멈춰서 피할 틈을 준다
    const windup = (charger ? Math.max(A.windup, 0.7) : A.windup) * ab('intimidate', 1);

    switch (e.state) {
      case 'stun':
        e.hitstun -= dt;
        if (e.hitstun <= 0) { e.state = 'chase'; e.st = 0; }
        break;
      case 'chase': {
        if (playerGone) break;
        e.face = Math.atan2(dy, dx);
        const sl = e.def.slam, sm = e.def.summon;
        if (sl && (e.slamT -= dt) <= 0) {
          e.slamT = sl.every; e.state = 'slamwind'; e.st = 0;
          ring(e.x, e.y, 2, '#ff6b6b', sl.radius * 0.35);
          Sfx.play('windup');
          break;
        }
        if (sm && (e.sumT -= dt) <= 0) {
          e.sumT = sm.every;
          if (enemies.filter(x => !x.falling).length < D.maxAlive + 3) for (let n = 0; n < sm.count; n++) spawnEnemy(sm.type);
          text(e.x, e.y, e.r * 3, '부하 소환!', '#ff6b6b', 22);
        }
        const zn = e.def.zone;
        if (zn && (e.zoneT -= dt) <= 0) {
          e.zoneT = zn.every;
          for (let n = 0; n < zn.count; n++) {
            const a = rand(0, Math.PI * 2), o = n === 0 ? 0 : rand(40, 130);
            zones.push({ x: p.x + Math.cos(a) * o, y: p.y + Math.sin(a) * o, r: zn.radius, t: 0, windup: zn.windup, dmg: zn.damage, force: zn.force, from: e });
          }
          text(e.x, e.y, e.r * 3, '장판!', '#ff7fe0', 22);
          Sfx.play('windup');
        }
        const wb = e.def.web;
        if (wb && (e.webT -= dt) <= 0) {
          // 거미줄: 플레이어가 지나갈 길목(플레이어 쪽)에 바닥 거미줄을 깐다
          e.webT = wb.every;
          for (let n = 0; n < wb.count; n++) {
            const t = rand(0.5, 1), a = rand(0, Math.PI * 2), o = n === 0 ? 0 : rand(30, 90);
            let wx = e.x + dx * t + Math.cos(a) * o, wy = e.y + dy * t + Math.sin(a) * o;
            const wl = Math.hypot(wx, wy);
            if (wl > R * 0.92) { wx *= R * 0.92 / wl; wy *= R * 0.92 / wl; }
            webs.push({ x: wx, y: wy, r: wb.radius, t: 0, life: wb.life, slow: wb.slow });
          }
          text(e.x, e.y, e.r * 3, '거미줄!', '#d8c8f0', 20);
          Sfx.play('swish');
        }
        const pl = e.def.pull;
        if (pl && (e.pullT -= dt) <= 0 && d > 90 && d < R * 1.6) {
          e.pullT = pl.every;
          p.vx += -dx / d * pl.force; p.vy += -dy / d * pl.force;
          ring(p.x, p.y, p.r, '#ff6b6b', p.r * 2.4); ring(e.x, e.y, e.r, '#ff6b6b', e.r * 2);
          text(e.x, e.y, e.r * 3, '끌어당긴다!', '#ff6b6b', 20);
          Sfx.play('windup');
        }
        const bl = e.def.blink;
        if (bl && (e.blinkT -= dt) <= 0 && d > 110) {
          // 유령: 플레이어 등 뒤로 순간이동해서 바로 공격 준비
          e.blinkT = bl.every;
          burst(e.x, e.y, e.r, '#c9d6ff', 10, 240);
          let tx = p.x - Math.cos(p.face) * bl.dist, ty = p.y - Math.sin(p.face) * bl.dist;
          const tl = Math.hypot(tx, ty);
          if (tl > R * 0.85) { tx *= R * 0.85 / tl; ty *= R * 0.85 / tl; }
          e.x = tx; e.y = ty; e.vx = e.vy = 0;
          e.face = Math.atan2(p.y - e.y, p.x - e.x);
          burst(e.x, e.y, e.r, '#c9d6ff', 10, 240);
          text(e.x, e.y, e.r * 3, '스윽', '#c9d6ff', 18);
          e.state = 'windup'; e.st = 0; Sfx.play('windup');
          break;
        }
        if (e.def.behavior === 'jumper') {
          if (d <= A.range && e.st > 0.4) { e.state = 'windup'; e.st = 0; Sfx.play('windup'); }
          else {
            e.x += Math.cos(e.face) * e.def.speed * dt;
            e.y += Math.sin(e.face) * e.def.speed * dt;
            e.walk += dt * 10;
          }
          break;
        }
        if (e.def.behavior === 'shooter') {
          // 사거리 안에서 거리를 유지하며 쏜다
          if (d <= A.range && e.st > 0.4) { e.state = 'windup'; e.st = 0; Sfx.play('windup'); }
          else {
            const dir = d < A.range * 0.55 ? -1 : (d > A.range * 0.85 ? 1 : 0);
            e.x += Math.cos(e.face) * e.def.speed * dt * dir;
            e.y += Math.sin(e.face) * e.def.speed * dt * dir;
            if (dir) e.walk += dt * 10;
          }
          break;
        }
        const reach = charger ? A.range : A.range + p.r;
        if (d <= reach && e.st > 0.3) {
          e.state = 'windup'; e.st = 0;
          Sfx.play('windup');
        } else {
          const spd = e.def.speed * (e.def.rage ? 1 + e.def.rage * Math.min(1, e.pct / 150) : 1);
          e.x += Math.cos(e.face) * spd * dt;
          e.y += Math.sin(e.face) * spd * dt;
          e.walk += dt * (e.def.rage ? 10 * spd / e.def.speed : 10);
        }
        break;
      }
      case 'slamwind': {
        const sl = e.def.slam;
        e.sqx = 1 + 0.15 * Math.sin(e.st * 20); e.sqy = 1 - 0.15 * Math.sin(e.st * 20);
        if (e.st >= sl.windup) {
          e.state = 'recover'; e.st = 0;
          fx.shake = Math.max(fx.shake, 22);
          ring(e.x, e.y, 2, '#ffffff', sl.radius * 0.35);
          burst(e.x, e.y, 2, '#d8d2c0', 18, 360);
          Sfx.play('fall');
          if (!playerGone && p.z <= 20 && d <= sl.radius + p.r) hitPlayer(e, dx / (d || 1), dy / (d || 1), sl);
        }
        break;
      }
      case 'windup':
        // 돌진병은 조준을 잠깐만 따라오고 멈춘 뒤 돌진한다. 근접형은 전반부까지만 따라온다
        if (charger ? e.st < 0.3 : e.st < windup * 0.5) e.face = Math.atan2(dy, dx);
        if (e.st >= windup) {
          e.state = 'attack'; e.st = 0; e.didHit = false;
          if (e.def.behavior === 'jumper') {
            // 지금 플레이어가 있는 자리로 뛴다 (기둥 안쪽으로 제한)
            let tx = p.x, ty = p.y;
            const tl = Math.hypot(tx, ty);
            if (tl > R * 0.9) { tx *= R * 0.9 / tl; ty *= R * 0.9 / tl; }
            e.jump = { x0: e.x, y0: e.y, x1: tx, y1: ty };
          }
        }
        break;
      case 'attack':
        if (e.def.behavior === 'jumper') {
          const J = e.jump, u = clamp(e.st / A.jumpTime, 0, 1);
          e.x = J.x0 + (J.x1 - J.x0) * u; e.y = J.y0 + (J.y1 - J.y0) * u;
          e.z = Math.sin(Math.PI * u) * 170; e.vz = 0; e.vx = e.vy = 0;
          if (u >= 1) {
            e.z = 0; e.state = 'recover'; e.st = 0; e.jump = null;
            fx.shake = Math.max(fx.shake, 12);
            ring(e.x, e.y, 2, '#ffffff', A.radius * 0.35);
            burst(e.x, e.y, 2, '#d8d2c0', 14, 320);
            Sfx.play('bighit');
            const jx = p.x - e.x, jy = p.y - e.y, jd = Math.hypot(jx, jy);
            if (!playerGone && p.z <= 20 && jd <= A.radius + p.r) hitPlayer(e, jx / (jd || 1), jy / (jd || 1));
          }
        } else if (charger) {
          e.x += Math.cos(e.face) * A.dashSpeed * dt;
          e.y += Math.sin(e.face) * A.dashSpeed * dt;
          e.walk += dt * 25;
          if (Math.random() < 0.6) particles.push({ type: 'spark', x: e.x, y: e.y, z: 4, vx: 0, vy: 0, vz: 0, life: 0.25, max: 0.25, color: 'rgba(255,255,255,0.5)', size: 4 });
          if (!e.didHit && !playerGone && d < e.r + p.r + 4) {
            e.didHit = true;
            hitPlayer(e, Math.cos(e.face), Math.sin(e.face));
          }
          if (e.state === 'attack' && e.st >= A.dashTime) { e.state = 'recover'; e.st = 0; }
        } else if (e.def.behavior === 'shooter') {
          const S0 = e.def.shoot;
          eshots.push({ x: e.x, y: e.y, vx: Math.cos(e.face) * S0.speed, vy: Math.sin(e.face) * S0.speed, r: S0.radius, color: S0.color, left: S0.life, from: e, slow: S0.slow });
          burst(e.x, e.y, e.r, S0.color, 6, 200);
          Sfx.play('swish');
          e.state = 'recover'; e.st = 0;
        } else {
          if (!e.didHit) {
            e.didHit = true;
            e.vx += Math.cos(e.face) * 120; e.vy += Math.sin(e.face) * 120;
            e.sqx = 0.8; e.sqy = 1.25;
            const off = Math.abs(angDiff(Math.atan2(dy, dx), e.face));
            if (!playerGone && d <= A.range + p.r + 8 && off < 1.2) hitPlayer(e, dx / (d || 1), dy / (d || 1));
          }
          if (e.state === 'attack' && e.st >= 0.15) { e.state = 'recover'; e.st = 0; }
        }
        break;
      case 'recover':
        if (e.st >= A.recover) { e.state = 'chase'; e.st = 0; }
        break;
    }
  }

  function startFall(e) {
    e.falling = true; e.vz = 120; e.atk = null; e.hitstun = 0;
    if (e.kind === 'player') {
      if (e.saves > 0) {
        e.saveT = 0.45;
        Sfx.play('fall');
        return;
      }
      game.overT = 1.8; fx.slow = 1.2; fx.shake = 20;
      text(e.x, e.y, 60, '으아아아악!', '#ffffff', 28);
      Sfx.play('fall');
      return;
    }
    game.kills++;
    game.chainN++; game.chainT = ab('chain', 1.5);
    const pts = Math.round(e.def.score * game.chainN * ab('bounty', 1));
    game.score += pts;
    text(e.x, e.y, 50, game.chainN > 1 ? `+${pts} x${game.chainN}` : `+${pts}`, '#ffd84a', 24);
    if (e.def.boss && !player.falling && !player.dead && game.overT <= 0) bossDefeated(e); // 플레이어가 먼저 떨어졌으면 격파 연출을 하지 않는다
    // 폭죽 광대: 쓰러지면서 플레이어 쪽으로 부채꼴 투사체를 뿌린다
    const fn = e.def.fan;
    if (fn && !player.falling) {
      const base = Math.atan2(player.y - e.y, player.x - e.x);
      for (let i = 0; i < fn.count; i++) {
        const a = base + (i - (fn.count - 1) / 2) * fn.spread / Math.max(1, fn.count - 1);
        eshots.push({ x: e.x, y: e.y, vx: Math.cos(a) * fn.speed, vy: Math.sin(a) * fn.speed, r: fn.radius, color: fn.color, left: fn.life, from: e });
      }
      text(e.x, e.y, 80, '펑!', fn.color, 24);
    }
    // 분열 슬라임: 쓰러지면 작은 슬라임으로 갈라져 나온다
    const sp = e.def.split;
    if (sp && !player.falling) for (let n = 0; n < sp.count; n++) spawnEnemy(sp.type);
    // 전용 능력 회복: 관중 환호(3연쇄 이상), 불맛 시식(불타는 적)
    const adr = ab('adrenaline', 0) + (game.chainN >= 3 ? ab('b_cheer', 0) : 0) + (e.burnT > 0 ? ab('c_taste', 0) : 0);
    if (adr && !player.falling && player.pct > 0) {
      player.pct = Math.max(0, player.pct - adr);
      text(player.x, player.y, player.r * 3, `-${adr}%`, '#7dff9a', 18);
    }
    Sfx.play('fall');
  }

  // 보스 처치: 팡파레와 함께 기둥 위 하늘에 폭죽이 연달아 터진다
  function bossDefeated(e) {
    // 다이아: (웨이브번호 / 5) x 스테이지번호 (무한 = 4), 성장 트리 보석 감정사로 늘어난다
    const n = Math.round(Math.max(1, Math.floor((game.wave + 1) / D.diamond.per)) * game.stage.id * treeVal('dia'));
    meta.dia += n; game.diaGot += n; saveMeta();
    text(e.x, e.y, 120, `💎 +${n}`, '#8fe8ff', 30);
    game.banner = { text: '🎉 BOSS 격파! 🎉', sub: `${e.def.name} · 💎 +${n}`, color: '#ffd84a', t: 2.6, max: 2.6, boss: true };
    for (let i = 0; i < 9; i++) game.fireworks.push({ t: 0.25 + i * 0.22 + rand(0, 0.1), x: rand(-0.8, 0.8) * R, y: rand(-0.7, 0.3) * R });
    fx.shake = Math.max(fx.shake, 16);
    Sfx.play('fanfare');
  }
  const FW_COLORS = ['#ff5a5a', '#ffd84a', '#5affa0', '#5ac8ff', '#c77dff', '#ff9bea', '#ffffff'];
  function firework(x, y) {
    const z = rand(140, 260), color = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
    for (let i = 0; i < 30; i++) {
      const a = rand(0, Math.PI * 2), up = rand(-1, 1), s = rand(260, 380), life = rand(0.9, 1.3);
      const h = Math.sqrt(1 - up * up);
      particles.push({ type: 'spark', x, y, z, vx: Math.cos(a) * h * s, vy: Math.sin(a) * h * s, vz: up * s, life, max: life, color, size: rand(2.5, 4), fw: true });
    }
    ring(x, y, z, color, 30);
    Sfx.play('pop');
  }
  function updateFireworks(dt) {
    for (const f of game.fireworks) if ((f.t -= dt) <= 0) firework(f.x, f.y);
    game.fireworks = game.fireworks.filter(f => f.t > 0);
  }

  // 낙법: 떨어지던 플레이어를 기둥 위 공중으로 되돌린다
  function rescue(p) {
    p.saves--;
    const ang = Math.atan2(p.y, p.x);
    p.x = Math.cos(ang) * R * 0.55; p.y = Math.sin(ang) * R * 0.55;
    p.falling = false; p.z = 260; p.vz = 0; p.vx = p.vy = 0;
    p.spin = 0; p.tilt = 0; p.inv = 1.5; p.hitstun = 0.3; p.hurt = 0;
    fx.slow = 0;
    text(p.x, p.y, 300, '낙법!', '#7dff9a', 30);
    Sfx.play('wave');
  }

  function physics(e, dt) {
    e.flash = Math.max(0, e.flash - dt);
    e.hurt = Math.max(0, e.hurt - dt);
    e.inv = Math.max(0, e.inv - dt);
    const k = Math.min(1, dt * 12);
    e.sqx += (1 - e.sqx) * k; e.sqy += (1 - e.sqy) * k;
    e.tilt *= Math.exp(-6 * dt);
    if (e.falling) {
      if (e.saveT > 0) {
        e.saveT -= dt;
        if (e.saveT <= 0) { rescue(e); return; }
      }
      e.vz -= GRAVITY * dt; e.z += e.vz * dt;
      e.x += e.vx * dt; e.y += e.vy * dt;
      const f = Math.exp(-0.8 * dt); e.vx *= f; e.vy *= f;
      e.spin += dt * (6 + Math.hypot(e.vx, e.vy) / 80);
      if (e.z < -1400) e.dead = true;
      return;
    }
    if (e.state === 'spawn') return;
    if (e.z > 0 || e.vz > 0) {
      e.vz -= GRAVITY * dt; e.z += e.vz * dt;
      if (e.z <= 0) {
        e.z = 0; e.vz = 0;
        if (e.kind === 'player') {
          fx.shake = Math.max(fx.shake, 14);
          burst(e.x, e.y, 2, '#d8d2c0', 12, 300);
          pushAround(e, 90, 2, 400, false);
        }
      }
    }
    if (e.kind === 'enemy' && (e.invulnT > 0 || (e.def.anchor && e.pct < 200))) e.vx = e.vy = 0;
    e.x += e.vx * dt; e.y += e.vy * dt;
    const f = Math.exp(-FRICTION * dt); e.vx *= f; e.vy *= f;
  }

  // 겹침 해소 + 빠르게 날아온 몸끼리 부딪히면 볼링처럼 튕긴다
  function collide(all) {
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      if (a.falling || a.state === 'spawn' || a.dead) continue;
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        if (b.falling || b.state === 'spawn' || b.dead) continue;
        if ((a.ghost > 0 && b.kind === 'enemy') || (b.ghost > 0 && a.kind === 'enemy')) continue;
        const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        let nx = 1, ny = 0;
        if (d > 0.001) { nx = dx / d; ny = dy / d; } else d = 0;
        const overlap = min - d, tm = a.mass + b.mass;
        a.x -= nx * overlap * b.mass / tm; a.y -= ny * overlap * b.mass / tm;
        b.x += nx * overlap * a.mass / tm; b.y += ny * overlap * a.mass / tm;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 220) {
          const imp = 1.3 * rel / (1 / a.mass + 1 / b.mass) * ab('bowling', 1);
          a.vx -= imp / a.mass * nx; a.vy -= imp / a.mass * ny;
          b.vx += imp / b.mass * nx; b.vy += imp / b.mass * ny;
          const recv = Math.hypot(a.vx, a.vy) < Math.hypot(b.vx, b.vy) ? a : b;
          if (recv.kind === 'enemy') {
            recv.state = 'stun'; recv.st = 0;
            recv.hitstun = Math.max(recv.hitstun, 0.35);
            recv.pct += 3 + lvl('bowling') * 4; recv.flash = 0.08;
          }
          burst((a.x + b.x) / 2, (a.y + b.y) / 2, 20, '#ffffff', 6, 240);
          fx.shake = Math.max(fx.shake, 5);
          Sfx.play('hit');
        }
      }
    }
  }

  function update(dt) {
    game.time += dt;
    updateWaves(dt);
    updatePlayer(player, dt);
    for (const e of enemies) updateEnemy(e, dt);
    const all = [player, ...enemies];
    for (const e of all) physics(e, dt);
    collide(all);
    for (const e of all) {
      if (!e.falling && e.state !== 'spawn' && Math.hypot(e.x, e.y) > R + e.r * 0.6) startFall(e);
    }
    enemies = enemies.filter(e => !e.dead);
    updateItems(dt);
    updateShots(dt);
    updateMeteors(dt);
    updateEnemyShots(dt);
    updateFireworks(dt);
    updateParticles(dt);
    game.chainT -= dt;
    if (game.chainT <= 0) game.chainN = 0;
    if (game.overT > 0) {
      game.overT -= dt;
      if (game.overT <= 0) gameOver();
    }
  }

  // ---------- 그리기 ----------
  const farPillars = Array.from({ length: 7 }, (_, i) => ({
    x: (i + 0.5) / 7 + rand(-0.04, 0.04), w: rand(0.03, 0.07), top: rand(0.42, 0.8), alpha: rand(0.06, 0.16),
  }));
  const motes = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), s: rand(0.6, 2), v: rand(0.005, 0.025) }));
  let time = 0;

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b1d36'); g.addColorStop(0.6, '#2d2347'); g.addColorStop(1, '#120f1f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const p of farPillars) {
      const x = p.x * W, w = p.w * W, top = p.top * H;
      ctx.fillStyle = `rgba(150,140,210,${p.alpha})`;
      ctx.fillRect(x - w / 2, top, w, H - top);
      ctx.beginPath(); ctx.ellipse(x, top, w / 2, w * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (const m of motes) {
      ctx.beginPath(); ctx.arc(m.x * W, m.y * H, m.s, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPillar() {
    const rx = R * S, ry = R * SQ * S;
    // 옆면
    const g = ctx.createLinearGradient(CX - rx, 0, CX + rx, 0);
    g.addColorStop(0, '#22253a'); g.addColorStop(0.35, '#545a7c'); g.addColorStop(0.55, '#5f6688');
    g.addColorStop(0.8, '#3c4160'); g.addColorStop(1, '#1d2032');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(CX + rx, CY);
    ctx.ellipse(CX, CY, rx, ry, 0, 0, Math.PI, false);
    ctx.lineTo(CX - rx, H + 10);
    ctx.lineTo(CX + rx, H + 10);
    ctx.closePath();
    ctx.fill();
    // 돌 띠
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
    for (let k = 1; k < 8; k++) {
      const yy = CY + k * 70 * S;
      if (yy > H) break;
      ctx.beginPath(); ctx.ellipse(CX, yy, rx, ry, 0, 0, Math.PI, false); ctx.stroke();
    }
    // 아래로 갈수록 어둠
    const fog = ctx.createLinearGradient(0, CY + ry, 0, H);
    fog.addColorStop(0, 'rgba(18,15,31,0)'); fog.addColorStop(1, 'rgba(18,15,31,0.92)');
    ctx.fillStyle = fog; ctx.fillRect(CX - rx - 2, CY, rx * 2 + 4, H - CY);
    // 윗면
    const tg = ctx.createRadialGradient(CX, CY - ry * 0.3, rx * 0.1, CX, CY, rx);
    tg.addColorStop(0, '#9aa0c0'); tg.addColorStop(1, '#646a8e');
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.ellipse(CX, CY, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 2;
    for (const f of [0.33, 0.66]) { ctx.beginPath(); ctx.ellipse(CX, CY, rx * f, ry * f, 0, 0, Math.PI * 2); ctx.stroke(); }
    // 가장자리 위험선
    ctx.setLineDash([10 * S, 8 * S]);
    ctx.strokeStyle = 'rgba(255,90,90,0.25)'; ctx.lineWidth = 3 * S;
    ctx.beginPath(); ctx.ellipse(CX, CY, rx * 0.9, ry * 0.9, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#b4b9d6'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(CX, CY, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // 바닥면에 그리는 것: 그림자, 공격 궤적, 돌진 예고선
  function groundArc(x, y, radius, a0, a1, style, alpha) {
    ctx.save();
    ctx.translate(sx(x), sy(y, 0));
    ctx.scale(1, SQ);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = style;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius * S, a0, a1); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawGround(all) {
    for (const e of all) {
      if (e.falling || e.dead || e.z < -1) continue;
      const s = 1 / (1 + Math.max(0, e.z) / 300);
      ctx.fillStyle = `rgba(0,0,0,${0.28 * s})`;
      ctx.beginPath(); ctx.ellipse(sx(e.x), sy(e.y, 0), e.r * S * 0.95 * s, e.r * S * 0.95 * SQ * s, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (const e of enemies) {
      if (e.elite && !e.falling && e.z > -1) {
        ctx.strokeStyle = `rgba(255,216,74,${0.6 + 0.3 * Math.sin(time * 6)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(sx(e.x), sy(e.y, 0), e.r * S * 1.15, e.r * S * 1.15 * SQ, 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (e.jump && e.state === 'attack' && !e.falling) {
        const rr = e.def.attack.radius * S;
        ctx.fillStyle = 'rgba(255,60,60,0.18)'; ctx.strokeStyle = `rgba(255,60,60,${0.5 + 0.4 * Math.sin(time * 25)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(sx(e.jump.x1), sy(e.jump.y1, 0), rr, rr * SQ, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    for (const e of enemies) {
      // 보스 근접공격: 예고 동안 때릴 부채꼴 범위를 바닥에 표시한다 (판정: 거리 range+p.r+8, 정면 ±1.2rad)
      const b = e.def.behavior;
      if (e.falling || e.state !== 'windup' || !e.def.boss || b === 'charger' || b === 'jumper' || b === 'shooter') continue;
      const u = clamp(e.st / (e.def.attack.windup * ab('intimidate', 1)), 0, 1);
      const rad = e.def.attack.range + player.r + 8;
      groundArc(e.x, e.y, rad, e.face - 1.2, e.face + 1.2, '#ff3b3b', 0.18 + 0.22 * u);
      ctx.save();
      ctx.translate(sx(e.x), sy(e.y, 0)); ctx.scale(1, SQ);
      ctx.strokeStyle = `rgba(255,70,70,${0.5 + 0.4 * Math.sin(time * 25)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, rad * S, e.face - 1.2, e.face + 1.2); ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
    for (const e of enemies) {
      if (e.falling || e.state !== 'windup' || e.def.behavior !== 'charger') continue;
      const len = e.def.attack.range * 1.3;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(time * 30);
      ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = e.r * S * 1.2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx(e.x), sy(e.y, 0));
      ctx.lineTo(sx(e.x + Math.cos(e.face) * len), sy(e.y + Math.sin(e.face) * len, 0));
      ctx.stroke();
      ctx.restore();
    }
    if (player.starT > 0 && !player.falling) {
      ctx.strokeStyle = `hsl(${(time * 360) % 360},100%,65%)`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(sx(player.x), sy(player.y, 0), player.r * S * 1.3, player.r * S * 1.3 * SQ, 0, 0, Math.PI * 2); ctx.stroke();
    }
    const a = player.atk;
    if (a && !a.ranged) {
      const u = a.t / a.def.duration;
      const half = a.arc * Math.PI / 360;
      groundArc(player.x, player.y, a.range + player.r * 0.5, player.face - half, player.face + half,
        a.spin ? '#8fd3ff' : (a.finisher ? ({ ninja: '#ff5a6e', sumo: '#c8a070', boxer: '#ff4040', general: '#bfe8ff', wrestler: '#ffe14a', chef: '#ff8a3c' }[player.ch && player.ch.id] || '#ffd84a') : '#ffffff'), 0.35 * (1 - u));
    }
  }

  function drawEnemyShots() {
    for (const w of webs) {
      const rr = w.r * S, px = sx(w.x), py = sy(w.y, 0), fade = clamp((w.life - w.t) / 1.5, 0, 1) * clamp(w.t / 0.3, 0, 1);
      ctx.fillStyle = `rgba(230,225,245,${0.14 * fade})`;
      ctx.strokeStyle = `rgba(235,230,250,${0.65 * fade})`; ctx.lineWidth = Math.max(1, 1.5 * S);
      ctx.beginPath(); ctx.ellipse(px, py, rr, rr * SQ, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr * SQ); }
      ctx.stroke();
      for (const k of [0.35, 0.68]) { ctx.beginPath(); ctx.ellipse(px, py, rr * k, rr * k * SQ, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    for (const z of zones) {
      const u = clamp(z.t / z.windup, 0, 1), rr = z.r * S, px = sx(z.x), py = sy(z.y, 0);
      ctx.fillStyle = `rgba(255,90,220,${0.12 + 0.2 * u})`;
      ctx.strokeStyle = `rgba(255,120,230,${0.5 + 0.4 * Math.sin(time * 20)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(px, py, rr, rr * SQ, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(px, py, rr * u, rr * u * SQ, 0, 0, Math.PI * 2); ctx.stroke();
    }
    for (const s of eshots) {
      const px = sx(s.x), py = sy(s.y, 26), r = s.r * S;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(px, sy(s.y, 0), r, r * SQ, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(px, py, r * 0.1, px, py, r * 1.5);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, s.color); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r * 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawMeteors() {
    for (const m of meteors) {
      const px = sx(m.x), gy = sy(m.y, 0), rr = 70 * S;
      if (m.t < m.warn) {
        const u = m.t / m.warn;
        ctx.fillStyle = `rgba(255,90,40,${0.12 + 0.2 * u})`;
        ctx.strokeStyle = `rgba(255,140,60,${0.6 + 0.3 * Math.sin(time * 25)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(px, gy, rr, rr * SQ, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(px, gy, rr * u, rr * u * SQ, 0, 0, Math.PI * 2); ctx.stroke();
      } else {
        const u = clamp((m.t - m.warn) / m.fall, 0, 1), h = (1 - u) * 520;
        ctx.fillStyle = 'rgba(255,90,40,0.3)';
        ctx.beginPath(); ctx.ellipse(px, gy, rr, rr * SQ, 0, 0, Math.PI * 2); ctx.fill();
        const py = sy(m.y, h), r = 26 * S;
        ctx.strokeStyle = 'rgba(255,160,60,0.55)'; ctx.lineWidth = r * 1.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(px - 30 * S * (1 - u), py - 150 * S); ctx.lineTo(px, py); ctx.stroke();
        const g = ctx.createRadialGradient(px, py, r * 0.2, px, py, r * 1.8);
        g.addColorStop(0, '#fff2c0'); g.addColorStop(0.4, '#ff8a3c'); g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a3a30'; ctx.beginPath(); ctx.arc(px, py, r * 0.8, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawShots() {
    for (const s of shots) {
      const px = sx(s.x), py = sy(s.y, 26), r = s.r * S;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(px, sy(s.y, 0), r, r * SQ, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(px, py);
      const ang = Math.atan2(Math.sin(s.ang) * SQ, Math.cos(s.ang));
      if (s.shape === 'rock' || s.shape === 'bomb') {
        ctx.rotate(time * (s.shape === 'rock' ? 9 : 0) * Math.sign(Math.cos(s.ang) || 1));
        ctx.fillStyle = s.shape === 'rock' ? '#8b857a' : '#2a2a30';
        ctx.strokeStyle = '#3b3630'; ctx.lineWidth = Math.max(2, r * 0.1);
        ctx.beginPath();
        for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, rr = s.shape === 'rock' ? r * (0.88 + 0.18 * Math.sin(i * 2.7)) : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = s.shape === 'rock' ? '#a8a296' : '#ff6a3c';
        ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.25, r * 0.28, 0, Math.PI * 2); ctx.fill();
      } else if (s.shape === 'orb') {
        const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.5);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, s.color); g.addColorStop(1, 'rgba(181,124,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.rotate(ang);
        const len = s.shape === 'arrow' ? r * 4.5 : r * 3;
        ctx.strokeStyle = s.shape === 'arrow' ? '#8a5a2b' : s.color; ctx.lineWidth = Math.max(2, r * (s.shape === 'arrow' ? 0.3 : 0.9)); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, 0); ctx.stroke();
        if (s.shape === 'arrow') {
          ctx.fillStyle = '#e8e8f0'; ctx.beginPath(); ctx.moveTo(r * 0.9, 0); ctx.lineTo(0, -r * 0.5); ctx.lineTo(0, r * 0.5); ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  // 뼈다귀 달린 만화 고기. 떨어지는 동안은 그림자만 바닥에, 고기는 공중에
  function drawItems() {
    for (const it of items) {
      const r = it.r * S, px = sx(it.x), gy = sy(it.y, 0);
      const s = 1 / (1 + it.z / 300);
      ctx.fillStyle = `rgba(0,0,0,${0.3 * s})`;
      ctx.beginPath(); ctx.ellipse(px, gy, r * 1.2 * s, r * 1.2 * SQ * s, 0, 0, Math.PI * 2); ctx.fill();
      const py = sy(it.y, it.z) - r * (1 + (it.z > 0 ? 0 : 0.15 * Math.sin(it.t * 5)));
      if (it.kind !== 'meat') {
        // 곧 사라질 아이템은 깜빡인다
        if (it.life < 3 && Math.floor(it.life * 6) % 2 === 0) continue;
        ctx.save();
        const g = ctx.createRadialGradient(px, py, r * 0.2, px, py, r * 1.3);
        g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r * 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.font = `${Math.round(r * 1.7)}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(it.def.icon, px, py);
        ctx.restore();
        continue;
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-0.5);
      limb(r * 0.3, 0, r * 1.6, 0, r * 0.35, '#f4ecd8', '#3a2a1a', 2);
      circle(r * 1.65, -r * 0.18, r * 0.25, '#f4ecd8', '#3a2a1a', 2);
      circle(r * 1.65, r * 0.18, r * 0.25, '#f4ecd8', '#3a2a1a', 2);
      ctx.beginPath(); ctx.ellipse(-r * 0.2, 0, r * 0.95, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#b5542e'; ctx.fill(); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-r * 0.45, -r * 0.25, r * 0.35, r * 0.18, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,220,180,0.6)'; ctx.fill();
      ctx.restore();
    }
  }

  function tint(e, base) {
    if (e.flash > 0) return (Math.floor(e.flash * 30) % 2) ? '#ffffff' : '#ff3b3b';
    return base;
  }

  function circle(x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }

  // 외곽선 있는 굵은 선 (팔다리)
  function limb(x1, y1, x2, y2, w, color, line, lw) {
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = line; ctx.lineWidth = w + lw * 2; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }

  // 궁수의 활: 손 위치(b.x, b.y)에서 조준 방향에 수직으로 휜 활과 시위, 당긴 동안엔 화살
  function drawBow(b, face, r, lw, line) {
    const dx = Math.cos(face), dy = Math.sin(face) * SQ;
    const nx = -Math.sin(face) * SQ, ny = Math.cos(face), h = r * 0.95;
    const t1 = { x: b.x + nx * h - dx * r * 0.1, y: b.y + ny * h - dy * r * 0.1 }, t2 = { x: b.x - nx * h - dx * r * 0.1, y: b.y - ny * h - dy * r * 0.1 };
    ctx.lineCap = 'round';
    ctx.strokeStyle = line; ctx.lineWidth = r * 0.2 + lw * 2;
    ctx.beginPath(); ctx.moveTo(t1.x, t1.y); ctx.quadraticCurveTo(b.x + dx * r * 0.55, b.y + dy * r * 0.55, t2.x, t2.y); ctx.stroke();
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = r * 0.2;
    ctx.beginPath(); ctx.moveTo(t1.x, t1.y); ctx.quadraticCurveTo(b.x + dx * r * 0.55, b.y + dy * r * 0.55, t2.x, t2.y); ctx.stroke();
    const sx0 = b.fired ? b.x - dx * r * 0.05 : b.hx, sy0 = b.fired ? b.y - dy * r * 0.05 : b.hy;
    ctx.strokeStyle = '#f2ecd8'; ctx.lineWidth = Math.max(1, lw * 0.8);
    ctx.beginPath(); ctx.moveTo(t1.x, t1.y); ctx.lineTo(sx0, sy0); ctx.lineTo(t2.x, t2.y); ctx.stroke();
    if (!b.fired) {
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = Math.max(1.5, r * 0.07);
      ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(b.x + dx * r * 0.5, b.y + dy * r * 0.5); ctx.stroke();
      ctx.fillStyle = '#e8e8f0'; ctx.beginPath();
      const px = b.x + dx * r * 0.5, py = b.y + dy * r * 0.5;
      ctx.moveTo(px + dx * r * 0.3, py + dy * r * 0.3); ctx.lineTo(px + nx * r * 0.1, py + ny * r * 0.1); ctx.lineTo(px - nx * r * 0.1, py - ny * r * 0.1); ctx.closePath(); ctx.fill();
    }
  }

  // 주인공: 머리띠 + 축제 겉옷(핫피)을 걸친 근육질 아저씨. 원점 = 몸 중심, 발끝 = +r
  function drawPlayer(e, r) {
    const fxv = Math.cos(e.face), fyv = Math.sin(e.face);
    const back = fyv < -0.55;
    const dir = fxv >= 0 ? 1 : -1;
    const look = back ? 0 : fxv * r * 0.14;
    const L = (e.ch && e.ch.look) || {};
    const skin = tint(e, L.skin || '#c98a5c'), line = '#3b2213';
    const coat = tint(e, L.coat || '#f3f0e8'), trim = tint(e, L.trim || '#2c3a78'), sock = tint(e, L.sock || '#1e1e26');
    const band = tint(e, L.band || '#ffffff');
    const lw = Math.max(1.2, r * 0.06);
    ctx.lineJoin = 'round';

    if (e.pct >= 100 && !e.falling) {
      ctx.fillStyle = `rgba(255,60,40,${0.18 + 0.12 * Math.sin(time * 10)})`;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.2, r * 1.4, r * 1.8, 0, 0, Math.PI * 2); ctx.fill();
    }

    const sp = SPRITES.bigguy;
    if (sp.ok && (!e.ch || e.ch.id === 'bigguy')) {
      drawSprite(sp, bigguyFrame(e), r, fxv < 0, e.flash > 0 ? tint(e, '') : null, 0.75);
      return;
    }

    if (L.cape) {
      ctx.fillStyle = tint(e, L.cape); ctx.strokeStyle = line; ctx.lineWidth = lw;
      const wav = Math.sin(time * 6) * r * 0.06;
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, -r * 0.9); ctx.lineTo(r * 0.8, -r * 0.9);
      ctx.lineTo(r * 1.15 + wav, r * 0.75); ctx.lineTo(-r * 1.15 - wav, r * 0.75); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // 팔: 어깨 → 주먹
    const arms = [];
    let bow = null, spear = null;
    for (const k of [-1, 1]) {
      const shx = k * r * 0.78, shy = -r * 0.6;
      let fx0 = k * r * 1.0, fy0 = r * 0.02 + Math.sin(e.walk + (k > 0 ? 0 : Math.PI)) * r * 0.08;
      let behind = false;
      const a = e.atk;
      const fin = a && a.finisher && !a.ranged && !a.spin && e.ch ? e.ch.id : null;
      if (a) {
        const u = a.t / a.def.duration;
        let ext = u < 0.4 ? u / 0.4 : Math.max(0, 1 - (u - 0.4) / 0.6);
        let ang = e.face;
        const punching = a.spin || (e.combo % 2 === 1) === (k === 1);
        if (a.spin) { ang = e.face + u * Math.PI * 2 + (k > 0 ? 0 : Math.PI); ext = Math.min(1, ext * 2); }
        if (a.ranged && e.ch && e.ch.id === 'archer') {
          // 활쏘기: 활 든 팔은 앞으로 뻗고, 반대 손은 시위를 당겼다가 발사하면 놓는다
          const at = a.def.ranged.at ?? a.def.active[0];
          const pull = a.fired ? 0 : clamp(a.t / at, 0, 1);
          const bowArm = (k === 1) === (fxv >= 0);
          const bx = Math.cos(e.face) * r * 1.7, by = Math.sin(e.face) * r * 1.7 * SQ - r * 0.3;
          bow = { x: bx, y: by, pull, fired: a.fired };
          if (bowArm) { fx0 = bx; fy0 = by; }
          else { const d = r * 0.95 * pull + r * 0.15; fx0 = bx - Math.cos(e.face) * d; fy0 = by - Math.sin(e.face) * d * SQ; bow.hx = fx0; bow.hy = fy0; }
          behind = Math.sin(e.face) < -0.3;
        } else if (fin) {
          // 캐릭터별 강공격(3타째) 전용 동작
          const s = clamp(u / 0.7, 0, 1), P = (an, d, up) => [Math.cos(an) * r * d, Math.sin(an) * r * d * SQ - r * (up ?? 0.3)];
          let t;
          if (fin === 'ninja') t = P(e.face + k * (0.95 - 1.9 * s), 1.9);              // 두 팔이 X자로 교차해 벤다
          else if (fin === 'sumo') t = P(e.face + k * 0.14, 1.55, 0.5);               // 양손으로 장타
          else if (fin === 'boxer') {                                                   // 한 팔은 가드, 한 팔은 큰 훅
            if (k === 1) t = P(e.face - 1.2 + 2.4 * s, 1.8);
            else { t = [k * r * 0.4, -r * 0.7]; ext = 1; }
          } else if (fin === 'general') {                                               // 양손으로 창을 찌른다
            t = k === 1 ? P(e.face, 2.3 - 0.9 * (1 - ext)) : P(e.face, 1.2 - 0.3 * (1 - ext));
            spear = { ang: e.face, ext };
          } else if (fin === 'wrestler') t = P(e.face + k * (1.45 - 2.5 * s), 1.8, 0.5); // 두 팔로 라리어트
          else if (fin === 'chef') {                                                    // 프라이팬을 머리 위로 들었다가 내려친다
            const up = clamp(u / 0.25, 0, 1), dn = clamp((u - 0.25) / 0.2, 0, 1);
            const hi = [k * r * 0.35, -r * 2.2], fw = P(e.face, 1.8, 0.1);
            t = [hi[0] + (fw[0] - hi[0]) * dn, hi[1] + (fw[1] - hi[1]) * dn];
            t = [fx0 + (t[0] - fx0) * up, fy0 + (t[1] - fy0) * up]; ext = 1;
          } else t = P(ang, 1.75);
          fx0 += (t[0] - fx0) * ext; fy0 += (t[1] - fy0) * ext;
          behind = fin === 'chef' ? false : (fin === 'boxer' && k !== 1) ? false : Math.sin(e.face) < -0.3;
        } else if (punching) {
          const tx = Math.cos(ang) * r * 1.75, ty = Math.sin(ang) * r * 1.75 * SQ - r * 0.3;
          fx0 += (tx - fx0) * ext; fy0 += (ty - fy0) * ext;
          behind = Math.sin(ang) < -0.3;
        }
      }
      arms.push({ shx, shy, fx: fx0, fy: fy0, behind: behind || (back && !a) });
    }
    const drawArm = m => {
      limb(m.shx, m.shy, m.fx, m.fy, r * 0.34, skin, line, lw);
      circle(m.fx, m.fy, L.glove ? r * 0.3 : r * 0.25, L.glove ? tint(e, L.glove) : skin, line, lw);
    };
    for (const m of arms) if (m.behind) drawArm(m);

    // 다리 (허벅지 + 종아리 + 짧은 검은 양말)
    for (const k of [-1, 1]) {
      const lift = e.falling ? 0 : Math.max(0, Math.sin(e.walk + (k > 0 ? 0 : Math.PI))) * r * 0.12;
      const hx = k * r * 0.26, hy = r * 0.3, kx = k * r * 0.5, ky = r * 0.62 - lift;
      const ax = k * r * 0.44, ay = r * 0.84 - lift, fx0 = k * r * 0.44, fy0 = r * 0.98 - lift;
      limb(hx, hy, kx, ky, r * 0.42, skin, line, lw);
      limb(kx, ky, ax, ay, r * 0.32, skin, line, lw);
      limb(ax, ay, fx0 + k * r * 0.04, fy0, r * 0.3, sock, line, lw);
    }

    // 흰 반바지
    ctx.fillStyle = tint(e, L.shorts || '#ffffff'); ctx.strokeStyle = line; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(-r * 0.46, r * 0.06); ctx.lineTo(r * 0.46, r * 0.06);
    ctx.lineTo(r * 0.4, r * 0.4); ctx.lineTo(-r * 0.4, r * 0.4); ctx.closePath();
    ctx.fill(); ctx.stroke();

    // 역삼각형 몸통
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(-r * 0.74, -r * 0.78); ctx.lineTo(r * 0.74, -r * 0.78);
    ctx.quadraticCurveTo(r * 0.66, -r * 0.15, r * 0.44, r * 0.12);
    ctx.lineTo(-r * 0.44, r * 0.12);
    ctx.quadraticCurveTo(-r * 0.66, -r * 0.15, -r * 0.74, -r * 0.78);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    if (!back) {
      // 가슴, 복근
      const mx = look * 0.4;
      ctx.strokeStyle = 'rgba(90,45,20,0.55)'; ctx.lineWidth = lw;
      for (const k of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(mx + k * r * 0.22, -r * 0.5, r * 0.22, r * 0.15, 0, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(mx, -r * 0.6); ctx.lineTo(mx * 0.8, r * 0.06); ctx.stroke();
      for (const yy of [-0.24, -0.1, 0.03]) {
        for (const k of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(mx + k * r * 0.05, yy * r); ctx.lineTo(mx + k * r * 0.17, yy * r + r * 0.015); ctx.stroke();
        }
      }
      // 군번줄
      ctx.strokeStyle = '#cfd3da'; ctx.lineWidth = Math.max(1, lw * 0.7);
      ctx.beginPath(); ctx.moveTo(-r * 0.16, -r * 0.8); ctx.lineTo(mx, -r * 0.4); ctx.lineTo(r * 0.16, -r * 0.8); ctx.stroke();
      ctx.fillStyle = '#dfe3ea'; ctx.fillRect(mx - r * 0.06, -r * 0.42, r * 0.12, r * 0.16);
    }

    // 핫피 (앞이 열린 흰 겉옷, 남색 깃)
    ctx.fillStyle = coat; ctx.strokeStyle = line; ctx.lineWidth = lw;
    if (back) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.82, -r * 0.84); ctx.lineTo(r * 0.82, -r * 0.84);
      ctx.lineTo(r * 0.84, r * 0.42); ctx.lineTo(-r * 0.84, r * 0.42); ctx.closePath();
      ctx.fill(); ctx.stroke();
      circle(0, -r * 0.25, r * 0.26, 'rgba(0,0,0,0)', trim, Math.max(1.5, r * 0.07));
      ctx.fillStyle = trim; ctx.font = `900 ${r * 0.3}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(L.mark || '祭', 0, -r * 0.24);
    } else {
      for (const k of [-1, 1]) {
        ctx.fillStyle = coat; ctx.strokeStyle = line; ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(k * r * 0.82, -r * 0.84); ctx.lineTo(k * r * 0.3, -r * 0.86);
        ctx.lineTo(k * r * 0.5, r * 0.2); ctx.lineTo(k * r * 0.55, r * 0.42);
        ctx.lineTo(k * r * 0.84, r * 0.4);
        ctx.quadraticCurveTo(k * r * 0.9, -r * 0.2, k * r * 0.82, -r * 0.84);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        limb(k * r * 0.34, -r * 0.8, k * r * 0.52, r * 0.36, r * 0.1, trim, trim, 0);
      }
    }

    for (const m of arms) if (!m.behind) drawArm(m);
    if (bow) drawBow(bow, e.face, r, lw, line);
    if (spear) {
      const dx = Math.cos(spear.ang), dy = Math.sin(spear.ang) * SQ, b = -r * 0.3;
      const x0 = dx * r * 0.2, y0 = dy * r * 0.2 + b, x1 = dx * r * (2.6 + 1.0 * spear.ext), y1 = dy * r * (2.6 + 1.0 * spear.ext) + b;
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = r * 0.12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.fillStyle = '#e8e8f0'; ctx.strokeStyle = line; ctx.lineWidth = lw;
      const nx = -dy, ny = dx, nl = Math.hypot(nx, ny) || 1;
      ctx.beginPath(); ctx.moveTo(x1 + dx * r * 0.5, y1 + dy * r * 0.5);
      ctx.lineTo(x1 + nx / nl * r * 0.16, y1 + ny / nl * r * 0.16); ctx.lineTo(x1 - nx / nl * r * 0.16, y1 - ny / nl * r * 0.16);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    // 넓은 소매가 어깨를 덮는다
    for (const k of [-1, 1]) {
      ctx.fillStyle = coat; ctx.strokeStyle = line; ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(k * r * 0.6, -r * 0.88); ctx.lineTo(k * r * 1.08, -r * 0.7);
      ctx.lineTo(k * r * 1.0, -r * 0.3); ctx.lineTo(k * r * 0.68, -r * 0.4); ctx.closePath();
      ctx.fill(); ctx.stroke();
      limb(k * r * 1.07, -r * 0.66, k * r * 1.0, -r * 0.34, r * 0.07, trim, trim, 0);
    }

    // 머리
    const hx = look, hy = -r * 1.22, hw = r * 0.4, hh = r * 0.44;
    ctx.fillStyle = skin; ctx.fillRect(hx - r * 0.17, hy + hh * 0.5, r * 0.34, r * 0.32);
    const headPath = () => { ctx.beginPath(); ctx.ellipse(hx, hy, hw, hh, 0, 0, Math.PI * 2); };
    headPath(); ctx.fillStyle = skin; ctx.fill();
    ctx.save();
    headPath(); ctx.clip();
    if (!L.bald) {
      ctx.fillStyle = L.hair || '#17171c';
      ctx.fillRect(hx - hw, hy - hh, hw * 2, back ? hh * 1.5 : hh * 0.55);
    }
    if (!back) {
      ctx.fillStyle = 'rgba(40,25,20,0.28)';
      ctx.beginPath(); ctx.ellipse(hx + look * 0.3, hy + hh * 0.62, hw * 0.85, hh * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = band;
    ctx.fillRect(hx - hw, hy - hh * 0.5, hw * 2, hh * 0.28);
    ctx.restore();
    headPath(); ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.stroke();

    // 머리띠 매듭 (보는 방향 반대쪽에서 펄럭인다)
    const kx = back ? hx : hx - dir * hw * 0.92, ky = hy - hh * 0.36;
    const flap = Math.sin(time * 14) * hh * 0.12;
    for (const t of [0, 1]) {
      const tx = kx - (back ? (t ? 1 : -1) * hw * 0.35 : dir * hw * (0.55 + t * 0.2));
      limb(kx, ky, tx, ky + hh * (0.3 + t * 0.25) + flap * (t ? 1 : -1), r * 0.1, band, line, lw * 0.7);
    }
    circle(kx, ky, r * 0.08, band, line, lw * 0.7);

    // 얼굴
    if (!back) {
      const ex = hx + look * 0.6, ey = hy - hh * 0.02, sp = hw * 0.42;
      const hurt = e.hurt > 0 || e.falling;
      ctx.fillStyle = `rgba(230,80,80,${hurt ? 0.6 : 0.32})`;
      for (const k of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(ex + k * sp * 1.1, ey + hh * 0.27, hw * 0.2, hh * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = '#17171c'; ctx.lineWidth = Math.max(1.5, r * 0.075);
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(ex + k * sp * 0.4, ey - hh * (hurt ? 0.36 : 0.22));
        ctx.lineTo(ex + k * sp * 1.35, ey - hh * (hurt ? 0.28 : 0.3));
        ctx.stroke();
      }
      if (hurt) {
        // > < 눈 + 벌린 입 + 땀
        const s = hw * 0.14;
        ctx.lineWidth = Math.max(1.5, r * 0.06);
        for (const k of [-1, 1]) {
          const x = ex + k * sp;
          ctx.beginPath();
          ctx.moveTo(x - k * s, ey - s); ctx.lineTo(x + k * s, ey); ctx.lineTo(x - k * s, ey + s);
          ctx.stroke();
        }
        ctx.fillStyle = '#5a0d0d';
        ctx.beginPath(); ctx.ellipse(ex, ey + hh * 0.5, hw * 0.24, hh * 0.22, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(ex - hw * 0.16, ey + hh * 0.32, hw * 0.32, hh * 0.08);
        ctx.fillStyle = '#8fd3ff';
        for (const k of [0, 1]) {
          ctx.beginPath(); ctx.ellipse(hx + dir * hw * (1.05 + k * 0.25), hy - hh * (0.5 - k * 0.35), hw * 0.1, hh * 0.16, 0.3, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.fillStyle = '#17171c';
        for (const k of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(ex + k * sp, ey, hw * 0.08, hh * 0.08, 0, 0, Math.PI * 2); ctx.fill();
        }
        // 씩 웃는 입
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, lw * 0.7);
        ctx.beginPath();
        ctx.moveTo(ex - hw * 0.3, ey + hh * 0.38);
        ctx.quadraticCurveTo(ex, ey + hh * 0.66, ex + hw * 0.3, ey + hh * 0.38);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      if (L.beard) {
        ctx.fillStyle = L.beard;
        ctx.beginPath(); ctx.ellipse(ex, ey + hh * 0.66, hw * 0.62, hh * 0.3, 0, 0, Math.PI); ctx.fill();
      }
      if (L.mask) {
        ctx.fillStyle = tint(e, L.mask);
        ctx.beginPath(); ctx.ellipse(ex, ey + hh * 0.52, hw * 0.88, hh * 0.46, 0, 0, Math.PI); ctx.fill();
      }
      if (L.fangs && !hurt) {
        ctx.fillStyle = '#ffffff';
        for (const k of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(ex + k * hw * 0.2, ey + hh * 0.4); ctx.lineTo(ex + k * hw * 0.08, ey + hh * 0.4); ctx.lineTo(ex + k * hw * 0.14, ey + hh * 0.62);
          ctx.closePath(); ctx.fill();
        }
      }
      if (L.shades) {
        ctx.fillStyle = '#111';
        for (const k of [-1, 1]) ctx.fillRect(ex + k * sp - hw * 0.26, ey - hh * 0.12, hw * 0.52, hh * 0.22);
        ctx.fillRect(ex - sp, ey - hh * 0.06, sp * 2, hh * 0.05);
      }
    }

    // 모자와 장식
    ctx.lineWidth = lw; ctx.strokeStyle = line;
    if (L.hat === 'toque') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(hx, hy - hh * 1.12, hw * 0.95, hh * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillRect(hx - hw * 0.8, hy - hh * 1.0, hw * 1.6, hh * 0.5); ctx.strokeRect(hx - hw * 0.8, hy - hh * 1.0, hw * 1.6, hh * 0.5);
    } else if (L.hat === 'pirate') {
      ctx.fillStyle = '#1a1a22';
      ctx.beginPath();
      ctx.moveTo(hx - hw * 1.35, hy - hh * 0.5); ctx.quadraticCurveTo(hx, hy - hh * 2.1, hx + hw * 1.35, hy - hh * 0.5);
      ctx.quadraticCurveTo(hx, hy - hh * 0.8, hx - hw * 1.35, hy - hh * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f2f2f2'; ctx.font = `900 ${hh * 0.5}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('☠', hx, hy - hh * 0.95);
    } else if (L.hat === 'wizard') {
      ctx.fillStyle = tint(e, L.coat || '#4b2e8a');
      ctx.beginPath(); ctx.moveTo(hx - hw * 1.4, hy - hh * 0.55); ctx.lineTo(hx + hw * 0.2, hy - hh * 2.5); ctx.lineTo(hx + hw * 1.4, hy - hh * 0.55);
      ctx.quadraticCurveTo(hx, hy - hh * 0.8, hx - hw * 1.4, hy - hh * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd84a'; ctx.font = `900 ${hh * 0.45}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('★', hx, hy - hh * 1.05);
    } else if (L.hat === 'helmet') {
      ctx.fillStyle = tint(e, '#4f6b3a');
      ctx.beginPath(); ctx.ellipse(hx, hy - hh * 0.55, hw * 1.15, hh * 0.8, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillRect(hx - hw * 1.3, hy - hh * 0.6, hw * 2.6, hh * 0.18); ctx.strokeRect(hx - hw * 1.3, hy - hh * 0.6, hw * 2.6, hh * 0.18);
    } else if (L.hat === 'hood') {
      ctx.fillStyle = tint(e, '#2f7a46');
      ctx.beginPath(); ctx.moveTo(hx - hw * 1.2, hy + hh * 0.2); ctx.quadraticCurveTo(hx - hw * 1.3, hy - hh * 1.6, hx + hw * 0.1, hy - hh * 1.5);
      ctx.quadraticCurveTo(hx + hw * 1.3, hy - hh * 1.5, hx + hw * 1.2, hy + hh * 0.2); ctx.lineTo(hx + hw * 0.9, hy - hh * 0.5); ctx.quadraticCurveTo(hx, hy - hh * 1.0, hx - hw * 0.9, hy - hh * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw;
      ctx.fillStyle = '#e8d44a'; ctx.beginPath(); ctx.moveTo(hx + hw * 0.9, hy - hh * 1.4); ctx.lineTo(hx + hw * 1.5, hy - hh * 1.9); ctx.lineTo(hx + hw * 1.1, hy - hh * 1.1); ctx.closePath(); ctx.fill();
    } else if (L.hat === 'topknot') {
      circle(hx, hy - hh * 1.15, hw * 0.34, L.hair || '#17171c', line, lw);
    } else if (L.hat === 'ears') {
      ctx.fillStyle = skin;
      for (const k of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(hx + k * hw * 0.85, hy - hh * 0.3); ctx.lineTo(hx + k * hw * 1.35, hy - hh * 0.9); ctx.lineTo(hx + k * hw * 0.5, hy - hh * 0.8);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
  }

  function drawEnemy(e, r) {
    const d = e.def, fxv = Math.cos(e.face), fyv = Math.sin(e.face);
    const lw = Math.max(1.5, r * 0.09);
    if (e.state === 'windup') ctx.translate(rand(-1, 1) * r * 0.1, 0);
    const blink = e.state === 'windup' && Math.floor(e.st * 12) % 2 === 0;
    const base = e.frozen > 0 ? '#a8dcff' : blink ? '#ff6b6b' : d.color;

    const sp = SPRITES[e.type];
    const useSp = sp && sp.ok;
    if (useSp) {
      const over = e.flash > 0 ? tint(e, '') : e.frozen > 0 ? '#a8dcff' : blink ? '#ff6b6b' : null;
      drawSprite(sp, 0, r, fxv < 0, over, e.flash > 0 ? 0.75 : 0.55);
    } else {
    if (d.horn) {
      ctx.fillStyle = tint(e, '#f5efe0'); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.75); ctx.lineTo(fxv * r * 0.2, -r * 1.5); ctx.lineTo(r * 0.3, -r * 0.75); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    if (d.spikes) {
      ctx.fillStyle = tint(e, '#f5efe0'); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = lw;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + 0.2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.2) * r * 0.9, Math.sin(a - 0.2) * r * 0.9);
        ctx.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35);
        ctx.lineTo(Math.cos(a + 0.2) * r * 0.9, Math.sin(a + 0.2) * r * 0.9);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    if (d.legs) {
      ctx.strokeStyle = tint(e, shade(d.color, -0.4)); ctx.lineWidth = lw * 1.2;
      for (let i = 0; i < 8; i++) {
        const a = (i % 4 - 1.5) * 0.7 + (i < 4 ? 0 : Math.PI) + Math.sin(e.walk + i) * 0.15;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
        ctx.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.2 - r * 0.3); ctx.lineTo(Math.cos(a) * r * 1.7, Math.sin(a) * r * 1.4 + r * 0.2); ctx.stroke();
      }
    }
    if (d.ghost) ctx.globalAlpha = 0.72 + 0.15 * Math.sin(time * 4 + e.x);
    if (d.square) {
      const q = r * 0.9;
      ctx.fillStyle = tint(e, base); ctx.strokeStyle = shade(d.color, -0.5); ctx.lineWidth = lw;
      ctx.beginPath(); ctx.rect(-q, -q, q * 2, q * 2); ctx.fill(); ctx.stroke();
    } else circle(0, 0, r, tint(e, base), shade(d.color, -0.5), lw);
    if (d.ghost) {
      // 아래쪽 물결 자락
      ctx.fillStyle = tint(e, base);
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * r * 0.36, r * 0.85, r * 0.22, 0, Math.PI * 2); ctx.fill(); }
    }
    if (d.crown) {
      ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.8); ctx.lineTo(-r * 0.5, -r * 1.3); ctx.lineTo(-r * 0.25, -r * 1.05);
      ctx.lineTo(0, -r * 1.4); ctx.lineTo(r * 0.25, -r * 1.05); ctx.lineTo(r * 0.5, -r * 1.3); ctx.lineTo(r * 0.5, -r * 0.8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    if (fyv > -0.55) {
      const ex = fxv * r * 0.35, ey = -r * 0.15 + fyv * r * 0.1;
      const spread = r * 0.32 * (0.45 + 0.55 * Math.abs(fyv));
      const er = r * (d.teeth ? 0.15 : 0.22);
      const stunned = e.state === 'stun' && e.hitstun > 0.25;
      for (const k of [-1, 1]) {
        const x = ex + k * spread;
        circle(x, ey, er, '#ffffff', '#1a1a1a', Math.max(1, lw * 0.6));
        if (stunned) {
          ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = Math.max(1, lw * 0.6);
          ctx.beginPath(); ctx.arc(x, ey, er * 0.55, time * 12, time * 12 + 4.5); ctx.stroke();
        } else {
          circle(x + fxv * er * 0.4, ey + fyv * er * 0.3, er * 0.45, '#1a1a1a');
        }
        // 화난 눈썹
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = Math.max(1.5, lw);
        ctx.beginPath();
        ctx.moveTo(x - k * er * 1.1, ey - er * 1.5);
        ctx.lineTo(x + k * er * 0.9, ey - er * 0.9);
        ctx.stroke();
      }
      if (d.teeth) {
        ctx.fillStyle = '#ffffff';
        for (const k of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(ex + k * r * 0.22 - r * 0.07, ey + r * 0.38);
          ctx.lineTo(ex + k * r * 0.22 + r * 0.07, ey + r * 0.38);
          ctx.lineTo(ex + k * r * 0.22, ey + r * 0.6);
          ctx.closePath(); ctx.fill();
        }
      }
    }
    } // 도형 그리기 끝 (스프라이트가 없는 적)

    if (d.guard && e.state !== 'stun') {
      // 앞을 막는 방패 (뒤를 볼 때는 몸에 가려진다)
      const back = fyv < -0.3;
      if (!back) {
        ctx.save();
        ctx.translate(fxv * r * 0.75, r * 0.15 + fyv * r * 0.2);
        ctx.scale(Math.max(0.35, Math.abs(fyv) + 0.25 * (1 - Math.abs(fyv))), 1);
        ctx.fillStyle = '#c0c8d8'; ctx.strokeStyle = '#3a4050'; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.6); ctx.lineTo(r * 0.55, -r * 0.6); ctx.lineTo(r * 0.5, r * 0.2); ctx.lineTo(0, r * 0.65); ctx.lineTo(-r * 0.5, r * 0.2); ctx.closePath();
        ctx.fill(); ctx.stroke();
        circle(0, -r * 0.05, r * 0.14, '#ffd84a', '#3a4050', lw * 0.7);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    if (d.anchor && e.pct < 200) {
      // 철옹성: 두꺼운 강철 갑옷 띠와 리벳
      ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = Math.max(3, r * 0.22);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#c0c8d8';
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; circle(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, Math.max(1.5, r * 0.07), '#c0c8d8'); }
    }
    if (e.invulnT > 0) {
      ctx.strokeStyle = `rgba(255,233,168,${0.6 + 0.4 * Math.sin(time * 14)})`; ctx.lineWidth = Math.max(2, r * 0.14);
      ctx.fillStyle = 'rgba(255,233,168,0.22)';
      ctx.beginPath(); ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    if (e.state === 'stun' && e.hitstun > 0.25) {
      ctx.fillStyle = '#ffe066';
      for (let i = 0; i < 3; i++) {
        const a = time * 6 + i * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.8, -r * 1.25 + Math.sin(a) * r * 0.25, Math.max(2, r * 0.12), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // 캐릭터 아래 체력 게이지 (피해 0%면 100% 꽉 참, 피해 200%면 0). 숫자는 게이지 안에 표시
  function drawGauge(e, px, py, r) {
    const hp = Math.round(clamp(1 - e.pct / 200, 0, 1) * 100);
    const w = Math.max(54, r * 2.4), h = 11, x = px - w / 2, y = py + 6;
    const col = hp > 50 ? '#7dff9a' : hp > 25 ? '#ffd84a' : '#ff4a4a';
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = col; ctx.fillRect(x, y, w * hp / 100, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 10px system-ui, sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(`${hp}%`, px, y + h / 2 + 0.5);
    ctx.fillStyle = '#fff'; ctx.fillText(`${hp}%`, px, y + h / 2 + 0.5);
  }

  // 분신술: 반투명한 분신이 플레이어를 따라 돈다
  function drawClone() {
    const c = player && player.clone;
    if (!c || player.falling) return;
    const r = player.r * S;
    ctx.save();
    ctx.translate(sx(c.x), sy(c.y, 0) - r);
    ctx.globalAlpha = c.t < 1 ? 0.25 + 0.25 * Math.sin(time * 30) : 0.5;
    drawPlayer({ ...player, flash: 0, hurt: 0, inv: 0, atk: c.atk ? { ...c.atk, pose: false } : null, face: c.face, walk: time * 8 }, r);
    ctx.restore();
  }

  function drawEntity(e) {
    const r = e.r * S;
    const px = sx(e.x), py = sy(e.y, e.z);
    const bob = (!e.falling && e.state !== 'spawn' && e.z <= 0) ? -Math.abs(Math.sin(e.walk)) * r * 0.12 : 0;
    ctx.save();
    ctx.translate(px, py - r + bob);
    ctx.rotate(e.tilt + e.spin);
    ctx.scale(e.sqx, e.sqy);
    if (e.kind === 'player' && e.ghost > 0) ctx.globalAlpha = 0.4;
    e.sprMoving = e.walk !== e.sprWalk; e.sprWalk = e.walk; // 걷는 중인지 (스프라이트 프레임 고르기용)
    if (e.kind === 'player') drawPlayer(e, r); else drawEnemy(e, r);
    if (e.kind === 'player' && (e.inv > 0 || e.starT > 0) && !e.falling) {
      // 무적: 캐릭터 전체가 빠르게 반짝이고 별빛이 튄다
      const pulse = 0.5 + 0.5 * Math.sin(time * 28);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + 0.4 * pulse;
      drawPlayer(e, r);
      ctx.restore();
      ctx.fillStyle = '#fff6b0';
      for (let i = 0; i < 5; i++) {
        const a = time * 5 + i * 1.7, s = Math.max(1.5, r * 0.1) * (0.6 + 0.8 * Math.abs(Math.sin(time * 14 + i * 2.3)));
        const x = Math.cos(a * 1.3 + i) * r * 0.95, y = Math.sin(a * 0.9 + i * 2) * r * 1.1;
        ctx.beginPath(); ctx.moveTo(x, y - s * 2); ctx.lineTo(x + s * 0.6, y - s * 0.6); ctx.lineTo(x + s * 2, y);
        ctx.lineTo(x + s * 0.6, y + s * 0.6); ctx.lineTo(x, y + s * 2); ctx.lineTo(x - s * 0.6, y + s * 0.6);
        ctx.lineTo(x - s * 2, y); ctx.lineTo(x - s * 0.6, y - s * 0.6); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();

    if (e.kind === 'enemy' && e.state === 'slamwind' && !e.falling) {
      const rr = e.def.slam.radius * S;
      ctx.strokeStyle = `rgba(255,70,70,${0.5 + 0.4 * Math.sin(time * 20)})`; ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(255,70,70,0.15)';
      ctx.beginPath(); ctx.ellipse(px, sy(e.y, 0), rr, rr * SQ, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    if (e.kind === 'player' && !e.falling) drawGauge(e, px, py, r);

    if (e.kind === 'enemy' && !e.falling && e.state !== 'spawn') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      if (e.state === 'windup' || e.state === 'slamwind') {
        ctx.font = `900 ${Math.max(18, r * 1.3)}px system-ui, sans-serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText('!', px, py - r * 2.3);
        ctx.fillStyle = '#ff3b3b'; ctx.fillText('!', px, py - r * 2.3);
      } else if (e.pct > 0) {
        ctx.font = `800 ${Math.max(11, r * 0.6)}px system-ui, sans-serif`;
        ctx.fillStyle = e.pct > 60 ? '#ff6b6b' : 'rgba(255,255,255,0.85)';
        ctx.fillText(`${Math.round(e.pct)}%`, px, py - r * 2.2);
      }
    }
  }

  function drawParticles() {
    const ts = clamp(S * 1.6, 0.75, 1.3);
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      const x = sx(p.x), y = sy(p.y, p.z);
      ctx.globalAlpha = a;
      if (p.type === 'spark') {
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1.5, p.size * S * 1.5); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x - p.vx * 0.035 * S, y - (p.vy * SQ - p.vz) * 0.035 * S);
        ctx.stroke();
      } else if (p.type === 'ring') {
        const rr = p.size * S * (1 + (1 - a) * 2.2);
        ctx.strokeStyle = p.color; ctx.lineWidth = 4 * a + 1;
        ctx.beginPath(); ctx.ellipse(x, y, rr, rr * SQ, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (p.type === 'cross') {
        const k = p.size * S * (a > 0.85 ? 1 + (a - 0.85) * 2 : 1), t = k * 0.35;
        ctx.fillStyle = p.color; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.rect(x - t, y - k, t * 2, k * 2); ctx.rect(x - k, y - t, k * 2, t * 2);
        ctx.stroke(); ctx.fill();
      } else if (p.type === 'text') {
        const age = p.max - p.life;
        const pop = age < 0.12 ? 1 + (0.12 - age) * 5 : 1;
        ctx.font = `900 ${p.size * pop * ts}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(p.str, x, y);
        ctx.fillStyle = p.color; ctx.fillText(p.str, x, y);
      }
    }
    ctx.globalAlpha = 1;
  }

  // 주기적으로 발동하는 능력의 쿨타임: frac = 충전된 비율, left = 남은 초, active = 발동 중(거대화), ready = 대기 중(방패막)
  function cooldownOf(id) {
    const p = player;
    const cm = coolMul();
    if (id === 'roar') return { frac: p.roarT / (ab('roar') * cm), left: ab('roar') * cm - p.roarT };
    if (id === 'regen') return { frac: (p.regenT || 0) / (5 * cm), left: 5 * cm - (p.regenT || 0) };
    if (id === 'shield') return p.shieldT >= ab('shield') * cm ? { frac: 1, left: 0, ready: true } : { frac: p.shieldT / (ab('shield') * cm), left: ab('shield') * cm - p.shieldT };
    if (ABIL[id].every && id !== 'giant') {
      const E = ABIL[id].every * cm, t = p.pt[id] || 0;
      if (id === 'clone' && p.clone) return { frac: 1, left: p.clone.t, active: true };
      if (id === 'ghost' && p.ghost > 0) return { frac: 1, left: p.ghost, active: true };
      return { frac: t / E, left: E - t };
    }
    if (id === 'giant') {
      if (p.giant > 0) return { frac: 1, left: p.giant, active: true };
      return { frac: p.giantT / (ABIL.giant.every * cm), left: ABIL.giant.every * cm - p.giantT };
    }
    return null;
  }
  function drawCooldown(cd, cx, cy) {
    const rr = 15;
    if (!cd.active && !cd.ready && cd.frac < 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rr, -Math.PI / 2 + clamp(cd.frac, 0, 1) * Math.PI * 2, Math.PI * 1.5);
      ctx.closePath(); ctx.fill();
    }
    if (cd.active || cd.ready) {
      ctx.strokeStyle = cd.active ? '#ffd84a' : '#b8a0ff'; ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 8);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (cd.ready) return;
    if (!isFinite(cd.left)) return;
    const t = cd.left >= 10 ? String(Math.ceil(cd.left)) : Math.max(0, cd.left).toFixed(1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 11px system-ui, sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(t, cx, cy + 1);
    ctx.fillStyle = cd.active ? '#ffd84a' : '#ffffff'; ctx.fillText(t, cx, cy + 1);
  }

  function drawHUD() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (fx.red > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,20,20,${fx.red})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,60,60,${fx.red * 0.25})`; ctx.fillRect(0, 0, W, H);
    }
    if (game.state === 'title') return;

    // 가장자리 경고
    if (!player.falling) {
      const d = Math.hypot(player.x, player.y) / R;
      if (d > 0.8) {
        const a = (d - 0.8) / 0.2 * 0.35 * (0.6 + 0.4 * Math.sin(time * 12));
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
        g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,0,0,${a})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    }

    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 18px system-ui, sans-serif';
    const S = game.stage;
    ctx.fillText(`${S.endless ? '무한' : S.id + '스테이지'} · WAVE ${game.wave + 1}${S.waves ? '/' + S.waves : ''}`, 16, 14);
    const left = game.queue.length + enemies.filter(e => !e.falling).length;
    ctx.textAlign = 'right';
    ctx.fillText(`남은 적 ${left}`, W - 16, 60);
    ctx.font = '800 15px system-ui, sans-serif';
    ctx.fillStyle = '#ffd84a';
    ctx.fillText(`🪙 ${game.gold}   💎 ${meta.dia}`, W - 16, 84);
    ctx.textAlign = 'left';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(`점수 ${game.score}   처치 ${game.kills}`, 16, 38);

    // 대시 쿨타임: 대시 버튼 글자 (PC에서도 버튼을 보여주고 단축키를 함께 적는다)
    const dLeft = Math.max(0, player.dashCd);
    const dTxt = dLeft > 0 ? dLeft.toFixed(1) : (isTouch ? '대시' : '대시 L');
    if (btnDash.textContent !== dTxt) { btnDash.textContent = dTxt; btnDash.classList.toggle('cool', dLeft > 0); }

    // 보유 능력 아이콘. 몇 초마다 발동하는 능력은 남은 쿨타임을 시계 모양으로 덮고 초를 적는다
    let ix = 16, iy = isTouch ? 62 : 70;
    const maxX = Math.max(140, W * 0.32);
    abilRects = [];
    for (const [id, l] of Object.entries(player.abil)) {
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ABIL[id].icon, ix, iy);
      abilRects.push({ x: ix - 3, y: iy - 3, w: 32, h: 28 });
      const cd = cooldownOf(id);
      if (cd) drawCooldown(cd, ix + 11, iy + 11);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const tag = id === 'second_wind' ? `x${player.saves}` : (l > 1 ? String(l) : '');
      if (tag) {
        ctx.font = '800 11px system-ui, sans-serif';
        ctx.fillStyle = '#ffd84a';
        ctx.fillText(tag, ix + 20, iy + 12);
      }
      ix += 34;
      if (ix > maxX) { ix = 16; iy += 28; }
    }
    // 이번 판 장비 (누르면 능력 설명과 함께 보인다)
    if (player.eq.length) {
      if (ix > 16) { ix = 16; iy += 30; }
      for (const id of player.eq) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = '18px system-ui, sans-serif'; ctx.fillStyle = '#ffffff';
        ctx.fillText(EQUIP[id].icon, ix, iy);
        abilRects.push({ x: ix - 3, y: iy - 3, w: 30, h: 26 });
        ix += 28;
        if (ix > maxX) { ix = 16; iy += 26; }
      }
    }
    // 아이템 지속 효과 (웨이브가 끝날 때까지)
    if (ix > 16) { ix = 16; iy += 32; }
    for (const [k, id] of [['starT', 'star'], ['hasteT', 'drink'], ['powerT', 'protein']]) {
      if (!(player[k] > 0)) continue;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = '20px system-ui, sans-serif'; ctx.fillStyle = '#ffffff';
      ctx.fillText(ITEM[id].icon, ix, iy);
      drawCooldown({ frac: 1, left: player[k], active: true }, ix + 11, iy + 11);
      ix += 34;
    }

    if (game.banner) {
      const b = game.banner, age = b.max - b.t;
      const a = clamp(Math.min(age * 4, b.t * 2), 0, 1);
      const pop = age < 0.15 ? 1 + (0.15 - age) * 4 : 1;
      ctx.globalAlpha = a;
      const bs = Math.min(64, W * 0.12);
      ctx.font = `900 ${bs}px system-ui, sans-serif`;
      const fit = Math.min(1, W * 0.92 / ctx.measureText(b.text).width);
      ctx.font = `900 ${bs * fit * pop}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeText(b.text, W / 2, H * 0.24);
      ctx.fillStyle = b.color || '#ffd84a'; ctx.fillText(b.text, W / 2, H * 0.24);
      if (b.sub) {
        ctx.font = `800 ${Math.min(26, W * 0.055)}px system-ui, sans-serif`;
        ctx.lineWidth = 5; ctx.strokeText(b.sub, W / 2, H * 0.24 + Math.min(52, W * 0.1));
        ctx.fillStyle = '#fff'; ctx.fillText(b.sub, W / 2, H * 0.24 + Math.min(52, W * 0.1));
      }
      ctx.globalAlpha = 1;
    }

    if (stick.id !== null) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(stick.ox, stick.oy, STICK_R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(stick.ox + stick.x * STICK_R, stick.oy + stick.y * STICK_R, 24, 0, Math.PI * 2); ctx.fill();
    }
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground();

    const shx = rand(-1, 1) * fx.shake, shy = rand(-1, 1) * fx.shake;
    const zoom = 1 + fx.zoom;
    const fpx = sx(player.x), fpy = sy(player.y, 0);
    ctx.save();
    ctx.translate(fpx + shx, fpy + shy);
    ctx.scale(zoom, zoom);
    ctx.translate(-fpx, -fpy);

    const all = [player, ...enemies];
    const back = [], front = [];
    for (const e of all) {
      if (e.dead) continue;
      (e.z < -1 && e.y < 0 ? back : front).push(e);
    }
    // 기둥 뒤로 떨어지거나 뒤에서 기어오르는 건 기둥보다 먼저 그려서 가려지게 한다
    back.sort((a, b) => a.y - b.y);
    for (const e of back) drawEntity(e);
    drawPillar();
    drawGround(all);
    drawItems();
    drawEnemyShots();
    drawShots();
    drawMeteors();
    const key = e => (e.z < -1 ? 1e6 : 0) + e.y;
    front.sort((a, b) => key(a) - key(b));
    for (const e of front) drawEntity(e);
    drawClone();
    drawParticles();
    ctx.restore();

    drawHUD();
  }

  // ---------- 루프 ----------
  function tick(rdt) {
    fx.shake *= Math.exp(-9 * rdt);
    if (fx.shake < 0.3) fx.shake = 0;
    fx.red = Math.max(0, fx.red - rdt * 1.4);
    fx.zoom *= Math.exp(-5 * rdt);
    for (const m of motes) { m.y -= m.v * rdt; if (m.y < 0) { m.y = 1; m.x = Math.random(); } }

    if (game.state !== 'play' || game.picking || game.shopping || chatOpen || skillOpen) return;
    if (fx.hitstop > 0) { fx.hitstop -= rdt; return; }
    let ts = 1;
    if (fx.slow > 0) { fx.slow -= rdt; ts = 0.3; }
    update(rdt * ts);
  }

  let lastT = performance.now();
  function frame(t) {
    const rdt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    time += rdt;
    tick(rdt);
    render();
    requestAnimationFrame(frame);
  }

  resetGame();
  requestAnimationFrame(frame);

  // 디버그용 (콘솔에서 상태 확인)
  window.__bigguy = { game, get player() { return player; }, get enemies() { return enemies; }, get items() { return items; }, dropMeat, dropItem, get shots() { return shots; }, startGame, startWave, spawnEnemy, openPick, choose };
})();
