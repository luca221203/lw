/* Befehlsleiste (Strg/Cmd+K): Aufgaben, Ansichten und Aktionen mit einer Suche erreichen.
   LW.app.befehle() öffnet sie im gemeinsamen Dialog. Pfeiltasten + Enter, Alt+Enter bearbeitet, Esc schließt.
   Solange der Dialog offen ist, ignoriert die Hülle die Einzeltasten (N, F). */
window.LW = window.LW || {};
(function () {
  const { $, esc, farbe, openDlg, closeDlg } = window.LW.ui;
  const L = window.LW.logic;
  const app = window.LW.app = window.LW.app || {};
  const icon = id => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;
  const MAX = 30, MAX_LEER = 8;

  function eintraege() {
    const S = app.S;
    const gehe = (name, view) => ({ art: 'Ansicht', text: name, symbol: 'i-' + view, lauf: () => app.go(view) });
    const ansichten = [gehe('Heute', 'heute'), { art: 'Ansicht', text: 'Fokus', extra: 'laufende Aufgabe', symbol: 'i-play', lauf: () => app.go('fokus', S.laufend ? S.laufend.task_id : null) }, gehe('Woche', 'woche'), gehe('Backlog', 'backlog'), gehe('Rückblick', 'rueckblick')];
    const aktionen = [
      { art: 'Aktion', text: 'Neue Aufgabe', symbol: 'i-plus', lauf: () => app.neueAufgabe() },
      { art: 'Aktion', text: 'Neue Quest', symbol: 'i-plus', lauf: () => LW.dialoge.quest() },
      { art: 'Aktion', text: 'Zeit nachtragen', symbol: 'i-plus', lauf: () => LW.zeiten.dialog(null, {}) },
      { art: 'Aktion', text: 'Hell/Dunkel umschalten', extra: 'Darstellung Theme dunkel hell', symbol: 'i-theme', lauf: () => app.themeUmschalten() }
    ];
    const heute = L.isoTag(new Date());
    const rang = t => (S.laufend && S.laufend.task_id === t.id ? 0 : t.tag && t.tag <= heute ? 1 : t.tag ? 2 : 3);
    const tasks = S.tasks.filter(t => !t.erledigt_am)
      .sort((a, b) => rang(a) - rang(b) || (a.tag || '9').localeCompare(b.tag || '9'))
      .map(t => {
        const q = S.quests.find(x => x.id === t.quest_id) || {};
        return { art: 'Aufgabe', text: t.titel, extra: q.name || '', quest: q, task: t,
          lauf: () => app.fokusStarten(t), bearbeiten: () => LW.dialoge.aufgabe(t) };
      });
    return { ansichten, aktionen, tasks };
  }

  function zeile(e, i, aktiv) {
    const q = e.quest;
    const vorne = e.task ? `<span class="dot" style="--q:${farbe(q && q.farbe)}" aria-hidden="true"></span>` : icon(e.symbol);
    const hinten = e.task ? esc(q && q.name || '') : esc(e.art);
    return `<li id="bf-${i}" role="option" aria-selected="${i === aktiv}" data-i="${i}">${vorne}<span class="bf-text">${esc(e.text)}</span><span class="bf-art">${hinten}</span></li>`;
  }

  app.befehle = function () {
    const S = app.S;
    if (!S || !S.ich || $('#dlg').open) return;
    const alle = eintraege();
    const d = openDlg(`<div class="dlg bf" role="search">
      <h2 class="sr-only" id="bfTitel">Befehlsleiste</h2>
      <label class="sr-only" for="bfEingabe">Aufgabe, Ansicht oder Aktion suchen</label>
      <div class="bf-feld">${icon('i-suche')}
        <input id="bfEingabe" type="text" role="combobox" aria-expanded="true" aria-controls="bfListe" aria-autocomplete="list" aria-activedescendant="" placeholder="Aufgabe, Ansicht, Aktion" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"></div>
      <ul id="bfListe" class="bf-liste" role="listbox" aria-label="Ergebnisse"></ul>
      <p class="bf-leer" id="bfLeer" hidden>Nichts gefunden. Probier ein anderes Wort.</p>
      <p class="bf-tasten" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> wählen</span><span><kbd>⏎</kbd> Fokus oder öffnen</span><span><kbd>Alt</kbd><kbd>⏎</kbd> bearbeiten</span><span><kbd>Esc</kbd> schließen</span></p></div>`);
    d.classList.add('befehle');
    d.setAttribute('aria-labelledby', 'bfTitel');
    const eingabe = $('#bfEingabe', d), liste = $('#bfListe', d), leer = $('#bfLeer', d);
    let treffer = [], aktiv = 0;

    function zeichnen() {
      const q = eingabe.value.trim();
      treffer = q ? L.befehlsSuche(q, [...alle.ansichten, ...alle.aktionen, ...alle.tasks]).slice(0, MAX)
        : [...alle.ansichten, ...alle.aktionen, ...alle.tasks.slice(0, MAX_LEER)];
      aktiv = 0;
      liste.innerHTML = treffer.map((e, i) => zeile(e, i, aktiv)).join('');
      leer.hidden = treffer.length > 0;
      markieren();
    }
    function markieren() {
      [...liste.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === aktiv)));
      const li = liste.children[aktiv];
      eingabe.setAttribute('aria-activedescendant', li ? li.id : '');
      if (li) li.scrollIntoView({ block: 'nearest' });
    }
    function ausfuehren(i, bearbeiten) {
      const e = treffer[i];
      if (!e) return;
      const fn = bearbeiten ? e.bearbeiten : e.lauf;
      if (!fn) return;
      d.addEventListener('close', () => {
        if (app.menuZu) app.menuZu(); // Handy: offenes Menü schließen, auch wenn die Aktion nicht navigiert
        try { fn(); } catch (err) { console.error(err); }
      }, { once: true });
      closeDlg();
    }

    eingabe.addEventListener('input', zeichnen);
    eingabe.addEventListener('keydown', ev => {
      if (ev.isComposing) return;
      const n = treffer.length;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (n) { aktiv = (aktiv + 1) % n; markieren(); } }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (n) { aktiv = (aktiv - 1 + n) % n; markieren(); } }
      else if (ev.key === 'Home' && ev.ctrlKey) { ev.preventDefault(); aktiv = 0; markieren(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); ausfuehren(aktiv, ev.altKey); }
    });
    liste.addEventListener('mousedown', ev => ev.preventDefault()); // Eingabefeld behält den Fokus
    liste.addEventListener('click', ev => {
      const li = ev.target.closest('li[data-i]');
      if (li) ausfuehren(+li.dataset.i, ev.altKey);
    });
    liste.addEventListener('mousemove', ev => {
      const li = ev.target.closest('li[data-i]');
      if (li && +li.dataset.i !== aktiv) { aktiv = +li.dataset.i; markieren(); }
    });
    zeichnen();
    eingabe.focus();
  };
  const knopf = $('#befehleKnopf');
  if (knopf) {
    knopf.onclick = () => app.befehle();
    knopf.dataset.kbd = (/Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Strg') + ' K';
  }
})();
