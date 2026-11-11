// 서버(Node)와 브라우저가 함께 쓰는 맵 데이터
(function (root) {
  const rooms = [
    { id: 'cafe',   name: '식당',      x: 1000, y: 150,  w: 600, h: 450, floor: '#3d4766' },
    { id: 'weapon', name: '무기고',    x: 1900, y: 150,  w: 400, h: 350, floor: '#45405e' },
    { id: 'nav',    name: '항해실',    x: 2200, y: 700,  w: 350, h: 400, floor: '#36506a' },
    { id: 'o2',     name: '산소실',    x: 2750, y: 700,  w: 350, h: 380, floor: '#2f5a4e' },
    { id: 'shield', name: '방어실',    x: 1900, y: 1250, w: 400, h: 350, floor: '#3b5a5a' },
    { id: 'store',  name: '창고',      x: 1050, y: 1150, w: 500, h: 450, floor: '#4d4a40' },
    { id: 'admin',  name: '관리실',    x: 1650, y: 800,  w: 350, h: 300, floor: '#4a4560' },
    { id: 'elec',   name: '전기실',    x: 600,  y: 1150, w: 350, h: 350, floor: '#4f4a35' },
    { id: 'lower',  name: '하부 엔진', x: 100,  y: 1100, w: 350, h: 400, floor: '#533d42' },
    { id: 'upper',  name: '상부 엔진', x: 100,  y: 300,  w: 350, h: 400, floor: '#533d42' },
    { id: 'med',    name: '의무실',    x: 550,  y: 550,  w: 350, h: 300, floor: '#35585a' },
    { id: 'comms',  name: '통신실',    x: 1050, y: 1800, w: 450, h: 350, floor: '#3e4a6e' },
    { id: 'lab',    name: '실험실',    x: 1850, y: 1800, w: 450, h: 350, floor: '#4a3a5c' },
    { id: 'sec',    name: '보안실',    x: 500,  y: 1750, w: 380, h: 330, floor: '#3a4a3e' }
  ];

  // 복도는 방 안쪽으로 60px씩 겹치게 만들어 자연스럽게 이어지도록 함
  const corridors = [
    { x: 1540, y: 300,  w: 420, h: 120 }, // 식당 - 무기고
    { x: 2200, y: 440,  w: 100, h: 320 }, // 무기고 - 항해실
    { x: 2200, y: 1040, w: 100, h: 270 }, // 항해실 - 방어실
    { x: 2490, y: 840,  w: 320, h: 120 }, // 항해실 - 산소실
    { x: 1490, y: 1360, w: 470, h: 120 }, // 방어실 - 창고
    { x: 1240, y: 540,  w: 120, h: 670 }, // 식당 - 창고
    { x: 1300, y: 900,  w: 410, h: 120 }, // 복도 - 관리실
    { x: 890,  y: 1300, w: 220, h: 120 }, // 창고 - 전기실
    { x: 390,  y: 1300, w: 270, h: 120 }, // 전기실 - 하부 엔진
    { x: 220,  y: 640,  w: 120, h: 520 }, // 하부 엔진 - 상부 엔진
    { x: 390,  y: 380,  w: 670, h: 120 }, // 상부 엔진 - 식당
    { x: 660,  y: 440,  w: 120, h: 170 }, // 복도 - 의무실
    { x: 1220, y: 1540, w: 120, h: 320 }, // 창고 - 통신실
    { x: 2040, y: 1540, w: 120, h: 320 }, // 방어실 - 실험실
    { x: 1440, y: 1920, w: 470, h: 120 }, // 통신실 - 실험실
    { x: 660,  y: 1440, w: 120, h: 370 }, // 전기실 - 보안실
    { x: 820,  y: 1880, w: 290, h: 120 }  // 보안실 - 통신실
  ];

  const taskTypes = {
    wires:     { name: '전선 연결',       icon: '🔌' },
    numbers:   { name: '숫자 순서 누르기', icon: '🔢' },
    download:  { name: '데이터 업로드',    icon: '📡' },
    fuel:      { name: '연료 채우기',     icon: '⛽' },
    calibrate: { name: '계기판 맞추기',    icon: '🎯' },
    swipe:     { name: '카드 긁기',       icon: '💳' },
    trash:     { name: '쓰레기 버리기',    icon: '🗑️' },
    asteroids: { name: '운석 부수기',     icon: '☄️' },
    quiz:      { name: '지식 퀴즈',       icon: '📘' }
  };

  const stations = [
    { id: 'w1', type: 'wires',     room: 'elec',   x: 700,  y: 1200 },
    { id: 'w2', type: 'wires',     room: 'store',  x: 1500, y: 1560 },
    { id: 'w3', type: 'wires',     room: 'admin',  x: 1950, y: 850 },
    { id: 'w4', type: 'wires',     room: 'cafe',   x: 1060, y: 200 },
    { id: 'w5', type: 'wires',     room: 'o2',     x: 3050, y: 750 },
    { id: 'n1', type: 'numbers',   room: 'med',    x: 850,  y: 600 },
    { id: 'n2', type: 'numbers',   room: 'lower',  x: 150,  y: 1460 },
    { id: 'n3', type: 'numbers',   room: 'weapon', x: 2250, y: 200 },
    { id: 'n4', type: 'numbers',   room: 'sec',    x: 550,  y: 1800 },
    { id: 'd1', type: 'download',  room: 'nav',    x: 2500, y: 900 },
    { id: 'd2', type: 'download',  room: 'cafe',   x: 1550, y: 560 },
    { id: 'd3', type: 'download',  room: 'admin',  x: 1700, y: 1060 },
    { id: 'd4', type: 'download',  room: 'comms',  x: 1300, y: 2100 },
    { id: 'f1', type: 'fuel',      room: 'store',  x: 1100, y: 1200 },
    { id: 'f2', type: 'fuel',      room: 'upper',  x: 150,  y: 350 },
    { id: 'f3', type: 'fuel',      room: 'lower',  x: 400,  y: 1150 },
    { id: 'k1', type: 'calibrate', room: 'shield', x: 2250, y: 1550 },
    { id: 'k2', type: 'calibrate', room: 'weapon', x: 1950, y: 460 },
    { id: 'k3', type: 'calibrate', room: 'nav',    x: 2500, y: 1060 },
    { id: 'k4', type: 'calibrate', room: 'elec',   x: 900,  y: 1450 },
    { id: 'k5', type: 'calibrate', room: 'med',    x: 600,  y: 800 },
    { id: 'k6', type: 'calibrate', room: 'upper',  x: 400,  y: 650 },
    { id: 'k7', type: 'calibrate', room: 'lab',    x: 2100, y: 2100 },
    { id: 's1', type: 'swipe',     room: 'admin',  x: 1800, y: 840 },
    { id: 's2', type: 'swipe',     room: 'comms',  x: 1100, y: 2100 },
    { id: 's3', type: 'swipe',     room: 'sec',    x: 840,  y: 1790 },
    { id: 't1', type: 'trash',     room: 'cafe',   x: 1550, y: 200 },
    { id: 't2', type: 'trash',     room: 'store',  x: 1450, y: 1250 },
    { id: 't3', type: 'trash',     room: 'o2',     x: 3050, y: 1030 },
    { id: 'a1', type: 'asteroids', room: 'weapon', x: 2100, y: 200 },
    { id: 'a2', type: 'asteroids', room: 'lab',    x: 2250, y: 1850 },
    { id: 'a3', type: 'asteroids', room: 'nav',    x: 2500, y: 750 },
    { id: 'q1', type: 'quiz',      room: 'lab',    x: 1900, y: 2100 },
    { id: 'q2', type: 'quiz',      room: 'comms',  x: 1450, y: 1850 },
    { id: 'q3', type: 'quiz',      room: 'o2',     x: 2800, y: 750 },
    { id: 'q4', type: 'quiz',      room: 'sec',    x: 550,  y: 2030 },
    { id: 'q5', type: 'quiz',      room: 'med',    x: 600,  y: 600 }
  ];

  // 배신자 전용 환풍구 (같은 그룹끼리 이동)
  const vents = [
    { id: 'v1', g: 1, x: 380,  y: 350 },  { id: 'v2', g: 1, x: 380,  y: 1460 }, { id: 'v3', g: 1, x: 850, y: 800 },
    { id: 'v4', g: 2, x: 1080, y: 560 },  { id: 'v5', g: 2, x: 1960, y: 1060 }, { id: 'v6', g: 2, x: 1080, y: 1560 },
    { id: 'v7', g: 3, x: 2100, y: 460 },  { id: 'v8', g: 3, x: 2400, y: 1060 }, { id: 'v9', g: 3, x: 1940, y: 1560 },
    { id: 'v10', g: 4, x: 1460, y: 2110 }, { id: 'v11', g: 4, x: 2260, y: 2110 }, { id: 'v12', g: 4, x: 840, y: 2040 },
    { id: 'v13', g: 4, x: 2800, y: 1040 }
  ];

  const MAP = {
    width: 3200,
    height: 2250,
    rooms,
    corridors,
    walkable: rooms.concat(corridors),
    stations,
    taskTypes,
    vents,
    button: { x: 1300, y: 375 },
    lightPanel: { x: 820, y: 1200 },
    spawn: { x: 1300, y: 375, r: 140 },
    playerRadius: 18,
    speed: 230,
    useRange: 80,
    killRange: 90,
    reportRange: 110,
    visionCrew: 300,
    visionImpostor: 400,
    visionDark: 110
  };

  MAP.roomName = function (id) {
    const r = rooms.find(r => r.id === id);
    return r ? r.name : '';
  };

  // 방마다 잠글 수 있는 문 위치 (복도가 방 경계를 지나는 곳)
  const doorCache = {};
  MAP.doorsFor = function (roomId) {
    if (doorCache[roomId]) return doorCache[roomId];
    const R = rooms.find(r => r.id === roomId);
    const out = [];
    if (R) {
      for (const C of corridors) {
        const ix = Math.max(C.x, R.x), iy = Math.max(C.y, R.y);
        const ax = Math.min(C.x + C.w, R.x + R.w), ay = Math.min(C.y + C.h, R.y + R.h);
        if (ax <= ix || ay <= iy) continue;
        if (C.w >= C.h) {
          if (C.x < R.x) out.push({ x: R.x - 8, y: C.y, w: 16, h: C.h });
          if (C.x + C.w > R.x + R.w) out.push({ x: R.x + R.w - 8, y: C.y, w: 16, h: C.h });
        } else {
          if (C.y < R.y) out.push({ x: C.x, y: R.y - 8, w: C.w, h: 16 });
          if (C.y + C.h > R.y + R.h) out.push({ x: C.x, y: R.y + R.h - 8, w: C.w, h: 16 });
        }
      }
    }
    doorCache[roomId] = out;
    return out;
  };

  function inDoor(x, y, doors, r) {
    if (!doors) return false;
    for (const d of doors) {
      if (x >= d.x - r && x <= d.x + d.w + r && y >= d.y - r && y <= d.y + d.h + r) return true;
    }
    return false;
  }

  // 플레이어가 설 수 있는 곳인지 (몸 반지름 고려)
  MAP.isWalkable = function (x, y, doors) {
    const r = MAP.playerRadius;
    if (inDoor(x, y, doors, r)) return false;
    for (const w of MAP.walkable) {
      if (x >= w.x + r && x <= w.x + w.w - r && y >= w.y + r && y <= w.y + w.h - r) return true;
    }
    return false;
  };

  // 빛이 통과하는 곳인지 (시야 계산용)
  MAP.isOpen = function (x, y, doors) {
    if (inDoor(x, y, doors, 0)) return false;
    for (const w of MAP.walkable) {
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
    }
    return false;
  };

  // 두 지점 사이가 벽에 막혀 있지 않은지
  MAP.lineOfSight = function (x1, y1, x2, y2, doors) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.ceil(d / 12);
    for (let i = 1; i < n; i++) {
      if (!MAP.isOpen(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n, doors)) return false;
    }
    return true;
  };

  MAP.spawnPoint = function (i, n) {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    return {
      x: Math.round(MAP.spawn.x + Math.cos(a) * MAP.spawn.r),
      y: Math.round(MAP.spawn.y + Math.sin(a) * (MAP.spawn.r * 0.85))
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MAP;
  else root.GAME_MAP = MAP;
})(typeof window !== 'undefined' ? window : globalThis);
