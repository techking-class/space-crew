// 전자칠판 화면: 배신자와 위치는 보여주지 않고, 모두가 알아도 되는 정보만 표시
(() => {
  'use strict';
  const socket = io({ transports: ['websocket', 'polling'] });
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { roster: {}, list: [], phase: 'lobby', tp: 0, mt: null, sab: null, end: null, fxPhase: 'lobby', endShown: false, gridSig: '' };
  const nameOf = pid => (S.roster[pid] ? S.roster[pid].name : '???');
  const colorOf = pid => (S.roster[pid] ? S.roster[pid].color : '#888');

  socket.on('connect', () => { $('netStatus').classList.add('hidden'); socket.emit('join', { screen: true }); });
  socket.on('disconnect', () => $('netStatus').classList.remove('hidden'));

  // 접속 주소 + QR 코드
  const url = location.origin;
  $('joinUrl').textContent = url.replace(/^https?:\/\//, '');
  try { new QRCode($('qr'), { text: url, width: 300, height: 300, correctLevel: QRCode.CorrectLevel.M }); }
  catch (e) { $('qr').style.display = 'none'; }

  $('gateBtn').onclick = () => { SFX.unlock(); $('soundGate').classList.add('hidden'); };
  $('scSound').textContent = SFX.isOn() ? '🔊 소리' : '🔇 소리';
  $('scSound').onclick = () => { $('scSound').textContent = SFX.toggle() ? '🔊 소리' : '🔇 소리'; };
  $('scFull').onclick = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen(); };

  socket.on('roster', r => {
    S.roster = {};
    r.players.forEach(p => { S.roster[p.pid] = p; });
    S.list = r.players;
    S.phase = r.phase;
    if (r.phase === 'lobby') { S.end = null; S.endShown = false; S.mt = null; S.sab = null; S.fxPhase = 'lobby'; }
    S.gridSig = '';
    render();
  });

  socket.on('P', d => {
    effects(d);
    S.phase = d.ph; S.tp = d.tp; S.mt = d.mt; S.sab = d.sab; S.end = d.end;
    render();
  });

  function effects(d) {
    const prevPh = S.fxPhase, prevSab = S.sab, prevStage = S.mt ? S.mt.stage : null;
    S.fxPhase = d.ph;
    if (prevPh !== 'playing' && prevPh !== 'meeting' && d.ph === 'playing') SFX.reveal();
    if (prevPh === 'playing' && d.ph === 'meeting' && d.mt) {
      if (d.mt.reason === 'report') { splash('고장 난 대원 발견!'); SFX.report(); } else { splash('🚨 긴급회의!'); SFX.siren(); }
    }
    if (d.mt && d.mt.stage === 'result' && prevStage !== 'result') eject(d.mt.result);
    if (d.ph === 'playing') {
      if (!prevSab && d.sab) { if (d.sab.type === 'lights') SFX.lightsOut(); else SFX.door(); }
      if (prevSab && prevSab.type === 'lights' && !d.sab) SFX.lightsOn();
    }
    if (prevPh !== 'ended' && d.ph === 'ended') SFX.win();
  }

  function splash(text) {
    const el = $('splashText');
    el.textContent = text;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    $('splash').classList.remove('hidden');
    setTimeout(() => $('splash').classList.add('hidden'), 1800);
  }
  let typeTimer = null, ejectTimer = null;
  function eject(res) {
    if (!res) return;
    const scene = $('ejectScene'), bot = $('ejectBot');
    scene.classList.remove('go', 'hidden');
    bot.style.display = res.ejected !== null ? '' : 'none';
    if (res.ejected !== null) bot.style.setProperty('--c', colorOf(res.ejected));
    void scene.offsetWidth; scene.classList.add('go');
    const msg = res.ejected !== null ? `${nameOf(res.ejected)}님은 배신자${res.wasImpostor ? '였어요.' : '가 아니었어요.'}` : `아무도 추방되지 않았어요. (${res.tie ? '동점' : '건너뛰기'})`;
    const full = msg + '\n남은 배신자 ' + res.impostorsLeft + '명';
    let i = 0;
    clearInterval(typeTimer); clearTimeout(ejectTimer);
    typeTimer = setInterval(() => {
      i++;
      $('ejectText').innerHTML = esc(full.slice(0, i)).replace('\n', '<br><small>') + (i > msg.length ? '</small>' : '');
      if (i >= full.length) clearInterval(typeTimer);
    }, 60);
    SFX.eject();
    ejectTimer = setTimeout(() => scene.classList.add('hidden'), 4600);
  }

  function chips(list, opts) {
    return list.map(p => {
      const tags = [];
      if (opts && opts.caller === p.pid) tags.push('<span class="tag">소집</span>');
      if (opts && opts.tally && opts.tally[p.pid]) tags.push(`<span class="tag c">${opts.tally[p.pid]}표</span>`);
      else if (opts && opts.voted && opts.voted.includes(p.pid)) tags.push('<span class="tag v">투표함</span>');
      const cls = [p.dead ? 'dead' : '', opts && opts.voted && opts.voted.includes(p.pid) ? 'voted' : ''].join(' ');
      return `<div class="sc-chip ${cls}"><span class="mini-bot" style="--c:${p.color}"></span><span class="nm">${esc(p.name)}</span>${tags.join('')}</div>`;
    }).join('');
  }

  function view(id) { ['vLobby', 'vPlay', 'vMeet', 'vEnd'].forEach(v => $(v).classList.toggle('hidden', v !== id)); }

  function render() {
    const alive = S.list.filter(p => !p.dead).length;
    if (S.phase === 'lobby') {
      view('vLobby');
      $('scStatus').textContent = '탑승 대기 중';
      $('lCount').textContent = S.list.length;
      const sig = 'L' + JSON.stringify(S.list.map(p => [p.pid, p.name, p.color]));
      if (sig !== S.gridSig) { S.gridSig = sig; $('lGrid').innerHTML = chips(S.list); }
      return;
    }
    if (S.phase === 'playing') {
      view('vPlay');
      $('scStatus').textContent = `게임 진행 중 · 탑승 ${S.list.length}명`;
      const pct = Math.round(S.tp * 100);
      $('pPct').textContent = pct + '%';
      $('pBar').style.width = pct + '%';
      const al = $('pAlert');
      if (S.sab) {
        al.classList.remove('hidden');
        al.textContent = S.sab.type === 'lights' ? '⚠️ 우주선의 불이 꺼졌어요! 전기실에서 고쳐 주세요' : `🔒 ${window.GAME_MAP.roomName(S.sab.room) || '어느 방'}의 문이 잠겼어요 (${S.sab.rem}초)`;
      } else al.classList.add('hidden');
      const sig = 'P' + JSON.stringify(S.list.map(p => [p.pid, p.dead]));
      if (sig !== S.gridSig) { S.gridSig = sig; $('pGrid').innerHTML = chips(S.list); }
      return;
    }
    if (S.phase === 'meeting' && S.mt) {
      view('vMeet');
      const m = S.mt;
      $('scStatus').textContent = `회의 중 · 투표 ${m.voted.length}/${alive}명`;
      $('mT').textContent = m.reason === 'report' ? '고장 난 대원 발견!' : '긴급회의!';
      $('mS').textContent = m.reason === 'report' ? `${nameOf(m.caller)}님이 ${nameOf(m.body)}님을 발견했어요` : `${nameOf(m.caller)}님이 긴급회의를 열었어요`;
      $('mTm').textContent = m.stage === 'discuss' ? `토론 시간 ${m.rem}초` : m.stage === 'vote' ? `투표 시간 ${m.rem}초` : '투표 결과';
      const res = m.result;
      if (res) {
        $('mRes').classList.remove('hidden');
        $('mRes').innerHTML = res.ejected !== null
          ? `${esc(nameOf(res.ejected))}님이 추방되었어요 — 배신자${res.wasImpostor ? '였어요!' : '가 아니었어요…'} · 남은 배신자 ${res.impostorsLeft}명`
          : `아무도 추방되지 않았어요 (${res.tie ? '동점' : '건너뛰기'}${res.tally.skip ? ` ${res.tally.skip}표` : ''}) · 남은 배신자 ${res.impostorsLeft}명`;
      } else $('mRes').classList.add('hidden');
      const sig = 'M' + JSON.stringify([m.stage, m.voted, S.list.map(p => [p.pid, p.dead]), res ? 1 : 0]);
      if (sig !== S.gridSig) { S.gridSig = sig; $('mGrid2').innerHTML = chips(S.list, { caller: m.caller, voted: res ? null : m.voted, tally: res ? res.tally : null }); }
      return;
    }
    if (S.phase === 'ended' && S.end) {
      view('vEnd');
      $('scStatus').textContent = '게임 끝';
      if (S.endShown) return;
      S.endShown = true;
      const e = S.end;
      $('eTitle').textContent = e.winner === 'crew' ? '대원 승리!' : '배신자 승리!';
      $('eTitle').className = 'end-title ' + e.winner;
      $('eReason').textContent = e.reason;
      $('eImps').innerHTML = '<span>배신자는</span>' + e.impostors.map(pid => `<span><span class="mini-bot" style="--c:${colorOf(pid)};margin-top:6px"></span>${esc(nameOf(pid))}</span>`).join('');
      const stats = e.stats || [];
      const top = (list, key) => { const max = Math.max(0, ...list.map(s => s[key])); return max > 0 ? { names: list.filter(s => s[key] === max).map(s => nameOf(s.pid)), max } : null; };
      const crew = stats.filter(s => s.role === 'crew'), imps = stats.filter(s => s.role === 'impostor');
      const awards = [['🛠️ 미션왕', top(crew, 'tasks'), '개 완료'], ['🔍 명탐정', top(crew, 'correct'), '번 정답 투표'], ['🚨 신고왕', top(stats, 'reports'), '번 신고'], ['🗡️ 최고의 배신자', top(imps, 'kills'), '명 제거']].filter(a => a[1]);
      $('eAwards').innerHTML = awards.map(([t, w, u]) => `<div class="award"><div class="aw-t">${t}</div><div class="aw-n">${w.names.map(esc).join(', ')} · ${w.max}${u}</div></div>`).join('');
      const sorted = stats.slice().sort((a, b) => (b.role === 'impostor') - (a.role === 'impostor') || b.tasks - a.tasks);
      $('eStats').innerHTML = '<tr><th>이름</th><th>역할</th><th>미션</th><th>제거</th><th>신고</th><th>정답 투표</th></tr>' +
        sorted.map(s => `<tr class="${s.role === 'impostor' ? 'imp' : ''}"><td>${esc(nameOf(s.pid))}${s.alive ? '' : ' 💀'}</td><td>${s.role === 'impostor' ? '배신자' : '대원'}</td><td>${s.role === 'crew' ? s.tasks : '-'}</td><td>${s.role === 'impostor' ? s.kills : '-'}</td><td>${s.reports}</td><td>${s.role === 'crew' ? `${s.correct}/${s.votes}` : '-'}</td></tr>`).join('');
    }
  }
})();
