(() => {
  const m = location.pathname.match(/^\/o\/([\w-]+)(?:\/(\w+))?/);
  const OV = m[1], TOOL = m[2] || 'all';
  const stage = document.getElementById('stage');
  const FONT = { system: 'system-ui,"Segoe UI",sans-serif', impact: 'Impact,"Arial Narrow",sans-serif', mono: 'ui-monospace,Consolas,monospace', serif: 'Georgia,serif' };
  const COLS = ['#fff', '#0f0', '#9f0', '#df0', '#ff0', '#0ff', '#f6c', '#f33'];
  let S = { settings: { theme: {}, duration: 8, position: {} }, bracket: null };
  let timers = [];

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pick = a => a[Math.random() * a.length | 0];
  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
  const every = (fn, ms) => { const id = setInterval(fn, ms); timers.push(id); return id; };

  function applyTheme() {
    const t = S.settings.theme || {}, r = document.documentElement.style;
    if (t.accent) r.setProperty('--oa', t.accent);
    if (t.bg) r.setProperty('--ob', t.bg);
    if (t.text) r.setProperty('--ot', t.text);
    if (t.font && FONT[t.font]) r.setProperty('--of', FONT[t.font]);
  }

  function hide() { timers.forEach(id => { clearTimeout(id); clearInterval(id); }); timers = []; stage.innerHTML = ''; stage.className = ''; }

  /* ----- renderers ----- */
  function bhtml(B) {
    if (!B) return '';
    const L = B.length;
    return '<div class="br">' + B.map((r, ri) => `<div class="col"><h4>${ri === L - 1 ? 'Final' : 'Round ' + (ri + 1)}</h4>${r.map(x => `<div class="mt">${[0, 1].map(s => `<div class="pl${x.w && x.w === x.p[s] ? ' win' : ''}">${x.p[s] ? esc(x.p[s]) : '—'}</div>`).join('')}</div>`).join('')}</div>`).join('')
      + (B[L - 1][0].w ? `<div class="col"><h4>Champion</h4><div class="mt champ">🏆 ${esc(B[L - 1][0].w)}</div></div>` : '') + '</div>';
  }
  function fit() {
    const b = stage.querySelector('.br'); if (!b) return;
    const c = b.closest('.card'); b.style.transform = '';
    const k = Math.min(1.8, (c.clientWidth - 80) / b.offsetWidth, (c.clientHeight - 140) / b.offsetHeight);
    b.style.transform = `scale(${k})`;
  }
  addEventListener('resize', fit);

  function wheelSvg(list) {
    const n = list.length, a = 360 / n, R = 185, C = 200;
    const pt = t => [C + R * Math.sin(t * Math.PI / 180), C - R * Math.cos(t * Math.PI / 180)];
    const tone = ['var(--oa)', 'color-mix(in srgb,var(--oa) 60%,var(--ob))', 'color-mix(in srgb,var(--oa) 30%,var(--ob))'];
    const fs = n > 20 ? 11 : n > 12 ? 14 : n > 6 ? 18 : 22;
    const seg = list.map((nm, i) => {
      const [x1, y1] = pt(i * a), [x2, y2] = pt((i + 1) * a), mid = (i + .5) * a;
      const shape = n === 1 ? `<circle cx="${C}" cy="${C}" r="${R}" style="fill:${tone[0]}"/>`
        : `<path d="M${C} ${C}L${x1} ${y1}A${R} ${R} 0 ${a > 180 ? 1 : 0} 1 ${x2} ${y2}Z" style="fill:${tone[i % 3]};stroke:var(--ob);stroke-width:2"/>`;
      const t = nm.length > 14 ? nm.slice(0, 13) + '…' : nm;
      return shape + `<text transform="rotate(${mid - 90} ${C} ${C})" x="${C + R - 14}" y="${C}" text-anchor="end" dominant-baseline="middle" style="fill:var(--ot);font:700 ${fs}px system-ui;paint-order:stroke;stroke:var(--ob);stroke-width:3px">${esc(t)}</text>`;
    }).join('');
    return `<svg class="wheel" viewBox="0 0 400 400"><g id="wh" style="transform-origin:${C}px ${C}px;transition:transform 5s cubic-bezier(.12,.7,.12,1)">${seg}</g><circle cx="${C}" cy="${C}" r="24" style="fill:var(--ob);stroke:var(--oa);stroke-width:4"/><polygon points="186,0 214,0 200,34" style="fill:var(--ot);stroke:var(--ob);stroke-width:2"/></svg>`;
  }

  function xhSvg(p) {
    const k = 5, cx = 70, col = COLS[p.c], o = p.o;
    const rc = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${col}" stroke="${o ? '#000' : 'none'}"/>`;
    const a = p.l * k / 2, w = p.t * k / 2, g = p.of * k / 2 + 4;
    let s = '<svg width="140" height="140" viewBox="0 0 140 140" style="background:#3a4a56;border-radius:4px;margin-top:8px">';
    s += rc(cx - w / 2, cx - g - a, w, a) + rc(cx - w / 2, cx + g, w, a) + rc(cx - g - a, cx - w / 2, a, w) + rc(cx + g, cx - w / 2, a, w);
    if (p.d) s += rc(cx - p.z * k / 4, cx - p.z * k / 4, p.z * k / 2, p.z * k / 2);
    return s + '</svg>';
  }

  /* ----- scenes ----- */
  function showBracket() {
    if (!S.bracket) return;
    hide(); stage.className = 'full';
    stage.innerHTML = `<div class="card"><div class="lbl">1v1 Bracket</div>${bhtml(S.bracket)}</div>`;
    fit();
  }

  function show(r) {
    if (TOOL !== 'all' && r.k !== TOOL) return;
    hide();
    if (r.wheel) {
      stage.className = 'full';
      stage.innerHTML = `<div class="card"><div class="lbl">${esc(r.lbl)}</div>${wheelSvg(r.list)}<div class="big" id="wn" style="visibility:hidden">${esc(r.big)}</div><div class="sub">${esc(r.sub || '')}</div></div>`;
      const w = document.getElementById('wh');
      requestAnimationFrame(() => requestAnimationFrame(() => { w.style.transform = `rotate(${r.deg}deg)`; }));
      later(() => { const n = document.getElementById('wn'); if (n) n.style.visibility = 'visible'; }, 5200);
      return; // the server sends the bracket once the draw has landed
    }
    stage.className = 'pos-' + ((S.settings.position || {})[r.k] || 'bottom-left');
    let body;
    if (r.xh) body = `<div id="xh">${xhSvg(r.xh)}</div>`;
    else body = `<div class="big${r.small ? ' small' : ''}" id="bg">${esc(r.list ? pick(r.list) : r.big)}</div>`;
    stage.innerHTML = `<div class="card"><div class="lbl">${esc(r.lbl)}</div>${body}<div class="sub" id="sb">${esc(r.code || r.sub || '')}</div></div>`;
    if (r.list) {
      let n = 0; const el = document.getElementById('bg');
      const id = every(() => { n++; el.textContent = n > 14 ? r.big : pick(r.list); if (n > 14) clearInterval(id); }, 80);
    }
    if (r.frames) {
      let n = 0; const x = document.getElementById('xh'), sb = document.getElementById('sb');
      const id = every(() => { n++; const f = n > 14 ? r : pick(r.frames); x.innerHTML = xhSvg(f.xh); sb.textContent = f.code; if (n > 14) clearInterval(id); }, 90);
    }
    const ms = (S.settings.duration || 8) * 1000 + (r.list || r.frames ? 1200 : 0);
    later(hide, ms);
  }

  /* ----- data ----- */
  async function load() {
    try {
      const r = await fetch(`/api/o/${OV}/state`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      S.settings = j.settings; S.bracket = j.bracket; applyTheme();
      if (TOOL === 'bracket' && !stage.innerHTML) showBracket(); // a dedicated bracket scene shows the bracket right away
    } catch { /* retry on next reconnect */ }
  }

  const es = new EventSource(`/api/o/${OV}/events`);
  es.onopen = load;
  es.onmessage = e => {
    let d; try { d = JSON.parse(e.data); } catch { return; }
    if (d.t === 'show') show(d.r);
    else if (d.t === 'hide') hide();
    else if (d.t === 'settings') { S.settings = d.settings; applyTheme(); }
    else if (d.t === 'bracket') {
      S.bracket = d.bracket;
      if (d.show && (TOOL === 'all' || TOOL === 'bracket')) showBracket();
    }
  };
  applyTheme();
})();
