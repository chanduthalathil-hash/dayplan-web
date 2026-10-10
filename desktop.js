/* =====================================================================
   DayPlan Desktop layer
   Adds: command palette, keyboard shortcuts, pomodoro cycles, tray sync,
   smart notifications, automatic screen-time, backup/restore, quick capture.
   Loaded after the core app script; uses its globals (day, pref, DB, ...).
   ===================================================================== */
(function () {
  'use strict';
  const D = window.dayplan && window.dayplan.isDesktop ? window.dayplan : null;

  /* ---------- styles ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .cmdk-ov{position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);z-index:120;display:none;justify-content:center;align-items:flex-start;padding-top:12vh}
  .cmdk-ov.show{display:flex}
  .cmdk{width:100%;max-width:560px;background:var(--card);border-radius:16px;box-shadow:var(--shadow-pop);overflow:hidden;border:1px solid var(--line)}
  .cmdk input{width:100%;border:none;outline:none;background:none;color:var(--ink);font-family:inherit;font-size:16px;padding:17px 18px;border-bottom:1px solid var(--line)}
  .cmdk-list{max-height:340px;overflow:auto;padding:7px}
  .cmdk-row{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:600;color:var(--ink)}
  .cmdk-row .ci{width:28px;height:28px;border-radius:8px;background:var(--bg);display:grid;place-items:center;color:var(--ink-2);flex:0 0 28px}
  .cmdk-row .kb{margin-left:auto;font-size:11px;color:var(--ink-3);font-weight:700;border:1px solid var(--line-2);border-radius:6px;padding:2px 6px}
  .cmdk-row.sel,.cmdk-row:hover{background:var(--green-tint);color:var(--green-600)}
  .cmdk-empty{padding:24px;text-align:center;color:var(--ink-3);font-size:13px}
  .pomo-pill{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;color:var(--ink-2);border:1px solid var(--line-2);border-radius:99px;padding:4px 11px;margin-left:8px}
  .pomo-pill i{width:7px;height:7px;border-radius:50%;background:var(--green);display:block}
  .pomo-pill.brk i{background:var(--blue)}
  `;
  document.head.appendChild(css);

  /* ---------- helpers ---------- */
  const $ = (s) => document.querySelector(s);
  function ico(n, s) { return (typeof svg === 'function') ? svg(n, s || 16) : ''; }
  function notify(title, body, urgent) {
    if (D) D.notify(title, body, !!urgent);
    else if (window.Notification && Notification.permission === 'granted') new Notification(title, { body });
  }

  /* ---------- Command palette ---------- */
  const ov = document.createElement('div');
  ov.className = 'cmdk-ov';
  ov.innerHTML = `<div class="cmdk"><input id="cmdkIn" placeholder="Type a command…  (try: focus, plan, habit, export)" autocomplete="off"><div class="cmdk-list" id="cmdkList"></div></div>`;
  document.body.appendChild(ov);
  let cmdSel = 0, cmdItems = [];

  function commands() {
    const base = [
      { t: 'Plan my day', ic: 'sun', kb: 'P', run: () => planMyDay() },
      { t: 'Add activity', ic: 'plus', kb: 'A', run: () => activityModal() },
      { t: 'Start focus session', ic: 'clock', kb: 'F', run: () => startFocus() },
      { t: 'Start Pomodoro (25/5)', ic: 'leaf', run: () => startPomodoro(25, 5) },
      { t: 'Open mini focus widget', ic: 'goal', run: () => D && D.miniAction('open-mini') },
      { t: 'End-of-day review', ic: 'notes', kb: 'R', run: () => reviewModal() },
      { t: 'Log screen time', ic: 'phone', run: () => screenModal() },
      { t: 'Add habit', ic: 'check', run: () => habitModal() },
      { t: 'Add goal', ic: 'goal', run: () => goalModal() },
      { t: 'Add routine block', ic: 'planner', run: () => templateModal() },
      { t: 'Go to Today', ic: 'today', kb: '1', run: () => setView('today') },
      { t: 'Go to Planner', ic: 'planner', kb: '2', run: () => setView('planner') },
      { t: 'Go to Habits', ic: 'habits', kb: '3', run: () => setView('habits') },
      { t: 'Go to Goals', ic: 'goal', kb: '4', run: () => setView('goals') },
      { t: 'Go to Analytics', ic: 'analytics', kb: '5', run: () => setView('analytics') },
      { t: 'Go to Calendar', ic: 'calendar', run: () => setView('calendar') },
      { t: 'Go to Notes', ic: 'notes', run: () => setView('notes') },
      { t: 'Settings', ic: 'settings', run: () => setView('settings') },
      { t: 'Toggle dark mode', ic: 'moon', kb: 'D', run: () => { pref.dark = !pref.dark; applyDark(); queueSave(); } },
      { t: 'Jump to today', ic: 'today', kb: 'T', run: () => loadDay(todayStr()) }
    ];
    if (D) base.push(
      { t: 'Export backup…', ic: 'notes', run: async () => { const p = await D.store.export(); if (p) toast('Backup saved'); } },
      { t: 'Import backup…', ic: 'notes', run: async () => { const p = await D.store.import(); if (p && !p.error) { toast('Imported — reloading'); setTimeout(() => location.reload(), 600); } } },
      { t: 'Show data file', ic: 'notes', run: () => D.store.reveal() }
    );
    // jump straight to any activity's focus session
    (day.activities || []).filter(a => a.status === 'pending').forEach(a => {
      base.push({ t: 'Focus: ' + a.title, ic: a.icon, run: () => startFocus(a.id) });
    });
    return base;
  }

  function openPalette() {
    ov.classList.add('show');
    const inp = $('#cmdkIn'); inp.value = ''; cmdSel = 0; renderPalette(''); setTimeout(() => inp.focus(), 40);
  }
  function closePalette() { ov.classList.remove('show'); }
  function renderPalette(q) {
    const all = commands();
    const ql = q.trim().toLowerCase();
    cmdItems = ql ? all.filter(c => c.t.toLowerCase().includes(ql)) : all;
    if (cmdSel >= cmdItems.length) cmdSel = 0;
    const list = $('#cmdkList');
    list.innerHTML = cmdItems.length
      ? cmdItems.map((c, i) => `<div class="cmdk-row ${i === cmdSel ? 'sel' : ''}" data-i="${i}"><span class="ci">${ico(c.ic, 15)}</span>${c.t}${c.kb ? `<span class="kb">${c.kb}</span>` : ''}</div>`).join('')
      : '<div class="cmdk-empty">No matching command</div>';
    list.querySelectorAll('[data-i]').forEach(r => r.onclick = () => runCmd(+r.dataset.i));
  }
  function runCmd(i) { const c = cmdItems[i]; if (!c) return; closePalette(); setTimeout(() => { try { c.run(); } catch (e) { console.error(e); } }, 60); }

  ov.addEventListener('click', e => { if (e.target === ov) closePalette(); });
  document.addEventListener('input', e => { if (e.target && e.target.id === 'cmdkIn') { cmdSel = 0; renderPalette(e.target.value); } });

  /* ---------- Keyboard shortcuts ---------- */
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) && e.target.id !== 'cmdkIn';
    if (ov.classList.contains('show')) {
      if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); cmdSel = Math.min(cmdSel + 1, cmdItems.length - 1); renderPalette($('#cmdkIn').value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cmdSel = Math.max(cmdSel - 1, 0); renderPalette($('#cmdkIn').value); }
      else if (e.key === 'Enter') { e.preventDefault(); runCmd(cmdSel); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const map = {
      p: () => planMyDay(), a: () => activityModal(), f: () => startFocus(), r: () => reviewModal(),
      t: () => loadDay(todayStr()), d: () => { pref.dark = !pref.dark; applyDark(); queueSave(); },
      '1': () => setView('today'), '2': () => setView('planner'), '3': () => setView('habits'),
      '4': () => setView('goals'), '5': () => setView('analytics'),
      arrowleft: () => loadDay(addDays(dayStr, -1)), arrowright: () => loadDay(addDays(dayStr, 1))
    };
    const fn = map[k];
    if (fn) { e.preventDefault(); try { fn(); } catch (err) { console.error(err); } }
  });

  /* ---------- Pomodoro cycles ---------- */
  let pomo = null;
  window.startPomodoro = function (work, brk) {
    pomo = { work, brk, phase: 'work', round: 1 };
    pref.focusLen = work; queueSave();
    startFocus();
    toast(`Pomodoro started — ${work} min focus, ${brk} min break`);
    paintPomoPill();
  };
  function paintPomoPill() {
    const host = document.querySelector('.greet p'); if (!host) return;
    const old = host.querySelector('.pomo-pill'); if (old) old.remove();
    if (!pomo) return;
    const s = document.createElement('span');
    s.className = 'pomo-pill' + (pomo.phase === 'break' ? ' brk' : '');
    s.innerHTML = `<i></i>Pomodoro · ${pomo.phase === 'work' ? 'Focus' : 'Break'} · round ${pomo.round}`;
    host.appendChild(s);
  }

  // hook completion to advance the pomodoro cycle
  const origComplete = window.completeFocus;
  window.completeFocus = function () {
    origComplete();
    if (!pomo) return;
    if (pomo.phase === 'work') {
      pomo.phase = 'break';
      notify('Focus complete — take a break', `${pomo.brk} minute break. Round ${pomo.round} done.`);
      paintPomoPill();
      setTimeout(() => {
        if (!pomo) return;
        pomo.phase = 'work'; pomo.round++;
        notify('Break over', 'Ready for the next focus round?');
        paintPomoPill();
      }, pomo.brk * 60000);
    }
  };

  /* ---------- Focus state → mini widget + tray ---------- */
  setInterval(() => {
    if (!D) return;
    try {
      const fs = focusState;
      if (fs) {
        const a = (day.activities || []).find(x => x.id === fs.aid);
        D.focusState({ running: fs.running, left: fs.left, total: fs.total, title: a ? a.title : 'Focus' });
      } else {
        D.focusState({ running: false, left: 0, total: 0, title: '' });
      }
    } catch (e) { }
  }, 1000);

  /* ---------- Tray sync ---------- */
  function syncTray() {
    if (!D || typeof day === 'undefined' || !day) return;
    try {
      const st = dayStats(day);
      const pend = (day.activities || []).filter(a => a.status === 'pending').sort((a, b) => toMin(a.start) - toMin(b.start));
      const n = nowMin();
      const next = pend.find(a => toMin(a.start) >= n) || pend[0];
      D.tray({ next: next ? `${next.title} · ${fmt12(next.start)}` : 'Nothing scheduled', adherence: st.adherence, focusing: !!focusState });
    } catch (e) { }
  }
  setInterval(syncTray, 20000);
  setTimeout(syncTray, 2500);

  /* ---------- Smart notifications ---------- */
  const fired = {};
  setInterval(() => {
    if (typeof day === 'undefined' || !day || dayStr !== todayStr()) return;
    const n = nowMin();
    (day.activities || []).forEach(a => {
      if (a.status !== 'pending') return;
      const s = toMin(a.start), key5 = a.id + ':5', key0 = a.id + ':0', keyO = a.id + ':over';
      if (s - n === 5 && !fired[key5]) { fired[key5] = 1; notify('Starting in 5 min', `${a.title} · ${fmt12(a.start)}–${fmt12(a.end)}`); }
      if (s - n === 0 && !fired[key0]) { fired[key0] = 1; notify('Now: ' + a.title, `Scheduled ${fmt12(a.start)}–${fmt12(a.end)}`); }
      const [st_, en] = interval(a);
      if (n > en && n - en <= 1 && !fired[keyO]) { fired[keyO] = 1; notify('Overdue: ' + a.title, 'Mark it done, skipped, or postpone it.'); }
    });
    // bedtime reminder
    const bed = toMin(toHM(toMin(pref.wakeTime || '07:00') - (pref.sleepHours || 8) * 60));
    if (n === Math.max(0, bed - 15) && !fired['bed']) { fired['bed'] = 1; notify('Bedtime in 15 minutes', pref.noPhoneSleep ? 'Wind down and put the phone away.' : 'Time to wind down.'); }
    // screen-time warning
    if ((day.screenMin || 0) > (pref.phoneTarget || 120) && !fired['screen']) { fired['screen'] = 1; notify('Screen-time limit reached', `You've passed your ${((pref.phoneTarget || 120) / 60).toFixed(0)}h daily target.`, true); }
  }, 30000);

  /* ---------- Automatic screen time (desktop only) ---------- */
  if (D) {
    D.onScreenTick((mins) => {
      if (!day || dayStr !== todayStr()) return;
      if (pref.autoScreen === false) return;
      day.screenMin = (day.screenMin || 0) + mins;
      queueSave();
      if (typeof render === 'function' && view === 'today') render();
    });
    D.onPower((s) => { if (s === 'resume') syncTray(); });
    D.onShortcut((action) => {
      if (action === 'command-palette') openPalette();
      else if (action === 'quick-capture') quickCapture();
      else if (action === 'toggle-focus') { if (focusState) exitFocus(); else startFocus(); }
      else if (action === 'plan-day') planMyDay();
      else if (action === 'review') reviewModal();
      else if (action === 'open-mini') { /* handled by main */ }
      else if (action === 'pause') { if (focusState) { focusState.running = !focusState.running; renderFocus(); } }
      else if (action === 'complete') { if (focusState) completeFocus(); }
      else if (action === 'skip') { if (focusState) { const a = day.activities.find(x => x.id === focusState.aid); if (a) a.status = 'skipped'; exitFocus(); queueSave(); render(); } }
    });
  }

  /* ---------- Quick capture (global hotkey) ---------- */
  function quickCapture() {
    openModal('Quick capture', `
      <div class="field"><label>What needs to happen?</label><input id="qc-title" placeholder="e.g. Call the bank"></div>
      <div class="row2"><div class="field"><label>Start</label><input id="qc-start" type="time" value="${toHM(Math.ceil(nowMin() / 15) * 15)}"></div>
      <div class="field"><label>End</label><input id="qc-end" type="time" value="${toHM(Math.ceil(nowMin() / 15) * 15 + 60)}"></div></div>
      <div class="sub">Added straight to today's timeline.</div>`,
      `<button class="btn" data-close>Cancel</button><button class="btn primary" id="qc-save">Add to today</button>`);
    const q2 = (s) => document.querySelector('#overlay ' + s);
    q2('#qc-save').onclick = () => {
      const t = q2('#qc-title').value.trim(); if (!t) { toast('Add a title'); return; }
      day.activities.push({ id: id(), title: t, icon: 'tag', color: '#6366f1', start: q2('#qc-start').value, end: q2('#qc-end').value, status: 'pending', goalId: null });
      day.planned = true; queueSave(); render(); closeModal(); toast('Added to today');
    };
  }
  window.quickCapture = quickCapture;

  /* ---------- Settings additions ---------- */
  const origSettings = window.viewSettings;
  window.viewSettings = function (el) {
    origSettings(el);
    if (!D) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginTop = '20px';
    card.innerHTML = `<div class="card-head"><h3>Desktop</h3></div>
      <div class="toggle" style="margin-top:0">Track screen time automatically <span class="sw ${pref.autoScreen !== false ? 'on' : ''}" id="asSw"></span></div>
      <div class="toggle">Close button minimises to tray <span class="sw ${pref.minTray !== false ? 'on' : ''}" id="mtSw"></span></div>
      <div class="sub" style="margin:12px 0 0">Global shortcuts: <b>Ctrl+Shift+D</b> quick capture · <b>Ctrl+Alt+F</b> focus · <b>Ctrl+Shift+P</b> command palette. In-app: <b>Ctrl+K</b> palette, <b>P</b> plan, <b>A</b> add, <b>F</b> focus, <b>R</b> review, <b>←/→</b> change day.</div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn" id="expBtn">Export backup</button>
        <button class="btn" id="impBtn">Import backup</button>
        <button class="btn" id="revBtn">Show data file</button>
      </div>`;
    el.appendChild(card);
    card.querySelector('#asSw').onclick = (e) => { pref.autoScreen = pref.autoScreen === false; e.target.classList.toggle('on', pref.autoScreen !== false); queueSave(); };
    card.querySelector('#mtSw').onclick = (e) => { pref.minTray = pref.minTray === false; e.target.classList.toggle('on', pref.minTray !== false); DB.set('dp:minimizeToTray', pref.minTray !== false); queueSave(); };
    card.querySelector('#expBtn').onclick = async () => { const p = await D.store.export(); if (p) toast('Backup saved'); };
    card.querySelector('#impBtn').onclick = async () => { const p = await D.store.import(); if (p && !p.error) { toast('Imported — reloading'); setTimeout(() => location.reload(), 600); } };
    card.querySelector('#revBtn').onclick = () => D.store.reveal();
  };

  console.log('DayPlan desktop layer ready' + (D ? ' (Electron)' : ' (browser fallback)'));
})();
