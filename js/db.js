/* Datenzugriff. Zwei Varianten mit derselben Schnittstelle:
   - Supabase (echte Daten)
   - Demo (?demo in der Adresse, oder window.LW_FORCE_DEMO = true für Tests):
     Beispieldaten nur im Browser, zum Ausprobieren.
   Fehler werden als Error mit deutscher Meldung geworfen. */
window.LW = window.LW || {};
(function () {
  const isDemo = !!window.LW_FORCE_DEMO || new URLSearchParams(location.search).has('demo');

  const MSG_GESPERRT = 'Diese Zeit ist abgerechnet und gesperrt.';
  const MSG_ZEIT_GEBUCHT = 'Auf dieser Aufgabe ist Zeit gebucht. Archiviere sie stattdessen.';
  const MSG_ZUORDNUNG = 'Die Aufgabe gehört nicht zu dieser Quest.';
  const MSG_NICHT_SICHTBAR = 'Diese Quest ist nicht sichtbar.';
  const MSG_LAEUFT = 'Es läuft bereits ein Timer.';
  const MSG_ENDE = 'Das Ende muss nach dem Start liegen.';
  const MSG_NICHT_GEFUNDEN = 'Der Eintrag wurde nicht gefunden oder ist nicht zugänglich.';
  // Ordner: Meldungen wortgleich wie die Trigger in supabase/03_lw_ordner.sql
  const MSG_ORDNER_VOLL = 'Der Ordner ist nicht leer. Archiviere ihn stattdessen.';
  const MSG_ORDNER_LAGE = 'Hier kann dieser Ordner nicht liegen.';
  const MSG_ORDNER_FEST = 'Intern und Extern können nicht geändert werden.';
  const MSG_ORDNER_AUTO = 'Intern und Extern werden automatisch angelegt.';
  const MSG_ORDNER_ART = 'Art und Quest eines Ordners können nicht geändert werden.';
  const MSG_ORDNER_KUNDE_FEST = 'Der Kunde eines Ordners kann nicht geändert werden.';
  const MSG_ORDNER_ELTERN_ARCHIV = 'Der übergeordnete Ordner ist archiviert.';
  const MSG_ORDNER_KUNDE_WAEHLEN = 'Bitte einen Kunden wählen.';
  const MSG_ORDNER_KUNDE_DOPPELT = 'Für diesen Kunden gibt es in dieser Quest schon einen Ordner.';
  const MSG_ORDNER_NUR_KUNDE = 'Nur Kunden-Ordner haben einen Kunden.';
  const MSG_ORDNER_KEIN_KUNDE = 'Diesen Kunden gibt es nicht.';
  const MSG_ORDNER_NAME = 'Bitte einen Namen eingeben.';
  const MSG_ORDNER_FREMD = 'Dieser Ordner gehört zu einer anderen Quest.';
  const MSG_ORDNER_ARCHIV = 'In einen archivierten Ordner kann nichts einsortiert werden.';
  const MSG_ORDNER_FEHLT = 'Diesen Ordner gibt es nicht.';
  const MSG_FIRMA_AUS = 'Diese Quest hat Kunden-Ordner. Firma kann erst ausgeschaltet werden, wenn es keine mehr gibt.';

  const QUEST_FELDER = ['name', 'farbe', 'geteilt', 'firma', 'sortierung', 'archiviert'];
  // kunde_id wird nicht gesendet: die Datenbank leitet ihn aus dem Ordner ab
  const TASK_FELDER = ['quest_id', 'titel', 'notiz', 'tag', 'zugewiesen_an', 'ordner_id', 'erledigt_am', 'sortierung', 'archiviert'];
  const ORDNER_FELDER = ['quest_id', 'eltern_id', 'art', 'name', 'kunde_id', 'sortierung', 'archiviert'];
  const ZEIT_FELDER = ['quest_id', 'task_id', 'kunde_id', 'start', 'ende', 'abrechenbar', 'notiz'];

  function pick(o, keys) {
    const r = {};
    keys.forEach(k => { if (o[k] !== undefined) r[k] = o[k]; });
    return r;
  }

  /* Wie Mediawo OS: „Firma (Vorname Nachname)“ oder nur der Name */
  function kundeName(k) {
    const p = [k.vorname, k.nachname].filter(Boolean).join(' ');
    return k.firma ? (k.firma + (p ? ' (' + p + ')' : '')) : (p || 'Ohne Namen');
  }

  /* Lokale Tage 'YYYY-MM-DD' von..bis -> ISO-Bereich [lokal 0 Uhr von, lokal 0 Uhr bis+1) */
  function tagesBereich(von, bis) {
    const a = von.split('-').map(Number), b = bis.split('-').map(Number);
    return {
      von: new Date(a[0], a[1] - 1, a[2]).toISOString(),
      bis: new Date(b[0], b[1] - 1, b[2] + 1).toISOString()
    };
  }

  /* Postgres-Fehler in verständliche Meldungen übersetzen */
  function fehler(error, beimLoeschen) {
    if (!error) return;
    const msg = error.message || String(error);
    if (beimLoeschen && error.code === '23503') throw new Error(MSG_ZEIT_GEBUCHT);
    if (msg.indexOf('abgerechnet und gesperrt') >= 0) throw new Error(MSG_GESPERRT);
    if (error.code === '23505') throw new Error(MSG_LAEUFT);
    if (error.code === '23514') throw new Error(MSG_ENDE);
    if (error.code === 'PGRST116') throw new Error(MSG_NICHT_GEFUNDEN);
    throw new Error(msg);
  }

  /* Fehler beim Speichern/Löschen von Ordnern: Trigger-Meldungen gehen durch, Constraint-Codes eigens */
  function fehlerOrdner(error) {
    if (!error) return;
    if (error.code === '23503') throw new Error(MSG_ORDNER_VOLL);            // Fremdschlüssel: Aufgaben/Unterordner
    if (error.code === '23505') {                                          // eindeutige Indizes
      throw new Error(/kunde/.test(error.message || '') ? MSG_ORDNER_KUNDE_DOPPELT : MSG_ORDNER_AUTO);
    }
    if (error.code === '23514') throw new Error(MSG_ORDNER_LAGE);            // unbekannte Art
    fehler(error);
  }

  /* Tabelle lw_ordner fehlt (03_lw_ordner.sql noch nicht ausgeführt) */
  const tabelleFehlt = error => !!error && (error.code === '42P01' || error.code === 'PGRST205');

  /* ---------------- Supabase ---------------- */
  function supabaseDb() {
    const C = window.LW_CONFIG;
    // Art des Links merken, bevor Supabase die Adresse aufräumt (Einladung / Passwort zurücksetzen)
    const hash = new URLSearchParams(location.hash.slice(1));
    let linkTyp = hash.get('type');
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { flowType: 'implicit' } });
    let meCache = null;

    /* Liste vollständig laden: Supabase liefert je Abfrage höchstens 1000 Zeilen, daher seitenweise.
       abfrage() baut jedes Mal eine neue Abfrage mit eindeutiger Sortierung (zuletzt nach id). */
    function alle(abfrage) {
      return window.LW.logic.alleSeiten(async (von, bis) => {
        const { data, error } = await abfrage().range(von, bis); fehler(error); return data;
      }, 1000);
    }

    async function ich() {
      const { data } = await sb.auth.getSession();
      const user = data.session && data.session.user;
      if (!user) throw new Error('Bitte melde dich an.');
      if (meCache && meCache.id === user.id) return meCache;
      let r = await sb.from('lw_profile').select('id, name').eq('id', user.id).maybeSingle();
      fehler(r.error);
      if (!r.data) {
        const name = (user.email || 'Ich').split('@')[0];
        const ins = await sb.from('lw_profile').insert({ id: user.id, name }).select('id, name').single();
        if (ins.error && ins.error.code === '23505') {
          r = await sb.from('lw_profile').select('id, name').eq('id', user.id).single();
          fehler(r.error);
          r = { data: r.data };
        } else { fehler(ins.error); r = { data: ins.data }; }
      }
      meCache = { id: user.id, email: user.email, name: r.data.name };
      return meCache;
    }

    async function laufend() {
      const me = await ich();
      const { data, error } = await sb.from('lw_zeiten').select('*').eq('user_id', me.id).is('ende', null).limit(1);
      fehler(error);
      return data[0] || null;
    }

    async function stoppeTimer(id, endeIso) {
      let r = await sb.from('lw_zeiten').update({ ende: endeIso || new Date().toISOString() }).eq('id', id).select().single();
      if (r.error && r.error.code === '23514' && !endeIso) {
        // sofort nach dem Start gestoppt (oder Uhr weicht ab): Ende = Start + 1 s
        const z = await sb.from('lw_zeiten').select('start').eq('id', id).single(); fehler(z.error);
        r = await sb.from('lw_zeiten').update({ ende: new Date(new Date(z.data.start).getTime() + 1000).toISOString() }).eq('id', id).select().single();
      }
      fehler(r.error);
      return r.data;
    }

    const api = {
      demo: false,
      ordnerVerfuegbar: true,
      linkTyp() { const t = linkTyp; linkTyp = null; return t; },
      async session() { const { data } = await sb.auth.getSession(); return data.session; },
      onAuth(cb) { sb.auth.onAuthStateChange((e, s) => { if (e === 'PASSWORD_RECOVERY') linkTyp = 'recovery'; if (!s) meCache = null; cb(s); }); },
      async passwortSetzen(pw) { const { error } = await sb.auth.updateUser({ password: pw }); fehler(error); },
      async passwortVergessen(email) {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); fehler(error);
      },
      async login(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); fehler(error); },
      async logout() { meCache = null; await sb.auth.signOut(); },

      ich,
      async profile() { const { data, error } = await sb.from('lw_profile').select('id, name').order('name'); fehler(error); return data; },
      async saveProfil(p) {
        const me = await ich();
        const { error } = await sb.from('lw_profile').update({ name: p.name }).eq('id', me.id); fehler(error);
        meCache = { ...me, name: p.name };
      },

      async quests() {
        return alle(() => sb.from('lw_quests').select('*').order('sortierung').order('created_at').order('id'));
      },
      async saveQuest(q) {
        if (!q.id) {
          const { data, error } = await sb.from('lw_quests').insert(pick(q, QUEST_FELDER)).select().single(); fehler(error); return data;
        }
        if (q.geteilt === false) {
          // Teilen beenden geht für Nicht-Besitzer nur per Funktion (RLS); danach nichts zurücklesen
          const alt = await sb.from('lw_quests').select('*').eq('id', q.id).maybeSingle();
          fehler(alt.error);
          if (alt.data && alt.data.geteilt) {
            const r = await sb.rpc('lw_quest_teilen_beenden', { q: q.id }); fehler(r.error);
            const me = await ich();
            if (alt.data.owner_id !== me.id) return { ...alt.data, geteilt: false };
            const patch = pick(q, QUEST_FELDER);
            const u = await sb.from('lw_quests').update(patch).eq('id', q.id); fehler(u.error);
            return { ...alt.data, ...patch, geteilt: false };
          }
        }
        const { data, error } = await sb.from('lw_quests').update(pick(q, QUEST_FELDER)).eq('id', q.id).select().single(); fehler(error); return data;
      },
      async deleteQuest(id) { const { error } = await sb.from('lw_quests').delete().eq('id', id); fehler(error, true); },

      tasks() { return alle(() => sb.from('lw_tasks').select('*').order('sortierung').order('created_at').order('id')); },
      async saveTask(t) {
        const felder = pick(t, TASK_FELDER);
        if (!api.ordnerVerfuegbar) delete felder.ordner_id; // Spalte gibt es erst nach 03_lw_ordner.sql
        const q = t.id ? sb.from('lw_tasks').update(felder).eq('id', t.id) : sb.from('lw_tasks').insert(felder);
        const { data, error } = await q.select().single(); fehler(error); return data;
      },
      async deleteTask(id) { const { error } = await sb.from('lw_tasks').delete().eq('id', id); fehler(error, true); },

      /* Alle sichtbaren Ordner, auch archivierte. Fehlt die Tabelle noch: [] und ordnerVerfuegbar = false. */
      async ordner() {
        let fehlt = false;
        const liste = await window.LW.logic.alleSeiten(async (von, bis) => {
          const { data, error } = await sb.from('lw_ordner').select('*')
            .order('sortierung').order('created_at').order('id').range(von, bis);
          if (tabelleFehlt(error)) { fehlt = true; return []; }
          fehler(error);
          return data;
        }, 1000);
        api.ordnerVerfuegbar = !fehlt;
        if (fehlt) { console.warn('TM: Tabelle lw_ordner fehlt – bitte supabase/03_lw_ordner.sql ausführen.'); return []; }
        return liste;
      },
      async saveOrdner(o) {
        const q = o.id ? sb.from('lw_ordner').update(pick(o, ORDNER_FELDER)).eq('id', o.id) : sb.from('lw_ordner').insert(pick(o, ORDNER_FELDER));
        const { data, error } = await q.select().single(); fehlerOrdner(error); return data;
      },
      async deleteOrdner(id) { const { error } = await sb.from('lw_ordner').delete().eq('id', id); fehlerOrdner(error); },

      async kunden() {
        const data = await alle(() => sb.from('kunden').select('id, firma, vorname, nachname').eq('status', 'aktiv').order('id'));
        return data.map(k => ({ id: k.id, name: kundeName(k) })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
      },

      async zeiten(von, bis) {
        const me = await ich();
        const r = tagesBereich(von, bis);
        const [a, b] = await Promise.all([
          alle(() => sb.from('lw_zeiten').select('*').gte('start', r.von).lt('start', r.bis).order('start').order('id')),
          sb.from('lw_zeiten').select('*').eq('user_id', me.id).is('ende', null)
        ]);
        fehler(b.error);
        const map = new Map();
        a.concat(b.data).forEach(z => map.set(z.id, z));
        return [...map.values()].sort((x, y) => x.start.localeCompare(y.start));
      },
      laufend,
      async starteTimer(task) {
        const lauf = await laufend();
        let jetzt = Date.now();
        if (lauf) {
          // Ende muss nach dem Start liegen; neuer Eintrag beginnt genau dann
          jetzt = Math.max(jetzt, new Date(lauf.start).getTime() + 1000);
          await stoppeTimer(lauf.id, new Date(jetzt).toISOString());
        }
        const qr = await sb.from('lw_quests').select('firma').eq('id', task.quest_id).single(); fehler(qr.error);
        const neu = {
          quest_id: task.quest_id, task_id: task.id, kunde_id: task.kunde_id || null,
          start: new Date(jetzt).toISOString(), ende: null,
          abrechenbar: !!(qr.data.firma && task.kunde_id)
        };
        const { data, error } = await sb.from('lw_zeiten').insert(neu).select().single();
        if (error && error.code === '23505') return laufend(); // läuft schon (z. B. auf anderem Gerät)
        fehler(error);
        return data;
      },
      stoppeTimer,
      async saveZeit(z) {
        // kein upsert: der insert-Check würde bei nicht mehr geteilten Quests scheitern
        const q = z.id ? sb.from('lw_zeiten').update(pick(z, ZEIT_FELDER)).eq('id', z.id) : sb.from('lw_zeiten').insert(pick(z, ZEIT_FELDER));
        const { data, error } = await q.select().single(); fehler(error); return data;
      },
      async deleteZeit(id) { const { error } = await sb.from('lw_zeiten').delete().eq('id', id); fehler(error); }
    };
    return api;
  }

  /* ---------------- Demo ---------------- */
  function demoDb() {
    const uid = () => crypto.randomUUID();
    const isoTag = window.LW.logic.isoTag;
    const jetztD = new Date();
    const tagVerschoben = n => new Date(jetztD.getFullYear(), jetztD.getMonth(), jetztD.getDate() + n);
    const tag = n => isoTag(tagVerschoben(n));
    const um = (n, h, min) => new Date(jetztD.getFullYear(), jetztD.getMonth(), jetztD.getDate() + n, h, min).toISOString();

    const luca = { id: 'u-luca', email: 'luca@lw.demo', name: 'Luca' };
    const kai = { id: 'u-kai', email: 'kai@lw.demo', name: 'Kai' };
    const me = luca;
    const profile = [luca, kai];

    const kunden = [
      { id: uid(), firma: 'DeFORIS Unternehmensberatung', vorname: 'Sebastian', nachname: 'Tsoleridis', status: 'aktiv' },
      { id: uid(), firma: '', vorname: 'Susanne', nachname: 'Kreutz', status: 'aktiv' },
      { id: uid(), firma: 'Atelier dentaire Arnoldy S.à r.l.', vorname: '', nachname: '', status: 'aktiv' },
      { id: uid(), firma: 'Ehemaliger Kunde GmbH', vorname: '', nachname: '', status: 'inaktiv' }
    ];
    const kDeforis = kunden[0].id;
    const L = window.LW.logic;

    const mkQuest = (name, farbe, o) => ({ id: uid(), owner_id: luca.id, name, farbe, geteilt: false, firma: false, sortierung: 0, archiviert: false, created_at: new Date().toISOString(), ...o });
    const quests = [
      mkQuest('Mediawo', '#4F7CAC', { geteilt: true, firma: true, sortierung: 1 }),
      mkQuest('Sport', '#4E9F6B', { sortierung: 2 }),
      mkQuest('Master', '#C2703D', { sortierung: 3 })
    ];
    const qMed = quests[0].id, qSport = quests[1].id, qMaster = quests[2].id;

    // Ordner wie nach 03_lw_ordner.sql: Mediawo mit Intern/Extern, Master mit einem Projekt
    let oSort = 0;
    const ordner = [];
    const mkOrdner = (quest_id, art, name, eltern, o) => {
      const n = { id: uid(), quest_id, eltern_id: eltern ? eltern.id : null, art, name, kunde_id: null, sortierung: art === 'projekt' ? ++oSort : 0, archiviert: false, created_at: new Date().toISOString(), ...o };
      ordner.push(n); return n;
    };
    const kundenOrdner = (quest_id, eltern, k) => mkOrdner(quest_id, 'kunde', kundeName(k), eltern, { kunde_id: k.id });
    const oIntern = mkOrdner(qMed, 'intern', 'Intern');
    const oExtern = mkOrdner(qMed, 'extern', 'Extern');
    const oMarketing = mkOrdner(qMed, 'projekt', 'Marketing', oIntern);
    const oKreutz = kundenOrdner(qMed, oExtern, kunden[1]);
    const oWebsite = mkOrdner(qMed, 'projekt', 'Website', oKreutz);
    const oReels = mkOrdner(qMed, 'projekt', 'Reels', oKreutz);
    const oDeforis = kundenOrdner(qMed, oExtern, kunden[0]);
    const oAngebot = mkOrdner(qMed, 'projekt', 'Angebot', oDeforis);
    const oThesis = mkOrdner(qMaster, 'projekt', 'Thesis');

    let sort = 0;
    const mkTask = (quest_id, titel, o) => ({
      id: uid(), quest_id, titel, notiz: null, tag: null, zugewiesen_an: null, ordner_id: null, kunde_id: null, erledigt_am: null,
      sortierung: ++sort, archiviert: false, created_by: luca.id, created_at: new Date().toISOString(), ...o
    });
    const tasks = [
      mkTask(qMed, 'Angebot DeFORIS nachfassen', { tag: tag(-3), zugewiesen_an: luca.id, ordner_id: oAngebot.id }),
      mkTask(qMed, 'Reel für Kreutz schneiden', { tag: tag(0), zugewiesen_an: luca.id, ordner_id: oReels.id }),
      mkTask(qMed, 'Rechnung prüfen', { tag: tag(0) }),
      mkTask(qSport, 'Laufen 5 km', { tag: tag(0), zugewiesen_an: luca.id }),
      mkTask(qMed, 'Carousel-Entwurf', { tag: tag(1), zugewiesen_an: kai.id, ordner_id: oAngebot.id, created_by: kai.id }),
      mkTask(qMaster, 'Kapitel 2 lesen', { tag: tag(2), zugewiesen_an: luca.id, ordner_id: oThesis.id }),
      mkTask(qMaster, 'Literatur sammeln', { zugewiesen_an: luca.id }),
      mkTask(qMed, 'Website-Texte für Kreutz', { tag: tag(3), zugewiesen_an: luca.id, ordner_id: oWebsite.id }),
      mkTask(qSport, 'Krafttraining', { tag: tag(-1), zugewiesen_an: luca.id, erledigt_am: um(-1, 19, 30) }),
      mkTask(qMed, 'Newsletter-Vorlage', { tag: tag(4), zugewiesen_an: luca.id, ordner_id: oMarketing.id })
    ];
    // Kunde immer aus dem Ordner (wie Trigger lw_tasks_ordner)
    tasks.forEach(t => { t.kunde_id = L.ordnerKunde(t.ordner_id, ordner); });
    const tid = titel => tasks.find(t => t.titel === titel);

    const rechnungen = [{ id: uid(), nummer: 'R-DEMO-1', typ: 'rechnung', status: 'offen' }];

    const zeiten = [];
    const zeit = (user, task, n, h, min, dauerMin, o) => {
      const start = um(n, h, min);
      zeiten.push({
        id: uid(), user_id: user.id, quest_id: task.quest_id, task_id: task.id, kunde_id: task.kunde_id || null,
        start, ende: new Date(new Date(start).getTime() + dauerMin * 60000).toISOString(),
        abrechenbar: false, notiz: null, rechnung_id: null, ...o
      });
    };
    // heute: nur Einträge, die schon vorbei sind
    const heuteStart = Math.max(new Date(um(0, 0, 1)).getTime(), jetztD.getTime() - 90 * 60000);
    const heuteEnde = Math.min(heuteStart + 45 * 60000, jetztD.getTime() - 60000);
    if (heuteEnde > heuteStart) {
      const t2 = tid('Reel für Kreutz schneiden');
      zeiten.push({ id: uid(), user_id: luca.id, quest_id: t2.quest_id, task_id: t2.id, kunde_id: t2.kunde_id, start: new Date(heuteStart).toISOString(), ende: new Date(heuteEnde).toISOString(), abrechenbar: true, notiz: null, rechnung_id: null });
    }
    zeit(luca, tid('Krafttraining'), -1, 18, 0, 50);
    zeit(luca, tid('Reel für Kreutz schneiden'), -1, 9, 0, 120, { abrechenbar: true });
    zeit(luca, tid('Kapitel 2 lesen'), -2, 20, 0, 90);
    zeit(kai, tid('Carousel-Entwurf'), -2, 10, 0, 150, { abrechenbar: true });
    zeit(luca, tid('Angebot DeFORIS nachfassen'), -3, 14, 0, 40, { abrechenbar: true });
    zeit(luca, tid('Laufen 5 km'), -4, 7, 15, 35);
    zeit(luca, tid('Literatur sammeln'), -5, 16, 0, 75);
    zeit(luca, tid('Website-Texte für Kreutz'), -5, 9, 30, 180, { abrechenbar: true, rechnung_id: rechnungen[0].id }); // abgerechnet
    zeit(kai, tid('Rechnung prüfen'), -6, 11, 0, 30);
    // Newsletter: lag früher bei DeFORIS und wurde dort abgerechnet, dann nach Intern verschoben (gesperrter Eintrag behielt DeFORIS)
    zeit(luca, tid('Newsletter-Vorlage'), -4, 10, 0, 60);
    zeit(kai, tid('Newsletter-Vorlage'), -3, 15, 0, 45);
    zeit(luca, tid('Newsletter-Vorlage'), -6, 9, 0, 30, { kunde_id: kDeforis, abrechenbar: true, rechnung_id: rechnungen[0].id });

    let session = null;
    const cbs = [];
    const wait = v => new Promise(res => setTimeout(() => res(structuredClone(v)), 25));
    const sichtbar = q => q && (q.owner_id === me.id || q.geteilt);
    const questById = id => quests.find(q => q.id === id);
    const meineLaufende = () => zeiten.find(z => z.user_id === me.id && !z.ende);

    /* abgerechnet: Rechnung gesetzt und nicht storniert (oder nicht auffindbar) – wie lw_zeiten_sperre */
    function gesperrt(z) {
      if (!z.rechnung_id) return false;
      const r = rechnungen.find(x => x.id === z.rechnung_id);
      return !r || r.status !== 'storniert';
    }

    /* ---- Ordner-Regeln, Spiegel von supabase/03_lw_ordner.sql ---- */
    const ordnerById = id => ordner.find(o => o.id === id);
    const kundeGibtEs = id => kunden.some(k => k.id === id);

    // Trigger lw_ordner_struktur (n wird angepasst: Name, ggf. archiviert). umbau = "lw.firma_umbau"
    function pruefeOrdner(n, alt, umbau) {
      let lage;
      if (alt) {
        if (n.art !== alt.art || n.quest_id !== alt.quest_id) throw new Error(MSG_ORDNER_ART);
        if (alt.art === 'intern' || alt.art === 'extern') {
          if (n.name !== alt.name || n.eltern_id !== alt.eltern_id || n.archiviert !== alt.archiviert || n.kunde_id !== alt.kunde_id) throw new Error(MSG_ORDNER_FEST);
          return;
        }
        if (n.kunde_id !== alt.kunde_id && !(n.kunde_id == null && alt.kunde_id != null && !kundeGibtEs(alt.kunde_id))) throw new Error(MSG_ORDNER_KUNDE_FEST);
        if (n.archiviert !== alt.archiviert && !n.archiviert) {
          const e = ordnerById(n.eltern_id);
          if (e && e.archiviert) throw new Error(MSG_ORDNER_ELTERN_ARCHIV);
        }
        lage = n.eltern_id !== alt.eltern_id;
      } else {
        lage = true;
        if (n.art === 'intern' || n.art === 'extern') {
          if (!umbau) throw new Error(MSG_ORDNER_AUTO);
          n.name = n.art === 'intern' ? 'Intern' : 'Extern';
          n.archiviert = false;
        }
        if (n.art === 'kunde') {
          if (n.kunde_id == null) throw new Error(MSG_ORDNER_KUNDE_WAEHLEN);
          if (ordner.some(o => o.quest_id === n.quest_id && o.kunde_id === n.kunde_id)) throw new Error(MSG_ORDNER_KUNDE_DOPPELT);
        } else if (n.kunde_id != null) throw new Error(MSG_ORDNER_NUR_KUNDE);
        if (!['intern', 'extern', 'kunde', 'projekt'].includes(n.art)) throw new Error(MSG_ORDNER_LAGE); // check-Constraint
      }
      // Name
      if (n.art === 'kunde') {
        const k = kunden.find(x => x.id === n.kunde_id);
        if (k) n.name = kundeName(k);
        else if (!alt) throw new Error(MSG_ORDNER_KEIN_KUNDE);
        else n.name = alt.name;
      } else if (n.art === 'projekt') {
        n.name = (n.name == null ? '' : String(n.name)).trim();
        if (!n.name) throw new Error(MSG_ORDNER_NAME);
      }
      // Lage
      if (lage) {
        const q = questById(n.quest_id);
        let e = null;
        if (n.eltern_id != null) {
          e = ordnerById(n.eltern_id);
          if (!e) throw new Error(MSG_ORDNER_LAGE);
          if (e.quest_id !== n.quest_id) throw new Error(MSG_ORDNER_FREMD);
          if (e.archiviert) throw new Error(MSG_ORDNER_ARCHIV);
        }
        if (!L.ordnerErlaubt(q, e, n.art)) throw new Error(MSG_ORDNER_LAGE);
      }
    }

    // Trigger lw_ordner_archiv: jede Ebene gibt den Wert an ihre Kinder weiter
    function archivVererben(o) {
      ordner.filter(k => k.eltern_id === o.id && k.archiviert !== o.archiviert).forEach(k => {
        k.archiviert = o.archiviert;
        archivVererben(k);
      });
    }

    // Trigger lw_tasks_kunde_zeiten: Kunde der Aufgabe geändert -> alle nicht gesperrten Einträge (jeder Person) ziehen mit
    function zeitFolgtKunde(t, altKunde) {
      if (t.kunde_id == null && altKunde != null && !kundeGibtEs(altKunde)) return; // Kunde gelöscht: kein Umsortieren
      const q = questById(t.quest_id);
      const abrechenbar = !!(q && q.firma && t.kunde_id != null);
      zeiten.forEach(z => {
        if (z.task_id === t.id && !gesperrt(z)) { z.kunde_id = t.kunde_id; z.abrechenbar = abrechenbar; }
      });
    }

    // Trigger lw_tasks_ordner (n = neue Zeile, alt = vorher oder null): prüft den Ordner, setzt kunde_id
    function taskOrdner(n, alt) {
      if (alt && n.quest_id !== alt.quest_id && n.ordner_id === alt.ordner_id) n.ordner_id = null;
      const neuEinsortiert = !alt || n.ordner_id !== alt.ordner_id;
      let kunde = null;
      if (n.ordner_id != null) {
        const o = ordnerById(n.ordner_id);
        if (!o) throw new Error(MSG_ORDNER_FEHLT);
        if (o.quest_id !== n.quest_id) throw new Error(MSG_ORDNER_FREMD);
        if (neuEinsortiert && o.archiviert) throw new Error(MSG_ORDNER_ARCHIV);
        kunde = L.ordnerKunde(o.id, ordner);
        if (kunde != null && !kundeGibtEs(kunde)) kunde = null;
      }
      n.kunde_id = kunde;
    }

    // Trigger lw_ordner_kunde_folgt: Projekt verschoben -> Kunde seiner Aufgaben (und deren Zeit) folgt
    function kundeFolgtOrdner(o) {
      if (o.art !== 'projekt') return;
      const e = ordnerById(o.eltern_id);
      const kunde = e && e.art === 'kunde' ? e.kunde_id : null;
      tasks.filter(t => t.ordner_id === o.id && t.kunde_id !== kunde).forEach(t => {
        const altKunde = t.kunde_id;
        taskOrdner(t, t); // wie lw_tasks_ordner bei "update of kunde_id": neu ableiten
        if (t.kunde_id !== altKunde) zeitFolgtKunde(t, altKunde);
      });
    }

    // Ordner direkt verschieben (Umbau), mit den Folge-Triggern
    function ordnerVerschieben(o, elternId) {
      if (o.eltern_id === elternId) return;
      o.eltern_id = elternId;
      kundeFolgtOrdner(o);
    }

    // lw_ordner_einrichten: Intern/Extern anlegen, Projekte von oben nach Intern,
    // Aufgaben mit Kunde aber ohne Ordner nach Extern -> (Kunde) -> "Allgemein"
    function ordnerEinrichten(qId) {
      const neuerOrdner = (art, name, eltern, o) => {
        const n = { id: uid(), quest_id: qId, eltern_id: eltern ? eltern.id : null, art, name, kunde_id: null, sortierung: 0, archiviert: false, created_at: new Date().toISOString(), ...o };
        pruefeOrdner(n, null, true);
        ordner.push(n);
        return n;
      };
      const intern = ordner.find(o => o.quest_id === qId && o.art === 'intern') || neuerOrdner('intern', 'Intern');
      const extern = ordner.find(o => o.quest_id === qId && o.art === 'extern') || neuerOrdner('extern', 'Extern');
      ordner.filter(o => o.quest_id === qId && o.eltern_id == null && o.art === 'projekt').forEach(o => ordnerVerschieben(o, intern.id));
      const kundenIds = [...new Set(tasks.filter(t => t.quest_id === qId && t.kunde_id != null && t.ordner_id == null).map(t => t.kunde_id))];
      kundenIds.forEach(k => {
        const ko = ordner.find(o => o.quest_id === qId && o.art === 'kunde' && o.kunde_id === k) || neuerOrdner('kunde', '', extern, { kunde_id: k });
        if (ko.archiviert) return;
        const allg = ordner.filter(o => o.eltern_id === ko.id && o.art === 'projekt' && o.name === 'Allgemein' && !o.archiviert)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))[0] || neuerOrdner('projekt', 'Allgemein', ko);
        tasks.filter(t => t.quest_id === qId && t.kunde_id === k && t.ordner_id == null).forEach(t => { t.ordner_id = allg.id; });
      });
    }

    // lw_quests_firma, Teil "aus": vorher prüfen (in der DB rollt die Ausnahme das Update zurück)
    function firmaAusPruefen(qId) {
      if (ordner.some(o => o.quest_id === qId && o.art === 'kunde')) throw new Error(MSG_FIRMA_AUS);
    }
    function firmaAus(qId) {
      const fest = ordner.filter(o => o.quest_id === qId && (o.art === 'intern' || o.art === 'extern')).map(o => o.id);
      ordner.filter(o => o.quest_id === qId && fest.includes(o.eltern_id)).forEach(o => ordnerVerschieben(o, null));
      tasks.filter(t => fest.includes(t.ordner_id)).forEach(t => { t.ordner_id = null; }); // Kunde war dort schon null
      for (let i = ordner.length - 1; i >= 0; i--) if (fest.includes(ordner[i].id)) ordner.splice(i, 1);
    }
    // Quest ändern samt Firma-Umbau (alt wird verändert)
    function questAendern(alt, patch) {
      const vorher = alt.firma;
      const neuFirma = patch.firma === undefined ? vorher : !!patch.firma;
      if (vorher && !neuFirma) firmaAusPruefen(alt.id);
      Object.assign(alt, patch);
      if (!vorher && neuFirma) ordnerEinrichten(alt.id);
      if (vorher && !neuFirma) firmaAus(alt.id);
    }

    function pruefeZeit(z, alt) {
      if (alt && gesperrt(alt)) throw new Error(MSG_GESPERRT);
      if (z.ende && new Date(z.ende) <= new Date(z.start)) throw new Error(MSG_ENDE);
      if (!z.ende && zeiten.some(x => x.user_id === z.user_id && !x.ende && x.id !== z.id)) throw new Error(MSG_LAEUFT);
      const geaendert = !alt || z.quest_id !== alt.quest_id || z.task_id !== alt.task_id;
      if (geaendert) {
        if (!sichtbar(questById(z.quest_id))) throw new Error(MSG_NICHT_SICHTBAR);
        if (z.task_id && !tasks.some(t => t.id === z.task_id && t.quest_id === z.quest_id)) throw new Error(MSG_ZUORDNUNG);
      }
    }

    async function saveZeit(z) {
      if (z.id) {
        const alt = zeiten.find(x => x.id === z.id && x.user_id === me.id);
        if (!alt) throw new Error('Der Eintrag wurde nicht gefunden oder ist nicht zugänglich.');
        const neu = { ...alt, ...pick(z, ZEIT_FELDER) };
        pruefeZeit(neu, alt);
        Object.assign(alt, neu);
        return wait(alt);
      }
      const neu = { id: uid(), user_id: me.id, kunde_id: null, ende: null, abrechenbar: false, notiz: null, rechnung_id: null, task_id: null, start: new Date().toISOString(), ...pick(z, ZEIT_FELDER) };
      if (!sichtbar(questById(neu.quest_id))) throw new Error(MSG_NICHT_SICHTBAR);
      pruefeZeit(neu, null);
      zeiten.push(neu);
      return wait(neu);
    }
    async function stoppeTimer(id, endeIso) {
      const z = zeiten.find(x => x.id === id && x.user_id === me.id);
      if (!z) throw new Error('Der Eintrag wurde nicht gefunden oder ist nicht zugänglich.');
      let ende = endeIso || new Date().toISOString();
      if (!endeIso && new Date(ende) <= new Date(z.start)) ende = new Date(new Date(z.start).getTime() + 1000).toISOString();
      const neu = { ...z, ende };
      pruefeZeit(neu, z);
      Object.assign(z, neu);
      return wait(z);
    }
    const hatZeit = fn => zeiten.some(fn);

    return {
      demo: true,
      ordnerVerfuegbar: true,
      linkTyp() { return new URLSearchParams(location.search).get('typ'); },
      async passwortSetzen() { return wait(null); },
      async passwortVergessen() { return wait(null); },
      async session() { return session; },
      onAuth(cb) { cbs.push(cb); },
      async login(email) { session = { user: { email: email || me.email } }; cbs.forEach(c => c(session)); },
      async logout() { session = null; cbs.forEach(c => c(null)); },

      async ich() { return wait(me); },
      async profile() { return wait(profile.map(p => ({ id: p.id, name: p.name }))); },
      async saveProfil(p) { me.name = p.name; return wait(null); },

      async quests() { return wait(quests.filter(sichtbar).sort((a, b) => a.sortierung - b.sortierung)); },
      async saveQuest(q) {
        if (!q.id) {
          const n = { id: uid(), owner_id: me.id, farbe: '#4F7CAC', geteilt: false, firma: false, sortierung: 0, archiviert: false, created_at: new Date().toISOString(), ...pick(q, QUEST_FELDER) };
          quests.push(n);
          if (n.firma) ordnerEinrichten(n.id);
          return wait(n);
        }
        const alt = questById(q.id);
        if (!sichtbar(alt)) throw new Error(MSG_NICHT_SICHTBAR);
        if (q.geteilt === false && alt.geteilt) {
          alt.geteilt = false; // wie die Funktion lw_quest_teilen_beenden
          if (alt.owner_id === me.id) questAendern(alt, pick(q, QUEST_FELDER));
          return wait(alt);
        }
        questAendern(alt, pick(q, QUEST_FELDER));
        return wait(alt);
      },
      async deleteQuest(id) {
        if (!sichtbar(questById(id))) throw new Error(MSG_NICHT_SICHTBAR);
        if (hatZeit(z => z.quest_id === id)) throw new Error(MSG_ZEIT_GEBUCHT);
        quests.splice(quests.findIndex(x => x.id === id), 1);
        for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i].quest_id === id) tasks.splice(i, 1);
        for (let i = ordner.length - 1; i >= 0; i--) if (ordner[i].quest_id === id) ordner.splice(i, 1); // cascade
        return wait(null);
      },

      async tasks() { return wait(tasks.filter(t => sichtbar(questById(t.quest_id))).sort((a, b) => a.sortierung - b.sortierung)); },
      async saveTask(t) {
        if (t.id) {
          const alt = tasks.find(x => x.id === t.id);
          if (!alt || !sichtbar(questById(alt.quest_id))) throw new Error('Der Eintrag wurde nicht gefunden oder ist nicht zugänglich.');
          const patch = pick(t, TASK_FELDER);
          if (patch.quest_id && patch.quest_id !== alt.quest_id) {
            if (!sichtbar(questById(patch.quest_id))) throw new Error(MSG_NICHT_SICHTBAR);
            if (hatZeit(z => z.task_id === alt.id)) throw new Error('Auf dieser Aufgabe ist Zeit gebucht. Sie kann nicht in eine andere Quest verschoben werden.');
          }
          const neu = { ...alt, ...patch };
          taskOrdner(neu, alt);
          const altKunde = alt.kunde_id;
          Object.assign(alt, neu);
          if (alt.kunde_id !== altKunde) zeitFolgtKunde(alt, altKunde);
          return wait(alt);
        }
        if (!sichtbar(questById(t.quest_id))) throw new Error(MSG_NICHT_SICHTBAR);
        const n = { id: uid(), notiz: null, tag: null, zugewiesen_an: null, ordner_id: null, kunde_id: null, erledigt_am: null, sortierung: ++sort, archiviert: false, ...pick(t, TASK_FELDER), created_by: me.id, created_at: new Date().toISOString() };
        taskOrdner(n, null);
        tasks.push(n); return wait(n);
      },
      async deleteTask(id) {
        const i = tasks.findIndex(x => x.id === id);
        if (i < 0 || !sichtbar(questById(tasks[i].quest_id))) throw new Error('Der Eintrag wurde nicht gefunden oder ist nicht zugänglich.');
        if (hatZeit(z => z.task_id === id)) throw new Error(MSG_ZEIT_GEBUCHT);
        tasks.splice(i, 1);
        return wait(null);
      },

      async ordner() {
        const nachSort = (a, b) => a.sortierung - b.sortierung || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
        return wait(ordner.filter(o => sichtbar(questById(o.quest_id))).sort(nachSort));
      },
      async saveOrdner(o) {
        if (!o.id) {
          const n = { id: uid(), eltern_id: null, name: '', kunde_id: null, sortierung: 0, archiviert: false, ...pick(o, ORDNER_FELDER), created_at: new Date().toISOString() };
          if (!sichtbar(questById(n.quest_id))) throw new Error(MSG_NICHT_SICHTBAR);
          pruefeOrdner(n, null, false);
          ordner.push(n);
          return wait(n);
        }
        const alt = ordnerById(o.id);
        if (!alt || !sichtbar(questById(alt.quest_id))) throw new Error(MSG_NICHT_GEFUNDEN);
        const neu = { ...alt, ...pick(o, ORDNER_FELDER) };
        pruefeOrdner(neu, alt, false);
        const vorher = { ...alt };
        Object.assign(alt, neu);
        if (alt.archiviert !== vorher.archiviert) archivVererben(alt);
        if (alt.eltern_id !== vorher.eltern_id) kundeFolgtOrdner(alt);
        return wait(alt);
      },
      async deleteOrdner(id) {
        const i = ordner.findIndex(x => x.id === id);
        if (i < 0 || !sichtbar(questById(ordner[i].quest_id))) return wait(null); // wie delete ohne Treffer
        const o = ordner[i];
        if (o.art === 'intern' || o.art === 'extern') throw new Error(MSG_ORDNER_FEST);
        if (ordner.some(x => x.eltern_id === id) || tasks.some(t => t.ordner_id === id)) throw new Error(MSG_ORDNER_VOLL);
        ordner.splice(i, 1);
        return wait(null);
      },

      async kunden() {
        return wait(kunden.filter(k => k.status === 'aktiv').map(k => ({ id: k.id, name: kundeName(k) })).sort((a, b) => a.name.localeCompare(b.name, 'de')));
      },

      async zeiten(von, bis) {
        const r = tagesBereich(von, bis);
        const liste = zeiten.filter(z => {
          const q = questById(z.quest_id);
          if (!(z.user_id === me.id || sichtbar(q))) return false; // wie RLS: eigene oder Quest sichtbar (Besitzer oder geteilt)
          return (z.start >= r.von && z.start < r.bis) || (z.user_id === me.id && !z.ende);
        }).sort((a, b) => a.start.localeCompare(b.start));
        return wait(liste);
      },
      async laufend() { return wait(meineLaufende() || null); },
      async starteTimer(task) {
        const lauf = meineLaufende();
        let jetzt = Date.now();
        if (lauf) {
          jetzt = Math.max(jetzt, new Date(lauf.start).getTime() + 1000);
          await stoppeTimer(lauf.id, new Date(jetzt).toISOString());
        }
        const q = questById(task.quest_id);
        if (!q) throw new Error(MSG_NICHT_SICHTBAR);
        return saveZeit({
          quest_id: task.quest_id, task_id: task.id, kunde_id: task.kunde_id || null,
          start: new Date(jetzt).toISOString(), ende: null, abrechenbar: !!(q.firma && task.kunde_id)
        });
      },
      stoppeTimer,
      saveZeit,
      async deleteZeit(id) {
        const i = zeiten.findIndex(x => x.id === id && x.user_id === me.id);
        if (i < 0) return wait(null);
        const z = zeiten[i];
        if (gesperrt(z)) throw new Error(MSG_GESPERRT);
        zeiten.splice(i, 1);
        return wait(null);
      }
    };
  }

  window.LW.db = isDemo ? demoDb() : supabaseDb();
})();
