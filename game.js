(() => {
  'use strict';

  const D = window.GAME_DATA;
  const R = D.arena.radius;
  const SQ = 0.6;          // 원근감: 바닥 세로 압축 비율
  const FRICTION = 4;      // 넉백 속도 감쇠
  const GRAVITY = 1700;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  const $ = id => document.getElementById(id);
  const ui = {
    title: $('title'), over: $('over'), overStats: $('overStats'), touch: $('touch'),
    btnAtk: $('btnAtk'), btnShv: $('btnShv'), help: $('help'),
  };

  // ---------- 화면 ----------
  let W = 0, H = 0, DPR = 1, S = 1, CX = 0, CY = 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    S = Math.min(W / (2 * R + 70), H * 0.78 / (2 * R * SQ + 120));
    CX = W / 2; CY = H * 0.46;
  }
  window.addEventListener('resize', resize);
  resize();

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
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => clamp(Math.round(c * (1 + amt)), 0, 255);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
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
    tone(f0, f1, dur, type, vol) {
      const c = this.ctx, t = c.currentTime;
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
      }
    },
  };

  // ---------- 입력 ----------
  const keys = new Set();
  const buffered = { attack: -1, shove: -1 };
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const STICK_R = 55;

  function press(action) { buffered[action] = performance.now(); Sfx.unlock(); }
  function consume(action) {
    if (performance.now() - buffered[action] < 180) { buffered[action] = -1; return true; }
    return false;
  }

  // e.code를 써야 한글 입력 상태에서도 WASD가 동작한다
  addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyJ' || e.code === 'Space') press('attack');
    if (e.code === 'KeyK' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') press('shove');
    if (e.code === 'Enter' && game.state !== 'play') startGame();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', e => {
    Sfx.unlock();
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

  function bindBtn(el, action) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); press(action); el.classList.add('on'); });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, () => el.classList.remove('on'));
  }
  bindBtn(ui.btnAtk, 'attack');
  bindBtn(ui.btnShv, 'shove');
  $('btnStart').addEventListener('click', () => { Sfx.unlock(); startGame(); });
  $('btnRetry').addEventListener('click', () => { Sfx.unlock(); startGame(); });
  if (isTouch) ui.help.innerHTML = '왼쪽 화면 드래그로 이동 · 오른쪽 버튼으로 공격 / 밀치기<br>맞을수록 피해%가 오르고 더 멀리 날아갑니다';

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

  // ---------- 상태 ----------
  const game = { state: 'title', wave: 0, score: 0, kills: 0, queue: [], spawnT: 0, clearT: -1, overT: 0, chainN: 0, chainT: 0, banner: null };
  const fx = { shake: 0, red: 0, zoom: 0, hitstop: 0, slow: 0 };
  let player, enemies = [], particles = [];
  let best = 0;
  try { best = +localStorage.getItem('bigguy.best') || 0; } catch (e) { /* 저장소 없음 */ }

  function makeEntity(kind, def, x, y) {
    return {
      kind, def, x, y, z: 0, vx: 0, vy: 0, vz: 0, r: def.radius, mass: def.mass,
      pct: 0, face: Math.PI / 2, state: 'chase', st: 0, hitstun: 0, flash: 0, hurt: 0, inv: 0,
      falling: false, dead: false, sqx: 1, sqy: 1, tilt: 0, spin: 0, walk: 0, atk: null,
    };
  }

  function resetGame() {
    player = makeEntity('player', D.player, 0, 0);
    player.shoveCD = 0; player.combo = 0; player.comboT = 0;
    enemies = []; particles = [];
    Object.assign(game, { wave: 0, score: 0, kills: 0, queue: [], spawnT: 0, clearT: -1, overT: 0, chainN: 0, chainT: 0, banner: null });
    Object.assign(fx, { shake: 0, red: 0, zoom: 0, hitstop: 0, slow: 0 });
  }

  function startGame() {
    resetGame();
    game.state = 'play';
    ui.title.classList.add('hidden');
    ui.over.classList.add('hidden');
    ui.touch.classList.toggle('hidden', !isTouch);
    startWave(0);
  }

  function gameOver() {
    game.state = 'over';
    if (game.score > best) {
      best = game.score;
      try { localStorage.setItem('bigguy.best', String(best)); } catch (e) { /* 무시 */ }
    }
    ui.overStats.innerHTML = `점수 <b>${game.score}</b> · WAVE ${game.wave + 1} · 처치 ${game.kills}<br>최고 기록 ${best}`;
    ui.over.classList.remove('hidden');
    ui.touch.classList.add('hidden');
  }

  // ---------- 웨이브 ----------
  function waveSpec(i) {
    if (i < D.waves.length) return D.waves[i];
    const last = D.waves[D.waves.length - 1];
    const mul = Math.pow(D.endlessScale, i - D.waves.length + 1);
    const spec = {};
    for (const k in last) spec[k] = Math.round(last[k] * mul);
    return spec;
  }

  function startWave(i) {
    game.wave = i;
    game.queue = [];
    const spec = waveSpec(i);
    for (const k in spec) for (let n = 0; n < spec[k]; n++) game.queue.push(k);
    for (let j = game.queue.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [game.queue[j], game.queue[k]] = [game.queue[k], game.queue[j]];
    }
    game.spawnT = 1.2;
    game.clearT = -1;
    game.banner = { text: `WAVE ${i + 1}`, t: 2, max: 2 };
    Sfx.play('wave');
  }

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
    const e = makeEntity('enemy', def, Math.cos(bestA) * rr, Math.sin(bestA) * rr);
    e.type = type; e.state = 'spawn'; e.z = -80; e.face = bestA + Math.PI;
    enemies.push(e);
  }

  function updateWaves(dt) {
    if (game.banner) { game.banner.t -= dt; if (game.banner.t <= 0) game.banner = null; }
    if (player.falling) return;
    const alive = enemies.filter(e => !e.falling).length;
    if (game.queue.length) {
      game.spawnT -= dt;
      if (game.spawnT <= 0 && alive < D.maxAlive) { spawnEnemy(game.queue.pop()); game.spawnT = D.spawnInterval; }
    } else if (alive === 0) {
      if (game.clearT < 0) {
        game.clearT = 2;
        game.banner = { text: 'CLEAR!', t: 1.4, max: 1.4 };
      } else {
        game.clearT -= dt;
        if (game.clearT <= 0) startWave(game.wave + 1);
      }
    }
  }

  // ---------- 파티클 ----------
  function burst(x, y, z, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(0.4, 1) * spd, life = rand(0.2, 0.4);
      particles.push({ type: 'spark', x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(-0.3, 1) * s * 0.6, life, max: life, color, size: rand(2, 4) });
    }
  }
  function ring(x, y, z, color, size) {
    particles.push({ type: 'ring', x, y, z, life: 0.3, max: 0.3, color, size });
  }
  function text(x, y, z, str, color, size) {
    particles.push({ type: 'text', x, y, z, vz: 70, life: 0.9, max: 0.9, str, color, size });
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      if (p.type === 'spark') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const f = Math.exp(-5 * dt); p.vx *= f; p.vy *= f; p.vz *= f;
      } else if (p.type === 'text') {
        p.z += p.vz * dt; p.vz *= Math.exp(-2 * dt);
      }
    }
    particles = particles.filter(p => p.life > 0);
  }

  // ---------- 전투 ----------
  function nearestEnemy(p, maxD) {
    let best = null, bd = maxD;
    for (const e of enemies) {
      if (e.falling || e.state === 'spawn') continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function startAttack(p, type) {
    const a = D.player[type];
    p.atk = { type, def: a, t: 0, hit: new Set(), finisher: false };
    if (type === 'attack') {
      p.combo = (p.comboT > 0 ? p.combo : 0) + 1;
      if (p.combo > 3) p.combo = 1;
      p.comboT = a.comboWindow + a.duration;
      p.atk.finisher = p.combo === 3;
    } else {
      p.shoveCD = a.cooldown;
      p.combo = 0;
    }
    const tgt = nearestEnemy(p, a.range + 70);
    if (tgt) p.face = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    p.vx += Math.cos(p.face) * a.lunge;
    p.vy += Math.sin(p.face) * a.lunge;
    Sfx.play(type === 'shove' ? 'whoosh' : 'swish');
  }

  function updatePlayer(p, dt) {
    if (p.falling) return;
    p.shoveCD = Math.max(0, p.shoveCD - dt);
    p.comboT = Math.max(0, p.comboT - dt);
    if (game.state !== 'play') return;

    if (p.hitstun > 0) {
      p.hitstun -= dt;
    } else {
      const mv = moveInput();
      const m = Math.hypot(mv.x, mv.y);
      const slow = p.atk ? 0.35 : 1;
      p.x += mv.x * D.player.speed * slow * dt;
      p.y += mv.y * D.player.speed * slow * dt;
      if (m > 0.2 && !p.atk) p.face = Math.atan2(mv.y, mv.x);
      p.walk += m * dt * 12;
      if (!p.atk) {
        if (p.shoveCD <= 0 && consume('shove')) startAttack(p, 'shove');
        else if (consume('attack')) startAttack(p, 'attack');
      }
    }

    const a = p.atk;
    if (!a) return;
    a.t += dt;
    if (a.t >= a.def.active[0] && a.t <= a.def.active[1]) {
      const fxv = Math.cos(p.face), fyv = Math.sin(p.face);
      for (const e of enemies) {
        if (a.hit.has(e) || e.falling || e.state === 'spawn') continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
        if (d > a.def.range + e.r) continue;
        const off = Math.abs(angDiff(Math.atan2(dy, dx), p.face));
        if (off > a.def.arc * Math.PI / 360 && d > p.r + e.r) continue;
        a.hit.add(e);
        // 위치 방향과 공격 방향을 섞어서 날린다
        let nx = dx / (d || 1) + fxv * 0.6, ny = dy / (d || 1) + fyv * 0.6;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        const heavy = a.type === 'shove' || a.finisher;
        const mul = a.finisher ? D.player.attack.finisherMul : 1;
        hitEnemy(e, nx, ny, a.def.damage * (a.finisher ? 1.5 : 1), a.def.knockback * mul, heavy);
      }
    }
    if (a.t >= a.def.duration) p.atk = null;
  }

  function hitEnemy(e, nx, ny, dmg, kb, heavy) {
    e.pct += dmg;
    const power = kb * (1 + e.pct / 80) / e.mass;
    e.vx += nx * power; e.vy += ny * power;
    e.state = 'stun'; e.st = 0;
    e.hitstun = Math.min(1.2, 0.15 + power / 1500);
    e.flash = 0.12; e.sqx = 1.35; e.sqy = 0.7; e.tilt = (nx >= 0 ? 1 : -1) * 0.45;
    fx.hitstop = Math.max(fx.hitstop, heavy ? 0.09 : 0.045);
    fx.shake = Math.max(fx.shake, heavy ? 10 : 5);
    burst(e.x, e.y, e.r, heavy ? '#ffb347' : '#ffffff', heavy ? 12 : 7, heavy ? 380 : 260);
    if (heavy) ring(e.x, e.y, e.r, '#ffd84a', e.r);
    text(e.x, e.y, e.r * 2.2, `${Math.round(e.pct)}%`, heavy ? '#ffb347' : '#ffffff', heavy ? 22 : 16);
    Sfx.play(heavy ? 'bighit' : 'hit');
  }

  const SHOUTS = ['으악!', '컥!', '아얏!', '크헉!', '끄악!'];

  function hitPlayer(e, nx, ny) {
    const p = player;
    if (p.inv > 0 || p.falling) return;
    const A = e.def.attack;
    p.pct += A.damage;
    const power = A.force * (1 + p.pct / 80) / p.mass;
    p.vx += nx * power; p.vy += ny * power;
    p.hitstun = 0.22 + power / 1800;
    p.inv = 0.5; p.hurt = 0.7; p.flash = 0.18; p.atk = null;
    p.sqx = 1.45; p.sqy = 0.6; p.tilt = (nx >= 0 ? 1 : -1) * 0.7;
    fx.hitstop = 0.12 + Math.min(0.1, power / 9000);
    fx.shake = Math.min(40, 12 + power / 35);
    fx.red = 0.55; fx.zoom = 0.07;
    burst(p.x, p.y, p.r, '#ffe066', 16, 440);
    burst(p.x, p.y, p.r, '#ff4a4a', 8, 300);
    ring(p.x, p.y, p.r, '#ffffff', p.r * 1.2);
    text(p.x, p.y, p.r * 2.6, `+${A.damage}%`, '#ff4a4a', 30);
    text(p.x + nx * 40, p.y + ny * 40, p.r * 1.6, SHOUTS[Math.floor(Math.random() * SHOUTS.length)], '#ffffff', 20);
    // 낙하 궤도면 슬로모션
    if (Math.hypot(p.x + p.vx / FRICTION, p.y + p.vy / FRICTION) > R) fx.slow = 0.8;
    Sfx.play('hurt');
  }

  function updateEnemy(e, dt) {
    if (e.falling) return;
    e.st += dt;
    if (e.state === 'spawn') {
      const u = clamp(e.st / 0.7, 0, 1);
      e.z = -80 * (1 - u) * (1 - u);
      if (u >= 1) { e.z = 0; e.state = 'chase'; e.st = 0; }
      return;
    }
    const p = player, A = e.def.attack;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
    const charger = e.def.behavior === 'charger';
    const playerGone = p.falling || game.state !== 'play';

    switch (e.state) {
      case 'stun':
        e.hitstun -= dt;
        if (e.hitstun <= 0) { e.state = 'chase'; e.st = 0; }
        break;
      case 'chase': {
        if (playerGone) break;
        e.face = Math.atan2(dy, dx);
        const reach = charger ? A.range : A.range + p.r;
        if (d <= reach && e.st > 0.3) {
          e.state = 'windup'; e.st = 0;
          Sfx.play('windup');
        } else {
          e.x += Math.cos(e.face) * e.def.speed * dt;
          e.y += Math.sin(e.face) * e.def.speed * dt;
          e.walk += dt * 10;
        }
        break;
      }
      case 'windup':
        // 돌진병은 조준을 끝까지 따라오고, 근접형은 전반부까지만 따라온다
        if (charger || e.st < A.windup * 0.5) e.face = Math.atan2(dy, dx);
        if (e.st >= A.windup) { e.state = 'attack'; e.st = 0; e.didHit = false; }
        break;
      case 'attack':
        if (charger) {
          e.x += Math.cos(e.face) * A.dashSpeed * dt;
          e.y += Math.sin(e.face) * A.dashSpeed * dt;
          e.walk += dt * 25;
          if (Math.random() < 0.6) particles.push({ type: 'spark', x: e.x, y: e.y, z: 4, vx: 0, vy: 0, vz: 0, life: 0.25, max: 0.25, color: 'rgba(255,255,255,0.5)', size: 4 });
          if (!e.didHit && d < e.r + p.r + 4) {
            e.didHit = true;
            hitPlayer(e, Math.cos(e.face), Math.sin(e.face));
          }
          if (e.st >= A.dashTime) { e.state = 'recover'; e.st = 0; }
        } else {
          if (!e.didHit) {
            e.didHit = true;
            e.vx += Math.cos(e.face) * 120; e.vy += Math.sin(e.face) * 120;
            e.sqx = 0.8; e.sqy = 1.25;
            const off = Math.abs(angDiff(Math.atan2(dy, dx), e.face));
            if (!playerGone && d <= A.range + p.r + 8 && off < 1.2) hitPlayer(e, dx / (d || 1), dy / (d || 1));
          }
          if (e.st >= 0.15) { e.state = 'recover'; e.st = 0; }
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
      game.overT = 1.8; fx.slow = 1.2; fx.shake = 20;
      text(e.x, e.y, 60, '으아아아악!', '#ffffff', 28);
      Sfx.play('fall');
      return;
    }
    game.kills++;
    game.chainN++; game.chainT = 1.5;
    const pts = e.def.score * game.chainN;
    game.score += pts;
    text(e.x, e.y, 50, game.chainN > 1 ? `+${pts} x${game.chainN}` : `+${pts}`, '#ffd84a', 24);
    Sfx.play('fall');
  }

  function physics(e, dt) {
    e.flash = Math.max(0, e.flash - dt);
    e.hurt = Math.max(0, e.hurt - dt);
    e.inv = Math.max(0, e.inv - dt);
    const k = Math.min(1, dt * 12);
    e.sqx += (1 - e.sqx) * k; e.sqy += (1 - e.sqy) * k;
    e.tilt *= Math.exp(-6 * dt);
    if (e.falling) {
      e.vz -= GRAVITY * dt; e.z += e.vz * dt;
      e.x += e.vx * dt; e.y += e.vy * dt;
      const f = Math.exp(-0.8 * dt); e.vx *= f; e.vy *= f;
      e.spin += dt * (6 + Math.hypot(e.vx, e.vy) / 80);
      if (e.z < -1400) e.dead = true;
      return;
    }
    if (e.state === 'spawn') return;
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
          const imp = 1.3 * rel / (1 / a.mass + 1 / b.mass);
          a.vx -= imp / a.mass * nx; a.vy -= imp / a.mass * ny;
          b.vx += imp / b.mass * nx; b.vy += imp / b.mass * ny;
          const recv = Math.hypot(a.vx, a.vy) < Math.hypot(b.vx, b.vy) ? a : b;
          if (recv.kind === 'enemy') {
            recv.state = 'stun'; recv.st = 0;
            recv.hitstun = Math.max(recv.hitstun, 0.35);
            recv.pct += 3; recv.flash = 0.08;
          }
          burst((a.x + b.x) / 2, (a.y + b.y) / 2, 20, '#ffffff', 6, 240);
          fx.shake = Math.max(fx.shake, 5);
          Sfx.play('hit');
        }
      }
    }
  }

  function update(dt) {
    if (game.state === 'play') updateWaves(dt);
    updatePlayer(player, dt);
    for (const e of enemies) updateEnemy(e, dt);
    const all = [player, ...enemies];
    for (const e of all) physics(e, dt);
    collide(all);
    for (const e of all) {
      if (!e.falling && e.state !== 'spawn' && Math.hypot(e.x, e.y) > R) startFall(e);
    }
    enemies = enemies.filter(e => !e.dead);
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
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(sx(e.x), sy(e.y, 0), e.r * S * 0.95, e.r * S * 0.95 * SQ, 0, 0, Math.PI * 2); ctx.fill();
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
    const a = player && player.atk;
    if (a) {
      const u = a.t / a.def.duration;
      const half = a.def.arc * Math.PI / 360;
      // 바닥은 세로로 눌려 있으니 각도도 같은 공간에서 그린다
      const f = player.face;
      groundArc(player.x, player.y, a.def.range + player.r * 0.5, f - half, f + half,
        a.type === 'shove' ? '#ff8a3d' : (a.finisher ? '#ffd84a' : '#ffffff'), 0.35 * (1 - u));
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

  function drawPlayer(e, r) {
    const fxv = Math.cos(e.face), fyv = Math.sin(e.face);
    const skin = tint(e, '#f1c28f'), line = '#3a2412', lw = Math.max(1.5, r * 0.08);

    if (e.pct >= 100 && !e.falling) {
      ctx.fillStyle = `rgba(255,60,40,${0.18 + 0.12 * Math.sin(time * 10)})`;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2); ctx.fill();
    }

    // 주먹 위치
    const fists = [];
    for (const side of [-1, 1]) {
      let ang = e.face + side * 1.2, dist = r * 0.95;
      const a = e.atk;
      if (a) {
        const u = a.t / a.def.duration;
        const ext = u < 0.4 ? u / 0.4 : 1 - (u - 0.4) / 0.6;
        if (a.type === 'shove') { ang = e.face + side * 0.45; dist = r * (0.95 + 0.75 * ext); }
        else if ((e.combo % 2 === 1) === (side === 1)) { ang = e.face + side * 0.2; dist = r * (0.95 + 0.95 * ext); }
      } else {
        dist += Math.sin(e.walk + (side > 0 ? 0 : Math.PI)) * r * 0.1;
      }
      fists.push({ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist * SQ + r * 0.1, behind: Math.sin(ang) < -0.1 });
    }
    const fistR = r * 0.32;
    for (const f of fists) if (f.behind) circle(f.x, f.y, fistR, skin, line, lw);

    // 몸통
    circle(0, 0, r, tint(e, '#3d6fd6'), '#18264d', lw);
    if (fyv > -0.3) {
      ctx.fillStyle = tint(e, '#7fa4ee');
      ctx.beginPath(); ctx.ellipse(fxv * r * 0.25, r * 0.2, r * 0.5, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    }

    // 머리
    const hr = r * 0.56, hx = fxv * r * 0.12, hy = -r * 0.78;
    circle(hx, hy, hr, skin, line, lw);
    // 머리띠
    ctx.save();
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = tint(e, '#e04848');
    ctx.fillRect(hx - hr, hy - hr * 0.6, hr * 2, hr * 0.32);
    ctx.restore();
    ctx.strokeStyle = tint(e, '#e04848'); ctx.lineWidth = Math.max(2, r * 0.12); ctx.lineCap = 'round';
    const tailX = hx - fxv * hr * 0.9;
    ctx.beginPath();
    ctx.moveTo(tailX, hy - hr * 0.45);
    ctx.lineTo(tailX - fxv * hr * 0.7, hy - hr * 0.2 + Math.sin(time * 14) * hr * 0.12);
    ctx.stroke();

    // 얼굴 (등을 보이면 생략)
    if (fyv > -0.55) {
      const ex = hx + fxv * hr * 0.4, ey = hy + hr * 0.05;
      const spread = hr * 0.3 * (0.45 + 0.55 * Math.abs(fyv));
      ctx.strokeStyle = '#1a0f08'; ctx.fillStyle = '#1a0f08'; ctx.lineWidth = Math.max(1.5, hr * 0.12);
      if (e.hurt > 0 || e.falling) {
        // X 눈 + 벌린 입 + 땀
        const s = hr * 0.13;
        for (const k of [-1, 1]) {
          const x = ex + k * spread;
          ctx.beginPath();
          ctx.moveTo(x - s, ey - s); ctx.lineTo(x + s, ey + s);
          ctx.moveTo(x + s, ey - s); ctx.lineTo(x - s, ey + s);
          ctx.stroke();
        }
        ctx.fillStyle = '#7a1010';
        ctx.beginPath(); ctx.ellipse(ex, ey + hr * 0.45, hr * 0.2, hr * 0.26, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8fd3ff';
        ctx.beginPath(); ctx.ellipse(hx + hr * 0.95, hy - hr * 0.5, hr * 0.12, hr * 0.2, 0.3, 0, Math.PI * 2); ctx.fill();
      } else {
        for (const k of [-1, 1]) {
          ctx.beginPath(); ctx.arc(ex + k * spread, ey, hr * 0.1, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(ex + k * spread - hr * 0.14, ey - hr * 0.26 + (k > 0 ? 0 : hr * 0.04));
          ctx.lineTo(ex + k * spread + hr * 0.14, ey - hr * 0.26 + (k > 0 ? hr * 0.04 : 0));
          ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(ex - hr * 0.15, ey + hr * 0.4); ctx.lineTo(ex + hr * 0.15, ey + hr * 0.4); ctx.stroke();
      }
    }

    for (const f of fists) if (!f.behind) circle(f.x, f.y, fistR, skin, line, lw);
  }

  function drawEnemy(e, r) {
    const d = e.def, fxv = Math.cos(e.face), fyv = Math.sin(e.face);
    const lw = Math.max(1.5, r * 0.09);
    if (e.state === 'windup') ctx.translate(rand(-1, 1) * r * 0.1, 0);
    const blink = e.state === 'windup' && Math.floor(e.st * 12) % 2 === 0;
    const base = blink ? '#ff6b6b' : d.color;

    if (d.horn) {
      ctx.fillStyle = tint(e, '#f5efe0'); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.75); ctx.lineTo(fxv * r * 0.2, -r * 1.5); ctx.lineTo(r * 0.3, -r * 0.75); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    circle(0, 0, r, tint(e, base), shade(d.color, -0.5), lw);

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

    if (e.state === 'stun' && e.hitstun > 0.25) {
      ctx.fillStyle = '#ffe066';
      for (let i = 0; i < 3; i++) {
        const a = time * 6 + i * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.8, -r * 1.25 + Math.sin(a) * r * 0.25, Math.max(2, r * 0.12), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawEntity(e) {
    const r = e.r * S;
    const px = sx(e.x), py = sy(e.y, e.z);
    const bob = (!e.falling && e.state !== 'spawn') ? -Math.abs(Math.sin(e.walk)) * r * 0.12 : 0;
    ctx.save();
    ctx.translate(px, py - r + bob);
    ctx.rotate(e.tilt + e.spin);
    ctx.scale(e.sqx, e.sqy);
    if (e.kind === 'player') drawPlayer(e, r); else drawEnemy(e, r);
    ctx.restore();

    if (e.kind === 'enemy' && !e.falling && e.state !== 'spawn') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      if (e.state === 'windup') {
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
        ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.75, 0, 0, Math.PI * 2); ctx.stroke();
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
    ctx.fillText(`WAVE ${game.wave + 1}`, 16, 14);
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(`점수 ${game.score}   처치 ${game.kills}`, 16, 38);

    // 피해%
    const pct = Math.round(player.pct);
    const col = pct < 50 ? '#ffffff' : pct < 100 ? '#ffd84a' : '#ff4a4a';
    const jx = player.hurt > 0 ? rand(-4, 4) : 0, jy = player.hurt > 0 ? rand(-4, 4) : 0;
    ctx.textAlign = 'center';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('피해', W / 2, 10);
    ctx.font = `900 ${player.hurt > 0 ? 46 : 38}px system-ui, sans-serif`;
    ctx.lineWidth = 6; ctx.strokeStyle = '#000';
    ctx.strokeText(`${pct}%`, W / 2 + jx, 26 + jy);
    ctx.fillStyle = col; ctx.fillText(`${pct}%`, W / 2 + jx, 26 + jy);

    if (game.banner) {
      const b = game.banner, age = b.max - b.t;
      const a = clamp(Math.min(age * 4, b.t * 2), 0, 1);
      const pop = age < 0.15 ? 1 + (0.15 - age) * 4 : 1;
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.min(64, W * 0.12) * pop}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeText(b.text, W / 2, H * 0.28);
      ctx.fillStyle = '#ffd84a'; ctx.fillText(b.text, W / 2, H * 0.28);
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
    const key = e => (e.z < -1 ? 1e6 : 0) + e.y;
    front.sort((a, b) => key(a) - key(b));
    for (const e of front) drawEntity(e);
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

    if (game.state !== 'play') return;
    if (fx.hitstop > 0) { fx.hitstop -= rdt; return; }
    let ts = 1;
    if (fx.slow > 0) { fx.slow -= rdt; ts = 0.3; }
    update(rdt * ts);
    ui.btnShv.classList.toggle('cd', player.shoveCD > 0);
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
  window.__bigguy = { game, get player() { return player; }, get enemies() { return enemies; }, startGame };
})();
