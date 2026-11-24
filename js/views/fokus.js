/* Fokus: eine Aufgabe, großer Timer, Pause / Weiter / Stopp / Erledigt, heutige Einträge mit Summe.
   #fokus/<taskId>. Ohne id: läuft ein Timer, wird dessen Aufgabe gezeigt (Adresse wird ergänzt), sonst Leerzustand.
   Der große Timer zeigt die heutige Zeit auf dieser Aufgabe (eigene Einträge + laufender), damit Pause/Weiter
   nahtlos weiterzählt; berechnet jede Sekunde aus den gespeicherten Startzeiten. Pause = Eintrag beenden,
   Weiter = neuer Eintrag. */
window.LW = window.LW || {};
(function () {
  const { $, esc, farbe, toast, guard } = window.LW.ui;
  const DB = window.LW.db, L = window.LW.logic;
  const app = window.LW.app = window.LW.app || {};
  const views = window.LW.views = window.LW.views || {};
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Strg';
  const icon = id => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;
  const Z = () => window.LW.zeiten;

  let main = null, taskId = null, questId = null, uhr = null, beschaeftigt = false;
  const S = () => app.S;
  const heute = () => L.isoTag(new Date());
  const taskVon = id => (id && S().tasks.find(t => t.id === id)) || null;
  // Läuft der Timer auf der gezeigten Aufgabe? (Eintrag ohne Aufgabe: gleiche Quest)
  const laeuftHier = () => {
    const z = S().laufend;
    return z && (taskId ? z.task_id === taskId : !z.task_id && z.quest_id === questId) ? z : null;
  };
  function eintraege() {
    const s = S(), map = new Map(), h = heute();
    s.zeitenHeute.forEach(z => map.set(z.id, z));
    if (s.laufend) map.set(s.laufend.id, s.laufend);
    return [...map.values()].filter(z => z.user_id === s.ich.id &&
      (taskId ? z.task_id === taskId : !z.task_id && z.quest_id === questId) &&
      (!z.ende || L.isoTag(new Date(z.start)) === h))
      .sort((a, b) => a.start.localeCompare(b.start));
  }
  const summe = (liste, jetzt) => liste.reduce((a, z) => a + L.dauerSek(z, jetzt), 0);
  function seit(z) {
    const d = new Date(z.start);
    return L.isoTag(d) === heute() ? Z().uhrzeit(d) : d.toLocaleDateString('de-DE', { weekday: 'short' }) + ' ' + Z().uhrzeit(d);
  }

  /* ---------- Darstellung ---------- */
  function leer(titel, text) {
    main.innerHTML = `<div class="seite fokus"><div class="leer fokus-leer"><strong>${esc(titel)}</strong><span>${esc(text)}</span>
      <a class="btn" href="#heute">Heute öffnen</a></div></div>`;
  }

  function zeile(z, jetzt) {
    const s = Z().uhrzeit(new Date(z.start));
    const spanne = z.ende ? s + ' – ' + Z().uhrzeit(new Date(z.ende)) : s + ' – jetzt';
    const quest = S().quests.find(q => q.id === z.quest_id);
    const meta = (quest && quest.firma && z.abrechenbar ? '<span class="zeit-abr">abrechenbar</span>' : '') +
      (z.notiz ? `<span class="zeit-notiz">${esc(z.notiz)}</span>` : '');
    let rechts;
    if (Z().gesperrt(z)) rechts = `<span class="zeit-schloss tip-links" tabindex="0" role="img" aria-label="Abgerechnet, nicht mehr änderbar" data-tip="Abgerechnet, nicht mehr änderbar">${icon('i-lock')}</span>`;
    else if (!z.ende) rechts = '<span class="zeit-platz" aria-hidden="true"></span>';
    else rechts = `<button class="btn icon small ghost tip-links" type="button" data-aktion="zeit" data-id="${esc(z.id)}" aria-label="Zeit ${esc(spanne)} bearbeiten" data-tip="Zeit ${esc(spanne)} bearbeiten">${icon('i-edit')}</button>`;
    return `<li class="zeit${z.ende ? '' : ' laeuft-zeile'}">
      <span class="zeit-spanne zahl">${esc(spanne)}</span>
      <span class="zeit-meta">${meta}</span>
      <span class="zeit-dauer zahl"${z.ende ? '' : ' data-laufdauer'}>${L.formatDauer(L.dauerSek(z, jetzt))}</span>
      ${rechts}
    </li>`;
  }

  function zeichnen() {
    const s = S();
    const z = s.laufend;
    const task = taskVon(taskId);
    if (!task && !laeuftHier()) {
      document.title = 'Fokus · LW';
      if (!taskId && !questId) return leer('Gerade läuft kein Timer', 'Wähle in Heute eine Aufgabe und starte den Fokus mit ▶ oder F.');
      return leer('Diese Aufgabe gibt es nicht mehr', 'Sie wurde gelöscht oder ist nicht mehr sichtbar.');
    }
    const quest = s.quests.find(q => q.id === (task ? task.quest_id : questId));
    const kunde = task && task.kunde_id && (s.kunden.find(k => k.id === task.kunde_id) || {}).name;
    const titel = task ? task.titel : 'Ohne Aufgabe';
    const hier = laeuftHier();
    const fertig = !!(task && task.erledigt_am);
    const jetzt = new Date();
    const liste = eintraege();
    const anderer = z && !hier ? (taskVon(z.task_id) || {}).titel || 'Ohne Aufgabe' : null;
    const kbd = `<kbd aria-hidden="true">${MOD}</kbd><kbd aria-hidden="true">↵</kbd>`;
    const erledigtBtn = task && !fertig
      ? `<button class="btn${hier ? ' primary' : ''}" type="button" data-aktion="erledigt" aria-keyshortcuts="${MOD === '⌘' ? 'Meta+Enter' : 'Control+Enter'}">${icon('i-check')}Erledigt${kbd}</button>` : '';
    const aktionen = hier
      ? `<button class="btn" type="button" data-aktion="pause">${icon('i-pause')}Pause</button>
         <button class="btn" type="button" data-aktion="stopp">${icon('i-stop')}Stopp</button>${erledigtBtn}`
      : (task ? `<button class="btn primary" type="button" data-aktion="weiter">${icon('i-play')}${liste.length ? 'Weiter' : 'Fokus starten'}</button>` : '') + erledigtBtn;
    const status = hier ? `<span class="punkt" aria-hidden="true"></span>Läuft seit ${esc(seit(hier))}`
      : fertig ? 'Erledigt' : liste.length ? 'Pausiert' : 'Noch nicht gestartet';

    main.innerHTML = `<div class="seite fokus" style="--q:${farbe(quest && quest.farbe)}">
      <div class="banner warn" data-zulange hidden><p>Der Timer läuft seit über 12 Stunden. Vergessen zu stoppen?</p>
        <button class="btn small" type="button" data-aktion="endzeit">Endzeit korrigieren</button></div>
      <section class="fokus-buehne" aria-labelledby="fokusTitel">
        <p class="fokus-quest"><span class="dot" aria-hidden="true"></span>${esc(quest ? quest.name : '')}${kunde ? ` · ${esc(kunde)}` : ''}</p>
        <h1 class="fokus-titel" id="fokusTitel">${esc(titel)}</h1>
        <p class="fokus-label">Heute auf dieser Aufgabe</p>
        <div class="fokus-timer zahl" role="timer" aria-label="Heute auf dieser Aufgabe" data-timer>${L.formatTimer(summe(liste, jetzt))}</div>
        <p class="fokus-status${hier ? ' aktiv' : ''}">${status}</p>
        <div class="fokus-aktionen">${aktionen}</div>
        ${anderer ? `<p class="fokus-hinweis">Gerade läuft „${esc(anderer)}“. Beim Start wird dieser Timer gestoppt.</p>` : ''}
      </section>
      <section class="fokus-zeiten" aria-labelledby="zeitenTitel">
        <header class="fz-kopf"><h2 id="zeitenTitel">Heute</h2><span class="fz-summe zahl" data-summe></span>
          <button class="btn small ghost" type="button" data-aktion="nachtragen">${icon('i-plus')}Zeit nachtragen</button></header>
        ${liste.length ? `<ul class="zeit-liste">${liste.map(x => zeile(x, jetzt)).join('')}</ul>`
          : '<p class="fz-leer">Noch keine Zeit auf dieser Aufgabe heute.</p>'}
      </section>
    </div>`;
    ticken();
  }

  /* Jede Sekunde: Timer, Summe, Dauer der laufenden Zeile, 12-h-Warnung, Fenstertitel. */
  function ticken() {
    if (!main) return;
    const timer = $('[data-timer]', main);
    if (!timer) return;
    const jetzt = new Date(), liste = eintraege(), sek = summe(liste, jetzt);
    timer.textContent = L.formatTimer(sek);
    const sm = $('[data-summe]', main); if (sm) sm.textContent = sek ? L.formatDauer(sek) : '';
    const hier = laeuftHier();
    const ld = $('[data-laufdauer]', main); if (ld && hier) ld.textContent = L.formatDauer(L.dauerSek(hier, jetzt));
    const z = S().laufend;
    $('[data-zulange]', main).hidden = !(z && L.laufendZuLange(z, jetzt));
    const t = taskVon(taskId);
    document.title = (hier ? L.formatTimer(sek) + ' · ' : '') + (t ? t.titel : 'Fokus') + ' · LW';
  }

  /* Nach einer Aktion neu zeichnen und den Fokus auf eine sinnvolle Taste legen. */
  function neuMitFokus(...aktionen) {
    if (!main) return;
    zeichnen();
    for (const a of aktionen) { const el = $(`[data-aktion="${a}"]`, main); if (el) { el.focus({ preventScroll: true }); return; } }
  }

  /* ---------- Aktionen ---------- */
  async function aktion(name, el) {
    if (beschaeftigt || !main) return;
    beschaeftigt = true;
    if (el) el.setAttribute('aria-busy', 'true');
    try {
      const task = taskVon(taskId);
      if (name === 'pause') {
        if (laeuftHier() && !(await Z().timerStoppen())) return; // Fehler: Toast, Tasten bleiben für einen neuen Versuch
        neuMitFokus('weiter', 'nachtragen');
      } else if (name === 'stopp') {
        if (laeuftHier() && !(await Z().timerStoppen())) return;
        app.go('heute');
      } else if (name === 'weiter') {
        if (!task) return;
        const s = S();
        const vorher = s.laufend && !laeuftHier() ? (taskVon(s.laufend.task_id) || {}).titel || 'Ohne Aufgabe' : null;
        const z = await guard(() => DB.starteTimer(task));
        if (!z) return;
        s.laufend = z;
        app.rahmen();
        neuMitFokus('pause');
        if (vorher) toast('Timer für „' + vorher + '“ gestoppt');
        app.abgleichen();
      } else if (name === 'erledigt') {
        if (!task || task.erledigt_am) return;
        const titel = task.titel;
        if (!(await app.erledigtUmschalten(task))) return; // stoppt einen laufenden Timer zuerst
        const sek = summe(eintraege(), new Date());
        app.go('heute');
        toast('„' + titel + '“ erledigt' + (sek >= 60 ? ' · ' + L.formatDauer(sek) + ' heute' : ''));
      }
    } finally {
      beschaeftigt = false;
      if (el && el.isConnected) el.removeAttribute('aria-busy');
    }
  }

  function klick(e) {
    const el = e.target.closest('[data-aktion]');
    if (!el) return;
    const a = el.dataset.aktion;
    if (a === 'zeit') {
      const z = eintraege().find(x => x.id === el.dataset.id);
      if (z) Z().dialog(z);
    } else if (a === 'nachtragen') {
      Z().dialog(null, { task_id: taskId, quest_id: questId, datum: heute() });
    } else if (a === 'endzeit') {
      if (S().laufend) Z().dialog(S().laufend, { ende: new Date().toISOString() });
    } else aktion(a, el);
  }

  /* Tastatur-Haken der Hülle: ⌘/Strg+Enter = Erledigt, F = Weiter (wenn pausiert). */
  const erledigtVorher = app.erledigt, fokusVorher = app.fokus;
  app.erledigt = () => {
    if (main && S().view === 'fokus') { aktion('erledigt', $('[data-aktion="erledigt"]', main)); return; }
    if (erledigtVorher) erledigtVorher();
  };
  app.fokus = id => {
    if (!id && main && S().view === 'fokus') {
      if (!laeuftHier() && taskVon(taskId)) aktion('weiter', $('[data-aktion="weiter"]', main));
      return;
    }
    if (fokusVorher) fokusVorher(id); else app.go('fokus', id);
  };

  views.fokus = {
    titel: 'Fokus',
    render(m, param) {
      main = m;
      taskId = param || null;
      questId = null;
      const z = S().laufend;
      if (!taskId && z) {
        taskId = z.task_id || null;
        questId = z.quest_id;
        if (taskId) { // Adresse ergänzen: Neuladen und Pause behalten die Aufgabe
          history.replaceState(null, '', location.pathname + location.search + '#fokus/' + encodeURIComponent(taskId));
          S().param = taskId;
        }
      }
      const t = taskVon(taskId);
      if (t) questId = t.quest_id;
      else if (z && taskId && z.task_id === taskId) questId = z.quest_id; // Aufgabe nicht (mehr) sichtbar, Timer läuft
      zeichnen();
      main.onclick = klick;
      uhr = setInterval(ticken, 1000);
    },
    aktualisieren() {
      if (!main) return;
      const a = document.activeElement;
      const merk = a && main.contains(a) && a !== main ? a.dataset.aktion : null;
      const y = window.scrollY;
      zeichnen();
      window.scrollTo(0, y);
      if (merk) neuMitFokusOhneZeichnen(merk);
    },
    destroy() {
      clearInterval(uhr); uhr = null;
      main = null; taskId = null; questId = null; beschaeftigt = false;
    }
  };
  function neuMitFokusOhneZeichnen(a) {
    const el = $(`[data-aktion="${a}"]`, main) || (a === 'pause' || a === 'stopp' ? $('[data-aktion="weiter"]', main) : a === 'weiter' ? $('[data-aktion="pause"]', main) : null);
    if (el) el.focus({ preventScroll: true });
  }
})();
