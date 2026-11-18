(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ID = location.pathname.match(/^\/s\/([\w-]+)/)[1], BASE = '/s/' + ID, ORIGIN = location.origin;
  const POS = [['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right'], ['center', 'Center']];
  const FONTS = [['system', 'Clean (system)'], ['impact', 'Bold condensed'], ['mono', 'Monospace'], ['serif', 'Serif']];
  const PRESETS = [['Valorant', '#ff4655', '#0f1923', '#ece8e1'], ['Cyan', '#00e5ff', '#0b1a22', '#e8fbff'], ['Violet', '#b36bff', '#14101f', '#f1e9ff'], ['Lime', '#9dff3d', '#10170b', '#f2ffe0'], ['Light', '#d6336c', '#ffffff', '#1b1b1b']];
  const NAV = [['home', 'Home'], ['bracket', 'Bracket'], ['agent', 'Agent'], ['sens', 'Sens'], ['crosshair', 'Crosshair'], ['strat', 'Strat'], ['style', 'Style'], ['connect', 'Chat & Streamer.bot']];
  let P = null, S = null, cur = 'home', saveTimer = null, dirty = false;

  /* ---------- helpers ---------- */
  function note(t, ms) { const e = $('#saved'); e.textContent = t; clearTimeout(note.t); note.t = setTimeout(() => { e.textContent = ''; }, ms || 2000); }
  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ')');
    return j;
  }
  async function doSave() { dirty = false; try { await api('PUT', `/api/s/${ID}/settings`, S); note('Saved ✓'); } catch (e) { note(e.message, 4000); } }
  function queueSave() { dirty = true; note('Saving…'); clearTimeout(saveTimer); saveTimer = setTimeout(doSave, 500); }
  async function flush() { if (dirty) { clearTimeout(saveTimer); await doSave(); } }
  async function trig(tool, body) { await flush(); try { return await api('POST', `/api/t/${ID}/${tool}`, body || {}); } catch (e) { note(e.message, 4000); } }
  const get = (o, p) => p.split('.').reduce((a, k) => a && a[k], o);
  const set = (o, p, v) => { const ks = p.split('.'), l = ks.pop(); ks.reduce((a, k) => a[k], o)[l] = v; };
  function copy(t, btn) {
    const ok = () => { const o = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = o; }, 1200); };
    const fb = () => { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); ok(); } catch { /* ignore */ } a.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fb); else fb();
  }

  /* ---------- building blocks ---------- */
  const preview = tool => `<div class="pvwrap"><iframe src="/o/${P.ov}/${tool}" title="Overlay preview"></iframe></div>`;
  const urlRow = (label, url) => `<div class="urlrow"><b>${esc(label)}</b><code>${esc(url)}</code><button class="g" data-copy="${esc(url)}">Copy</button></div>`;
  const ovUrl = tool => `${ORIGIN}/o/${P.ov}/${tool}`;
  const trUrl = tool => `${ORIGIN}/api/t/${ID}/${tool}`;
  const posSel = path => `<select data-bind="${path}">${POS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
  const fontSel = () => `<select data-bind="theme.font">${FONTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
  const urlsPanel = (tool, extra) => `<div class="panel"><h2>Links</h2>${urlRow('OBS overlay (Browser Source)', ovUrl(tool))}<div class="m">Add it in OBS as a Browser Source, 1920×1080.</div>${(extra || []).map(([l, t]) => urlRow(l, trUrl(t))).join('')}</div>`;

  function listTool(tool, title, desc, key, label, rollLabel) {
    return `<h1>${title}</h1><p class="m">${desc}</p>
<div class="two"><div>${preview(tool)}</div><div class="panel stack">
 <button class="cta" data-t="${tool}">${rollLabel}</button>
 <label>${label} (one per line)<textarea rows="10" data-bind="${key}" data-type="list"></textarea></label>
 <div class="row"><label>Overlay position ${posSel('position.' + tool)}</label><button class="g" data-resetlist="${key}">Reset list to default</button></div>
</div></div>
${urlsPanel(tool, [['Chat / redeem trigger', tool]])}`;
  }

  function matchesHtml() {
    const B = P.bracket;
    if (!B) return '<div class="m">No bracket yet. Add players, then press Draw.</div>';
    if (P.draw.k < P.draw.n) return '<div class="m">Matches unlock once every player has been drawn.</div>';
    const L = B.length;
    if (B[L - 1][0].w) return `<div class="big-res">🏆 ${esc(B[L - 1][0].w)}</div><div class="m">Press Reset to start a new tournament.</div>`;
    for (let ri = 0; ri < L; ri++) {
      const real = B[ri].map((x, mi) => ({ x, mi })).filter(o => o.x.p[0] && o.x.p[1]);
      if (real.some(o => !o.x.w)) {
        return `<div class="m">${ri === L - 1 ? 'Final' : 'Round ' + (ri + 1)} · click the winner of each match (click the other player to change it)</div>` +
          real.map(o => `<div class="mrow">${[0, 1].map(s => `<button class="${o.x.w === o.x.p[s] ? '' : 'g'}" data-win="${ri},${o.mi},${s}">${esc(o.x.p[s])}</button>`).join('<span>vs</span>')}</div>`).join('');
      }
    }
    return '';
  }

  /* ---------- views ---------- */
  const views = {
    home() {
      return `<h1>Your space</h1>
<div class="notice"><b>This page is your private control link.</b> Bookmark it. Anyone who has it can control your overlays, so don't share it or show it on stream.
 ${urlRow('Control link', ORIGIN + BASE)}</div>
<div class="tiles">
 <a class="tile" href="${BASE}/bracket" data-go><i>🏆</i><b>1v1 Bracket</b><span>Lucky wheel draw and live bracket</span></a>
 <a class="tile" href="${BASE}/agent" data-go><i>🎭</i><b>Random agent</b><span>Spin for an agent</span></a>
 <a class="tile" href="${BASE}/sens" data-go><i>🖱️</i><b>Random sens</b><span>Roll an in-game sens</span></a>
 <a class="tile" href="${BASE}/crosshair" data-go><i>🎯</i><b>Random crosshair</b><span>Spin and copy a code</span></a>
 <a class="tile" href="${BASE}/strat" data-go><i>🎲</i><b>Strat roulette</b><span>Chaos challenges</span></a>
 <a class="tile" href="${BASE}/style" data-go><i>🎨</i><b>Overlay style</b><span>Colors, font, timing</span></a>
 <a class="tile" href="${BASE}/connect" data-go><i>🔌</i><b>Chat & Streamer.bot</b><span>Commands and channel point redeems</span></a>
</div>
<div class="panel"><h2>Overlays for OBS</h2><div class="m">One Browser Source (1920×1080) per overlay. Put the bracket on its own scene.</div>
 ${urlRow('Bracket + draw wheel', ovUrl('bracket'))}${urlRow('Agent', ovUrl('agent'))}${urlRow('Sens', ovUrl('sens'))}${urlRow('Crosshair', ovUrl('crosshair'))}${urlRow('Strat roulette', ovUrl('strat'))}${urlRow('All tools in one', ovUrl('all'))}
</div>`;
    },
    bracket() {
      return `<h1>1v1 Bracket</h1>
<ol class="steps m"><li>Type the players below, one per line (2 to 32).</li><li>Press the draw button once for every player. A lucky wheel picks each one.</li><li>Click the winner of each match here, and the overlay updates by itself.</li></ol>
<div class="two"><div>${preview('bracket')}<p class="m">The bracket is a full-screen scene. Give it its own scene in OBS.</p></div>
<div class="panel stack">
 <label>Players<textarea rows="8" data-bind="names" data-type="list"></textarea></label>
 <div class="row"><button class="cta" id="bdraw" data-t="draw">Draw first player</button><button class="g" id="breset" data-t="reset" data-confirm="Clear the bracket and start over?">Reset</button><small id="bstat"></small></div>
 <div class="row"><button class="g" data-t="bracket">Show bracket</button><button class="g" data-t="hide">Hide overlay</button></div>
 <h2>Matches</h2><div id="bmatches"></div>
</div></div>
${urlsPanel('bracket', [['Draw next player', 'draw'], ['Show bracket', 'bracket'], ['Reset bracket', 'reset']])}`;
    },
    agent: () => listTool('agent', 'Random agent', 'Spin for an agent. Edit the list when new agents release.', 'agents', 'Agents', '🎭 Roll agent'),
    strat: () => listTool('strat', 'Strat roulette', 'Your own list of challenges for the round.', 'strats', 'Strats', '🎲 Spin'),
    sens() {
      return `<h1>Random sens</h1><p class="m">Rolls an in-game sensitivity between your min and max.</p>
<div class="two"><div>${preview('sens')}</div><div class="panel stack">
 <button class="cta" data-t="sens">🖱️ Roll sens</button>
 <div class="row"><span class="big-res" data-live="sens">–</span><button class="g" data-last="sens" disabled>Copy sens</button></div>
 <div class="row"><label>Min <input type="number" step="0.01" min="0.001" data-bind="sens.min" data-type="num"></label><label>Max <input type="number" step="0.01" min="0.001" data-bind="sens.max" data-type="num"></label><label>Decimals <input type="number" min="0" max="4" data-bind="sens.decimals" data-type="num"></label></div>
 <div class="row"><label>Overlay position ${posSel('position.sens')}</label></div>
</div></div>${urlsPanel('sens', [['Chat / redeem trigger', 'sens']])}`;
    },
    crosshair() {
      return `<h1>Random crosshair</h1><p class="m">Spins through crosshairs and lands on one. Paste the code in Valorant: Settings → Crosshair → Import Profile Code. If a code doesn't import, roll again.</p>
<div class="two"><div>${preview('crosshair')}</div><div class="panel stack">
 <button class="cta" data-t="crosshair">🎯 Roll crosshair</button>
 <div class="row"><code data-live="crosshair" style="flex:1">–</code><button class="g" data-last="crosshair" disabled>Copy code</button></div>
 <div class="row"><label>Overlay position ${posSel('position.crosshair')}</label></div>
</div></div>${urlsPanel('crosshair', [['Chat / redeem trigger', 'crosshair']])}`;
    },
    style() {
      return `<h1>Overlay style</h1><p class="m">Applies to every overlay, live.</p>
<div class="two"><div>${preview('all')}</div><div class="panel stack">
 <div class="row"><label>Accent <input type="color" data-bind="theme.accent"></label><label>Background <input type="color" data-bind="theme.bg"></label><label>Text <input type="color" data-bind="theme.text"></label></div>
 <div class="row">${PRESETS.map(p => `<button class="g" data-preset="${p[1]},${p[2]},${p[3]}">${p[0]}</button>`).join('')}</div>
 <div class="row"><label>Font ${fontSel()}</label><label>Cards stay for <input type="number" min="2" max="60" data-bind="duration" data-type="num"> seconds</label></div>
 <h2>Try it</h2>
 <div class="cgrid"><button data-t="agent">Agent</button><button data-t="sens">Sens</button><button data-t="crosshair">Crosshair</button><button data-t="strat">Strat</button><button class="g" data-t="hide">Hide</button></div>
 <div class="m">Each card's position is set on its own page.</div>
</div></div>
<div class="panel"><h2>All-in-one overlay</h2>${urlRow('OBS overlay', ovUrl('all'))}</div>`;
    },
    connect() {
      const rows = [['agent', 'Roll agent'], ['sens', 'Roll sens'], ['crosshair', 'Roll crosshair'], ['strat', 'Spin strat roulette'], ['draw', 'Bracket: draw next player'], ['bracket', 'Bracket: show on overlay'], ['hide', 'Hide overlay'], ['reset', 'Bracket: reset']];
      return `<h1>Chat & Streamer.bot</h1><p class="m">Every tool has a trigger link. Calling it rolls the tool and shows it on your overlay, so chat commands and channel point redeems work without this page being open.</p>
<div class="notice"><b>Keep these links private.</b> Anyone with a trigger link can fire your overlays. Limit commands to mods or use channel point redeems, otherwise chat can spam them.</div>
<div class="panel"><h2>Streamer.bot</h2>
 <ol class="steps">
  <li>Create an Action, for example "Valo Agent".</li>
  <li>Add the sub-action <b>Fetch URL</b> (in the sub-action menu under Core → Network, if you can't find it search for "Fetch URL"). Paste the trigger link for that tool from the list below.</li>
  <li>Add a trigger: <b>Core → Commands → Command</b> (for example <code>!agent</code>) or <b>Twitch → Channel Reward → Reward Redeemed</b>.</li>
  <li>Right-click the action and choose <b>Test Trigger</b>. Your overlay should react.</li>
 </ol></div>
<div class="panel"><h2>Announce the result in chat</h2>
 <p class="m">Add <code>?text=1</code> to a trigger link and it answers with just the result, for example "Jett", so your bot can post it in chat.</p>
 <ol class="steps">
  <li>In the <b>Fetch URL</b> sub-action, paste the "chat answer" link from the list below into the <b>URL</b> box. Then type a name of your choice into the <b>Variable Name</b> box, for example <code>agentResult</code>, without percent signs. Fetch URL saves the answer under that name. Leave both switches (Parse Results as JSON and Auto-Type) off.</li>
  <li>Add a <b>Core → Delay</b> sub-action after it, so chat doesn't spoil the animation: about <b>2000 ms</b> for agent, sens, crosshair and strat, and about <b>7000 ms</b> for the bracket draw (the wheel spins for about 7 seconds).</li>
  <li>Add <b>Twitch → Chat → Send Message</b> after that, for example: <code>@%user% your agent is %agentResult%</code>. Write the variable name between percent signs, spelled exactly like in the <b>Variable Name</b> box. If it doesn't match, the message comes out blank.</li>
 </ol>
 ${[['agent', 'Agent'], ['sens', 'Sens'], ['crosshair', 'Crosshair'], ['strat', 'Strat roulette'], ['draw', 'Bracket draw (the drawn player)']].map(([t, l]) => urlRow(l + ' (chat answer)', trUrl(t) + '?text=1')).join('')}
</div>
<div class="panel"><h2>Trigger links</h2>${rows.map(([t, l]) => urlRow(l, trUrl(t))).join('')}
 <div class="m" style="margin-top:8px"><b>Chat bots:</b> add <code>?text=1</code> to a link and it answers with plain text (for example "Jett"). Nightbot, StreamElements and Fossabot custom commands can fetch a link and post the answer. The syntax differs per bot, so check your bot's docs.</div></div>
<div class="panel"><h2>Links</h2>${urlRow('Your control link', ORIGIN + BASE)}
 <div class="row"><button class="g" data-rotate="1">Reset overlay links</button><small>Use this if an overlay link leaked. You'll need to paste the new overlay links into OBS. Control and trigger links stay the same.</small></div></div>`;
    }
  };

  /* ---------- render ---------- */
  function bind() {
    document.querySelectorAll('#view [data-bind]').forEach(el => {
      const path = el.dataset.bind, type = el.dataset.type, v = get(S, path);
      el.value = type === 'list' ? (v || []).join('\n') : v;
      el.addEventListener('input', () => {
        let x = el.value;
        if (type === 'list') x = x.split('\n').map(s => s.trim()).filter(Boolean);
        else if (type === 'num') { x = +x; if (!Number.isFinite(x)) return; }
        set(S, path, x); queueSave();
      });
    });
  }
  function scalePv() { document.querySelectorAll('.pvwrap').forEach(w => { w.querySelector('iframe').style.transform = `scale(${w.clientWidth / 1920})`; }); }
  addEventListener('resize', scalePv);

  function live() {
    document.querySelectorAll('[data-live="sens"]').forEach(e => { e.textContent = P.last.sens || '–'; });
    document.querySelectorAll('[data-live="crosshair"]').forEach(e => { e.textContent = P.last.crosshair || '–'; });
    document.querySelectorAll('[data-last]').forEach(b => { b.disabled = !P.last[b.dataset.last]; });
    const d = P.draw, n = d.n, k = d.k, busy = Date.now() < d.until;
    const bd = $('#bdraw'); if (bd) { bd.disabled = busy; bd.textContent = busy ? 'Drawing…' : !n ? 'Draw first player' : k >= n ? 'New draw' : `Draw player ${k + 1} of ${n}`; }
    const br = $('#breset'); if (br) br.disabled = busy;
    const bs = $('#bstat'); if (bs) bs.textContent = n ? `${k}/${n} drawn` : '';
    const bm = $('#bmatches'); if (bm) bm.innerHTML = matchesHtml();
  }

  function route() {
    const m = location.pathname.match(/^\/s\/[\w-]+\/?(\w+)?/);
    cur = m && m[1] && Object.hasOwn(views, m[1]) ? m[1] : 'home';
    $('#nav').innerHTML = NAV.map(([k, l]) => `<a href="${k === 'home' ? BASE : BASE + '/' + k}" data-go class="${k === cur ? 'on' : ''}">${l}</a>`).join('');
    $('#view').innerHTML = views[cur]();
    bind(); scalePv(); live();
  }
  function go(href) { history.pushState(null, '', href); route(); scrollTo(0, 0); }
  addEventListener('popstate', route);

  document.addEventListener('click', async e => {
    const a = e.target.closest('a[data-go]');
    if (a) { e.preventDefault(); go(a.getAttribute('href')); return; }
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.copy) return copy(d.copy, b);
    if (d.last) return copy(P.last[d.last], b);
    if (d.win) { const [r, m, s] = d.win.split(',').map(Number); return trig('win', { r, m, s }); }
    if (d.preset) { const [ac, bg, tx] = d.preset.split(','); Object.assign(S.theme, { accent: ac, bg, text: tx }); queueSave(); return route(); }
    if (d.resetlist) { try { const df = await api('GET', '/api/defaults'); S[d.resetlist] = df[d.resetlist]; queueSave(); route(); } catch (err) { note(err.message, 4000); } return; }
    if (d.rotate) {
      if (!confirm('Reset the overlay links? Your OBS sources will stop working until you paste the new links.')) return;
      try { const j = await api('POST', `/api/s/${ID}/rotate-overlay`); P.ov = j.ov; route(); note('Overlay links reset. Update OBS.', 5000); } catch (err) { note(err.message, 4000); }
      return;
    }
    if (d.t) { if (d.confirm && !confirm(d.confirm)) return; trig(d.t); }
  });

  /* ---------- live updates from the server ---------- */
  function connect() {
    const es = new EventSource(`/api/s/${ID}/events`); let first = true;
    es.onopen = async () => {
      if (first) { first = false; return; }
      try { const j = await api('GET', `/api/s/${ID}/state`); P.last = j.last; P.bracket = j.bracket; P.draw = j.draw; live(); } catch { /* ignore */ }
    };
    es.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'show') {
        const r = m.r;
        if (r.k === 'sens') P.last.sens = r.big;
        if (r.k === 'crosshair') P.last.crosshair = r.code;
        if (r.wheel) { P.draw.until = Date.now() + r.dur; setTimeout(live, r.dur + 150); }
        live();
      } else if (m.t === 'bracket') { P.bracket = m.bracket; P.draw = m.draw; live(); }
    };
  }

  (async () => {
    try {
      P = await api('GET', `/api/s/${ID}/state`); S = P.settings;
      try { let l = JSON.parse(localStorage.vt_spaces || '[]'); localStorage.vt_spaces = JSON.stringify([ID, ...l.filter(x => x !== ID)].slice(0, 5)); } catch { /* ignore */ }
      route(); connect();
    } catch (e) { $('#view').innerHTML = `<div class="notice">Could not load this space: ${esc(e.message)}</div>`; }
  })();
})();
