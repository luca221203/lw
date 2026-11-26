-- =====================================================================
-- TM (LW) – Datenbank-Update 3: Ordner in Quests
-- Im Supabase-Dashboard unter "SQL Editor" komplett einfügen und
-- einmal auf "Run" klicken – NACH 01_lw_schema.sql. Das Skript kann
-- gefahrlos erneut ausgeführt werden (legt nur an, was fehlt, setzt
-- Funktionen, Trigger und Regeln neu und sortiert nichts doppelt ein).
--
-- Was es macht:
--   - neue Tabelle lw_ordner (Intern/Extern → Kunde → Projekt, bzw.
--     Projekte direkt in Nicht-Firma-Quests) und neue Spalte
--     lw_tasks.ordner_id (Aufgabe liegt in genau einem Ordner oder keinem)
--   - die Datenbank erzwingt die feste Struktur (Trigger), nicht nur
--     die Oberfläche
--   - der Kunde einer Aufgabe ergibt sich aus ihrem Ordner; ändert er
--     sich, übernehmen alle nicht abgerechneten Zeiteinträge der Aufgabe
--     (auch die von Kai) den neuen Kunden und "abrechenbar" wird auf den
--     Standard gesetzt ("Zeit wandert mit der Aufgabe")
--   - neue und bearbeitete Zeiteinträge mit Aufgabe bekommen immer den
--     aktuellen Kunden der Aufgabe (Trigger lw_zeiten_kunde_von_aufgabe),
--     auch wenn ein Gerät noch einen veralteten Stand hat
--   - "Firma" an/aus legt Intern/Extern an bzw. löst sie wieder auf
--   - bestehende Daten: Firma-Quests bekommen Intern/Extern, Aufgaben
--     mit Kunde wandern nach Extern → (Kunde) → "Allgemein".
--     Zeiteinträge werden dabei NICHT verändert.
--
-- Bestehende Mediawo-Tabellen werden NICHT verändert; "kunden" und
-- "rechnungen" werden nur referenziert bzw. gelesen. lw_ordner ist wie
-- die anderen lw_-Tabellen NICHT Teil der "nur_team"-Schleife.
--
-- Danach zur Kontrolle 02_lw_pruefen.sql ausführen.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ordner
-- art: 'intern' / 'extern'  – feste Wurzelordner jeder Firma-Quest
--      'kunde'              – nur unter Extern, verknüpft mit kunden
--      'projekt'            – unter Intern, unter einem Kunden oder
--                             (Nicht-Firma-Quest) direkt in der Quest
-- name ist bei Kunden-Ordnern eine Kopie des Kundennamens, damit er
-- erhalten bleibt, wenn der Kunde in Mediawo OS gelöscht wird
-- (kunde_id wird dann null, die App zeigt "(gelöscht)").
-- Löschen einer Quest nimmt ihre Ordner mit (cascade). eltern_id und
-- lw_tasks.ordner_id sind "no action" und erst am Ende der Transaktion
-- geprüft (deferrable initially deferred), damit das Löschen einer
-- Quest in einem Schritt durchläuft, egal in welcher Reihenfolge
-- Postgres Aufgaben und Ordner entfernt. Einen nicht leeren Ordner
-- verhindert vorher der Trigger lw_ordner_loeschen.
-- ---------------------------------------------------------------------
create table if not exists public.lw_ordner (
  id          uuid primary key default gen_random_uuid(),
  quest_id    uuid not null references public.lw_quests(id) on delete cascade,
  eltern_id   uuid references public.lw_ordner(id) deferrable initially deferred,
  art         text not null check (art in ('intern','extern','kunde','projekt')),
  name        text not null,
  kunde_id    uuid references public.kunden(id) on delete set null,
  sortierung  int not null default 0,
  archiviert  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Aufgabe liegt in einem Ordner (null = direkt in der Quest)
alter table public.lw_tasks
  add column if not exists ordner_id uuid
  references public.lw_ordner(id) deferrable initially deferred;

-- Indizes für Fremdschlüssel
create index if not exists lw_ordner_quest_idx  on public.lw_ordner (quest_id);
create index if not exists lw_ordner_eltern_idx on public.lw_ordner (eltern_id);
create index if not exists lw_tasks_ordner_idx  on public.lw_tasks (ordner_id);

-- Je Quest höchstens ein Intern, ein Extern und ein Ordner je Kunde
-- (archivierte zählen mit: Kunde erneut hinzufügen holt ihn zurück)
create unique index if not exists lw_ordner_ein_intern
  on public.lw_ordner (quest_id) where art = 'intern';
create unique index if not exists lw_ordner_ein_extern
  on public.lw_ordner (quest_id) where art = 'extern';
create unique index if not exists lw_ordner_ein_kunde
  on public.lw_ordner (quest_id, kunde_id) where kunde_id is not null;

-- ---------------------------------------------------------------------
-- Struktur der Ordner (vor Anlegen und Ändern)
-- - Art und Quest sind fest.
-- - Erlaubte Lage: intern/extern ganz oben (nur Firma-Quest),
--   kunde unter extern, projekt unter intern oder kunde bzw. ganz
--   oben in einer Nicht-Firma-Quest. Der Elternordner muss in derselben
--   Quest liegen und darf beim Anlegen/Verschieben nicht archiviert sein.
-- - Intern/Extern legt nur "Firma an" an (lw_quests_firma), Namen fest;
--   umbenennen, verschieben, archivieren geht nicht.
-- - Kunden-Ordner: Kunde Pflicht, Name kommt aus "kunden" (wie
--   kundeName in js/db.js: "Firma (Vorname Nachname)" oder nur der Name),
--   der Kunde ist danach fest. Einzige Ausnahme: Mediawo OS löscht den
--   Kunden, dann setzt der Fremdschlüssel kunde_id auf null.
-- - Wieder hervorholen (archiviert → nein) nur, wenn der Elternordner
--   nicht archiviert ist.
-- security definer, damit "kunden" unabhängig von dessen Regeln gelesen
-- werden kann (auch wenn der Fremdschlüssel die Änderung auslöst).
-- "lw.firma_umbau" ist eine transaktionslokale Einstellung, die nur
-- lw_quests_firma und die Übernahme am Ende dieses Skripts setzen.
-- ---------------------------------------------------------------------
create or replace function public.lw_ordner_struktur()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_umbau  boolean := coalesce(current_setting('lw.firma_umbau', true), '') = '1';
  v_firma  boolean;
  v_name   text;
  v_lage   boolean;            -- angelegt oder verschoben: Lage prüfen
  e        public.lw_ordner;   -- Elternordner (alle Felder null, wenn keiner)
begin
  if tg_op = 'UPDATE' then
    if new.art is distinct from old.art or new.quest_id is distinct from old.quest_id then
      raise exception 'Art und Quest eines Ordners können nicht geändert werden.';
    end if;
    if old.art in ('intern', 'extern') then
      if new.name       is distinct from old.name
         or new.eltern_id  is distinct from old.eltern_id
         or new.archiviert is distinct from old.archiviert
         or new.kunde_id   is distinct from old.kunde_id then
        raise exception 'Intern und Extern können nicht geändert werden.';
      end if;
      return new;
    end if;
    if new.kunde_id is distinct from old.kunde_id
       and not (new.kunde_id is null and old.kunde_id is not null
                and not exists (select 1 from public.kunden where id = old.kunde_id)) then
      raise exception 'Der Kunde eines Ordners kann nicht geändert werden.';
    end if;
    if new.archiviert is distinct from old.archiviert and not new.archiviert
       and exists (select 1 from public.lw_ordner where id = new.eltern_id and archiviert) then
      raise exception 'Der übergeordnete Ordner ist archiviert.';
    end if;
    v_lage := new.eltern_id is distinct from old.eltern_id;
  else
    -- Anlegen
    v_lage := true;
    if new.art in ('intern', 'extern') then
      if not v_umbau then
        raise exception 'Intern und Extern werden automatisch angelegt.';
      end if;
      new.name := case new.art when 'intern' then 'Intern' else 'Extern' end;
      new.archiviert := false;
    end if;
    if new.art = 'kunde' then
      if new.kunde_id is null then
        raise exception 'Bitte einen Kunden wählen.';
      end if;
      if exists (select 1 from public.lw_ordner
                  where quest_id = new.quest_id and kunde_id = new.kunde_id) then
        raise exception 'Für diesen Kunden gibt es in dieser Quest schon einen Ordner.';
      end if;
    elsif new.kunde_id is not null then
      raise exception 'Nur Kunden-Ordner haben einen Kunden.';
    end if;
  end if;

  -- Name
  if new.art = 'kunde' then
    select case when coalesce(k.firma, '') <> ''
                then k.firma || coalesce(' (' || nullif(concat_ws(' ', nullif(k.vorname, ''), nullif(k.nachname, '')), '') || ')', '')
                else coalesce(nullif(concat_ws(' ', nullif(k.vorname, ''), nullif(k.nachname, '')), ''), 'Ohne Namen')
           end
      into v_name
      from public.kunden k
     where k.id = new.kunde_id;
    if v_name is not null then
      new.name := v_name;                 -- Kopie aktuell halten
    elsif tg_op = 'INSERT' then
      raise exception 'Diesen Kunden gibt es nicht.';
    else
      new.name := old.name;               -- Kunde gelöscht: letzten Namen behalten
    end if;
  elsif new.art = 'projekt' then
    new.name := btrim(new.name);
    if coalesce(new.name, '') = '' then
      raise exception 'Bitte einen Namen eingeben.';
    end if;
  end if;

  -- Lage (beim Anlegen und Verschieben)
  if v_lage then
    select firma into v_firma from public.lw_quests where id = new.quest_id;
    if new.eltern_id is not null then
      select * into e from public.lw_ordner where id = new.eltern_id;
      if not found then
        raise exception 'Hier kann dieser Ordner nicht liegen.';
      end if;
      if e.quest_id <> new.quest_id then
        raise exception 'Dieser Ordner gehört zu einer anderen Quest.';
      end if;
      if e.archiviert then
        raise exception 'In einen archivierten Ordner kann nichts einsortiert werden.';
      end if;
    end if;
    if not coalesce(
         (new.art in ('intern', 'extern') and new.eltern_id is null and v_firma)
      or (new.art = 'kunde' and e.art = 'extern')
      or (new.art = 'projekt' and ((new.eltern_id is null and not v_firma)
                                   or e.art in ('intern', 'kunde'))),
       false) then
      raise exception 'Hier kann dieser Ordner nicht liegen.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists lw_ordner_struktur on public.lw_ordner;
create trigger lw_ordner_struktur before insert or update on public.lw_ordner
for each row execute function public.lw_ordner_struktur();

-- ---------------------------------------------------------------------
-- Archivieren vererbt sich auf alle Unterordner (in beide Richtungen).
-- Jede Ebene löst den Trigger für die nächste aus.
-- ---------------------------------------------------------------------
create or replace function public.lw_ordner_archiv()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.lw_ordner
     set archiviert = new.archiviert
   where eltern_id = new.id
     and archiviert is distinct from new.archiviert;
  return null;
end;
$$;
drop trigger if exists lw_ordner_archiv on public.lw_ordner;
create trigger lw_ordner_archiv after update on public.lw_ordner
for each row when (old.archiviert is distinct from new.archiviert)
execute function public.lw_ordner_archiv();

-- ---------------------------------------------------------------------
-- Projekt verschoben (z. B. von einem Kunden zu einem anderen oder nach
-- Intern): der Kunde seiner Aufgaben ändert sich mit. Das Setzen von
-- kunde_id rechnet lw_tasks_ordner nach, lw_tasks_kunde_zeiten zieht
-- die Zeiteinträge nach.
-- ---------------------------------------------------------------------
create or replace function public.lw_ordner_kunde_folgt()
returns trigger language plpgsql set search_path = public as $$
declare
  v_kunde uuid;
begin
  select case when e.art = 'kunde' then e.kunde_id end
    into v_kunde
    from public.lw_ordner e
   where e.id = new.eltern_id;
  update public.lw_tasks
     set kunde_id = v_kunde
   where ordner_id = new.id
     and kunde_id is distinct from v_kunde;
  return null;
end;
$$;
drop trigger if exists lw_ordner_kunde_folgt on public.lw_ordner;
create trigger lw_ordner_kunde_folgt after update on public.lw_ordner
for each row when (old.eltern_id is distinct from new.eltern_id and new.art = 'projekt')
execute function public.lw_ordner_kunde_folgt();

-- ---------------------------------------------------------------------
-- Löschen nur für leere Ordner (keine Unterordner, keine Aufgaben –
-- auch keine erledigten oder archivierten). Intern/Extern nur über
-- "Firma aus". Wird die ganze Quest gelöscht, ist alles erlaubt (die
-- Quest ist dann schon weg, Aufgaben mit Zeit blockiert lw_zeiten).
-- security definer, damit alle Aufgaben zählen.
-- ---------------------------------------------------------------------
create or replace function public.lw_ordner_loeschen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.lw_quests where id = old.quest_id) then
    return old;
  end if;
  if old.art in ('intern', 'extern')
     and coalesce(current_setting('lw.firma_umbau', true), '') <> '1' then
    raise exception 'Intern und Extern können nicht geändert werden.';
  end if;
  if exists (select 1 from public.lw_ordner where eltern_id = old.id)
     or exists (select 1 from public.lw_tasks where ordner_id = old.id) then
    raise exception 'Der Ordner ist nicht leer. Archiviere ihn stattdessen.';
  end if;
  return old;
