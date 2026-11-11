(() => {
  'use strict';
  const MAP = window.GAME_MAP;
  const socket = io({ transports: ['websocket', 'polling'] });
  const $ = id => document.getElementById(id);

  // 탭마다 다른 대원으로 인식 (새로고침해도 같은 대원 유지)
  let token = sessionStorage.getItem('sc_token');
  if (!token) {
    token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('sc_token', token);
  }

  // 관리자(선생님) 페이지: /host 주소에서 비밀번호를 입력해 입장
  const IS_HOST_PAGE = /^\/host\/?$/.test(location.pathname);
  let teacherKey = IS_HOST_PAGE ? sessionStorage.getItem('sc_teacher') : null;

  const S = {
    joined: false, teacher: false, name: '', myPid: null, colors: [],
    roster: {}, rosterList: [], teacherOnline: false, settings: null, quizCount: 0, phase: 'lobby',
    role: null, mates: [], me: null, quiz: [],
    x: MAP.spawn.x, y: MAP.spawn.y, f: 1, moving: false,
    others: new Map(), bodies: [], tp: 0, meeting: null, end: null, sab: null, tRows: [], tSc: 0,
    task: null, selectedVote: null, meetingSig: '', taskSig: '', tpSig: '', lastSent: 0, lastSentKey: '', endShown: false
  };

  // ---------- 공통 ----------
  const screens = ['joinScreen', 'lobbyScreen', 'gameScreen'];
  function show(id) { screens.forEach(s => $(s).classList.toggle('hidden', s !== id)); if (id === 'gameScreen') resize(); }

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
  }
  function flash(msg, ms) {
    const f = $('flash');
    f.innerHTML = msg;
    f.className = 'flash red';
    setTimeout(() => f.classList.add('hidden'), ms);
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nameOf = pid => (S.roster[pid] ? S.roster[pid].name : '???');
  const colorOf = pid => (S.roster[pid] ? S.roster[pid].color : '#888');
  const stationOf = id => MAP.stations.find(s => s.id === id);
  const d2 = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const doorsNow = () => (S.sab && S.sab.type === 'doors' ? MAP.doorsFor(S.sab.room) : null);

  // ---------- 입장 ----------
  if (IS_HOST_PAGE) {
    $('studentJoin').classList.add('hidden');
    $('teacherJoin').classList.remove('hidden');
    $('joinSub').textContent = '관리자(선생님) 페이지예요. 비밀번호를 입력하세요.';
    document.title = '스페이스 크루 · 관리자';
  }
  $('nameInput').value = localStorage.getItem('sc_name') || '';
  function doJoin() {
    const name = $('nameInput').value.trim();
    if (!name) { $('joinError').textContent = '이름을 입력해 주세요.'; return; }
    localStorage.setItem('sc_name', name);
    S.name = name;
    $('joinError').textContent = '';
    socket.emit('join', { token, name });
  }
  $('joinBtn').onclick = doJoin;
  $('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
  function hostJoin() {
    const pw = $('hostPw').value.trim();
    if (!pw) { $('joinError').textContent = '비밀번호를 입력해 주세요.'; return; }
    teacherKey = pw;
    sessionStorage.setItem('sc_teacher', pw);
    $('joinError').textContent = '';
    socket.emit('join', { token, teacherKey });
  }
  $('teacherBtn').onclick = hostJoin;
  $('hostPw').addEventListener('keydown', e => { if (e.key === 'Enter') hostJoin(); });

  socket.on('connect', () => {
    $('netStatus').classList.add('hidden');
    if (S.joined) socket.emit('join', S.teacher ? { token, teacherKey } : { token, name: S.name });
    else if (IS_HOST_PAGE && teacherKey) socket.emit('join', { token, teacherKey }); // 새로고침하면 자동 입장
  });
  socket.on('disconnect', () => { if (S.joined) $('netStatus').classList.remove('hidden'); });
  socket.on('errorMsg', msg => {
    $('joinError').textContent = msg;
    if (msg.includes('비밀번호')) { sessionStorage.removeItem('sc_teacher'); teacherKey = null; $('hostPw').value = ''; }
    S.joined = false;
    show('joinScreen');
  });
  socket.on('kicked', () => {
    S.joined = false;
    $('netStatus').classList.add('hidden');
    ['meeting', 'endScreen', 'roleReveal', 'taskModal', 'sabMenu'].forEach(id => $(id).classList.add('hidden'));
    $('joinError').textContent = '선생님이 게임에서 내보냈어요. 선생님이 허락하면 다시 탑승할 수 있어요.';
    show('joinScreen');
  });
  socket.on('toast', toast);

  socket.on('joined', d => {
    S.joined = true;
    S.colors = d.colors;
    if (d.teacher) {
      S.teacher = true;
      document.body.classList.add('teacher');
      const saved = localStorage.getItem('sc_quiz');
      $('quizText').value = d.quizText || saved || '';
      if (!d.quizText && saved) socket.emit('setQuiz', saved);
    } else {
      S.myPid = d.pid;
    }
    if (S.phase === 'lobby') show('lobbyScreen');
  });

  // ---------- 대기실 ----------
  socket.on('roster', r => {
    S.roster = {};
    r.players.forEach(p => { S.roster[p.pid] = p; });
    S.rosterList = r.players;
    S.teacherOnline = r.teacherOnline;
    S.settings = r.settings;
    S.quizCount = r.quizCount;
    S.kicked = r.kicked || [];
    renderKicked();
    const prev = S.phase;
    S.phase = r.phase;
    if (!S.joined) return;
    if (r.phase === 'lobby') {
      if (prev !== 'lobby') resetToLobby();
      show('lobbyScreen');
      renderLobby();
    } else if (S.teacher && $('gameScreen').classList.contains('hidden')) {
      show('gameScreen');
      $('teacherPanel').classList.remove('hidden');
    }
    S.meetingSig = '';
    S.tpSig = '';
  });

  function resetToLobby() {
    S.role = null; S.me = null; S.end = null; S.meeting = null; S.sab = null; S.endShown = false;
    closeTask();
    ['meeting', 'endScreen', 'roleReveal', 'sabMenu'].forEach(id => $(id).classList.add('hidden'));
  }

  function renderLobby() {
    const T = S.teacher;
    $('lobbyCount').textContent = `${S.rosterList.length}명`;
    $('teacherState').textContent = T ? '선생님 화면' : (S.teacherOnline ? '선생님 접속 중' : '선생님을 기다리는 중');
    $('teacherState').className = 'teacher-state' + (S.teacherOnline ? ' on' : '');
    $('playerList').innerHTML = S.rosterList.map(p => `
      <li class="${p.pid === S.myPid ? 'me' : ''}">
        <span class="mini-bot" style="--c:${p.color}"></span>
        <span>${esc(p.name)}</span>
        ${T ? `<button class="kick" data-pid="${p.pid}" aria-label="내보내기">✕</button>` : ''}
      </li>`).join('') || '<li>아직 탑승한 대원이 없어요</li>';

    $('colorWrap').classList.toggle('hidden', T);
    if (!T) {
      const mine = S.roster[S.myPid];
      $('colorPicker').innerHTML = S.colors.map(c =>
        `<button style="--c:${c}" data-c="${c}" class="${mine && mine.color === c ? 'on' : ''}" aria-label="색깔 선택"></button>`
      ).join('');
    }

    $('hostPanel').classList.toggle('hidden', !T);
    $('tvBtnLobby').classList.toggle('hidden', !T);
    $('guestPanel').classList.toggle('hidden', T);
    if (T && S.settings) {
      $('setImp').value = S.settings.impostors;
      $('setKill').value = S.settings.killCooldown;
      $('setDiscuss').value = S.settings.discussTime;
      $('setVote').value = S.settings.voteTime;
      $('setTasks').value = S.settings.tasksPerPlayer;
      $('setQuizN').value = S.settings.quizPerPlayer;
      $('quizCount').textContent = S.quizCount;
      const n = S.rosterList.length;
      $('startBtn').disabled = n < 3;
      $('startBtn').textContent = n < 3 ? '3명 이상 모이면 시작' : `${n}명으로 게임 시작`;
    }
  }

  function renderKicked() {
    const html = S.kicked.map(k => `<li>${esc(k.name)} <button data-kid="${k.kid}">취소</button></li>`).join('');
    $('kickedList').innerHTML = html; $('tpKicked').innerHTML = html;
    const show = S.teacher && S.kicked.length > 0;
    $('kickedWrap').classList.toggle('hidden', !show);
    $('tpKickedWrap').classList.toggle('hidden', !show);
  }
  ['kickedList', 'tpKicked'].forEach(id => $(id).addEventListener('click', e => {
    const b = e.target.closest('button[data-kid]');
    if (b) socket.emit('unkick', +b.dataset.kid);
  }));
  // TV 큰 화면: 새 창으로 열어 TV(전자칠판)로 옮기거나, TV 브라우저에서 주소를 직접 입력
  document.querySelectorAll('.screen-open').forEach(b => { b.onclick = () => window.open('/tv', 'spacecrew_tv'); });
  document.querySelectorAll('.tv-url').forEach(el => { el.textContent = location.host + '/tv'; });
  document.querySelectorAll('.tv-copy').forEach(b => {
    b.onclick = () => {
      const url = location.origin + '/tv';
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('TV 주소를 복사했어요.'), () => toast(url));
    };
  });

  function kick(pid) {
    if (confirm(`${nameOf(pid)}님을 게임에서 내보낼까요?`)) socket.emit('kick', pid);
  }
  $('playerList').addEventListener('click', e => {
    const b = e.target.closest('.kick');
    if (b) kick(+b.dataset.pid);
  });
  $('colorPicker').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) socket.emit('setColor', b.dataset.c);
  });
  ['setImp', 'setKill', 'setDiscuss', 'setVote', 'setTasks', 'setQuizN'].forEach(id => {
    $(id).addEventListener('change', () => socket.emit('settings', {
      impostors: $('setImp').value, killCooldown: $('setKill').value,
      discussTime: $('setDiscuss').value, voteTime: $('setVote').value,
      tasksPerPlayer: $('setTasks').value, quizPerPlayer: $('setQuizN').value
    }));
  });
  $('quizSave').onclick = () => {
    localStorage.setItem('sc_quiz', $('quizText').value);
    socket.emit('setQuiz', $('quizText').value);
  };
  $('startBtn').onclick = () => socket.emit('start');
  $('lobbyBtn').onclick = () => socket.emit('backToLobby');
  $('forceEndBtn').onclick = () => { if (confirm('진행 중인 게임을 끝내고 대기실로 돌아갈까요?')) socket.emit('forceEnd'); };
  $('tpList').addEventListener('click', e => {
    const b = e.target.closest('.kick');
    if (b) kick(+b.dataset.pid);
  });

  // ---------- 게임 시작 ----------
  socket.on('gameStart', d => {
    S.role = d.role;
    S.mates = d.mates;
    S.quiz = d.quiz || [];
    S.x = d.x; S.y = d.y;
    S.others.clear();
    S.end = null; S.endShown = false;
    S.taskSig = '';
    $('endScreen').classList.add('hidden');
    show('gameScreen');
    $('roleBadge').textContent = d.role === 'impostor' ? '나는 배신자' : '나는 대원';
    $('roleBadge').className = 'role-badge ' + d.role;
    if (!d.resume) showRole();
  });

  function showRole() {
    const imp = S.role === 'impostor';
    $('revealTitle').textContent = imp ? '배신자' : '대원';
    $('revealTitle').className = 'reveal-title ' + (imp ? 'impostor' : 'crew');
    const mates = S.mates.map(nameOf).map(esc).join(', ');
    $('revealSub').innerHTML = imp
      ? `들키지 않게 대원들을 제거하세요.${mates ? `<br>함께하는 배신자: ${mates}` : ''}<br><small>환풍구와 사보타주를 활용해 보세요</small>`
      : '미션을 모두 끝내고, 숨어 있는 배신자를 찾아내세요.';
    $('roleReveal').classList.remove('hidden');
    SFX.reveal();
    setTimeout(() => $('roleReveal').classList.add('hidden'), 3500);
  }

  socket.on('teleport', d => { S.x = d.x; S.y = d.y; });
  socket.on('didKill', () => { SFX.kill(); GFX.burst(S.x, S.y, '#ff4b5c', 16, 180, .6, 4); });
  socket.on('youDied', () => {
    SFX.kill();
    closeTask();
    $('sabMenu').classList.add('hidden');
    flash('제거당했어요…<br><small>유령이 되어 미션은 계속할 수 있어요</small>', 2800);
  });

  // ---------- 서버 상태 수신 ----------
  function syncOthers(rows, skipSelf) {
    const seen = new Set();
    for (const r of rows) {
      const [pid, x, y, f, m, g] = r;
      if (skipSelf && pid === S.myPid) continue;
      seen.add(pid);
      const o = S.others.get(pid);
      if (o) { o.tx = x; o.ty = y; o.f = f; o.m = m; o.g = g; o.row = r; }
      else S.others.set(pid, { x, y, tx: x, ty: y, f, m, g, row: r });
    }
    for (const pid of S.others.keys()) if (!seen.has(pid)) S.others.delete(pid);
  }

  function showSplash(text) {
    $('splashText').textContent = text;
    const el = $('splashText');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    $('splash').classList.remove('hidden');
    setTimeout(() => $('splash').classList.add('hidden'), 1800);
  }
  let ejectTimer = null, typeTimer = null;
  function showEject(res) {
    if (!res) return;
    const scene = $('ejectScene'), bot = $('ejectBot');
    scene.classList.remove('go', 'hidden');
    bot.style.display = res.ejected !== null ? '' : 'none';
    if (res.ejected !== null) bot.style.setProperty('--c', colorOf(res.ejected));
    void scene.offsetWidth;
    scene.classList.add('go');
    const msg = res.ejected !== null
      ? `${nameOf(res.ejected)}님은 배신자${res.wasImpostor ? '였어요.' : '가 아니었어요.'}`
      : `아무도 추방되지 않았어요. (${res.tie ? '동점' : '건너뛰기'})`;
    const full = msg + '\n남은 배신자 ' + res.impostorsLeft + '명';
    let i = 0;
    clearInterval(typeTimer); clearTimeout(ejectTimer);
    $('ejectText').textContent = '';
    typeTimer = setInterval(() => {
      i++;
      $('ejectText').innerHTML = esc(full.slice(0, i)).replace('\n', '<br><small>') + (i > msg.length ? '</small>' : '');
      if (i >= full.length) clearInterval(typeTimer);
    }, 60);
    SFX.eject();
    ejectTimer = setTimeout(() => scene.classList.add('hidden'), 4600);
  }

  function applyCommon(d) {
    const prevPh = S.fxPhase, prevSab = S.sab, prevStage = S.meeting ? S.meeting.stage : null;
    S.fxPhase = d.ph;
    if (prevPh === 'playing' && d.ph === 'meeting' && d.mt) {
      if (d.mt.reason === 'report') { showSplash('고장 난 대원 발견!'); SFX.report(); }
      else { showSplash('🚨 긴급회의!'); SFX.siren(); }
    }
    if (d.mt && d.mt.stage === 'result' && prevStage !== 'result') showEject(d.mt.result);
    if (d.ph === 'playing') {
      if (!prevSab && d.sab) { if (d.sab.type === 'lights') SFX.lightsOut(); else SFX.door(); }
      if (prevSab && prevSab.type === 'lights' && !d.sab) SFX.lightsOn();
    }
    S.phase = d.ph;
    S.bodies = d.bd;
    S.tp = d.tp;
    S.meeting = d.mt;
    S.end = d.end;
    S.sab = d.sab;
  }

  socket.on('s', d => {
    applyCommon(d);
    S.me = d.me;
    syncOthers(d.pl, true);
    if (S.task) {
      if (S.phase !== 'playing') closeTask();
      else if (S.task.kind === 'lights' && (!S.sab || S.sab.type !== 'lights')) closeTask();
    }
    if (S.phase !== 'playing') $('sabMenu').classList.add('hidden');
    updateMeetingUI();
    updateEndUI();
  });

  socket.on('T', d => {
    applyCommon(d);
    S.tRows = d.pl;
    S.tSc = d.sc;
    syncOthers(d.pl, false);
    updateTeacherPanel();
    updateMeetingUI();
    updateEndUI();
  });

  // ---------- 입력 ----------
  const keys = new Set();
  const joy = { x: 0, y: 0, active: false, id: null };
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    keys.add(e.code);
    if (S.teacher || S.phase !== 'playing' || S.task || !$('sabMenu').classList.contains('hidden')) return;
    if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); doUse(); }
    if (e.code === 'KeyR') doReport();
    if (e.code === 'KeyQ') doKill();
    if (e.code === 'KeyV') doVent();
    if (e.code === 'KeyF') openSabMenu();
    if (e.code === 'KeyM') { $('miniWrap').classList.toggle('big'); miniT = 0; }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) $('joy').classList.remove('hidden');
  const joyEl = $('joy'), knob = $('joyKnob');
  function joyMove(e) {
    const r = joyEl.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2 - 10;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    joy.x = dx / max; joy.y = dy / max;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function joyEnd() { joy.active = false; joy.x = 0; joy.y = 0; knob.style.transform = ''; }
  joyEl.addEventListener('pointerdown', e => { joy.active = true; joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyMove(e); });
  joyEl.addEventListener('pointermove', e => { if (joy.active && e.pointerId === joy.id) joyMove(e); });
  joyEl.addEventListener('pointerup', joyEnd);
  joyEl.addEventListener('pointercancel', joyEnd);

  $('btnUse').onclick = doUse;
  $('btnReport').onclick = doReport;
  $('btnKill').onclick = doKill;
  $('btnVent').onclick = doVent;
  $('btnSab').onclick = openSabMenu;
  $('taskToggle').onclick = () => {
    const w = $('taskListWrap');
    w.classList.toggle('closed');
    $('taskToggle').textContent = w.classList.contains('closed') ? '미션 ▸' : '미션 ▾';
  };
  if (window.innerWidth < 700) $('taskToggle').click();

  // ---------- 주변 확인 ----------
  function nearby() {
    const res = { station: null, button: false, light: false, body: null, target: null, vent: null };
    const me = S.me;
    if (!me || S.phase !== 'playing') return res;

    if (S.role === 'crew') {
      let best = MAP.useRange;
      for (const t of me.tasks) {
        if (t.done) continue;
        const st = stationOf(t.s);
        const dd = d2(S.x, S.y, st.x, st.y);
        if (dd <= best) { best = dd; res.station = st; }
      }
    }
    if (me.alive) {
      if (me.em > 0 && d2(S.x, S.y, MAP.button.x, MAP.button.y) <= MAP.useRange + 20) res.button = true;
      if (S.sab && S.sab.type === 'lights' && d2(S.x, S.y, MAP.lightPanel.x, MAP.lightPanel.y) <= MAP.useRange) res.light = true;
      for (const [id, x, y] of S.bodies) {
        if (d2(S.x, S.y, x, y) <= MAP.reportRange) { res.body = id; break; }
      }
      if (S.role === 'impostor') {
        let best = MAP.killRange;
        for (const [pid, o] of S.others) {
          if (o.g || S.mates.includes(pid)) continue;
          const dd = d2(S.x, S.y, o.x, o.y);
          if (dd <= best) { best = dd; res.target = pid; }
        }
        res.vent = MAP.vents.find(v => d2(S.x, S.y, v.x, v.y) <= MAP.useRange) || null;
      }
    }
    return res;
  }

  function doUse() {
    const n = nearby();
    if (n.light) openPanel('lights', null);
    else if (n.station) openPanel(n.station.type, n.station);
    else if (n.button) socket.emit('emergency');
  }
  function doReport() { const n = nearby(); if (n.body !== null) socket.emit('report', n.body); }
  function doKill() {
    const n = nearby();
    if (n.target !== null && S.me && S.me.kc === 0) socket.emit('kill', n.target);
  }
  function doVent() {
    const n = nearby();
    if (!n.vent) return;
    SFX.vent();
    GFX.burst(S.x, S.y, 'rgba(160,170,200,.6)', 14, 140, .5, 5);
    socket.emit('vent');
  }

  // ---------- 사보타주 메뉴 ----------
  $('sabRooms').innerHTML = MAP.rooms.map(r => `<button data-room="${r.id}">${r.name}</button>`).join('');
  function openSabMenu() {
    if (S.role !== 'impostor' || !S.me || !S.me.alive || S.me.sc > 0 || S.sab) return;
    $('sabMenu').classList.remove('hidden');
  }
  $('sabClose').onclick = () => $('sabMenu').classList.add('hidden');
  $('sabLights').onclick = () => { socket.emit('sabotage', { type: 'lights' }); $('sabMenu').classList.add('hidden'); };
  $('sabRooms').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    socket.emit('sabotage', { type: 'doors', room: b.dataset.room });
    $('sabMenu').classList.add('hidden');
  });

  // ---------- HUD ----------
  function updateHUD() {
    if (S.phase !== 'playing' && S.phase !== 'meeting') return;
    $('progressFill').style.width = Math.round(S.tp * 100) + '%';

    const sb = $('sabBanner');
    if (S.sab && S.phase === 'playing') {
      sb.classList.remove('hidden');
      sb.textContent = S.sab.type === 'lights'
        ? '⚠️ 불이 꺼졌어요! 전기실 패널에서 고쳐 주세요'
        : `🔒 ${MAP.roomName(S.sab.room)} 문 잠김 · ${S.sab.rem}초`;
    } else sb.classList.add('hidden');

    if (S.teacher) return;
    const me = S.me;
    if (!me) return;
    $('ghostNotice').classList.toggle('hidden', me.alive);
    if (!me.alive && S.role === 'impostor') $('ghostNotice').textContent = '유령이 되었어요. 남은 배신자를 응원해 주세요!';

    const n = nearby();
    $('btnUse').disabled = !(n.station || n.button || n.light);
    $('btnUse').textContent = n.light ? '수리' : (!n.station && n.button ? '긴급회의' : '사용');
    $('btnReport').disabled = n.body === null;
    $('btnReport').classList.toggle('hidden', !me.alive);
    const imp = S.role === 'impostor' && me.alive;
    ['btnKill', 'btnSab', 'btnVent'].forEach(id => $(id).classList.toggle('hidden', !imp));
    if (imp) {
      $('killCd').textContent = me.kc > 0 ? me.kc : '';
      $('btnKill').classList.toggle('cooling', me.kc > 0);
      $('btnKill').disabled = me.kc > 0 || n.target === null;
      $('sabCd').textContent = me.sc > 0 && !S.sab ? me.sc : '';
      $('btnSab').classList.toggle('cooling', me.sc > 0 && !S.sab);
      $('btnSab').disabled = me.sc > 0 || !!S.sab;
      $('btnVent').disabled = !n.vent;
    }

    const sig = JSON.stringify(me.tasks);
    if (sig !== S.taskSig) {
      S.taskSig = sig;
      const fake = S.role === 'impostor';
      $('taskList').innerHTML = (fake ? '<li style="color:#9aa4c7">아래는 가짜 미션이에요 (연기용)</li>' : '') +
        me.tasks.map(t => {
          const st = stationOf(t.s);
          return `<li class="${t.done ? 'done' : ''}">${MAP.roomName(st.room)} · ${MAP.taskTypes[st.type].name}</li>`;
        }).join('');
    }
  }

  function updateTeacherPanel() {
    const rows = S.tRows;
    const alive = rows.filter(r => !r[5]);
    const impAlive = alive.filter(r => r[6]).length;
    const sabText = S.sab ? (S.sab.type === 'lights' ? '불 꺼짐' : `${MAP.roomName(S.sab.room)} 문 잠김`) : (S.tSc > 0 ? `대기 ${S.tSc}초` : '사용 가능');
    const phaseText = { playing: '진행 중', meeting: '회의 중', ended: '게임 끝' }[S.phase] || '';
    $('tpSummary').innerHTML =
      `상태 <b>${phaseText}</b> · 미션 <b>${Math.round(S.tp * 100)}%</b><br>` +
      `생존 대원 <b>${alive.length - impAlive}</b>명 · 생존 배신자 <b>${impAlive}</b>명<br>사보타주 <b>${sabText}</b>`;
    const sig = JSON.stringify(rows.map(r => [r[0], r[5], r[6], r[7], r[8], r[9]]));
    if (sig === S.tpSig) return;
    S.tpSig = sig;
    const sorted = rows.slice().sort((a, b) => (b[6] - a[6]) || (a[5] - b[5]) || nameOf(a[0]).localeCompare(nameOf(b[0])));
    $('tpList').innerHTML = sorted.map(r => `
      <li class="${r[6] ? 'imp' : ''} ${r[5] ? 'dead' : ''}">
        <span class="mini-bot" style="--c:${colorOf(r[0])}"></span>
        <span class="nm">${r[6] ? '🗡️ ' : ''}${esc(nameOf(r[0]))}${r[9] ? '' : ' 📴'}</span>
        <span class="tk">${r[6] ? '' : `${r[7]}/${r[8]}`}</span>
        <button class="kick" data-pid="${r[0]}" aria-label="내보내기">✕</button>
      </li>`).join('');
  }

  // ---------- 그래픽 품질 ----------
  const gfxSaved = (() => { try { return localStorage.getItem('sc_gfx'); } catch (e) { return null; } })();
  const weak = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  const Q = { hq: gfxSaved ? gfxSaved === 'high' : !weak, auto: !gfxSaved, sampleStart: 0, frames: 0, time: 0 };

  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Q.hq ? Math.min(2, window.devicePixelRatio || 1) : 1;
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
  }
  window.addEventListener('resize', resize);
  resize();

  let mapCanvas = null, miniBase = null, miniBig = null;
  function buildMaps() {
    mapCanvas = GFX.buildMap(Q.hq ? 1 : 0.5);
    miniBase = GFX.buildMini(360, false);
    miniBig = GFX.buildMini(900, true);
  }
  buildMaps();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildMaps);

  function setQuality(hq, save) {
    Q.hq = hq;
    if (save) { Q.auto = false; try { localStorage.setItem('sc_gfx', hq ? 'high' : 'low'); } catch (e) {} }
    resize();
    buildMaps();
    $('gfxBtn').textContent = hq ? '그래픽 높음' : '그래픽 낮음';
  }
  $('gfxBtn').textContent = Q.hq ? '그래픽 높음' : '그래픽 낮음';
  $('gfxBtn').onclick = () => setQuality(!Q.hq, true);
  $('soundBtn').textContent = SFX.isOn() ? '🔊' : '🔇';
  $('soundBtn').onclick = () => { $('soundBtn').textContent = SFX.toggle() ? '🔊' : '🔇'; };

  // 느린 기기면 자동으로 그래픽을 가볍게
  function watchFps(t, dt) {
    if (!Q.auto || !Q.hq || S.phase !== 'playing') return;
    if (!Q.sampleStart) { Q.sampleStart = t; Q.frames = 0; Q.time = 0; return; }
    Q.frames++; Q.time += dt;
    if (t - Q.sampleStart > 5000) {
      if (Q.time / Q.frames > 0.036) { setQuality(false, false); toast('기기가 느려서 그래픽을 가볍게 바꿨어요.'); }
      Q.auto = false;
    }
  }

  const stars = Array.from({ length: 180 }, () => ({ x: Math.random() * 2000, y: Math.random() * 2000, r: Math.random() * 1.6 + .3, p: Math.random() * 6 }));

  function drawDoors(t) {
    const doors = doorsNow();
    if (!doors) return;
    ctx.save();
    if (Q.hq) { ctx.shadowColor = '#ff4b5c'; ctx.shadowBlur = 18; }
    ctx.fillStyle = `rgba(255,75,92,${0.8 + Math.sin(t / 150) * 0.15})`;
    doors.forEach(d => ctx.fillRect(d.x, d.y, d.w, d.h));
    ctx.restore();
    ctx.strokeStyle = '#2a0a10'; ctx.lineWidth = 3;
    doors.forEach(d => ctx.strokeRect(d.x, d.y, d.w, d.h));
  }

  // 벽에 가려지는 시야 다각형
  function visionPolygon(cx, cy, V, doors) {
    const pts = [];
    const N = Q.hq ? 140 : 64, step = Q.hq ? 10 : 14;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let d = 0;
      while (d < V) {
        const nd = d + step;
        if (!MAP.isOpen(cx + dx * nd, cy + dy * nd, doors)) break;
        d = nd;
      }
      if (d < V) d = Math.min(V, d + 18);
      pts.push([cx + dx * d, cy + dy * d]);
    }
    return pts;
  }

  // 어둠은 작은 캔버스에 그린 뒤 확대해서 가장자리를 부드럽게
  const dark = document.createElement('canvas'), dctx = dark.getContext('2d');
  function drawDarkness(poly, cx, cy, camX, camY, zoom, V) {
    const k = 0.25, w = Math.ceil(W * k), h = Math.ceil(H * k);
    if (dark.width !== w || dark.height !== h) { dark.width = w; dark.height = h; }
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, w, h);
    dctx.fillStyle = 'rgba(3,4,12,.95)';
    dctx.fillRect(0, 0, w, h);
    dctx.globalCompositeOperation = 'destination-out';
    dctx.save();
    dctx.beginPath();
    poly.forEach(([x, y], i) => {
      const sx = (cx + (x - camX) * zoom) * k, sy = (cy + (y - camY) * zoom) * k;
      if (i) dctx.lineTo(sx, sy); else dctx.moveTo(sx, sy);
    });
    dctx.closePath();
    dctx.clip();
    const r = V * zoom * k;
    const g = dctx.createRadialGradient(cx * k, cy * k, 0, cx * k, cy * k, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.62, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g;
    dctx.fillRect(0, 0, w, h);
    dctx.restore();
    dctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(dark, 0, 0, W, H);
  }

  function render(t, dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, W, H);
    const T = S.teacher;

    let zoom, camX, camY, cx = W / 2, cy = H / 2;
    if (T) {
      const panelW = Math.min(300, W * 0.4), availW = W - panelW;
      zoom = Math.min(availW / MAP.width, H / MAP.height) * 0.96;
      camX = MAP.width / 2; camY = MAP.height / 2; cx = availW / 2;
    } else {
      zoom = Math.max(.62, Math.min(1.25, Math.min(W / 1100, H / 700)));
      camX = S.x; camY = S.y;
    }

    // 우주 배경
    if (Q.hq) {
      const n1 = ctx.createRadialGradient(W * .2, H * .25, 0, W * .2, H * .25, W * .6);
      n1.addColorStop(0, 'rgba(90,60,160,.22)'); n1.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = n1; ctx.fillRect(0, 0, W, H);
      const n2 = ctx.createRadialGradient(W * .85, H * .8, 0, W * .85, H * .8, W * .5);
      n2.addColorStop(0, 'rgba(30,120,170,.18)'); n2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = n2; ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = '#c8d2ff';
    const starN = Q.hq ? stars.length : 70;
    for (let i = 0; i < starN; i++) {
      const s = stars[i];
      const sx = ((s.x - camX * .2) % W + W) % W, sy = ((s.y - camY * .2) % H + H) % H;
      ctx.globalAlpha = Q.hq ? .35 + .35 * Math.sin(t / 700 + s.p) + s.r * .15 : .5;
      ctx.fillRect(sx, sy, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    const me = S.me;
    const alive = T ? false : (!me || me.alive);
    const lightsOut = S.sab && S.sab.type === 'lights';
    const V = S.role === 'impostor' ? MAP.visionImpostor : (lightsOut ? MAP.visionDark : MAP.visionCrew);
    const doors = doorsNow();
    const canSee = (x, y) => !alive || (d2(S.x, S.y, x, y) <= V + 20 && MAP.lineOfSight(S.x, S.y, x, y, doors));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);
    ctx.drawImage(mapCanvas, 0, 0, MAP.width, MAP.height);
    drawDoors(t);

    if (lightsOut && S.phase === 'playing') {
      ctx.strokeStyle = '#ff4b5c'; ctx.lineWidth = 4;
      const p = 8 + Math.sin(t / 200) * 5;
      GFX.rr(ctx, MAP.lightPanel.x - 32 - p / 2, MAP.lightPanel.y - 28 - p / 2, 64 + p, 56 + p, 10); ctx.stroke();
    }
    if (me && S.role === 'crew') {
      const pulse = 6 + Math.sin(t / 250) * 4;
      ctx.save();
      if (Q.hq) { ctx.shadowColor = '#ffcf3d'; ctx.shadowBlur = 14; }
      ctx.strokeStyle = '#ffcf3d'; ctx.lineWidth = 3;
      for (const tk of me.tasks) {
        if (tk.done) continue;
        const st = stationOf(tk.s);
        GFX.rr(ctx, st.x - 26 - pulse / 2, st.y - 26 - pulse / 2, 52 + pulse, 52 + pulse, 10); ctx.stroke();
      }
      ctx.restore();
    }
    if (S.role === 'impostor' && me && me.alive) {
      ctx.strokeStyle = 'rgba(255,107,120,.55)'; ctx.lineWidth = 2;
      MAP.vents.forEach(v => { if (d2(S.x, S.y, v.x, v.y) < V) { GFX.rr(ctx, v.x - 31, v.y - 22, 62, 44, 9); ctx.stroke(); } });
    }

    for (const [id, x, y] of S.bodies) if (canSee(x, y)) GFX.drawBrokenBot(ctx, x, y, colorOf(id), t, Q.hq);

    const list = [];
    for (const [pid, o] of S.others) if (canSee(o.x, o.y)) list.push({ pid, ...o });
    if (!T) list.push({ pid: S.myPid, x: S.x, y: S.y, f: S.f, m: S.moving ? 1 : 0, g: alive ? 0 : 1 });
    list.sort((a, b) => a.y - b.y);
    for (const p of list) {
      if (Q.hq && p.m && !p.g && Math.random() < dt * 6) GFX.burst(p.x, p.y + 18, 'rgba(200,210,255,.45)', 1, 25, .5, 3);
      const isImp = T ? (p.row && p.row[6]) : (S.role === 'impostor' && (S.mates.includes(p.pid) || p.pid === S.myPid));
      GFX.drawBot(ctx, p.x, p.y, colorOf(p.pid), p.f, p.m, t, p.g, T && isImp ? '#ff4b5c' : null, T ? 1.7 : 1, Q.hq);
      GFX.drawName(ctx, p.x, p.y - (T ? 66 : 42), nameOf(p.pid), isImp ? '#ff6b78' : (p.g ? 'rgba(255,255,255,.6)' : '#fff'), T ? 34 : 14, Q.hq);
    }
    if (Q.hq) GFX.drawParts(ctx, dt);
    ctx.restore();

    if (alive && S.phase === 'playing') drawDarkness(visionPolygon(S.x, S.y, V, doors), cx, cy, camX, camY, zoom, V);
    if (Q.hq) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .45, W / 2, H / 2, Math.max(W, H) * .75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------- 미니맵 (내 위치만 표시) ----------
  const mini = $('mini'), mctx = mini.getContext('2d');
  let miniT = 0;
  function drawMini(t) {
    if (S.teacher || t - miniT < 120) return;
    miniT = t;
    const big = $('miniWrap').classList.contains('big');
    const base = big ? miniBig : miniBase;
    if (mini.width !== base.width) { mini.width = base.width; mini.height = base.height; }
    const s = base.width / MAP.width, u = big ? 2.4 : 1;
    mctx.drawImage(base, 0, 0);
    if (S.me && S.role === 'crew') {
      mctx.fillStyle = '#ffcf3d';
      for (const tk of S.me.tasks) {
        if (tk.done) continue;
        const st = stationOf(tk.s);
        mctx.beginPath(); mctx.arc(st.x * s, st.y * s, 4 * u, 0, 7); mctx.fill();
      }
    }
    if (S.sab && S.sab.type === 'lights' && Math.sin(t / 200) > 0) {
      mctx.fillStyle = '#ff4b5c'; mctx.beginPath(); mctx.arc(MAP.lightPanel.x * s, MAP.lightPanel.y * s, 6 * u, 0, 7); mctx.fill();
    }
    const doors = doorsNow();
    if (doors) { mctx.fillStyle = '#ff4b5c'; doors.forEach(d => mctx.fillRect(d.x * s - u, d.y * s - u, Math.max(3, d.w * s) + 2 * u, Math.max(3, d.h * s) + 2 * u)); }
    const r = (5 + Math.sin(t / 200) * 1.5) * u;
    mctx.fillStyle = colorOf(S.myPid); mctx.strokeStyle = '#fff'; mctx.lineWidth = 2 * u;
    mctx.beginPath(); mctx.arc(S.x * s, S.y * s, r, 0, 7); mctx.fill(); mctx.stroke();
  }
  mini.addEventListener('click', e => { e.stopPropagation(); $('miniWrap').classList.toggle('big'); miniT = 0; });
  $('miniWrap').addEventListener('click', e => { if (e.target === $('miniWrap')) { $('miniWrap').classList.remove('big'); miniT = 0; } });

  // ---------- 이동 ----------
  function updateMove(dt) {
    let ix = 0, iy = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) ix -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) ix += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) iy -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) iy += 1;
    ix += joy.x; iy += joy.y;
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }

    if (len > .15) {
      let doors = doorsNow();
      if (doors && !MAP.isWalkable(S.x, S.y, doors)) doors = null; // 문에 끼었으면 빠져나올 수 있게
      const sp = MAP.speed * dt;
      const nx = S.x + ix * sp;
      if (MAP.isWalkable(nx, S.y, doors)) S.x = nx;
      const ny = S.y + iy * sp;
      if (MAP.isWalkable(S.x, ny, doors)) S.y = ny;
      if (Math.abs(ix) > .15) S.f = ix < 0 ? -1 : 1;
      S.moving = true;
    } else S.moving = false;
  }

  function sendMove(t) {
    if (t - S.lastSent < 50) return;
    const key = `${Math.round(S.x)},${Math.round(S.y)},${S.f},${S.moving}`;
    if (key === S.lastSentKey) return;
    S.lastSent = t; S.lastSentKey = key;
    socket.volatile.emit('move', { x: Math.round(S.x * 10) / 10, y: Math.round(S.y * 10) / 10, f: S.f, m: S.moving });
  }

  let last = performance.now();
  function frame(t) {
    const dt = Math.min(.05, (t - last) / 1000);
    last = t;
    if (!$('gameScreen').classList.contains('hidden')) {
      const menuOpen = !$('sabMenu').classList.contains('hidden');
      if (!S.teacher && S.phase === 'playing' && !S.task && !menuOpen && S.me) {
        updateMove(dt);
        sendMove(t);
      } else S.moving = false;
      const k = 1 - Math.pow(.0001, dt);
      for (const o of S.others.values()) {
        if (Math.hypot(o.tx - o.x, o.ty - o.y) > 300) { o.x = o.tx; o.y = o.ty; }
        o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k;
      }
      render(t, dt);
      drawMini(t);
      watchFps(t, dt);
      updateHUD();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- 미니게임 ----------
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const shakeEl = el => { SFX.wrong(); if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); };

  function openPanel(kind, st) {
    if (S.task) return;
    const body = $('taskBody');
    const done = () => {
      body.innerHTML = '<div class="tg-done">완료!</div>';
      SFX.task();
      const fx = st || MAP.lightPanel;
      GFX.burst(fx.x, fx.y, '#ffcf3d', 16, 170, .8, 4);
      GFX.burst(fx.x, fx.y, '#3ee07a', 10, 120, .8, 3);
      if (kind === 'lights') socket.emit('fixLights');
      else socket.emit('task', st.id);
      setTimeout(closeTask, 700);
    };
    const cleanup = MINIGAMES[kind](body, done) || (() => {});
    S.task = { kind, st, cleanup };
    S.moving = false;
    $('taskModal').classList.remove('hidden');
  }

  function closeTask() {
    if (S.task) { S.task.cleanup(); S.task = null; }
    $('taskModal').classList.add('hidden');
    $('taskBody').innerHTML = '';
  }
  $('taskClose').onclick = closeTask;

  const MINIGAMES = {
    wires(root, done) {
      const cols = ['#ff4d4d', '#3d8bff', '#ffd23f', '#c64dff'];
      const L = shuffle([0, 1, 2, 3]), R = shuffle([0, 1, 2, 3]);
      root.innerHTML = `<div class="tg-title">같은 색 전선끼리 연결하세요</div>
        <div class="wires"><svg width="300" height="240"></svg>
        <div class="wcol l">${L.map((c, i) => `<button data-i="${i}" style="--c:${cols[c]}"></button>`).join('')}</div>
        <div class="wcol r">${R.map((c, i) => `<button data-i="${i}" style="--c:${cols[c]}"></button>`).join('')}</div></div>`;
      const svg = root.querySelector('svg');
      const rowY = i => 8 + 22 + i * 52;
      let sel = null, count = 0;
      root.querySelectorAll('.wcol.l button').forEach(b => b.onclick = () => {
        if (b.classList.contains('ok')) return;
        root.querySelectorAll('.wcol.l button').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel'); sel = +b.dataset.i;
      });
      root.querySelectorAll('.wcol.r button').forEach(b => b.onclick = () => {
        if (sel === null || b.classList.contains('ok')) return;
        const ri = +b.dataset.i;
        const lb = root.querySelector(`.wcol.l button[data-i="${sel}"]`);
        if (L[sel] === R[ri]) {
          svg.insertAdjacentHTML('beforeend',
            `<line x1="50" y1="${rowY(sel)}" x2="250" y2="${rowY(ri)}" stroke="${cols[L[sel]]}" stroke-width="10" stroke-linecap="round"/>`);
          lb.classList.add('ok'); b.classList.add('ok'); lb.classList.remove('sel');
          sel = null;
          if (++count === 4) setTimeout(done, 250);
        } else shakeEl(root.querySelector('.wires'));
      });
    },

    numbers(root, done) {
      const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      root.innerHTML = `<div class="tg-title">1부터 10까지 순서대로 누르세요</div>
        <div class="num-grid">${nums.map(n => `<button data-n="${n}">${n}</button>`).join('')}</div>`;
      let next = 1;
      const grid = root.querySelector('.num-grid');
      grid.onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        if (+b.dataset.n === next) {
          b.classList.add('ok');
          if (++next > 10) setTimeout(done, 200);
        } else {
          next = 1;
          grid.querySelectorAll('button').forEach(x => x.classList.remove('ok'));
          shakeEl(grid);
        }
      };
    },

    download(root, done) {
      root.innerHTML = `<div class="tg-title">데이터를 본부로 업로드하세요</div>
        <div class="bar"><div class="bar-fill"></div></div>
        <p id="dlText" class="hint">버튼을 누르면 업로드가 시작돼요</p>
        <button class="btn btn-main" id="dlBtn">업로드 시작</button>`;
      let timer = null;
      root.querySelector('#dlBtn').onclick = e => {
        e.target.disabled = true;
        const start = performance.now();
        timer = setInterval(() => {
          const p = (performance.now() - start) / 6000 * 100; // 6초
          root.querySelector('.bar-fill').style.width = Math.min(100, p) + '%';
          root.querySelector('#dlText').textContent = `업로드 중… ${Math.min(100, Math.round(p))}%`;
          if (p >= 100) { clearInterval(timer); timer = null; done(); }
        }, 100);
      };
      return () => timer && clearInterval(timer);
    },

    fuel(root, done) {
      root.innerHTML = `<div class="tg-title">버튼을 꾹 눌러 연료를 채우세요</div>
        <div class="fuel-tank"><div class="fuel-level"></div></div>
        <button class="btn btn-main hold-btn">꾹 누르기</button>`;
      let level = 0, holding = false, finished = false;
      const btn = root.querySelector('.hold-btn'), lv = root.querySelector('.fuel-level');
      let lastT = performance.now();
      btn.addEventListener('pointerdown', e => { holding = true; lastT = performance.now(); btn.setPointerCapture(e.pointerId); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, () => holding = false));
      const timer = setInterval(() => {
        const t = performance.now(), dt = t - lastT;
        lastT = t;
        if (!holding || finished) return;
        level = Math.min(100, level + dt / 2500 * 100); // 2.5초 동안 누르면 가득
        lv.style.height = level + '%';
        if (level >= 100) { finished = true; done(); }
      }, 50);
      return () => clearInterval(timer);
    },

    calibrate(root, done) {
      root.innerHTML = `<div class="tg-title">초록 칸에서 멈추세요 (3번)</div>
        <div class="cal-dots">○○○</div>
        <div class="cal-track"><div class="cal-zone"></div><div class="cal-needle"></div></div>
        <button class="btn btn-main" id="calBtn">멈춰!</button>`;
      const zone = root.querySelector('.cal-zone'), needle = root.querySelector('.cal-needle'), dots = root.querySelector('.cal-dots');
      let pos = 0, dir = 1, speed = 55, hits = 0, zStart = 0, zWidth = 22, raf = null, lastT = performance.now();
      function newZone() {
        zWidth = 22 - hits * 4;
        zStart = 8 + Math.random() * (84 - zWidth);
        zone.style.left = zStart + '%'; zone.style.width = zWidth + '%';
      }
      function loop(t) {
        const dt = Math.min(.05, (t - lastT) / 1000); lastT = t;
        pos += dir * speed * dt;
        if (pos > 100) { pos = 100; dir = -1; }
        if (pos < 0) { pos = 0; dir = 1; }
        needle.style.left = pos + '%';
        raf = requestAnimationFrame(loop);
      }
      newZone();
      raf = requestAnimationFrame(loop);
      root.querySelector('#calBtn').onclick = () => {
        if (hits >= 3) return;
        if (pos >= zStart && pos <= zStart + zWidth) {
          hits++;
          dots.textContent = '●'.repeat(hits) + '○'.repeat(3 - hits);
          speed += 25;
          if (hits === 3) { cancelAnimationFrame(raf); setTimeout(done, 250); }
          else newZone();
        } else shakeEl(root.querySelector('.cal-track'));
      };
      return () => cancelAnimationFrame(raf);
    },

    swipe(root, done) {
      root.innerHTML = `<div class="tg-title">카드를 오른쪽 끝까지 밀어 긁으세요</div>
        <div class="swipe-track"><div class="swipe-card">ID 카드</div></div>
        <div class="swipe-msg hint">너무 빠르지도, 느리지도 않게!</div>`;
      const track = root.querySelector('.swipe-track'), card = root.querySelector('.swipe-card'), msg = root.querySelector('.swipe-msg');
      let dragging = false, startX = 0, startT = 0, x = 0, finished = false;
      const maxX = () => track.clientWidth - card.offsetWidth - 8;
      card.addEventListener('pointerdown', e => {
        if (finished) return;
        dragging = true; startX = e.clientX - x; startT = performance.now(); card.setPointerCapture(e.pointerId);
      });
      card.addEventListener('pointermove', e => {
        if (!dragging) return;
        x = Math.max(0, Math.min(maxX(), e.clientX - startX));
        card.style.transform = `translateX(${x}px)`;
      });
      const end = () => {
        if (!dragging) return;
        dragging = false;
        const time = (performance.now() - startT) / 1000;
        if (x >= maxX() - 4) {
          if (time < 0.35) msg.textContent = '너무 빨라요! 다시 해 보세요';
          else if (time > 2.5) msg.textContent = '너무 느려요! 다시 해 보세요';
          else { finished = true; msg.textContent = '인식 완료!'; setTimeout(done, 300); return; }
        } else msg.textContent = '끝까지 밀어 주세요';
        x = 0; card.style.transform = '';
        shakeEl(track);
      };
      card.addEventListener('pointerup', end);
      card.addEventListener('pointercancel', end);
    },

    trash(root, done) {
      root.innerHTML = `<div class="tg-title">레버를 끝까지 내려 2초 버티세요</div>
        <div class="trash-wrap"><div class="trash-bin"><div class="trash-fill"></div></div>
        <div class="lever-track"><div class="lever-knob"></div></div></div>`;
      const track = root.querySelector('.lever-track'), knobEl = root.querySelector('.lever-knob'), fill = root.querySelector('.trash-fill');
      let dragging = false, startY = 0, y = 0, amount = 100, finished = false, lastT = performance.now();
      const maxY = () => track.clientHeight - knobEl.offsetHeight;
      knobEl.addEventListener('pointerdown', e => { dragging = true; startY = e.clientY - y; knobEl.setPointerCapture(e.pointerId); });
      knobEl.addEventListener('pointermove', e => {
        if (!dragging) return;
        y = Math.max(0, Math.min(maxY(), e.clientY - startY));
        knobEl.style.top = y + 'px';
      });
      const release = () => { dragging = false; y = 0; knobEl.style.top = '0px'; };
      knobEl.addEventListener('pointerup', release);
      knobEl.addEventListener('pointercancel', release);
      const timer = setInterval(() => {
        const t = performance.now(), dt = t - lastT; lastT = t;
        if (finished) return;
        if (dragging && y >= maxY() - 6) {
          amount = Math.max(0, amount - dt / 2000 * 100);
          fill.style.height = amount + '%';
          if (amount <= 0) { finished = true; done(); }
        }
      }, 50);
      return () => clearInterval(timer);
    },

    asteroids(root, done) {
      root.innerHTML = `<div class="tg-title">운석 8개를 눌러 부수세요 (<span id="astN">0</span>/8)</div>
        <div class="astro-field"></div>`;
      const field = root.querySelector('.astro-field'), counter = root.querySelector('#astN');
      let hits = 0, raf = null, lastT = performance.now(), spawnAcc = 0;
      const rocks = [];
      function spawn() {
        const el = document.createElement('button');
        el.className = 'astro';
        el.setAttribute('aria-label', '운석');
        const r = { el, x: 320, y: 20 + Math.random() * 190, vx: -(60 + Math.random() * 70), vy: (Math.random() - .5) * 40 };
        el.addEventListener('pointerdown', e => {
          e.preventDefault();
          el.remove(); rocks.splice(rocks.indexOf(r), 1);
          counter.textContent = ++hits;
          if (hits >= 8) { cancelAnimationFrame(raf); setTimeout(done, 200); }
        });
        field.appendChild(el); rocks.push(r);
      }
      function loop(t) {
        const dt = Math.min(.05, (t - lastT) / 1000); lastT = t;
        spawnAcc += dt;
        if (spawnAcc > .55 && rocks.length < 5) { spawnAcc = 0; spawn(); }
        for (const r of rocks.slice()) {
          r.x += r.vx * dt; r.y += r.vy * dt;
          if (r.x < -30) { r.el.remove(); rocks.splice(rocks.indexOf(r), 1); continue; }
          r.el.style.left = r.x + 'px'; r.el.style.top = r.y + 'px';
        }
        raf = requestAnimationFrame(loop);
      }
      spawn();
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    },

    quiz(root, done) {
      if (!S.quiz.length) {
        root.innerHTML = '<div class="tg-title">퀴즈가 준비되지 않았어요</div><button class="btn btn-main" id="qOk">미션 통과</button>';
        root.querySelector('#qOk').onclick = done;
        return;
      }
      let lockTimer = null;
      function ask(prevIdx) {
        let idx = Math.floor(Math.random() * S.quiz.length);
        if (S.quiz.length > 1 && idx === prevIdx) idx = (idx + 1) % S.quiz.length;
        const q = S.quiz[idx];
        root.innerHTML = `<div class="tg-title">지식 퀴즈</div>
          <div class="quiz-q">${esc(q.q)}</div>
          <div class="quiz-c">${q.c.map((c, i) => `<button data-i="${i}">${i + 1}. ${esc(c)}</button>`).join('')}</div>
          <p class="hint" id="qMsg"></p>`;
        root.querySelector('.quiz-c').onclick = e => {
          const b = e.target.closest('button'); if (!b || b.disabled) return;
          if (+b.dataset.i === q.a) { done(); return; }
          b.classList.add('wrong');
          root.querySelectorAll('.quiz-c button').forEach(x => x.disabled = true);
          root.querySelector('#qMsg').textContent = '틀렸어요! 3초 뒤 다른 문제가 나와요';
          lockTimer = setTimeout(() => ask(idx), 3000);
        };
      }
      ask(-1);
      return () => clearTimeout(lockTimer);
    },

    lights(root, done) {
      let sw = [0, 0, 0, 0, 0].map(() => Math.random() < .4);
      if (sw.every(Boolean)) sw[0] = false;
      root.innerHTML = `<div class="tg-title">스위치를 모두 위로 올려 불을 켜세요</div><div class="switches"></div>`;
      const box = root.querySelector('.switches');
      const draw = () => { box.innerHTML = sw.map((on, i) => `<button class="${on ? 'on' : ''}" data-i="${i}" aria-label="스위치 ${i + 1}"></button>`).join(''); };
      draw();
      box.onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        sw[+b.dataset.i] = !sw[+b.dataset.i];
        draw();
        if (sw.every(Boolean)) setTimeout(done, 200);
      };
    }
  };

  // ---------- 회의 ----------
  $('mGrid').addEventListener('click', e => {
    const c = e.target.closest('.m-card');
    const m = S.meeting;
    if (!c || !m || S.teacher || m.stage !== 'vote' || !S.me || !S.me.alive || m.voted.includes(S.myPid)) return;
    const pid = +c.dataset.pid;
    if (S.roster[pid] && S.roster[pid].dead) return;
    S.selectedVote = S.selectedVote === pid ? null : pid;
    SFX.click();
    S.meetingSig = '';
    updateMeetingUI();
  });
  $('mVote').onclick = () => {
    if (S.selectedVote === null) { toast('먼저 의심되는 대원을 고르세요.'); return; }
    socket.emit('vote', S.selectedVote);
    SFX.vote();
  };
  $('mSkip').onclick = () => { socket.emit('vote', 'skip'); SFX.vote(); };

  function updateMeetingUI() {
    const m = S.meeting;
    const box = $('meeting');
    if (S.phase !== 'meeting' || !m) {
      box.classList.add('hidden');
      S.selectedVote = null;
      S.meetingSig = '';
      return;
    }
    box.classList.remove('hidden');

    $('mTitle').textContent = m.reason === 'report' ? '고장 난 대원 발견!' : '긴급회의!';
    $('mSub').textContent = m.reason === 'report'
      ? `${nameOf(m.caller)}님이 ${nameOf(m.body)}님을 발견하고 신고했어요`
      : `${nameOf(m.caller)}님이 긴급회의를 열었어요`;
    $('mTimer').textContent = m.stage === 'discuss'
      ? `토론 시간 ${m.rem}초 · 서로 이야기를 나눠 보세요`
      : m.stage === 'vote' ? `투표 시간 ${m.rem}초` : '투표 결과';

    const iVoted = m.voted.includes(S.myPid);
    const canVote = !S.teacher && m.stage === 'vote' && S.me && S.me.alive && !iVoted;
    $('mVote').disabled = !canVote;
    $('mSkip').disabled = !canVote;
    $('mVote').classList.toggle('hidden', m.stage === 'result');
    $('mSkip').classList.toggle('hidden', m.stage === 'result');

    const aliveCount = S.rosterList.filter(p => !p.dead).length;
    $('mStatus').textContent = m.stage === 'result' ? ''
      : S.teacher ? `관전 중 · 투표 ${m.voted.length}/${aliveCount}명`
      : (S.me && !S.me.alive) ? '유령은 투표할 수 없어요'
      : iVoted ? `투표 완료! (${m.voted.length}/${aliveCount}명 투표함)`
      : m.stage === 'vote' ? `대원을 고른 뒤 투표하기를 누르세요 (${m.voted.length}/${aliveCount})`
      : '토론이 끝나면 투표가 시작돼요';

    const res = m.result;
    const resBox = $('mResult');
    if (res) {
      resBox.classList.remove('hidden');
      resBox.innerHTML = res.ejected !== null
        ? `${esc(nameOf(res.ejected))}님이 우주로 추방되었어요.<br>${esc(nameOf(res.ejected))}님은 배신자${res.wasImpostor ? '였어요!' : '가 아니었어요…'}<br><small>남은 배신자 ${res.impostorsLeft}명</small>`
        : `아무도 추방되지 않았어요. (${res.tie ? '동점' : '건너뛰기'})<br><small>남은 배신자 ${res.impostorsLeft}명</small>`;
    } else resBox.classList.add('hidden');

    const sig = [m.stage, m.voted.join(','), S.selectedVote, JSON.stringify(S.rosterList.map(p => [p.pid, p.dead])), res ? 1 : 0].join('|');
    if (sig === S.meetingSig) return;
    S.meetingSig = sig;
    $('mGrid').innerHTML = S.rosterList.map(p => {
      const tags = [];
      if (p.pid === m.caller) tags.push('<span class="tag">소집</span>');
      if (S.teacher && p.role === 'impostor') tags.push('<span class="tag count">배신자</span>');
      if (res && res.tally[p.pid]) tags.push(`<span class="tag count">${res.tally[p.pid]}표</span>`);
      else if (!res && m.voted.includes(p.pid)) tags.push('<span class="tag voted">투표함</span>');
      return `<button class="m-card ${p.dead ? 'dead' : ''} ${S.selectedVote === p.pid ? 'sel' : ''}" data-pid="${p.pid}">
        <span class="mini-bot" style="--c:${p.color}"></span>
        <span class="m-name">${esc(p.name)}${p.pid === S.myPid ? ' (나)' : ''}</span>${tags.join('')}
      </button>`;
    }).join('') + (res && res.tally.skip ? `<div class="m-card"><span class="m-name">건너뛰기</span><span class="tag count">${res.tally.skip}표</span></div>` : '');
  }

  // ---------- 게임 끝 ----------
  function updateEndUI() {
    const box = $('endScreen');
    if (S.phase !== 'ended' || !S.end) { box.classList.add('hidden'); S.endShown = false; return; }
    $('lobbyBtn').classList.toggle('hidden', !S.teacher);
    $('endWait').classList.toggle('hidden', S.teacher);
    if (S.endShown) return;
    S.endShown = true;
    if (S.teacher || ((S.end.winner === 'impostor') === (S.role === 'impostor'))) SFX.win(); else SFX.lose();
    closeTask();
    $('sabMenu').classList.add('hidden');

    const e = S.end;
    $('endTitle').textContent = e.winner === 'crew' ? '대원 승리!' : '배신자 승리!';
    $('endTitle').className = 'end-title ' + e.winner;
    let mine = '';
    if (!S.teacher && S.role) mine = ((e.winner === 'impostor') === (S.role === 'impostor')) ? ' 🎉 우리 팀이 이겼어요!' : '';
    $('endReason').textContent = e.reason + mine;
    $('endImps').innerHTML = '<span>배신자는</span>' + e.impostors.map(pid =>
      `<span><span class="mini-bot" style="--c:${colorOf(pid)};margin-top:6px"></span>${esc(nameOf(pid))}</span>`).join('');

    // 상장
    const stats = e.stats || [];
    const top = (list, key) => {
      const max = Math.max(0, ...list.map(s => s[key]));
      return max > 0 ? { names: list.filter(s => s[key] === max).map(s => nameOf(s.pid)), max } : null;
    };
    const crew = stats.filter(s => s.role === 'crew'), imps = stats.filter(s => s.role === 'impostor');
    const awards = [
      ['🛠️ 미션왕', top(crew, 'tasks'), '개 완료'],
      ['🔍 명탐정', top(crew, 'correct'), '번 정답 투표'],
      ['🚨 신고왕', top(stats, 'reports'), '번 신고'],
      ['🗡️ 최고의 배신자', top(imps, 'kills'), '명 제거']
    ].filter(a => a[1]);
    $('endAwards').innerHTML = awards.map(([t, w, unit]) =>
      `<div class="award"><div class="aw-t">${t}</div><div class="aw-n">${w.names.map(esc).join(', ')} · ${w.max}${unit}</div></div>`).join('');

    const sorted = stats.slice().sort((a, b) => (b.role === 'impostor') - (a.role === 'impostor') || b.tasks - a.tasks);
    $('endStats').innerHTML = `<tr><th>이름</th><th>역할</th><th>미션</th><th>제거</th><th>신고</th><th>정답 투표</th></tr>` +
      sorted.map(s => `<tr class="${s.role === 'impostor' ? 'imp' : ''} ${s.pid === S.myPid ? 'me' : ''}">
        <td>${esc(nameOf(s.pid))}${s.alive ? '' : ' 💀'}</td><td>${s.role === 'impostor' ? '배신자' : '대원'}</td>
        <td>${s.role === 'crew' ? s.tasks : '-'}</td><td>${s.role === 'impostor' ? s.kills : '-'}</td>
        <td>${s.reports}</td><td>${s.role === 'crew' ? `${s.correct}/${s.votes}` : '-'}</td></tr>`).join('');
    box.classList.remove('hidden');
  }
})();
