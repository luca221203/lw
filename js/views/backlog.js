/* Backlog: alle offenen Aufgaben, nach Quest gruppiert. Filter: Quest (auch über #backlog/<questId>),
   Person (Alle / Ich / Niemand zugewiesen), „Ohne Tag“. Pro Zeile: Tag setzen, Zuweisen, Fokus.
   Unten (zugeklappt) „Archiviert“: archivierte Quests und Aufgaben wiederherstellen. */
window.LW = window.LW || {};
(function () {
  const { $, esc, farbe, toast, guard } = window.LW.ui;
  const DB = window.LW.db, L = window.LW.logic, A = window.LW.aufgaben;
  const app = window.LW.app = window.LW.app || {};
  const views = window.LW.views = window.LW.views || {};
  const icon = id => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;
  const heuteIso = () => L.isoTag(new Date());
  const FILTER = 'lw-backlog-filter';
  const PERSONEN = [['alle', 'Alle'], ['ich', 'Ich'], ['niemand', 'Niemand zugewiesen']];

  let main = null, archivOffen = false;
  const f = { questId: null, person: 'alle', ohneTag: false };
  const taskById = id => app.S.tasks.find(t => t.id === id);
  const aktiveQuests = () => app.S.quests.filter(q => !q.archiviert).sort((a, b) => (a.sortierung || 0) - (b.sortierung || 0));

  function filterLesen() {
    try {
      const v = JSON.parse(localStorage.getItem(FILTER) || '{}');
      f.person = PERSONEN.some(p => p[0] === v.person) ? v.person : 'alle';
      f.ohneTag = !!v.ohneTag;
    } catch (e) { /* Vorgaben */ }
  }
  function filterMerken() {
    try { localStorage.setItem(FILTER, JSON.stringify({ person: f.person, ohneTag: f.ohneTag })); } catch (e) { /* egal */ }
  }
  const chip = (aktion, wert, text, an, vorne) =>
    `<button class="chip" type="button" data-aktion="${aktion}" data-wert="${esc(wert)}" aria-pressed="${an}">${vorne || ''}${esc(text)}</button>`;

  function gruppe(q, tasks, heute) {
    const name = esc(q.name), id = esc(q.id);
    const opt = { heute, tagKnopf: 'text', personKnopf: true };
    return `<section class="qb" style="--q:${farbe(q.farbe)}" aria-labelledby="bl-${id}">
      <header class="qb-kopf">
        <span class="dot" aria-hidden="true"></span>
        <h2 class="qb-name" id="bl-${id}">${name}</h2>
        <span class="qb-meta">${q.geteilt ? 'geteilt · ' : ''}${tasks.length} offen</span>
        <span class="qb-aktionen"><button class="btn icon small ghost tip-links" type="button" data-aktion="neu" data-wert="${id}" aria-label="Aufgabe zu ${name} hinzufügen" data-tip="Aufgabe zu ${name} hinzufügen">${icon('i-plus')}</button></span>
      </header>
      <ul class="aufgaben">${tasks.map(t => A.zeile(t, opt)).join('')}</ul>
    </section>`;
  }

  function archiv() {
    const S = app.S;
    const quests = S.quests.filter(q => q.archiviert);
    const tasks = S.tasks.filter(t => t.archiviert);
    if (!quests.length && !tasks.length) return '';
    const questName = id => (S.quests.find(q => q.id === id) || {}).name || '';
    const knopf = (art, name) => `<button class="btn small" type="button" data-aktion="wiederherstellen" data-art="${art}" aria-label="${esc(name)} wiederherstellen">Wiederherstellen</button>`;
    return `<details class="archiv"${archivOffen ? ' open' : ''}>
      <summary><span>Archiviert</span><span class="muted zahl">${quests.length + tasks.length}</span></summary>
      <p class="sub">Archivierte Quests und Aufgaben erscheinen nirgends sonst. Ihre Zeiten bleiben im Rückblick.</p>
      ${quests.length ? `<h3>Quests</h3><ul class="archiv-liste">${quests.map(q => `<li data-id="${esc(q.id)}" style="--q:${farbe(q.farbe)}">
        <span class="dot" aria-hidden="true"></span><span class="archiv-name">${esc(q.name)}</span>${knopf('quest', 'Quest ' + q.name)}</li>`).join('')}</ul>` : ''}
      ${tasks.length ? `<h3>Aufgaben</h3><ul class="archiv-liste">${tasks.map(t => `<li data-id="${esc(t.id)}">
        <span class="archiv-name">${esc(t.titel)}<span class="muted"> · ${esc(questName(t.quest_id))}</span></span>${knopf('task', 'Aufgabe ' + t.titel)}</li>`).join('')}</ul>` : ''}
    </details>`;
  }

  function zeichnen() {
    const S = app.S, heute = heuteIso(), quests = aktiveQuests();
    if (f.questId && !quests.some(q => q.id === f.questId)) f.questId = null;
    const alleOffen = L.backlog(S.tasks, S.quests, {}, S.ich.id).length;
    const liste = L.backlog(S.tasks, S.quests, { questId: f.questId, person: f.person === 'alle' ? null : f.person, ohneTag: f.ohneTag }, S.ich.id);
    const gefiltert = !!(f.questId || f.person !== 'alle' || f.ohneTag);
    const gruppen = quests.map(q => ({ q, tasks: liste.filter(t => t.quest_id === q.id) })).filter(g => g.tasks.length);
    const det = d => { const el = d && $('details.archiv', d); if (el) archivOffen = el.open; };
    det(main);

    let inhalt;
    if (!quests.length) {
      inhalt = `<div class="leer"><strong>Noch keine Quests</strong><span>Quests sind deine langfristigen Ziele, z. B. Mediawo, Sport oder Master.</span>
        <button class="btn primary" type="button" data-aktion="neue-quest">Quest anlegen</button></div>`;
    } else if (!alleOffen) {
      inhalt = `<div class="leer"><strong>Keine offenen Aufgaben</strong><span>Alles erledigt. Leg die nächste Aufgabe an, wenn sie ansteht.</span>
        <button class="btn primary" type="button" data-aktion="neu" data-wert="">Aufgabe anlegen</button></div>`;
    } else if (!liste.length) {
      inhalt = `<div class="leer"><strong>Keine Aufgaben für diese Filter</strong><span>${alleOffen} offene Aufgaben sind ausgeblendet.</span>
        <button class="btn" type="button" data-aktion="zuruecksetzen">Filter zurücksetzen</button></div>`;
    } else {
      inhalt = `<div class="quest-bloecke">${gruppen.map(g => gruppe(g.q, g.tasks, heute)).join('')}</div>`;
    }

    main.innerHTML = `<div class="seite backlog">
      <header class="kopf"><div><h1>Backlog</h1><p class="sub">${alleOffen === 1 ? '1 offene Aufgabe' : alleOffen + ' offene Aufgaben'}${gefiltert && alleOffen ? ` · ${liste.length} gezeigt` : ''}</p></div>
        ${quests.length ? `<button class="btn primary" type="button" data-aktion="neu" data-wert="" aria-keyshortcuts="N">${icon('i-plus')}Aufgabe anlegen<kbd aria-hidden="true">N</kbd></button>` : ''}
      </header>
      ${quests.length && alleOffen ? `<div class="filter">
        <div class="chips" role="group" aria-label="Quest">${chip('quest', '', 'Alle Quests', !f.questId)}${quests.map(q => chip('quest', q.id, q.name, f.questId === q.id, `<span class="dot" style="--q:${farbe(q.farbe)}" aria-hidden="true"></span>`)).join('')}</div>
        <div class="chips" role="group" aria-label="Person">${PERSONEN.map(p => chip('person', p[0], p[1], f.person === p[0])).join('')}</div>
        <div class="chips" role="group" aria-label="Tag">${chip('ohne-tag', '1', 'Ohne Tag', f.ohneTag)}</div>
      </div>` : ''}
      ${inhalt}
      ${archiv()}
    </div>`;
  }

  function questSetzen(id) {
    f.questId = id || null;
    app.S.param = f.questId;
    history.replaceState(null, '', location.pathname + location.search + '#backlog' + (f.questId ? '/' + encodeURIComponent(f.questId) : ''));
  }

  async function wiederherstellen(art, id) {
    const S = app.S;
    if (art === 'quest') {
      const q = S.quests.find(x => x.id === id);
      const r = q && await guard(() => DB.saveQuest({ id, archiviert: false }));
      if (!r) return;
      Object.assign(q, r, { archiviert: false });
      app.rahmen();
      toast(`Quest „${q.name}“ wiederhergestellt`);
    } else {
      const t = taskById(id);
      const r = t && await guard(() => DB.saveTask({ id, archiviert: false }));
      if (!r) return;
      Object.assign(t, r, { archiviert: false });
      const q = S.quests.find(x => x.id === t.quest_id);
      toast(q && q.archiviert ? `„${t.titel}“ wiederhergestellt – die Quest „${q.name}“ ist noch archiviert` : `„${t.titel}“ wiederhergestellt`);
    }
    app.neuZeichnen();
  }

  function klick(e) {
    const el = e.target.closest('[data-aktion]');
    if (!el) return;
    const li = e.target.closest('.aufgabe');
    const t = li && taskById(li.dataset.id);
    const neu = () => A.neuZeichnenMitFokus(main, zeichnen);
    switch (el.dataset.aktion) {
      case 'erledigt': if (t) app.erledigtUmschalten(t).then(ok => { if (ok) toast(`„${t.titel}“ erledigt`); }); break;
      case 'fokus': if (t) app.fokusStarten(t); break;
      case 'bearbeiten': if (t) LW.dialoge.aufgabe(t); break;
      case 'tag': if (t) A.tagMenue(el, t, [0, 1, 2, 3, 4, 5, 6].map(n => A.plusTage(heuteIso(), n))); break;
      case 'zuweisen': if (t) A.personMenue(el, t); break;
      case 'neu': LW.dialoge.aufgabe(null, { quest_id: el.dataset.wert || f.questId || undefined }); break;
      case 'neue-quest': LW.dialoge.quest(); break;
      case 'quest': questSetzen(el.dataset.wert); neu(); break;
      case 'person': f.person = el.dataset.wert; filterMerken(); neu(); break;
      case 'ohne-tag': f.ohneTag = !f.ohneTag; filterMerken(); neu(); break;
      case 'zuruecksetzen':
        questSetzen(null); f.person = 'alle'; f.ohneTag = false; filterMerken(); neu();
        { const c = $('.chip[data-aktion="quest"]', main); if (c) c.focus(); }
        break;
      case 'wiederherstellen': { const z = el.closest('[data-id]'); if (z) wiederherstellen(el.dataset.art, z.dataset.id); break; }
    }
  }

  views.backlog = {
    titel: 'Backlog',
    render(m, param) {
      main = m;
      filterLesen();
      f.questId = param || null;
      zeichnen();
      main.onclick = klick;
    },
    aktualisieren() { if (main) A.neuZeichnenMitFokus(main, zeichnen); },
    destroy() { if (main) { const d = $('details.archiv', main); if (d) archivOffen = d.open; } main = null; }
  };
})();