end;
$$;
drop trigger if exists lw_ordner_loeschen on public.lw_ordner;
create trigger lw_ordner_loeschen before delete on public.lw_ordner
for each row execute function public.lw_ordner_loeschen();

-- ---------------------------------------------------------------------
-- Aufgabe einsortieren: Der Ordner muss zur Quest der Aufgabe gehören
-- und darf (beim Einsortieren) nicht archiviert sein. Wird nur die
-- Quest gewechselt, verlässt die Aufgabe ihren Ordner.
-- kunde_id wird IMMER aus dem Ordner abgeleitet (Kunden-Ordner oder
-- Kunde über dem Projekt, sonst null) – vom Client geschickte Werte
-- zählen nicht. Darum feuert der Trigger auch bei "update of kunde_id".
-- Ist der abgeleitete Kunde gerade gelöscht worden (Mediawo OS,
-- Fremdschlüssel setzt null), bleibt es bei null.
-- security definer, damit die Prüfung nicht an Leserechten scheitert.
-- ---------------------------------------------------------------------
create or replace function public.lw_tasks_ordner()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o        public.lw_ordner;
  v_kunde  uuid;
  v_neu    boolean;
begin
  if tg_op = 'INSERT' then
    v_neu := true;
  else
    if new.quest_id is distinct from old.quest_id
       and new.ordner_id is not distinct from old.ordner_id then
      new.ordner_id := null;
    end if;
    v_neu := new.ordner_id is distinct from old.ordner_id;
  end if;

  if new.ordner_id is not null then
    select * into o from public.lw_ordner where id = new.ordner_id;
    if not found then
      raise exception 'Diesen Ordner gibt es nicht.';
    end if;
    if o.quest_id <> new.quest_id then
      raise exception 'Dieser Ordner gehört zu einer anderen Quest.';
    end if;
    if v_neu and o.archiviert then
      raise exception 'In einen archivierten Ordner kann nichts einsortiert werden.';
    end if;
    if o.art = 'kunde' then
      v_kunde := o.kunde_id;
    elsif o.art = 'projekt' and o.eltern_id is not null then
      select case when e.art = 'kunde' then e.kunde_id end
        into v_kunde
        from public.lw_ordner e
       where e.id = o.eltern_id;
    end if;
    if v_kunde is not null
       and not exists (select 1 from public.kunden where id = v_kunde) then
      v_kunde := null;
    end if;
  end if;
  new.kunde_id := v_kunde;
  return new;
