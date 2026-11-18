'use strict';
/* ValoTools server. No dependencies, needs Node 18+.
 * Every streamer gets a "space" with two secret tokens:
 *   id  -> control link   /s/<id>            (settings, panel, trigger URLs)
 *   ov  -> overlay link   /o/<ov>/<tool>     (read-only, safe to put in OBS)
 * `owner` is reserved on each space so accounts can be added later without
 * changing the URLs people already use. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = +process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUB = path.join(__dirname, 'public');
const MAX_SPACES = +process.env.MAX_SPACES || 10000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const STATIC = new Set(['style.css', 'panel.js', 'overlay.js', 'overlay.css']);
fs.mkdirSync(DATA, { recursive: true });

const rid = n => crypto.randomBytes(n).toString('base64url');
const pick = a => a[crypto.randomInt(a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- defaults + validation ---------- */
const AGENTS = 'Astra,Breach,Brimstone,Chamber,Clove,Cypher,Deadlock,Fade,Gekko,Harbor,Iso,Jett,KAY/O,Killjoy,Neon,Omen,Phoenix,Raze,Reyna,Sage,Skye,Sova,Tejo,Veto,Viper,Vyse,Waylay,Yoru'.split(',');
const STRATS = ['Pistols only until you win a round', 'Everyone rushes the same site', 'No abilities until the spike is planted', 'Only Sheriff, Ghost and Classic', 'Walk only: no running', 'Crouch while shooting', 'Full stack one site, no rotations', 'Save every round and buy Operators', 'No callouts, only emotes and pings', 'Knife out when not in a fight', 'Play the opposite of your main role'];
const POS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];
const FONTS = ['system', 'impact', 'mono', 'serif'];
const defaults = () => ({
  theme: { accent: '#ff4655', bg: '#0f1923', text: '#ece8e1', font: 'system' },
  duration: 8,
  position: { agent: 'bottom-left', sens: 'bottom-left', crosshair: 'bottom-left', strat: 'bottom-left' },
  agents: [...AGENTS], strats: [...STRATS],
  sens: { min: 0.2, max: 0.7, decimals: 3 },
  names: []
});
const hex = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const num = (v, a, b, d) => { v = +v; return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
const list = (v, max, len) => Array.isArray(v) ? v.map(x => String(x).trim().slice(0, len)).filter(Boolean).slice(0, max) : null;

function sanitize(inp, cur) {
  const s = JSON.parse(JSON.stringify(cur));
  if (!inp || typeof inp !== 'object') return s;
  const t = inp.theme || {};
  for (const k of ['accent', 'bg', 'text']) if (hex(t[k])) s.theme[k] = t[k].toLowerCase();
  if (FONTS.includes(t.font)) s.theme.font = t.font;
  if ('duration' in inp) s.duration = num(inp.duration, 2, 60, s.duration);
  if (inp.position && typeof inp.position === 'object')
    for (const k of Object.keys(s.position)) if (POS.includes(inp.position[k])) s.position[k] = inp.position[k];
  let l;
  if ((l = list(inp.agents, 100, 40))) s.agents = l;
  if ((l = list(inp.strats, 100, 120))) s.strats = l;
  if ((l = list(inp.names, 32, 30))) s.names = l;
  if (inp.sens && typeof inp.sens === 'object') {
    let a = num(inp.sens.min, 0.001, 10, s.sens.min), b = num(inp.sens.max, 0.001, 10, s.sens.max);
    if (a > b) [a, b] = [b, a];
    s.sens = { min: a, max: b, decimals: Math.round(num(inp.sens.decimals, 0, 4, s.sens.decimals)) };
  }
  return s;
}
const ovSettings = s => ({ theme: s.theme, duration: s.duration, position: s.position });

/* ---------- storage ---------- */
const spaces = new Map(), byOv = new Map();
for (const f of fs.readdirSync(DATA)) {
  if (!/^[\w-]+\.json$/.test(f)) continue;
  try { const sp = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); spaces.set(sp.id, sp); byOv.set(sp.ov, sp); }
  catch { console.error('skipping unreadable', f); }
}
function save(sp) {
  const f = path.join(DATA, sp.id + '.json'), t = f + '.tmp';
  fs.writeFileSync(t, JSON.stringify(sp, (k, v) => k[0] === '_' ? undefined : v));
  fs.renameSync(t, f);
}

