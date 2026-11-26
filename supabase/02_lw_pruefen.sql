-- =====================================================================
-- LW – Kontrolle nach dem Einrichten (nur lesen, ändert nichts)
-- Im Supabase-Dashboard unter "SQL Editor" einfügen und auf "Run"
-- klicken. Ergebnis ist eine einzige Tabelle:
--   pruefung | objekt | ergebnis
-- Erwartet (nach 01_lw_schema.sql und 03_lw_ordner.sql):
--   - RLS:      5 Zeilen (lw_ordner, lw_profile, lw_quests, lw_tasks,
--               lw_zeiten) mit "an"
--   - anon:     5 Zeilen mit "kein Zugriff"
--   - Regel:    lw_ordner 4, lw_profile 3, lw_quests 4, lw_tasks 4,
--               lw_zeiten 4
--   - Index:    lw_zeiten_ein_laufender (unique, where ende is null),
--               lw_ordner_ein_intern, lw_ordner_ein_extern,
--               lw_ordner_ein_kunde (alle unique)
--   - Trigger:  lw_ordner_archiv, lw_ordner_kunde_folgt,
--               lw_ordner_loeschen, lw_ordner_struktur,
--               lw_quests_besitzer_fest, lw_quests_firma,
--               lw_tasks_ersteller_fest, lw_tasks_kunde_zeiten,
--               lw_tasks_ordner, lw_tasks_quest_fest, lw_zeiten_sperre,
--               lw_zeiten_zuordnung – alle "aktiv"
--   - Rechte authenticated: lw_profile "INSERT, SELECT, UPDATE",
--               die anderen vier "DELETE, INSERT, SELECT, UPDATE"
--   - Funktion: lw_sichtbar (security definer, stable) und
--               lw_quest_teilen_beenden (security definer), beide
--               "anon: nein, authenticated: ja";
--               lw_ordner_einrichten (nur intern):
--               "anon: nein, authenticated: nein"
--   - Spalte:   lw_tasks.ordner_id "vorhanden"
-- Steht irgendwo "AUS", "FEHLT", "ZUGRIFF!", "AUSFÜHRBAR!", "NEIN"
-- oder "inaktiv", stimmt etwas nicht.
-- =====================================================================

with tabellen(name) as (
  values ('lw_profile'), ('lw_quests'), ('lw_tasks'), ('lw_zeiten'), ('lw_ordner')
),
ergebnis(reihe, pruefung, objekt, ergebnis) as (
  -- Row Level Security eingeschaltet?
  select 1, 'RLS'::text, t.name::text,
         case when c.oid is null then 'FEHLT'
              when c.relrowsecurity then 'an'
              else 'AUS' end
    from tabellen t
    left join pg_class c
      on c.relname = t.name and c.relnamespace = 'public'::regnamespace

  union all
  -- Kein Zugriff für anon?
  select 2, 'anon', t.name::text,
         case when c.oid is null then 'FEHLT'
              when has_table_privilege('anon', c.oid,
                     'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                then 'ZUGRIFF!'
              else 'kein Zugriff' end
    from tabellen t
    left join pg_class c
      on c.relname = t.name and c.relnamespace = 'public'::regnamespace

  union all
  -- Regeln je Tabelle
  select 3, 'Regel', (p.tablename || ': ' || p.policyname)::text,
         (p.cmd || ' | Rollen: ' || array_to_string(p.roles, ',')
          || ' | using: ' || coalesce(p.qual, '-')
          || ' | check: ' || coalesce(p.with_check, '-'))::text
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename in (select name from tabellen)

  union all
  -- Indizes: höchstens ein laufender Eintrag pro Person,
  -- je Quest ein Intern, ein Extern und ein Ordner je Kunde
  select 4, 'Index', n.name::text, coalesce(i.indexdef, 'FEHLT')::text
    from (values ('lw_zeiten_ein_laufender'), ('lw_ordner_ein_intern'),
                 ('lw_ordner_ein_extern'), ('lw_ordner_ein_kunde')) as n(name)
    left join pg_indexes i
      on i.schemaname = 'public' and i.indexname = n.name

  union all
  -- Trigger auf den LW-Tabellen
  select 5, 'Trigger', (c.relname || ': ' || tg.tgname)::text,
         case tg.tgenabled when 'O' then 'aktiv'
                           when 'A' then 'aktiv'
                           else 'inaktiv (' || tg.tgenabled::text || ')' end
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
   where not tg.tgisinternal
     and c.relnamespace = 'public'::regnamespace
     and c.relname in (select name from tabellen)

  union all
  -- Tabellenrechte für angemeldete Nutzer
  select 6, 'Rechte authenticated', t.name::text,
         case when c.oid is null then 'FEHLT'
              else coalesce(
                (select string_agg(r, ', ' order by r)
                   from unnest(array['SELECT','INSERT','UPDATE','DELETE',
                                     'TRUNCATE','REFERENCES','TRIGGER']) as r
                  where has_table_privilege('authenticated', c.oid, r)),
                'keine') end
    from tabellen t
    left join pg_class c
      on c.relname = t.name and c.relnamespace = 'public'::regnamespace

  union all
  -- Funktionen: Hilfsfunktion für die Regeln und "Teilen beenden"
  select 7, 'Funktion', pr.proname::text,
         case when pr.prosecdef then 'security definer' else 'security invoker' end
         || case pr.provolatile when 's' then ', stable'
                                when 'v' then ', volatile'
                                else ', immutable' end
         || case when has_function_privilege('anon', pr.oid, 'EXECUTE')
                 then ', anon: AUSFÜHRBAR!' else ', anon: nein' end
         || case when pr.proname = 'lw_ordner_einrichten' then
                   -- nur intern (aus Triggern), nicht aus der App aufrufbar
                   case when has_function_privilege('authenticated', pr.oid, 'EXECUTE')
                        then ', authenticated: AUSFÜHRBAR!' else ', authenticated: nein' end
                 when has_function_privilege('authenticated', pr.oid, 'EXECUTE')
                 then ', authenticated: ja' else ', authenticated: NEIN' end
    from pg_proc pr
   where pr.pronamespace = 'public'::regnamespace
     and pr.proname in ('lw_sichtbar', 'lw_quest_teilen_beenden', 'lw_ordner_einrichten')

  union all
  -- Spalte für die Ordner einer Aufgabe
  select 8, 'Spalte', 'lw_tasks.ordner_id'::text,
         case when exists (select 1 from information_schema.columns
                            where table_schema = 'public'
                              and table_name = 'lw_tasks'
                              and column_name = 'ordner_id')
              then 'vorhanden' else 'FEHLT' end
)
select pruefung, objekt, ergebnis
  from ergebnis
 order by reihe, objekt;
