/* Reine Datums- und Dauerfunktionen – ohne DOM, ohne Datenbank. */
window.LW = window.LW || {};
(function () {
  function p2(n) { return (n < 10 ? '0' : '') + n; }

  /* Lokales Datum als 'YYYY-MM-DD'. */
  function isoTag(d) {
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  /* Montag bis Sonntag der Woche, in der der Tag liegt. */
  function wochenTage(iso) {
    var teile = iso.split('-');
    var d = new Date(+teile[0], +teile[1] - 1, +teile[2]);
    var offset = (d.getDay() + 6) % 7; /* Montag = 0 */
    var tage = [];
    for (var i = 0; i < 7; i++) {
      tage.push(isoTag(new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset + i)));
    }
    return tage;
  }

  /* Ganze Sekunden zwischen start und ende (oder jetzt, wenn die Zeit läuft). */
  function dauerSek(zeit, jetzt) {
    var ende = zeit.ende ? new Date(zeit.ende) : jetzt;
    return Math.max(0, Math.floor((ende.getTime() - new Date(zeit.start).getTime()) / 1000));
  }

  function formatDauer(sek) {
    var min = Math.floor(sek / 60);
    var h = Math.floor(min / 60);
    return h > 0 ? h + 'h ' + p2(min % 60) + 'm' : min + 'm';
  }

  function formatTimer(sek) {
    return Math.floor(sek / 3600) + ':' + p2(Math.floor(sek / 60) % 60) + ':' + p2(sek % 60);
  }

  window.LW.logic = { isoTag: isoTag, wochenTage: wochenTage, dauerSek: dauerSek, formatDauer: formatDauer, formatTimer: formatTimer };
})();
