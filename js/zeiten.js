/* Zeiteinträge: Timer sicher stoppen und der Zeit-Dialog (bearbeiten, nachtragen, Endzeit korrigieren).
   LW.zeiten.timerStoppen() -> 'gestoppt' | 'anderswo' | 'nichts' | false (Fehler, Toast gezeigt)
   LW.zeiten.dialog(zeit?, vorgaben?)  vorgaben: {task_id, quest_id, datum, ende}
   Abgerechnete Einträge (rechnung_id) sind gesperrt: kein Bearbeiten, kein Löschen. */
window.LW = window.LW || {};
(function () {
  const { esc, toast, openDlg, closeDlg, confirmDlg, fehlerText } = window.LW.ui;
  const DB = window.LW.db, L = window.LW.logic;
  const app = window.LW.app = window.LW.app || {};
  const MSG_GESPERRT = 'Diese Zeit ist abgerechnet und gesperrt.';

  const p2 = n => (n < 10 ? '0' : '') + n;
  const uhrzeit = d => p2(d.getHours()) + ':' + p2(d.getMinutes());
  function ausFeldern(tag, zeit) { // lokales Datum + 'HH:MM' -> Date (oder null)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tag || '') || !/^\d{2}:\d{2}/.test(zeit || '')) return null;
    const [y, m, d] = tag.split('-').map(Number), [h, mi] = zeit.split(':').map(Number);
    return new Date(y, m - 1, d, h, mi);
  }
  const gesperrt = z => !!(z && z.rechnung_id);

  /* Entwurf: übersteht Esc, Klick daneben und Neuladen. Ein Platz; weg nach Speichern, Abbrechen, Löschen. */
  const ENTWURF = 'lw-entwurf-zeit';
  const FELDER = ['aufgabe', 'tag', 'von', 'bis', 'bistag', 'notiz'];
  function entwurf(schluessel, wert) {
    try {
      if (wert === undefined) { const e = JSON.parse(localStorage.getItem(ENTWURF) || 'null'); return e && e.k === schluessel ? e : null; }
      if (wert) localStorage.setItem(ENTWURF, JSON.stringify(wert)); else localStorage.removeItem(ENTWURF);
    } catch (x) { return null; }
  }
  function ersetzen(liste, obj) {
    const i = liste.findIndex(x => x.id === obj.id);
    if (i < 0) liste.push(obj); else liste[i] = { ...liste[i], ...obj };
  }

  /* ---------- Timer stoppen ----------
     Prüft vorher, ob der Eintrag noch läuft: ein zweites Stoppen würde sein Ende überschreiben
     (z. B. wenn er auf einem anderen Gerät schon gestoppt wurde). */
  let stoppt = null;
  function timerStoppen() {
    if (!stoppt) stoppt = stoppen().finally(() => { stoppt = null; });
    return stoppt;
  }
  async function stoppen() {
    const S = app.S, z = S.laufend;
    if (!z) return 'nichts';
    try {
      const aktuell = await DB.laufend();
      if (!aktuell || aktuell.id !== z.id) {
        S.laufend = aktuell;
        app.rahmen();
        toast('Timer wurde auf einem anderen Gerät gestoppt.');
        app.abgleichen();
        return 'anderswo';
      }
      const r = await DB.stoppeTimer(z.id);
      S.laufend = null;
      if (r) ersetzen(S.zeitenHeute, r);
      app.rahmen();
      app.abgleichen(); // heutige Zeiten frisch holen; Chip, Seitenleiste und Heute ziehen nach
      return 'gestoppt';
    } catch (e) {
      console.error(e);
      toast(fehlerText(e), true);
      return false;
    }
  }

  /* ---------- Zeit-Dialog ---------- */
  function dialog(zeit, vorgaben) {
    vorgaben = vorgaben || {};
    const S = app.S, neu = !zeit;
    if (gesperrt(zeit)) { toast(MSG_GESPERRT + ' Zum Ändern zuerst die Rechnung in Mediawo OS stornieren.', true); return; }
    const laeuft = !!zeit && !zeit.ende;
    const korrektur = laeuft && !!vorgaben.ende;
    const heute = L.isoTag(new Date());

    // Vorgaben für Datum / Von / Bis
    let start, ende;
    if (zeit) {
      start = new Date(zeit.start);
      ende = new Date(vorgaben.ende || zeit.ende || Date.now());
    } else {
      const jetzt = new Date();
      const tag = vorgaben.datum || heute;
      ende = ausFeldern(tag, uhrzeit(jetzt));
      start = new Date(ende.getTime() - 30 * 60000);
      if (L.isoTag(start) !== tag) start = ausFeldern(tag, '00:00');
      if (ende <= start) ende = ausFeldern(tag, '00:30');
    }
    const startTag = L.isoTag(start), endeTag = L.isoTag(ende);

    // Aufgaben nach Quest gruppiert; „Ohne Aufgabe“ bucht nur auf die Quest
    const quests = S.quests.filter(q => !q.archiviert || (zeit && q.id === zeit.quest_id))
      .sort((a, b) => (a.sortierung || 0) - (b.sortierung || 0));
    if (!quests.length) { toast('Lege zuerst eine Quest an, dann kannst du Zeit nachtragen.'); return; }
    const gewaehlt = zeit ? (zeit.task_id || 'q:' + zeit.quest_id)
      : vorgaben.task_id || (vorgaben.quest_id ? 'q:' + vorgaben.quest_id : null);
    const sichtbar = t => !t.archiviert && (!t.erledigt_am || t.id === gewaehlt || L.isoTag(new Date(t.erledigt_am)) === heute);
    const gruppen = quests.map(q => ({ q, tasks: S.tasks.filter(t => t.quest_id === q.id && (sichtbar(t) || t.id === gewaehlt)) }));
    const erste = (gruppen.find(g => g.tasks.length) || { tasks: [] }).tasks[0];
    /* Bisherige Zuordnung, die hier nicht als Option vorkommt (z. B. Aufgabe auf dem anderen Gerät
       angelegt und hier noch nicht geladen): unverändert als eigene Option anbieten und vorwählen,
       sonst würde der Browser still die erste Option wählen und der Eintrag würde umgebucht. */
    const angeboten = v => gruppen.some(g => 'q:' + g.q.id === v || g.tasks.some(t => t.id === v));
    const fremdQuest = zeit ? zeit.quest_id : vorgaben.quest_id;
    let fremd = null;
    if (gewaehlt && !angeboten(gewaehlt) && fremdQuest) {
      const quest = S.quests.find(q => q.id === fremdQuest) || null;
      const taskId = gewaehlt.startsWith('q:') ? null : gewaehlt;
      const task = taskId ? S.tasks.find(t => t.id === taskId) || null : null;
      const text = taskId ? (task ? task.titel : 'Aufgabe auf anderem Gerät angelegt') : (quest ? quest.name : 'Bisherige Quest') + ' – ohne Aufgabe';
      fremd = { wert: gewaehlt, quest, questId: fremdQuest, taskId, task, text: text + (quest && taskId ? ' (' + quest.name + ')' : '') };
    }
    const wert = gewaehlt && (fremd || angeboten(gewaehlt)) ? gewaehlt : (erste ? erste.id : 'q:' + quests[0].id);
    const opt = (v, text) => `<option value="${esc(v)}"${v === wert ? ' selected' : ''}>${esc(text)}</option>`;
    const optionen = (fremd ? `<optgroup label="Bisherige Zuordnung">${opt(fremd.wert, fremd.text)}</optgroup>` : '') +
      gruppen.map(g => `<optgroup label="${esc(g.q.name)}">${g.tasks.map(t => opt(t.id, t.titel)).join('')}${opt('q:' + g.q.id, g.q.name + ' – ohne Aufgabe')}</optgroup>`).join('');

    const titel = korrektur ? 'Endzeit korrigieren' : neu ? 'Zeit nachtragen' : 'Zeit bearbeiten';
    const sub = korrektur ? 'Der Timer läuft seit über 12 Stunden. Trag ein, wann du aufgehört hast.'
      : neu ? 'Zeit vergessen zu starten? Hier nachtragen.' : '';
    const knopf = korrektur ? 'Endzeit speichern' : neu ? 'Zeit nachtragen' : 'Zeit speichern';

    const d = openDlg(`<form class="dlg" novalidate>
      <h2>${titel}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}
      <div class="stack">
        <p class="meldung ok entwurf" data-entwurf hidden>Entwurf wiederhergestellt. <button type="button" class="btn link small" data-verwerfen>Entwurf verwerfen</button></p>
        <label class="f">Aufgabe<select name="aufgabe">${optionen}</select></label>
        <label class="f">Datum<input type="date" name="tag" value="${startTag}" required></label>
        <div class="feld-reihe immer">
          <label class="f">Von<input type="time" name="von" value="${uhrzeit(start)}" required></label>
          <label class="f">Bis<input type="time" name="bis" value="${uhrzeit(ende)}" required></label>
        </div>
        <label class="f" data-bistag${endeTag !== startTag ? '' : ' hidden'}>Bis-Datum<input type="date" name="bistag" value="${endeTag}"></label>
        <p class="feld-fehler" data-zeitfehler role="alert"></p>
        <p class="dauer-anzeige" data-dauer aria-live="polite"></p>
        <label class="schalter" data-abr><input type="checkbox" role="switch" name="abrechenbar">
          <span class="schalter-text"><strong>Abrechenbar</strong><span class="sub" data-abr-text></span></span></label>
        <label class="f">Notiz (optional)<textarea name="notiz" rows="2" maxlength="500">${esc(zeit ? zeit.notiz || '' : '')}</textarea></label>
        <p class="meldung" role="alert" hidden></p>
      </div>
      <div class="aktionen">
        ${neu ? '' : '<div class="aktionen-links"><button type="button" class="btn ghost gefahr" data-loeschen>Löschen</button></div>'}
        <button type="button" class="btn" data-x>Abbrechen</button>
        <button type="submit" class="btn primary">${knopf}</button>
      </div></form>`);
    d.classList.add('seitlich');
    const f = d.querySelector('form');
    const schluessel = S.ich.id + ':' + (zeit ? zeit.id + (korrektur ? ':korrektur' : '') : 'neu');
    const alt = entwurf(schluessel);
    if (alt) {
      FELDER.forEach(n => {
        const el = f[n];
        if (alt[n] == null || (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === alt[n]))) return;
        el.value = alt[n];
      });
      if (alt.bistag && alt.bistag !== alt.tag) f.querySelector('[data-bistag]').hidden = false;
      f.querySelector('[data-entwurf]').hidden = false;
      f.querySelector('[data-verwerfen]').onclick = () => { entwurf(schluessel, null); dialog(zeit, vorgaben); };
    }
    const merken = () => { const e = { k: schluessel, abr: f.abrechenbar.checked }; FELDER.forEach(n => { e[n] = f[n].value; }); entwurf(schluessel, e); };
    f.addEventListener('input', merken);
    f.addEventListener('change', merken);
    d.querySelector('[data-x]').onclick = () => { entwurf(schluessel, null); closeDlg(); };

    /* Auswahl -> Quest, Aufgabe, Abrechenbar-Vorgabe */
    const auswahl = () => {
      const v = f.aufgabe.value;
      if (fremd && v === fremd.wert) return { quest: fremd.quest, task: fremd.task, fremd: true };
      if (v.startsWith('q:')) return { quest: quests.find(q => q.id === v.slice(2)), task: null };
      const task = S.tasks.find(t => t.id === v);
      return { quest: quests.find(q => q.id === task.quest_id), task };
    };
    const kundeName = id => (S.kunden.find(k => k.id === id) || {}).name;
    let abrGeaendert = !neu; // bestehender Eintrag: gespeicherten Wert behalten, bis die Aufgabe wechselt
    const abrZeigen = () => {
      const { quest, task } = auswahl();
      const box = f.querySelector('[data-abr]');
      box.hidden = !(quest && quest.firma); // unbekannte Quest: Wert des Eintrags bleibt unverändert
      const kid = fremd && f.aufgabe.value === fremd.wert ? (zeit ? zeit.kunde_id : task && task.kunde_id) || null : task ? task.kunde_id : null;
      f.querySelector('[data-abr-text]').textContent = kid ? 'Kunde: ' + (kundeName(kid) || 'nicht mehr aktiv') : 'Ohne Kunde – standardmäßig nicht abrechenbar';
      if (!abrGeaendert) f.abrechenbar.checked = !!(quest && quest.firma && kid);
    };
    if (zeit) f.abrechenbar.checked = !!zeit.abrechenbar;
    if (alt && typeof alt.abr === 'boolean') { f.abrechenbar.checked = alt.abr; abrGeaendert = true; }
    abrZeigen();
    f.aufgabe.onchange = () => { abrGeaendert = false; abrZeigen(); };
    f.abrechenbar.onchange = () => { abrGeaendert = true; };

    /* Von/Bis: Prüfung beim Verlassen des Feldes, Fehler verschwindet, sobald es passt */
    const fehlerEl = f.querySelector('[data-zeitfehler]'), dauerEl = f.querySelector('[data-dauer]');
    const bisTagBox = f.querySelector('[data-bistag]');
    let tagAnfang = startTag;
    const bereich = () => {
      const s = ausFeldern(f.tag.value, f.von.value);
      const e = ausFeldern(bisTagBox.hidden ? f.tag.value : f.bistag.value, f.bis.value);
      if (!s || !e) return { fehler: 'Bitte Datum, Von und Bis eintragen.', feld: !f.tag.value ? f.tag : !f.von.value ? f.von : f.bis };
      if (e <= s) return { fehler: 'Bis muss nach Von liegen. Bitte die Uhrzeiten prüfen.', feld: f.bis };
      return { s, e };
    };
    const markieren = feld => [f.tag, f.von, f.bis, f.bistag].forEach(i => { if (i === feld) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); });
    const pruefen = zeigen => {
      const b = bereich();
      dauerEl.textContent = b.fehler ? '' : 'Dauer ' + L.formatDauer(Math.round((b.e - b.s) / 1000));
      if (!b.fehler) { fehlerEl.textContent = ''; markieren(null); }
      else if (zeigen) { fehlerEl.textContent = b.fehler; markieren(b.feld); }
      return b;
    };
    pruefen(false);
    [f.tag, f.von, f.bis, f.bistag].forEach(i => {
      i.addEventListener('blur', () => pruefen(true));
      i.addEventListener('input', () => pruefen(false));
    });
    f.tag.addEventListener('change', () => { // Bis-Datum folgt dem Datum, solange es nicht eigens gebraucht wird
      if (bisTagBox.hidden || f.bistag.value === tagAnfang) f.bistag.value = f.tag.value;
      tagAnfang = f.tag.value;
      pruefen(false);
    });

    f.onsubmit = e => {
      e.preventDefault();
      const b = pruefen(true);
      if (b.fehler) { b.feld.focus(); return; }
      const sel = auswahl();
      // Unveränderte Zeiten behalten ihre Sekunden
      const startIso = zeit && uhrzeit(start) === f.von.value && startTag === f.tag.value ? zeit.start : b.s.toISOString();
      const endeIso = zeit && zeit.ende && !korrektur && uhrzeit(ende) === f.bis.value && endeTag === L.isoTag(b.e) ? zeit.ende : b.e.toISOString();
      const basis = { start: startIso, ende: endeIso, notiz: f.notiz.value.trim() || null };
      let daten;
      /* kunde_id nur schicken, wenn sich Quest oder Aufgabe ändern: sonst bliebe der beim Öffnen geladene
         (inzwischen vielleicht veraltete) Kunde stehen. Mit Aufgabe setzt die Datenbank den Kunden ohnehin
         selbst (lw_zeiten_kunde_von_aufgabe). */
      if (sel.fremd) { // bisherige Zuordnung unverändert lassen
        daten = {
          quest_id: fremd.questId, task_id: fremd.taskId,
          abrechenbar: fremd.quest ? !!fremd.quest.firma && f.abrechenbar.checked : !!(zeit && zeit.abrechenbar),
          ...basis
        };
        if (!zeit) daten.kunde_id = (fremd.task && fremd.task.kunde_id) || null;
      } else {
        const { quest, task } = sel;
        const gleicheAufgabe = zeit && (zeit.task_id || null) === (task ? task.id : null) && zeit.quest_id === quest.id;
        daten = {
          quest_id: quest.id, task_id: task ? task.id : null,
          abrechenbar: !!quest.firma && f.abrechenbar.checked,
          ...basis
        };
        if (!gleicheAufgabe) daten.kunde_id = quest.firma ? (task && task.kunde_id) || null : null;
      }
      LW.dialoge.senden(f, async () => {
        await DB.saveZeit(neu ? daten : { id: zeit.id, ...daten });
        entwurf(schluessel, null);
        if (laeuft && S.laufend && S.laufend.id === zeit.id) S.laufend = null;
        closeDlg();
        await app.abgleichen();
        toast(korrektur ? 'Endzeit gespeichert, Timer beendet' : neu ? 'Zeit nachgetragen' : 'Zeit gespeichert');
      });
    };
    if (neu) return d;

    d.querySelector('[data-loeschen]').onclick = async () => {
      const t = zeit.task_id && S.tasks.find(x => x.id === zeit.task_id);
      const q = S.quests.find(x => x.id === zeit.quest_id);
      const name = t ? t.titel : (q ? q.name : 'Ohne Aufgabe');
      const spanne = uhrzeit(start) + (zeit.ende ? '–' + uhrzeit(new Date(zeit.ende)) : ' (läuft)');
      const ok = await confirmDlg('Zeiteintrag löschen?', `„${esc(name)}“, ${esc(start.toLocaleDateString('de-DE'))} ${esc(spanne)}, ${esc(L.formatDauer(L.dauerSek(zeit, new Date())))}, wird gelöscht. Das lässt sich nicht rückgängig machen.`, 'Zeiteintrag löschen', true);
      if (!ok) return dialog(zeit, vorgaben);
      try {
        await DB.deleteZeit(zeit.id);
        entwurf(schluessel, null);
        if (S.laufend && S.laufend.id === zeit.id) S.laufend = null;
        S.zeitenHeute = S.zeitenHeute.filter(x => x.id !== zeit.id);
        await app.abgleichen();
        if (document.activeElement === document.body) document.getElementById('main').focus({ preventScroll: true });
        toast('Zeiteintrag gelöscht');
      } catch (err) { console.error(err); toast(fehlerText(err), true); }
    };
    return d;
  }

  window.LW.zeiten = { dialog, timerStoppen, gesperrt, uhrzeit };
})();
