/* LW – App-Hülle: Anmeldung, Zustand, Navigation, Seitenleiste, Tastatur.
   Ansichten registrieren sich in eigenen Dateien (vor app.js eingebunden):
     LW.views.heute = { titel: 'Heute', render(main, param) { ... } };
   Navigation: LW.app.go('backlog', questId) -> #backlog/<questId>. */
window.LW = window.LW || {};
(function () {
  const { $, $$, esc, farbe, toast, guard, openDlg, closeDlg, fehlerText } = window.LW.ui;
  const DB = window.LW.db, L = window.LW.logic;
  const app = window.LW.app = window.LW.app || {};
  const views = window.LW.views = window.LW.views || {};

  /* Zustand. zeitenHeute: Zeiteinträge von heute (eigene und geteilte) plus der eigene laufende. */
  const S = app.S = { ich: null, profile: [], quests: [], tasks: [], kunden: [], ordner: [], laufend: null, zeitenHeute: [], view: null, param: null };

  /* ---------- Platzhalter (spätere Schritte ersetzen sie) ---------- */
  function platzhalter(titel, sub) {
    return {
      titel,
      render(main) {
        main.innerHTML = `<div class="seite"><header class="kopf"><div><h1>${esc(titel)}</h1>
          <p class="sub">${esc(typeof sub === 'function' ? sub() : sub)}</p></div></header></div>`;
      }
    };
  }
  const heuteText = () => new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  views.heute = views.heute || platzhalter('Heute', heuteText);
  views.woche = views.woche || platzhalter('Woche', 'Der Wochenplaner folgt.');
  views.backlog = views.backlog || platzhalter('Backlog', 'Alle offenen Aufgaben folgen hier.');
  views.rueckblick = views.rueckblick || platzhalter('Rückblick', 'Die Auswertung folgt.');
  views.fokus = views.fokus || platzhalter('Fokus', 'Der Fokus-Modus folgt.');
  views.quest = views.quest || platzhalter('Quest', 'Die Quest-Ansicht folgt.');
  views.ordner = views.ordner || platzhalter('Ordner', 'Die Ordner-Ansicht folgt.');

  /* Haken für spätere Schritte – bis dahin ohne Wirkung (Fokus öffnet die Ansicht). */
  const nichts = () => {};
  app.neueAufgabe = app.neueAufgabe || nichts;
  app.befehle = app.befehle || nichts;
  app.erledigt = app.erledigt || nichts;
  app.fokus = app.fokus || (taskId => go('fokus', taskId));

  /* ---------- Daten ---------- */
  /* Stammdaten: Quests, Aufgaben, Ordner, Profile, Kunden (beim Start und beim Abgleich).
     Ordner zuerst laden, bevor gespeichert wird: DB.ordner() setzt DB.ordnerVerfuegbar. */
  async function stammdaten() {
    const [profile, quests, tasks, kunden, ordner] = await Promise.all([
      DB.profile(), DB.quests(), DB.tasks(),
      DB.kunden().catch(e => { console.warn('Kunden nicht lesbar', e); return null; }),
      DB.ordner().catch(e => { console.warn('Ordner nicht lesbar', e); return null; })
    ]);
    return { profile, quests, tasks, kunden, ordner };
  }
  async function laden() {
    const heute = L.isoTag(new Date());
    const ich = await DB.ich(); // zuerst: legt beim ersten Login das Profil an
    zeitNr++; stammNr++; // laufende Abgleiche sind damit veraltet
    const [stamm, laufend, zeitenHeute] = await Promise.all([stammdaten(), DB.laufend(), DB.zeiten(heute, heute)]);
    if (!stamm.kunden) stamm.kunden = [];
    if (!stamm.ordner) stamm.ordner = [];
    Object.assign(S, { ich, ...stamm, laufend, zeitenHeute });
    stammAm = Date.now();
    rahmen();
  }

  /* Reihenfolge-Schutz für den Abgleich: Jedes Schreiben zählt seinen Zähler beim Beginn und
     beim Ende hoch. Ein Abgleich, dessen Abfrage sich damit überschnitten hat, ist veraltet und
     wird verworfen – so kann ein altes Ergebnis keinen gerade gestarteten Timer verstecken und
     keinen gerade gestoppten zurückholen (bzw. keine gerade gespeicherte Aufgabe zurückdrehen). */
  let zeitNr = 0, stammNr = 0, stammAm = 0;
  function zaehlen(namen, plus) {
    namen.forEach(n => {
      const f = DB[n];
      if (typeof f !== 'function') return;
      DB[n] = async function (...a) { plus(); try { return await f.apply(this, a); } finally { plus(); } };
    });
  }
  zaehlen(['starteTimer', 'stoppeTimer', 'saveZeit', 'deleteZeit'], () => { zeitNr++; });
  zaehlen(['saveTask', 'deleteTask', 'saveQuest', 'deleteQuest', 'saveProfil', 'saveOrdner', 'deleteOrdner'], () => { stammNr++; });

  /* Eigene Zeiteinträge von heute (inkl. laufendem Timer, ohne Doppel). */
  function eigeneHeute() {
    if (!S.ich) return [];
    const map = new Map();
    S.zeitenHeute.forEach(z => map.set(z.id, z));
    if (S.laufend) map.set(S.laufend.id, S.laufend);
    return [...map.values()].filter(z => z.user_id === S.ich.id);
  }
  /* Eigene Sekunden pro Quest heute (inkl. laufendem Timer): { questId: sek } */
  function stundenHeute() {
    if (!S.ich) return {};
    const heute = L.isoTag(new Date());
    return L.summeProQuest(eigeneHeute(), heute, heute, new Date());
  }

  /* ---------- Routing über location.hash: #heute, #backlog/<param> ---------- */
  function ausHash() {
    const h = location.hash.slice(1);
    const i = h.indexOf('/');
    const view = i < 0 ? h : h.slice(0, i);
    let param = null;
    if (i >= 0) { try { param = decodeURIComponent(h.slice(i + 1)) || null; } catch (e) { param = null; } }
    return views[view] ? { view, param } : null;
  }
  function hashVon(view, param) { return '#' + view + (param ? '/' + encodeURIComponent(param) : ''); }

  function go(view, param) {
    if (!views[view]) view = 'heute';
    const h = hashVon(view, param);
    if (location.hash === h) zeigen(); else location.hash = h;
  }

  function zeigen() {
    if (!S.ich) return;
    let ziel = ausHash();
    if (!ziel) {
      ziel = { view: 'heute', param: null };
      history.replaceState(null, '', location.pathname + location.search + hashVon('heute'));
    }
    S.view = ziel.view; S.param = ziel.param;
    if (window.LW.aufgaben) window.LW.aufgaben.menueZu(); // offene Menüs gehören zur alten Ansicht
    menuZu(false);
    $$('[data-view]').forEach(a => {
      if (a.dataset.view === S.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const v = views[S.view];
    document.title = v.titel + ' · TM';
    $('#topTitel').textContent = v.titel;
    rendern();
    questListe(); // aktuelle Quest / aktuellen Ordner markieren
    const main = $('#main');
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  /* Vertrag für Ansichten: render(main, param) baut neu auf; Ereignisse über main.onclick/oninput/onchange
     (werden hier zurückgesetzt) oder selbst in destroy() aufräumen (Intervalle, document-Listener).
     Optional aktualisieren(): Daten in S haben sich geändert – Ansicht frisch zeichnen ohne Fokus/Scroll zu verlieren. */
  let aktiv = null; // gerade gerenderte Ansicht
  function abbauen() {
    const v = aktiv; aktiv = null;
    if (v && typeof v.destroy === 'function') { try { v.destroy(); } catch (e) { console.error(e); } }
    const main = $('#main');
    main.onclick = null; main.oninput = null; main.onchange = null;
    main.innerHTML = '';
  }
  function rendern() {
    abbauen();
    const v = views[S.view], main = $('#main');
    aktiv = v;
    try { v.render(main, S.param); }
    catch (e) {
      console.error(e);
      main.innerHTML = `<div class="seite"><div class="leer"><strong>Diese Ansicht konnte nicht angezeigt werden.</strong>
        <span>${esc(fehlerText(e))}</span><button class="btn" type="button" data-neu>Neu laden</button></div></div>`;
      main.querySelector('[data-neu]').onclick = () => location.reload();
    }
    chip();
  }

  /* Aktuelle Ansicht nach Datenänderung neu zeigen – ohne Scroll- oder Fokus-Sprung. */
  function neuZeichnen() {
    if (!S.ich || !aktiv) return;
    if (typeof aktiv.aktualisieren === 'function') {
      try { aktiv.aktualisieren(); } catch (e) { console.error(e); }
      chip();
      return;
    }
    const y = window.scrollY;
    const fokusId = document.activeElement && document.activeElement.id;
    rendern();
    window.scrollTo(0, y);
    if (fokusId) { const el = document.getElementById(fokusId); if (el && $('#main').contains(el)) el.focus({ preventScroll: true }); }
  }

  /* ---------- Seitenleiste und „Läuft gerade“ ---------- */
  function rahmen() {
    if (!S.ich) return;
    $('#userName').textContent = S.ich.name || '';
    $('#userMail').textContent = S.ich.email || '';
    questListe();
    chip();
  }

  /* Quests und Ordner als Baum: js/ordner.js */
  function questListe() { window.LW.ordner.seitenleiste(); }

  function chip() {
    const el = $('#laeuft');
    const z = S.laufend;
    if (!z || S.view === 'fokus') { el.hidden = true; return; }
    const task = S.tasks.find(t => t.id === z.task_id);
    const quest = S.quests.find(q => q.id === z.quest_id);
    const titel = task ? task.titel : (quest ? quest.name : 'Ohne Aufgabe');
    const jetzt = new Date();
    const zeit = L.formatTimer(L.dauerSek(z, jetzt));
    el.hidden = false;
    el.style.setProperty('--q', quest ? farbe(quest.farbe) : '');
    el.classList.toggle('zu-lange', L.laufendZuLange(z, jetzt));
    $('#laeuftTitel').textContent = titel;
    $('#laeuftZeit').textContent = zeit;
    el.setAttribute('aria-label', 'Läuft gerade: ' + titel + ', ' + zeit + '. Fokus öffnen');
  }

  let tick = null, ticks = 0, tagStand = null;
  function uhrStarten() {
    if (tick) return;
    tagStand = L.isoTag(new Date());
    tick = setInterval(() => {
      ticks++;
      if (ticks % 60 === 0 && L.isoTag(new Date()) !== tagStand) { abgleichen(true); return; } // neuer Tag
      if (!S.laufend) return;
      chip();
      if (ticks % 30 === 0) questListe();
    }, 1000);
  }
  function uhrStoppen() { clearInterval(tick); tick = null; }

  /* Laufenden Timer und heutige Zeiten neu holen (nach eigenen Timer-Aktionen). Mit alles = true
     zusätzlich Quests, Aufgaben, Profile und Kunden: beim Zurückkehren in den Tab / die App und beim
     Tageswechsel – das andere Gerät oder Kai könnten inzwischen etwas geändert haben.
     Veraltete Ergebnisse (Schreiben dazwischen, neuerer Abgleich) werden verworfen. */
  async function abgleichen(alles) {
    if (!S.ich) return;
    const wer = S.ich.id, nr = ++zeitNr, snr = alles ? ++stammNr : stammNr; // neuerer Abgleich verdrängt älteren
    try {
      const heute = L.isoTag(new Date());
      const [laufend, zeitenHeute, stamm] = await Promise.all([
        DB.laufend(), DB.zeiten(heute, heute), alles ? stammdaten() : null
      ]);
      if (!S.ich || S.ich.id !== wer) return; // abgemeldet oder anderer Nutzer
      const zeitFrisch = nr === zeitNr, stammFrisch = !!stamm && snr === stammNr;
      if (!zeitFrisch && !stammFrisch) return;
      if (stammFrisch) {
        if (!stamm.kunden) delete stamm.kunden; // Kunden nicht lesbar: bisherige behalten
        if (!stamm.ordner) delete stamm.ordner; // Ordner nicht lesbar: bisherige behalten
        Object.assign(S, stamm);
        stammAm = Date.now();
      }
      if (zeitFrisch) { tagStand = heute; Object.assign(S, { laufend, zeitenHeute }); }
      rahmen();
      neuZeichnen();
    } catch (e) { console.warn('Abgleich fehlgeschlagen', e); }
  }
  // Zurück in Tab oder App: alles abgleichen (Stammdaten höchstens alle 15 s, sonst nur Zeiten)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) abgleichen(Date.now() - stammAm > 15000); });

  /* ---------- Handy-Menü (Seitenleiste von links) ---------- */
  const side = $('#side'), schleier = $('#schleier'), menuKnopf = $('#menuAuf');
  function menuAuf() {
    side.classList.add('offen');
    schleier.hidden = false;
    menuKnopf.setAttribute('aria-expanded', 'true');
    $('#menuZu').focus();
  }
  function menuZu(fokusZurueck = true) {
    if (!side.classList.contains('offen')) return;
    const warDrin = side.contains(document.activeElement);
    side.classList.remove('offen');
    schleier.hidden = true;
    menuKnopf.setAttribute('aria-expanded', 'false');
    if (fokusZurueck && warDrin) menuKnopf.focus();
  }
  menuKnopf.onclick = menuAuf;
  $('#menuZu').onclick = () => menuZu();
  schleier.onclick = () => menuZu();
  side.addEventListener('click', e => { if (e.target.closest('a[href^="#"]')) menuZu(false); });
  side.addEventListener('keydown', e => { // Fokus bleibt im offenen Menü
    if (e.key !== 'Tab' || !side.classList.contains('offen')) return;
    const f = $$('a[href], button:not([disabled])', side).filter(x => x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  matchMedia('(min-width: 768px)').addEventListener('change', e => { if (e.matches) menuZu(false); });

  /* ---------- Hell / Dunkel ---------- */
  const dunkelSystem = matchMedia('(prefers-color-scheme: dark)');
  function themeAktiv() { return document.documentElement.dataset.theme || (dunkelSystem.matches ? 'dark' : 'light'); }
  function themeFarbe() {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    $$('meta[name=theme-color]').forEach(m => { m.content = bg; m.removeAttribute('media'); });
  }
  function themeSetzen(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('lw-theme', t); } catch (e) { /* privates Fenster */ }
    themeFarbe();
  }
  app.themeUmschalten = () => themeSetzen(themeAktiv() === 'dark' ? 'light' : 'dark');
  $('#themeToggle').onclick = app.themeUmschalten;
  dunkelSystem.addEventListener('change', () => { if (!document.documentElement.dataset.theme) themeFarbe(); });

  /* ---------- Tastatur ---------- */
  function tippt(el) {
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }
  let tastaturAn = false;
  app.tastatur = function () {
    if (tastaturAn) return;
    tastaturAn = true;
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && side.classList.contains('offen') && !$('#dlg').open) { e.preventDefault(); menuZu(); return; }
      if ($('#app').hidden || $('#dlg').open || e.repeat || e.isComposing || tippt(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'k') { e.preventDefault(); app.befehle(); return; }
      if (mod && e.key === 'Enter') { e.preventDefault(); app.erledigt(); return; }
      if (mod || e.altKey) return;
      if (k === 'n') { e.preventDefault(); app.neueAufgabe(); }
      else if (k === 'f') { e.preventDefault(); app.fokus(); }
    });
  };

  /* ---------- Anmeldung ---------- */
  const form = $('#loginForm'), meldungEl = $('#loginMeldung');
  function meldung(text, ok) {
    meldungEl.textContent = text || '';
    meldungEl.className = 'meldung' + (ok ? ' ok' : '');
    meldungEl.hidden = !text;
  }
  function feldFehler(input, an) { if (an) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
  const emailOk = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  form.email.addEventListener('blur', () => {
    const v = form.email.value.trim();
    if (v && !emailOk(v)) { feldFehler(form.email, true); meldung('Diese E-Mail-Adresse ist unvollständig. Bitte so eintragen: name@beispiel.de'); }
  });
  form.addEventListener('input', e => { if (e.target.getAttribute('aria-invalid')) { feldFehler(e.target, false); meldung(''); } });

  let sendet = false;
  form.onsubmit = async e => {
    e.preventDefault();
    if (sendet) return;
    const email = form.email.value.trim(), pw = form.password.value;
    feldFehler(form.email, !emailOk(email)); feldFehler(form.password, !pw);
    if (!email) { meldung('Bitte deine E-Mail-Adresse eintragen.'); form.email.focus(); return; }
    if (!emailOk(email)) { meldung('Diese E-Mail-Adresse ist unvollständig. Bitte so eintragen: name@beispiel.de'); form.email.focus(); return; }
    if (!pw) { meldung('Bitte dein Passwort eintragen.'); form.password.focus(); return; }
    meldung('');
    sendet = true;
    const btn = $('#loginBtn');
    btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Anmelden …';
    try { await DB.login(email, pw); }
    catch (err) { meldung(fehlerText(err)); }
    finally { sendet = false; btn.removeAttribute('aria-busy'); btn.textContent = 'Anmelden'; }
  };

  $('#pwForgot').onclick = async () => {
    const email = form.email.value.trim();
    if (!emailOk(email)) {
      feldFehler(form.email, true);
      meldung('Trag oben deine E-Mail-Adresse ein, dann schicken wir dir einen Link.');
      form.email.focus();
      return;
    }
    try {
      await DB.passwortVergessen(email);
      meldung('Link zum Zurücksetzen ist unterwegs an ' + email + '. Schau auch im Spam-Ordner nach.', true);
    } catch (err) { meldung(fehlerText(err)); }
  };

  /* Passwort festlegen (nach Einladungs- oder Zurücksetzen-Link: Pflicht) oder ändern */
  function passwortDlg(pflicht) {
    const d = openDlg(`<form class="dlg" id="pwf" novalidate><h2>${pflicht ? 'Neues Passwort festlegen' : 'Passwort ändern'}</h2>
      <p class="sub">${pflicht ? 'Damit meldest du dich künftig an. ' : ''}Mindestens 8 Zeichen.</p>
      <div class="stack">
        <label class="f">Neues Passwort<input type="password" name="p1" autocomplete="new-password" minlength="8" required></label>
        <label class="f">Passwort wiederholen<input type="password" name="p2" autocomplete="new-password" minlength="8" required></label>
        <p class="feld-fehler" id="pwFehler" role="alert"></p>
      </div>
      <div class="aktionen">${pflicht ? '' : '<button type="button" class="btn" data-x>Abbrechen</button>'}
        <button class="btn primary" type="submit">Passwort speichern</button></div></form>`);
    if (pflicht) { d.dataset.pflicht = '1'; d.oncancel = e => e.preventDefault(); }
    const f = d.querySelector('#pwf'), fehlerEl = d.querySelector('#pwFehler');
    const x = d.querySelector('[data-x]'); if (x) x.onclick = closeDlg;
    const zeige = (text, feld) => { fehlerEl.textContent = text; [f.p1, f.p2].forEach(i => feldFehler(i, i === feld)); if (feld) feld.focus(); };
    f.p1.addEventListener('blur', () => {
      if (f.p1.value && f.p1.value.length < 8) { fehlerEl.textContent = 'Das Passwort ist zu kurz. Bitte mindestens 8 Zeichen verwenden.'; feldFehler(f.p1, true); }
    });
    f.addEventListener('input', e => { if (e.target.getAttribute('aria-invalid')) { feldFehler(e.target, false); fehlerEl.textContent = ''; } });
    let speichert = false;
    f.onsubmit = async e => {
      e.preventDefault();
      if (speichert) return;
      if (f.p1.value.length < 8) return zeige('Das Passwort ist zu kurz. Bitte mindestens 8 Zeichen verwenden.', f.p1);
      if (f.p1.value !== f.p2.value) return zeige('Die beiden Passwörter stimmen nicht überein.', f.p2);
      speichert = true;
      try { await DB.passwortSetzen(f.p1.value); }
      catch (err) { return zeige(fehlerText(err), f.p1); }
      finally { speichert = false; }
      closeDlg();
      toast('Passwort gespeichert');
    };
  }
  app.passwortDlg = passwortDlg;
  $('#pwChange').onclick = () => passwortDlg(false);
  $('#logout').onclick = () => guard(() => DB.logout());
  $('#laeuft').onclick = () => go('fokus');

  function linkPruefen() {
    const typ = DB.linkTyp && DB.linkTyp();
    if (typ === 'invite' || typ === 'recovery' || typ === 'signup') passwortDlg(true);
  }

  let aktiverNutzer = null;
  async function zeigeApp(session) {
    if (!session) {
      aktiverNutzer = null;
      abbauen();
      Object.assign(S, { ich: null, profile: [], quests: [], tasks: [], kunden: [], ordner: [], laufend: null, zeitenHeute: [], view: null, param: null });
      uhrStoppen(); menuZu(false); closeDlg();
      $('#questListe').innerHTML = ''; $('#laeuft').hidden = true;
      $('#app').hidden = true; $('#login').hidden = false;
      $('#loginDemo').hidden = !DB.demo;
      if (DB.demo && !form.email.value) { form.email.value = 'luca@lw.demo'; form.password.value = 'demo'; }
      document.title = 'Anmelden · TM';
      return;
    }
    const wer = session.user && session.user.email;
    if (aktiverNutzer === wer) { linkPruefen(); return; }
    aktiverNutzer = wer;
    $('#login').hidden = true; $('#app').hidden = false;
    $('#demoBadge').hidden = !DB.demo;
    form.password.value = ''; meldung('');
    const main = $('#main');
    main.innerHTML = '';
    const langsam = setTimeout(() => { main.innerHTML = '<div class="seite skelett" aria-busy="true" aria-label="Lädt"><i></i><i></i><i></i><i></i></div>'; }, 150);
    const ok = await guard(async () => { await laden(); return true; });
    clearTimeout(langsam);
    if (!ok) {
      main.innerHTML = `<div class="seite"><div class="leer"><strong>Die Daten konnten nicht geladen werden.</strong>
        <button class="btn" type="button" data-neu>Erneut versuchen</button></div></div>`;
      main.querySelector('[data-neu]').onclick = () => { aktiverNutzer = null; zeigeApp(session); };
      return;
    }
    zeigen();
    uhrStarten();
    linkPruefen();
  }

  Object.assign(app, { S, laden, go, rahmen, stundenHeute, eigeneHeute, hashVon, zeigen, neuZeichnen, abgleichen, menuZu });

  /* ---------- Start: nach allen Skripten, damit Ansichten registriert sind ---------- */
  function start() {
    themeFarbe();
    app.tastatur();
    window.addEventListener('hashchange', () => { if (S.ich) zeigen(); });
    DB.onAuth(s => zeigeApp(s));
    DB.session().then(zeigeApp).catch(e => { console.error(e); zeigeApp(null); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
