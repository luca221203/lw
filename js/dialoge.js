/* Dialoge für Quests und Aufgaben: anlegen, bearbeiten, archivieren, löschen.
   LW.dialoge.quest(quest?, opt?)  opt: {hinweis, danach(quest)}
   LW.dialoge.aufgabe(task?, vorgaben?: {quest_id, tag})
   Nach dem Speichern wird der Zustand (LW.app.S) angepasst, dann Seitenleiste und Ansicht neu gezeichnet. */
window.LW = window.LW || {};
(function () {
  const { $, esc, toast, openDlg, closeDlg, confirmDlg, fehlerText } = window.LW.ui;
  const DB = window.LW.db, L = window.LW.logic;
  const app = window.LW.app = window.LW.app || {};
  const S = () => app.S;

  const FARBEN = [['#4F7CAC', 'Blau'], ['#4E9F6B', 'Grün'], ['#C2703D', 'Orange'], ['#8E6BBF', 'Violett'], ['#C2506B', 'Rot'], ['#3E9A9A', 'Türkis']];
  const gebucht = e => /Zeit gebucht/.test((e && e.message) || '');

  function ersetzen(liste, obj) {
    const i = liste.findIndex(x => x.id === obj.id);
    if (i < 0) liste.push(obj); else liste[i] = { ...liste[i], ...obj };
  }
  function fertig() {
    app.rahmen(); app.neuZeichnen();
    // Auslöser verschwunden (gelöscht/archiviert): Fokus nicht im Leeren lassen
    if (document.activeElement === document.body) $('#main').focus({ preventScroll: true });
  }
  function partnerName() {
    const s = S(), p = s.profile.find(x => s.ich && x.id !== s.ich.id);
    return (p && p.name) || 'Kai';
  }
  function letzteQuest(id) {
    try { if (id) localStorage.setItem('lw-letzte-quest', id); else return localStorage.getItem('lw-letzte-quest'); }
    catch (e) { return null; }
  }

  /* Entwurf des Aufgaben-Dialogs: übersteht versehentliches Schließen (Esc, Klick daneben) und Neuladen.
     Ein Platz; Schlüssel = Aufgaben-id oder 'neu'. Weg nach Speichern, Abbrechen oder Löschen. */
  const ENTWURF = 'lw-entwurf-aufgabe';
  const FELDER = ['titel', 'quest', 'tag', 'zugewiesen', 'kunde', 'notiz'];
  function entwurf(schluessel, wert) {
    try {
      if (wert === undefined) { const e = JSON.parse(localStorage.getItem(ENTWURF) || 'null'); return e && e.k === schluessel ? e : null; }
      if (wert) localStorage.setItem(ENTWURF, JSON.stringify(wert)); else localStorage.removeItem(ENTWURF);
    } catch (x) { return null; }
  }

  /* Pflichtfeld: Fehler beim Verlassen zeigen, beim Tippen wieder weg. */
  function pflicht(input, fehlerEl, text) {
    const zeige = an => {
      fehlerEl.textContent = an ? text : '';
      if (an) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    };
    input.addEventListener('blur', () => { if (input.dataset.beruehrt && !input.value.trim()) zeige(true); });
    input.addEventListener('input', () => { input.dataset.beruehrt = '1'; if (input.value.trim()) zeige(false); });
    return () => { if (input.value.trim()) return true; zeige(true); input.focus(); return false; };
  }
  function meldung(f, text) {
    const m = f.querySelector('.meldung[role=alert]');
    m.textContent = text || ''; m.hidden = !text;
  }
  async function senden(f, fn) {
    if (f.dataset.sendet) return;
    const btn = f.querySelector('button[type=submit]');
    f.dataset.sendet = '1'; btn.setAttribute('aria-busy', 'true'); meldung(f, '');
    try { await fn(); }
    catch (err) { console.error(err); meldung(f, fehlerText(err)); }
    finally { delete f.dataset.sendet; btn.removeAttribute('aria-busy'); }
  }

  /* ---------- Quest ---------- */
  function quest(q, opt) {
    opt = opt || {};
    const s = S(), neu = !q;
    const belegt = s.quests.map(x => (x.farbe || '').toLowerCase());
    const frei = FARBEN.find(f => !belegt.includes(f[0].toLowerCase()));
    q = q || { name: '', farbe: (frei || FARBEN[0])[0], geteilt: false, firma: false, archiviert: false };
    const farbe = (q.farbe || FARBEN[0][0]);
    const farben = FARBEN.some(f => f[0].toLowerCase() === farbe.toLowerCase()) ? FARBEN : FARBEN.concat([[farbe, 'Bisherige Farbe']]);
    const partner = partnerName();
    const eigen = neu || q.owner_id === s.ich.id;
    const besitzer = (s.profile.find(p => p.id === q.owner_id) || {}).name || 'der Besitzer';

    const d = openDlg(`<form class="dlg" novalidate>
      <h2>${neu ? 'Neue Quest' : 'Quest bearbeiten'}</h2>
      <p class="sub">${esc(opt.hinweis || (neu ? 'Ein langfristiges Ziel, z. B. Sport oder Master.' : q.name))}</p>
      <div class="stack">
        <div class="f-gruppe">
          <label class="f">Name<input name="qname" value="${esc(q.name)}" maxlength="60" autocomplete="off" required></label>
          <p class="feld-fehler" role="alert"></p>
        </div>
        <fieldset class="f farben"><legend>Farbe</legend><div class="farb-reihe">
          ${farben.map(([hex, name]) => `<label class="farbe" style="--q:${esc(hex)}"><input type="radio" name="farbe" value="${esc(hex)}" aria-label="${esc(name)}"${hex.toLowerCase() === farbe.toLowerCase() ? ' checked' : ''}><span aria-hidden="true"></span></label>`).join('')}
        </div></fieldset>
        <label class="schalter"><input type="checkbox" role="switch" name="geteilt"${q.geteilt ? ' checked' : ''}>
          <span class="schalter-text"><strong>Geteilt</strong><span class="sub">Mit ${esc(partner)} teilen: ihr seht beide alle Aufgaben und Zeiten.</span></span></label>
        <p class="meldung warn" data-teilen hidden>${eigen ? 'Danach siehst nur noch du diese Quest.' : `Danach sieht nur noch ${esc(besitzer)} diese Quest.`}${eigen ? ` Die Zeiten von ${esc(partner)} bleiben erhalten.` : ' Du verlierst den Zugriff.'}</p>
        <label class="schalter"><input type="checkbox" role="switch" name="firma"${q.firma ? ' checked' : ''}>
          <span class="schalter-text"><strong>Firma</strong><span class="sub">Mediawo-Kunden, abrechenbar</span></span></label>
        <p class="meldung" role="alert" hidden></p>
      </div>
      <div class="aktionen">
        ${neu ? '' : `<div class="aktionen-links">
          <button type="button" class="btn ghost gefahr" data-loeschen>Löschen</button>
          <button type="button" class="btn ghost" data-archiv>${q.archiviert ? 'Wiederherstellen' : 'Archivieren'}</button></div>`}
        <button type="button" class="btn" data-x>Abbrechen</button>
        <button type="submit" class="btn primary">${neu ? 'Quest anlegen' : 'Quest speichern'}</button>
      </div></form>`);
    d.classList.add('seitlich');
    const f = d.querySelector('form');
    const nameOk = pflicht(f.qname, f.querySelector('.feld-fehler'), 'Bitte einen Namen eintragen, z. B. Sport.');
    const teilenHinweis = f.querySelector('[data-teilen]');
    f.geteilt.onchange = () => { teilenHinweis.hidden = neu || !q.geteilt || f.geteilt.checked; };
    d.querySelector('[data-x]').onclick = closeDlg;

    f.onsubmit = e => {
      e.preventDefault();
      if (!nameOk()) return;
      const daten = { name: f.qname.value.trim(), farbe: f.farbe.value, geteilt: f.geteilt.checked, firma: f.firma.checked };
      const endetTeilen = !neu && q.geteilt && !daten.geteilt;
      senden(f, async () => {
        if (neu) daten.sortierung = s.quests.reduce((m, x) => Math.max(m, x.sortierung || 0), 0) + 1;
        const r = await DB.saveQuest(neu ? daten : { id: q.id, ...daten });
        if (endetTeilen) await app.laden(); // Sichtbarkeit hat sich geändert
        else ersetzen(s.quests, r);
        closeDlg();
        fertig();
        toast(neu ? 'Quest angelegt' : 'Quest gespeichert');
        if (opt.danach) opt.danach(r);
      });
    };
    if (neu) return d;

    const archivieren = async () => {
      const wert = !q.archiviert;
      try {
        const r = await DB.saveQuest({ id: q.id, archiviert: wert });
        ersetzen(s.quests, r || { id: q.id, archiviert: wert });
        closeDlg(); fertig();
        toast(wert ? 'Quest archiviert' : 'Quest wiederhergestellt');
      } catch (err) { console.error(err); closeDlg(); toast(fehlerText(err), true); }
    };
    d.querySelector('[data-archiv]').onclick = () => {
      if (q.archiviert) return archivieren();
      confirmDlg('Quest archivieren?', `„${esc(q.name)}“ verschwindet aus Heute, Backlog und Seitenleiste. Die erfassten Zeiten bleiben im Rückblick.`, 'Quest archivieren')
        .then(ok => ok ? archivieren() : quest(q, opt));
    };
    d.querySelector('[data-loeschen]').onclick = async () => {
      const ok = await confirmDlg('Quest löschen?', `„${esc(q.name)}“ und alle ihre Aufgaben werden gelöscht. Das lässt sich nicht rückgängig machen.`, 'Quest löschen', true);
      if (!ok) return quest(q, opt);
      try {
        await DB.deleteQuest(q.id);
        s.quests = s.quests.filter(x => x.id !== q.id);
        s.tasks = s.tasks.filter(t => t.quest_id !== q.id);
        fertig();
        toast('Quest gelöscht');
      } catch (err) {
        if (!gebucht(err)) { console.error(err); toast(fehlerText(err), true); return; }
        const a = await confirmDlg('Stattdessen archivieren?', `Auf „${esc(q.name)}“ ist Zeit gebucht, deshalb kann die Quest nicht gelöscht werden. Archiviert verschwindet sie aus den Listen, die Zeiten bleiben im Rückblick.`, 'Quest archivieren');
        if (a) archivieren();
      }
    };
    return d;
  }

  /* ---------- Aufgabe ---------- */
  function aufgabe(t, vorgaben) {
    vorgaben = vorgaben || {};
    const s = S(), neu = !t;
    const quests = s.quests.filter(q => !q.archiviert || (t && q.id === t.quest_id))
      .sort((a, b) => (a.sortierung || 0) - (b.sortierung || 0));
    if (!quests.length) {
      return quest(null, {
        hinweis: 'Lege zuerst eine Quest an, z. B. Sport. Danach geht es mit der Aufgabe weiter.',
        danach: q => aufgabe(null, { ...vorgaben, quest_id: q.id })
      });
    }
    const gibt = id => quests.some(q => q.id === id);
    const questId = t ? t.quest_id : [vorgaben.quest_id, letzteQuest()].find(gibt) || quests[0].id;
    const tag = t ? (t.tag || '') : (vorgaben.tag || '');
    const zugew = t ? (t.zugewiesen_an || '') : s.ich.id;
    const kundeId = t ? (t.kunde_id || '') : '';
    const kunden = s.kunden.slice();
    if (kundeId && !kunden.some(k => k.id === kundeId)) kunden.push({ id: kundeId, name: 'Kunde (nicht mehr aktiv)' });
    const personen = s.profile.slice().sort((a, b) => (a.id === s.ich.id ? -1 : b.id === s.ich.id ? 1 : 0));
    const opt = (wert, text, aktiv) => `<option value="${esc(wert)}"${wert === aktiv ? ' selected' : ''}>${esc(text)}</option>`;

    const d = openDlg(`<form class="dlg" novalidate>
      <h2>${neu ? 'Neue Aufgabe' : 'Aufgabe bearbeiten'}</h2>
      <div class="stack">
        <p class="meldung ok entwurf" data-entwurf hidden>Entwurf wiederhergestellt. <button type="button" class="btn link small" data-verwerfen>Entwurf verwerfen</button></p>
        <div class="f-gruppe">
          <label class="f">Titel<input name="titel" value="${esc(t ? t.titel : '')}" maxlength="200" autocomplete="off" required></label>
          <p class="feld-fehler" role="alert"></p>
        </div>
        <div class="feld-reihe">
          <label class="f">Quest<select name="quest">${quests.map(q => opt(q.id, q.name, questId)).join('')}</select></label>
          <label class="f">Tag (optional)<input type="date" name="tag" value="${esc(tag)}"></label>
        </div>
        <div class="feld-reihe" data-zusatz>
          <label class="f" data-nur="geteilt">Zugewiesen an<select name="zugewiesen">
            ${personen.map(p => opt(p.id, p.id === s.ich.id ? 'Ich' : p.name, zugew)).join('')}${opt('', 'Niemand', zugew)}</select></label>
          <label class="f" data-nur="firma">Kunde<select name="kunde">${opt('', 'Ohne Kunde', kundeId)}${kunden.map(k => opt(k.id, k.name, kundeId)).join('')}</select></label>
        </div>
        <label class="f">Notiz (optional)<textarea name="notiz" rows="3">${esc(t ? t.notiz || '' : '')}</textarea></label>
        <p class="meldung" role="alert" hidden></p>
      </div>
      <div class="aktionen">
        ${neu ? '' : '<div class="aktionen-links"><button type="button" class="btn ghost gefahr" data-loeschen>Löschen</button></div>'}
        <button type="button" class="btn" data-x>Abbrechen</button>
        <button type="submit" class="btn primary">${neu ? 'Aufgabe anlegen' : 'Aufgabe speichern'}</button>
      </div></form>`);
    d.classList.add('seitlich');
    const f = d.querySelector('form');
    const titelOk = pflicht(f.titel, f.querySelector('.feld-fehler'), 'Bitte einen Titel eintragen.');
    const questVon = () => quests.find(q => q.id === f.quest.value);
    const zusatz = () => {
      const q = questVon();
      const g = f.querySelector('[data-nur=geteilt]'), k = f.querySelector('[data-nur=firma]');
      g.hidden = !q.geteilt; k.hidden = !q.firma;
      f.querySelector('[data-zusatz]').hidden = g.hidden && k.hidden;
    };
    const schluessel = t ? t.id : 'neu';
    const alt = entwurf(schluessel);
    if (alt) {
      FELDER.forEach(n => { if (alt[n] != null && (n !== 'quest' || gibt(alt[n]))) f[n].value = alt[n]; });
      f.querySelector('[data-entwurf]').hidden = false;
      f.querySelector('[data-verwerfen]').onclick = () => { entwurf(schluessel, null); aufgabe(t, vorgaben); };
    }
    zusatz();
    f.quest.onchange = zusatz;
    const merken = () => { const e = { k: schluessel }; FELDER.forEach(n => { e[n] = f[n].value; }); entwurf(schluessel, e); };
    f.addEventListener('input', merken);
    f.addEventListener('change', merken);
    d.querySelector('[data-x]').onclick = () => { entwurf(schluessel, null); closeDlg(); };

    f.onsubmit = e => {
      e.preventDefault();
      if (!titelOk()) return;
      const q = questVon();
      const daten = {
        quest_id: q.id, titel: f.titel.value.trim(), tag: f.tag.value || null, notiz: f.notiz.value.trim() || null,
        zugewiesen_an: q.geteilt ? (f.zugewiesen.value || null) : s.ich.id,
        kunde_id: q.firma ? (f.kunde.value || null) : null
      };
      senden(f, async () => {
        const r = await DB.saveTask(neu ? daten : { id: t.id, ...daten });
        ersetzen(s.tasks, r);
        entwurf(schluessel, null);
        letzteQuest(q.id);
        closeDlg();
        fertig();
        const heute = L.isoTag(new Date());
        if (neu) toast(daten.tag && daten.tag <= heute ? 'Aufgabe angelegt' : 'Aufgabe angelegt – zu finden im Backlog');
        else toast('Aufgabe gespeichert');
      });
    };
    if (neu) return d;

    d.querySelector('[data-loeschen]').onclick = async () => {
      const ok = await confirmDlg('Aufgabe löschen?', `„${esc(t.titel)}“ wird gelöscht. Das lässt sich nicht rückgängig machen.`, 'Aufgabe löschen', true);
      if (!ok) return aufgabe(t, vorgaben);
      try {
        await DB.deleteTask(t.id);
        entwurf(schluessel, null);
        s.tasks = s.tasks.filter(x => x.id !== t.id);
        fertig();
        toast('Aufgabe gelöscht');
      } catch (err) {
        if (!gebucht(err)) { console.error(err); toast(fehlerText(err), true); return; }
        const a = await confirmDlg('Stattdessen archivieren?', `Auf „${esc(t.titel)}“ ist Zeit gebucht, deshalb kann die Aufgabe nicht gelöscht werden. Archiviert verschwindet sie aus den Listen, die Zeit bleibt im Rückblick.`, 'Aufgabe archivieren');
        if (!a) return;
        try {
          const r = await DB.saveTask({ id: t.id, archiviert: true });
          ersetzen(s.tasks, r || { id: t.id, archiviert: true });
          fertig();
          toast('Aufgabe archiviert');
        } catch (e2) { console.error(e2); toast(fehlerText(e2), true); }
      }
    };
    return d;
  }

  window.LW.dialoge = { quest, aufgabe };
  app.neueAufgabe = () => aufgabe(null, { tag: L.isoTag(new Date()) });

  /* Seitenleiste: „Quest anlegen“ */
  const knopf = $('#neueQuest');
  if (knopf) knopf.onclick = () => {
    if ($('#side').classList.contains('offen')) $('#menuZu').click(); // Handy-Menü schließen, Fokus geht an den Menü-Knopf
    quest();
  };
})();
