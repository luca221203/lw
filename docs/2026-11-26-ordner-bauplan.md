# TM Ordner – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Folders inside quests (Firma quest: Intern / Extern → Kunde → Projekt; other quests: Projekt), with time per folder, customer derived from the folder, and time that follows a task when it is re-filed.

**Architecture:** One new table `lw_ordner` (tree with fixed levels, enforced by triggers) plus `lw_tasks.ordner_id`, delivered as a new idempotent script `supabase/03_lw_ordner.sql`. The DB derives `lw_tasks.kunde_id` from the folder and rewrites unbilled time entries when a task's customer changes, so existing timer code (`kunde_id`/`abrechenbar` copied from the task at start) keeps working. Client: pure tree/sum functions in `js/logic.js`, `DB.ordner/saveOrdner/deleteOrdner` in both backends (demo mirrors every DB rule), a collapsible folder tree in the sidebar, a new `ordner` view, folder picker in the task dialog, folder path in task rows, Fokus and Rückblick.

**Tech Stack:** unchanged – vanilla HTML/CSS/JS (classic scripts on `window.LW`, no build, no npm), `vendor/supabase.js`, Supabase Postgres + RLS, browser tests in `tests/index.html`. Local server: `python3 -m http.server 8765 --bind 127.0.0.1 --directory /Users/lucawunderlich/Desktop/Claude/LW` (controller runs it; preview `lw` attaches to `http://localhost:8765`).

**Spec:** `/Users/lucawunderlich/Desktop/Claude/LW/docs/2026-11-26-ordner-konzept.md` – read before every task. Base spec: `docs/2026-11-24-lw-konzept.md`. Earlier plan for conventions: `docs/2026-11-24-lw-bauplan.md`.

## Global Constraints

- All UI text German. Product name shown in UI is „TM“ (logo monogram TM). Repository/URL stays `lw`; JS namespace stays `window.LW`; DB prefix stays `lw_`; localStorage keys keep prefix `lw-`.
- Root: `/Users/lucawunderlich/Desktop/Claude/LW`, git branch `main`, commit after each task. **Never push** – the controller pushes after Luca has run the SQL.
- No build step, no npm, no CDN. Reference project `/Users/lucawunderlich/Desktop/Claude/Mediawo_OS` is read-only.
- Do not alter `01_lw_schema.sql` or any Mediawo table. All DB changes go into `supabase/03_lw_ordner.sql`, idempotent (re-runnable without error or duplicate rows), same comment style as 01. `kunden`/`rechnungen` only referenced/read. No `anon` access. Not in the Mediawo „nur_team“ loop.
- Folder kinds (`art`): `intern`, `extern`, `kunde`, `projekt`. Allowed parents: `intern`/`extern` → none (root, only in `firma` quests, exactly one each, names fixed „Intern“/„Extern“); `kunde` → `extern`; `projekt` → `intern` or `kunde` (firma quest) or none (non-firma quest). Tasks may sit in any folder or none.
- Customer of a task = `kunde_id` of its `kunde` folder or of the `kunde` parent of its `projekt`; otherwise null. Billable default unchanged: `abrechenbar = quest.firma && kunde_id != null`, switchable per entry.
- Time follows the task: all totals per folder are computed from `zeit.task_id → task.ordner_id`. When a task's customer changes (re-filing), every non-locked entry of that task (any user) gets the new `kunde_id`, and `abrechenbar` is reset to the default; if the customer is unchanged, `abrechenbar` stays as it is. Locked entries (`rechnung_id` set, invoice not `storniert`) are never touched.
- Archive cascades to all descendant folders (both directions). Tasks in archived folders are hidden from Heute, Woche, Backlog; their time stays in Rückblick. No filing into archived folders. Delete only for folders without tasks and without sub-folders.
- „Firma“ on → create Intern/Extern, move root `projekt` folders under Intern. „Firma“ off → refused with „Diese Quest hat Kunden-Ordner. Archiviere oder verschiebe sie zuerst.“ while any `kunde` folder exists (archived ones count); otherwise move Intern's projects to root, delete Intern and Extern, tasks lying directly in Intern/Extern go to no folder.
- Customer deleted in Mediawo OS → `kunde` folder keeps its stored `name` and shows „(gelöscht)“ (its `kunde_id` becomes null). Display name: live name from loaded `kunden` if present, else stored `name`.
- In Firma totals, time without folder or without task counts as Intern; Intern + Extern = Firma total.
- Sidebar: every quest and folder collapsible; state per device in localStorage `lw-offen` (JSON array of open ids, wrapped in try/catch). With nothing stored: only the path to the running timer's task is open. Today's own time behind each quest/folder (incl. descendants) only when > 0.
- Sort: Intern before Extern; `kunde` folders alphabetically by display name (de, case-insensitive); `projekt` by `sortierung`, then `created_at`.
- If `lw_ordner` does not exist yet (SQL not run), the app must still work: `DB.ordner()` returns `[]` and logs a warning; folder UI shows a hint „Ordner sind noch nicht eingerichtet (03_lw_ordner.sql).“ instead of create actions.
- UI tasks: before reporting done, run the `vectorlab-ux-skills:ux-audit` skill on the screens you touched and fix what it flags. Must work at 375 px.
- Tests: `tests/index.html` must end with `0 fehlgeschlagen` (currently 35 tests). Bump `?v=` in `index.html` in the last task.

