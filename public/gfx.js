// 그래픽: 맵·로봇·장식·입자 효과
window.GFX = (() => {
  const MAP = window.GAME_MAP;

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const cl = v => Math.max(0, Math.min(255, v));
    return `rgb(${cl((n >> 16) + amt)},${cl(((n >> 8) & 255) + amt)},${cl((n & 255) + amt)})`;
  }

  const DECOR = [
    ['table', 1130, 300], ['table', 1470, 300], ['table', 1130, 460], ['table', 1470, 460],
    ['bed', 680, 650], ['bed', 770, 650], ['scanner', 725, 775],
    ['engine', 190, 500], ['engine', 190, 1300],
    ['crate', 1100, 1400], ['crate', 1100, 1455], ['crate', 1155, 1455], ['crate', 1495, 1350], ['crate', 1495, 1405],
    ['cabinet', 630, 1350], ['cabinet', 920, 1300],
    ['chair', 2330, 830], ['chair', 2330, 970], ['desk', 2390, 900],
    ['turret', 2100, 330], ['emitter', 2100, 1420],
    ['plant', 2925, 800], ['plant', 2925, 985], ['tank', 3050, 890],
    ['mapTable', 1825, 960], ['dish', 1120, 1880], ['rack', 1360, 1980], ['labTable', 1960, 1950],
    ['monitors', 690, 2045], ['chair', 690, 1985]
  ];

  function drawDecor(m, type, x, y) {
    m.save();
    m.translate(x, y);
    m.shadowColor = 'rgba(0,0,0,.45)'; m.shadowBlur = 10; m.shadowOffsetY = 5;
    switch (type) {
      case 'table':
        m.fillStyle = '#6b7596'; m.beginPath(); m.arc(0, 0, 32, 0, 7); m.fill();
        m.shadowBlur = 0; m.shadowOffsetY = 0;
        m.fillStyle = '#56607f'; m.beginPath(); m.arc(0, 0, 26, 0, 7); m.fill();
        m.fillStyle = '#3a4260';
        for (let a = 0; a < 4; a++) { m.beginPath(); m.arc(Math.cos(a * 1.57 + .78) * 46, Math.sin(a * 1.57 + .78) * 46, 9, 0, 7); m.fill(); }
        break;
      case 'bed':
        m.fillStyle = '#c9d4e8'; rr(m, -28, -45, 56, 90, 8); m.fill();
        m.shadowBlur = 0; m.shadowOffsetY = 0;
        m.fillStyle = '#7fb5d6'; rr(m, -28, -10, 56, 55, 6); m.fill();
        m.fillStyle = '#fff'; rr(m, -20, -40, 40, 20, 6); m.fill();
        break;
      case 'scanner':
        m.fillStyle = '#2a4b5c'; m.beginPath(); m.arc(0, 0, 36, 0, 7); m.fill();
        m.shadowBlur = 16; m.shadowColor = '#5fe3ff'; m.shadowOffsetY = 0;
        m.strokeStyle = '#5fe3ff'; m.lineWidth = 3; m.beginPath(); m.arc(0, 0, 27, 0, 7); m.stroke();
        m.beginPath(); m.arc(0, 0, 14, 0, 7); m.stroke();
        break;
      case 'engine': {
        const g = m.createLinearGradient(-60, 0, 60, 0);
        g.addColorStop(0, '#3b3f52'); g.addColorStop(.5, '#7c8299'); g.addColorStop(1, '#3b3f52');
        m.fillStyle = g; rr(m, -60, -80, 120, 160, 26); m.fill();
        m.shadowBlur = 0; m.shadowOffsetY = 0;
        m.strokeStyle = '#2a2d3b'; m.lineWidth = 4;
        for (let i = -50; i <= 50; i += 25) { m.beginPath(); m.moveTo(-60, i); m.lineTo(60, i); m.stroke(); }
        m.shadowBlur = 24; m.shadowColor = '#ff8a3d';
        m.fillStyle = '#ff8a3d'; m.beginPath(); m.ellipse(-62, 0, 10, 40, 0, 0, 7); m.fill();
        break;
      }
      case 'crate':
        m.fillStyle = '#8a6a3e'; m.fillRect(-24, -24, 48, 48);
        m.shadowBlur = 0; m.shadowOffsetY = 0;
        m.strokeStyle = '#5e4526'; m.lineWidth = 4; m.strokeRect(-22, -22, 44, 44);
        m.beginPath(); m.moveTo(-22, -22); m.lineTo(22, 22); m.moveTo(22, -22); m.lineTo(-22, 22); m.stroke();
        break;
      case 'cabinet':
        m.fillStyle = '#2d3245'; rr(m, -22, -40, 44, 80, 6); m.fill();
        m.shadowBlur = 0; m.shadowOffsetY = 0;
        ['#3ee07a', '#ffcf3d', '#ff4b5c', '#3ee07a'].forEach((c, i) => { m.fillStyle = c; m.fillRect(-12, -28 + i * 16, 8, 8); m.fillStyle = '#6b7596'; m.fillRect(2, -28 + i * 16, 12, 8); });
        break;
      case 'chair':
        m.fillStyle = '#3a4260'; m.beginPath(); m.arc(0, 0, 16, 0, 7); m.fill();
        m.fillStyle = '#4b5578'; rr(m, -16, -26, 32, 12, 5); m.fill();
        break;
      case 'desk':
        m.fillStyle = '#2c3350'; rr(m, -30, -70, 60, 140, 10); m.fill();
        m.shadowBlur = 12; m.shadowColor = '#5fe3ff'; m.shadowOffsetY = 0;
        m.fillStyle = '#1d6f8a'; rr(m, -20, -55, 40, 45, 5); m.fill(); rr(m, -20, 10, 40, 45, 5); m.fill();
        break;
      case 'turret':
        m.fillStyle = '#3d3a55'; m.beginPath(); m.arc(0, 0, 40, 0, 7); m.fill();
        m.shadowBlur = 0; m.shadowOffsetY = 0;
        m.fillStyle = '#5b5780'; m.beginPath(); m.arc(0, 0, 24, 0, 7); m.fill();
        m.fillStyle = '#2a2840'; m.fillRect(-6, -70, 12, 46);
        break;
      case 'emitter':
        m.shadowBlur = 22; m.shadowColor = '#5fe3ff'; m.shadowOffsetY = 0;
        m.strokeStyle = '#5fe3ff'; m.lineWidth = 4;
        m.beginPath();
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; m[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 44, Math.sin(a) * 44); }
        m.closePath(); m.stroke();
        m.fillStyle = 'rgba(95,227,255,.25)'; m.fill();
        break;
      case 'plant':
        m.fillStyle = '#5a4632'; m.beginPath(); m.arc(0, 8, 18, 0, 7); m.fill();
        m.shadowBlur = 0; m.shadowOffsetY = 0;
        ['#2fbf4a', '#3ee07a', '#259a3c'].forEach((c, i) => { m.fillStyle = c; m.beginPath(); m.arc(Math.cos(i * 2.1) * 12, -6 + Math.sin(i * 2.1) * 10, 16, 0, 7); m.fill(); });
        break;
      case 'tank':
        m.fillStyle = '#6fa7c9'; rr(m, -24, -50, 48, 100, 22); m.fill();
        m.shadowBlur = 0; m.shadowOffsetY = 0;
        m.fillStyle = 'rgba(255,255,255,.35)'; rr(m, -16, -40, 8, 70, 4); m.fill();
        m.fillStyle = '#ff6b78'; m.beginPath(); m.arc(10, -30, 6, 0, 7); m.fill();
        break;
      case 'mapTable':
        m.fillStyle = '#2c3350'; rr(m, -75, -40, 150, 80, 12); m.fill();
        m.shadowBlur = 14; m.shadowColor = '#3ee07a'; m.shadowOffsetY = 0;
        m.fillStyle = '#1f6b46'; rr(m, -65, -30, 130, 60, 8); m.fill();
        m.strokeStyle = '#3ee07a'; m.lineWidth = 2;
        for (let i = 0; i < 5; i++) m.strokeRect(-55 + i * 22, -18 + (i % 2) * 10, 16, 14);
        break;
      case 'dish':
        m.fillStyle = '#9aa4c7'; m.beginPath(); m.ellipse(0, 0, 40, 26, -.5, 0, 7); m.fill();
        m.shadowBlur = 0; m.shadowOffsetY = 0;
        m.fillStyle = '#6b7596'; m.beginPath(); m.ellipse(0, 0, 28, 17, -.5, 0, 7); m.fill();
        m.fillStyle = '#ffcf3d'; m.beginPath(); m.arc(0, 0, 5, 0, 7); m.fill();
        break;
      case 'rack':
        m.fillStyle = '#1f2436'; rr(m, -60, -24, 120, 48, 6); m.fill();
        m.shadowBlur = 0; m.shadowOffsetY = 0;
        for (let i = 0; i < 6; i++) { m.fillStyle = i % 2 ? '#3ee07a' : '#5fe3ff'; m.fillRect(-52 + i * 19, -14, 10, 4); m.fillRect(-52 + i * 19, 4, 10, 4); }
        break;
      case 'labTable':
        m.fillStyle = '#d7dbe8'; rr(m, -70, -30, 140, 60, 10); m.fill();
        m.shadowBlur = 8; m.shadowOffsetY = 0;
        ['#c64dff', '#3ee07a', '#5fe3ff', '#ffcf3d'].forEach((c, i) => { m.shadowColor = c; m.fillStyle = c; rr(m, -55 + i * 30, -18, 14, 36, 6); m.fill(); });
        break;
      case 'monitors':
        m.fillStyle = '#20263d'; rr(m, -90, -22, 180, 44, 6); m.fill();
        m.shadowBlur = 12; m.shadowColor = '#5fe3ff'; m.shadowOffsetY = 0;
        for (let i = 0; i < 4; i++) { m.fillStyle = '#2a6f8a'; m.fillRect(-82 + i * 42, -15, 36, 26); }
        break;
    }
    m.restore();
  }

  // 맵 전체를 한 장의 그림으로 미리 그려 둠 (scale: 저사양이면 작게)
  function buildMap(scale) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(MAP.width * scale); c.height = Math.ceil(MAP.height * scale);
    const m = c.getContext('2d');
    m.scale(scale, scale);
    const all = MAP.walkable;

    // 우주선 외벽
    m.fillStyle = '#161b30';
    all.forEach(r => { rr(m, r.x - 38, r.y - 38, r.w + 76, r.h + 76, 30); m.fill(); });
    m.fillStyle = '#20263f';
    all.forEach(r => { rr(m, r.x - 26, r.y - 26, r.w + 52, r.h + 52, 22); m.fill(); });
    // 벽 (입체감: 밝은 윗면 + 어두운 안쪽)
    m.fillStyle = '#6a76a0';
    all.forEach(r => { rr(m, r.x - 15, r.y - 17, r.w + 30, r.h + 30, 14); m.fill(); });
    m.fillStyle = '#3a4366';
    all.forEach(r => { rr(m, r.x - 9, r.y - 9, r.w + 18, r.h + 20, 10); m.fill(); });

    // 바닥
    MAP.corridors.forEach(r => {
      m.fillStyle = '#353d5c'; m.fillRect(r.x, r.y, r.w, r.h);
      m.strokeStyle = 'rgba(255,255,255,.05)'; m.lineWidth = 2;
      const horiz = r.w > r.h;
      for (let k = 0; k < (horiz ? r.w : r.h); k += 40) {
        m.beginPath();
        if (horiz) { m.moveTo(r.x + k, r.y); m.lineTo(r.x + k, r.y + r.h); } else { m.moveTo(r.x, r.y + k); m.lineTo(r.x + r.w, r.y + k); }
        m.stroke();
      }
      // 가운데 안내선
      m.strokeStyle = 'rgba(95,227,255,.18)'; m.lineWidth = 3; m.setLineDash([18, 14]);
      m.beginPath();
      if (horiz) { m.moveTo(r.x, r.y + r.h / 2); m.lineTo(r.x + r.w, r.y + r.h / 2); } else { m.moveTo(r.x + r.w / 2, r.y); m.lineTo(r.x + r.w / 2, r.y + r.h); }
      m.stroke(); m.setLineDash([]);
    });
    MAP.rooms.forEach(r => {
      m.fillStyle = r.floor; m.fillRect(r.x, r.y, r.w, r.h);
      for (let x = r.x, i = 0; x < r.x + r.w; x += 50, i++) {
        for (let y = r.y, j = 0; y < r.y + r.h; y += 50, j++) {
          if ((i + j) % 2) { m.fillStyle = 'rgba(255,255,255,.035)'; m.fillRect(x, y, 50, 50); }
        }
      }
      m.strokeStyle = 'rgba(0,0,0,.18)'; m.lineWidth = 2;
      for (let x = r.x; x <= r.x + r.w; x += 50) { m.beginPath(); m.moveTo(x, r.y); m.lineTo(x, r.y + r.h); m.stroke(); }
      for (let y = r.y; y <= r.y + r.h; y += 50) { m.beginPath(); m.moveTo(r.x, y); m.lineTo(r.x + r.w, y); m.stroke(); }
      // 벽 그림자
      const g = m.createLinearGradient(0, r.y, 0, r.y + 40);
      g.addColorStop(0, 'rgba(0,0,0,.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = g; m.fillRect(r.x, r.y, r.w, 40);
      // 가장자리 빛
      const v = m.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * .2, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * .75);
      v.addColorStop(0, 'rgba(255,255,255,.06)'); v.addColorStop(1, 'rgba(0,0,0,.18)');
      m.fillStyle = v; m.fillRect(r.x, r.y, r.w, r.h);
    });

    // 문 자리 (노랑·검정 경고 줄무늬)
    const seen = new Set();
    MAP.rooms.forEach(r => MAP.doorsFor(r.id).forEach(d => {
      const k = d.x + ',' + d.y; if (seen.has(k)) return; seen.add(k);
      m.save(); m.beginPath(); m.rect(d.x, d.y, d.w, d.h); m.clip();
      m.fillStyle = '#1b1b1b'; m.fillRect(d.x, d.y, d.w, d.h);
      m.strokeStyle = '#d9a91e'; m.lineWidth = 6;
      for (let t = -200; t < 200; t += 16) { m.beginPath(); m.moveTo(d.x + t, d.y); m.lineTo(d.x + t + 120, d.y + 120); m.stroke(); }
      m.restore();
      m.globalAlpha = .6; m.fillStyle = '#000'; m.fillRect(d.x, d.y, d.w, d.h); m.globalAlpha = 1;
    }));

    DECOR.forEach(([t, x, y]) => drawDecor(m, t, x, y));

    // 방 이름
    m.font = '36px Jua, sans-serif';
    m.textAlign = 'center';
    m.fillStyle = 'rgba(255,255,255,.16)';
    MAP.rooms.forEach(r => m.fillText(r.name, r.x + r.w / 2, r.y + r.h / 2 + 12));

    // 긴급 버튼 테이블
    const b = MAP.button;
    m.save();
    m.shadowColor = 'rgba(0,0,0,.5)'; m.shadowBlur = 16; m.shadowOffsetY = 6;
    m.fillStyle = '#717ca0'; m.beginPath(); m.arc(b.x, b.y, 64, 0, 7); m.fill();
    m.shadowBlur = 0; m.shadowOffsetY = 0;
    m.fillStyle = '#4d5779'; m.beginPath(); m.arc(b.x, b.y, 55, 0, 7); m.fill();
    m.fillStyle = '#c3cbe0'; m.beginPath(); m.arc(b.x, b.y, 26, 0, 7); m.fill();
    m.fillStyle = '#7a0f1a'; m.beginPath(); m.arc(b.x, b.y + 4, 19, 0, 7); m.fill();
    const bg = m.createRadialGradient(b.x - 6, b.y - 6, 2, b.x, b.y, 19);
    bg.addColorStop(0, '#ff8a95'); bg.addColorStop(1, '#e0202f');
    m.fillStyle = bg; m.beginPath(); m.arc(b.x, b.y, 18, 0, 7); m.fill();
    m.restore();

    // 전기 패널
    const L = MAP.lightPanel;
    m.save();
    m.shadowColor = 'rgba(0,0,0,.5)'; m.shadowBlur = 10; m.shadowOffsetY = 4;
    m.fillStyle = '#262c44'; rr(m, L.x - 28, L.y - 24, 56, 48, 7); m.fill();
    m.restore();
    m.font = '26px sans-serif'; m.textAlign = 'center'; m.fillText('⚡', L.x, L.y + 9);

    // 환풍구
    MAP.vents.forEach(v => {
      m.fillStyle = '#12162a'; rr(m, v.x - 27, v.y - 18, 54, 36, 7); m.fill();
      m.strokeStyle = '#6a76a0'; m.lineWidth = 3; rr(m, v.x - 27, v.y - 18, 54, 36, 7); m.stroke();
      m.strokeStyle = '#4a5374'; m.lineWidth = 3;
      for (let i = -16; i <= 16; i += 8) { m.beginPath(); m.moveTo(v.x + i, v.y - 12); m.lineTo(v.x + i, v.y + 12); m.stroke(); }
    });

    // 미션 기계
    MAP.stations.forEach(st => {
      m.save();
      m.shadowColor = 'rgba(0,0,0,.55)'; m.shadowBlur = 12; m.shadowOffsetY = 5;
      m.fillStyle = '#1a2036'; rr(m, st.x - 24, st.y - 24, 48, 48, 9); m.fill();
      m.restore();
      const sg = m.createLinearGradient(st.x, st.y - 18, st.x, st.y + 18);
      if (st.type === 'quiz') { sg.addColorStop(0, '#6a5ab8'); sg.addColorStop(1, '#3a2f70'); }
      else { sg.addColorStop(0, '#3a7aa0'); sg.addColorStop(1, '#1f405c'); }
      m.fillStyle = sg; rr(m, st.x - 18, st.y - 18, 36, 36, 6); m.fill();
      m.fillStyle = 'rgba(255,255,255,.18)'; rr(m, st.x - 16, st.y - 16, 32, 8, 4); m.fill();
      m.font = '22px sans-serif'; m.textAlign = 'center';
      m.fillText(MAP.taskTypes[st.type].icon, st.x, st.y + 8);
    });
    return c;
  }

  // 미니맵 바탕
  function buildMini(w, names) {
    const s = w / MAP.width, h = Math.ceil(MAP.height * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const m = c.getContext('2d');
    m.fillStyle = 'rgba(10,14,30,.85)'; m.fillRect(0, 0, w, h);
    m.save(); m.scale(s, s);
    m.fillStyle = '#56628c';
    MAP.walkable.forEach(r => m.fillRect(r.x - 12, r.y - 12, r.w + 24, r.h + 24));
    m.fillStyle = '#2c3354';
    MAP.corridors.forEach(r => m.fillRect(r.x, r.y, r.w, r.h));
    MAP.rooms.forEach(r => { m.fillStyle = shade(r.floor, 25); m.fillRect(r.x, r.y, r.w, r.h); });
    if (names) {
      m.font = '64px Jua, sans-serif'; m.textAlign = 'center'; m.fillStyle = 'rgba(255,255,255,.85)';
      MAP.rooms.forEach(r => m.fillText(r.name, r.x + r.w / 2, r.y + r.h / 2 + 22));
    }
    m.fillStyle = '#ff3a4c'; m.beginPath(); m.arc(MAP.button.x, MAP.button.y, 30, 0, 7); m.fill();
    m.restore();
    return c;
  }

  // 로봇 캐릭터 (hq: 고급 그래픽)
  function drawBot(ctx, x, y, color, f, moving, t, ghost, ring, scale, hq) {
    ctx.save();
    const bob = moving ? Math.sin(t / 70) * 2.5 : (ghost ? Math.sin(t / 400) * 4 : 0);
    ctx.translate(x, y + bob);
    if (scale) ctx.scale(scale, scale);
    if (ghost) ctx.globalAlpha = .45;
    if (!ghost) {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(0, 20 - bob, 16, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      const step = moving ? Math.sin(t / 70) * 3 : 0;
      ctx.fillStyle = shade(color, -70);
      rr(ctx, -13, 11 + step, 10, 9, 3); ctx.fill();
      rr(ctx, 3, 11 - step, 10, 9, 3); ctx.fill();
    }
    // 안테나
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(f * 4, -29); ctx.stroke();
    const blink = .6 + .4 * Math.sin(t / 300 + x * .01);
    if (hq) { ctx.shadowColor = '#ffcf3d'; ctx.shadowBlur = 10 * blink; }
    ctx.fillStyle = '#ffcf3d';
    ctx.beginPath(); ctx.arc(f * 4, -31, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // 몸통
    if (hq) {
      const g = ctx.createRadialGradient(-6, -8, 2, 0, 0, 20);
      g.addColorStop(0, shade(color, 70)); g.addColorStop(.55, color); g.addColorStop(1, shade(color, -55));
      ctx.fillStyle = g;
    } else ctx.fillStyle = color;
    ctx.strokeStyle = ring || shade(color, -90); ctx.lineWidth = ring ? 4 : 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 얼굴 화면
    if (hq) {
      const vg = ctx.createLinearGradient(0, -9, 0, 4);
      vg.addColorStop(0, '#29355c'); vg.addColorStop(1, '#0d1222');
      ctx.fillStyle = vg;
    } else ctx.fillStyle = '#1a2033';
    rr(ctx, -11 + f * 2, -9, 22, 13, 4); ctx.fill();
    if (hq) { ctx.shadowColor = '#7ef9ff'; ctx.shadowBlur = 6; }
    ctx.fillStyle = '#7ef9ff';
    rr(ctx, -6 + f * 2, -5, 4, 5, 1.5); ctx.fill();
    rr(ctx, 3 + f * 2, -5, 4, 5, 1.5); ctx.fill();
    ctx.shadowBlur = 0;
    if (hq) {
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      rr(ctx, -9 + f * 2, -8, 8, 3, 1.5); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.beginPath(); ctx.arc(-f * 9, 9, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBrokenBot(ctx, x, y, color, t, hq) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, 8, 25, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.strokeStyle = shade(color, -80); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 21, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a2033';
    rr(ctx, -10, -7, 20, 10, 3); ctx.fill();
    ctx.strokeStyle = '#ff4b5c'; ctx.lineWidth = 2;
    [[-5, -2], [5, -2]].forEach(([ex, ey]) => {
      ctx.beginPath(); ctx.moveTo(ex - 3, ey - 3); ctx.lineTo(ex + 3, ey + 3); ctx.moveTo(ex + 3, ey - 3); ctx.lineTo(ex - 3, ey + 3); ctx.stroke();
    });
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(26, 6); ctx.lineTo(38, 12); ctx.stroke();
    ctx.fillStyle = '#ffcf3d'; ctx.beginPath(); ctx.arc(40, 13, 4.5, 0, Math.PI * 2); ctx.fill();
    if (hq && Math.sin(t / 90 + x) > .85) {
      ctx.strokeStyle = '#ffe66b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(-20, -22); ctx.lineTo(-15, -20); ctx.lineTo(-22, -30); ctx.stroke();
    }
    ctx.restore();
  }

  function drawName(ctx, x, y, name, color, size, hq) {
    ctx.font = `bold ${size || 14}px "Gowun Dodum", sans-serif`;
    ctx.textAlign = 'center';
    if (hq) {
      const w = ctx.measureText(name).width + 12, h = (size || 14) + 8;
      ctx.fillStyle = 'rgba(8,10,24,.55)';
      rr(ctx, x - w / 2, y - h + 5, w, h, h / 2); ctx.fill();
      ctx.fillStyle = color; ctx.fillText(name, x, y);
    } else {
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText(name, x, y);
      ctx.fillStyle = color; ctx.fillText(name, x, y);
    }
  }

  // 입자 효과
  const parts = [];
  function burst(x, y, color, n, speed, life, size) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (.4 + Math.random() * .6);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: size * (.6 + Math.random() * .6) });
    }
    if (parts.length > 400) parts.splice(0, parts.length - 400);
  }
  function drawParts(ctx, dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .92; p.vy *= .92;
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return { rr, shade, buildMap, buildMini, drawBot, drawBrokenBot, drawName, burst, drawParts };
})();