/* ---------- live events (SSE) ---------- */
const subs = new Map();
function subscribe(key, req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 2000\n\n');
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key).add(res);
  req.on('close', () => { const s = subs.get(key); if (s) { s.delete(res); if (!s.size) subs.delete(key); } });
}
const emitTo = (key, msg) => { const d = 'data: ' + JSON.stringify(msg) + '\n\n'; for (const r of subs.get(key) || []) r.write(d); };
const emit = (sp, msg) => { emitTo(sp.id, msg); emitTo(sp.ov, msg); };
setInterval(() => { for (const s of subs.values()) for (const r of s) r.write(': ka\n\n'); }, 25000).unref();

/* ---------- bracket ---------- */
function prop(R) { R.forEach((r, ri) => r.forEach((x, mi) => { if (x.w && R[ri + 1]) R[ri + 1][mi >> 1].p[mi & 1] = x.w; })); }
function mk(order, total) {
  let N = 2; while (N < total) N *= 2;
  const by = N - total, s = Array(N).fill(null);
  order.forEach((p, i) => { s[i < by ? 2 * i : 2 * by + (i - by)] = p; });
  const R = []; for (let m = N / 2; m >= 1; m /= 2) R.push(Array.from({ length: m }, () => ({ p: [null, null], w: null })));
  R[0].forEach((x, i) => { x.p = [s[2 * i], s[2 * i + 1]]; if (i < by && x.p[0]) x.w = x.p[0]; });
  prop(R); return R;
}
const brState = sp => ({ bracket: sp.bracket, draw: { n: sp.draw.all.length, k: sp.draw.order.length, until: sp._pending ? sp._pending.until : 0 } });
const brEvent = (sp, show) => ({ t: 'bracket', show, ...brState(sp) });
const DRAW_MS = 6800;

function doDraw(sp) {
  const d = sp.draw;
  if (sp._pending && sp._pending.until > Date.now()) return { err: 'A draw is already in progress', code: 409 };
  if (!d.all.length || d.order.length >= d.all.length) {
    const nm = sp.settings.names;
    if (nm.length < 2 || nm.length > 32) return { err: 'Add 2 to 32 players first', code: 400 };
    d.all = [...nm]; d.order = []; sp.bracket = mk([], nm.length);
  }
  const N = d.all.length, i = d.order.length;
  let K = 2; while (K < N) K *= 2;
  const by = K - N;
  const rest = d.all.map((_, j) => j).filter(j => !d.order.includes(j)), k = pick(rest);
  const prev = i ? d.all[d.order[i - 1]] : '';
  const sub = i < by ? `Match ${i + 1} · bye to round 2` : `Match ${by + ((i - by) >> 1) + 1} · ${(i - by) % 2 ? 'vs ' + prev : 'waiting for an opponent'}`;
  const aa = 360 / rest.length, deg = 360 * 6 - (rest.indexOf(k) + 0.5) * aa + (Math.random() - 0.5) * aa * 0.7;
  const r = { k: 'bracket', wheel: 1, lbl: `Draw ${i + 1} of ${N}`, big: d.all[k], list: rest.map(j => d.all[j]), sub, deg, ms: 0, dur: DRAW_MS };
  sp._pending = { k, until: Date.now() + DRAW_MS };
  emit(sp, { t: 'show', r });
  setTimeout(() => {
    sp._pending = null; d.order.push(k);
    sp.bracket = mk(d.order.map(j => d.all[j]), N);
    save(sp); emit(sp, brEvent(sp, true));
  }, DRAW_MS);
  return { ok: 1, text: r.big };
}

/* ---------- crosshair ---------- */
const COL = 8;
function xhair() {
  const p = { c: Math.random() * COL | 0, o: Math.random() < 0.6 ? 1 : 0, d: Math.random() < 0.3 ? 1 : 0, z: 1 + (Math.random() * 3 | 0), t: 1 + (Math.random() * 3 | 0), l: 2 + (Math.random() * 8 | 0), of: Math.random() * 6 | 0 };
  return { xh: p, code: `0;P;c;${p.c};o;${p.o};d;${p.d};z;${p.z};f;0;0t;${p.t};0l;${p.l};0o;${p.of};0a;1;0f;0;1b;0` };
}