## Review Focus

1. **Re-filing a task with Kai's time on a shared quest** – Kai's unbilled entries move to the new customer too (DB function is `security definer`); billed ones stay. (Task 1 SQL, Task 3 demo test `ordner: Umsortieren nimmt Zeit mit`.)
2. **15+ customers in the sidebar** – collapsed by default except the running path; no horizontal overflow at 375 px; long customer names ellipsize. (Task 4.)
3. **Toggling „Firma“ on a quest that already has projects/tasks, and off again** – restructure as specified, refusal message when customer folders exist, no task lost. (Task 1, Task 3 demo test `ordner: Firma an und aus`.)
4. **SQL not yet run when the new client loads** – app works, no crash, hint shown. (Task 3 supabase `ordner()` fallback, Task 4.)
5. **Running timer while its task is moved to another customer** – the running entry also gets the new customer/default billable; the Fokus label updates after the move. (Task 1, Task 3 test, Task 6.)

---

### Task 1: Datenbank-Skript 03 und Prüfungen

**Files:**
- Create: `supabase/03_lw_ordner.sql`
- Modify: `supabase/02_lw_pruefen.sql` (add rows for `lw_ordner`; keep existing output format `pruefung | objekt | ergebnis`)

**Interfaces:**
- Produces table `public.lw_ordner (id uuid pk default gen_random_uuid(), quest_id uuid not null references lw_quests(id) on delete cascade, eltern_id uuid references lw_ordner(id), art text not null check (art in ('intern','extern','kunde','projekt')), name text not null, kunde_id uuid references kunden(id) on delete set null, sortierung int not null default 0, archiviert boolean not null default false, created_at timestamptz not null default now())`. `eltern_id` and `lw_tasks.ordner_id` use the default NO ACTION (not RESTRICT) so that deleting a quest cascades cleanly in one statement.
- Produces column `public.lw_tasks.ordner_id uuid references lw_ordner(id)` (`alter table … add column if not exists`), index on it, and indexes `lw_ordner(quest_id)`, `lw_ordner(eltern_id)`; unique partial indexes: one `intern` and one `extern` per quest; one `kunde` per `(quest_id, kunde_id)` where `kunde_id is not null`.
- Produces triggers (security definer where they read/write rows the caller may not see):
  - `lw_ordner_struktur` before insert/update on `lw_ordner`: enforce parent rules from Global Constraints (parent in same quest, firma-dependence, `kunde_id` required on insert of `kunde`, `kunde` name copied from `kunden` on insert, fixed names for intern/extern, `art`/`quest_id` immutable; intern/extern cannot be renamed, archived or moved by clients). Parent must not be archived when inserting or moving.
  - `lw_ordner_archiv` after update of `archiviert`: propagate to all descendants.
  - `lw_ordner_loeschen` before delete: intern/extern only deletable from the firma-off path (use a transaction-local setting, e.g. `set_config('lw.firma_umbau','1',true)`, checked here and in `lw_ordner_struktur`).
  - `lw_tasks_ordner` before insert/update of `ordner_id, quest_id` on `lw_tasks`: folder must be in the task's quest and not archived (only when `ordner_id` changes); sets `new.kunde_id` to the derived customer (always, so clients cannot set it freely).
  - `lw_tasks_kunde_zeiten` after update on `lw_tasks` when `kunde_id` changed: update `lw_zeiten` of this task where not locked: `kunde_id = new.kunde_id`, `abrechenbar = (quest.firma and new.kunde_id is not null)`. Locked = `rechnung_id is not null` and invoice status is not `storniert`. Must not trip `lw_zeiten_sperre` or `lw_zeiten_zuordnung`.
  - `lw_quests_firma` on `lw_quests`: after insert with `firma` → create Intern/Extern; after update of `firma` → restructure or raise the refusal message exactly as in Global Constraints.
