/* Ordner in der Seitenleiste: Baum aus Quests und Ordnern, Auf-/Zuklappen, Menü am Eintrag, Ordner-Dialog.
   LW.ordner.seitenleiste()                        – #questListe neu zeichnen (Fokus bleibt erhalten)
   LW.ordner.dialog({quest, eltern, art, ordner?}) – Projekt/Ordner anlegen oder umbenennen, Kunde hinzufügen
   Zuklapp-Zustand pro Gerät in localStorage „lw-offen“ (Liste offener Ids). Nichts gemerkt:
   offen ist nur der Pfad zur Aufgabe mit dem laufenden Timer (L.offenStandard). */
window.LW = window.LW || {};
(function () {
  const { $, $$, esc, farbe, toast, openDlg, closeDlg, confirmDlg, fehlerText } = window.LW.ui;
  const DB = window.LW.db, L = window.LW.logic;
  const app = window.LW.app = window.LW.app || {};
  const S = () => app.S;
  const icon = id => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;
  const HINWEIS = 'Ordner sind noch nicht eingerichtet (03_lw_ordner.sql).';
  const ARCHIV = 'archiv:'; // Schlüssel der „Archiviert“-Gruppe je Quest: archiv:<questId>

  /* ---------- Zuklapp-Zustand ---------- */
  const SCHLUESSEL = 'lw-offen';
  function gemerkt() {
    try {
      const v = localStorage.getItem(SCHLUESSEL);
      if (v == null) return null;
      const a = JSON.parse(v);
      return Array.isArray(a) ? a : null;
    } catch (e) { return null; }
  }
  function offenSet() {
    const s = S(), g = gemerkt();
    return new Set(g || L.offenStandard(s.laufend, s.tasks, s.ordner || []));
  }
  function merken(set) {
    const s = S(), gibt = new Set([...s.quests.map(q => q.id), ...(s.ordner || []).map(o => o.id), ...s.quests.map(q => ARCHIV + q.id)]);
    try { localStorage.setItem(SCHLUESSEL, JSON.stringify([...set].filter(id => gibt.has(id)))); } catch (e) { /* privates Fenster */ }
  }

  /* ---------- Hilfen ---------- */
  const verfuegbar = () => DB.ordnerVerfuegbar !== false;   // Baum zeigen (unbekannt = noch nicht geladen, kein Hinweis)
  const anlegbar = () => DB.ordnerVerfuegbar === true;      // Anlegen erst, wenn sicher ist, dass es lw_ordner gibt
  const questVon = id => S().quests.find(q => q.id === id);
  const ordnerVon = id => (S().ordner || []).find(o => o.id === id);
  const name = o => L.ordnerName(o, S().kunden);
  const artText = (art, q) => art === 'projekt' ? (q && q.firma ? 'Projekt' : 'Ordner') : art === 'kunde' ? 'Kunden-Ordner' : 'Ordner';
  const leer = o => !(S().ordner || []).some(x => x.eltern_id === o.id) && !S().tasks.some(t => t.ordner_id === o.id);
  function pfadText(q, eltern) {
    const teile = [q.name].concat(eltern ? L.ordnerPfad(eltern.id, S().ordner).map(name) : []);
    return teile.join(' › ');
  }
  async function ordnerNeu() { S().ordner = await DB.ordner(); }
  function neuZeichnen() { app.rahmen(); app.neuZeichnen(); }
  function fokusAuf(k, teil) {
    const z = $(`#questListe [data-k="${CSS.escape(k)}"] > .b-zeile`);
    const el = z && (z.querySelector(teil || '.b-name') || z.querySelector('.b-name'));
    if (el) el.focus({ preventScroll: false });
    else $('#main').focus({ preventScroll: true });
  }
  /* Nach dem Schließen des Dialogs (sein Auslöser ist durch das Neuzeichnen ersetzt) Fokus auf die Zeile. */
  function nachDialog(k, teil) {
    const d = $('#dlg');
    if (d.open) d.addEventListener('close', () => setTimeout(() => fokusAuf(k, teil)), { once: true });
    else fokusAuf(k, teil);
  }

  /* ---------- Seitenleiste ---------- */
  let spaeter = false; // Neuzeichnen, sobald das offene Menü zu ist
  /* Angezeigte Quest / angezeigter Ordner: der Weg dorthin wird beim Hinnavigieren aufgeklappt (nur fürs
     Zeichnen, nicht in „lw-offen“ gemerkt). k = angezeigte Id, ids = dafür zusätzlich aufgeklappte Ids. */
  let auto = { k: null, ids: new Set() };
  // Ids, die offen sein müssen, damit die Zeile von k zu sehen ist (Quest, Ordnerpfad samt Ordner selbst,
  // bei archivierten die „Archiviert“-Gruppe). null: Ziel (noch) nicht geladen.
  function wegZu(view, k) {
    if (view === 'quest') return questVon(k) ? [k] : null;
    const o = ordnerVon(k);
    if (!o) return null;
    const pfad = L.ordnerPfad(o.id, S().ordner || []);
    const ids = [o.quest_id].concat(pfad.map(x => x.id));
    if (pfad.some(x => x.archiviert)) ids.push(ARCHIV + o.quest_id);
    return ids;
  }
  function seitenleiste() {
    const ul = $('#questListe');
    if (!ul) return;
    const s = S();
    if (!s.ich) { ul.innerHTML = ''; return; }
    if (document.querySelector('.menue.b-menue') || ul.querySelector('.b-umbenennen')) { spaeter = true; return; }
    spaeter = false;
    // Fokus merken (Zeile + Teil), damit Neuzeichnen ihn nicht verliert
    const a = document.activeElement, drin = a && ul.contains(a);
    const merk = drin ? { k: a.closest('[data-k]').dataset.k, teil: a.classList.contains('b-mehr') ? '.b-mehr' : '.b-name' } : null;

    const sekQ = app.stundenHeute();
    const heute = L.isoTag(new Date());
    const mitOrdner = verfuegbar();
    const sekO = mitOrdner ? L.summeProOrdner(app.eigeneHeute(), s.tasks, s.ordner || [], heute, heute, new Date()) : {};
    const offen = offenSet();
    const aktuell = (s.view === 'quest' || s.view === 'ordner') ? s.param : null;
    let scrollen = false;
    if (aktuell !== auto.k) {
      const weg = aktuell ? wegZu(s.view, aktuell) : [];
      if (weg) { // sonst beim nächsten Zeichnen erneut versuchen (Daten noch nicht da)
        auto = { k: aktuell, ids: new Set(weg.filter(id => !offen.has(id))) };
        scrollen = !!aktuell;
      }
    }
    auto.ids.forEach(id => offen.add(id));
    const qs = s.quests.filter(q => !q.archiviert).sort((x, y) => (x.sortierung || 0) - (y.sortierung || 0));

    const zeile = (k, tiefe, opt) => {
      const auf = offen.has(k);
      const kinder = opt.kinder || '';
      const titel = esc(opt.name);
      const knopf = kinder
        ? `<button class="b-auf tip-start" type="button" tabindex="-1" aria-expanded="${auf}" aria-controls="bk-${esc(k)}" aria-label="Unterordner von ${titel}" data-tip="Auf- oder zuklappen">${icon('i-rechts')}</button>`
        : '<span class="b-auf" aria-hidden="true"></span>';
      const std = opt.sek ? `<span class="std">${L.formatDauer(opt.sek)}</span>` : '';
      const kopf = opt.href
        ? `<a class="b-name" href="${esc(opt.href)}" title="${esc(opt.titel || opt.name)}"${k === aktuell ? ' aria-current="page"' : ''}>${opt.dot || ''}<span class="name">${titel}</span>${std}</a>`
        : `<button class="b-name" type="button" aria-expanded="${auf}" aria-controls="bk-${esc(k)}"><span class="name">${titel}</span></button>`;
      const mehr = opt.menue
        ? `<button class="b-mehr tip-links" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Aktionen für ${titel}" data-tip="Aktionen öffnen">${icon('i-mehr')}</button>`
        : '';
      return `<li data-k="${esc(k)}" class="b${opt.klasse ? ' ' + opt.klasse : ''}">
        <div class="b-zeile" style="--t:${tiefe}">${knopf}${kopf}${mehr}</div>
        ${kinder ? `<ul class="b-kinder" id="bk-${esc(k)}"${auf ? '' : ' hidden'}>${kinder}</ul>` : ''}</li>`;
    };
    const ast = (knoten, tiefe) => knoten.map(n => zeile(n.ordner.id, tiefe, {
      name: name(n.ordner), titel: n.ordner.archiviert ? L.ordnerPfad(n.ordner.id, s.ordner).map(name).join(' › ') : null,
      href: app.hashVon('ordner', n.ordner.id), sek: n.ordner.archiviert ? 0 : sekO[n.ordner.id],
      menue: true, kinder: ast(n.kinder, tiefe + 1)
    })).join('');

    const html = qs.map(q => {
      let kinder = '';
      if (mitOrdner) {
        kinder = ast(L.ordnerBaum(q.id, s.ordner || [], s.kunden), 1);
        // Archivierte: oberste archivierte Ordner (Eltern nicht archiviert) samt Unterordnern
        const alle = L.ordnerBaum(q.id, s.ordner || [], s.kunden, { archivierte: true });
        const arch = [];
        (function suchen(liste) { liste.forEach(n => { if (n.ordner.archiviert) arch.push(n); else suchen(n.kinder); }); })(alle);
        if (arch.length) kinder += zeile(ARCHIV + q.id, 1, { name: 'Archiviert', klasse: 'b-archiv', kinder: ast(arch, 2) });
      }
      return zeile(q.id, 0, {
        name: q.name, href: app.hashVon('quest', q.id), sek: sekQ[q.id], menue: true, kinder,
        dot: `<span class="dot" style="--q:${farbe(q.farbe)}" aria-hidden="true"></span>`
      });
    }).join('');
    ul.innerHTML = (html || '<li class="leer-zeile">Noch keine Quests.</li>') +
      (mitOrdner ? '' : `<li class="b-hinweis">${esc(HINWEIS)}</li>`);
    if (merk) fokusAuf(merk.k, merk.teil);
    if (scrollen) {
      const z = ul.querySelector(`[data-k="${CSS.escape(aktuell)}"] > .b-zeile`);
      if (z && z.offsetParent !== null) z.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  /* Auf-/Zuklappen ohne Neuzeichnen */
  function umschalten(li, auf) {
    const k = li.dataset.k, kinder = li.querySelector(':scope > .b-kinder');
    if (!kinder) return false;
    if (auf === undefined) auf = kinder.hidden;
    if (kinder.hidden !== auf) return false;
    kinder.hidden = !auf;
    li.querySelectorAll(':scope > .b-zeile [aria-expanded]:not(.b-mehr)').forEach(b => b.setAttribute('aria-expanded', String(auf)));
    const set = offenSet();
    if (auf) set.add(k); else { set.delete(k); auto.ids.delete(k); }
    merken(set);
    return true;
  }
  const sichtbareNamen = ul => $$('.b-name', ul).filter(el => el.offsetParent !== null);

  /* ---------- Menü am Eintrag ---------- */
  function eintraege(k) {
    const q = questVon(k);
    if (q) {
      const e = [{ wert: 'bearbeiten', text: 'Bearbeiten' }];
      if (anlegbar() && !q.firma) e.push({ wert: 'neu', text: 'Ordner anlegen' });
      return e;
    }
    const o = ordnerVon(k);
    if (!o) return [];
    const e = [];
    const elternArchiv = o.eltern_id && (ordnerVon(o.eltern_id) || {}).archiviert;
    if (o.art === 'intern') e.push({ wert: 'neu', text: 'Projekt anlegen' });
    if (o.art === 'extern') e.push({ wert: 'kunde', text: 'Kunde hinzufügen' });
    if (o.art === 'kunde' && !o.archiviert) e.push({ wert: 'neu', text: 'Projekt anlegen' });
    if (o.art === 'projekt') e.push({ wert: 'umbenennen', text: 'Umbenennen' });
    if (o.art === 'kunde' || o.art === 'projekt') {
      if (!o.archiviert) e.push({ wert: 'archivieren', text: 'Archivieren' });
      else if (!elternArchiv) e.push({ wert: 'wiederherstellen', text: 'Wiederherstellen' });
      if (leer(o)) e.push({ wert: 'loeschen', text: 'Löschen', gefahr: true });
    }
    return e;
  }

  async function menueOeffnen(knopf, k) {
    const q = questVon(k), o = ordnerVon(k);
    const titel = q ? q.name : o ? name(o) : '';
    const liste = eintraege(k);
    if (!liste.length) return;
    const p = window.LW.aufgaben.menue(knopf, 'Aktionen für „' + titel + '“', liste, { aktionen: true });
    const m = document.querySelector('.menue-aktionen:popover-open');
    if (m) m.classList.add('b-menue');
    const r = await p;
    if (spaeter) seitenleiste();
    if (r === null) { if (q) LW.dialoge.quest(q); return; } // Browser ohne Popover: wenigstens Bearbeiten
    if (!r) return;
    ausfuehren(r.wert, q, o);
  }

  function ausfuehren(wert, q, o) {
    if (q) {
      if (wert === 'bearbeiten') return LW.dialoge.quest(q);
      if (wert === 'neu') return dialog({ quest: q, eltern: null, art: 'projekt' });
      return;
    }
    const oq = questVon(o.quest_id);
    if (wert === 'neu') return dialog({ quest: oq, eltern: o, art: 'projekt' });
    if (wert === 'kunde') return dialog({ quest: oq, eltern: o, art: 'kunde' });
    if (wert === 'umbenennen') return umbenennen(o);
    if (wert === 'archivieren') return archivieren(o, true);
    if (wert === 'wiederherstellen') return archivieren(o, false);
    if (wert === 'loeschen') return loeschen(o);
  }

  async function archivieren(o, wert) {
    const n = name(o), q = questVon(o.quest_id);
    if (wert) {
      const unter = (S().ordner || []).some(x => x.eltern_id === o.id);
      const ok = await confirmDlg(`${artText(o.art, q)} archivieren?`,
        `„${esc(n)}“${unter ? ' und alles darin' : ''} verschwindet aus der Seitenleiste, die Aufgaben darin aus Heute, Woche und Backlog. Die Zeit bleibt im Rückblick. Zurückholen geht jederzeit unter „Archiviert“.`,
        `${artText(o.art, q)} archivieren`);
      if (!ok) return nachDialog(o.id, '.b-mehr');
    }
    try {
      await DB.saveOrdner({ id: o.id, archiviert: wert });
      await ordnerNeu();
    } catch (e) { console.error(e); toast(fehlerText(e), true); return; }
    const set = offenSet();
    if (wert) set.add(ARCHIV + o.quest_id); // damit der Ordner unter „Archiviert“ sichtbar bleibt
    else L.ordnerPfad(o.eltern_id, S().ordner).forEach(x => set.add(x.id));
    set.add(o.quest_id);
    merken(set);
    neuZeichnen();
    nachDialog(o.id, '.b-mehr');
    toast(`„${n}“ ${wert ? 'archiviert' : 'wiederhergestellt'}`);
  }

  async function loeschen(o) {
    const n = name(o), q = questVon(o.quest_id);
    const ok = await confirmDlg(`${artText(o.art, q)} löschen?`, `„${esc(n)}“ wird gelöscht. Das lässt sich nicht rückgängig machen.`, `${artText(o.art, q)} löschen`, true);
    if (!ok) return nachDialog(o.id, '.b-mehr');
    try {
      await DB.deleteOrdner(o.id);
      await ordnerNeu();
    } catch (e) { console.error(e); toast(fehlerText(e), true); return; }
    const s = S();
    if (s.view === 'ordner' && s.param === o.id) app.go('quest', o.quest_id);
    neuZeichnen();
    nachDialog(o.eltern_id || o.quest_id, '.b-name');
    toast(`„${n}“ gelöscht`);
  }

  /* ---------- Umbenennen direkt in der Zeile ----------
     Das Feld liegt genau über dem Namen (gleiche Box, nichts verschiebt sich). Enter/Verlassen speichert, Esc bricht ab. */
  function umbenennen(o) {
    const zeile = $(`#questListe [data-k="${CSS.escape(o.id)}"] > .b-zeile`);
    const link = zeile && zeile.querySelector('.b-name');
    if (!link) return;
    const input = document.createElement('input');
    input.className = 'b-umbenennen';
    input.value = o.name;
    input.maxLength = 80;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Neuer Name für „' + o.name + '“');
    Object.assign(input.style, { left: link.offsetLeft + 'px', top: link.offsetTop + 'px', width: link.offsetWidth + 'px', height: link.offsetHeight + 'px' });
    link.classList.add('b-verdeckt');
    zeile.appendChild(input);
    input.focus(); input.select();
    let fertig = false;
    const ende = async speichern => {
      if (fertig) return;
      const neu = input.value.trim();
      if (speichern && !neu) { input.setAttribute('aria-invalid', 'true'); toast('Bitte einen Namen eintragen, z. B. Website.'); input.focus(); return; }
      fertig = true;
      if (speichern && neu !== o.name) {
        try { await DB.saveOrdner({ id: o.id, name: neu }); await ordnerNeu(); }
        catch (e) {
          // Fehler sichtbar lassen, Feld mit der Eingabe offen halten: erneut versuchen (Enter) oder Esc
          console.error(e);
          toast(fehlerText(e), true);
          fertig = false;
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        input.remove(); link.classList.remove('b-verdeckt');
        neuZeichnen();
        fokusAuf(o.id, '.b-name');
        toast(`${artText(o.art, questVon(o.quest_id))} umbenannt`);
        return;
      }
      input.remove(); link.classList.remove('b-verdeckt');
      if (spaeter) seitenleiste();
      fokusAuf(o.id, '.b-name');
    };
    input.addEventListener('keydown', e => {
      e.stopPropagation(); // keine Baum-Tasten, kein Schließen der Handy-Leiste
      if (e.key === 'Enter') { e.preventDefault(); ende(true); }
      else if (e.key === 'Escape') { e.preventDefault(); ende(false); }
    });
    input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
    input.addEventListener('blur', () => { if (!fertig && input.value.trim()) ende(true); else if (!fertig) ende(false); });
  }

  /* ---------- Ordner-Dialog ---------- */
  /* art 'projekt': anlegen (ohne ordner) oder umbenennen (mit ordner). art 'kunde': Kunde hinzufügen
     (aktive Kunden ohne aktiven Ordner in dieser Quest; ein archivierter Ordner des Kunden wird zurückgeholt). */
  function dialog(opt) {
    const s = S(), q = opt.quest, eltern = opt.eltern || null, alt = opt.ordner || null, kunde = opt.art === 'kunde';
    if (!anlegbar()) { if (!verfuegbar()) toast(HINWEIS); return; }
    const was = artText(opt.art, q);
    const ort = pfadText(q, eltern);
    let felder, knopf, titel, kandidaten = [];
    if (kunde) {
      const inQuest = (s.ordner || []).filter(o => o.quest_id === q.id && o.art === 'kunde' && o.kunde_id != null);
      kandidaten = s.kunden.filter(k => !inQuest.some(o => o.kunde_id === k.id && !o.archiviert))
        .map(k => ({ k, archiv: inQuest.find(o => o.kunde_id === k.id && o.archiviert) }));
      titel = 'Kunde hinzufügen';
      knopf = 'Kunde hinzufügen';
      felder = kandidaten.length
        ? `<div class="f-gruppe">
            <label class="f">Kunde<select name="kunde" required>
              ${kandidaten.length > 1 ? '<option value="" selected disabled>Kunde wählen …</option>' : ''}
              ${kandidaten.map(c => `<option value="${esc(c.k.id)}">${esc(c.k.name)}${c.archiv ? ' (archiviert)' : ''}</option>`).join('')}
            </select></label>
            <p class="feld-fehler" role="alert"></p>
          </div>
          <p class="sub" data-archiv-hinweis hidden>Dieser Kunde hatte schon einen Ordner. Er wird mit seinen Projekten und Aufgaben zurückgeholt.</p>`
        : `<p class="meldung">${s.kunden.length ? 'Alle aktiven Kunden haben in dieser Quest schon einen Ordner.' : 'Keine aktiven Kunden gefunden. Kunden werden in Mediawo OS angelegt.'}</p>`;
    } else {
      titel = alt ? `${was} umbenennen` : was === 'Ordner' ? 'Neuer Ordner' : 'Neues Projekt';
      knopf = alt ? 'Umbenennen' : `${was} anlegen`;
      felder = `<div class="f-gruppe">
          <label class="f">Name<input name="oname" value="${esc(alt ? alt.name : '')}" maxlength="80" autocomplete="off" required></label>
          <p class="feld-fehler" role="alert"></p>
        </div>`;
    }
    const kannSenden = !kunde || kandidaten.length > 0;
    const d = openDlg(`<form class="dlg" novalidate>
      <h2>${esc(titel)}</h2>
      <p class="sub">${alt ? esc(pfadText(q, alt)) : 'In ' + esc(ort)}</p>
      <div class="stack">${felder}<p class="meldung" role="alert" hidden></p></div>
      <div class="aktionen">
        <button type="button" class="btn" data-x>${kannSenden ? 'Abbrechen' : 'Schließen'}</button>
        ${kannSenden ? `<button type="submit" class="btn primary">${esc(knopf)}</button>` : ''}
      </div></form>`);
    d.classList.add('seitlich'); // wie Quest- und Aufgaben-Dialog: von rechts, Seitenleiste bleibt sichtbar
    const f = d.querySelector('form');
    d.querySelector('[data-x]').onclick = closeDlg;
    if (!kannSenden) { f.onsubmit = e => { e.preventDefault(); closeDlg(); }; return d; }

    const feld = kunde ? f.kunde : f.oname;
    const fehlerEl = f.querySelector('.feld-fehler');
    const fehlerText1 = kunde ? 'Bitte einen Kunden wählen.' : 'Bitte einen Namen eintragen, z. B. Website.';
    const zeige = an => {
      fehlerEl.textContent = an ? fehlerText1 : '';
      if (an) feld.setAttribute('aria-invalid', 'true'); else feld.removeAttribute('aria-invalid');
    };
    const wert = () => (feld.value || '').trim();
    feld.addEventListener('blur', () => { if (feld.dataset.beruehrt && !wert()) zeige(true); });
    feld.addEventListener(kunde ? 'change' : 'input', () => { feld.dataset.beruehrt = '1'; if (wert()) zeige(false); });
    if (kunde) {
      const hinweis = f.querySelector('[data-archiv-hinweis]');
      const pruefen = () => { hinweis.hidden = !kandidaten.some(c => c.k.id === feld.value && c.archiv); };
      feld.addEventListener('change', pruefen);
      pruefen();
    }

    f.onsubmit = e => {
      e.preventDefault();
      if (!wert()) { zeige(true); feld.focus(); return; }
      LW.dialoge.senden(f, async () => {
        let r, meldungText;
        if (kunde) {
          const c = kandidaten.find(x => x.k.id === feld.value);
          if (c.archiv) { r = await DB.saveOrdner({ id: c.archiv.id, archiviert: false }); meldungText = `„${c.k.name}“ wiederhergestellt`; }
          else { r = await DB.saveOrdner({ quest_id: q.id, eltern_id: eltern.id, art: 'kunde', kunde_id: c.k.id }); meldungText = `„${c.k.name}“ hinzugefügt`; }
        } else if (alt) {
          if (wert() === alt.name) { closeDlg(); return; }
          r = await DB.saveOrdner({ id: alt.id, name: wert() });
          meldungText = `${was} umbenannt`;
        } else {
          const geschwister = (s.ordner || []).filter(o => o.quest_id === q.id && (o.eltern_id || null) === (eltern ? eltern.id : null));
          const sortierung = geschwister.reduce((m, o) => Math.max(m, o.sortierung || 0), 0) + 1;
          r = await DB.saveOrdner({ quest_id: q.id, eltern_id: eltern ? eltern.id : null, art: 'projekt', name: wert(), sortierung });
          meldungText = `${was} angelegt`;
        }
        await ordnerNeu();
        // Pfad zum neuen/geänderten Ordner aufklappen, damit er zu sehen ist
        const set = offenSet();
        set.add(q.id);
        L.ordnerPfad(r && r.id, S().ordner).forEach(o => { if (o.id !== r.id) set.add(o.id); });
        merken(set);
        closeDlg();
        neuZeichnen();
        nachDialog(r ? r.id : q.id, '.b-name');
        toast(meldungText);
      });
    };
    return d;
  }

  /* ---------- Ereignisse an der Liste ---------- */
  function verbinden() {
    const ul = $('#questListe');
    if (!ul || ul.dataset.baum) return;
    ul.dataset.baum = '1';
    ul.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || !ul.contains(b)) return;
      const li = b.closest('li[data-k]');
      if (b.classList.contains('b-mehr')) { e.preventDefault(); menueOeffnen(b, li.dataset.k); return; }
      if (b.classList.contains('b-auf') || b.classList.contains('b-name')) { e.preventDefault(); umschalten(li); }
    });
    ul.addEventListener('keydown', e => {
      const el = e.target;
      if (!el.classList || !el.classList.contains('b-name') || e.altKey || e.ctrlKey || e.metaKey) return;
      const li = el.closest('li[data-k]');
      const kinder = li.querySelector(':scope > .b-kinder');
      const liste = sichtbareNamen(ul), i = liste.indexOf(el);
      let ziel = null;
      if (e.key === ' ' && el.tagName === 'A') { e.preventDefault(); umschalten(li); return; } // Knopf: Leertaste klickt selbst
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (kinder && kinder.hidden) umschalten(li, true);
        else if (kinder) ziel = kinder.querySelector('.b-name');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (kinder && !kinder.hidden) umschalten(li, false);
        else { const eltern = li.parentElement.closest('li[data-k]'); if (eltern) ziel = eltern.querySelector(':scope > .b-zeile .b-name'); }
      } else if (e.key === 'ArrowDown') { e.preventDefault(); ziel = liste[i + 1]; }
      else if (e.key === 'ArrowUp') { e.preventDefault(); ziel = liste[i - 1]; }
      else if (e.key === 'Home') { e.preventDefault(); ziel = liste[0]; }
      else if (e.key === 'End') { e.preventDefault(); ziel = liste[liste.length - 1]; }
      else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        const m = li.querySelector(':scope > .b-zeile .b-mehr');
        if (m) { e.preventDefault(); menueOeffnen(m, li.dataset.k); }
        return;
      }
      if (ziel) ziel.focus();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', verbinden); else verbinden();

  window.LW.ordner = { seitenleiste, dialog, HINWEIS };
})();
