-- =====================================================================
-- LW – Datenbank (Version 1)
-- Im Supabase-Dashboard unter "SQL Editor" komplett einfügen und
-- einmal auf "Run" klicken. Das Skript kann gefahrlos erneut
-- ausgeführt werden (legt nur an, was fehlt, und setzt Regeln neu).
--
-- Läuft im selben Projekt wie Mediawo OS. Bestehende Mediawo-Tabellen
-- werden NICHT verändert; "kunden" und "rechnungen" werden nur
-- referenziert (müssen also schon existieren, siehe Mediawo 01_schema.sql).
-- Alle neuen Tabellen beginnen mit "lw_" und sind bewusst NICHT Teil
-- der "nur_team"-Schleife von Mediawo OS.
--
-- Hinweis: "create table if not exists" ergänzt bei erneutem Ausführen
-- keine neuen Spalten. Spätere Änderungen kommen in ein eigenes Skript.
--
-- Danach zur Kontrolle 02_lw_pruefen.sql ausführen.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profile (Anzeigename für Zuweisungen)
-- ---------------------------------------------------------------------
create table if not exists public.lw_profile (
  id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name  text not null
);

-- ---------------------------------------------------------------------
-- Quests
-- owner_id ist nach dem Anlegen fest (Trigger weiter unten), damit
-- "Teilen beenden" die Quest wirklich wieder nur dem Besitzer zeigt.
-- ---------------------------------------------------------------------
create table if not exists public.lw_quests (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id),
  name        text not null,
  farbe       text not null default '#4F7CAC',
  geteilt     boolean not null default false,
  firma       boolean not null default false,   -- Firmen-Quest: Aufgaben dürfen einen Kunden haben
  sortierung  int not null default 0,
  archiviert  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Aufgaben
-- Löschen einer Quest nimmt ihre Aufgaben mit (cascade). Liegt auf einer
-- Aufgabe Zeit, blockiert lw_zeiten das Löschen (restrict, Code 23503).
-- ---------------------------------------------------------------------
create table if not exists public.lw_tasks (
  id             uuid primary key default gen_random_uuid(),
  quest_id       uuid not null references public.lw_quests(id) on delete cascade,
  titel          text not null,
  notiz          text,
  tag            date,                         -- geplanter Tag, null = Backlog ohne Tag
  zugewiesen_an  uuid references auth.users(id) on delete set null,
  kunde_id       uuid references public.kunden(id) on delete set null,
  erledigt_am    timestamptz,                  -- null = offen
  sortierung     int not null default 0,
  archiviert     boolean not null default false,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Zeiteinträge
-- Getrackte Zeit geht nie verloren: Quest und Aufgabe mit Zeit können
-- nicht gelöscht werden (restrict), nur archiviert.
-- ende = null bedeutet: läuft gerade (höchstens einer pro Person).
-- rechnung_id wird erst in Schritt 2 (Abrechnung) gesetzt.
-- ---------------------------------------------------------------------
create table if not exists public.lw_zeiten (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id),
  quest_id     uuid not null references public.lw_quests(id) on delete restrict,
  task_id      uuid references public.lw_tasks(id) on delete restrict,
  kunde_id     uuid references public.kunden(id) on delete set null,
  start        timestamptz not null default now(),
  ende         timestamptz,
  abrechenbar  boolean not null default false,
  notiz        text,
  rechnung_id  uuid references public.rechnungen(id),
  constraint lw_zeiten_ende_nach_start check (ende is null or ende > start)
);

-- Höchstens ein laufender Eintrag pro Person
create unique index if not exists lw_zeiten_ein_laufender
  on public.lw_zeiten (user_id) where ende is null;

-- Indizes für Fremdschlüssel und die üblichen Abfragen
create index if not exists lw_tasks_quest_idx      on public.lw_tasks (quest_id);
create index if not exists lw_zeiten_quest_idx     on public.lw_zeiten (quest_id);
create index if not exists lw_zeiten_task_idx      on public.lw_zeiten (task_id);
create index if not exists lw_zeiten_user_start_idx on public.lw_zeiten (user_id, start);
create index if not exists lw_zeiten_rechnung_idx  on public.lw_zeiten (rechnung_id);

