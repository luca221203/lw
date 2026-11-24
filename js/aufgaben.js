/* Gemeinsame Bausteine für Aufgaben-Zeilen (Heute, Woche, Backlog):
   LW.aufgaben.zeile(task, opt)        -> <li class="aufgabe"> Markup
   LW.aufgaben.tagSetzen(task, iso|null), zuweisen(task, userId|null)
   LW.aufgaben.tagMenue(knopf, task, tage), personMenue(knopf, task)  – Auswahl-Menü am Knopf
   LW.aufgaben.tagText(iso) -> „Do, 26.11.“ */
window.LW = window.LW || {};
(function () {
  const { esc, farbe, toast, guard } = window.LW.ui;
  const DB = window.LW.db, L = window.LW.logic;
  const app = window.LW.app = window.LW.app || {};
  const icon = id => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;

  const datum = iso => { const p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const plusTage = (iso, n) => { const d = datum(iso); return L.isoTag(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
  const tagText = iso => datum(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
  const tagLang = iso => datum(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' });
  function relativ(iso) {
    const heute = L.isoTag(new Date());
    if (iso === heute) return 'Heute';
    if (iso === plusTage(heute, 1)) return 'Morgen';
    return tagText(iso);
  }
  function personName(id) {
    const S = app.S;
    if (!id) return 'Niemand';
    if (S.ich && id === S.ich.id) return 'Ich';
    return (S.profile.find(p => p.id === id) || {}).name || 'Unbekannt';
  }

  /* opt: gewaehlt (id), heute (iso, für „überfällig“), quest (Quest-Name zeigen), tagKnopf ('text'|'icon'),
          personKnopf (nur geteilte Quests), person (Zuweisung an andere als Etikett), ziehbar,
          check / fokus / kunde (Vorgabe true: Abhak-Kreis, Fokus-Taste, Kunden-Etikett) */
  function zeile(t, opt) {
    opt = opt || {};
    const S = app.S;
    const q = S.quests.find(x => x.id === t.quest_id) || {};
    const fertig = !!t.erledigt_am;
    const kunde = t.kunde_id && (S.kunden.find(k => k.id === t.kunde_id) || {}).name;
    const laeuft = S.laufend && S.laufend.task_id === t.id;
    const titel = esc(t.titel);
    const fremd = q.geteilt && t.zugewiesen_an && t.zugewiesen_an !== S.ich.id;
    const meta = (opt.quest ? `<span class="aufgabe-quest"><span class="dot" aria-hidden="true"></span>${esc(q.name || '')}</span>` : '') +
      (opt.heute && L.istUeberfaellig(t, opt.heute) ? '<span class="badge warn">überfällig</span>' : '') +
      (opt.person && fremd ? `<span class="tag">${esc(personName(t.zugewiesen_an))}</span>` : '') +
      (kunde && opt.kunde !== false ? `<span class="tag">${esc(kunde)}</span>` : '');
    let knoepfe = '';
    if (!fertig && opt.tagKnopf === 'text') {
      knoepfe += `<button class="btn small ghost zeile-knopf" type="button" data-aktion="tag" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(t.tag ? relativ(t.tag) : 'Ohne Tag')} – Tag setzen: ${titel}">${icon('i-woche')}<span>${esc(t.tag ? relativ(t.tag) : 'Ohne Tag')}</span></button>`;
    } else if (!fertig && opt.tagKnopf === 'icon') {
      knoepfe += `<button class="btn icon small ghost zeile-knopf tip-links" type="button" data-aktion="tag" aria-haspopup="menu" aria-expanded="false" aria-label="Tag setzen: ${titel}" data-tip="Tag setzen">${icon('i-woche')}</button>`;
    }
    if (!fertig && opt.personKnopf && !q.geteilt) knoepfe += '<span class="zeile-platz" aria-hidden="true"></span>'; // Spalten bleiben bündig
    if (!fertig && opt.personKnopf && q.geteilt) {
      knoepfe += `<button class="btn small ghost zeile-knopf" type="button" data-aktion="zuweisen" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(personName(t.zugewiesen_an))} – Zuweisen: ${titel}">${icon('i-person')}<span>${esc(personName(t.zugewiesen_an))}</span></button>`;
    }
    if (!fertig && opt.fokus !== false) {
      knoepfe += laeuft
        ? `<button class="btn small fokus-btn laeuft-jetzt" type="button" data-aktion="fokus" aria-label="Läuft – Fokus öffnen: ${titel}"><span class="punkt" aria-hidden="true"></span>Läuft</button>`
        : `<button class="btn small fokus-btn" type="button" data-aktion="fokus" aria-label="Fokus starten: ${titel}">${icon('i-play')}Fokus</button>`;
    }
    return `<li class="aufgabe${fertig ? ' fertig' : ''}${t.id === opt.gewaehlt ? ' gewaehlt' : ''}" data-id="${esc(t.id)}" style="--q:${farbe(q.farbe)}"${opt.ziehbar && !fertig ? ' draggable="true"' : ''}>
      ${opt.check === false ? '' : `<button class="check" type="button" role="checkbox" aria-checked="${fertig}" data-aktion="erledigt" aria-label="${titel} erledigt"><span class="ring"><svg aria-hidden="true"><use href="#i-check"/></svg></span></button>`}
      <div class="aufgabe-text">
        <button class="aufgabe-titel" type="button" data-aktion="bearbeiten" aria-label="${titel} bearbeiten">${titel}</button>
        ${meta ? `<span class="aufgabe-meta">${meta}</span>` : ''}
      </div>
      ${knoepfe ? `<span class="aufgabe-aktionen">${knoepfe}</span>` : ''}
    </li>`;
  }

  /* ---------- Speichern ---------- */
  function uebernehmen(id, patch, r) {
    const S = app.S, i = S.tasks.findIndex(t => t.id === id);
    if (i >= 0) S.tasks[i] = { ...S.tasks[i], ...(r || {}), ...patch };
    app.neuZeichnen();
  }
  async function tagSetzen(task, tag) {
    tag = tag || null;
    if ((task.tag || null) === tag) return false;
    const r = await guard(() => DB.saveTask({ id: task.id, tag }));
    if (!r) return false;
    uebernehmen(task.id, { tag }, r);
    toast(`„${task.titel}“ ${tag ? 'liegt jetzt auf ' + tagLang(tag) : 'hat keinen Tag mehr'}`);
    return true;
  }
  async function zuweisen(task, wer) {
    wer = wer || null;
    if ((task.zugewiesen_an || null) === wer) return false;
    const r = await guard(() => DB.saveTask({ id: task.id, zugewiesen_an: wer }));
    if (!r) return false;
    uebernehmen(task.id, { zugewiesen_an: wer }, r);
    toast(`„${task.titel}“ ${wer ? 'zugewiesen an ' + (wer === app.S.ich.id ? 'dich' : personName(wer)) : 'ist jetzt niemandem zugewiesen'}`);
    return true;
  }

  /* ---------- Menü am Knopf (Popover, Pfeiltasten, Esc, Fokus zurück) ---------- */
  let offen = null;
  const popoverDa = typeof HTMLElement.prototype.showPopover === 'function';
  function menueZu() { if (offen) offen.hidePopover(); }
  /* Ergebnis: {wert} bei Auswahl, undefined bei Abbruch, null wenn der Browser kein Popover kann. */
  function menue(knopf, titel, eintraege) {
    if (!popoverDa) return Promise.resolve(null);
    menueZu();
    return new Promise(fertig => {
      const m = document.createElement('div');
      m.className = 'menue';
      m.setAttribute('popover', '');
      m.setAttribute('role', 'menu');
      m.setAttribute('aria-label', titel);
      m.innerHTML = eintraege.map((e, i) => e.trenner ? '<hr role="separator">'
        : `<button type="button" role="menuitemradio" tabindex="-1" aria-checked="${!!e.aktiv}" data-i="${i}"><svg class="menue-haken" aria-hidden="true"><use href="#i-check"/></svg><span class="menue-text">${esc(e.text)}</span>${e.hinweis ? `<span class="menue-hinweis">${esc(e.hinweis)}</span>` : ''}</button>`).join('');
      document.body.appendChild(m);
      let wert;
      const punkte = () => [...m.querySelectorAll('[role=menuitemradio]')];
      m.addEventListener('click', e => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        wert = { wert: eintraege[+b.dataset.i].wert };
        m.hidePopover();
      });
      m.addEventListener('keydown', e => {
        if (e.key !== 'Tab') e.stopPropagation(); // keine globalen Kürzel (N, F, ⌘K) bei offenem Menü
        const liste = punkte(), i = liste.indexOf(document.activeElement);
        let ziel = null;
        if (e.key === 'ArrowDown') ziel = liste[(i + 1) % liste.length];
        else if (e.key === 'ArrowUp') ziel = liste[(i - 1 + liste.length) % liste.length];
        else if (e.key === 'Home') ziel = liste[0];
        else if (e.key === 'End') ziel = liste[liste.length - 1];
        else if (e.key === 'Tab') { e.preventDefault(); m.hidePopover(); return; }
        if (ziel) { e.preventDefault(); ziel.focus(); }
      });
      m.addEventListener('toggle', e => {
        if (e.newState !== 'closed') return;
        knopf.setAttribute('aria-expanded', 'false');
        m.remove();
        if (offen === m) { // nur zurückfokussieren, wenn nicht schon ein neues Menü offen ist
          offen = null;
          if (knopf.isConnected) knopf.focus({ preventScroll: true });
          else { const main = document.getElementById('main'); if (main) main.focus({ preventScroll: true }); }
        }
        fertig(wert);
      });
      m.showPopover();
      offen = m;
      knopf.setAttribute('aria-expanded', 'true');
      // am Knopf ausrichten, im Fenster halten
      const r = knopf.getBoundingClientRect(), b = m.offsetWidth, h = m.offsetHeight;
      const rand = 8, vw = document.documentElement.clientWidth, vh = window.innerHeight;
      let left = Math.min(Math.max(rand, r.right - b), vw - b - rand);
      let top = r.bottom + 4;
      if (top + h > vh - rand) top = Math.max(rand, r.top - h - 4);
      m.style.left = left + 'px'; m.style.top = top + 'px';
      (punkte().find(x => x.getAttribute('aria-checked') === 'true') || punkte()[0]).focus({ preventScroll: true });
    });
  }

  /* Tag-Menü: Heute, Morgen, die übergebenen Wochentage, Kein Tag. */
  async function tagMenue(knopf, task, tage) {
    const heute = L.isoTag(new Date()), morgen = plusTage(heute, 1), jetzt = task.tag || null;
    const eintraege = [
      { wert: heute, text: 'Heute', hinweis: tagText(heute), aktiv: jetzt === heute },
      { wert: morgen, text: 'Morgen', hinweis: tagText(morgen), aktiv: jetzt === morgen },
      { trenner: true },
      ...tage.filter(d => d !== heute && d !== morgen).map(d => ({ wert: d, text: datum(d).toLocaleDateString('de-DE', { weekday: 'long' }), hinweis: datum(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }), aktiv: jetzt === d })),
      { trenner: true },
      { wert: null, text: 'Kein Tag', aktiv: !jetzt }
    ];
    const r = await menue(knopf, 'Tag für „' + task.titel + '“', eintraege);
    if (r === null) { LW.dialoge.aufgabe(task); return false; } // ohne Popover: Tag im Aufgaben-Dialog setzen
    if (r) return tagSetzen(task, r.wert);
    return false;
  }

  /* Zuweisen-Menü (nur geteilte Quests): Ich, die andere Person, Niemand. */
  async function personMenue(knopf, task) {
    const S = app.S, jetzt = task.zugewiesen_an || null;
    const personen = S.profile.slice().sort((a, b) => (a.id === S.ich.id ? -1 : b.id === S.ich.id ? 1 : 0));
    const eintraege = personen.map(p => ({ wert: p.id, text: p.id === S.ich.id ? 'Ich' : p.name, aktiv: jetzt === p.id }))
      .concat([{ trenner: true }, { wert: null, text: 'Niemand', aktiv: !jetzt }]);
    const r = await menue(knopf, 'Zuweisen: „' + task.titel + '“', eintraege);
    if (r === null) { LW.dialoge.aufgabe(task); return false; }
    if (r) return zuweisen(task, r.wert);
    return false;
  }

  /* Neu zeichnen, ohne Fokus und Scroll zu verlieren: merkt Zeile (data-id) und Knopf (data-aktion + data-wert). */
  function neuZeichnenMitFokus(main, zeichnen) {
    const a = document.activeElement;
    const drin = a && a !== main && main.contains(a);
    const li = drin && a.closest('[data-id]');
    const merk = drin ? { id: li && li.dataset.id, aktion: a.dataset.aktion, wert: a.dataset.wert } : null;
    const y = window.scrollY;
    zeichnen();
    window.scrollTo(0, y);
    if (!merk) return;
    const sel = (merk.aktion ? `[data-aktion="${CSS.escape(merk.aktion)}"]` : '') + (merk.wert != null ? `[data-wert="${CSS.escape(merk.wert)}"]` : '');
    let ziel = null;
    if (merk.id) {
      const z = main.querySelector(`[data-id="${CSS.escape(merk.id)}"]`);
      if (z) ziel = (sel && z.querySelector(sel)) || z.querySelector('button');
    } else if (sel) ziel = main.querySelector(sel);
    if (ziel) ziel.focus({ preventScroll: true });
    else if (drin) main.focus({ preventScroll: true });
  }

  window.LW.aufgaben = { zeile, tagSetzen, zuweisen, tagMenue, personMenue, tagText, tagLang, plusTage, personName, neuZeichnenMitFokus, menueZu };
})();
