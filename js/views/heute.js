/* Heute: pro Quest die heute geplanten und überfälligen Aufgaben und die heute erfassten Stunden.
   Eine Aufgabe ist „ausgewählt“ (↑/↓, Klick oder Tab); F startet ihren Fokus, ⌘/Strg+Enter hakt sie ab.
   Stellt bereit: LW.app.fokusStarten(task), LW.app.erledigtUmschalten(task) – auch für spätere Ansichten. */
window.LW = window.LW || {};
(function () {
  const { $, $$, esc, toast, guard } = window.LW.ui;
  const DB = window.LW.db, L = window.LW.logic;
  const app = window.LW.app = window.LW.app || {};
  const views = window.LW.views = window.LW.views || {};
  const heuteIso = () => L.isoTag(new Date());
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Strg';
  const icon = id => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;

  let main = null, gewaehlt = null, uhr = null;
  const taskById = id => app.S.tasks.find(t => t.id === id);

  /* ---------- Aktionen ---------- */
  let startet = false;
  async function fokusStarten(task) {
    const S = app.S;
    if (S.laufend && S.laufend.task_id === task.id) { app.go('fokus', task.id); return; }
    if (startet) return;
    startet = true;
    try {
      const vorher = S.laufend && (taskById(S.laufend.task_id) || {}).titel;
      const z = await guard(() => DB.starteTimer(task));
      if (!z) return;
      S.laufend = z;
      app.go('fokus', task.id);
      if (vorher) toast('Timer für „' + vorher + '“ gestoppt');
      app.abgleichen(); // heutige Zeiten (gestoppter Timer) und Chip neu holen
    } finally { startet = false; }
  }

  const schaltet = new Set();
  async function erledigtUmschalten(task) {
    if (schaltet.has(task.id)) return;
    schaltet.add(task.id);
    try {
      const wert = task.erledigt_am ? null : new Date().toISOString();
      const r = await guard(() => DB.saveTask({ id: task.id, erledigt_am: wert }));
      if (!r) return;
      const i = app.S.tasks.findIndex(t => t.id === task.id);
      if (i >= 0) app.S.tasks[i] = { ...app.S.tasks[i], ...r, erledigt_am: wert };
      app.neuZeichnen();
    } finally { schaltet.delete(task.id); }
  }
  app.fokusStarten = fokusStarten;
  app.erledigtUmschalten = erledigtUmschalten;

  /* Tastatur-Haken der Hülle: wirken auf die ausgewählte Aufgabe, solange Heute offen ist. */
  const auswahl = () => (app.S && app.S.view === 'heute' && main && gewaehlt) ? taskById(gewaehlt) : null;
  app.fokus = taskId => {
    const t = taskId ? null : auswahl();
    if (t && !t.erledigt_am) fokusStarten(t); else app.go('fokus', taskId);
  };
  app.erledigt = () => { const t = auswahl(); if (t) erledigtUmschalten(t); };

  /* ---------- Darstellung ---------- */
  function zeile(t, q, heute) {
    const S = app.S;
    const fertig = !!t.erledigt_am;
    const kunde = t.kunde_id && (S.kunden.find(k => k.id === t.kunde_id) || {}).name;
    const laeuft = S.laufend && S.laufend.task_id === t.id;
    const meta = (L.istUeberfaellig(t, heute) ? '<span class="badge warn">überfällig</span>' : '') +
      (kunde ? `<span class="tag">${esc(kunde)}</span>` : '');
    const titel = esc(t.titel);
    return `<li class="aufgabe${fertig ? ' fertig' : ''}${t.id === gewaehlt ? ' gewaehlt' : ''}" data-id="${esc(t.id)}">
      <button class="check" type="button" role="checkbox" aria-checked="${fertig}" data-aktion="erledigt" aria-label="${titel} erledigt"><span class="ring"><svg aria-hidden="true"><use href="#i-check"/></svg></span></button>
      <div class="aufgabe-text">
        <button class="aufgabe-titel" type="button" data-aktion="bearbeiten" aria-label="${titel} bearbeiten">${titel}</button>
        ${meta ? `<span class="aufgabe-meta">${meta}</span>` : ''}
      </div>
      ${fertig ? '' : laeuft
        ? `<button class="btn small fokus-btn laeuft-jetzt" type="button" data-aktion="fokus" aria-label="Läuft – Fokus öffnen: ${titel}"><span class="punkt" aria-hidden="true"></span>Läuft</button>`
        : `<button class="btn small fokus-btn" type="button" data-aktion="fokus" aria-label="Fokus starten: ${titel}">${icon('i-play')}Fokus</button>`}
    </li>`;
  }

  function block(b, heute) {
    const q = b.quest, name = esc(q.name), id = esc(q.id);
    return `<section class="qb" style="--q:${esc(q.farbe)}" aria-labelledby="qb-${id}" data-quest="${id}">
      <header class="qb-kopf">
        <span class="dot" aria-hidden="true"></span>
        <h2 class="qb-name" id="qb-${id}">${name}</h2>
        ${q.geteilt ? '<span class="qb-meta">geteilt</span>' : ''}
        <span class="qb-std zahl" data-std="${id}"></span>
        <span class="qb-aktionen">
          ${b.tasks.length ? `<button class="btn icon small ghost" type="button" data-aktion="neu" data-quest="${id}" aria-label="Aufgabe zu ${name} hinzufügen" data-tip="Aufgabe zu ${name} hinzufügen">${icon('i-plus')}</button>` : ''}
          <button class="btn icon small ghost tip-links" type="button" data-aktion="quest" data-quest="${id}" aria-label="Quest ${name} bearbeiten" data-tip="Quest ${name} bearbeiten">${icon('i-edit')}</button>
        </span>
      </header>
      <div class="qb-balken" aria-hidden="true"><i data-balken="${id}"></i></div>
      ${b.tasks.length
        ? `<ul class="aufgaben">${b.tasks.map(t => zeile(t, q, heute)).join('')}</ul>`
        : `<p class="qb-leer"><span>Nichts für heute</span><button class="btn link small" type="button" data-aktion="neu" data-quest="${id}">Aufgabe hinzufügen</button></p>`}
    </section>`;
  }

  function zeichnen() {
    const S = app.S, heute = heuteIso();
    const bloecke = L.heuteAnsicht(S.quests, S.tasks, S.ich.id, heute);
    const datum = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    main.innerHTML = `<div class="seite heute">
      <header class="kopf"><div><h1>Heute</h1><p class="sub">${esc(datum)}<span data-gesamt></span></p></div>
        ${bloecke.length ? `<button class="btn primary" type="button" data-aktion="neu" aria-keyshortcuts="N">${icon('i-plus')}Aufgabe anlegen<kbd aria-hidden="true">N</kbd></button>` : ''}
      </header>
      ${bloecke.length
        ? `<div class="quest-bloecke">${bloecke.map(b => block(b, heute)).join('')}</div>
           <p class="tasten-hilfe" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> auswählen · <kbd>F</kbd> Fokus · <kbd>${MOD}</kbd><kbd>↵</kbd> erledigt</p>`
        : `<div class="leer"><strong>Noch keine Quests</strong><span>Quests sind deine langfristigen Ziele, z. B. Mediawo, Sport oder Master.</span>
           <button class="btn primary" type="button" data-aktion="neue-quest">Quest anlegen</button></div>`}
    </div>`;
    stundenZeigen();
  }

  /* Heutige Stunden pro Quest – dieselbe Zahl wie in der Seitenleiste. Balken = Anteil am heutigen Gesamt. */
  function stundenZeigen() {
    if (!main) return;
    const sek = app.stundenHeute();
    const gesamt = Object.values(sek).reduce((a, b) => a + b, 0);
    $$('[data-std]', main).forEach(el => { const v = sek[el.dataset.std] || 0; el.textContent = v ? L.formatDauer(v) : ''; });
    $$('[data-balken]', main).forEach(el => { el.style.transform = 'scaleX(' + (gesamt ? (sek[el.dataset.balken] || 0) / gesamt : 0) + ')'; });
    const g = $('[data-gesamt]', main);
    if (g) g.textContent = gesamt ? ' · ' + L.formatDauer(gesamt) + ' erfasst' : '';
  }

  /* ---------- Auswahl ---------- */
  function waehlen(id, fokus) {
    gewaehlt = id;
    $$('.aufgabe', main).forEach(li => li.classList.toggle('gewaehlt', li.dataset.id === id));
    if (!fokus) return;
    const btn = $(`.aufgabe[data-id="${CSS.escape(id)}"] .aufgabe-titel`, main);
    if (btn) { btn.focus({ preventScroll: true }); btn.scrollIntoView({ block: 'nearest' }); }
  }
  const tippt = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  function pfeile(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (!main || $('#dlg').open || e.metaKey || e.ctrlKey || e.altKey || tippt(e.target)) return;
    if (!(e.target === document.body || main.contains(e.target))) return; // nicht in Seitenleiste/Menü
    const ids = $$('.aufgabe', main).map(li => li.dataset.id);
    if (!ids.length) return;
    e.preventDefault();
    const runter = e.key === 'ArrowDown';
    let i = ids.indexOf(gewaehlt);
    i = i < 0 ? (runter ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, i + (runter ? 1 : -1)));
    waehlen(ids[i], true);
  }
  function fokusRein(e) {
    const li = e.target.closest('.aufgabe');
    if (li) waehlen(li.dataset.id, false);
  }

  function klick(e) {
    const el = e.target.closest('[data-aktion]');
    const li = e.target.closest('.aufgabe');
    if (li) waehlen(li.dataset.id, false);
    if (!el) return;
    const t = li && taskById(li.dataset.id);
    const qid = el.dataset.quest;
    switch (el.dataset.aktion) {
      case 'erledigt': if (t) erledigtUmschalten(t); break;
      case 'fokus': if (t) fokusStarten(t); break;
      case 'bearbeiten': if (t) LW.dialoge.aufgabe(t); break;
      case 'neu': LW.dialoge.aufgabe(null, { quest_id: qid, tag: heuteIso() }); break;
      case 'quest': { const q = app.S.quests.find(x => x.id === qid); if (q) LW.dialoge.quest(q); break; }
      case 'neue-quest': LW.dialoge.quest(); break;
    }
  }

  views.heute = {
    titel: 'Heute',
    render(m) {
      main = m;
      zeichnen();
      main.onclick = klick;
      main.addEventListener('focusin', fokusRein);
      document.addEventListener('keydown', pfeile);
      uhr = setInterval(() => { if (app.S.laufend) stundenZeigen(); }, 30000);
    },
    /* Daten geändert: neu zeichnen, Auswahl, Fokus und Scroll bleiben. */
    aktualisieren() {
      if (!main) return;
      const a = document.activeElement;
      const drin = a && a !== main && main.contains(a);
      const li = drin && a.closest('.aufgabe');
      const merk = drin ? { id: li && li.dataset.id, aktion: a.dataset.aktion, quest: a.dataset.quest } : null;
      const y = window.scrollY;
      zeichnen();
      window.scrollTo(0, y);
      if (!merk) return;
      let ziel = null;
      if (merk.id) {
        const zeileEl = $(`.aufgabe[data-id="${CSS.escape(merk.id)}"]`, main);
        if (zeileEl) ziel = (merk.aktion && $(`[data-aktion="${merk.aktion}"]`, zeileEl)) || $('.aufgabe-titel', zeileEl);
      } else if (merk.aktion) {
        ziel = $(`[data-aktion="${merk.aktion}"]${merk.quest ? `[data-quest="${CSS.escape(merk.quest)}"]` : ''}`, main);
      }
      if (ziel) ziel.focus({ preventScroll: true });
    },
    destroy() {
      clearInterval(uhr); uhr = null;
      document.removeEventListener('keydown', pfeile);
      if (main) main.removeEventListener('focusin', fokusRein);
      main = null;
    }
  };
})();
