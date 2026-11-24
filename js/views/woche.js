/* Woche: Montag bis Sonntag nebeneinander (Handy: untereinander) plus Spalte „Ohne Tag“.
   Planungsansicht: pro Tag die offenen geplanten Aufgaben (kompakte Karten) und die eigenen erfassten Stunden. Am Laptop Aufgaben auf einen Tag ziehen,
   sonst (und per Tastatur) über das Tag-Menü der Zeile. Woche in der Adresse: #woche/<montag>. */
window.LW = window.LW || {};
(function () {
  const { $, $$, esc } = window.LW.ui;
  const DB = window.LW.db, L = window.LW.logic, A = window.LW.aufgaben;
  const app = window.LW.app = window.LW.app || {};
  const views = window.LW.views = window.LW.views || {};
  const icon = id => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;
  const heuteIso = () => L.isoTag(new Date());
  const datum = iso => { const p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const ALLE = 'lw-woche-alle';
  const ziehen = () => window.matchMedia('(pointer:fine) and (min-width:768px)').matches;

  let main = null, montag = null, alle = false, zeiten = null, uhr = null, gezogen = null;
  const taskById = id => app.S.tasks.find(t => t.id === id);
  const merken = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } };
  const lesen = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  function spanne(tage) {
    const a = datum(tage[0]), b = datum(tage[6]);
    const monat = (d, art) => d.toLocaleDateString('de-DE', { month: art });
    if (a.getMonth() === b.getMonth()) return `${a.getDate()}.–${b.getDate()}. ${monat(b, 'long')} ${b.getFullYear()}`;
    if (a.getFullYear() === b.getFullYear()) return `${a.getDate()}. ${monat(a, 'short')} – ${b.getDate()}. ${monat(b, 'short')} ${b.getFullYear()}`;
    return `${a.getDate()}. ${monat(a, 'short')} ${a.getFullYear()} – ${b.getDate()}. ${monat(b, 'short')} ${b.getFullYear()}`;
  }
  function partner() {
    const S = app.S, p = S.profile.find(x => x.id !== S.ich.id);
    return p ? p.name : null;
  }

  /* Sichtbar: aktive Quest; in geteilten Quests eigene und nicht zugewiesene – mit „Alle“ auch die der anderen. */
  function auswahl() {
    const S = app.S, quests = {};
    S.quests.forEach(q => { if (!q.archiviert) quests[q.id] = q; });
    const sichtbar = t => {
      const q = quests[t.quest_id];
      return q && !t.archiviert && !t.erledigt_am && (alle || !q.geteilt || !t.zugewiesen_an || t.zugewiesen_an === S.ich.id);
    };
    const sortieren = (a, b) => (quests[a.quest_id].sortierung || 0) - (quests[b.quest_id].sortierung || 0) || (a.sortierung || 0) - (b.sortierung || 0);
    const liste = S.tasks.filter(sichtbar);
    return {
      tag: d => liste.filter(t => t.tag === d).sort(sortieren),
      ohne: liste.filter(t => t.tag == null).sort(sortieren)
    };
  }

  function zeilen(tasks, leer) {
    const opt = { quest: true, tagKnopf: 'icon', person: true, check: false, fokus: false, kunde: false, ziehbar: ziehen() };
    return tasks.length
      ? `<ul class="aufgaben">${tasks.map(t => A.zeile(t, opt)).join('')}</ul>`
      : `<p class="spalte-leer">${leer}</p>`;
  }

  function zeichnen() {
    gezogen = null; // altes DOM (gezogene Karte, Markierung) ist gleich weg
    const S = app.S, heute = heuteIso(), tage = L.wochenTage(montag), a = auswahl();
    const diese = L.wochenTage(heute)[0] === montag;
    const p = partner();
    main.innerHTML = `<div class="seite breit woche">
      <header class="kopf"><div><h1>Woche</h1><p class="sub"><span class="zahl">KW ${L.kalenderwoche(montag)}</span> · ${esc(spanne(tage))}<span data-gesamt></span></p></div>
        <div class="woche-steuerung">
          ${p ? `<label class="schalter woche-alle"><input type="checkbox" role="switch" data-aktion="alle"${alle ? ' checked' : ''}><span class="schalter-text">Alle (inkl. ${esc(p)})</span></label>` : ''}
          <div class="woche-nav" role="group" aria-label="Woche wechseln">
            <button class="btn icon" type="button" data-aktion="zurueck" aria-label="Vorige Woche" data-tip="Vorige Woche">${icon('i-links')}</button>
            <button class="btn" type="button" data-aktion="heute"${diese ? ' aria-current="date"' : ''}>Heute</button>
            <button class="btn icon tip-links" type="button" data-aktion="vor" aria-label="Nächste Woche" data-tip="Nächste Woche">${icon('i-rechts')}</button>
          </div>
        </div>
      </header>
      <div class="woche-brett">
        <div class="woche-tage">
          ${tage.map(d => {
            const dd = datum(d), lang = dd.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
            return `<section class="tag-spalte${d === heute ? ' ist-heute' : ''}${d < heute ? ' vorbei' : ''}" data-drop="${d}" aria-labelledby="tag-${d}">
              <header class="tag-kopf">
                <h2 id="tag-${d}" aria-label="${esc(lang)}${d === heute ? ' (heute)' : ''}"><span class="tag-name">${esc(dd.toLocaleDateString('de-DE', { weekday: 'short' }))}</span><span class="tag-datum zahl">${dd.getDate()}.${dd.getMonth() + 1}.</span></h2>
                <span class="tag-std zahl" data-std="${d}"></span>
                <button class="btn icon small ghost tip-unten tip-links" type="button" data-aktion="neu" data-wert="${d}" aria-label="Aufgabe für ${esc(lang)} anlegen" data-tip="Aufgabe anlegen">${icon('i-plus')}</button>
              </header>
              ${zeilen(a.tag(d), 'Nichts geplant')}
            </section>`;
          }).join('')}
        </div>
        <section class="tag-spalte ohne-tag" data-drop="" aria-labelledby="tag-ohne">
          <header class="tag-kopf"><h2 id="tag-ohne">Ohne Tag</h2><span class="tag-std zahl">${a.ohne.length || ''}</span></header>
          ${zeilen(a.ohne, 'Alles verplant')}
        </section>
      </div>
    </div>`;
    stundenZeigen();
  }

  /* Eigene Stunden pro Tag (nach lokalem Starttag), laufender Timer zählt mit. */
  function stundenZeigen() {
    if (!main) return;
    const S = app.S, tage = L.wochenTage(montag), jetzt = new Date();
    let gesamt = 0;
    const eigene = zeiten && zeiten.montag === montag ? zeiten.liste.slice() : null;
    if (eigene && S.laufend && !eigene.some(z => z.id === S.laufend.id)) eigene.push(S.laufend);
    tage.forEach(d => {
      const sek = eigene ? Object.values(L.summeProQuest(eigene, d, d, jetzt)).reduce((x, y) => x + y, 0) : 0;
      gesamt += sek;
      const el = $(`[data-std="${d}"]`, main);
      if (el) { el.textContent = sek ? L.formatDauer(sek) : ''; el.setAttribute('aria-label', sek ? L.formatDauer(sek) + ' erfasst' : ''); }
    });
    const g = $('[data-gesamt]', main);
    if (g) g.textContent = gesamt ? ' · ' + L.formatDauer(gesamt) + ' erfasst' : '';
  }
  async function stundenLaden() {
    const m = montag, tage = L.wochenTage(m);
    try {
      const liste = await DB.zeiten(tage[0], tage[6]);
      if (!main || m !== montag) return;
      zeiten = { montag: m, liste: liste.filter(z => z.user_id === app.S.ich.id) };
      stundenZeigen();
    } catch (e) { console.warn('Stunden der Woche nicht geladen', e); }
  }

  function wechseln(neu) {
    montag = L.wochenTage(neu)[0];
    const diese = L.wochenTage(heuteIso())[0] === montag;
    app.S.param = diese ? null : montag;
    history.replaceState(null, '', location.pathname + location.search + '#woche' + (diese ? '' : '/' + montag));
    A.neuZeichnenMitFokus(main, zeichnen);
    stundenLaden();
  }

  function klick(e) {
    const el = e.target.closest('[data-aktion]');
    if (!el || el.tagName === 'INPUT') return;
    const li = e.target.closest('.aufgabe');
    const t = li && taskById(li.dataset.id);
    switch (el.dataset.aktion) {
      case 'bearbeiten': if (t) LW.dialoge.aufgabe(t); break;
      case 'tag': if (t) A.tagMenue(el, t, L.wochenTage(montag)); break;
      case 'neu': LW.dialoge.aufgabe(null, { tag: el.dataset.wert }); break;
      case 'zurueck': wechseln(A.plusTage(montag, -7)); break;
      case 'vor': wechseln(A.plusTage(montag, 7)); break;
      case 'heute': wechseln(heuteIso()); break;
    }
  }
  function aenderung(e) {
    if (e.target.dataset.aktion !== 'alle') return;
    alle = e.target.checked;
    merken(ALLE, alle ? '1' : '0');
    A.neuZeichnenMitFokus(main, zeichnen);
  }

  /* ---------- Ziehen und Ablegen (Laptop) ---------- */
  const zonen = () => $$('[data-drop]', main);
  function aufraeumen() {
    gezogen = null;
    if (!main) return;
    $$('.zieht', main).forEach(x => x.classList.remove('zieht'));
    zonen().forEach(z => z.classList.remove('drop-ziel'));
  }
  function dragStart(e) {
    const li = e.target.closest && e.target.closest('.aufgabe[draggable="true"]');
    if (!li) return;
    gezogen = li.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', gezogen);
    li.classList.add('zieht');
  }
  function dragOver(e) {
    const zone = gezogen && e.target.closest && e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!zone.classList.contains('drop-ziel')) { zonen().forEach(z => z.classList.toggle('drop-ziel', z === zone)); }
  }
  function dragLeave(e) {
    const zone = e.target.closest && e.target.closest('[data-drop]');
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drop-ziel');
  }
  function drop(e) {
    const zone = gezogen && e.target.closest && e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    const t = taskById(gezogen);
    aufraeumen();
    if (t) A.tagSetzen(t, zone.dataset.drop || null);
  }

  views.woche = {
    titel: 'Woche',
    render(m, param) {
      main = m;
      alle = lesen(ALLE) === '1';
      montag = L.wochenTage(param && ISO.test(param) ? param : heuteIso())[0];
      zeichnen();
      stundenLaden();
      main.onclick = klick;
      main.onchange = aenderung;
      main.addEventListener('dragstart', dragStart);
      main.addEventListener('dragover', dragOver);
      main.addEventListener('dragleave', dragLeave);
      main.addEventListener('drop', drop);
      main.addEventListener('dragend', aufraeumen);
      uhr = setInterval(() => { if (app.S.laufend) stundenZeigen(); }, 30000);
    },
    /* Daten geändert (Aufgabe gespeichert, Timer gestartet/gestoppt): neu zeichnen, Stunden neu holen. */
    aktualisieren() {
      if (!main) return;
      A.neuZeichnenMitFokus(main, zeichnen);
      stundenLaden();
    },
    destroy() {
      A.menueZu();
      clearInterval(uhr); uhr = null;
      if (main) {
        main.removeEventListener('dragstart', dragStart);
        main.removeEventListener('dragover', dragOver);
        main.removeEventListener('dragleave', dragLeave);
        main.removeEventListener('drop', drop);
        main.removeEventListener('dragend', aufraeumen);
      }
      main = null; gezogen = null;
    }
  };
})();
