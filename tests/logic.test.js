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
})();