- RLS on `lw_ordner`: four policies `lw_ordner_lesen/anlegen/aendern/loeschen`, all `to authenticated`, `using`/`with check` `public.lw_sichtbar(quest_id)`. Revoke all from public/anon/authenticated, then grant select/insert/update/delete to authenticated.
- Migration (idempotent, at the end of the script): for every `firma` quest ensure Intern/Extern; for every task in a firma quest with `kunde_id` not null and `ordner_id` null: ensure `kunde` folder under Extern for that customer, ensure `projekt` „Allgemein“ under it, set `ordner_id`. Must not change any `lw_zeiten` row (customer is unchanged).

- [ ] **Step 1:** Write `03_lw_ordner.sql` with a header comment (what it does, run after 01, re-runnable, then run 02). German error messages, among them: „Dieser Ordner gehört zu einer anderen Quest.“, „Hier kann dieser Ordner nicht liegen.“, „Intern und Extern können nicht geändert werden.“, „In einen archivierten Ordner kann nichts einsortiert werden.“, „Der Ordner ist nicht leer. Archiviere ihn stattdessen.“ (the last one via FK violation 23503 is acceptable – then map it in Task 3).
- [ ] **Step 2:** Extend `02_lw_pruefen.sql`: RLS `lw_ordner` an; anon `lw_ordner` kein Zugriff; Regel count `lw_ordner 4`; triggers `lw_ordner_struktur`, `lw_ordner_archiv`, `lw_ordner_loeschen`, `lw_tasks_ordner`, `lw_tasks_kunde_zeiten`, `lw_quests_firma` aktiv; Rechte authenticated `lw_ordner` "DELETE, INSERT, SELECT, UPDATE"; Spalte `lw_tasks.ordner_id` vorhanden. Update its header comment's „Erwartet“ list.
- [ ] **Step 3:** Self-check without a database: walk through, in writing in the report, the SQL path for each Review Focus item 1, 3, 5 and for a second run of the script (idempotence). No Postgres is available locally; the controller has Luca run it.
- [ ] **Step 4:** Commit `feat(db): Ordner-Tabelle, Struktur-Regeln, Zeit folgt Aufgabe (03_lw_ordner.sql)`.

### Task 2: Ordner-Logik

**Files:** Modify `js/logic.js`, `tests/logic.test.js`

**Interfaces:**
- Consumes: record shapes; ordner `{id, quest_id, eltern_id, art, name, kunde_id, sortierung, archiviert, created_at}`; task gets `ordner_id`.
- Produces `LW.logic`:
  - `ordnerName(o, kunden) -> string` – live customer name for `kunde` folders (kunden items have `.name`), else `o.name`; `kunde` with `kunde_id == null` → `o.name + ' (gelöscht)'`.
  - `ordnerBaum(questId, ordner, kunden, {archivierte?: bool}) -> Knoten[]`, `Knoten = {ordner, kinder: Knoten[]}`; sort per Global Constraints; archived folders excluded unless `archivierte: true`.
  - `ordnerPfad(ordnerId, ordner) -> Ordner[]` root → leaf; unknown id → `[]`.
  - `ordnerKunde(ordnerId, ordner) -> kunde_id|null` (derivation rule).
  - `nachkommen(ordnerId, ordner) -> string[]` (incl. self).
  - `ordnerErlaubt(quest, eltern|null, art) -> bool` (parent rules).
  - `summeProOrdner(zeiten, tasks, ordner, vonIso, bisIso, jetzt) -> {[ordnerId]: sek}` – cumulative incl. descendants, via `task.ordner_id`.
  - `bereich(task|null, ordner) -> 'intern'|'extern'` – extern iff the task's folder path contains an `extern` folder.
  - `aufgabeSichtbar(task, ordner) -> bool` – false if the task's folder is archived.
  - `offenStandard(laufend, tasks, ordner) -> string[]` – quest id + folder ids on the path of the running task.
  - `rueckblick(...)` gains `ordner` param at the end: `rueckblick(zeiten, quests, tasks, kunden, vonIso, bisIso, jetzt, ordner = [])`; each `quests[i]` gets `ordner: [{ordner, sek, kinder: [...]}]` (only nodes with sek > 0, sorted by sek desc) and `ohneOrdnerSek`; `firma` gets `internSek`, `externSek`. Existing fields unchanged (existing tests keep passing).
  - `heuteAnsicht` and `backlog` gain optional last param `ordner = []` and drop tasks where `aufgabeSichtbar` is false; `backlog` filter gains `ordnerId?` (matches the folder and its descendants).

