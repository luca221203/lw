/* Rückblick: wohin ging die Zeit? Tag oder Woche, ‹ › zum Blättern.
   Oben die eigene Summe, je Quest ein Balken (aufklappbar: Ordner → Unterordner → Aufgabe, „Ohne Ordner“), bei
   Firma-Quests Gesamt vs. abrechenbar, Intern / Extern, je Kunde und je Person (beide), darunter die Einträge. Adresse: #rueckblick/tag/<tag> bzw. #rueckblick/woche/<montag>. */
window.LW = window.LW || {};
(function () {
  const { $, esc, farbe } = window.LW.ui;
  const DB = window.LW.db, L = window.LW.logic, A = window.LW.aufgaben;
  const app = window.LW.app = window.LW.app || {};
  const views = window.LW.views = window.LW.views || {};
  const icon = id => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;
  const heuteIso = () => L.isoTag(new Date());
  const datum = iso => { const p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const lang = (iso, o) => datum(iso).toLocaleDateString('de-DE', o);

  let main = null, modus = 'tag', anker = null, daten = null, ladeNr = 0;

  const bereich = () => modus === 'woche'
    ? (t => [t[0], t[6]])(L.wochenTage(anker))
    : [anker, anker];
  const pct = (a, b) => b > 0 ? Math.round(a / b * 100) + ' %' : '';
  const dauer = sek => L.formatDauer(sek);

  function personName(id) {
    const S = app.S, p = S.profile.find(x => x.id === id);
    const n = p && p.name ? p.name : 'Unbekannt';
    return id === S.ich.id ? n + ' (ich)' : n;
  }

  function titelZeile(von, bis) {
    const heute = heuteIso();
    if (modus === 'woche') {
      const diese = L.wochenTage(heute)[0] === von;
      return { label: diese ? 'Diese Woche' : 'KW ' + L.kalenderwoche(von),
        sub: `KW ${L.kalenderwoche(von)} · ${lang(von, { day: 'numeric', month: 'short' })} – ${lang(bis, { day: 'numeric', month: 'short', year: 'numeric' })}` };
    }
    return { label: von === heute ? 'Heute' : lang(von, { weekday: 'short', day: 'numeric', month: 'numeric' }),
      sub: lang(von, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) };
  }

  function bereitstellen() {
    const S = app.S, [von, bis] = bereich();
    if (!daten || daten.key !== von + bis) return null;
    const imBereich = z => { const t = L.isoTag(new Date(z.start)); return t >= von && t <= bis; };
    const liste = daten.liste.filter(imBereich);
    if (S.laufend && imBereich(S.laufend) && !liste.some(z => z.id === S.laufend.id)) liste.push(S.laufend);
    return liste;
  }

  /* ---------- Bausteine ---------- */
  function balken(anteil, q, hell) {
    const w = Math.max(0, Math.min(100, anteil * 100));
    return `<span class="rb-balken" aria-hidden="true"${q ? ` style="--q:${farbe(q)}"` : ''}><i style="width:${w.toFixed(1)}%"></i>${hell != null ? `<b style="width:${(Math.min(100, hell * 100)).toFixed(1)}%"></b>` : ''}</span>`;
  }

  /* Aufklappbarer Baum einer Quest: Ordner → Unterordner → Aufgabe, dazu „Ohne Ordner“.
     Ordner kommen aus e.ordner (nur mit Zeit, nach Zeit absteigend); Aufgaben liegen direkt in ihrem Ordner. */
  const taskZeile = t => `<li class="rb-t"><span class="rb-task">${esc(t.task ? t.task.titel : 'Ohne Aufgabe')}</span><span class="rb-zahl zahl">${dauer(t.sek)}</span></li>`;
  function ordnerZweig(titel, sek, inhalt) {
    return `<li><details class="rb-ordner" open><summary><span class="rb-pfeil" aria-hidden="true">${icon('i-rechts')}</span>
      <span class="rb-oname">${esc(titel)}</span><span class="rb-zahl zahl">${dauer(sek)}</span></summary>
      <ul class="rb-baum">${inhalt}</ul></details></li>`;
  }
  function questBaum(e) {
    if (!e.ordner || !e.ordner.length) return e.tasks.map(taskZeile).join('');
    const direkt = {}, ohne = [];
    const gezeigt = new Set();
    (function merke(knoten) { knoten.forEach(n => { gezeigt.add(n.ordner.id); merke(n.kinder); }); })(e.ordner);
    e.tasks.forEach(t => {
      const oid = t.task && t.task.ordner_id;
      if (oid && gezeigt.has(oid)) (direkt[oid] = direkt[oid] || []).push(t); else ohne.push(t);
    });
    const zweig = n => ordnerZweig(L.ordnerName(n.ordner, app.S.kunden), n.sek,
      n.kinder.map(zweig).join('') + (direkt[n.ordner.id] || []).map(taskZeile).join(''));
    const ohneSek = ohne.reduce((a, t) => a + t.sek, 0);
    return e.ordner.map(zweig).join('') + (ohne.length ? ordnerZweig('Ohne Ordner', ohneSek, ohne.map(taskZeile).join('')) : '');
  }

  function questBlock(e, gesamt) {
    const q = e.quest, a = gesamt ? e.sek / gesamt : 0;
    const tasks = questBaum(e);
    return `<li><details class="rb-quest">
      <summary><span class="rb-pfeil" aria-hidden="true">${icon('i-rechts')}</span>
        <span class="rb-name"><span class="dot" style="--q:${farbe(q.farbe)}"></span><span class="rb-text">${esc(q.name)}</span></span>
        ${balken(a, q.farbe)}
        <span class="rb-zahl zahl">${dauer(e.sek)}</span><span class="rb-pct zahl">${pct(e.sek, gesamt)}</span></summary>
      <ul class="rb-tasks">${tasks}</ul></details></li>`;
  }

  /* Intern / Extern: ein geteilter Balken. Zeit ohne Ordner oder ohne Aufgabe zählt als intern (Summe = Gesamt).
     Nur mit Ordnern (03_lw_ordner.sql ausgeführt) – vorher wäre alles „Intern 100 %“. */
  function bereichZeile(f) {
    const g = f.gesamtSek, i = f.internSek, x = f.externSek;
    const w = v => (g ? v / g * 100 : 0).toFixed(1);
    return `<div class="rb-bereich">
      <h3 id="rbBereich">Intern / Extern</h3>
      <div class="rb-bereich-zeile" role="group" aria-labelledby="rbBereich">
        <p class="rb-bereich-wert"><span class="rb-bereich-name">Intern</span><span class="zahl">${dauer(i)}</span><span class="rb-pct zahl">${pct(i, g)}</span></p>
        <span class="rb-geteilt" aria-hidden="true"><i style="width:${w(i)}%"></i><b style="width:${w(x)}%"></b></span>
        <p class="rb-bereich-wert rechts"><span class="rb-bereich-name">Extern</span><span class="zahl">${dauer(x)}</span><span class="rb-pct zahl">${pct(x, g)}</span></p>
      </div>
      <p class="rb-legende">Zeit ohne Ordner oder ohne Aufgabe zählt als intern.</p>
    </div>`;
  }

  function firmaBlock(f) {
    const ab = f.abrechenbarSek, nicht = f.gesamtSek - ab;
    const zeilen = (liste, name) => liste.map(x => {
      const a = f.gesamtSek ? x.sek / f.gesamtSek : 0, h = x.sek ? x.abrechenbarSek / x.sek : 0;
      return `<li><span class="rb-name"><span class="rb-text">${esc(name(x))}</span></span>
        ${balken(a, null, h)}
        <span class="rb-zahl zahl">${dauer(x.sek)}</span><span class="rb-pct zahl"${x.sek ? ` aria-label="${pct(x.abrechenbarSek, x.sek)} abrechenbar"` : ''}>${x.sek ? pct(x.abrechenbarSek, x.sek) : ''}</span></li>`;
    }).join('');
    return `<section class="rb-sektion" aria-labelledby="rbFirma">
      <h2 id="rbFirma">Firma</h2>
      <dl class="rb-kennzahlen">
        <div><dt>Gesamt</dt><dd class="zahl">${dauer(f.gesamtSek)}</dd></div>
        <div><dt>Abrechenbar</dt><dd class="zahl">${dauer(ab)}</dd></div>
        <div><dt>Anteil abrechenbar</dt><dd class="zahl">${f.gesamtSek ? pct(ab, f.gesamtSek) : '–'}</dd></div>
        <div><dt>Nicht abrechenbar</dt><dd class="zahl">${dauer(nicht)}</dd></div>
      </dl>
      ${f.gesamtSek && DB.ordnerVerfuegbar === true ? bereichZeile(f) : ''}
      ${f.gesamtSek ? `<div class="rb-zwei">
        <div><h3>Je Kunde</h3><p class="rb-legende">Balken: Gesamt, dunkel abrechenbar. Prozent: Anteil abrechenbar.</p><ul class="rb-liste">${zeilen(f.kunden, x => x.kunde ? x.kunde.name : 'Ohne Kunde')}</ul></div>
        <div><h3>Je Person</h3><ul class="rb-liste">${zeilen(f.personen, x => personName(x.user_id))}</ul></div>
      </div>` : '<p class="rb-leer">Keine Firma-Zeit in diesem Zeitraum.</p>'}
    </section>`;
  }

  function eintrag(z, jetzt) {
    const S = app.S, Z = LW.zeiten;
    const q = S.quests.find(x => x.id === z.quest_id), t = z.task_id && S.tasks.find(x => x.id === z.task_id);
    const s = Z.uhrzeit(new Date(z.start));
    const spanne = z.ende ? s + ' – ' + Z.uhrzeit(new Date(z.ende)) : s + ' – jetzt';
    const eigen = z.user_id === S.ich.id;
    const titel = t ? t.titel : (q ? q.name : 'Ohne Aufgabe');
    let rechts;
    if (Z.gesperrt(z)) rechts = `<span class="zeit-schloss tip-links" tabindex="0" role="img" aria-label="Abgerechnet, nicht mehr änderbar" data-tip="Abgerechnet, nicht mehr änderbar">${icon('i-lock')}</span>`;
    else if (!eigen || !z.ende) rechts = '<span class="zeit-platz" aria-hidden="true"></span>';
    else rechts = `<button class="btn icon small ghost tip-links" type="button" data-aktion="zeit" data-id="${esc(z.id)}" aria-label="Zeit ${esc(spanne)} bearbeiten" data-tip="Zeit bearbeiten">${icon('i-edit')}</button>`;
    return `<li class="zeit rb-eintrag${z.ende ? '' : ' laeuft-zeile'}">
      <span class="zeit-spanne zahl">${esc(spanne)}</span>
      <span class="zeit-meta"><span class="dot" style="--q:${farbe(q && q.farbe)}"></span><span class="rb-titel">${esc(titel)}</span>
        ${eigen ? '' : `<span class="tag">${esc(personName(z.user_id))}</span>`}
        ${q && q.firma && z.abrechenbar ? '<span class="zeit-abr">abrechenbar</span>' : ''}</span>
      <span class="zeit-dauer zahl">${dauer(L.dauerSek(z, jetzt))}</span>
      ${rechts}</li>`;
  }

  function eintraegeBlock(liste, jetzt) {
    const sichtbar = liste.filter(z => app.S.quests.some(q => q.id === z.quest_id)).sort((a, b) => b.start.localeCompare(a.start));
    if (!sichtbar.length) return '';
    let html;
    if (modus === 'woche') {
      const tage = [];
      sichtbar.forEach(z => {
        const d = L.isoTag(new Date(z.start));
        let g = tage.find(x => x.d === d);
        if (!g) tage.push(g = { d, l: [] });
        g.l.push(z);
      });
      html = tage.map(g => `<h3 class="rb-tag">${esc(lang(g.d, { weekday: 'long', day: 'numeric', month: 'long' }))}</h3><ul class="zeit-liste">${g.l.map(z => eintrag(z, jetzt)).join('')}</ul>`).join('');
    } else html = `<ul class="zeit-liste">${sichtbar.map(z => eintrag(z, jetzt)).join('')}</ul>`;
    return `<section class="rb-sektion" aria-labelledby="rbEintraege"><h2 id="rbEintraege">Einträge</h2>${html}</section>`;
  }

  /* ---------- Seite ---------- */
  function zeichnen() {
    const S = app.S, [von, bis] = bereich(), jetzt = new Date();
    const t = titelZeile(von, bis), heute = heuteIso();
    const aktuell = modus === 'woche' ? L.wochenTage(heute)[0] === von : von === heute;
    const alle = bereitstellen();
    let inhalt;
    if (!alle) {
      inhalt = '<div class="skelett" aria-hidden="true"><i></i><i></i><i></i></div>';
    } else {
      const eigene = alle.filter(z => z.user_id === S.ich.id);
      const r = L.rueckblick(eigene, S.quests, S.tasks, S.kunden, von, bis, jetzt, S.ordner || []);
      const fAlle = L.rueckblick(alle, S.quests, S.tasks, S.kunden, von, bis, jetzt, S.ordner || []).firma;
      const f = S.quests.some(q => q.firma) || fAlle.gesamtSek > 0 ? fAlle : null;
      const leer = !alle.some(z => S.quests.some(q => q.id === z.quest_id));
      if (leer) {
        inhalt = `<div class="leer"><strong>${modus === 'woche' ? 'In dieser Woche' : 'An diesem Tag'} ist noch keine Zeit erfasst.</strong><span>Starte in Heute einen Timer oder trage Zeit nach.</span></div>`;
      } else {
        inhalt = `${r.quests.length ? `<section class="rb-sektion" aria-labelledby="rbQuests"><h2 id="rbQuests">Nach Quest</h2><ul class="rb-liste rb-quests">${r.quests.map(e => questBlock(e, r.gesamtSek)).join('')}</ul></section>`
          : '<p class="rb-leer">Du hast in diesem Zeitraum selbst keine Zeit erfasst.</p>'}
          ${f ? firmaBlock(f) : ''}
          ${eintraegeBlock(alle, jetzt)}`;
      }
      t.summe = r.gesamtSek;
    }
    main.innerHTML = `<div class="seite rueckblick">
      <header class="kopf"><div><h1>Rückblick</h1>
        <p class="sub"><span class="rb-summe zahl">${esc(t.label)}${t.summe != null ? ' ' + esc(dauer(t.summe)) : ''}</span> · ${esc(t.sub)}</p></div>
        <div class="woche-steuerung">
          <div class="chips" role="group" aria-label="Zeitraum">
            <button class="chip" type="button" data-aktion="modus" data-wert="tag" aria-pressed="${modus === 'tag'}">Tag</button>
            <button class="chip" type="button" data-aktion="modus" data-wert="woche" aria-pressed="${modus === 'woche'}">Woche</button>
          </div>
          <div class="woche-nav" role="group" aria-label="Zeitraum wechseln">
            <button class="btn icon tip-links" type="button" data-aktion="zurueck" aria-label="${modus === 'woche' ? 'Vorige Woche' : 'Voriger Tag'}" data-tip="${modus === 'woche' ? 'Vorige Woche' : 'Voriger Tag'}">${icon('i-links')}</button>
            <button class="btn" type="button" data-aktion="heute"${aktuell ? ' aria-current="date"' : ''}>Heute</button>
            <button class="btn icon tip-links" type="button" data-aktion="vor" aria-label="${modus === 'woche' ? 'Nächste Woche' : 'Nächster Tag'}" data-tip="${modus === 'woche' ? 'Nächste Woche' : 'Nächster Tag'}">${icon('i-rechts')}</button>
          </div>
        </div>
      </header>
      ${inhalt}
    </div>`;
  }

  async function laden() {
    const [von, bis] = bereich(), key = von + bis, nr = ++ladeNr;
    try {
      const liste = await DB.zeiten(von, bis);
      if (!main || nr !== ladeNr) return;
      daten = { key, liste };
      A.neuZeichnenMitFokus(main, zeichnen);
    } catch (e) {
      console.warn('Rückblick nicht geladen', e);
      if (main && nr === ladeNr) {
        main.innerHTML = `<div class="seite"><div class="leer"><strong>Der Rückblick konnte nicht geladen werden.</strong><span>${esc(LW.ui.fehlerText(e))}</span><button class="btn" type="button" data-aktion="neu">Erneut laden</button></div></div>`;
      }
    }
  }

  function adresse() {
    const [von] = bereich(), heute = heuteIso();
    const aktuell = modus === 'woche' ? L.wochenTage(heute)[0] === von : von === heute;
    const param = modus === 'tag' && aktuell ? null : modus + '/' + von;
    app.S.param = param;
    history.replaceState(null, '', location.pathname + location.search + '#rueckblick' + (param ? '/' + param : ''));
  }
  function wechseln(neuModus, neuAnker) {
    modus = neuModus;
    anker = modus === 'woche' ? L.wochenTage(neuAnker)[0] : neuAnker;
    adresse();
    daten = null;
    A.neuZeichnenMitFokus(main, zeichnen);
    laden();
  }

  function klick(e) {
    const el = e.target.closest('[data-aktion]');
    if (!el) return;
    const schritt = modus === 'woche' ? 7 : 1;
    switch (el.dataset.aktion) {
      case 'zurueck': wechseln(modus, A.plusTage(anker, -schritt)); break;
      case 'vor': wechseln(modus, A.plusTage(anker, schritt)); break;
      case 'heute': wechseln(modus, heuteIso()); break;
      case 'modus': {
        if (el.dataset.wert === modus) break;
        const heute = heuteIso();
        // Woche -> Tag: heute, falls in dieser Woche, sonst der Montag
        const neu = el.dataset.wert === 'tag' && L.wochenTage(anker).includes(heute) ? heute : anker;
        wechseln(el.dataset.wert, neu);
        break;
      }
      case 'zeit': {
        const z = daten && daten.liste.find(x => x.id === el.dataset.id);
        if (z && z.ende && z.user_id === app.S.ich.id && !LW.zeiten.gesperrt(z)) LW.zeiten.dialog(z);
        break;
      }
      case 'neu': laden(); break;
    }
  }

  views.rueckblick = {
    titel: 'Rückblick',
    render(m, param) {
      main = m;
      const p = (param || '').split('/');
      modus = p[0] === 'woche' ? 'woche' : 'tag';
      const echt = iso => ISO.test(iso || '') && L.isoTag(datum(iso)) === iso;
      const roh = echt(p[1]) ? p[1] : heuteIso();
      anker = modus === 'woche' ? L.wochenTage(roh)[0] : roh;
      daten = null;
      zeichnen();
      main.onclick = klick;
      laden();
    },
    /* Daten geändert (Zeit gespeichert, Timer, Tab zurück): Einträge neu holen. */
    aktualisieren() {
      if (!main) return;
      A.neuZeichnenMitFokus(main, zeichnen);
      laden();
    },
    destroy() { main = null; daten = null; }
  };
})();
