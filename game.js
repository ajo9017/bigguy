(() => {
  'use strict';

  const D = window.GAME_DATA;
  const R = D.arena.radius;
  const SQ = 0.6;          // 원근감: 바닥 세로 압축 비율
  const FRICTION = 4;      // 넉백 속도 감쇠
  const GRAVITY = 1700;
  const ABIL = Object.fromEntries(D.abilities.map(a => [a.id, a]));

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  const $ = id => document.getElementById(id);
  const ui = {
    title: $('title'), over: $('over'), overStats: $('overStats'), touch: $('touch'), btnAtk: $('btnAtk'), help: $('help'),
    pick: $('pick'), pickTitle: $('pickTitle'), cards: $('cards'),
    chat: $('chat'), chatText: $('chatText'), chatHist: $('chatHist'), btnChat: $('btnChat'),
    records: $('records'), recBody: $('recBody'), rankBody: $('rankBody'), rankList: $('rankList'), rankReset: $('rankReset'),myName: $('myName'), nameInput: $('nameInput'),
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
        case 'pick': this.tone(600, 1200, 0.18, 'triangle', 0.12); break;
        case 'roar': this.tone(120, 60, 0.4, 'sawtooth', 0.15); this.noise(0.3, 0.2, 600); break;
      }
    },
  };

  // ---------- 상태 ----------
  const game = {
    state: 'title', wave: 0, score: 0, kills: 0, time: 0, queue: [], spawnT: 0, meatT: -1, clearT: -1, overT: 0,
    chainN: 0, chainT: 0, banner: null, picking: false, choices: [],
  };
  const fx = { shake: 0, red: 0, zoom: 0, hitstop: 0, slow: 0 };
  let player, enemies = [], particles = [], items = [];
  let chatOpen = false;

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
  function releaseInput() { keys.clear(); stick.id = null; stick.x = stick.y = 0; }

  // e.code를 써야 한글 입력 상태에서도 WASD가 동작한다
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('textarea, input')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyJ' || e.code === 'KeyK' || e.code === 'Space') pressAttack();
    if (game.picking && /^Digit[1-3]$/.test(e.code)) choose(+e.code.slice(5) - 1);
    if (e.code === 'Enter' && game.state !== 'play' && !chatOpen && ui.records.classList.contains('hidden')) startGame();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', releaseInput);

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

  ui.btnAtk.addEventListener('pointerdown', e => { e.preventDefault(); pressAttack(); ui.btnAtk.classList.add('on'); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) ui.btnAtk.addEventListener(t, () => ui.btnAtk.classList.remove('on'));

  $('btnStart').addEventListener('click', () => { Sfx.unlock(); startGame(); });
  $('btnRetry').addEventListener('click', () => { Sfx.unlock(); startGame(); });
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
  const ab = (id, dflt) => { const l = lvl(id); return l ? ABIL[id].lv[l - 1] : dflt; };
  const abilSummary = () => Object.entries(player.abil).map(([id, l]) => `${ABIL[id].name} Lv${l}`).join(', ');

  function openPick() {
    const pool = shuffle(D.abilities.filter(a => lvl(a.id) < a.lv.length));
    if (!pool.length) { startWave(game.wave + 1); return; }
    game.choices = pool.slice(0, 3);
    game.picking = true;
    releaseInput();
    ui.pickTitle.textContent = `WAVE ${game.wave + 1} 클리어! 능력을 하나 고르세요`;
    ui.cards.innerHTML = '';
    game.choices.forEach((a, i) => {
      const cur = lvl(a.id);
      const b = document.createElement('button');
      b.className = 'card';
      b.innerHTML = `<div class="icon">${a.icon}</div><div class="ctext"><div class="cname">${a.name}</div>` +
        `<div class="clv">${cur ? `Lv ${cur} → ${cur + 1}` : 'NEW'}</div><div class="cdesc">${a.desc(a.lv[cur])}</div></div>` +
        (isTouch ? '' : `<div class="ckey">${i + 1}</div>`);
      b.addEventListener('click', () => choose(i));
      ui.cards.appendChild(b);
    });
    ui.pick.classList.remove('hidden');
    ui.touch.classList.add('hidden');
  }

  function choose(i) {
    const a = game.choices[i];
    if (!game.picking || !a) return;
    player.abil[a.id] = lvl(a.id) + 1;
    if (a.id === 'heavy') player.mass = D.player.mass * ab('heavy');
    if (a.id === 'second_wind') player.saves++;
    if (a.id === 'recovery') player.pct = Math.max(0, player.pct - ab('recovery'));
    game.picking = false;
    ui.pick.classList.add('hidden');
    ui.touch.classList.toggle('hidden', !isTouch);
    Sfx.play('pick');
    startWave(game.wave + 1);
  }

  // ---------- 개선 요청 채팅 ----------
  // 서버 없이 GitHub 이슈 작성 페이지를 내용이 채워진 채로 연다
  function openChat() {
    chatOpen = true;
    releaseInput();
    ui.chat.classList.remove('hidden');
    ui.btnChat.classList.add('hidden');
    renderChatHist();
    setTimeout(() => ui.chatText.focus(), 50);
  }
  function closeChat() {
    chatOpen = false;
    ui.chat.classList.add('hidden');
    ui.btnChat.classList.remove('hidden');
    ui.chatText.blur();
  }
  // 요청 현황: 공개 GitHub API로 [요청] 이슈 상태를 읽는다 (로그인 불필요). 실패하면 이 기기에서 보낸 목록만 보여준다
  function reqStatus(i) {
    const labels = i.labels.map(l => l.name);
    if (i.state === 'closed') return i.state_reason === 'not_planned' ? ['no', '반영 안 함'] : ['done', '✅ 반영됨'];
    if (labels.includes('작업중')) return ['work', '🔧 작업 중'];
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
          n.textContent = `주인(${D.feedback.repo.split('/')[0]})의 요청은 자동으로 반영돼요. 다른 사람의 요청은 대기 중으로 남고, 주인이 그 이슈에 '반영' 댓글을 달면 작업을 시작해요.`;
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
  function sendRequest() {
    const text = ui.chatText.value.trim();
    if (!text) { ui.chatText.focus(); return; }
    const title = '[요청] ' + text.replace(/\s+/g, ' ').slice(0, 60);
    const info = [
      `웨이브: ${game.state === 'title' ? '-' : game.wave + 1}`,
      `능력: ${abilSummary() || '없음'}`,
      `기기: ${isTouch ? '모바일' : 'PC'} ${W}x${H}`,
    ].join('\n');
    const body = `${text}\n\n---\n${info}`;
    window.open(`https://github.com/${D.feedback.repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=request`, '_blank');
    const list = storage.get('bigguy.requests', []);
    list.unshift({ text, date: Date.now() });
    storage.set('bigguy.requests', list.slice(0, 10));
    ui.chatText.value = '';
    renderChatHist();
  }
  ui.btnChat.addEventListener('click', openChat);
  $('chatClose').addEventListener('click', closeChat);
  $('chatSend').addEventListener('click', sendRequest);
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
    Object.assign(player, { combo: 0, comboT: 0, abil: {}, saves: 0, saveT: 0, roarT: 0, giantT: 0, giant: 0, grow: 1 });
    enemies = []; particles = []; items = [];
    Object.assign(game, { wave: 0, score: 0, kills: 0, time: 0, queue: [], spawnT: 0, meatT: -1, clearT: -1, overT: 0, chainN: 0, chainT: 0, banner: null, picking: false, choices: [] });
    Object.assign(fx, { shake: 0, red: 0, zoom: 0, hitstop: 0, slow: 0 });
  }

  function startGame() {
    saveName();
    resetGame();
    game.state = 'play';
    for (const el of [ui.title, ui.over, ui.pick, ui.records]) el.classList.add('hidden');
    ui.touch.classList.toggle('hidden', !isTouch);
    startWave(0);
  }

  function gameOver() {
    game.state = 'over';
    const r = records;
    const entry = {
      date: Date.now(), score: game.score, wave: game.wave + 1, kills: game.kills, time: Math.round(game.time),
      abil: Object.entries(player.abil),
    };
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
      `점수 <b>${entry.score}</b> · WAVE ${entry.wave} · 처치 ${entry.kills} · ${fmtTime(entry.time)}<br>` +
      `<span class="dim">최고 기록 ${r.best.score} · 총 ${r.plays}판 플레이</span>` +
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

  function waveSpec(i) {
    if (i < D.waves.length) return D.waves[i];
    // 보스는 반복하지 않는다: 마지막 웨이브 이후에는 보스를 뺀 마지막 일반 웨이브를 늘려서 쓴다
    let li = D.waves.length - 1;
    while (li > 0 && Object.keys(D.waves[li]).some(k => D.enemies[k] && D.enemies[k].boss)) li--;
    const last = D.waves[li];
    const mul = Math.pow(D.endlessScale, i - D.waves.length + 1);
    const spec = {};
    for (const k in last) if (!(D.enemies[k] && D.enemies[k].boss)) spec[k] = Math.round(last[k] * mul);
    return spec;
  }

  function startWave(i) {
    game.wave = i;
    game.queue = [];
    const spec = waveSpec(i);
    for (const k in spec) for (let n = 0; n < spec[k]; n++) game.queue.push(k);
    shuffle(game.queue);
    // 보스는 맨 먼저 나온다 (queue는 뒤에서부터 꺼낸다)
    const isBoss = k => D.enemies[k] && D.enemies[k].boss;
    const boss = game.queue.filter(isBoss);
    game.queue = game.queue.filter(k => !isBoss(k)).concat(boss);
    game.spawnT = 1.2;
    game.clearT = -1;
    game.meatT = (i + 1) % D.meat.every === 0 ? D.meat.delay : -1;
    game.banner = boss.length ? { text: `BOSS WAVE ${i + 1}`, t: 2.4, max: 2.4 } : { text: `WAVE ${i + 1}`, t: 2, max: 2 };
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
    e.type = type; e.skillT = 0; e.slamT = def.slam ? def.slam.every : 0; e.sumT = def.summon ? def.summon.every : 0;
    if (def.boss) text(e.x, e.y, 120, `${def.name} 등장!`, '#ff6b6b', 28);
    e.state = 'spawn'; e.z = -80; e.face = bestA + Math.PI;
    enemies.push(e);
  }

  function updateWaves(dt) {
    if (game.banner) { game.banner.t -= dt; if (game.banner.t <= 0) game.banner = null; }
    if (player.falling) return;
    if (game.meatT > 0 && (game.meatT -= dt) <= 0) dropMeat();
    const alive = enemies.filter(e => !e.falling).length;
    if (game.queue.length) {
      game.spawnT -= dt;
      if (game.spawnT <= 0 && alive < D.maxAlive) { spawnEnemy(game.queue.pop()); game.spawnT = D.spawnInterval; }
    } else if (alive === 0) {
      if (game.clearT < 0) {
        game.clearT = 1.3;
        game.banner = { text: 'CLEAR!', t: 1.3, max: 1.3 };
        const heal = ab('recovery', 0);
        if (heal && player.pct > 0) {
          player.pct = Math.max(0, player.pct - heal);
          text(player.x, player.y, player.r * 2.6, `-${heal}%`, '#7dff9a', 24);
        }
      } else {
        game.clearT -= dt;
        if (game.clearT <= 0) openPick();
      }
    }
  }

  // ---------- 회복 고기 ----------
  function dropMeat() {
    const a = rand(0, Math.PI * 2), d = rand(0.15, 0.6) * R;
    items.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, z: 500, vz: 0, r: D.meat.radius, t: 0 });
    text(0, 0, 200, '고기 투하!', '#ffb36b', 24);
  }

  function updateItems(dt) {
    for (const it of items) {
      it.t += dt;
      if (it.z > 0) {
        it.vz -= GRAVITY * dt; it.z += it.vz * dt;
        if (it.z <= 0) { it.z = 0; it.vz = 0; burst(it.x, it.y, 2, '#d8d2c0', 8, 200); }
        continue;
      }
      const p = player;
      if (p.falling || Math.hypot(p.x - it.x, p.y - it.y) > p.r + it.r) continue;
      it.taken = true;
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
  const activeEnemy = e => !e.falling && e.state !== 'spawn';

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

  function startAttack(p) {
    const a = D.player.attack;
    p.combo = (p.comboT > 0 ? p.combo : 0) + 1;
    if (p.combo > 3) p.combo = 1;
    p.comboT = a.comboWindow + a.duration;
    const finisher = p.combo === 3;
    const spin = finisher && lvl('cyclone') > 0;
    const range = a.range * ab('long_reach', 1) * (spin ? ab('cyclone') : 1) * p.grow;
    p.atk = { def: a, t: 0, hit: new Set(), finisher, spin, shocked: false, range, arc: spin ? 360 : a.arc + ab('wide_swing', 0) };
    const tgt = nearestEnemy(p, range + 70);
    if (tgt) p.face = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    if (!spin) {
      p.vx += Math.cos(p.face) * a.lunge * ab('lunge', 1);
      p.vy += Math.sin(p.face) * a.lunge * ab('lunge', 1);
    }
    Sfx.play(finisher ? 'whoosh' : 'swish');
  }

  function updatePlayer(p, dt) {
    if (p.falling) return;
    p.comboT = Math.max(0, p.comboT - dt);
    if (game.state !== 'play') return;

    if (lvl('roar')) {
      p.roarT += dt;
      if (p.roarT >= ab('roar')) {
        p.roarT = 0;
        pushAround(p, 140, 2, 650, false);
        text(p.x, p.y, p.r * 3, '흐읍!', '#ffffff', 22);
        Sfx.play('roar');
      }
    }

    const rg = ab('regen', 0);
    if (rg && p.pct > 0) {
      p.pct = Math.max(0, p.pct - rg * dt);
      // 회복 이펙트: 초록 빛이 몸에서 올라온다
      p.regenFx = (p.regenFx || 0) + dt;
      if (p.regenFx >= 0.6) {
        p.regenFx = 0;
        burst(p.x, p.y, p.r * 0.5, '#7dff9a', 6, 90);
        ring(p.x, p.y, p.r, '#7dff9a', p.r * 1.6);
        text(p.x, p.y, p.r * 2.5, '+', '#7dff9a', 18);
      }
    }

    // 거대화: 일정 시간마다 몸집이 커졌다가 돌아온다
    if (lvl('giant')) {
      const G = ABIL.giant;
      if (p.giant > 0) {
        p.giant -= dt;
        if (p.giant <= 0) p.giantT = 0;
      } else if ((p.giantT += dt) >= G.every) {
        p.giant = ab('giant');
        fx.shake = Math.max(fx.shake, 16);
        ring(p.x, p.y, p.r, '#ffd84a', p.r * 2);
        text(p.x, p.y, p.r * 4, '거대화!', '#ffd84a', 30);
        Sfx.play('roar');
      }
    }
    p.grow += ((p.giant > 0 ? ABIL.giant.scale : 1) - p.grow) * Math.min(1, dt * 6);
    p.r = D.player.radius * p.grow;
    p.mass = D.player.mass * ab('heavy', 1) * p.grow;

    if (p.hitstun > 0) {
      p.hitstun -= dt;
    } else {
      const mv = moveInput();
      const m = Math.hypot(mv.x, mv.y);
      const speed = D.player.speed * ab('quick_feet', 1) * (p.atk ? 0.35 : 1);
      p.x += mv.x * speed * dt;
      p.y += mv.y * speed * dt;
      if (m > 0.2 && !p.atk) p.face = Math.atan2(mv.y, mv.x);
      p.walk += m * dt * 12;
      if (!p.atk && consumeAttack()) startAttack(p);
    }

    const a = p.atk;
    if (!a) return;
    a.t += dt * ab('rapid', 1);
    const def = a.def;
    if (a.t >= def.active[0] && a.t <= def.active[1]) {
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
        const dmg = def.damage * ab('pump', 1) * (a.finisher ? 1.5 : 1);
        let kb = def.knockback * ab('iron_fist', 1) * (a.finisher ? def.finisherMul : 1) * p.grow;
        kb *= 1 + p.pct / 100 * ab('berserk', 0);
        if (e.pct >= 100) kb *= ab('execute', 1);
        if (Math.hypot(p.x, p.y) > R * 0.7) kb *= ab('last_stand', 1);
        hitEnemy(e, nx, ny, dmg, kb, a.finisher);
        const vamp = ab('vampire', 0);
        if (vamp && p.pct > 0) {
          p.pct = Math.max(0, p.pct - vamp);
          text(p.x, p.y, p.r * 3, `-${vamp}%`, '#7dff9a', 16);
        }
      }
    }
    if (a.finisher && !a.shocked && a.t > def.active[1] && lvl('shockwave')) {
      a.shocked = true;
      pushAround(p, ab('shockwave'), 4, 450, true, a.hit);
    }
    if (a.t >= def.duration) p.atk = null;
  }

  function hitEnemy(e, nx, ny, dmg, kb, heavy) {
    e.pct += dmg;
    const power = kb * (1 + e.pct / 80) / e.mass;
    e.vx += nx * power; e.vy += ny * power;
    e.state = 'stun'; e.st = 0;
    e.hitstun = Math.min(1.2, 0.15 + power / 1500) * ab('stun', 1);
    e.flash = 0.12; e.sqx = 1.35; e.sqy = 0.7; e.tilt = (nx >= 0 ? 1 : -1) * 0.45;
    fx.hitstop = Math.max(fx.hitstop, heavy ? 0.09 : 0.045);
    fx.shake = Math.max(fx.shake, heavy ? 10 : 5);
    burst(e.x, e.y, e.r, heavy ? '#ffb347' : '#ffffff', heavy ? 12 : 7, heavy ? 380 : 260);
    if (heavy) ring(e.x, e.y, e.r, '#ffd84a', e.r);
    text(e.x, e.y, e.r * 2.2, `${Math.round(e.pct)}%`, heavy ? '#ffb347' : '#ffffff', heavy ? 22 : 16);
    Sfx.play(heavy ? 'bighit' : 'hit');
  }

  const SHOUTS = ['으악!', '컥!', '아얏!', '크헉!', '끄악!'];

  function hitPlayer(e, nx, ny, A = e.def.attack) {
    const p = player;
    if (p.inv > 0 || p.falling) return;
    const dmg = A.damage * ab('tough', 1);
    p.pct += dmg;
    let power = A.force * (1 + p.pct / 80) / p.mass;
    if (lvl('grip') && Math.hypot(p.x, p.y) > R * 0.7) power *= ab('grip');
    p.vx += nx * power; p.vy += ny * power;
    p.hitstun = 0.22 + power / 1800;
    p.inv = ab('dodge', 0.5); p.hurt = 0.7; p.flash = 0.18; p.atk = null;
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
    if (Math.hypot(p.x + p.vx / FRICTION, p.y + p.vy / FRICTION) > R) fx.slow = 0.8;
    Sfx.play('hurt');

    if (lvl('thorns')) hitEnemy(e, -nx, -ny, ab('thorns'), ab('thorns') * 35, false);
    if (lvl('counter')) {
      pushAround(p, 110, 3, ab('counter'), true);
      text(p.x, p.y, p.r * 4, '분노!', '#ff8a3d', 22);
    }
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
    const playerGone = p.falling || p.z > 30 || game.state !== 'play';
    const windup = A.windup * ab('intimidate', 1);

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
        // 돌진병은 조준을 끝까지 따라오고, 근접형은 전반부까지만 따라온다
        if (charger || e.st < windup * 0.5) e.face = Math.atan2(dy, dx);
        if (e.st >= windup) { e.state = 'attack'; e.st = 0; e.didHit = false; }
        break;
      case 'attack':
        if (charger) {
          e.x += Math.cos(e.face) * A.dashSpeed * dt;
          e.y += Math.sin(e.face) * A.dashSpeed * dt;
          e.walk += dt * 25;
          if (Math.random() < 0.6) particles.push({ type: 'spark', x: e.x, y: e.y, z: 4, vx: 0, vy: 0, vz: 0, life: 0.25, max: 0.25, color: 'rgba(255,255,255,0.5)', size: 4 });
          if (!e.didHit && !playerGone && d < e.r + p.r + 4) {
            e.didHit = true;
            hitPlayer(e, Math.cos(e.face), Math.sin(e.face));
          }
          if (e.state === 'attack' && e.st >= A.dashTime) { e.state = 'recover'; e.st = 0; }
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
    const adr = ab('adrenaline', 0);
    if (adr && !player.falling && player.pct > 0) {
      player.pct = Math.max(0, player.pct - adr);
      text(player.x, player.y, player.r * 3, `-${adr}%`, '#7dff9a', 18);
    }
    Sfx.play('fall');
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
      if (!e.falling && e.state !== 'spawn' && Math.hypot(e.x, e.y) > R) startFall(e);
    }
    enemies = enemies.filter(e => !e.dead);
    updateItems(dt);
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
    const a = player.atk;
    if (a) {
      const u = a.t / a.def.duration;
      const half = a.arc * Math.PI / 360;
      groundArc(player.x, player.y, a.range + player.r * 0.5, player.face - half, player.face + half,
        a.spin ? '#8fd3ff' : (a.finisher ? '#ffd84a' : '#ffffff'), 0.35 * (1 - u));
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

  // 주인공: 머리띠 + 축제 겉옷(핫피)을 걸친 근육질 아저씨. 원점 = 몸 중심, 발끝 = +r
  function drawPlayer(e, r) {
    const fxv = Math.cos(e.face), fyv = Math.sin(e.face);
    const back = fyv < -0.55;
    const dir = fxv >= 0 ? 1 : -1;
    const look = back ? 0 : fxv * r * 0.14;
    const skin = tint(e, '#c98a5c'), line = '#3b2213';
    const coat = tint(e, '#f3f0e8'), trim = tint(e, '#2c3a78'), sock = tint(e, '#1e1e26');
    const lw = Math.max(1.2, r * 0.06);
    ctx.lineJoin = 'round';

    if (e.pct >= 100 && !e.falling) {
      ctx.fillStyle = `rgba(255,60,40,${0.18 + 0.12 * Math.sin(time * 10)})`;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.2, r * 1.4, r * 1.8, 0, 0, Math.PI * 2); ctx.fill();
    }

    // 팔: 어깨 → 주먹
    const arms = [];
    for (const k of [-1, 1]) {
      const shx = k * r * 0.78, shy = -r * 0.6;
      let fx0 = k * r * 1.0, fy0 = r * 0.02 + Math.sin(e.walk + (k > 0 ? 0 : Math.PI)) * r * 0.08;
      let behind = false;
      const a = e.atk;
      if (a) {
        const u = a.t / a.def.duration;
        let ext = u < 0.4 ? u / 0.4 : Math.max(0, 1 - (u - 0.4) / 0.6);
        let ang = e.face;
        const punching = a.spin || (e.combo % 2 === 1) === (k === 1);
        if (a.spin) { ang = e.face + u * Math.PI * 2 + (k > 0 ? 0 : Math.PI); ext = Math.min(1, ext * 2); }
        if (punching) {
          const tx = Math.cos(ang) * r * 1.75, ty = Math.sin(ang) * r * 1.75 * SQ - r * 0.3;
          fx0 += (tx - fx0) * ext; fy0 += (ty - fy0) * ext;
          behind = Math.sin(ang) < -0.3;
        }
      }
      arms.push({ shx, shy, fx: fx0, fy: fy0, behind: behind || (back && !a) });
    }
    const drawArm = m => {
      limb(m.shx, m.shy, m.fx, m.fy, r * 0.34, skin, line, lw);
      circle(m.fx, m.fy, r * 0.25, skin, line, lw);
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
    ctx.fillStyle = tint(e, '#ffffff'); ctx.strokeStyle = line; ctx.lineWidth = lw;
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
      ctx.fillText('祭', 0, -r * 0.24);
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
    ctx.fillStyle = '#17171c';
    ctx.fillRect(hx - hw, hy - hh, hw * 2, back ? hh * 1.5 : hh * 0.55);
    if (!back) {
      ctx.fillStyle = 'rgba(40,25,20,0.28)';
      ctx.beginPath(); ctx.ellipse(hx + look * 0.3, hy + hh * 0.62, hw * 0.85, hh * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = tint(e, '#ffffff');
    ctx.fillRect(hx - hw, hy - hh * 0.5, hw * 2, hh * 0.28);
    ctx.restore();
    headPath(); ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.stroke();

    // 머리띠 매듭 (보는 방향 반대쪽에서 펄럭인다)
    const kx = back ? hx : hx - dir * hw * 0.92, ky = hy - hh * 0.36;
    const flap = Math.sin(time * 14) * hh * 0.12;
    for (const t of [0, 1]) {
      const tx = kx - (back ? (t ? 1 : -1) * hw * 0.35 : dir * hw * (0.55 + t * 0.2));
      limb(kx, ky, tx, ky + hh * (0.3 + t * 0.25) + flap * (t ? 1 : -1), r * 0.1, tint(e, '#ffffff'), line, lw * 0.7);
    }
    circle(kx, ky, r * 0.08, tint(e, '#ffffff'), line, lw * 0.7);

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
    }
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
    circle(0, 0, r, tint(e, base), shade(d.color, -0.5), lw);
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

    if (e.state === 'stun' && e.hitstun > 0.25) {
      ctx.fillStyle = '#ffe066';
      for (let i = 0; i < 3; i++) {
        const a = time * 6 + i * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.8, -r * 1.25 + Math.sin(a) * r * 0.25, Math.max(2, r * 0.12), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // 캐릭터 아래 피해% 게이지 (꽉 차면 200%)
  function drawGauge(e, px, py, r) {
    const pct = Math.round(e.pct);
    const w = Math.max(54, r * 2.4), h = 9, x = px - w / 2, y = py + 8;
    const u = clamp(pct / 200, 0, 1);
    const col = pct < 50 ? '#7dff9a' : pct < 100 ? '#ffd84a' : '#ff4a4a';
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = col; ctx.fillRect(x, y, w * u, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '900 13px system-ui, sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(`${pct}%`, px, y + h + 3);
    ctx.fillStyle = col; ctx.fillText(`${pct}%`, px, y + h + 3);
  }

  function drawEntity(e) {
    const r = e.r * S;
    const px = sx(e.x), py = sy(e.y, e.z);
    const bob = (!e.falling && e.state !== 'spawn' && e.z <= 0) ? -Math.abs(Math.sin(e.walk)) * r * 0.12 : 0;
    ctx.save();
    ctx.translate(px, py - r + bob);
    ctx.rotate(e.tilt + e.spin);
    ctx.scale(e.sqx, e.sqy);
    if (e.kind === 'player') drawPlayer(e, r); else drawEnemy(e, r);
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

    // 보유 능력 아이콘
    let ix = 16, iy = 62;
    const maxX = Math.max(140, W * 0.32);
    for (const [id, l] of Object.entries(player.abil)) {
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ABIL[id].icon, ix, iy);
      const tag = id === 'second_wind' ? `x${player.saves}` : (l > 1 ? String(l) : '');
      if (tag) {
        ctx.font = '800 11px system-ui, sans-serif';
        ctx.fillStyle = '#ffd84a';
        ctx.fillText(tag, ix + 20, iy + 12);
      }
      ix += 34;
      if (ix > maxX) { ix = 16; iy += 28; }
    }

    if (game.banner) {
      const b = game.banner, age = b.max - b.t;
      const a = clamp(Math.min(age * 4, b.t * 2), 0, 1);
      const pop = age < 0.15 ? 1 + (0.15 - age) * 4 : 1;
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.min(64, W * 0.12) * pop}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeText(b.text, W / 2, H * 0.24);
      ctx.fillStyle = '#ffd84a'; ctx.fillText(b.text, W / 2, H * 0.24);
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

    if (game.state !== 'play' || game.picking || chatOpen) return;
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
  window.__bigguy = { game, get player() { return player; }, get enemies() { return enemies; }, get items() { return items; }, dropMeat, startGame, openPick, choose };
})();
