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

  /* ISO-Kalenderwoche (Woche beginnt Montag; KW 1 enthält den ersten Donnerstag). */
  function kalenderwoche(iso) {
    var teile = iso.split('-');
    var d = new Date(Date.UTC(+teile[0], +teile[1] - 1, +teile[2]));
    d.setUTCDate(d.getUTCDate() + 3 - (d.getUTCDay() + 6) % 7); /* Donnerstag derselben Woche */
    var jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
    return 1 + Math.floor((d.getTime() - jan1) / 864e5 / 7);
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

  function heuteAnsicht(quests, tasks, meId, heute, ordner) {
    ordner = ordner || [];
    return aktiveQuests(quests).slice().sort(nachSort).map(function (q) {
      var liste = tasks.filter(function (t) {
        if (t.quest_id !== q.id || t.archiviert || !aufgabeSichtbar(t, ordner)) return false;
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

  function backlog(tasks, quests, filter, meId, ordner) {
    filter = filter || {};
    ordner = ordner || [];
    var imOrdner = filter.ordnerId ? nachkommen(filter.ordnerId, ordner) : null;
    var map = {};
    aktiveQuests(quests).forEach(function (q) { map[q.id] = q; });
    var r = tasks.filter(function (t) {
      var q = map[t.quest_id];
      if (!q || t.archiviert || !offen(t) || !aufgabeSichtbar(t, ordner)) return false;
      if (imOrdner && imOrdner.indexOf(t.ordner_id) < 0) return false;
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

  /* ---- Ordner ---- */
  var ART_RANG = { intern: 0, extern: 1, kunde: 2, projekt: 3 };

  function ordnerMap(ordner) {
    var m = {};
    (ordner || []).forEach(function (o) { m[o.id] = o; });
    return m;
  }

  /* Anzeigename: bei Kunden-Ordnern der aktuelle Kundenname, sonst der gespeicherte Name. */
  function ordnerName(o, kunden) {
    if (o.art !== 'kunde') return o.name;
    if (o.kunde_id == null) return o.name + ' (gelöscht)';
    var k = (kunden || []).filter(function (x) { return x.id === o.kunde_id; })[0];
    return k ? k.name : o.name;
  }

  function vergleichOrdner(kunden) {
    return function (a, b) {
      var ra = ART_RANG[a.art], rb = ART_RANG[b.art];
      if (ra !== rb) return ra - rb;
      if (a.art === 'kunde') {
        var c = ordnerName(a, kunden).localeCompare(ordnerName(b, kunden), 'de', { sensitivity: 'base' });
        if (c) return c;
      } else if (a.art === 'projekt') {
        var s = nachSort(a, b);
        if (s) return s;
      }
      var ca = a.created_at || '', cb = b.created_at || '';
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    };
  }

  /* Baum einer Quest: [{ ordner, kinder: [...] }]. Archivierte samt Unterordnern nur mit archivierte: true. */
  function ordnerBaum(questId, ordner, kunden, opt) {
    var mitArchiv = !!(opt && opt.archivierte);
    var cmp = vergleichOrdner(kunden);
    var kinderVon = {};
    (ordner || []).forEach(function (o) {
      if (o.quest_id !== questId) return;
      if (o.archiviert && !mitArchiv) return;
      var k = o.eltern_id == null ? '' : o.eltern_id;
      (kinderVon[k] || (kinderVon[k] = [])).push(o);
    });
    function bau(k) {
      return (kinderVon[k] || []).slice().sort(cmp).map(function (o) {
        return { ordner: o, kinder: bau(o.id) };
      });
    }
    return bau('');
  }

  /* Pfad von der Wurzel bis zum Ordner; unbekannte Id: []. */
  function ordnerPfad(ordnerId, ordner) {
    var m = ordnerMap(ordner), pfad = [], id = ordnerId, n = 0;
    while (id != null && m[id] && n++ < 20) { pfad.unshift(m[id]); id = m[id].eltern_id; }
    return pfad;
  }

  /* Kunde ergibt sich aus dem Kunden-Ordner im Pfad (Ordner selbst oder Elternteil). */
  function ordnerKunde(ordnerId, ordner) {
    var pfad = ordnerPfad(ordnerId, ordner);
    for (var i = pfad.length - 1; i >= 0; i--) {
      if (pfad[i].art === 'kunde') return pfad[i].kunde_id == null ? null : pfad[i].kunde_id;
    }
    return null;
  }

  /* Ordner-Id und alle Ids darunter. */
  function nachkommen(ordnerId, ordner) {
    var res = [ordnerId], i = 0;
    while (i < res.length) {
      for (var j = 0; j < ordner.length; j++) {
        if (ordner[j].eltern_id === res[i] && res.indexOf(ordner[j].id) < 0) res.push(ordner[j].id);
      }
      i++;
    }
    return res;
  }

  /* Darf in dieser Quest unter eltern (oder an der Wurzel, eltern = null) ein Ordner dieser Art liegen? */
  function ordnerErlaubt(quest, eltern, art) {
    if (art === 'intern' || art === 'extern') return !eltern && !!quest.firma;
    if (art === 'kunde') return !!eltern && eltern.art === 'extern';
    if (art === 'projekt') {
      if (!quest.firma) return !eltern;
      return !!eltern && (eltern.art === 'intern' || eltern.art === 'kunde');
    }
    return false;
  }

  /* Zeit je Ordner im Zeitraum, kumuliert über alle Unterordner. Zeit folgt task.ordner_id. */
  function summeProOrdner(zeiten, tasks, ordner, vonIso, bisIso, jetzt) {
    var m = ordnerMap(ordner), tm = {}, r = {};
    tasks.forEach(function (t) { tm[t.id] = t; });
    zeiten.forEach(function (z) {
      if (!z.task_id || !imZeitraum(z, vonIso, bisIso)) return;
      var t = tm[z.task_id];
      if (!t || t.ordner_id == null) return;
      var sek = dauerSek(z, jetzt);
      ordnerPfad(t.ordner_id, ordner).forEach(function (o) { r[o.id] = (r[o.id] || 0) + sek; });
    });
    return r;
  }

  /* 'extern', wenn der Ordnerpfad der Aufgabe einen Extern-Ordner enthält, sonst 'intern'. */
  function bereich(task, ordner) {
    if (!task || task.ordner_id == null) return 'intern';
    return ordnerPfad(task.ordner_id, ordner).some(function (o) { return o.art === 'extern'; }) ? 'extern' : 'intern';
  }

  /* Aufgaben in archivierten Ordnern (oder unter archivierten) sind ausgeblendet. */
  function aufgabeSichtbar(task, ordner) {
    if (!task || task.ordner_id == null) return true;
    return !ordnerPfad(task.ordner_id, ordner).some(function (o) { return o.archiviert; });
  }

  /* Ids, die ohne gespeicherten Zustand offen sind: Quest und Ordnerpfad der laufenden Aufgabe. */
  function offenStandard(laufend, tasks, ordner) {
    if (!laufend) return [];
    var res = laufend.quest_id ? [laufend.quest_id] : [];
    var t = laufend.task_id ? tasks.filter(function (x) { return x.id === laufend.task_id; })[0] : null;
    if (t && t.ordner_id != null) {
      ordnerPfad(t.ordner_id, ordner).forEach(function (o) { res.push(o.id); });
    }
    return res;
  }

  /* Ordnerbaum einer Quest mit Zeiten: nur Knoten mit sek > 0, nach sek absteigend. */
  function ordnerSekBaum(knoten, summen) {
    return knoten.map(function (n) {
      return { ordner: n.ordner, sek: summen[n.ordner.id] || 0, kinder: ordnerSekBaum(n.kinder, summen) };
    }).filter(function (n) { return n.sek > 0; }).sort(nachSekAbsteigend);
  }

  function rueckblick(zeiten, quests, tasks, kunden, vonIso, bisIso, jetzt, ordner) {
    ordner = ordner || [];
    var questMap = {}, taskMap = {}, kundeMap = {};
    quests.forEach(function (q) { questMap[q.id] = q; });
    tasks.forEach(function (t) { taskMap[t.id] = t; });
    kunden.forEach(function (k) { kundeMap[k.id] = k; });
    var res = { gesamtSek: 0, quests: [], firma: { gesamtSek: 0, abrechenbarSek: 0, internSek: 0, externSek: 0, kunden: [], personen: [] } };
    var qAgg = {}, kAgg = {}, pAgg = {};
    zeiten.forEach(function (z) {
      if (!imZeitraum(z, vonIso, bisIso)) return;
      var q = questMap[z.quest_id];
      if (!q) return;
      var sek = dauerSek(z, jetzt);
      var abr = z.abrechenbar ? sek : 0;
      res.gesamtSek += sek;
      var qa = qAgg[q.id] || (qAgg[q.id] = { quest: q, sek: 0, ohne: 0, tm: {}, tl: [] });
      qa.sek += sek;
      var tid = z.task_id && taskMap[z.task_id] ? z.task_id : '';
      var te = qa.tm[tid];
      if (!te) { te = qa.tm[tid] = { task: tid ? taskMap[tid] : null, sek: 0 }; qa.tl.push(te); }
      te.sek += sek;
      var tObj = tid ? taskMap[tid] : null;
      if (!tObj || tObj.ordner_id == null || !ordnerMap(ordner)[tObj.ordner_id]) qa.ohne += sek;
      if (q.firma) {
        var f = res.firma;
        f.gesamtSek += sek;
        f.abrechenbarSek += abr;
        if (bereich(tObj, ordner) === 'extern') f.externSek += sek; else f.internSek += sek;
        var kid = z.kunde_id && kundeMap[z.kunde_id] ? z.kunde_id : '';
        var ke = kAgg[kid] || (kAgg[kid] = { kunde: kid ? kundeMap[kid] : null, sek: 0, abrechenbarSek: 0 });
        ke.sek += sek; ke.abrechenbarSek += abr;
        var pe = pAgg[z.user_id] || (pAgg[z.user_id] = { user_id: z.user_id, sek: 0, abrechenbarSek: 0 });
        pe.sek += sek; pe.abrechenbarSek += abr;
      }
    });
    var summen = summeProOrdner(zeiten, tasks, ordner, vonIso, bisIso, jetzt);
    Object.keys(qAgg).forEach(function (id) {
      var a = qAgg[id];
      res.quests.push({ quest: a.quest, sek: a.sek, tasks: a.tl.sort(nachSekAbsteigend),
        ordner: ordnerSekBaum(ordnerBaum(a.quest.id, ordner, kunden, { archivierte: true }), summen), ohneOrdnerSek: a.ohne });
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

  /* ---- Befehlsleiste: Suche ohne Rücksicht auf Groß-/Kleinschreibung und Umlaute ---- */
  /* ü -> u (ohne Akzent) oder, mit umschrift = true, ü -> ue; ß -> ss. */
  function normalisieren(s, umschrift) {
    var t = String(s == null ? '' : s).toLowerCase().replace(/ß/g, 'ss');
    if (umschrift) return t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* Punktzahl für ein Wort im Text: 3 Wortanfang, 2 irgendwo enthalten, 1 Buchstaben in Reihenfolge (nur im Titel, ab Wortanfang), 0 kein Treffer. */
  function wortPunkte(text, wort, fuzzy) {
    var i = text.indexOf(wort);
    if (i === 0 || (i > 0 && /[^a-z0-9]/.test(text.charAt(i - 1)))) return 3;
    if (i >= 0) return 2;
    if (!fuzzy || wort.length < 3) return 0;
    var pos = text.indexOf(wort.charAt(0));
    while (pos > 0 && /[a-z0-9]/.test(text.charAt(pos - 1))) pos = text.indexOf(wort.charAt(0), pos + 1); /* erster Buchstabe am Wortanfang */
    if (pos < 0) return 0;
    for (var k = 0; k < wort.length; k++) {
      pos = text.indexOf(wort.charAt(k), pos);
      if (pos < 0) return 0;
      pos++;
    }
    return 1;
  }

  /* Filtert und sortiert Einträge { text, extra? } nach der Eingabe. Jedes Wort der Eingabe muss
     in text oder extra vorkommen (Titel zählt mehr). Leere Eingabe: alle, unverändert. */
  function befehlsSuche(eingabe, eintraege) {
    var worte = normalisieren(eingabe).split(/\s+/).filter(Boolean);
    if (!worte.length) return eintraege.slice();
    var treffer = [];
    eintraege.forEach(function (e, idx) {
      var varianten = [0, 1].map(function (u) {
        return { titel: normalisieren(e.text, !!u), alles: normalisieren(e.text + ' ' + (e.extra || ''), !!u) };
      });
      var summe = 0;
      for (var w = 0; w < worte.length; w++) {
        var best = 0;
        for (var v = 0; v < 2; v++) {
          var wort = v ? normalisieren(worte[w], true) : worte[w];
          var p = wortPunkte(varianten[v].titel, wort, true) * 2;
          if (!p) p = wortPunkte(varianten[v].alles, wort, false);
          if (p > best) best = p;
        }
        if (!best) return;
        summe += best;
      }
      treffer.push({ e: e, punkte: summe, idx: idx });
    });
    treffer.sort(function (a, b) { return b.punkte - a.punkte || a.idx - b.idx; });
    return treffer.map(function (x) { return x.e; });
  }

  /* Alle Zeilen laden, auch über die Grenze je Abfrage hinaus (Supabase: höchstens 1000).
     hole(von, bis) liefert die Zeilen von..bis (inklusive, wie .range()). Die Abfrage braucht
     eine eindeutige Sortierung, sonst können Zeilen zwischen den Seiten verrutschen. */
  async function alleSeiten(hole, groesse) {
    groesse = groesse || 1000;
    var alle = [];
    for (var von = 0; ; von += groesse) {
      var seite = await hole(von, von + groesse - 1);
      alle = alle.concat(seite || []);
      if (!seite || seite.length < groesse) return alle;
    }
  }

  window.LW.logic = { isoTag: isoTag, wochenTage: wochenTage, kalenderwoche: kalenderwoche, dauerSek: dauerSek, formatDauer: formatDauer, formatTimer: formatTimer,
    heuteAnsicht: heuteAnsicht, istUeberfaellig: istUeberfaellig, backlog: backlog,
    summeProQuest: summeProQuest, rueckblick: rueckblick,
    ordnerName: ordnerName, ordnerBaum: ordnerBaum, ordnerPfad: ordnerPfad, ordnerKunde: ordnerKunde, nachkommen: nachkommen,
    ordnerErlaubt: ordnerErlaubt, summeProOrdner: summeProOrdner, bereich: bereich, aufgabeSichtbar: aufgabeSichtbar, offenStandard: offenStandard, laufendZuLange: laufendZuLange,
    normalisieren: normalisieren, befehlsSuche: befehlsSuche, alleSeiten: alleSeiten };
})();
