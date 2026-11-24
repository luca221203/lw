(function () {
  var t = LWTest.test, eq = LWTest.eq;
  var L = function () { return window.LW && window.LW.logic; };

  t('isoTag lokal', function () {
    eq(L().isoTag(new Date(2026, 10, 24, 23, 30)), '2026-11-24');
  });
  t('wochenTage Donnerstag', function () {
    eq(L().wochenTage('2026-11-26'), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
  });
  t('wochenTage Sonntag gehört zur Woche ab Montag', function () {
    eq(L().wochenTage('2026-11-29')[0], '2026-11-23');
  });
  t('kalenderwoche ISO (Montag-Start)', function () {
    eq(L().kalenderwoche('2026-11-23'), 48);
    eq(L().kalenderwoche('2026-01-01'), 1);
    eq(L().kalenderwoche('2026-12-31'), 53);
    eq(L().kalenderwoche('2027-01-01'), 53);
  });
  t('dauerSek abgeschlossen', function () {
    eq(L().dauerSek({ start: '2026-11-24T08:00:00Z', ende: '2026-11-24T09:30:15Z' }, new Date()), 5415);
  });
  t('dauerSek laufend nutzt jetzt', function () {
    eq(L().dauerSek({ start: '2026-11-24T08:00:00Z', ende: null }, new Date('2026-11-24T08:01:05Z')), 65);
  });
  t('formatDauer', function () {
    eq(L().formatDauer(0), '0m');
    eq(L().formatDauer(2700), '45m');
    eq(L().formatDauer(3600), '1h 00m');
    eq(L().formatDauer(11400), '3h 10m');
  });
  t('formatTimer', function () {
    eq(L().formatTimer(5), '0:00:05');
    eq(L().formatTimer(3723), '1:02:03');
  });
  /* ---- Auswertung ---- */
  var ME = 'luca', KAI = 'kai', HEUTE = '2026-11-24';
  var quests = [
    { id: 'qm', owner_id: ME, name: 'Mediawo', farbe: '#00f', geteilt: true, firma: true, sortierung: 1, archiviert: false },
    { id: 'qs', owner_id: ME, name: 'Sport', farbe: '#0f0', geteilt: false, firma: false, sortierung: 2, archiviert: false },
    { id: 'qx', owner_id: ME, name: 'Master', farbe: '#f00', geteilt: false, firma: false, sortierung: 3, archiviert: false },
    { id: 'qa', owner_id: ME, name: 'Alt', farbe: '#999', geteilt: false, firma: false, sortierung: 0, archiviert: true }
  ];
  function tk(id, quest, o) {
    var b = { id: id, quest_id: quest, titel: id, notiz: '', tag: null, zugewiesen_an: null, kunde_id: null, erledigt_am: null, sortierung: 0, archiviert: false, created_by: ME };
    for (var k in o) b[k] = o[k];
    return b;
  }
  var tasks = [
    tk('ueber', 'qm', { tag: '2026-11-20', zugewiesen_an: ME, sortierung: 5 }),
    tk('heute', 'qm', { tag: HEUTE, zugewiesen_an: ME, sortierung: 1 }),
    tk('morgen', 'qm', { tag: '2026-11-25', zugewiesen_an: ME }),
    tk('fertigHeute', 'qm', { tag: HEUTE, zugewiesen_an: ME, erledigt_am: '2026-11-24T10:00:00' }),
    tk('fertigGestern', 'qm', { tag: '2026-11-23', zugewiesen_an: ME, erledigt_am: '2026-11-23T10:00:00' }),
    tk('kai', 'qm', { tag: HEUTE, zugewiesen_an: KAI }),
    tk('frei', 'qm', { tag: HEUTE, zugewiesen_an: null, sortierung: 2 }),
    tk('archiv', 'qm', { tag: HEUTE, zugewiesen_an: ME, archiviert: true }),
    tk('privat', 'qx', { tag: null, sortierung: 1 }),
    tk('altTask', 'qa', { tag: HEUTE })
  ];
  function ids(a) { return a.map(function (x) { return x.id; }); }

  t('heuteAnsicht Auswahl und Reihenfolge', function () {
    var r = L().heuteAnsicht(quests, tasks, ME, HEUTE);
    eq(r.map(function (g) { return g.quest.id; }), ['qm', 'qs', 'qx']);
    eq(ids(r[0].tasks), ['ueber', 'heute', 'frei', 'fertigHeute']);
    eq(r[1].tasks, []);
    eq(ids(r[2].tasks), []);
  });
  t('istUeberfaellig', function () {
    eq(L().istUeberfaellig(tasks[0], HEUTE), true);
    eq(L().istUeberfaellig(tasks[1], HEUTE), false);
    eq(L().istUeberfaellig(tasks[4], HEUTE), false);
    eq(L().istUeberfaellig(tk('o', 'qm', {}), HEUTE), false);
  });
  t('backlog niemand', function () {
    eq(ids(L().backlog(tasks, quests, { person: 'niemand' }, ME)), ['frei']);
  });
  t('backlog ich', function () {
    eq(ids(L().backlog(tasks, quests, { person: 'ich' }, ME)), ['ueber', 'heute', 'morgen', 'privat']);
  });
  t('backlog ohneTag und alle', function () {
    eq(ids(L().backlog(tasks, quests, { ohneTag: true }, ME)), ['privat']);
    eq(ids(L().backlog(tasks, quests, {}, ME)), ['ueber', 'kai', 'heute', 'frei', 'morgen', 'privat']);
    eq(ids(L().backlog(tasks, quests, { questId: 'qx' }, ME)), ['privat']);
  });

  function z(id, user, quest, task, kunde, von, bis, abr) {
    return { id: id, user_id: user, quest_id: quest, task_id: task, kunde_id: kunde, start: von.toISOString(), ende: bis ? bis.toISOString() : null, abrechenbar: !!abr, notiz: '', rechnung_id: null };
  }
  var JETZT = new Date(2026, 10, 24, 12, 0);
  var zeiten = [
    z('z1', ME, 'qm', 'heute', 'k1', new Date(2026, 10, 24, 8, 0), new Date(2026, 10, 24, 10, 0), true),
    z('z2', ME, 'qm', null, null, new Date(2026, 10, 24, 11, 0), new Date(2026, 10, 24, 12, 0), false),
    z('z3', KAI, 'qm', 'kai', 'k1', new Date(2026, 10, 24, 9, 0), new Date(2026, 10, 24, 9, 30), true),
    z('z4', ME, 'qs', null, null, new Date(2026, 10, 24, 6, 0), new Date(2026, 10, 24, 6, 20), false)
  ];

  t('summeProQuest Mitternacht zählt am Starttag', function () {
    var n = [z('n', ME, 'qs', null, null, new Date(2026, 10, 24, 23, 0), new Date(2026, 10, 25, 1, 0), false)];
    eq(L().summeProQuest(n, '2026-11-24', '2026-11-24', JETZT), { qs: 7200 });
    eq(L().summeProQuest(n, '2026-11-25', '2026-11-25', JETZT), {});
  });
  t('rueckblick Firma', function () {
    var r = L().rueckblick(zeiten, quests, tasks, [{ id: 'k1', name: 'K1' }], '2026-11-24', '2026-11-24', JETZT);
    eq(r.firma.gesamtSek, 12600);
    eq(r.firma.abrechenbarSek, 9000);
    eq(r.firma.personen, [{ user_id: ME, sek: 10800, abrechenbarSek: 7200 }, { user_id: KAI, sek: 1800, abrechenbarSek: 1800 }]);
    eq(r.firma.kunden.map(function (k) { return [k.kunde && k.kunde.id, k.sek, k.abrechenbarSek]; }), [['k1', 9000, 9000], [null, 3600, 0]]);
    eq(r.gesamtSek, 13800);
    eq(r.quests.map(function (q) { return [q.quest.id, q.sek]; }), [['qm', 12600], ['qs', 1200]]);
    eq(r.quests[0].tasks.map(function (x) { return [x.task && x.task.id, x.sek]; }), [['heute', 7200], [null, 3600], ['kai', 1800]]);
  });
  t('laufendZuLange', function () {
    var s = new Date(2026, 10, 24, 0, 0);
    var lauf = { start: s.toISOString(), ende: null };
    eq(L().laufendZuLange(lauf, new Date(2026, 10, 24, 12, 0, 1)), true);
    eq(L().laufendZuLange(lauf, new Date(2026, 10, 24, 11, 59)), false);
    eq(L().laufendZuLange({ start: s.toISOString(), ende: new Date(2026, 10, 25).toISOString() }, new Date(2026, 10, 26)), false);
  });
  /* ---- Befehlsleiste ---- */
  var cmdDaten = [
    { text: 'Heute' }, { text: 'Fokus' }, { text: 'Rückblick' },
    { text: 'Susanne Kreutz Website', extra: 'Mediawo' },
    { text: 'Überweisung prüfen', extra: 'Privat' },
    { text: 'Steuer Quartal', extra: 'Mediawo' }
  ];
  var cmdTexte = function (q) { return L().befehlsSuche(q, cmdDaten).map(function (e) { return e.text; }); };
  t('befehlsSuche: Teilwort „fok“ findet Fokus', function () {
    eq(cmdTexte('fok')[0], 'Fokus');
  });
  t('befehlsSuche: Quest-Name und Titel zusammen', function () {
    eq(cmdTexte('mediawo susanne'), ['Susanne Kreutz Website']);
  });
  t('befehlsSuche: Umlaute egal (uber, ueber, Über)', function () {
    eq(cmdTexte('uber'), ['Überweisung prüfen']);
    eq(cmdTexte('ueber'), ['Überweisung prüfen']);
    eq(cmdTexte('ÜBER'), ['Überweisung prüfen']);
    eq(cmdTexte('ruckblick'), ['Rückblick']);
    eq(cmdTexte('rueckblick'), ['Rückblick']);
  });
  t('befehlsSuche: Wortanfang vor Teiltreffer, leere Eingabe alle, kein Treffer leer', function () {
    eq(cmdTexte('').length, 6);
    eq(cmdTexte('xyzq'), []);
    eq(L().befehlsSuche('he', [{ text: 'Sache' }, { text: 'Heute' }])[0].text, 'Heute');
    eq(L().befehlsSuche('uebe', [{ text: 'Neue Aufgabe', extra: 'Aktion' }, { text: 'Fokus', extra: 'laufende Aufgabe' }]), []);
  });
})();