/* ---------- triggers (used by the panel AND by chat bots / Streamer.bot) ---------- */
function trigger(sp, tool, body) {
  const s = sp.settings;
  switch (tool) {
    case 'agent': case 'strat': {
      const L = tool === 'agent' ? s.agents : s.strats;
      if (!L.length) return { err: 'That list is empty', code: 400 };
      const r = { k: tool, lbl: tool === 'agent' ? 'Your agent' : 'Strat roulette', big: pick(L), list: L, small: tool === 'strat' ? 1 : 0 };
      emit(sp, { t: 'show', r }); return { ok: 1, text: r.big };
    }
    case 'sens': {
      const big = rnd(s.sens.min, s.sens.max).toFixed(s.sens.decimals);
      sp.last.sens = big; save(sp);
      emit(sp, { t: 'show', r: { k: 'sens', lbl: 'Random sens', big } }); return { ok: 1, text: big };
    }
    case 'crosshair': {
      const x = xhair(), frames = Array.from({ length: 14 }, xhair);
      sp.last.crosshair = x.code; save(sp);
      emit(sp, { t: 'show', r: { k: 'crosshair', lbl: 'Random crosshair', xh: x.xh, code: x.code, frames } }); return { ok: 1, text: x.code };
    }
    case 'bracket':
      if (!sp.bracket) return { err: 'No bracket yet, press Draw first', code: 409 };
      emit(sp, brEvent(sp, true)); return { ok: 1, text: 'ok' };
    case 'hide': emit(sp, { t: 'hide' }); return { ok: 1, text: 'ok' };
    case 'draw': return doDraw(sp);
    case 'reset':
      if (sp._pending && sp._pending.until > Date.now()) return { err: 'A draw is in progress', code: 409 };
      sp.draw = { all: [], order: [] }; sp.bracket = null; save(sp);
      emit(sp, brEvent(sp, false)); emit(sp, { t: 'hide' }); return { ok: 1, text: 'ok' };
    case 'win': {
      const B = sp.bracket, d = sp.draw;
      if (!B || !d.all.length || d.order.length < d.all.length) return { err: 'Finish the draw first', code: 409 };
      const r = +body.r, m = +body.m, si = +body.s;
      const x = B[r] && B[r][m];
      if (!x || !(si === 0 || si === 1) || !x.p[0] || !x.p[1]) return { err: 'No such match', code: 400 };
      const next = B[r + 1] && B[r + 1][m >> 1];
      if (next && next.w) return { err: 'A later match is already decided', code: 409 };
      x.w = x.p[si]; prop(B); save(sp); emit(sp, brEvent(sp, true)); return { ok: 1, text: x.w };
    }
    default: return { err: 'Unknown tool', code: 404 };
  }
}

/* ---------- http ---------- */
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const notFound = res => { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('<body style="font:16px system-ui;background:#0f1923;color:#ece8e1;padding:40px"><h2>Not found</h2><p>That link is not valid. If it was your overlay link, it may have been reset.</p><p><a style="color:#ff4655" href="/">ValoTools home</a></p>'); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function file(res, name, extra) {
  fs.readFile(path.join(PUB, name), (e, buf) => {
    if (e) return notFound(res);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)] || 'text/plain', 'Cache-Control': 'no-cache', ...extra });
    res.end(buf);
  });
}
const readBody = req => new Promise((ok, no) => {
  let n = 0; const c = [];
  req.on('data', d => { n += d.length; if (n > 65536) { no(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); } else c.push(d); });
  req.on('end', () => { try { ok(n ? JSON.parse(Buffer.concat(c).toString()) : {}); } catch { no(Object.assign(new Error('Bad JSON'), { status: 400 })); } });
  req.on('error', no);
});
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (a.length >= max) { hits.set(key, a); return true; }
  a.push(now); hits.set(key, a); return false;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 3600000)) hits.delete(k); }, 600000).unref();
const clientIp = req => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
const publicState = sp => ({ id: sp.id, ov: sp.ov, settings: sp.settings, last: sp.last, ...brState(sp) });

