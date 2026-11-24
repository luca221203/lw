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
})();
