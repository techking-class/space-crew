// 효과음 (파일 없이 브라우저에서 직접 만들어 재생)
window.SFX = (() => {
  let ctx = null, on = true;
  try { on = localStorage.getItem('sc_sound') !== 'off'; } catch (e) {}
  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, when, slideTo) {
    const c = ac(); if (!c || !on) return;
    const t = c.currentTime + (when || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, when, freq) {
    const c = ac(); if (!c || !on) return;
    const t = c.currentTime + (when || 0);
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = c.createGain(); g.gain.value = vol || 0.2;
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  }
  const fx = {
    click() { tone(660, 0.06, 'square', 0.04); },
    task() { tone(880, 0.12, 'triangle', 0.12); tone(1320, 0.2, 'triangle', 0.12, 0.1); },
    kill() { noise(0.35, 0.35, 0, 900); tone(180, 0.45, 'sawtooth', 0.14, 0, 55); },
    siren() { for (let i = 0; i < 3; i++) { tone(600, 0.35, 'sawtooth', 0.09, i * 0.7, 1100); tone(1100, 0.35, 'sawtooth', 0.09, i * 0.7 + 0.35, 600); } },
    report() { tone(300, 0.15, 'square', 0.12); tone(300, 0.15, 'square', 0.12, 0.22); tone(200, 0.6, 'sawtooth', 0.12, 0.45, 120); },
    vote() { tone(520, 0.08, 'square', 0.07); tone(780, 0.1, 'square', 0.06, 0.08); },
    eject() { noise(1.8, 0.16, 0, 500); tone(420, 1.6, 'sine', 0.07, 0, 70); },
    lightsOut() { tone(440, 0.7, 'sawtooth', 0.11, 0, 90); noise(0.25, 0.15, 0, 3000); },
    lightsOn() { tone(330, 0.1, 'triangle', 0.1); tone(660, 0.25, 'triangle', 0.1, 0.1); },
    door() { noise(0.3, 0.4, 0, 400); tone(90, 0.3, 'square', 0.13); },
    vent() { noise(0.45, 0.22, 0, 1800); tone(240, 0.3, 'sine', 0.06, 0.05, 120); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.13, i * 0.15)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.45, 'triangle', 0.12, i * 0.2)); },
    reveal() { tone(110, 1.4, 'sawtooth', 0.08); tone(165, 1.4, 'sine', 0.08); tone(220, 0.8, 'sine', 0.05, 0.6); },
    wrong() { tone(160, 0.25, 'square', 0.09); }
  };
  const api = {
    toggle() { on = !on; try { localStorage.setItem('sc_sound', on ? 'on' : 'off'); } catch (e) {} if (on) ac(); return on; },
    isOn() { return on; },
    unlock() { if (on) ac(); }
  };
  Object.keys(fx).forEach(k => { api[k] = () => { try { fx[k](); } catch (e) {} }; });
  ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => api.unlock(), { once: true }));
  return api;
})();
