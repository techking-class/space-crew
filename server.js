// 스페이스 크루 : 배신자를 찾아라 - 게임 서버
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const MAP = require('./public/map.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000 });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || 'teacher1234';
if (!process.env.TEACHER_PASSWORD) console.log('⚠️  TEACHER_PASSWORD 환경변수가 없어 기본 비밀번호(teacher1234)를 사용합니다.');

const MAX_PLAYERS = 40;
const TICK_HZ = 12;
const LEAVE_GRACE_MS = 60000;
const SABOTAGE_COOLDOWN_MS = 35000;
const DOOR_LOCK_MS = 12000;

const COLORS = [
  '#e6372f', '#2f6be6', '#2fbf4a', '#f5c518', '#f28c28', '#8e44ec',
  '#ff6fb5', '#3fe0d0', '#8b5a2b', '#f2f2f2', '#4a4a4a', '#a3e635',
  '#1e3a8a', '#ffb4a2', '#7f8c8d', '#b8860b', '#00897b', '#c0392b'
];

// 이름 필터 (필요하면 단어를 더 추가하세요)
const BAD_WORDS = ['시발', '씨발', '씨빨', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '개새', '새끼', 'ㅅㄲ', '존나', 'ㅈㄴ', '좆', '지랄', 'ㅈㄹ',
  '미친', '닥쳐', '꺼져', '엠창', '느금', '니애미', '애미', '애비', 'fuck', 'shit', 'bitch', 'sex', '섹스', '변태', '찐따', '장애'];

const game = {
  phase: 'lobby', // lobby | playing | meeting | ended
  players: new Map(), // token -> player
  teachers: new Map(), // token -> socketId
  screens: new Set(), // 전자칠판 화면 socketId
  kicked: new Set(),
  kickedList: [], // { kid, token, name }
  nextKid: 1,
  bodies: [],
  meeting: null,
  endInfo: null,
  sab: null, // { type: 'lights' } | { type: 'doors', room, until }
  sabReadyAt: 0,
  quiz: [],
  nextPid: 1,
  settings: { impostors: 0, killCooldown: 25, discussTime: 30, voteTime: 45, tasksPerPlayer: 5, quizPerPlayer: 1 }
};

// ---------- 도우미 ----------
const now = () => Date.now();
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const allPlayers = () => [...game.players.values()];
const byPid = pid => allPlayers().find(p => p.pid === pid);
const playerOf = socket => game.players.get(socket.data.token);
const isTeacher = socket => socket.data.teacher === true && game.teachers.has(socket.data.token);
const socketOf = p => (p && p.socketId ? io.sockets.sockets.get(p.socketId) : null);
const teacherSockets = () => [...game.teachers.values()].map(id => io.sockets.sockets.get(id)).filter(Boolean);
const screenSockets = () => [...game.screens].map(id => io.sockets.sockets.get(id)).filter(Boolean);
const doorsNow = () => (game.sab && game.sab.type === 'doors' ? MAP.doorsFor(game.sab.room) : null);

function autoImpostors(n) {
  if (n <= 6) return 1;
  if (n <= 12) return 2;
  if (n <= 20) return 3;
  if (n <= 26) return 4;
  return 5;
}

function checkName(name, token) {
  const flat = name.replace(/[\s._\-~!@#$%^&*0-9]/g, '').toLowerCase();
  if (BAD_WORDS.some(w => flat.includes(w))) return '사용할 수 없는 이름이에요. 다른 이름을 써 주세요.';
  for (const p of game.players.values()) {
    if (p.token !== token && p.name === name) return '이미 같은 이름의 대원이 있어요. 성이나 번호를 붙여 주세요.';
  }
  return null;
}

function parseQuiz(text) {
  const out = [];
  for (const line of String(text || '').split('\n').slice(0, 100)) {
    const parts = line.split('|').map(s => s.trim()).filter(s => s.length);
    if (parts.length < 4) continue;
    const ans = Number(parts[parts.length - 1]);
    const choices = parts.slice(1, -1).slice(0, 4);
    if (!Number.isInteger(ans) || ans < 1 || ans > choices.length || choices.length < 2) continue;
    out.push({ q: parts[0].slice(0, 120), c: choices.map(c => c.slice(0, 40)), a: ans - 1 });
  }
  return out;
}

function taskProgress() {
  let total = 0, done = 0;
  for (const p of game.players.values()) {
    if (p.role !== 'crew') continue;
    for (const t of p.tasks) { total++; if (t.done) done++; }
  }
  return total === 0 ? 0 : done / total;
}

function rosterFor(viewer, teacher) {
  const viewerDead = viewer && viewer.role && !viewer.alive && game.phase !== 'lobby';
  return {
    players: allPlayers().filter(p => !p.kicked).map(p => ({
      pid: p.pid,
      name: p.name,
      color: p.color,
      connected: p.connected,
      dead: game.phase === 'lobby' ? false : (!p.alive && (teacher || p.deadKnown || viewerDead)),
      role: teacher ? p.role : undefined
    })),
    teacherOnline: game.teachers.size > 0,
    kicked: teacher ? game.kickedList.map(k => ({ kid: k.kid, name: k.name })) : undefined,
    settings: game.settings,
    quizCount: game.quiz.length,
    phase: game.phase
  };
}

function broadcastRoster() {
  for (const p of game.players.values()) {
    const s = socketOf(p);
    if (s) s.emit('roster', rosterFor(p, false));
  }
  const tr = rosterFor(null, true);
  teacherSockets().forEach(s => s.emit('roster', tr));
  const sr = rosterFor(null, false);
  screenSockets().forEach(s => s.emit('roster', sr));
}

function toastAll(msg) { io.emit('toast', msg); }

function sendGameStart(p, resume) {
  const s = socketOf(p);
  if (!s) return;
  const mates = p.role === 'impostor'
    ? allPlayers().filter(o => o.role === 'impostor' && o !== p).map(o => o.pid)
    : [];
  s.emit('gameStart', { role: p.role, mates, x: p.x, y: p.y, resume: !!resume, quiz: game.quiz });
}

function teleport(p, x, y) {
  p.x = x; p.y = y;
  const s = socketOf(p);
  if (s) s.emit('teleport', { x, y });
}

function gatherAtTable() {
  const list = allPlayers();
  list.forEach((p, i) => {
    const sp = MAP.spawnPoint(i, list.length);
    teleport(p, sp.x, sp.y);
  });
}

function newStats() { return { tasks: 0, kills: 0, reports: 0, correct: 0, votes: 0 }; }

// ---------- 게임 흐름 ----------
function startGame() {
  for (const [tok, p] of game.players) if (!p.connected || p.kicked) game.players.delete(tok);
  const list = allPlayers();
  if (list.length < 3) {
    teacherSockets().forEach(s => s.emit('toast', '최소 3명이 있어야 시작할 수 있어요.'));
    return;
  }

  let n = game.settings.impostors || autoImpostors(list.length);
  n = Math.max(1, Math.min(n, Math.floor((list.length - 1) / 2)));
  const impostors = new Set(shuffle(list).slice(0, n).map(p => p.pid));
  const t = now();
  const normal = MAP.stations.filter(s => s.type !== 'quiz');
  const quizSt = MAP.stations.filter(s => s.type === 'quiz');
  const quizN = game.quiz.length ? game.settings.quizPerPlayer : 0;

  list.forEach((p, i) => {
    p.role = impostors.has(p.pid) ? 'impostor' : 'crew';
    p.alive = true;
    p.deadKnown = false;
    p.emergencyLeft = 1;
    p.killReadyAt = t + 10000;
    p.moving = false;
    p.stats = newStats();
    p.tasks = shuffle(normal).slice(0, game.settings.tasksPerPlayer)
      .concat(shuffle(quizSt).slice(0, quizN))
      .map(st => ({ s: st.id, done: false }));
    const sp = MAP.spawnPoint(i, list.length);
    p.x = sp.x; p.y = sp.y;
  });

  game.bodies = [];
  game.meeting = null;
  game.endInfo = null;
  game.sab = null;
  game.sabReadyAt = t + 20000;
  game.phase = 'playing';
  list.forEach(p => sendGameStart(p, false));
  broadcastRoster();
}

function endGame(winner, reason) {
  game.phase = 'ended';
  game.meeting = null;
  game.sab = null;
  game.endInfo = {
    winner,
    reason,
    impostors: allPlayers().filter(p => p.role === 'impostor').map(p => p.pid),
    stats: allPlayers().filter(p => p.role && !p.kicked).map(p => Object.assign({ pid: p.pid, role: p.role, alive: p.alive }, p.stats))
  };
  for (const p of game.players.values()) p.deadKnown = true;
  broadcastRoster();
}

function checkWin() {
  if (game.phase !== 'playing' && game.phase !== 'meeting') return false;
  const list = allPlayers();
  const aliveImp = list.filter(p => p.alive && p.role === 'impostor').length;
  const aliveCrew = list.filter(p => p.alive && p.role === 'crew').length;
  if (aliveImp === 0) { endGame('crew', '배신자를 모두 찾아냈어요!'); return true; }
  if (aliveImp >= aliveCrew) { endGame('impostor', '배신자가 우주선을 장악했어요!'); return true; }
  if (taskProgress() >= 1) { endGame('crew', '모든 미션을 완료했어요!'); return true; }
  return false;
}

function backToLobby() {
  for (const [tok, p] of game.players) if (!p.connected || p.kicked) game.players.delete(tok);
  for (const p of game.players.values()) {
    p.role = null; p.alive = true; p.deadKnown = false; p.tasks = [];
    if (p.leaveTimer) { clearTimeout(p.leaveTimer); p.leaveTimer = null; }
  }
  game.phase = 'lobby';
  game.bodies = [];
  game.meeting = null;
  game.endInfo = null;
  game.sab = null;
  broadcastRoster();
}

function startMeeting(caller, reason, body) {
  const t = now();
  game.phase = 'meeting';
  game.meeting = {
    caller: caller.pid,
    reason,
    body: body ? body.id : null,
    stage: 'discuss',
    endsAt: t + game.settings.discussTime * 1000,
    votes: {},
    result: null
  };
  game.bodies = [];
  game.sab = null;
  for (const p of game.players.values()) if (!p.alive) p.deadKnown = true;
  gatherAtTable();
  broadcastRoster();
}

function resolveVotes() {
  const m = game.meeting;
  const tally = {};
  for (const [voter, target] of Object.entries(m.votes)) {
    tally[target] = (tally[target] || 0) + 1;
    const vp = byPid(Number(voter)), tp = target === 'skip' ? null : byPid(Number(target));
    if (vp && vp.stats) {
      vp.stats.votes++;
      if (tp && tp.role === 'impostor' && vp.role === 'crew') vp.stats.correct++;
    }
  }

  let best = null, bestCount = 0, tie = false;
  for (const [target, count] of Object.entries(tally)) {
    if (count > bestCount) { best = target; bestCount = count; tie = false; }
    else if (count === bestCount) tie = true;
  }

  let ejected = null, wasImpostor = false;
  if (best && best !== 'skip' && !tie) {
    const p = byPid(Number(best));
    if (p && p.alive) {
      p.alive = false;
      p.deadKnown = true;
      ejected = p.pid;
      wasImpostor = p.role === 'impostor';
    }
  }

  const impostorsLeft = allPlayers().filter(p => p.alive && p.role === 'impostor').length;
  m.stage = 'result';
  m.endsAt = now() + 7000;
  m.result = { ejected, wasImpostor, tie, tally, impostorsLeft };
  broadcastRoster();
}

function finishMeeting() {
  if (checkWin()) return;
  const t = now();
  for (const p of game.players.values()) {
    if (p.role === 'impostor') p.killReadyAt = t + game.settings.killCooldown * 1000;
  }
  game.sabReadyAt = Math.max(game.sabReadyAt, t + 15000);
  game.meeting = null;
  game.phase = 'playing';
  broadcastRoster();
}

function updateTimers() {
  const t = now();
  if (game.sab && game.sab.type === 'doors' && t >= game.sab.until) game.sab = null;
  const m = game.meeting;
  if (game.phase !== 'meeting' || !m) return;
  if (m.stage === 'discuss' && t >= m.endsAt) {
    m.stage = 'vote';
    m.endsAt = t + game.settings.voteTime * 1000;
  } else if (m.stage === 'vote') {
    const voters = allPlayers().filter(p => p.alive && p.connected);
    const allVoted = voters.every(p => m.votes[p.pid] !== undefined);
    if (t >= m.endsAt || allVoted) resolveVotes();
  } else if (m.stage === 'result' && t >= m.endsAt) {
    finishMeeting();
  }
}

function meetingPublic() {
  const m = game.meeting;
  if (!m) return null;
  return {
    stage: m.stage,
    rem: Math.max(0, Math.ceil((m.endsAt - now()) / 1000)),
    caller: m.caller,
    reason: m.reason,
    body: m.body,
    voted: Object.keys(m.votes).map(Number),
    result: m.result
  };
}

function sabPublic() {
  if (!game.sab) return null;
  if (game.sab.type === 'doors') return { type: 'doors', room: game.sab.room, rem: Math.max(0, Math.ceil((game.sab.until - now()) / 1000)) };
  return { type: 'lights' };
}

// 게임에서 빠진 사람 처리: 탈락 처리하고 남은 미션은 완료로 계산
function removeFromGame(p, msg) {
  if (game.phase === 'lobby') { game.players.delete(p.token); broadcastRoster(); return; }
  p.alive = false;
  p.deadKnown = true;
  for (const t of p.tasks) t.done = true;
  if (game.meeting && game.meeting.votes[p.pid] !== undefined) delete game.meeting.votes[p.pid];
  if (msg) toastAll(msg);
  broadcastRoster();
  checkWin();
}

// ---------- 소켓 ----------
io.on('connection', socket => {
  socket.on('join', data => {
    // 전자칠판 화면 입장 (배신자·위치 정보 없음)
    if (data && data.screen) {
      game.screens.add(socket.id);
      socket.data.screen = true;
      socket.emit('joined', { screen: true, colors: COLORS });
      socket.emit('roster', rosterFor(null, false));
      return;
    }

    const token = data && typeof data.token === 'string' ? data.token.slice(0, 64) : null;
    if (!token) return;

    // 선생님 입장
    if (data.teacherKey !== undefined && data.teacherKey !== null && data.teacherKey !== '') {
      if (String(data.teacherKey) !== TEACHER_PASSWORD) {
        socket.emit('errorMsg', '선생님 비밀번호가 맞지 않아요.');
        return;
      }
      game.teachers.set(token, socket.id);
      socket.data.token = token;
      socket.data.teacher = true;
      socket.emit('joined', { teacher: true, colors: COLORS, quizText: game.quizText || '' });
      broadcastRoster();
      return;
    }

    if (game.kicked.has(token)) {
      socket.emit('kicked');
      return;
    }
    const name = String(data.name || '').trim().replace(/\s+/g, ' ').slice(0, 10);
    if (!name) { socket.emit('errorMsg', '이름을 입력해 주세요.'); return; }

    let p = game.players.get(token);
    if (p) {
      if (game.phase === 'lobby' && p.name !== name) {
        const err = checkName(name, token);
        if (err) { socket.emit('errorMsg', err); return; }
        p.name = name;
      }
      p.socketId = socket.id;
      p.connected = true;
      p.kicked = false;
      if (p.leaveTimer) { clearTimeout(p.leaveTimer); p.leaveTimer = null; }
    } else {
      if (game.phase !== 'lobby') {
        socket.emit('errorMsg', '지금은 게임이 진행 중이에요. 이번 판이 끝나면 다시 들어와 주세요!');
        return;
      }
      if (game.players.size >= MAX_PLAYERS) {
        socket.emit('errorMsg', `최대 ${MAX_PLAYERS}명까지 들어올 수 있어요.`);
        return;
      }
      const err = checkName(name, token);
      if (err) { socket.emit('errorMsg', err); return; }
      const pid = game.nextPid++;
      p = {
        pid, token, name,
        color: COLORS[(pid - 1) % COLORS.length],
        socketId: socket.id, connected: true, kicked: false,
        role: null, alive: true, deadKnown: false, tasks: [], stats: newStats(),
        x: MAP.spawn.x, y: MAP.spawn.y, f: 1, moving: false,
        emergencyLeft: 1, killReadyAt: 0, lastMove: now(), leaveTimer: null
      };
      game.players.set(token, p);
    }

    socket.data.token = token;
    socket.emit('joined', { pid: p.pid, colors: COLORS });
    if (game.phase !== 'lobby' && p.role) sendGameStart(p, true);
    broadcastRoster();
  });

  socket.on('setColor', color => {
    const p = playerOf(socket);
    if (!p || game.phase !== 'lobby' || !COLORS.includes(color)) return;
    p.color = color;
    broadcastRoster();
  });

  // ----- 선생님 전용 -----
  socket.on('settings', s => {
    if (!isTeacher(socket) || game.phase !== 'lobby' || !s) return;
    const pick = (v, allowed, cur) => (allowed.includes(Number(v)) ? Number(v) : cur);
    const st = game.settings;
    st.impostors = pick(s.impostors, [0, 1, 2, 3, 4, 5, 6], st.impostors);
    st.killCooldown = pick(s.killCooldown, [15, 25, 35, 45], st.killCooldown);
    st.discussTime = pick(s.discussTime, [15, 30, 60, 90], st.discussTime);
    st.voteTime = pick(s.voteTime, [30, 45, 60], st.voteTime);
    st.tasksPerPlayer = pick(s.tasksPerPlayer, [3, 4, 5, 6, 7], st.tasksPerPlayer);
    st.quizPerPlayer = pick(s.quizPerPlayer, [0, 1, 2, 3], st.quizPerPlayer);
    broadcastRoster();
  });

  socket.on('setQuiz', text => {
    if (!isTeacher(socket) || game.phase !== 'lobby') return;
    game.quizText = String(text || '').slice(0, 20000);
    game.quiz = parseQuiz(game.quizText);
    socket.emit('toast', game.quiz.length ? `퀴즈 ${game.quiz.length}문제를 저장했어요.` : '저장된 퀴즈가 없어요. 형식을 확인해 주세요.');
    broadcastRoster();
  });

  socket.on('start', () => {
    if (!isTeacher(socket) || game.phase !== 'lobby') return;
    startGame();
  });

  socket.on('backToLobby', () => {
    if (!isTeacher(socket) || game.phase !== 'ended') return;
    backToLobby();
  });

  socket.on('forceEnd', () => {
    if (!isTeacher(socket) || game.phase === 'lobby') return;
    toastAll('선생님이 게임을 종료했어요.');
    backToLobby();
  });

  socket.on('kick', pid => {
    if (!isTeacher(socket)) return;
    const p = byPid(Number(pid));
    if (!p) return;
    game.kicked.add(p.token);
    game.kickedList.push({ kid: game.nextKid++, token: p.token, name: p.name });
    p.kicked = true;
    p.connected = false;
    const s = socketOf(p);
    if (s) { s.emit('kicked'); s.data.token = null; }
    p.socketId = null;
    removeFromGame(p, null);
  });

  socket.on('unkick', kid => {
    if (!isTeacher(socket)) return;
    const k = game.kickedList.find(x => x.kid === Number(kid));
    if (!k) return;
    game.kicked.delete(k.token);
    game.kickedList = game.kickedList.filter(x => x !== k);
    socket.emit('toast', `${k.name}님이 다시 들어올 수 있어요.`);
    broadcastRoster();
  });

  // ----- 게임 플레이 -----
  socket.on('move', d => {
    const p = playerOf(socket);
    if (!p || game.phase !== 'playing' || !d) return;
    const x = Number(d.x), y = Number(d.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const t = now();
    const dt = Math.max(16, t - p.lastMove);
    p.lastMove = t;
    const maxStep = (MAP.speed * dt / 1000) * 1.6 + 20;
    const doors = doorsNow();
    const blockedByDoor = doors && !MAP.isWalkable(x, y, doors) && MAP.isWalkable(p.x, p.y, doors);
    if (Math.hypot(x - p.x, y - p.y) > maxStep || !MAP.isWalkable(x, y) || blockedByDoor) {
      socket.emit('teleport', { x: p.x, y: p.y });
      return;
    }
    p.x = x; p.y = y;
    p.f = d.f === -1 ? -1 : 1;
    p.moving = !!d.m;
  });

  socket.on('task', stationId => {
    const p = playerOf(socket);
    if (!p || game.phase !== 'playing' || p.role !== 'crew') return;
    const task = p.tasks.find(t => t.s === stationId && !t.done);
    const st = MAP.stations.find(s => s.id === stationId);
    if (!task || !st) return;
    if (dist(p, st) > MAP.useRange + 40) return;
    task.done = true;
    p.stats.tasks++;
    checkWin();
  });

  socket.on('kill', targetPid => {
    const p = playerOf(socket);
    if (!p || game.phase !== 'playing' || !p.alive || p.role !== 'impostor') return;
    const t = now();
    if (t < p.killReadyAt) return;
    const target = byPid(Number(targetPid));
    if (!target || !target.alive || target.role === 'impostor') return;
    if (dist(p, target) > MAP.killRange + 15) return;

    target.alive = false;
    target.moving = false;
    game.bodies.push({ id: target.pid, x: target.x, y: target.y });
    teleport(p, target.x, target.y);
    p.killReadyAt = t + game.settings.killCooldown * 1000;
    p.stats.kills++;
    const ts = socketOf(target);
    if (ts) ts.emit('youDied');
    socket.emit('didKill');
    broadcastRoster();
    checkWin();
  });

  socket.on('vent', () => {
    const p = playerOf(socket);
    if (!p || game.phase !== 'playing' || !p.alive || p.role !== 'impostor') return;
    const here = MAP.vents.find(v => dist(p, v) <= MAP.useRange + 30);
    if (!here) return;
    const group = MAP.vents.filter(v => v.g === here.g);
    const next = group[(group.indexOf(here) + 1) % group.length];
    teleport(p, next.x, next.y);
  });

  socket.on('sabotage', d => {
    const p = playerOf(socket);
    if (!p || game.phase !== 'playing' || !p.alive || p.role !== 'impostor' || !d) return;
    const t = now();
    if (game.sab || t < game.sabReadyAt) return;
    if (d.type === 'lights') {
      game.sab = { type: 'lights' };
      toastAll('⚠️ 우주선의 불이 꺼졌어요! 전기실에서 고쳐 주세요.');
    } else if (d.type === 'doors' && MAP.rooms.some(r => r.id === d.room)) {
      game.sab = { type: 'doors', room: d.room, until: t + DOOR_LOCK_MS };
      toastAll(`🔒 ${MAP.roomName(d.room)}의 문이 잠겼어요!`);
    } else return;
    game.sabReadyAt = t + SABOTAGE_COOLDOWN_MS;
  });

  socket.on('fixLights', () => {
    const p = playerOf(socket);
    if (!p || game.phase !== 'playing' || !p.alive || !game.sab || game.sab.type !== 'lights') return;
    if (dist(p, MAP.lightPanel) > MAP.useRange + 40) return;
    game.sab = null;
    toastAll(`💡 ${p.name}님이 불을 다시 켰어요!`);
  });

  socket.on('report', bodyId => {
    const p = playerOf(socket);
    if (!p || game.phase !== 'playing' || !p.alive) return;
    const body = game.bodies.find(b => b.id === Number(bodyId));
    if (!body || dist(p, body) > MAP.reportRange + 20) return;
    p.stats.reports++;
    startMeeting(p, 'report', body);
  });

  socket.on('emergency', () => {
    const p = playerOf(socket);
    if (!p || game.phase !== 'playing' || !p.alive || p.emergencyLeft <= 0) return;
    if (dist(p, MAP.button) > MAP.useRange + 40) return;
    p.emergencyLeft--;
    startMeeting(p, 'emergency', null);
  });

  socket.on('vote', target => {
    const p = playerOf(socket);
    const m = game.meeting;
    if (!p || !m || game.phase !== 'meeting' || m.stage !== 'vote' || !p.alive) return;
    if (m.votes[p.pid] !== undefined) return;
    if (target === 'skip') { m.votes[p.pid] = 'skip'; return; }
    const tp = byPid(Number(target));
    if (!tp || !tp.alive) return;
    m.votes[p.pid] = String(tp.pid);
  });

  socket.on('disconnect', () => {
    if (socket.data.screen) { game.screens.delete(socket.id); return; }
    if (socket.data.teacher) {
      if (game.teachers.get(socket.data.token) === socket.id) game.teachers.delete(socket.data.token);
      broadcastRoster();
      return;
    }
    const p = playerOf(socket);
    if (!p || p.socketId !== socket.id || p.kicked) return;
    p.connected = false;
    if (game.phase === 'lobby') {
      game.players.delete(p.token);
    } else {
      p.moving = false;
      p.leaveTimer = setTimeout(() => {
        if (!p.connected && game.phase !== 'lobby') removeFromGame(p, `${p.name}님이 게임을 떠났어요.`);
      }, LEAVE_GRACE_MS);
    }
    broadcastRoster();
  });
});

// ---------- 주기적으로 상태 전송 ----------
setInterval(() => {
  updateTimers();
  if (game.phase === 'lobby') return;

  const list = allPlayers().filter(p => !p.kicked);
  const t = now();
  const living = [], ghosts = [];
  for (const p of list) {
    const row = [p.pid, Math.round(p.x), Math.round(p.y), p.f, p.moving ? 1 : 0, p.alive ? 0 : 1];
    (p.alive ? living : ghosts).push(row);
  }
  const bodies = game.bodies.map(b => [b.id, Math.round(b.x), Math.round(b.y)]);
  const base = { ph: game.phase, bd: bodies, tp: taskProgress(), mt: meetingPublic(), end: game.endInfo, sab: sabPublic() };
  const everyone = living.concat(ghosts);

  for (const p of list) {
    const s = socketOf(p);
    if (!s || !p.connected) continue;
    s.emit('s', Object.assign({}, base, {
      pl: p.alive ? living : everyone,
      me: {
        alive: p.alive,
        kc: Math.max(0, Math.ceil((p.killReadyAt - t) / 1000)),
        sc: p.role === 'impostor' ? Math.max(0, Math.ceil((game.sabReadyAt - t) / 1000)) : 0,
        em: p.emergencyLeft,
        tasks: p.tasks
      }
    }));
  }

  // 선생님 관전 화면: 모든 정보
  const ts = teacherSockets();
  if (ts.length) {
    const full = list.map(p => [p.pid, Math.round(p.x), Math.round(p.y), p.f, p.moving ? 1 : 0, p.alive ? 0 : 1,
      p.role === 'impostor' ? 1 : 0, p.tasks.filter(x => x.done).length, p.tasks.length, p.connected ? 1 : 0]);
    const payload = Object.assign({}, base, { pl: full, sc: Math.max(0, Math.ceil((game.sabReadyAt - t) / 1000)) });
    ts.forEach(s => s.emit('T', payload));
  }
  const sc = screenSockets();
  if (sc.length) sc.forEach(s => s.emit('P', base));
}, 1000 / TICK_HZ);

server.listen(PORT, () => console.log(`스페이스 크루 서버 실행 중: http://localhost:${PORT}`));
