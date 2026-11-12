/* "The Shape of a Team" — interactive sports motion graphic (canvas, vanilla JS) */
(() => {
  const canvas = document.getElementById('shapeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const stage = canvas.parentElement;
  const elSport = document.getElementById('shapeSport');
  const elBlurb = document.getElementById('shapeBlurb');
  const elStats = document.getElementById('shapeStats');
  const elLive = document.getElementById('shapeLive');
  const elHow = document.getElementById('shapeHow');
  const elCtl = document.getElementById('shapeControls');
  const elToast = document.getElementById('shapeToast');
  const tabs = [...document.querySelectorAll('.shape__tabs button')];

  const C = {
    red: '#e23a3f', line: 'rgba(255,255,255,.22)', lineSoft: 'rgba(255,255,255,.09)',
    turf: '#04245f', turf2: '#03204f', gold: '#f4c95d', blue: '#7fb2ff',
  };
  const DISPLAY = '"Archivo", Arial, sans-serif';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ---------- canvas sizing ---------- */
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1);
    W = stage.clientWidth; H = stage.clientHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  /* map field units → px, preserving aspect */
  function fit(L, Wd, padX = 28, padTop = 60, padBot = 72) {
    const aw = W - padX * 2, ah = H - padTop - padBot;
    const s = Math.min(aw / L, ah / Wd);
    return { s, ox: (W - L * s) / 2, oy: padTop + (ah - Wd * s) / 2, L, Wd };
  }
  const P = (f, x, y) => [f.ox + x * f.s, f.oy + y * f.s];

  /* ---------- UI helpers ---------- */
  let toastTimer;
  function toast(msg) {
    elToast.textContent = msg; elToast.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => elToast.classList.remove('is-on'), 1800);
  }
  function setStats(list) {
    elStats.innerHTML = list.map(s => `<div class="stat"><b ${s.n != null ? `data-n="${s.n}" data-suf="${s.suf || ''}"` : ''}>${s.n != null ? 0 : s.t}</b><span>${s.label}</span></div>`).join('');
    elStats.querySelectorAll('b[data-n]').forEach(b => {
      const n = +b.dataset.n, suf = b.dataset.suf, t0 = performance.now();
      const step = now => {
        const t = ease((now - t0) / 900);
        b.innerHTML = Math.round(n * t).toLocaleString() + (suf ? `<small>${suf}</small>` : '');
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  function btn(text, onClick, cls = '') {
    const b = document.createElement('button'); b.className = `btn ${cls}`; b.textContent = text;
    b.addEventListener('click', onClick); elCtl.appendChild(b); return b;
  }
  function range(text, min, max, val, onInput) {
    const w = document.createElement('label'); w.className = 'range';
    w.innerHTML = `<span>${text}</span><input type="range" min="${min}" max="${max}" value="${val}" step="0.5"><output>${val}</output>`;
    const inp = w.querySelector('input'), out = w.querySelector('output');
    inp.addEventListener('input', () => { out.textContent = inp.value; onInput(+inp.value); });
    elCtl.appendChild(w); return { inp, out };
  }
  let liveLast = 0;
  const live = (html) => { const n = performance.now(); if (n - liveLast > 140) { elLive.innerHTML = html; liveLast = n; } };

  /* ---------- drawing primitives ---------- */
  function dot(x, y, r, fill, stroke, lw = 2) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function label(txt, x, y, size = 10, color = '#fff', weight = 800, align = 'center') {
    ctx.font = `${weight} ${size}px ${DISPLAY}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
  }
  function fieldBase(f) {
    const [x, y] = P(f, 0, 0), w = f.L * f.s, h = f.Wd * f.s;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, C.turf); g.addColorStop(1, C.turf2);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 12; i += 2) { ctx.fillStyle = 'rgba(255,255,255,.022)'; ctx.fillRect(x + i * w / 12, y, w / 12, h); }
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
  }
  const lineF = (f, x1, y1, x2, y2, col = C.line, lw = 1.2) => {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(...P(f, x1, y1)); ctx.lineTo(...P(f, x2, y2)); ctx.stroke();
  };
  const arcF = (f, cx, cy, r, a0, a1, col = C.line) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(...P(f, cx, cy), r * f.s, a0, a1); ctx.stroke();
  };

  /* =====================================================================
     FOOTBALL — run a play; tap a receiver to throw
     ===================================================================== */
  const FB = (() => {
    const LOS = 45, MID = 26.67;
    const ELIG = ['WR', 'SL', 'TE', 'WR2', 'RB'];
    const NAMES = { WR: 'left wideout', SL: 'slot receiver', TE: 'tight end', WR2: 'right wideout', RB: 'running back' };
    let S;
    const mk = (id, x, y, path, speed, team = 'o', tag = id) => ({ id, tag, x, y, x0: x, y0: y, path, pi: 0, speed, team, trail: [] });
    function reset() {
      const o = [
        mk('LT', LOS - .5, MID - 3.2, [[LOS - 2, MID - 3.4]], 1.6, 'o', ''),
        mk('LG', LOS - .5, MID - 1.6, [[LOS - 1.6, MID - 1.6]], 1.6, 'o', ''),
        mk('C', LOS - .5, MID, [[LOS - 1.4, MID]], 1.6, 'o', ''),
        mk('RG', LOS - .5, MID + 1.6, [[LOS - 1.6, MID + 1.6]], 1.6, 'o', ''),
        mk('RT', LOS - .5, MID + 3.2, [[LOS - 2, MID + 3.4]], 1.6, 'o', ''),
        mk('TE', LOS - .5, MID + 5, [[LOS + 7, MID + 5], [LOS + 8, MID + 15]], 6.4),
        mk('QB', LOS - 5, MID, [[LOS - 8, MID]], 3),
        mk('RB', LOS - 5, MID + 2.4, [[LOS - 3, MID + 9], [LOS + 6, MID + 18]], 7),
        mk('WR', LOS - .5, 6, [[LOS + 32, 6.5]], 8.2),
        mk('SL', LOS - 1.2, 12.5, [[LOS + 9, 12.5], [LOS + 26, 21]], 7.6),
        mk('WR2', LOS - .5, 47.3, [[LOS + 12, 47.3], [LOS + 14, 34]], 8),
      ];
      const by = Object.fromEntries(o.map(p => [p.id, p]));
      const d = [
        { ...mk('DE', LOS + 1, MID - 4.2, [], 2.4, 'd'), role: 'rush' },
        { ...mk('DT', LOS + 1, MID - 1, [], 2.2, 'd'), role: 'rush' },
        { ...mk('DT2', LOS + 1, MID + 1.2, [], 2.2, 'd'), role: 'rush' },
        { ...mk('DE2', LOS + 1, MID + 4.4, [], 2.4, 'd'), role: 'rush' },
        { ...mk('LB', LOS + 5, 17, [], 6.2, 'd'), role: 'man', tgt: by.SL, cush: 1.5 },
        { ...mk('MLB', LOS + 5, MID, [], 5.6, 'd'), role: 'man', tgt: by.TE, cush: 1.2 },
        { ...mk('LB2', LOS + 5, 36, [], 6.2, 'd'), role: 'man', tgt: by.RB, cush: 1.5 },
        { ...mk('CB', LOS + 6, 6, [], 7.7, 'd'), role: 'man', tgt: by.WR, cush: 2.5 },
        { ...mk('CB2', LOS + 6, 47.3, [], 7.3, 'd'), role: 'man', tgt: by.WR2, cush: 2 },
        { ...mk('FS', LOS + 15, 18, [], 6.5, 'd'), role: 'deep' },
        { ...mk('SS', LOS + 14, 36, [], 6.5, 'd'), role: 'deep' },
      ];
      S = { o, d, by, phase: 'pre', t: 0, ball: { x: by.C.x + .6, y: MID, h: 0 }, pass: null, carrier: null, result: null, auto: 1.4 };
    }
    function stepPath(p, dt) {
      if (p.pi >= p.path.length) return;
      const [tx, ty] = p.path[p.pi], dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), m = p.speed * dt;
      if (d <= m) { p.x = tx; p.y = ty; p.pi++; } else { p.x += dx / d * m; p.y += dy / d * m; }
    }
    function toward(p, tx, ty, sp, dt) {
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy); if (d < .01) return;
      const m = Math.min(d, sp * dt); p.x += dx / d * m; p.y += dy / d * m;
    }
    const sep = r => Math.min(...S.d.map(d => dist(d, r)));
    const receivers = () => ELIG.map(id => S.by[id]);
    function throwTo(id) {
      if (S.phase !== 'live' || S.pass || S.carrier) return;
      const r = S.by[id], qb = S.by.QB;
      S.pass = { r, from: { x: qb.x, y: qb.y }, t: 0, T: .35 + dist(qb, r) / 24 };
      toast(`Throw to the ${NAMES[id]}`);
    }
    function snap() { if (S.phase === 'pre') { S.phase = 'live'; S.t = 0; } }
    function update(dt) {
      S.t += dt;
      if (S.phase === 'pre') { S.auto -= dt; if (S.auto <= 0) snap(); return; }
      if (S.phase === 'done') { S.auto -= dt; if (S.auto <= 0) { reset(); S.auto = 1; } return; }
      const qb = S.by.QB;
      if (!S.pass && !S.carrier) { // snap exchange
        const k = clamp(S.t / .25, 0, 1);
        S.ball.x = lerp(S.by.C.x + .6, qb.x + .4, k); S.ball.y = lerp(MID, qb.y, k); S.ball.h = Math.sin(k * Math.PI) * .6;
      }
      S.o.forEach(p => {
        if (p === S.carrier) toward(p, p.x + 5, p.y, 7, dt); else stepPath(p, dt);
        if (ELIG.includes(p.id) && (!p.trail.length || dist(p.trail[p.trail.length - 1], p) > .8)) p.trail.push({ x: p.x, y: p.y });
      });
      S.d.forEach(d => {
        let tx, ty, sp = d.speed;
        if (S.carrier) { tx = S.carrier.x; ty = S.carrier.y; sp *= 1.05; }
        else if (d.role === 'rush') { tx = qb.x; ty = qb.y; }
        else if (d.role === 'man') { tx = d.tgt.x + (S.pass && S.pass.r === d.tgt ? 0 : d.cush); ty = d.tgt.y; }
        else {
          const side = receivers().filter(p => d.id === 'FS' ? p.y < MID + 4 : p.y > MID - 4);
          const deep = side.sort((a, b) => b.x - a.x)[0];
          tx = Math.max(LOS + 15, deep.x + 3); ty = lerp(d.y0, deep.y, .65);
        }
        toward(d, tx, ty, sp, dt);
        if (d.role === 'rush' && !S.carrier) d.x = Math.max(d.x, LOS - 1 - S.t * .4); // the line holds… for a while
      });
      if (S.pass) {
        const p = S.pass; p.t += dt; const k = clamp(p.t / p.T, 0, 1);
        S.ball.x = lerp(p.from.x, p.r.x, k); S.ball.y = lerp(p.from.y, p.r.y, k); S.ball.h = Math.sin(k * Math.PI) * (2 + p.T * 3);
        if (k >= 1) {
          if (sep(p.r) < 1.25) { S.result = { ok: false }; S.phase = 'done'; S.auto = 2.6; toast('Pass broken up!'); }
          else { S.carrier = p.r; p.r.path = []; S.yac = 0; }
          S.pass = null;
        }
      }
      if (S.carrier) {
        S.ball.x = S.carrier.x + .4; S.ball.y = S.carrier.y; S.ball.h = .2; S.yac += dt;
        if (S.yac > 1.4 || sep(S.carrier) < .9) {
          const yds = Math.round(S.carrier.x - LOS);
          S.result = { ok: true, yds }; S.phase = 'done'; S.auto = 2.6; S.carrier = null;
          toast(`Complete! ${yds >= 0 ? '+' : ''}${yds} yards`);
        }
      }
      if (S.phase === 'live' && !S.pass && !S.carrier && S.t > 3.1) throwTo(receivers().sort((a, b) => sep(b) - sep(a))[0].id);
    }
    function draw(f) {
      const ez = (x0, txt) => {
        const [x, y] = P(f, x0, 0); ctx.fillStyle = 'rgba(153,0,0,.35)'; ctx.fillRect(x, y, 10 * f.s, f.Wd * f.s);
        ctx.save(); ctx.translate(x + 5 * f.s, y + f.Wd * f.s / 2); ctx.rotate(x0 ? Math.PI / 2 : -Math.PI / 2);
        label(txt, 0, 0, Math.max(10, 4.2 * f.s), 'rgba(255,255,255,.35)', 900); ctx.restore();
      };
      ez(0, 'PENN'); ez(110, 'QUAKERS');
      for (let yd = 10; yd <= 110; yd += 5) lineF(f, yd, 0, yd, f.Wd, yd % 10 ? C.lineSoft : C.line, yd === 60 ? 2 : 1.1);
      for (let yd = 11; yd < 110; yd++) { lineF(f, yd, .6, yd, 1.4, C.lineSoft); lineF(f, yd, f.Wd - 1.4, yd, f.Wd - .6, C.lineSoft); lineF(f, yd, 23.6, yd, 24.2, C.lineSoft); lineF(f, yd, 29.1, yd, 29.7, C.lineSoft); }
      for (let yd = 20; yd <= 100; yd += 10) {
        const n = String(yd <= 60 ? yd - 10 : 110 - yd), sz = Math.max(9, 2.6 * f.s);
        label(n, ...P(f, yd, 9), sz, 'rgba(255,255,255,.3)'); label(n, ...P(f, yd, f.Wd - 9), sz, 'rgba(255,255,255,.3)');
      }
      lineF(f, LOS, 0, LOS, f.Wd, 'rgba(127,178,255,.85)', 2);
      lineF(f, LOS + 10, 0, LOS + 10, f.Wd, 'rgba(244,201,93,.85)', 2);

      const r = Math.max(6, 1.3 * f.s);
      receivers().forEach(p => {
        if (p.trail.length < 2) return;
        ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(226,58,63,.75)'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(...P(f, p.x0, p.y0)); p.trail.forEach(q => ctx.lineTo(...P(f, q.x, q.y))); ctx.lineTo(...P(f, p.x, p.y)); ctx.stroke(); ctx.setLineDash([]);
      });
      if (S.phase === 'live' && !S.pass && !S.carrier) receivers().forEach(p => {
        const open = clamp((sep(p) - 1) / 4, 0, 1), [x, y] = P(f, p.x, p.y);
        dot(x, y, r + 4 + open * 10, `rgba(244,201,93,${.08 + open * .22})`, `rgba(244,201,93,${.3 + open * .6})`, 1.5);
      });
      S.d.forEach(d => {
        const [x, y] = P(f, d.x, d.y), k = r * .4;
        dot(x, y, r * .9, 'rgba(0,19,58,.9)', 'rgba(255,255,255,.75)', 1.8);
        ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke();
      });
      S.o.forEach(p => {
        const [x, y] = P(f, p.x, p.y); p.px = x; p.py = y;
        dot(x + 1.5, y + 2, r, 'rgba(0,0,0,.35)');
        dot(x, y, r, p.tag ? C.red : '#a3262b', 'rgba(255,255,255,.9)', 1.5);
        if (p.tag && r > 7) label(p.tag.replace('2', ''), x, y + .5, Math.max(7, r * .72), '#fff', 900);
      });
      const [bx, by] = P(f, S.ball.x, S.ball.y), lift = S.ball.h * f.s * .9, bs = 1 + S.ball.h * .05;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(bx, by + 2, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(bx, by - lift); ctx.rotate(-.5); ctx.fillStyle = '#c47a3a';
      ctx.beginPath(); ctx.ellipse(0, 0, 5.5 * bs, 3.4 * bs, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(2, 0); ctx.stroke(); ctx.restore();

      if (S.phase === 'pre') live(`<div class="row"><span>Status</span><b>Pre-snap</b></div><div class="meter"><i style="width:0%"></i></div><div class="row"><span>Line of scrimmage</span><span>Own 35</span></div>`);
      else if (S.phase === 'live') {
        const best = receivers().sort((a, b) => sep(b) - sep(a))[0];
        live(`<div class="row"><span>Most open</span><b>${best.id.replace('2', '')} · ${sep(best).toFixed(1)} yd</b></div><div class="meter"><i style="width:${clamp(S.t / 3.1, 0, 1) * 100}%"></i></div><div class="row"><span>Pocket clock</span><span>${Math.max(0, 3.1 - S.t).toFixed(1)}s</span></div>`);
      } else if (S.result) {
        const ok = S.result.ok, y = S.result.yds;
        live(`<div class="row"><span>Result</span><b>${ok ? `+${y} yds` : 'Incomplete'}</b></div><div class="meter"><i style="width:${ok ? clamp(y / 30, 0, 1) * 100 : 0}%"></i></div><div class="row"><span>${ok && y >= 10 ? 'First down!' : 'Next play'}</span><span>Resetting…</span></div>`);
      }
    }
    function click(mx, my) {
      if (S.phase === 'pre') { snap(); return; }
      const hit = receivers().find(p => Math.hypot(p.px - mx, p.py - my) < 24);
      if (hit) throwTo(hit.id);
    }
    return {
      dims: [120, 53.33],
      init() {
        reset();
        btn('Snap the ball', () => { if (S.phase !== 'pre') reset(); snap(); }, 'btn--primary');
        btn('Reset', () => { reset(); S.auto = 99; });
      },
      update, draw, click,
    };
  })();

  /* =====================================================================
     PASSING NETWORK — field hockey & soccer
     ===================================================================== */
  function makeNetwork(cfg) {
    let S;
    const FORMS = cfg.formations;
    const key = (a, b) => a < b ? `${a}-${b}` : `${b}-${a}`;
    const degree = i => { let n = 0; S.edges.forEach((_, k) => { const [a, b] = k.split('-'); if (+a === i || +b === i) n++; }); return n; };
    function init() {
      const form = FORMS[cfg.defaultForm];
      S = {
        players: form.map((p, i) => ({ i, nx: p[0], ny: p[1], bx: p[0], by: p[1], fx: p[0], fy: p[1], ph: Math.random() * 6, num: cfg.numbers[i], pos: cfg.positions[i] })),
        edges: new Map(), passes: 0, holder: 0, pass: null, hold: .8, queued: null, morphT: 1, pulse: 0,
      };
      const keys = Object.keys(FORMS);
      if (keys.length > 1) keys.forEach(k => {
        const b = btn(k, () => { setForm(k); elCtl.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('is-on', x.dataset.f === k)); });
        b.dataset.f = k; if (k === cfg.defaultForm) b.classList.add('is-on');
      });
      btn('Clear network', () => { S.edges.clear(); S.passes = 0; toast('Network cleared'); });
    }
    function setForm(k) {
      S.morphT = 0;
      S.players.forEach((p, i) => { p.fx = p.bx; p.fy = p.by; p.nx = FORMS[k][i][0]; p.ny = FORMS[k][i][1]; });
      toast(`Formation ${k}`);
    }
    const pos = (p, t) => ({ x: (p.bx + Math.sin(t * .7 + p.ph) * .012) * cfg.L, y: (p.by + Math.cos(t * .55 + p.ph * 1.3) * .02) * cfg.W });
    function pickNext() {
      if (S.queued != null && S.queued !== S.holder) { const q = S.queued; S.queued = null; return q; }
      const h = S.players[S.holder];
      const ws = S.players.map(p => {
        if (p.i === S.holder) return 0;
        let w = 1 / (Math.hypot((p.bx - h.bx) * cfg.L, (p.by - h.by) * cfg.W) + 6);
        if (p.bx > h.bx) w *= 1.5;                   // play forward
        if (p.i === 0) w *= .25;                     // rarely back to the keeper
        if (!S.edges.has(key(p.i, h.i))) w *= 1.7;   // seek new connections
        return w;
      });
      let r = Math.random() * ws.reduce((a, b) => a + b, 0);
      for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return i; }
      return 1;
    }
    function update(dt, t) {
      if (S.morphT < 1) {
        S.morphT = Math.min(1, S.morphT + dt / 1.1); const k = ease(S.morphT);
        S.players.forEach(p => { p.bx = lerp(p.fx, p.nx, k); p.by = lerp(p.fy, p.ny, k); });
      }
      if (S.pass) {
        S.pass.t += dt;
        if (S.pass.t >= S.pass.T) {
          const k = key(S.pass.a, S.pass.b); S.edges.set(k, (S.edges.get(k) || 0) + 1); S.passes++;
          S.holder = S.pass.b; S.pass = null; S.hold = rand(.35, .8); S.pulse = 1;
        }
      } else if ((S.hold -= dt) <= 0) {
        const b = pickNext(), a = S.holder, pa = pos(S.players[a], t), pb = pos(S.players[b], t);
        S.pass = { a, b, t: 0, T: .25 + Math.hypot(pa.x - pb.x, pa.y - pb.y) / cfg.ballSpeed };
      }
      S.pulse = Math.max(0, S.pulse - dt * 1.8);
    }
    function draw(f, t) {
      cfg.markings(f);
      const pts = S.players.map(p => pos(p, t));
      ctx.lineCap = 'round';
      S.edges.forEach((c, k) => {
        const [a, b] = k.split('-').map(Number);
        ctx.strokeStyle = `rgba(226,58,63,${Math.min(.85, .22 + c * .1)})`; ctx.lineWidth = Math.min(9, 1 + c * 1.1);
        ctx.beginPath(); ctx.moveTo(...P(f, pts[a].x, pts[a].y)); ctx.lineTo(...P(f, pts[b].x, pts[b].y)); ctx.stroke();
      });
      let ball;
      if (S.pass) {
        const k = ease(S.pass.t / S.pass.T), A = pts[S.pass.a], B = pts[S.pass.b];
        ball = { x: lerp(A.x, B.x, k), y: lerp(A.y, B.y, k) };
        const pa = P(f, A.x, A.y), pb = P(f, ball.x, ball.y);
        const g = ctx.createLinearGradient(...pa, ...pb); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.9)');
        ctx.strokeStyle = g; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(...pa); ctx.lineTo(...pb); ctx.stroke();
      } else { const h = pts[S.holder]; ball = { x: h.x + 1.2, y: h.y + .6 }; }
      const r = Math.max(8, cfg.r * f.s);
      let hub = null;
      S.players.forEach((p, i) => {
        const [x, y] = P(f, pts[i].x, pts[i].y); p.px = x; p.py = y;
        const deg = degree(i); if (!hub || deg > hub.deg) hub = { p, deg };
        if (i === S.holder && S.pulse > 0) dot(x, y, r + (1 - S.pulse) * 22, null, `rgba(255,255,255,${S.pulse * .6})`, 2);
        if (S.queued === i) dot(x, y, r + 7, null, C.gold, 2.5);
        dot(x + 1.5, y + 2, r, 'rgba(0,0,0,.35)');
        dot(x, y, r, i === 0 ? C.gold : C.red, '#fff', 1.6);
        label(String(p.num), x, y + .5, r * .9, i === 0 ? '#011F5B' : '#fff', 900);
        if (deg) { ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * deg / 10); ctx.stroke(); }
        if (W > 640) label(p.pos, x, y + r + 12, 9, 'rgba(255,255,255,.6)', 700);
      });
      dot(...P(f, ball.x, ball.y), cfg.ballR, '#fff', 'rgba(0,0,0,.4)', 1);
      const n = S.edges.size;
      live(`<div class="row"><span>Passes</span><b>${S.passes}</b></div><div class="row" style="margin-top:6px"><span>Connections made</span><b>${n} / 55</b></div><div class="meter"><i style="width:${n / 55 * 100}%"></i></div><div class="row"><span>Hub</span><span>#${hub.p.num} ${hub.p.pos} · ${hub.deg} links</span></div>`);
    }
    function click(mx, my) {
      const hit = S.players.find(p => Math.hypot(p.px - mx, p.py - my) < 24);
      if (hit && hit.i !== S.holder) { S.queued = hit.i; toast(`Next pass → #${hit.num}`); }
    }
    return { dims: [cfg.L, cfg.W], init, update, draw, click };
  }

  const goal = (f, x, y0, len, side) => { const [gx, gy] = P(f, x, y0); ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.fillRect(side < 0 ? gx - 3 : gx, gy, 3, len * f.s); };

  const HOCKEY = makeNetwork({
    L: 100, W: 60, r: 1.6, ballR: 3.2, ballSpeed: 34,
    numbers: [1, 4, 5, 12, 22, 8, 10, 16, 7, 9, 11],
    positions: ['GK', 'D', 'D', 'D', 'D', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW'],
    defaultForm: '4-3-3',
    formations: { '4-3-3': [[.04, .5], [.2, .14], [.18, .38], [.18, .62], [.2, .86], [.42, .25], [.38, .5], [.42, .75], [.66, .18], [.7, .5], [.66, .82]] },
    markings(f) {
      fieldBase(f);
      lineF(f, 50, 0, 50, 60, C.line, 1.6); lineF(f, 25, 0, 25, 60); lineF(f, 75, 0, 75, 60);
      // 16-yd shooting circles around 4-yd goals
      [[0, 1], [100, -1]].forEach(([gx, dir]) => {
        const [x1, y1] = P(f, gx, 28), [x2, y2] = P(f, gx, 32), R = 16 * f.s;
        ctx.strokeStyle = C.line; ctx.lineWidth = 1.4; ctx.beginPath();
        if (dir > 0) { ctx.arc(x1, y1, R, -Math.PI / 2, 0); ctx.lineTo(x2 + R, y2); ctx.arc(x2, y2, R, 0, Math.PI / 2); }
        else { ctx.arc(x1, y1, R, -Math.PI / 2, Math.PI, true); ctx.lineTo(x2 - R, y2); ctx.arc(x2, y2, R, Math.PI, Math.PI / 2, true); }
        ctx.stroke(); goal(f, gx, 28, 4, -dir);
      });
    },
  });

  const SOCCER = makeNetwork({
    L: 115, W: 75, r: 1.8, ballR: 4, ballSpeed: 30,
    numbers: [1, 2, 4, 5, 3, 6, 8, 10, 7, 9, 11],
    positions: ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'CM', 'AM', 'RW', 'ST', 'LW'],
    defaultForm: '4-3-3',
    formations: {
      '4-3-3': [[.04, .5], [.22, .14], [.18, .38], [.18, .62], [.22, .86], [.4, .3], [.36, .5], [.44, .7], [.66, .16], [.7, .5], [.66, .84]],
      '4-4-2': [[.04, .5], [.22, .14], [.18, .38], [.18, .62], [.22, .86], [.42, .38], [.42, .62], [.46, .14], [.46, .86], [.68, .4], [.68, .6]],
      '3-5-2': [[.04, .5], [.18, .5], [.2, .26], [.2, .74], [.42, .1], [.38, .38], [.38, .62], [.48, .5], [.42, .9], [.68, .4], [.68, .6]],
    },
    markings(f) {
      fieldBase(f);
      lineF(f, 57.5, 0, 57.5, 75, C.line, 1.6); arcF(f, 57.5, 37.5, 10, 0, Math.PI * 2);
      const box = (x, w, h) => { const [a, b] = P(f, x, 37.5 - h / 2); ctx.strokeStyle = C.line; ctx.lineWidth = 1.2; ctx.strokeRect(a, b, w * f.s, h * f.s); };
      box(0, 18, 44); box(97, 18, 44); box(0, 6, 20); box(109, 6, 20);
      arcF(f, 12, 37.5, 10, -.93, .93); arcF(f, 103, 37.5, 10, Math.PI - .93, Math.PI + .93);
      goal(f, 0, 33.5, 8, -1); goal(f, 115, 33.5, 8, 1);
    },
  });

  /* =====================================================================
     CROSS COUNTRY — pack running on a 400 m oval; illustrative scoring
     ===================================================================== */
  const XC = (() => {
    const Ls = 84.39, R = 36.5, PER = 2 * Ls + 2 * Math.PI * R, RACE = 8000, SIM = 9;
    const CX1 = R + 4, CX2 = R + 4 + Ls, CY = R + 4;
    let S;
    function pt(s, lane) { // meters along the lap → coords (counter-clockwise from finish line)
      s = ((s % PER) + PER) % PER; const r = R + lane;
      if (s < Ls) return { x: CX1 + s, y: CY + r };
      s -= Ls; if (s < Math.PI * R) { const a = Math.PI / 2 - s / R; return { x: CX2 + Math.cos(a) * r, y: CY + Math.sin(a) * r }; }
      s -= Math.PI * R; if (s < Ls) return { x: CX2 - s, y: CY - r };
      s -= Ls; const a = -Math.PI / 2 - s / R; return { x: CX1 + Math.cos(a) * r, y: CY + Math.sin(a) * r };
    }
    function reset() {
      const gap = S ? S.gapT : 8;
      S = {
        d: 0, gap, gapT: gap, done: false,
        team: Array.from({ length: 7 }, (_, i) => ({ i, lane: rand(.3, 3.5), ph: Math.random() * 6 })),
        // two opponents lead; the rest are spaced every 5 m behind the front of the race
        opp: Array.from({ length: 34 }, (_, k) => ({ off: k < 2 ? 6 - k * 3 : -((k - 2) * 5 + 2.5), lane: rand(.3, 4.2), ph: Math.random() * 6, col: k % 3 })),
      };
    }
    const teamD = (r, t) => S.d - r.i * S.gap + Math.sin(t * 1.3 + r.ph) * .5;
    const oppD = (o, t) => S.d + o.off + Math.sin(t * 1.1 + o.ph) * .6;
    function update(dt) {
      S.gap = lerp(S.gap, S.gapT, 1 - Math.exp(-dt * 3));
      if (!S.done) { S.d += 6.1 * SIM * dt; if (S.d >= RACE) { S.d = RACE; S.done = true; S.restart = 3; toast('Finish! 8,000 meters'); } }
      else if ((S.restart -= dt) <= 0) reset();
    }
    function draw(f, t) {
      const path = lane => { ctx.beginPath(); for (let s = 0; s <= PER; s += 2) { const q = pt(s, lane); s ? ctx.lineTo(...P(f, q.x, q.y)) : ctx.moveTo(...P(f, q.x, q.y)); } ctx.closePath(); };
      path(4.9); ctx.strokeStyle = 'rgba(153,0,0,.55)'; ctx.lineWidth = 9.8 * f.s; ctx.lineCap = 'butt'; ctx.stroke();
      for (let l = 0; l <= 8; l++) { path(l * 1.22); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.stroke(); }
      path(-.4); ctx.fillStyle = C.turf; ctx.fill();
      const mid = CX1 + Ls / 2;
      const [fx, fy] = P(f, mid - 54.86, CY - 24.38); ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.strokeRect(fx, fy, 109.73 * f.s, 48.77 * f.s);
      label('FRANKLIN FIELD · 400 M OVAL', ...P(f, mid, CY), Math.max(10, 3.4 * f.s), 'rgba(255,255,255,.22)', 900);
      const a = pt(0, 0), b = pt(0, 9.8); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(...P(f, a.x, a.y)); ctx.lineTo(...P(f, b.x, b.y)); ctx.stroke();

      const r = Math.max(4.5, 1.25 * f.s);
      S.opp.forEach(o => { const q = pt(oppD(o, t), o.lane); dot(...P(f, q.x, q.y), r * .85, ['rgba(200,210,230,.6)', 'rgba(150,170,200,.55)', 'rgba(230,230,230,.45)'][o.col]); });
      // gold bracket = scoring pack, 1st → 5th
      const d1 = teamD(S.team[0], t), d5 = teamD(S.team[4], t);
      ctx.beginPath(); for (let s = d5; s <= d1; s += 1) { const q = pt(s, -1.6); s === d5 ? ctx.moveTo(...P(f, q.x, q.y)) : ctx.lineTo(...P(f, q.x, q.y)); }
      ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
      // places from actual positions on the track
      const field = [...S.team.map(rn => ({ rn, d: teamD(rn, t) })), ...S.opp.map(o => ({ d: oppD(o, t) }))].sort((x, y) => y.d - x.d);
      const pl = {}; field.forEach((e, i) => { if (e.rn) pl[e.rn.i] = i + 1; });
      [...S.team].reverse().forEach(rn => {
        const q = pt(teamD(rn, t), rn.lane), [x, y] = P(f, q.x, q.y);
        dot(x + 1, y + 1.5, r, 'rgba(0,0,0,.35)');
        dot(x, y, r, rn.i < 5 ? C.red : 'rgba(226,58,63,.45)', '#fff', 1.4);
        if (r > 6) label(String(rn.i + 1), x, y + .5, r * .95, '#fff', 900);
      });
      const top5 = [0, 1, 2, 3, 4].map(i => pl[i]), score = top5.reduce((s, v) => s + v, 0);
      live(`<div class="row"><span>Team score</span><b>${score}</b></div>
        <div class="row" style="margin-top:6px"><span>Places 1–5</span><span>${top5.join(' · ')}</span></div>
        <div class="meter"><i style="width:${S.d / RACE * 100}%"></i></div>
        <div class="row"><span>Lap ${Math.min(20, Math.floor(S.d / 400) + 1)} / 20</span><span>${Math.round(S.d).toLocaleString()} m</span></div>`);
    }
    return {
      dims: [2 * R + Ls + 8, 2 * R + 8],
      init() {
        reset();
        const rg = range('Pack gap (m)', 1, 25, S.gapT, v => { S.gapT = v; });
        btn('Tighten the pack', () => { S.gapT = 1.5; rg.inp.value = 1.5; rg.out.textContent = '1.5'; toast('Pack tightened — watch the score drop'); }, 'btn--primary');
        btn('Restart', reset);
      },
      update, draw, click() {},
    };
  })();

  /* =====================================================================
     COMPARE — playing surfaces to scale + 8K in football fields
     ===================================================================== */
  const CMP = (() => {
    let t0 = 0;
    const F = [
      { name: 'Soccer', L: 115, W: 75, col: C.gold, on: true },
      { name: 'Football', L: 120, W: 53.33, col: C.red, on: true },
      { name: 'Field hockey', L: 100, W: 60, col: C.blue, on: true },
    ];
    const replay = () => { t0 = performance.now(); };
    function draw() {
      const el = (performance.now() - t0) / 1000;
      const top = 56, h1 = (H - 72 - top) * .66;
      const s = Math.min((W - 80) / 125, h1 / 80), cx = W / 2, cy = top + h1 / 2;
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
      for (let x = -60; x <= 60; x += 10) { ctx.beginPath(); ctx.moveTo(cx + x * s, cy - 40 * s); ctx.lineTo(cx + x * s, cy + 40 * s); ctx.stroke(); }
      for (let y = -40; y <= 40; y += 10) { ctx.beginPath(); ctx.moveTo(cx - 60 * s, cy + y * s); ctx.lineTo(cx + 60 * s, cy + y * s); ctx.stroke(); }
      F.forEach((f, i) => {
        if (!f.on) return;
        const k = ease((el - i * .35) / 1.2); if (k <= 0) return;
        const w = f.L * s, h = f.W * s, x = cx - w / 2, y = cy - h / 2, per = 2 * (w + h);
        ctx.save(); ctx.setLineDash([per * k, per]); ctx.strokeStyle = f.col; ctx.lineWidth = 2.5; ctx.strokeRect(x, y, w, h); ctx.restore();
        if (k >= 1) { ctx.fillStyle = f.col + '14'; ctx.fillRect(x, y, w, h); }
        ctx.globalAlpha *= k;
        const lx = [x + 8, x + w - 8, x + 8][i], ly = [y + 14, y + h - 14, y + h - 14][i];
        label(`${f.name} · ${f.L}×${Math.round(f.W)} yd`, lx, ly, 11, f.col, 800, i === 1 ? 'right' : 'left');
        ctx.globalAlpha = 1;
      });
      const y2 = top + h1 + 30, avail = W - 80, n = 73;
      const cols = Math.min(n, Math.max(19, Math.floor(avail / 13))), cw = avail / cols, chh = Math.min(16, cw * .45);
      label('8 KM CROSS COUNTRY = 73 FOOTBALL FIELDS END TO END', 40, y2 - 14, 11, 'rgba(255,255,255,.75)', 800, 'left');
      const shown = Math.floor(clamp((el - 1.6) / 2.4, 0, 1) * n);
      for (let j = 0; j < n; j++) {
        const x = 40 + (j % cols) * cw, y = y2 + Math.floor(j / cols) * (chh + 6);
        ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, cw - 3, chh);
        if (j < shown) { ctx.fillStyle = j === shown - 1 ? '#fff' : C.red; ctx.fillRect(x, y, cw - 3, chh); }
      }
      live(`<div class="row"><span>Biggest surface</span><b>Soccer</b></div><div class="row" style="margin-top:6px"><span>vs. field hockey</span><span>+44% area</span></div><div class="meter"><i style="width:${shown / n * 100}%"></i></div><div class="row"><span>Football fields run</span><span>${shown} / 73</span></div>`);
    }
    return {
      dims: [120, 80],
      init() {
        replay();
        F.forEach(f => { f.on = true; const b = btn(f.name, () => { f.on = !f.on; b.classList.toggle('is-on', f.on); }); b.classList.add('is-on'); });
        btn('Replay', replay, 'btn--primary');
      },
      update() {}, draw, click: replay,
    };
  })();

  /* ---------- sport content ---------- */
  const SPORTS = {
    football: {
      name: 'Football', mod: FB,
      blurb: 'Eleven players, one snap. Every route only works because the line holds and the quarterback trusts where a teammate will be.',
      stats: [{ t: '120×53⅓', label: 'Field, yards' }, { n: 11, label: 'Players per side' }, { n: 60, suf: 'min', label: 'Game · 4 × 15' }, { n: 5, label: 'Eligible receivers' }],
      how: 'Tap a receiver while the play is live to throw. Gold halos show who’s open — the brighter, the more separation. Wait too long and the QB picks for you.',
    },
    hockey: {
      name: 'Field Hockey', mod: HOCKEY,
      blurb: 'Possession moves stick to stick. Each line is a pass; the more the team connects, the denser the web becomes.',
      stats: [{ t: '100×60', label: 'Field, yards' }, { n: 11, label: 'Players per side' }, { n: 60, suf: 'min', label: 'Game · 4 × 15' }, { n: 16, suf: 'yd', label: 'Shooting circle' }],
      how: 'Tap any player to call for the next pass. The ring around each player fills as they connect with more teammates.',
    },
    soccer: {
      name: 'Women’s Soccer', mod: SOCCER,
      blurb: 'Eleven players can form 55 distinct passing partnerships. Switch shapes and watch the network re-form.',
      stats: [{ t: '115×75', label: 'Typical field, yards' }, { n: 11, label: 'Players per side' }, { n: 90, suf: 'min', label: 'Game · 2 × 45' }, { n: 55, label: 'Possible pass links' }],
      how: 'Tap a player to direct the next pass, or switch formations to reshape the team mid-move.',
    },
    xc: {
      name: 'Cross Country', mod: XC,
      blurb: 'Seven run, the top five score, and the lowest total wins. Every gap in the pack is room for an opponent to slip in.',
      stats: [{ n: 8, suf: 'km', label: 'Race distance' }, { n: 7, label: 'Runners per team' }, { n: 5, label: 'Runners who score' }, { n: 20, label: 'Laps of a 400 m track' }],
      how: 'Drag the pack gap or tighten the pack. Red = Penn (6 and 7 are displacers), grey = opponents. The race and score are an illustrative model.',
    },
    compare: {
      name: 'To Scale', mod: CMP,
      blurb: 'Three fields drawn at the same scale — and the distance a cross country runner covers in a single race.',
      stats: [{ n: 8625, label: 'Soccer · sq yd' }, { n: 6400, label: 'Football · sq yd' }, { n: 6000, label: 'Field hockey · sq yd' }, { n: 73, label: 'Football fields in 8K' }],
      how: 'Toggle each field on or off; tap the canvas to replay the animation.',
    },
  };

  let cur = null, curKey = '', modeAge = 0;
  function setSport(k) {
    if (k === curKey) return;
    curKey = k; cur = SPORTS[k]; modeAge = 0;
    tabs.forEach(b => { const on = b.dataset.sport === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    elSport.textContent = cur.name; elBlurb.textContent = cur.blurb; elHow.textContent = cur.how;
    elCtl.innerHTML = ''; elLive.innerHTML = ''; liveLast = 0;
    setStats(cur.stats);
    cur.mod.init();
  }
  tabs.forEach(b => b.addEventListener('click', () => setSport(b.dataset.sport)));
  document.querySelector('.shape__tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex(b => b.dataset.sport === curKey);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    n.focus(); setSport(n.dataset.sport);
  });
  canvas.addEventListener('pointerdown', e => {
    const r = canvas.getBoundingClientRect();
    cur.mod.click(e.clientX - r.left, e.clientY - r.top);
  });

  /* ---------- main loop (runs only while on screen) ---------- */
  let visible = false, last = 0, T = 0;
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? .5 : 1;
  function loop(now) {
    if (!visible) return;
    const dt = Math.min(.05, (now - last) / 1000 || 0); last = now; T += dt; modeAge += dt;
    cur.mod.update(dt * slow, T);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = ease(modeAge / .5);
    cur.mod.draw(fit(...cur.mod.dims), T);
    ctx.globalAlpha = 1;
    requestAnimationFrame(loop);
  }
  new IntersectionObserver(es => {
    const v = es[0].isIntersecting;
    if (v && !visible) { visible = true; last = performance.now(); requestAnimationFrame(loop); }
    visible = v;
  }, { threshold: .1 }).observe(stage);

  setSport('football');
})();
