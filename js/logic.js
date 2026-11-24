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

  /* ---- Auswertung ---- */
  function offen(t) { return !t.erledigt_am; }
  function erledigtTag(t) { return t.erledigt_am ? isoTag(new Date(t.erledigt_am)) : null; }
  function nachSort(a, b) { return (a.sortierung || 0) - (b.sortierung || 0); }
  function aktiveQuests(quests) {
    return quests.filter(function (q) { return !q.archiviert; });
  }

  function istUeberfaellig(task, heute) {
    return offen(task) && task.tag != null && task.tag < heute;
  }

  function heuteAnsicht(quests, tasks, meId, heute) {
    return aktiveQuests(quests).slice().sort(nachSort).map(function (q) {
      var liste = tasks.filter(function (t) {
        if (t.quest_id !== q.id || t.archiviert) return false;
        if (q.geteilt && t.zugewiesen_an != null && t.zugewiesen_an !== meId) return false;
        if (offen(t)) return t.tag != null && t.tag <= heute;
        return erledigtTag(t) === heute;
      });
      liste.sort(function (a, b) {
        var ao = offen(a), bo = offen(b);
        if (ao !== bo) return ao ? -1 : 1;
        if (ao) {
          var au = istUeberfaellig(a, heute), bu = istUeberfaellig(b, heute);
          if (au !== bu) return au ? -1 : 1;
        }
        return nachSort(a, b);
      });
      return { quest: q, tasks: liste };
    });
  }

  function backlog(tasks, quests, filter, meId) {
    filter = filter || {};
    var map = {};
    aktiveQuests(quests).forEach(function (q) { map[q.id] = q; });
    var r = tasks.filter(function (t) {
      var q = map[t.quest_id];
      if (!q || t.archiviert || !offen(t)) return false;
      if (filter.questId && t.quest_id !== filter.questId) return false;
      if (filter.ohneTag && t.tag != null) return false;
      if (filter.person === 'ich') {
        return t.zugewiesen_an === meId || (!q.geteilt && t.zugewiesen_an == null);
      }
      if (filter.person === 'niemand') return q.geteilt && t.zugewiesen_an == null;
      return true;
    });
    r.sort(function (a, b) {
      if ((a.tag == null) !== (b.tag == null)) return a.tag == null ? 1 : -1;
      if (a.tag !== b.tag && a.tag != null) return a.tag < b.tag ? -1 : 1;
      return nachSort(a, b);
    });
    return r;
  }

  function imZeitraum(zeit, von, bis) {
    var tag = isoTag(new Date(zeit.start));
    return tag >= von && tag <= bis;
  }

  function summeProQuest(zeiten, vonIso, bisIso, jetzt) {
    var r = {};
    zeiten.forEach(function (z) {
      if (!imZeitraum(z, vonIso, bisIso)) return;
      r[z.quest_id] = (r[z.quest_id] || 0) + dauerSek(z, jetzt);
    });
    return r;
  }

  function nachSekAbsteigend(a, b) { return b.sek - a.sek; }

  function rueckblick(zeiten, quests, tasks, kunden, vonIso, bisIso, jetzt) {
    var questMap = {}, taskMap = {}, kundeMap = {};
    quests.forEach(function (q) { questMap[q.id] = q; });
    tasks.forEach(function (t) { taskMap[t.id] = t; });
    kunden.forEach(function (k) { kundeMap[k.id] = k; });
    var res = { gesamtSek: 0, quests: [], firma: { gesamtSek: 0, abrechenbarSek: 0, kunden: [], personen: [] } };
    var qAgg = {}, kAgg = {}, pAgg = {};
    zeiten.forEach(function (z) {
      if (!imZeitraum(z, vonIso, bisIso)) return;
      var q = questMap[z.quest_id];
      if (!q) return;
      var sek = dauerSek(z, jetzt);
      var abr = z.abrechenbar ? sek : 0;
      res.gesamtSek += sek;
      var qa = qAgg[q.id] || (qAgg[q.id] = { quest: q, sek: 0, tm: {}, tl: [] });
      qa.sek += sek;
      var tid = z.task_id && taskMap[z.task_id] ? z.task_id : '';
      var te = qa.tm[tid];
      if (!te) { te = qa.tm[tid] = { task: tid ? taskMap[tid] : null, sek: 0 }; qa.tl.push(te); }
      te.sek += sek;
      if (q.firma) {
        var f = res.firma;
        f.gesamtSek += sek;
        f.abrechenbarSek += abr;
        var kid = z.kunde_id && kundeMap[z.kunde_id] ? z.kunde_id : '';
        var ke = kAgg[kid] || (kAgg[kid] = { kunde: kid ? kundeMap[kid] : null, sek: 0, abrechenbarSek: 0 });
        ke.sek += sek; ke.abrechenbarSek += abr;
        var pe = pAgg[z.user_id] || (pAgg[z.user_id] = { user_id: z.user_id, sek: 0, abrechenbarSek: 0 });
        pe.sek += sek; pe.abrechenbarSek += abr;
      }
    });
    Object.keys(qAgg).forEach(function (id) {
      var a = qAgg[id];
      res.quests.push({ quest: a.quest, sek: a.sek, tasks: a.tl.sort(nachSekAbsteigend) });
    });
    res.quests.sort(nachSekAbsteigend);
    Object.keys(kAgg).forEach(function (k) { res.firma.kunden.push(kAgg[k]); });
    Object.keys(pAgg).forEach(function (k) { res.firma.personen.push(pAgg[k]); });
    res.firma.kunden.sort(nachSekAbsteigend);
    res.firma.personen.sort(nachSekAbsteigend);
    return res;
  }

  function laufendZuLange(zeit, jetzt) {
    return zeit.ende == null && dauerSek(zeit, jetzt) > 12 * 3600;
  }

  window.LW.logic = { isoTag: isoTag, wochenTage: wochenTage, dauerSek: dauerSek, formatDauer: formatDauer, formatTimer: formatTimer,
    heuteAnsicht: heuteAnsicht, istUeberfaellig: istUeberfaellig, backlog: backlog,
    summeProQuest: summeProQuest, rueckblick: rueckblick, laufendZuLange: laufendZuLange };
})();