- [ ] **Step 1:** Add tests (fixture: firma quest Q with Intern I, Extern E, Kunde K (Susanne) under E, Projekt W „Website“ under K, Projekt M „Marketing“ under I; non-firma quest Master with Projekt T):
  - `ordnerBaum(Q)` → names `['Intern','Extern']`, `Extern.kinder[0]` is K, `K.kinder[0]` is W; two customers „Zeta“, „atelier“ sort as `['atelier','Zeta']`.
  - `ordnerPfad(W.id).map(name)` → `['Extern','Susanne Kreutz','Website']`.
  - `ordnerKunde(W.id) === K.kunde_id`; `ordnerKunde(M.id) === null`; `ordnerKunde(K.id) === K.kunde_id`.
  - `ordnerErlaubt(Q, E, 'kunde') === true`, `ordnerErlaubt(Q, null, 'projekt') === false`, `ordnerErlaubt(Master, null, 'projekt') === true`, `ordnerErlaubt(Q, I, 'kunde') === false`.
  - `summeProOrdner`: 1 h on a task in W and 30 min on a task in M → `{W:3600, K:3600, E:3600, M:1800, I:1800}`.
  - Time follows task: same entries, then the W task's `ordner_id` changed to M → `M` and `I` are 5400, `E` absent or 0.
  - `rueckblick(..., ordner).firma` → `internSek + externSek === gesamtSek`, entry without task counts to `internSek`.
  - `ordnerName` for `kunde` with `kunde_id:null`, name „Alt GmbH“ → `'Alt GmbH (gelöscht)'`.
  - `heuteAnsicht` drops a due task in an archived folder; `backlog({ordnerId: E.id})` returns tasks of W and K only.
  - `offenStandard` for a running entry on the W task → contains Q.id, E.id, K.id, W.id.