end;
$$;
drop trigger if exists lw_tasks_ordner on public.lw_tasks;
create trigger lw_tasks_ordner before insert or update of ordner_id, quest_id, kunde_id on public.lw_tasks
for each row execute function public.lw_tasks_ordner();

-- ---------------------------------------------------------------------
-- Zeit folgt der Aufgabe: Ändert sich der Kunde einer Aufgabe
-- (Umsortieren), bekommen alle nicht gesperrten Einträge dieser Aufgabe
-- – von jeder Person, auch der laufende – den neuen Kunden, und
-- "abrechenbar" wird auf den Standard gesetzt (Firma-Quest und Kunde).
-- Bleibt der Kunde gleich, feuert der Trigger nicht: ein von Hand
-- umgeschaltetes "abrechenbar" bleibt.
-- Gesperrt (wie lw_zeiten_sperre): rechnung_id gesetzt und Rechnung
-- nicht storniert oder nicht auffindbar – solche Einträge werden gar
-- nicht erst angefasst. quest_id/task_id ändern sich nicht, also
-- greift lw_zeiten_zuordnung nicht.
-- Löscht Mediawo OS den Kunden, setzen die Fremdschlüssel selbst null;
-- das ist kein Umsortieren, "abrechenbar" bleibt dann unverändert.
-- security definer, damit auch Einträge anderer Personen mitziehen.
-- "after update" ohne Spaltenliste, weil kunde_id meist erst vom
-- Trigger lw_tasks_ordner gesetzt wird.
-- ---------------------------------------------------------------------
create or replace function public.lw_tasks_kunde_zeiten()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_abrechenbar boolean;
begin
  if new.kunde_id is null and old.kunde_id is not null
     and not exists (select 1 from public.kunden where id = old.kunde_id) then
    return null;
  end if;
  select coalesce(q.firma, false) and new.kunde_id is not null
    into v_abrechenbar
    from public.lw_quests q
   where q.id = new.quest_id;
  update public.lw_zeiten z
     set kunde_id    = new.kunde_id,
         abrechenbar = coalesce(v_abrechenbar, false)
   where z.task_id = new.id
     and (z.rechnung_id is null
          or exists (select 1 from public.rechnungen r
                      where r.id = z.rechnung_id and r.status = 'storniert'));
  return null;
