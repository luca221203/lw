-- =====================================================================
-- LW – Kontrolle nach dem Einrichten (nur lesen, ändert nichts)
-- Im Supabase-Dashboard unter "SQL Editor" einfügen und auf "Run"
-- klicken. Ergebnis ist eine einzige Tabelle:
--   pruefung | objekt | ergebnis
-- Erwartet:
--   - RLS:      4 Zeilen (lw_profile, lw_quests, lw_tasks, lw_zeiten) mit "an"
--   - anon:     4 Zeilen mit "kein Zugriff"
--   - Regel:    lw_profile 3, lw_quests 4, lw_tasks 4, lw_zeiten 4
--   - Index:    lw_zeiten_ein_laufender (unique, where ende is null)
--   - Trigger:  lw_quests_besitzer_fest, lw_tasks_ersteller_fest,
--               lw_tasks_quest_fest, lw_zeiten_sperre,
--               lw_zeiten_zuordnung – alle "aktiv"
--   - Funktion: lw_sichtbar mit "security definer"
-- Steht irgendwo "AUS", "FEHLT", "ZUGRIFF!" oder "inaktiv", stimmt etwas nicht.
-- =====================================================================

with tabellen(name) as (
  values ('lw_profile'), ('lw_quests'), ('lw_tasks'), ('lw_zeiten')
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
  -- Index: höchstens ein laufender Eintrag pro Person
  select 4, 'Index', i.indexname::text, i.indexdef::text
    from pg_indexes i
   where i.schemaname = 'public'
     and i.indexname = 'lw_zeiten_ein_laufender'

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
  -- Hilfsfunktion für die Regeln
  select 6, 'Funktion', pr.proname::text,
         case when pr.prosecdef then 'security definer' else 'security invoker' end
         || case when pr.provolatile = 's' then ', stable' else ', NICHT stable' end
    from pg_proc pr
   where pr.pronamespace = 'public'::regnamespace
     and pr.proname = 'lw_sichtbar'
)
select pruefung, objekt, ergebnis
  from ergebnis
 order by reihe, objekt;