- [ ] **Step 2:** Run tests (controller's server, open `http://localhost:8765/tests/`), confirm the new ones fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `#ergebnis` shows 0 fehlgeschlagen.
- [ ] **Step 5:** Commit `feat(logik): Ordnerbaum, Pfad, Kunde, Summen je Ordner`.

### Task 3: Datenzugriff für Ordner (Supabase + Demo)

**Files:** Modify `js/db.js`, `tests/db.test.js`

**Interfaces:**
- Consumes: Task 1 table/trigger behaviour, Task 2 `ordnerKunde`, `ordnerErlaubt`.
- Produces on `LW.db` (both backends): `ordner() -> Ordner[]` (all visible, incl. archived, paged like other lists); `saveOrdner(o) -> Ordner` (insert if no id; fields `quest_id, eltern_id, art, name, kunde_id, sortierung, archiviert`); `deleteOrdner(id)`. `TASK_FELDER` gains `ordner_id` and no longer sends `kunde_id` (derived). `ordnerVerfuegbar: boolean` property (false when the table is missing → `ordner()` returns `[]`).
- Error mapping: folder FK violation on delete → „Der Ordner ist nicht leer. Archiviere ihn stattdessen.“; trigger messages pass through.
- Demo backend mirrors every rule of Task 1: structure, kunde name copy, kunde derivation on task save, time rewrite on customer change (all users' entries, skip locked), archive cascade, delete only when empty, Firma on/off restructure and refusal, intern/extern immutability. Demo seed: Mediawo gets Intern (Projekt „Marketing“), Extern → „Susanne Kreutz“ (Projekte „Website“, „Reels“) and „DeFORIS Unternehmensberatung (Sebastian Tsoleridis)“ (Projekt „Angebot“); existing seed tasks with a customer are filed accordingly, one Mediawo task stays without folder; Master gets Projekt „Thesis“. Existing demo tests keep passing.

- [ ] **Step 1:** Add demo tests:
  - `ordner: Beispielstruktur` – Mediawo has exactly one Intern and one Extern; Susanne folder under Extern has 2 projects.
  - `ordner: Kunde folgt Ordner` – saving a task with `ordner_id` = Website gives `kunde_id` = Susanne; moving it to Marketing gives `null`.
  - `ordner: Umsortieren nimmt Zeit mit` – a task with one Luca entry, one Kai entry and one billed entry moved from Marketing to Website → Luca's and Kai's entries have Susanne and `abrechenbar === true`; billed entry unchanged; moving within Susanne (Website → Reels) keeps a manually set `abrechenbar: false`.
  - `ordner: laufender Timer zieht mit` – running entry's `kunde_id` follows the move.
  - `ordner: Struktur wird geprüft` – `saveOrdner({art:'kunde', eltern_id: Intern})` rejects with „Hier kann dieser Ordner nicht liegen.“; second Intern rejected; renaming Extern rejected with „Intern und Extern können nicht geändert werden.“
  - `ordner: Löschen nur leer` – deleting Website (has tasks) rejects with „Der Ordner ist nicht leer. Archiviere ihn stattdessen.“; deleting an empty new project works.
  - `ordner: Archiv vererbt sich` – archiving Susanne archives Website and Reels; filing a task into Website then rejects with „In einen archivierten Ordner kann nichts einsortiert werden.“
  - `ordner: Firma an und aus` – Master with Projekt Thesis: firma on → Intern/Extern exist, Thesis under Intern; firma off → Thesis at root, Intern/Extern gone; Mediawo firma off → rejects with „Diese Quest hat Kunden-Ordner. Archiviere oder verschiebe sie zuerst.“
- [ ] **Step 2:** Confirm they fail.
- [ ] **Step 3:** Implement Supabase methods (missing table: Supabase error code `42P01` or `PGRST205` → `ordnerVerfuegbar = false`, `[]`, `console.warn`) and demo methods.
- [ ] **Step 4:** All tests pass.
- [ ] **Step 5:** Commit `feat(db): Ordner lesen, speichern, löschen – Demo spiegelt alle Regeln`.

### Task 4: Seitenleiste mit Ordnerbaum und Ordner-Dialog

**Files:** Modify `js/app.js` (state `S.ordner`, load in `stammdaten`, write counter for `saveOrdner/deleteOrdner`, replace `questListe`), `index.html` (script tags, sidebar markup if needed), `css/app.css`; Create `js/ordner.js` (sidebar tree rendering, collapse state, item menu, folder dialog).

**Interfaces:**
- Consumes: `DB.ordner/saveOrdner/deleteOrdner/ordnerVerfuegbar`, `L.ordnerBaum`, `L.ordnerName`, `L.summeProOrdner`, `L.offenStandard`, `LW.dialoge.quest(q)` (existing quest dialog).
- Produces `LW.ordner = { seitenleiste(), dialog({quest, eltern|null, art, ordner?}) }`; route `#ordner/<id>` and `#quest/<id>` (quest = its root view, rendered by Task 5's view; until then link targets may 404 to the existing fallback). `app.S.ordner: Ordner[]`.
- Sidebar row per quest and folder: disclosure button (aria-expanded), name (link to its view), today's time, „…“ menu button. Menu items by kind: Quest → „Bearbeiten“ (opens existing quest dialog), „Ordner anlegen“ (non-firma) ; Intern → „Projekt anlegen“; Extern → „Kunde hinzufügen“; Kunde → „Projekt anlegen“, „Archivieren“/„Wiederherstellen“, „Löschen“ (only if empty); Projekt → „Umbenennen“, „Archivieren“/„Wiederherstellen“, „Löschen“ (only if empty). Archived folders: one collapsed „Archiviert“ group per quest.
- „Kunde hinzufügen“: select of active Mediawo customers not yet having a folder in this quest; if an archived folder exists for the chosen customer, it is restored instead of created.

- [ ] **Step 1:** Implement; keyboard: rows reachable by Tab, Enter opens, Space/←/→ collapse/expand; menu closes on Escape and view change (reuse `aufgaben.js` menu pattern / `menueZu`).
- [ ] **Step 2:** Verify in demo (`?demo`) at desktop and 375 px: create Kunde, Projekt, rename, archive/restore, delete empty; collapse state survives reload; with nothing stored only the running path is open; long name ellipsizes. Screenshot both widths.
- [ ] **Step 3:** Verify fallback: in the browser console set `LW.db.ordnerVerfuegbar = false` and re-render → hint text shown, no errors.
- [ ] **Step 4:** ux-audit on the sidebar and folder dialog; fix findings. Tests still 0 fehlgeschlagen.
- [ ] **Step 5:** Commit `feat: Ordnerbaum in der Seitenleiste`.

### Task 5: Ordner-Ansicht, Ordner-Auswahl und Pfad an Aufgaben

**Files:** Create `js/views/ordner.js`; Modify `js/dialoge.js` (task dialog: folder select replaces „Kunde“), `js/aufgaben.js` (row shows last two path parts instead of the customer tag), `js/views/heute.js`, `js/views/woche.js`, `js/views/backlog.js` (pass `S.ordner`; backlog folder filter), `index.html`.

**Interfaces:**
- Consumes: Task 2 functions, Task 4 `S.ordner`, `#ordner/<id>`, `#quest/<id>`.
- Produces: `LW.views.ordner` handling both `ordner/<id>` and `quest/<id>` (register `LW.views.quest` as the same view with a flag): header with path breadcrumbs, time today / this week / total (folder incl. descendants), open tasks grouped by sub-folder, done tasks collapsed, „+ Aufgabe“ creating directly in this folder (or quest root). Sidebar quest links point to `#quest/<id>` instead of `#backlog/<id>`.
- Task dialog: select „Ordner“ with option „Ohne Ordner“ plus all non-archived folders of the selected quest, labelled by path (`Extern › Susanne Kreutz › Website`); changing the quest resets it; when opened from a folder view, preselected. The old „Kunde“ select is removed; under the select a one-line hint shows the derived customer and „abrechenbar“/„intern“.
- After saving a task whose customer changed, the app reloads today's entries and the running entry (time moved in the DB).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Verify in demo: create a task in Website from the folder view; move a task with time from no folder to Website → sidebar and folder view sums move; Heute rows show „Susanne Kreutz › Website“; backlog filter by Extern. 375 px screenshot.
- [ ] **Step 3:** ux-audit on touched screens; tests 0 fehlgeschlagen.
- [ ] **Step 4:** Commit `feat: Ordner-Ansicht, Ordner-Auswahl, Pfad an Aufgaben`.

### Task 6: Fokus, Rückblick, Befehlsleiste

**Files:** Modify `js/views/fokus.js`, `js/views/rueckblick.js`, `js/befehle.js`, `js/zeiten.js` (if the switch logic is shared), `css/app.css`.

**Interfaces:**
- Consumes: Task 2 `ordnerPfad`, `rueckblick(..., ordner)`, `bereich`; existing `DB.saveZeit`.
- Fokus: under the quest line show the folder path (clickable to the folder view). For the running entry of a firma quest show a button-like label „Abrechenbar · <Kunde>“ or „Intern“; click toggles `abrechenbar` of the running entry via `DB.saveZeit` (disabled with tooltip when locked or when no customer: „Ohne Kunde – intern“). Non-firma quests show nothing.
- Rückblick: per quest, expandable tree folder → sub-folder → task with times (from `quests[i].ordner`, plus „Ohne Ordner“ row); Firma section gains a row „Intern / Extern“ with both times and percentages.
- ⌘K: folders are searchable entries (label = path, opens folder view; Alt+Enter on a folder opens its menu action „Umbenennen“ when allowed, else nothing).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Verify in demo: start Fokus on a Website task → shows „Extern › Susanne Kreutz › Website“ and „Abrechenbar · Susanne Kreutz“; toggle to Intern and back; Rückblick week shows the tree and Intern/Extern adding up to Firma total; ⌘K „web“ finds Website. Screenshots.
- [ ] **Step 3:** ux-audit; tests 0 fehlgeschlagen.
- [ ] **Step 4:** Commit `feat: Ordner in Fokus, Rückblick und Befehlsleiste`.

### Task 7: Anleitung und Abschluss

**Files:** Modify `ANLEITUNG.txt` (new section „Update: Ordner (03_lw_ordner.sql)“ – run 03, then 02, what to check; app name TM), `index.html` (`?v=` → 4 on all local assets).

- [ ] **Step 1:** Update texts and cache version.
- [ ] **Step 2:** Full demo walkthrough of the spec's „Ziele“ and „Fehlschlag“ lines (task create still ≤ 2 clicks to Fokus; sidebar with 15 customers – add them in the demo – does not overflow). Tests 0 fehlgeschlagen.
- [ ] **Step 3:** Commit `docs: Anleitung für Ordner-Update`.