end;
$$;
drop trigger if exists lw_tasks_kunde_zeiten on public.lw_tasks;
create trigger lw_tasks_kunde_zeiten after update on public.lw_tasks
for each row when (old.kunde_id is distinct from new.kunde_id)
execute function public.lw_tasks_kunde_zeiten();

-- ---------------------------------------------------------------------
-- Zeit folgt der Aufgabe, auch bei neuen und bearbeiteten Einträgen:
-- Hat ein Eintrag eine Aufgabe, ist sein Kunde IMMER der Kunde dieser
-- Aufgabe – ein veralteter Wert vom Client (Aufgabe wurde inzwischen,
-- z. B. auf einem anderen Gerät, umsortiert) zählt nicht.
-- Schickt der Client einen anderen Kunden als den der Aufgabe, wird
-- "abrechenbar" auf den Standard gesetzt (Firma-Quest und Kunde), weil
-- seine Auswahl für den falschen Kunden galt. Stimmt der Kunde, bleibt
-- "abrechenbar", wie geschickt (auch ein von Hand umgeschaltetes).
-- Beim Ändern feuert der Trigger nur, wenn kunde_id oder task_id
-- mitgeschickt werden; fehlt kunde_id, gilt der bisherige Wert der
-- Zeile als "geschickt". Einträge ohne Aufgabe: unverändert.
-- Gesperrte Einträge (wie lw_zeiten_sperre) fasst er nicht an; die
-- Änderung lehnt danach lw_zeiten_sperre wie bisher ab ("Diese Zeit ist
-- abgerechnet und gesperrt."). Er selbst meldet keine Fehler – eine
-- fehlende oder fremde Aufgabe meldet lw_zeiten_zuordnung.
-- Passt zu lw_tasks_kunde_zeiten: dort wird kunde_id auf den neuen
-- Kunden der Aufgabe gesetzt (die Aufgabe ist dann schon geändert),
-- also genau der Wert, den dieser Trigger verlangt – er ändert nichts.
-- Löscht Mediawo OS den Kunden (Fremdschlüssel setzt null), bleibt es
-- bei null und "abrechenbar" unverändert.
-- security definer, damit Aufgabe und Quest immer gelesen werden können.
-- ---------------------------------------------------------------------
create or replace function public.lw_zeiten_kunde_von_aufgabe()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kunde  uuid;
  v_firma  boolean;
begin
  if new.task_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    -- gesperrt: nichts tun, lw_zeiten_sperre lehnt danach ab
    if old.rechnung_id is not null
       and not exists (select 1 from public.rechnungen r
                        where r.id = old.rechnung_id and r.status = 'storniert') then
      return new;
    end if;
    -- Kunde in Mediawo OS gelöscht: kein Umsortieren
    if new.kunde_id is null and old.kunde_id is not null
       and not exists (select 1 from public.kunden where id = old.kunde_id) then
      return new;
    end if;
  end if;

  select t.kunde_id, coalesce(q.firma, false)
    into v_kunde, v_firma
    from public.lw_tasks t
    join public.lw_quests q on q.id = t.quest_id
   where t.id = new.task_id;
  if not found then
    return new;
  end if;
  if v_kunde is not null
     and not exists (select 1 from public.kunden where id = v_kunde) then
    v_kunde := null;
  end if;

  if new.kunde_id is distinct from v_kunde then
    new.kunde_id    := v_kunde;
    new.abrechenbar := v_firma and v_kunde is not null;
  end if;
  return new;
end;
$$;
drop trigger if exists lw_zeiten_kunde_von_aufgabe on public.lw_zeiten;
create trigger lw_zeiten_kunde_von_aufgabe before insert or update of kunde_id, task_id on public.lw_zeiten
for each row execute function public.lw_zeiten_kunde_von_aufgabe();

-- ---------------------------------------------------------------------
-- Hilfsfunktion (nur intern, nicht aus der App aufrufbar):
-- Firma-Quest einrichten – Intern/Extern anlegen, falls sie fehlen,
-- Projekte von ganz oben nach Intern, Aufgaben mit Kunde aber ohne
-- Ordner nach Extern → (Kunde) → "Allgemein". Ihr Kunde bleibt gleich,
-- also ändert sich an den Zeiteinträgen nichts.
-- Ist der Kunden-Ordner archiviert, bleiben diese Aufgaben, wo sie sind
-- (in archivierte Ordner wird nicht einsortiert).
-- Der Aufrufer setzt vorher lw.firma_umbau = '1'.
-- ---------------------------------------------------------------------
create or replace function public.lw_ordner_einrichten(q uuid)
returns void language plpgsql set search_path = public as $$
declare
  v_intern  uuid;
  v_extern  uuid;
  v_ko      public.lw_ordner;
  v_allg    uuid;
  k         uuid;
begin
  select id into v_intern from public.lw_ordner where quest_id = q and art = 'intern';
  if v_intern is null then
    insert into public.lw_ordner (quest_id, art, name)
    values (q, 'intern', 'Intern') returning id into v_intern;
  end if;
  select id into v_extern from public.lw_ordner where quest_id = q and art = 'extern';
  if v_extern is null then
    insert into public.lw_ordner (quest_id, art, name)
    values (q, 'extern', 'Extern') returning id into v_extern;
  end if;

  update public.lw_ordner
     set eltern_id = v_intern
   where quest_id = q and eltern_id is null and art = 'projekt';

  for k in
    select distinct t.kunde_id from public.lw_tasks t
     where t.quest_id = q and t.kunde_id is not null and t.ordner_id is null
  loop
    select * into v_ko from public.lw_ordner
     where quest_id = q and art = 'kunde' and kunde_id = k;
    if not found then
      insert into public.lw_ordner (quest_id, eltern_id, art, name, kunde_id)
      values (q, v_extern, 'kunde', '', k)
      returning * into v_ko;
    end if;
    continue when v_ko.archiviert;

    v_allg := null;
    select id into v_allg from public.lw_ordner
     where eltern_id = v_ko.id and art = 'projekt' and name = 'Allgemein' and not archiviert
     order by created_at
     limit 1;
    if v_allg is null then
      insert into public.lw_ordner (quest_id, eltern_id, art, name)
      values (q, v_ko.id, 'projekt', 'Allgemein') returning id into v_allg;
    end if;

    update public.lw_tasks
       set ordner_id = v_allg
     where quest_id = q and kunde_id = k and ordner_id is null;
  end loop;
end;
$$;
revoke all on function public.lw_ordner_einrichten(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- "Firma" an/aus
-- An (auch beim Anlegen einer Firma-Quest): lw_ordner_einrichten.
-- Aus: abgelehnt, solange es Kunden-Ordner gibt – auch archivierte
-- zählen, Archivieren reicht also nicht. Sonst wandern die Projekte aus Intern nach ganz oben, Aufgaben
-- direkt in Intern/Extern liegen danach ohne Ordner, Intern und Extern
-- werden gelöscht. Keine Aufgabe geht verloren.
-- security definer, damit der Umbau nicht an den Regeln scheitert.
-- ---------------------------------------------------------------------
create or replace function public.lw_quests_firma()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_vorher  text := current_setting('lw.firma_umbau', true);
  v_intern  uuid;
  v_extern  uuid;
begin
  if tg_op = 'INSERT' then
    if not new.firma then
      return null;
    end if;
  elsif new.firma is not distinct from old.firma then
    return null;
  end if;

  perform set_config('lw.firma_umbau', '1', true);
  if new.firma then
    perform public.lw_ordner_einrichten(new.id);
  else
    if exists (select 1 from public.lw_ordner where quest_id = new.id and art = 'kunde') then
      raise exception 'Diese Quest hat Kunden-Ordner. Firma kann erst ausgeschaltet werden, wenn es keine mehr gibt.';
    end if;
    select id into v_intern from public.lw_ordner where quest_id = new.id and art = 'intern';
    select id into v_extern from public.lw_ordner where quest_id = new.id and art = 'extern';
    update public.lw_ordner set eltern_id = null
     where quest_id = new.id and eltern_id in (v_intern, v_extern);
    update public.lw_tasks set ordner_id = null
     where ordner_id in (v_intern, v_extern);
    delete from public.lw_ordner where id in (v_intern, v_extern);
  end if;
  perform set_config('lw.firma_umbau', coalesce(v_vorher, ''), true);
  return null;
end;
$$;
drop trigger if exists lw_quests_firma on public.lw_quests;
create trigger lw_quests_firma after insert or update of firma on public.lw_quests
for each row execute function public.lw_quests_firma();

-- ---------------------------------------------------------------------
-- Zugriffsrechte: nur angemeldete Nutzer, kein Zugriff für anon.
-- Erst alles entziehen, dann gezielt vergeben (wie in 01).
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['lw_ordner']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

grant select, insert, update, delete on public.lw_ordner to authenticated;

-- ---------------------------------------------------------------------
-- Regeln: Ordner haben dieselben Rechte wie die Aufgaben ihrer Quest
-- (privat nur der Besitzer, geteilt beide alles)
-- ---------------------------------------------------------------------
drop policy if exists "lw_ordner_lesen" on public.lw_ordner;
create policy "lw_ordner_lesen" on public.lw_ordner
  for select to authenticated
  using (public.lw_sichtbar(quest_id));

drop policy if exists "lw_ordner_anlegen" on public.lw_ordner;
create policy "lw_ordner_anlegen" on public.lw_ordner
  for insert to authenticated
  with check (public.lw_sichtbar(quest_id));

drop policy if exists "lw_ordner_aendern" on public.lw_ordner;
create policy "lw_ordner_aendern" on public.lw_ordner
  for update to authenticated
  using (public.lw_sichtbar(quest_id))
  with check (public.lw_sichtbar(quest_id));

drop policy if exists "lw_ordner_loeschen" on public.lw_ordner;
create policy "lw_ordner_loeschen" on public.lw_ordner
  for delete to authenticated
  using (public.lw_sichtbar(quest_id));

-- ---------------------------------------------------------------------
-- Bestehende Daten übernehmen (wiederholbar): jede Firma-Quest wird
-- eingerichtet. Beim zweiten Lauf gibt es nichts mehr zu tun.
-- ---------------------------------------------------------------------
do $$
declare q uuid;
begin
  perform set_config('lw.firma_umbau', '1', true);
  for q in select id from public.lw_quests where firma order by created_at
  loop
    perform public.lw_ordner_einrichten(q);
  end loop;
  perform set_config('lw.firma_umbau', '', true);
end $$;
