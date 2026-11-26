/* Tests für den Datenzugriff – laufen gegen den Demo-Speicher (LW_FORCE_DEMO). */
(function () {
  var t = LWTest.test, eq = LWTest.eq, ok = LWTest.ok;
  var D = function () { return window.LW.db; };
  var iso = function (n) { var d = new Date(); return window.LW.logic.isoTag(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };

  async function fehler(p) {
    try { await p; } catch (e) { return e.message; }
    return null;
  }
  async function aufgabe(titel) {
    var l = await D().tasks();
    return l.find(function (x) { return x.titel === titel; });
  }
  async function stoppeAlles() {
    var l = await D().laufend();
    if (l) await D().stoppeTimer(l.id);
  }

  t('db: Demo-Modus aktiv', function () {
    ok(D() && D().demo === true, 'LW.db.demo');
  });
  t('db: Beispieldaten sichtbar', async function () {
    var ich = await D().ich();
    eq(ich.name, 'Luca');
    var q = await D().quests();
    eq(q.map(function (x) { return x.name; }).sort(), ['Master', 'Mediawo', 'Sport']);
    var med = q.find(function (x) { return x.name === 'Mediawo'; });
    ok(med.geteilt && med.firma, 'Mediawo geteilt und firma');
    eq((await D().profile()).map(function (p) { return p.name; }).sort(), ['Kai', 'Luca']);
    var k = await D().kunden();
    ok(k.some(function (x) { return x.name === 'Susanne Kreutz'; }), 'Kunde Susanne Kreutz');
    var ts = await D().tasks();
    ok(ts.length >= 8, 'mindestens 8 Aufgaben');
    var heute = iso(0);
    ok(ts.some(function (x) { return x.tag && x.tag < heute && !x.erledigt_am && x.zugewiesen_an === ich.id; }), 'überfällige Aufgabe');
    ok(ts.some(function (x) { return x.zugewiesen_an && x.zugewiesen_an !== ich.id; }), 'Aufgabe für Kai');
    ok(ts.some(function (x) { return !x.zugewiesen_an; }), 'nicht zugewiesene Aufgabe');
    var z = await D().zeiten(iso(-6), iso(0));
    ok(z.length >= 6, 'Zeiten der letzten Tage');
    ok(z.some(function (x) { return window.LW.logic.isoTag(new Date(x.start)) === heute; }), 'Zeit heute');
  });
  t('db: kunden mit Firmenname und Person', async function () {
    var k = await D().kunden();
    ok(k.some(function (x) { return x.name === 'DeFORIS Unternehmensberatung (Sebastian Tsoleridis)'; }), 'Firma (Person)');
  });
  t('db: starteTimer stoppt laufenden', async function () {
    await stoppeAlles();
    var a = await aufgabe('Reel für Kreutz schneiden');
    var b = await aufgabe('Laufen 5 km');
    var za = await D().starteTimer(a);
    ok(!za.ende, 'A läuft');
    var zb = await D().starteTimer(b);
    var l = await D().laufend();
    eq(l.id, zb.id);
    var alle = await D().zeiten(iso(0), iso(0));
    var gA = alle.find(function (x) { return x.id === za.id; });
    ok(gA && gA.ende, 'A hat ende');
    eq(alle.filter(function (x) { return !x.ende && x.user_id === l.user_id; }).length, 1);
    await stoppeAlles();
  });
  t('db: abrechenbar-Vorgabe', async function () {
    await stoppeAlles();
    var med = await aufgabe('Reel für Kreutz schneiden');
    ok(med.kunde_id, 'Seed hat Kunde');
    var z1 = await D().starteTimer(med);
    eq(z1.abrechenbar, true);
    eq(z1.kunde_id, med.kunde_id);
    eq(z1.quest_id, med.quest_id);
    eq(z1.task_id, med.id);
    var ohne = await aufgabe('Rechnung prüfen');
    ok(!ohne.kunde_id, 'Seed ohne Kunde');
    var z2 = await D().starteTimer(ohne);
    eq(z2.abrechenbar, false);
    var master = await aufgabe('Kapitel 2 lesen');
    var z3 = await D().starteTimer(master);
    eq(z3.abrechenbar, false);
    await stoppeAlles();
  });
  t('db: deleteTask mit Zeit verweigert', async function () {
    var a = await aufgabe('Reel für Kreutz schneiden');
    var z = await D().starteTimer(a);
    await D().stoppeTimer(z.id);
    eq(await fehler(D().deleteTask(a.id)), 'Auf dieser Aufgabe ist Zeit gebucht. Archiviere sie stattdessen.');
    ok(await aufgabe('Reel für Kreutz schneiden'), 'Aufgabe noch da');
  });
  t('db: deleteTask ohne Zeit geht', async function () {
    var n = await D().saveTask({ quest_id: (await D().quests())[0].id, titel: 'Wegwerf' });
    ok(n.id && n.titel === 'Wegwerf');
    await D().deleteTask(n.id);
    eq(await aufgabe('Wegwerf'), undefined);
  });
  t('db: abgerechnete Zeit ist gesperrt', async function () {
    var z = (await D().zeiten(iso(-6), iso(0))).find(function (x) { return x.rechnung_id; });
    ok(z, 'Seed hat abgerechneten Eintrag');
    var msg = 'Diese Zeit ist abgerechnet und gesperrt.';
    eq(await fehler(D().saveZeit({ id: z.id, notiz: 'neu' })), msg);
    eq(await fehler(D().deleteZeit(z.id)), msg);
  });
  t('db: zeiten enthält laufenden Eintrag auch wenn älter', async function () {
    await stoppeAlles();
    var a = await aufgabe('Laufen 5 km');
    var z = await D().starteTimer(a);
    var alt = new Date(Date.now() - 3 * 86400000).toISOString();
    await D().saveZeit({ id: z.id, start: alt });
    var r = await D().zeiten(iso(0), iso(0));
    ok(r.some(function (x) { return x.id === z.id; }), 'laufender Eintrag dabei');
    await stoppeAlles();
  });
  t('db: Zeit nur mit passender Aufgabe', async function () {
    var a = await aufgabe('Laufen 5 km');
    var med = (await D().quests()).find(function (x) { return x.name === 'Mediawo'; });
    var msg = await fehler(D().saveZeit({ quest_id: med.id, task_id: a.id, start: new Date(Date.now() - 7200000).toISOString(), ende: new Date(Date.now() - 3600000).toISOString() }));
    eq(msg, 'Die Aufgabe gehört nicht zu dieser Quest.');
  });
  t('db: nur ein laufender Eintrag, Ende nach Start', async function () {
    await stoppeAlles();
    var a = await aufgabe('Laufen 5 km');
    var z = await D().starteTimer(a);
    var msg = await fehler(D().saveZeit({ quest_id: a.quest_id, task_id: a.id, start: new Date().toISOString() }));
    ok(msg, 'zweiter laufender Eintrag abgelehnt');
    var msg2 = await fehler(D().stoppeTimer(z.id, new Date(Date.now() - 86400000).toISOString()));
    ok(msg2, 'Ende vor Start abgelehnt');
    await stoppeAlles();
  });
  t('db: Teilen beenden', async function () {
    var med = (await D().quests()).find(function (x) { return x.name === 'Mediawo'; });
    var r = await D().saveQuest({ id: med.id, geteilt: false, name: 'Mediawo' });
    eq(r.geteilt, false);
    eq((await D().quests()).find(function (x) { return x.id === med.id; }).geteilt, false);
    await D().saveQuest({ id: med.id, geteilt: true });
    eq((await D().quests()).find(function (x) { return x.id === med.id; }).geteilt, true);
  });
  t('db: Besitzer sieht Kais Zeiten auf eigener Quest auch nach dem Teilen', async function () {
    var med = (await D().quests()).find(function (x) { return x.name === 'Mediawo'; });
    var kaiVorher = (await D().zeiten(iso(-6), iso(0))).filter(function (z) { return z.user_id === 'u-kai'; }).length;
    ok(kaiVorher > 0, 'Kai hat Zeiten auf Mediawo');
    await D().saveQuest({ id: med.id, geteilt: false });
    try {
      var kaiNachher = (await D().zeiten(iso(-6), iso(0))).filter(function (z) { return z.user_id === 'u-kai'; }).length;
      eq(kaiNachher, kaiVorher, 'Kais Zeiten bleiben für den Besitzer sichtbar');
    } finally { await D().saveQuest({ id: med.id, geteilt: true }); }
  });
  /* ---------------- Ordner ---------------- */
  async function quest(name) {
    return (await D().quests()).find(function (x) { return x.name === name; });
  }
  async function ordnerVon(questName) {
    var q = await quest(questName);
    return (await D().ordner()).filter(function (o) { return o.quest_id === q.id; });
  }
  async function ordnerNamens(questName, name) {
    return (await ordnerVon(questName)).find(function (o) { return o.name === name; });
  }
  async function zeitenVon(taskId) {
    return (await D().zeiten(iso(-30), iso(0))).filter(function (z) { return z.task_id === taskId; });
  }
  var SUSANNE = 'Susanne Kreutz', DEFORIS = 'DeFORIS Unternehmensberatung (Sebastian Tsoleridis)';

  t('ordner: Beispielstruktur', async function () {
    eq(D().ordnerVerfuegbar, true);
    var m = await ordnerVon('Mediawo');
    var intern = m.filter(function (o) { return o.art === 'intern'; });
    var extern = m.filter(function (o) { return o.art === 'extern'; });
    eq(intern.length, 1, 'ein Intern');
    eq(extern.length, 1, 'ein Extern');
    eq(intern[0].name, 'Intern');
    eq(extern[0].name, 'Extern');
    var sus = m.find(function (o) { return o.art === 'kunde' && o.name === SUSANNE; });
    ok(sus && sus.eltern_id === extern[0].id && sus.kunde_id, 'Susanne unter Extern');
    eq(m.filter(function (o) { return o.eltern_id === sus.id; }).map(function (o) { return o.art + ':' + o.name; }).sort(), ['projekt:Reels', 'projekt:Website']);
    var def = m.find(function (o) { return o.art === 'kunde' && o.name === DEFORIS; });
    ok(def && def.eltern_id === extern[0].id, 'DeFORIS unter Extern');
    eq(m.filter(function (o) { return o.eltern_id === def.id; }).map(function (o) { return o.name; }), ['Angebot']);
    eq(m.filter(function (o) { return o.eltern_id === intern[0].id; }).map(function (o) { return o.name; }), ['Marketing']);
    var master = await ordnerVon('Master');
    eq(master.map(function (o) { return o.art + ':' + o.name + ':' + o.eltern_id; }), ['projekt:Thesis:null']);
    eq((await ordnerVon('Sport')).length, 0);
    // Aufgaben einsortiert, Kunde aus dem Ordner
    var reel = await aufgabe('Reel für Kreutz schneiden');
    eq(reel.ordner_id, (await ordnerNamens('Mediawo', 'Reels')).id);
    eq(reel.kunde_id, sus.kunde_id);
    eq((await aufgabe('Angebot DeFORIS nachfassen')).kunde_id, def.kunde_id);
    eq((await aufgabe('Rechnung prüfen')).ordner_id, null, 'eine Mediawo-Aufgabe ohne Ordner');
  });

  t('ordner: Kunde folgt Ordner', async function () {
    var med = await quest('Mediawo');
    var website = await ordnerNamens('Mediawo', 'Website');
    var marketing = await ordnerNamens('Mediawo', 'Marketing');
    var sus = await ordnerNamens('Mediawo', SUSANNE);
    var def = await ordnerNamens('Mediawo', DEFORIS);
    var a = await D().saveTask({ quest_id: med.id, titel: 'Ordnertest Kunde', ordner_id: website.id, kunde_id: def.kunde_id });
    eq(a.ordner_id, website.id);
    eq(a.kunde_id, sus.kunde_id, 'Kunde aus dem Ordner, nicht vom Client');
    var b = await D().saveTask({ id: a.id, ordner_id: marketing.id });
    eq(b.kunde_id, null);
    var c = await D().saveTask({ id: a.id, ordner_id: sus.id });
    eq(c.kunde_id, sus.kunde_id, 'direkt im Kunden-Ordner');
    var d = await D().saveTask({ id: a.id, ordner_id: null });
    eq(d.kunde_id, null, 'ohne Ordner kein Kunde');
    var fremd = (await ordnerVon('Master'))[0];
    eq(await fehler(D().saveTask({ id: a.id, ordner_id: fremd.id })), 'Dieser Ordner gehört zu einer anderen Quest.');
    eq(await fehler(D().saveTask({ id: a.id, ordner_id: 'gibt-es-nicht' })), 'Diesen Ordner gibt es nicht.');
    await D().deleteTask(a.id);
  });

  t('ordner: Umsortieren nimmt Zeit mit', async function () {
    var task = await aufgabe('Newsletter-Vorlage');
    var marketing = await ordnerNamens('Mediawo', 'Marketing');
    var website = await ordnerNamens('Mediawo', 'Website');
    var reels = await ordnerNamens('Mediawo', 'Reels');
    var sus = await ordnerNamens('Mediawo', SUSANNE);
    eq(task.ordner_id, marketing.id, 'Seed: in Marketing');
    var vorher = await zeitenVon(task.id);
    var luca = vorher.find(function (z) { return z.user_id === 'u-luca' && !z.rechnung_id; });
    var kai = vorher.find(function (z) { return z.user_id === 'u-kai'; });
    var gebucht = vorher.find(function (z) { return z.rechnung_id; });
    ok(luca && kai && gebucht, 'Seed: Luca, Kai und abgerechneter Eintrag');
    eq([luca.kunde_id, luca.abrechenbar, kai.kunde_id, kai.abrechenbar], [null, false, null, false]);

    var r = await D().saveTask({ id: task.id, ordner_id: website.id });
    eq(r.kunde_id, sus.kunde_id);
    var nach = await zeitenVon(task.id);
    var l2 = nach.find(function (z) { return z.id === luca.id; });
    var k2 = nach.find(function (z) { return z.id === kai.id; });
    var g2 = nach.find(function (z) { return z.id === gebucht.id; });
    eq([l2.kunde_id, l2.abrechenbar], [sus.kunde_id, true], 'Lucas Eintrag');
    eq([k2.kunde_id, k2.abrechenbar], [sus.kunde_id, true], 'Kais Eintrag');
    eq(g2, gebucht, 'abgerechneter Eintrag unverändert');

    await D().saveZeit({ id: luca.id, abrechenbar: false });
    await D().saveTask({ id: task.id, ordner_id: reels.id });
    var nach2 = await zeitenVon(task.id);
    eq(nach2.find(function (z) { return z.id === luca.id; }).abrechenbar, false, 'von Hand umgeschaltet bleibt');
    eq(nach2.find(function (z) { return z.id === kai.id; }).abrechenbar, true);
    eq(nach2.find(function (z) { return z.id === gebucht.id; }), gebucht);
  });

  t('ordner: laufender Timer zieht mit', async function () {
    await stoppeAlles();
    var med = await quest('Mediawo');
    var marketing = await ordnerNamens('Mediawo', 'Marketing');
    var website = await ordnerNamens('Mediawo', 'Website');
    var sus = await ordnerNamens('Mediawo', SUSANNE);
    var a = await D().saveTask({ quest_id: med.id, titel: 'Timertest Ordner', ordner_id: marketing.id });
    var z = await D().starteTimer(a);
    eq([z.kunde_id, z.abrechenbar], [null, false]);
    await D().saveTask({ id: a.id, ordner_id: website.id });
    var l = await D().laufend();
    eq(l.id, z.id);
    eq([l.kunde_id, l.abrechenbar, l.ende], [sus.kunde_id, true, null]);
    await stoppeAlles();
  });

  t('ordner: Projekt umziehen nimmt Kunden mit', async function () {
    var angebot = await ordnerNamens('Mediawo', 'Angebot');
    var sus = await ordnerNamens('Mediawo', SUSANNE);
    var def = await ordnerNamens('Mediawo', DEFORIS);
    var intern = (await ordnerVon('Mediawo')).find(function (o) { return o.art === 'intern'; });
    var carousel = await aufgabe('Carousel-Entwurf');
    eq(carousel.ordner_id, angebot.id, 'Seed: Carousel in Angebot');
    var kaiZeit = (await zeitenVon(carousel.id)).find(function (z) { return z.user_id === 'u-kai'; });
    ok(kaiZeit, 'Seed: Kai hat Zeit auf Carousel');
    await D().saveOrdner({ id: angebot.id, eltern_id: intern.id });
    eq((await aufgabe('Carousel-Entwurf')).kunde_id, null);
    var z1 = (await zeitenVon(carousel.id)).find(function (z) { return z.id === kaiZeit.id; });
    eq([z1.kunde_id, z1.abrechenbar], [null, false]);
    await D().saveOrdner({ id: angebot.id, eltern_id: sus.id });
    eq((await aufgabe('Carousel-Entwurf')).kunde_id, sus.kunde_id);
    await D().saveOrdner({ id: angebot.id, eltern_id: def.id });
    eq((await aufgabe('Carousel-Entwurf')).kunde_id, def.kunde_id);
    var z2 = (await zeitenVon(carousel.id)).find(function (z) { return z.id === kaiZeit.id; });
    eq([z2.kunde_id, z2.abrechenbar], [def.kunde_id, true]);
  });

  t('ordner: Struktur wird geprüft', async function () {
    var med = await quest('Mediawo');
    var m = await ordnerVon('Mediawo');
    var intern = m.find(function (o) { return o.art === 'intern'; });
    var extern = m.find(function (o) { return o.art === 'extern'; });
    var website = m.find(function (o) { return o.name === 'Website'; });
    var sus = m.find(function (o) { return o.name === SUSANNE; });
    var atelier = (await D().kunden()).find(function (k) { return k.name === 'Atelier dentaire Arnoldy S.à r.l.'; });
    eq(await fehler(D().saveOrdner({ quest_id: med.id, art: 'kunde', kunde_id: atelier.id, eltern_id: intern.id })), 'Hier kann dieser Ordner nicht liegen.');
    eq(await fehler(D().saveOrdner({ quest_id: med.id, art: 'intern', name: 'Intern' })), 'Intern und Extern werden automatisch angelegt.');
    eq(await fehler(D().saveOrdner({ id: extern.id, name: 'Draußen' })), 'Intern und Extern können nicht geändert werden.');
    eq(await fehler(D().saveOrdner({ id: intern.id, archiviert: true })), 'Intern und Extern können nicht geändert werden.');
    eq(await fehler(D().saveOrdner({ quest_id: med.id, art: 'projekt', name: 'Lose' })), 'Hier kann dieser Ordner nicht liegen.');
    eq(await fehler(D().saveOrdner({ quest_id: med.id, art: 'projekt', name: 'Tief', eltern_id: website.id })), 'Hier kann dieser Ordner nicht liegen.');
    eq(await fehler(D().saveOrdner({ quest_id: med.id, art: 'projekt', name: '   ', eltern_id: intern.id })), 'Bitte einen Namen eingeben.');
    eq(await fehler(D().saveOrdner({ quest_id: med.id, art: 'kunde', eltern_id: extern.id })), 'Bitte einen Kunden wählen.');
    eq(await fehler(D().saveOrdner({ quest_id: med.id, art: 'kunde', eltern_id: extern.id, kunde_id: sus.kunde_id })), 'Für diesen Kunden gibt es in dieser Quest schon einen Ordner.');
    eq(await fehler(D().saveOrdner({ quest_id: med.id, art: 'projekt', name: 'X', eltern_id: intern.id, kunde_id: sus.kunde_id })), 'Nur Kunden-Ordner haben einen Kunden.');
    eq(await fehler(D().saveOrdner({ id: website.id, art: 'kunde' })), 'Art und Quest eines Ordners können nicht geändert werden.');
    eq(await fehler(D().saveOrdner({ id: sus.id, kunde_id: atelier.id })), 'Der Kunde eines Ordners kann nicht geändert werden.');
    var master = (await ordnerVon('Master'))[0];
    eq(await fehler(D().saveOrdner({ quest_id: med.id, art: 'projekt', name: 'Quer', eltern_id: master.id })), 'Dieser Ordner gehört zu einer anderen Quest.');
    // Kunden-Ordner: Name kommt aus kunden
    var neu = await D().saveOrdner({ quest_id: med.id, art: 'kunde', kunde_id: atelier.id, eltern_id: extern.id, name: 'egal' });
    eq([neu.name, neu.eltern_id, neu.archiviert], [atelier.name, extern.id, false]);
    // Projekt: Name getrimmt, Umbenennen geht
    var p = await D().saveOrdner({ quest_id: med.id, art: 'projekt', name: '  Implantate  ', eltern_id: neu.id });
    eq(p.name, 'Implantate');
    eq((await D().saveOrdner({ id: p.id, name: 'Prothetik' })).name, 'Prothetik');
    eq((await ordnerNamens('Mediawo', 'Prothetik')).id, p.id);
  });

  t('ordner: Löschen nur leer', async function () {
    var med = await quest('Mediawo');
    var m = await ordnerVon('Mediawo');
    var intern = m.find(function (o) { return o.art === 'intern'; });
    var website = m.find(function (o) { return o.name === 'Website'; });
    var sus = m.find(function (o) { return o.name === SUSANNE; });
    var msg = 'Der Ordner ist nicht leer. Archiviere ihn stattdessen.';
    eq(await fehler(D().deleteOrdner(website.id)), msg);
    eq(await fehler(D().deleteOrdner(sus.id)), msg, 'hat Unterordner');
    eq(await fehler(D().deleteOrdner(intern.id)), 'Intern und Extern können nicht geändert werden.');
    var leer = await D().saveOrdner({ quest_id: med.id, art: 'projekt', name: 'Leer', eltern_id: intern.id });
    await D().deleteOrdner(leer.id);
    eq(await ordnerNamens('Mediawo', 'Leer'), undefined);
    ok(await ordnerNamens('Mediawo', 'Website'), 'Website noch da');
  });

  t('ordner: Archiv vererbt sich', async function () {
    var med = await quest('Mediawo');
    var sus = await ordnerNamens('Mediawo', SUSANNE);
    var website = await ordnerNamens('Mediawo', 'Website');
    var reels = await ordnerNamens('Mediawo', 'Reels');
    var texte = await aufgabe('Website-Texte für Kreutz');
    eq(texte.ordner_id, website.id, 'Seed: Texte in Website');
    await D().saveOrdner({ id: sus.id, archiviert: true });
    try {
      eq([(await ordnerNamens('Mediawo', 'Website')).archiviert, (await ordnerNamens('Mediawo', 'Reels')).archiviert], [true, true]);
      eq(await fehler(D().saveTask({ quest_id: med.id, titel: 'Archivtest', ordner_id: website.id })), 'In einen archivierten Ordner kann nichts einsortiert werden.');
      eq(await aufgabe('Archivtest'), undefined);
      eq(await fehler(D().saveTask({ id: (await aufgabe('Rechnung prüfen')).id, ordner_id: reels.id })), 'In einen archivierten Ordner kann nichts einsortiert werden.');
      eq(await fehler(D().saveOrdner({ quest_id: med.id, art: 'projekt', name: 'Neu', eltern_id: sus.id })), 'In einen archivierten Ordner kann nichts einsortiert werden.');
      eq(await fehler(D().saveOrdner({ id: website.id, archiviert: false })), 'Der übergeordnete Ordner ist archiviert.');
      eq((await D().saveTask({ id: texte.id, titel: 'Website-Texte für Kreutz', notiz: 'liegt im Archiv' })).ordner_id, website.id, 'Aufgabe im Archiv bleibt bearbeitbar');
    } finally {
      await D().saveOrdner({ id: sus.id, archiviert: false });
    }
    eq([(await ordnerNamens('Mediawo', 'Website')).archiviert, (await ordnerNamens('Mediawo', 'Reels')).archiviert], [false, false]);
  });

  t('ordner: Firma an und aus', async function () {
    var master = await quest('Master');
    var thesis = await ordnerNamens('Master', 'Thesis');
    var kapitel = await aufgabe('Kapitel 2 lesen');
    eq(kapitel.ordner_id, thesis.id, 'Seed: Kapitel in Thesis');
    await D().saveQuest({ id: master.id, firma: true });
    var m = await ordnerVon('Master');
    var intern = m.filter(function (o) { return o.art === 'intern'; });
    var extern = m.filter(function (o) { return o.art === 'extern'; });
    eq([intern.length, extern.length], [1, 1]);
    eq([intern[0].name, extern[0].name], ['Intern', 'Extern']);
    eq(m.find(function (o) { return o.id === thesis.id; }).eltern_id, intern[0].id, 'Thesis unter Intern');
    var direkt = await D().saveTask({ quest_id: master.id, titel: 'Firmatest direkt', ordner_id: intern[0].id });
    await D().saveQuest({ id: master.id, firma: true }); // nochmal an: nichts doppelt
    eq((await ordnerVon('Master')).length, 3);

    await D().saveQuest({ id: master.id, firma: false });
    m = await ordnerVon('Master');
    eq(m.map(function (o) { return o.art + ':' + o.name + ':' + o.eltern_id; }), ['projekt:Thesis:null']);
    var d2 = await aufgabe('Firmatest direkt');
    ok(d2, 'Aufgabe nicht verloren');
    eq([d2.ordner_id, d2.kunde_id], [null, null]);
    eq((await aufgabe('Kapitel 2 lesen')).ordner_id, thesis.id);
    await D().deleteTask(direkt.id);

    var med = await quest('Mediawo');
    eq(await fehler(D().saveQuest({ id: med.id, firma: false })), 'Diese Quest hat Kunden-Ordner. Firma kann erst ausgeschaltet werden, wenn es keine mehr gibt.');
    eq((await quest('Mediawo')).firma, true);
    eq((await ordnerVon('Mediawo')).filter(function (o) { return o.art === 'intern' || o.art === 'extern'; }).length, 2);
  });

  t('ordner: neue Firma-Quest und Quest löschen', async function () {
    var q = await D().saveQuest({ name: 'Ordner-Wegwerf', firma: true });
    var m = await ordnerVon('Ordner-Wegwerf');
    eq(m.map(function (o) { return o.art; }).sort(), ['extern', 'intern']);
    var intern = m.find(function (o) { return o.art === 'intern'; });
    await D().saveOrdner({ quest_id: q.id, art: 'projekt', name: 'Etwas', eltern_id: intern.id });
    await D().deleteQuest(q.id);
    eq((await D().ordner()).filter(function (o) { return o.quest_id === q.id; }).length, 0);
    var p = await D().saveQuest({ name: 'Ordner-Privat' });
    var proj = await D().saveOrdner({ quest_id: p.id, art: 'projekt', name: 'Oben' });
    eq(proj.eltern_id, null, 'Projekt ganz oben in Nicht-Firma-Quest');
    await D().deleteOrdner(proj.id);
    await D().deleteQuest(p.id);
  });
})();