async function handle(req, res) {
  const u = new URL(req.url, 'http://x'), p = u.pathname, m = req.method;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  let a;
  if (m === 'GET' && p === '/') return file(res, 'index.html');
  if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (m === 'GET' && (a = p.match(/^\/static\/([\w.-]+)$/))) return STATIC.has(a[1]) ? file(res, a[1]) : notFound(res);
  if (m === 'GET' && (a = p.match(/^\/s\/([\w-]+)(?:\/(\w+))?\/?$/))) return spaces.has(a[1]) ? file(res, 'panel.html', { 'X-Robots-Tag': 'noindex' }) : notFound(res);
  if (m === 'GET' && (a = p.match(/^\/o\/([\w-]+)(?:\/(\w+))?\/?$/))) return byOv.has(a[1]) ? file(res, 'overlay.html', { 'X-Robots-Tag': 'noindex' }) : notFound(res);

  if (p === '/api/defaults' && m === 'GET') return send(res, 200, defaults());
  if (p === '/api/spaces' && m === 'POST') {
    if (spaces.size >= MAX_SPACES) return send(res, 503, { error: 'This server is full' });
    if (limited('new:' + clientIp(req), 10, 3600000)) return send(res, 429, { error: 'Too many spaces created, try again later' });
    const sp = { id: rid(18), ov: rid(12), created: Date.now(), owner: null, settings: defaults(), last: { sens: null, crosshair: null }, draw: { all: [], order: [] }, bracket: null };
    spaces.set(sp.id, sp); byOv.set(sp.ov, sp); save(sp);
    return send(res, 201, { id: sp.id, ov: sp.ov });
  }
  if ((a = p.match(/^\/api\/o\/([\w-]+)\/(state|events)$/)) && m === 'GET') {
    const sp = byOv.get(a[1]); if (!sp) return send(res, 404, { error: 'Unknown overlay' });
    if (a[2] === 'events') return subscribe(sp.ov, req, res);
    return send(res, 200, { settings: ovSettings(sp.settings), ...brState(sp) });
  }
  if ((a = p.match(/^\/api\/s\/([\w-]+)\/(state|settings|events|rotate-overlay)$/))) {
    const sp = spaces.get(a[1]); if (!sp) return send(res, 404, { error: 'Unknown space' });
    if (a[2] === 'events' && m === 'GET') return subscribe(sp.id, req, res);
    if (a[2] === 'state' && m === 'GET') return send(res, 200, publicState(sp));
    if (a[2] === 'settings' && m === 'PUT') {
      sp.settings = sanitize(await readBody(req), sp.settings); save(sp);
      emitTo(sp.id, { t: 'settings', settings: sp.settings });
      emitTo(sp.ov, { t: 'settings', settings: ovSettings(sp.settings) });
      return send(res, 200, { ok: true, settings: sp.settings });
    }
    if (a[2] === 'rotate-overlay' && m === 'POST') {
      const old = sp.ov; byOv.delete(old); sp.ov = rid(12); byOv.set(sp.ov, sp); save(sp);
      for (const r of subs.get(old) || []) r.end(); subs.delete(old);
      return send(res, 200, { ov: sp.ov });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }
  if ((a = p.match(/^\/api\/t\/([\w-]+)\/(\w+)$/)) && (m === 'GET' || m === 'POST')) {
    const sp = spaces.get(a[1]); if (!sp) return send(res, 404, { error: 'Unknown space' });
    if (limited('t:' + sp.id, 60, 60000)) return send(res, 429, { error: 'Slow down, too many triggers' });
    const out = trigger(sp, a[2], m === 'POST' ? await readBody(req) : {});
    if (u.searchParams.get('text') === '1') { res.writeHead(out.err ? out.code : 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(out.err || out.text || 'ok'); }
    return out.err ? send(res, out.code, { error: out.err }) : send(res, 200, { ok: true, text: out.text });
  }
  return notFound(res);
}

http.createServer((req, res) => {
  handle(req, res).catch(e => {
    if (e.status) return send(res, e.status, { error: e.message });
    console.error(e); if (!res.headersSent) send(res, 500, { error: 'Server error' }); else res.end();
  });
}).listen(PORT, () => console.log(`ValoTools running on http://localhost:${PORT}  (data in ${DATA})`));
