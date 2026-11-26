/* Ordner-Ansicht (#ordner/<id>) und Quest-Ansicht (#quest/<id>): eine Ansicht, zwei Einstiege.
   Kopf mit Pfad (Quest › Extern › Kunde), Zeit heute / diese Woche / gesamt (Ordner samt Unterordnern,
   alle Personen), offene Aufgaben nach Unterordner gruppiert, erledigte zugeklappt.
   „Aufgabe anlegen“ legt direkt in diesem Ordner an (Quest-Ansicht: ohne Ordner).
   Zeit „gesamt“ und „Woche“: einmal geladen (DB.zeiten über alle Tage, höchstens alle 60 s neu);
   heutige Einträge und der laufende Timer kommen immer frisch aus LW.app.S. */
window.LW = window.LW || {};
(function () {
  const { $, $$, esc, farbe, toast } = window.LW.ui;
  const DB = window.LW.db, L = window.LW.logic, A = window.LW.aufgaben;
  const app = window.LW.app = window.LW.app || {};
  const views = window.LW.views = window.LW.views || {};
  const icon = id => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;
  const heuteIso = () => L.isoTag(new Date());
  const ANFANG = '2000-01-01';
  const HINWEIS = 'Ordner sind noch nicht eingerichtet (03_lw_ordner.sql).';

  let main = null, istQuest = false, id = null, uhr = null, erledigtOffen = false, letzte = null;
  let cache = null, cacheAm = 0, laedt = null; // alle Zeiteinträge (für Woche/Gesamt)
  const taskById = tid => app.S.tasks.find(t => t.id === tid);
  const ordnerListe = () => app.S.ordner || [];
  const ordnerVon = oid => ordnerListe().find(o => o.id === oid);
  const name = o => L.ordnerName(o, app.S.kunden);
  const hash = (view, param) => app.hashVon(view, param);

  /* ---------- Zeit ---------- */
  function zeitenLaden() {
    if (cache && Date.now() - cacheAm < 60000) return Promise.resolve(cache);
    if (laedt) return laedt;
    laedt = DB.zeiten(ANFANG, heuteIso())
      .then(z => { cache = z; cacheAm = Date.now(); return z; })
      .catch(e => { console.warn('Zeiten nicht lesbar', e); return null; })
      .finally(() => { laedt = null; });
    return laedt;
  }
  /* Vergangene Tage aus dem Cache, heute (und der laufende Timer) frisch aus dem Zustand. */
  function zeitenJetzt() {
    const S = app.S, heute = heuteIso(), map = new Map();
    (cache || []).forEach(z => { if (L.isoTag(new Date(z.start)) < heute) map.set(z.id, z); });
    S.zeitenHeute.forEach(z => map.set(z.id, z));
    if (S.laufend) map.set(S.laufend.id, S.laufend);
    return [...map.values()];
  }
  function summe(zeiten, von, bis, jetzt) {
    const S = app.S;
    if (istQuest) return L.summeProQuest(zeiten, von, bis, jetzt)[id] || 0;
    return L.summeProOrdner(zeiten, S.tasks, ordnerListe(), von, bis, jetzt)[id] || 0;
  }
  function zeitZeigen() {
    if (!main) return;
    const heute = heuteIso(), woche = L.wochenTage(heute), jetzt = new Date(), z = zeitenJetzt();
    const werte = {
      heute: summe(z, heute, heute, jetzt),
      woche: cache ? summe(z, woche[0], woche[6], jetzt) : null,
      gesamt: cache ? summe(z, ANFANG, heute, jetzt) : null
    };
    $$('[data-zeit]', main).forEach(el => {
      const v = werte[el.dataset.zeit];
      el.textContent = v == null ? '–' : v ? L.formatDauer(v) : '0m';
    });
  }

  /* ---------- Daten der Ansicht ---------- */
  /* Ziel: { quest, ordner|null, archiviert } oder null, wenn es den Eintrag (für mich) nicht gibt. */
  function ziel() {
    const S = app.S;
    if (istQuest) {
      const q = S.quests.find(x => x.id === id);
      return q ? { quest: q, ordner: null, archiviert: !!q.archiviert } : null;
    }
    const o = ordnerVon(id);
    if (!o) return null;
    const q = S.quests.find(x => x.id === o.quest_id);
    if (!q) return null;
    const pfad = L.ordnerPfad(o.id, ordnerListe());
    return { quest: q, ordner: o, pfad, archiviert: q.archiviert || pfad.some(x => x.archiviert) };
  }

  /* Ordner unterhalb des Ziels in Baum-Reihenfolge (das Ziel selbst zuerst). */
  function bereichOrdner(z) {
    const S = app.S;
    const baum = L.ordnerBaum(z.quest.id, ordnerListe(), S.kunden, { archivierte: z.archiviert });
    const liste = [];
    const lauf = (knoten, drin) => knoten.forEach(n => {
      const jetztDrin = drin || (z.ordner && n.ordner.id === z.ordner.id);
      if (jetztDrin) liste.push(n.ordner);
      lauf(n.kinder, jetztDrin);
    });
    lauf(baum, !z.ordner);
    return liste;
  }

  /* Pfadtext eines Ordners relativ zum Ziel (ohne Quest und ohne die Ebenen über dem Ziel). */
  function relativ(o, z) {
    const pfad = L.ordnerPfad(o.id, ordnerListe());
    const ab = z.ordner ? pfad.findIndex(x => x.id === z.ordner.id) : -1;
    return pfad.slice(ab + 1).map(name).join(' › ');
  }

  /* ---------- Darstellung ---------- */
  function kopf(z) {
    const q = z.quest;
    const titel = z.ordner ? name(z.ordner) : q.name;
    const krumen = z.ordner
      ? [`<a href="${esc(hash('quest', q.id))}"><span class="dot" style="--q:${farbe(q.farbe)}" aria-hidden="true"></span>${esc(q.name)}</a>`]
        .concat(z.pfad.slice(0, -1).map(o => `<a href="${esc(hash('ordner', o.id))}">${esc(name(o))}</a>`))
      : [];
    const art = z.ordner
      ? ({ intern: 'Fester Ordner', extern: 'Fester Ordner', kunde: 'Kunden-Ordner', projekt: q.firma ? 'Projekt' : 'Ordner' })[z.ordner.art]
      : (q.firma ? 'Firma-Quest' : 'Quest');
    const kannNeu = !z.archiviert;
    return `${krumen.length ? `<nav class="pfad" aria-label="Pfad"><ol>${krumen.map(k => `<li>${k}</li>`).join('')}</ol></nav>` : ''}
      <header class="kopf"><div><h1>${z.ordner ? '' : `<span class="dot kopf-dot" style="--q:${farbe(q.farbe)}" aria-hidden="true"></span>`}${esc(titel)}</h1>
        <p class="sub">${esc(art)}${q.geteilt ? ' · geteilt' : ''}${z.archiviert ? ' · archiviert' : ''}</p></div>
        ${kannNeu ? `<button class="btn primary" type="button" data-aktion="neu" data-ordner="${esc(z.ordner ? z.ordner.id : '')}" aria-keyshortcuts="N">${icon('i-plus')}Aufgabe anlegen<kbd aria-hidden="true">N</kbd></button>` : ''}
      </header>
      <dl class="ordner-zeit" aria-label="Erfasste Zeit${q.geteilt ? ', alle Personen' : ''}">
        <div><dt>Heute</dt><dd class="zahl" data-zeit="heute">–</dd></div>
        <div><dt>Diese Woche</dt><dd class="zahl" data-zeit="woche">–</dd></div>
        <div><dt>Gesamt</dt><dd class="zahl" data-zeit="gesamt">–</dd></div>
      </dl>
      ${z.archiviert ? `<div class="banner info"><p>${z.ordner ? 'Dieser Ordner ist archiviert. Seine' : 'Diese Quest ist archiviert. Ihre'} Aufgaben erscheinen nicht in Heute, Woche und Backlog, die Zeit bleibt im Rückblick.</p></div>` : ''}`;
  }

  function gruppe(titel, gid, tasks, heute, z, mitKopf) {
    const opt = { heute, tagKnopf: 'text', personKnopf: true, ordner: false };
    const kopfHtml = mitKopf ? `<header class="qb-kopf">
        <h2 class="qb-name" id="og-${esc(gid || 'ohne')}">${esc(titel)}</h2>
        <span class="qb-meta">${tasks.length} offen</span>
        ${z.archiviert ? '' : `<span class="qb-aktionen"><button class="btn icon small ghost tip-links" type="button" data-aktion="neu" data-ordner="${esc(gid || '')}" aria-label="Aufgabe in ${esc(titel)} anlegen" data-tip="Aufgabe in ${esc(titel)} anlegen">${icon('i-plus')}</button></span>`}
      </header>` : '';
    return `<section class="qb og" style="--q:${farbe(z.quest.farbe)}"${mitKopf ? ` aria-labelledby="og-${esc(gid || 'ohne')}"` : ' aria-label="Offene Aufgaben"'}>
      ${kopfHtml}
      <ul class="aufgaben">${tasks.map(t => A.zeile(t, opt)).join('')}</ul>
    </section>`;
  }

  function zeichnen() {
    const S = app.S, z = ziel();
    if (!z) {
      document.title = (istQuest ? 'Quest' : 'Ordner') + ' · TM';
      main.innerHTML = `<div class="seite"><div class="leer"><strong>${istQuest ? 'Diese Quest' : 'Dieser Ordner'} wurde nicht gefunden</strong>
        <span>${!istQuest && DB.ordnerVerfuegbar === false ? esc(HINWEIS) : (istQuest ? 'Vielleicht wurde sie gelöscht, oder sie' : 'Vielleicht wurde er gelöscht, oder er') + ' ist nicht mit dir geteilt.'}</span>
        <a class="btn" href="${esc(hash('heute'))}">Heute öffnen</a></div></div>`;
      return;
    }
    const titel = z.ordner ? name(z.ordner) : z.quest.name;
    document.title = titel + ' · TM';
    const top = $('#topTitel'); if (top) top.textContent = titel;

    const heute = heuteIso();
    const ordner = bereichOrdner(z), ids = new Set(ordner.map(o => o.id));
    const drin = t => t.quest_id === z.quest.id && !t.archiviert &&
      (z.ordner ? ids.has(t.ordner_id) : (t.ordner_id == null || ids.has(t.ordner_id)));
    const sortiert = (a, b) => {
      if ((a.tag == null) !== (b.tag == null)) return a.tag == null ? 1 : -1;
      if (a.tag !== b.tag && a.tag != null) return a.tag < b.tag ? -1 : 1;
      return (a.sortierung || 0) - (b.sortierung || 0);
    };
    const offen = S.tasks.filter(t => drin(t) && !t.erledigt_am).sort(sortiert);
    const fertig = S.tasks.filter(t => drin(t) && t.erledigt_am).sort((a, b) => (b.erledigt_am || '').localeCompare(a.erledigt_am || ''));

    // Gruppen: Quest-Ansicht zuerst „Ohne Ordner“, dann jeder Ordner mit offenen Aufgaben
    const gruppen = [];
    if (!z.ordner) gruppen.push({ titel: 'Ohne Ordner', gid: null, tasks: offen.filter(t => t.ordner_id == null) });
    ordner.forEach(o => gruppen.push({ titel: z.ordner && o.id === z.ordner.id ? 'Direkt in ' + name(o) : relativ(o, z), gid: o.id, tasks: offen.filter(t => t.ordner_id === o.id) }));
    const voll = gruppen.filter(g => g.tasks.length);
    const nurDirekt = voll.length === 1 && voll[0].gid === (z.ordner ? z.ordner.id : null);

    let inhalt;
    if (!offen.length) {
      inhalt = z.archiviert
        ? `<div class="leer"><strong>Keine offenen Aufgaben</strong><span>${z.ordner ? 'Zum Weiterarbeiten den Ordner in der Seitenleiste unter „Archiviert“ wiederherstellen.' : 'Zum Weiterarbeiten die Quest im Backlog unter „Archiviert“ wiederherstellen.'}</span></div>`
        : `<div class="leer"><strong>Keine offenen Aufgaben in ${esc(titel)}</strong><span>${fertig.length ? 'Alles erledigt. ' : ''}Neue Aufgaben landen direkt hier.</span>
          <button class="btn primary" type="button" data-aktion="neu" data-ordner="${esc(z.ordner ? z.ordner.id : '')}">Aufgabe anlegen</button></div>`;
    } else {
      inhalt = `<div class="quest-bloecke">${voll.map(g => gruppe(g.titel, g.gid, g.tasks, heute, z, !nurDirekt)).join('')}</div>`;
    }
    const det = $('details.og-erledigt', main);
    if (det) erledigtOffen = det.open;
    const erledigt = fertig.length ? `<details class="archiv og-erledigt"${erledigtOffen ? ' open' : ''}>
        <summary><span>Erledigt</span><span class="muted zahl">${fertig.length}</span></summary>
        <ul class="aufgaben og-fertig">${fertig.map(t => A.zeile(t, { ordner: false, personKnopf: false })).join('')}</ul>
      </details>` : '';

    main.innerHTML = `<div class="seite ordner-seite">${kopf(z)}${inhalt}${erledigt}</div>`;
    zeitZeigen();
  }

  /* ---------- Ereignisse ---------- */
  function neu(ordnerId) {
    const z = ziel();
    if (!z || z.archiviert) return;
    LW.dialoge.aufgabe(null, { quest_id: z.quest.id, ordner_id: ordnerId || undefined });
  }
  function klick(e) {
    const el = e.target.closest('[data-aktion]');
    if (!el) return;
    const li = e.target.closest('.aufgabe');
    const t = li && taskById(li.dataset.id);
    switch (el.dataset.aktion) {
      case 'erledigt': if (t) app.erledigtUmschalten(t).then(ok => { if (ok) toast(t.erledigt_am ? `„${t.titel}“ wieder offen` : `„${t.titel}“ erledigt`); }); break;
      case 'fokus': if (t) app.fokusStarten(t); break;
      case 'bearbeiten': if (t) LW.dialoge.aufgabe(t); break;
      case 'tag': if (t) A.tagMenue(el, t, [0, 1, 2, 3, 4, 5, 6].map(n => A.plusTage(heuteIso(), n))); break;
      case 'zuweisen': if (t) A.personMenue(el, t); break;
      case 'neu': neu(el.dataset.ordner); break;
    }
  }

  function ansicht(quest) {
    return {
      titel: quest ? 'Quest' : 'Ordner',
      istQuest: quest,
      render(m, param) {
        main = m; istQuest = quest; id = param;
        const k = (quest ? 'q:' : 'o:') + param;
        if (k !== letzte) erledigtOffen = false; // „Erledigt“ bleibt nur im selben Ordner offen
        letzte = k;
        zeichnen();
        main.onclick = klick;
        // N: in diesem Ordner anlegen statt in der zuletzt gewählten Quest
        app.neueAufgabe = () => { const z = ziel(); if (z && !z.archiviert) neu(z.ordner && z.ordner.id); else standardNeu(); };
        zeitenLaden().then(() => zeitZeigen());
        uhr = setInterval(() => { if (app.S.laufend) zeitZeigen(); }, 30000);
      },
      aktualisieren() { if (main) A.neuZeichnenMitFokus(main, zeichnen); },
      destroy() {
        clearInterval(uhr); uhr = null;
        A.menueZu();
        if (main) { const d = $('details.og-erledigt', main); if (d) erledigtOffen = d.open; }
        app.neueAufgabe = standardNeu;
        main = null;
      }
    };
  }
  let standardNeu = () => {};
  // dialoge.js setzt app.neueAufgabe vor dieser Datei; hier merken, um es nach dem Verlassen zurückzusetzen
  standardNeu = app.neueAufgabe || standardNeu;

  views.ordner = ansicht(false);
  views.quest = ansicht(true);
})();