-- ---------------------------------------------------------------------
-- Hilfsfunktion: Ist die Quest für den angemeldeten Nutzer sichtbar?
-- (eigene Quest oder geteilt). security definer, damit die Regeln auf
-- lw_tasks/lw_zeiten nicht von den Regeln auf lw_quests abhängen.
-- Liest immer den gespeicherten Stand der Quest (Stand vor der
-- laufenden Änderung), siehe Regel "lw_quests_aendern".
-- ---------------------------------------------------------------------
create or replace function public.lw_sichtbar(q uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lw_quests
     where id = q
       and (owner_id = auth.uid() or geteilt)
  );
$$;
revoke all on function public.lw_sichtbar(uuid) from public, anon;
grant execute on function public.lw_sichtbar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Schutz: Besitzer einer Quest ist fest
-- ---------------------------------------------------------------------
create or replace function public.lw_quests_besitzer_fest()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Der Besitzer einer Quest kann nicht geändert werden.';
  end if;
  return new;
end;
$$;
drop trigger if exists lw_quests_besitzer_fest on public.lw_quests;
create trigger lw_quests_besitzer_fest before update on public.lw_quests
for each row execute function public.lw_quests_besitzer_fest();

-- ---------------------------------------------------------------------
-- Schutz: Aufgabe mit gebuchter Zeit nicht in eine andere Quest verschieben
-- (sonst passen task_id und quest_id der Zeiteinträge nicht mehr zusammen).
-- security definer, damit auch Einträge anderer Personen zählen.
-- ---------------------------------------------------------------------
create or replace function public.lw_tasks_quest_fest()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.quest_id is distinct from old.quest_id
     and exists (select 1 from public.lw_zeiten where task_id = old.id) then
    raise exception 'Auf dieser Aufgabe ist Zeit gebucht. Sie kann nicht in eine andere Quest verschoben werden.';
  end if;
  return new;
end;
$$;
drop trigger if exists lw_tasks_quest_fest on public.lw_tasks;
create trigger lw_tasks_quest_fest before update of quest_id on public.lw_tasks
for each row execute function public.lw_tasks_quest_fest();

-- ---------------------------------------------------------------------
-- Abrechnungssperre (vorbereitet für Schritt 2)
-- Ein Eintrag, dessen bisherige rechnung_id auf eine nicht stornierte
-- Rechnung zeigt, ist festgeschrieben (GoBD): nicht änderbar, nicht
-- löschbar – auch das Entfernen der rechnung_id ist dann verboten.
-- Wird die Rechnung storniert, ist der Eintrag wieder frei.
-- Das erstmalige Setzen der rechnung_id (Abrechnen) ist erlaubt.
-- Fehlt die Rechnung (nicht lesbar), gilt der Eintrag sicherheitshalber
-- als gesperrt.
-- ---------------------------------------------------------------------
create or replace function public.lw_zeiten_sperre()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if old.rechnung_id is not null then
    select status into v_status from public.rechnungen where id = old.rechnung_id;
    if v_status is distinct from 'storniert' then
      raise exception 'Diese Zeit ist abgerechnet und gesperrt.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
drop trigger if exists lw_zeiten_sperre on public.lw_zeiten;
create trigger lw_zeiten_sperre before update or delete on public.lw_zeiten
for each row execute function public.lw_zeiten_sperre();

-- ---------------------------------------------------------------------
-- Zuordnung: Ist eine Aufgabe angegeben, muss sie zur Quest des
-- Eintrags gehören. (Name beginnt mit "z", damit die Sperre vorher läuft.)
-- ---------------------------------------------------------------------
create or replace function public.lw_zeiten_zuordnung()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.task_id is not null
     and not exists (select 1 from public.lw_tasks
                      where id = new.task_id and quest_id = new.quest_id) then
    raise exception 'Die Aufgabe gehört nicht zu dieser Quest.';
  end if;
  return new;
end;
$$;
drop trigger if exists lw_zeiten_zuordnung on public.lw_zeiten;
create trigger lw_zeiten_zuordnung before insert or update of quest_id, task_id on public.lw_zeiten
for each row execute function public.lw_zeiten_zuordnung();

-- ---------------------------------------------------------------------
-- Zugriffsrechte: nur angemeldete Nutzer, kein Zugriff für anon.
-- Erst alles entziehen (auch truncate/references/trigger aus den
-- Supabase-Standardrechten), dann gezielt vergeben.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['lw_profile','lw_quests','lw_tasks','lw_zeiten']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

grant select, insert, update         on public.lw_profile to authenticated;  -- kein delete
grant select, insert, update, delete on public.lw_quests  to authenticated;
grant select, insert, update, delete on public.lw_tasks   to authenticated;
grant select, insert, update, delete on public.lw_zeiten  to authenticated;

-- ---------------------------------------------------------------------
-- Regeln (Row Level Security) – je Aktion eine eigene Regel
-- ---------------------------------------------------------------------

-- Profile: alle Angemeldeten lesen, jeder schreibt nur sein eigenes
drop policy if exists "lw_profile_lesen" on public.lw_profile;
create policy "lw_profile_lesen" on public.lw_profile
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "lw_profile_anlegen" on public.lw_profile;
create policy "lw_profile_anlegen" on public.lw_profile
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "lw_profile_aendern" on public.lw_profile;
create policy "lw_profile_aendern" on public.lw_profile
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Quests: eigene oder geteilte
drop policy if exists "lw_quests_lesen" on public.lw_quests;
create policy "lw_quests_lesen" on public.lw_quests
  for select to authenticated
  using (owner_id = auth.uid() or geteilt);

drop policy if exists "lw_quests_anlegen" on public.lw_quests;
create policy "lw_quests_anlegen" on public.lw_quests
  for insert to authenticated
  with check (owner_id = auth.uid());

-- Ändern: Auch Nicht-Besitzer dürfen bei geteilten Quests das Teilen
-- beenden. Danach ist geteilt = false und owner_id fremd, darum prüft
-- "with check" zusätzlich lw_sichtbar(id) – das liest den gespeicherten
-- Stand vor der Änderung (die Quest war also geteilt). Den Besitzer
-- kann niemand ändern (Trigger lw_quests_besitzer_fest).
-- Hinweis für den Client: nach "Teilen beenden" durch den
-- Nicht-Besitzer die Zeile nicht zurücklesen (kein .select()).
drop policy if exists "lw_quests_aendern" on public.lw_quests;
create policy "lw_quests_aendern" on public.lw_quests
  for update to authenticated
  using (owner_id = auth.uid() or geteilt)
  with check (owner_id = auth.uid() or geteilt or public.lw_sichtbar(id));

drop policy if exists "lw_quests_loeschen" on public.lw_quests;
create policy "lw_quests_loeschen" on public.lw_quests
  for delete to authenticated
  using (owner_id = auth.uid() or geteilt);

-- Aufgaben: alles, solange die Quest sichtbar ist (auch die Ziel-Quest)
drop policy if exists "lw_tasks_lesen" on public.lw_tasks;
create policy "lw_tasks_lesen" on public.lw_tasks
  for select to authenticated
  using (public.lw_sichtbar(quest_id));

drop policy if exists "lw_tasks_anlegen" on public.lw_tasks;
create policy "lw_tasks_anlegen" on public.lw_tasks
  for insert to authenticated
  with check (public.lw_sichtbar(quest_id));

drop policy if exists "lw_tasks_aendern" on public.lw_tasks;
create policy "lw_tasks_aendern" on public.lw_tasks
  for update to authenticated
  using (public.lw_sichtbar(quest_id))
  with check (public.lw_sichtbar(quest_id));

drop policy if exists "lw_tasks_loeschen" on public.lw_tasks;
create policy "lw_tasks_loeschen" on public.lw_tasks
  for delete to authenticated
  using (public.lw_sichtbar(quest_id));

-- Zeiteinträge: eigene lesen, auf geteilten Quests auch die der anderen;
-- schreiben nur eigene auf sichtbaren Quests
drop policy if exists "lw_zeiten_lesen" on public.lw_zeiten;
create policy "lw_zeiten_lesen" on public.lw_zeiten
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.lw_quests q where q.id = lw_zeiten.quest_id and q.geteilt)
  );

drop policy if exists "lw_zeiten_anlegen" on public.lw_zeiten;
create policy "lw_zeiten_anlegen" on public.lw_zeiten
  for insert to authenticated
  with check (user_id = auth.uid() and public.lw_sichtbar(quest_id));

drop policy if exists "lw_zeiten_aendern" on public.lw_zeiten;
create policy "lw_zeiten_aendern" on public.lw_zeiten
  for update to authenticated
  using (user_id = auth.uid() and public.lw_sichtbar(quest_id))
  with check (user_id = auth.uid() and public.lw_sichtbar(quest_id));

drop policy if exists "lw_zeiten_loeschen" on public.lw_zeiten;
create policy "lw_zeiten_loeschen" on public.lw_zeiten
  for delete to authenticated
  using (user_id = auth.uid() and public.lw_sichtbar(quest_id));
