# LW Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build LW, a personal quest/focus/time-tracking web app for Luca (and Kai) on the existing Mediawo Supabase project.

**Architecture:** Static web app, no build step: `index.html` + classic `<script>` files that attach to one global namespace `window.LW` (same pattern as Mediawo OS, which uses `window.MW_CONFIG` and IIFEs). Pure logic lives in `js/logic.js` and is tested in the browser via `tests/index.html`. `js/db.js` exposes one interface with two backends: Supabase (real) and an in-memory demo (`?demo`). Views render into `<main>` from `js/views/*.js`.

**Tech Stack:** HTML/CSS/vanilla JS (ES2020, no modules, no npm), `vendor/supabase.js` (copied from Mediawo OS), Supabase Postgres + Auth + RLS, GitHub Pages. Local preview: `python3 -m http.server`. No Node on this machine.

**Spec:** `/Users/lucawunderlich/Desktop/Claude/LW/docs/2026-11-24-lw-konzept.md` — read it before every task.

**Reference project (read-only, never modify):** `/Users/lucawunderlich/Desktop/Claude/Mediawo_OS` — copy patterns from `index.html`, `js/db.js` (Supabase + demo with identical interface, login, password reset, `linkTyp`), `js/app.js` helpers (`toast`, `openDlg`, `confirmDlg`, `guard`, `fehlerText`), `css/app.css` (tokens, light/dark via `data-theme`), `supabase/01_schema.sql` (idempotent SQL style, RLS loop).

## Global Constraints

- All UI text German. App name and logo: „LW“ (monogram). Never use the name „Quest“ as the product name or copy quest.app's look. The word „Quest“ for a goal is fine.
- Root folder: `/Users/lucawunderlich/Desktop/Claude/LW`. Git repo there; commit after each task.
- No build step, no npm, no CDN at runtime. Everything served from the folder (vendor files copied in).
- Supabase URL and publishable key: copy from `Mediawo_OS/js/config.js` into `LW/js/config.js` as `window.LW_CONFIG = { supabaseUrl, supabaseKey }`. Never a secret/service_role key.
- New tables only, prefix `lw_`. Do not alter existing Mediawo tables; `kunden` and `rechnungen` are only referenced/read. SQL must be idempotent (re-runnable) like `01_schema.sql`. Never add `lw_` tables to the Mediawo „nur_team“ loop.
- No access for `anon` on any `lw_` table.
- Dates: a task's `tag` is a local calendar date (`YYYY-MM-DD`, Europe/Berlin = browser local). Time entries count toward the local day of their `start`.
- Pausing the focus timer ends the current entry; resuming starts a new one. At most one running entry (`ende is null`) per user, enforced in the DB.
- Billable default when a timer starts: `abrechenbar = quest.firma && task.kunde_id != null`; `kunde_id` is copied from the task.
- Keyboard: `N` new task, `F` focus on selected/first task, `Cmd/Ctrl+K` command palette, `Cmd/Ctrl+Enter` mark done. Shortcuts never fire while typing in an input/textarea.
- Light/dark follows `prefers-color-scheme`, with a manual toggle stored in `localStorage` key `lw-theme` (wrapped in try/catch).
- Works from 375 px (phone) to desktop; installable via `manifest.webmanifest`.
- UI tasks: before reporting done, run the `vectorlab-ux-skills:ux-audit` skill on the screens you touched and fix what it flags.

## Review Focus

1. **Timer left running overnight / across midnight** — entry counts to its start day; a running entry older than 12 h shows a warning in Fokus and Heute with „Endzeit korrigieren“. (Task 2 test `laufendZuLange`, Task 7.)
2. **Timer started on two devices** — DB unique partial index rejects a second running entry; `starteTimer` stops the user's running entry first, and on a unique-violation reloads and shows the running one instead of failing. (Task 3 SQL check, Task 4 demo test `starteTimer stoppt laufenden`.)
3. **Editing or deleting a billed entry** (`rechnung_id` set, invoice not `storniert`) — DB raises; UI shows „Diese Zeit ist abgerechnet und gesperrt.“ and hides edit/delete for such entries. (Task 3, Task 4 demo test, Task 7.)
4. **Deleting a task or quest that has time on it** — DB restricts; UI offers „Archivieren“ instead. (Task 3 FK `on delete restrict`, Task 4 demo test, Task 6.)
5. **Connection lost while focusing** — displayed elapsed time is computed from the stored `start`, never from a local counter; failed stop shows an error toast and keeps the stop button usable for retry. (Task 7.)

---

### Task 1: Grundgerüst und Testlauf

**Files:**
- Create: `index.html` (minimal placeholder for now), `js/config.js`, `vendor/supabase.js` (copy), `js/logic.js`, `tests/index.html`, `tests/runner.js`, `tests/logic.test.js`, `.gitignore` (`.DS_Store`)
- Create: `/Users/lucawunderlich/Plugins/.claude/launch.json` with configuration `{"name":"lw","runtimeExecutable":"python3","runtimeArgs":["-m","http.server","8765","--directory","/Users/lucawunderlich/Desktop/Claude/LW"],"port":8765}`

**Interfaces:**
- Produces: `window.LW = window.LW || {}`; test helper `LWTest.test(name, fn)`, `LWTest.eq(actual, expected, msg)` (deep equal via JSON), `LWTest.ok(cond, msg)`, async tests supported; `tests/index.html` renders `#ergebnis` with text `N bestanden, M fehlgeschlagen` and lists failures.
- Produces `LW.logic`:
  - `isoTag(date: Date) -> 'YYYY-MM-DD'` (local)
  - `wochenTage(iso: string) -> string[7]` Monday..Sunday of that week
  - `dauerSek(zeit: {start, ende|null}, jetzt: Date) -> number` (whole seconds, ende or jetzt)
  - `formatDauer(sek) -> string` e.g. `0m`, `45m`, `1h 00m`, `3h 10m`
  - `formatTimer(sek) -> string` `0:00:05`, `1:02:03`

- [ ] **Step 1:** `git init`, copy `vendor/supabase.js`, write `config.js`, `launch.json`, test runner and `tests/logic.test.js` with:
  - `isoTag(new Date(2026,10,24,23,30)) === '2026-11-24'`
  - `wochenTage('2026-11-26')` → `['2026-11-23',…,'2026-11-29']`; `wochenTage('2026-11-29')[0] === '2026-11-23'` (Sunday belongs to the week starting Monday)
  - `dauerSek({start:'2026-11-24T08:00:00Z', ende:'2026-11-24T09:30:15Z'}) === 5415`; running entry uses `jetzt`
  - `formatDauer(0)==='0m'`, `formatDauer(2700)==='45m'`, `formatDauer(3600)==='1h 00m'`, `formatDauer(11400)==='3h 10m'`
  - `formatTimer(5)==='0:00:05'`, `formatTimer(3723)==='1:02:03'`
- [ ] **Step 2:** Start preview `lw`, open `/tests/`, confirm failures (functions undefined).
- [ ] **Step 3:** Implement the five functions in `js/logic.js`.
- [ ] **Step 4:** Reload `/tests/` → `#ergebnis` shows 0 fehlgeschlagen.
- [ ] **Step 5:** Commit `feat: Grundgerüst, Testlauf, Datums- und Dauerfunktionen`.

### Task 2: Auswertungs-Logik (Heute, Backlog, Rückblick)

**Files:** Modify `js/logic.js`; Modify `tests/logic.test.js`

**Interfaces:**
- Consumes: Task 1 functions. Record shapes from Task 3 (quest `{id, owner_id, name, farbe, geteilt, firma, sortierung, archiviert}`, task `{id, quest_id, titel, notiz, tag, zugewiesen_an, kunde_id, erledigt_am, sortierung, archiviert, created_by}`, zeit `{id, user_id, quest_id, task_id, kunde_id, start, ende, abrechenbar, notiz, rechnung_id}`).
- Produces `LW.logic`:
  - `heuteAnsicht(quests, tasks, meId, heute: iso) -> [{quest, tasks: Task[]}]` — non-archived quests by `sortierung`; per quest tasks that are not archived and either (open with `tag <= heute`) or (`erledigt_am` on `heute`); in `geteilt` quests only tasks with `zugewiesen_an` ∈ {meId, null}; open tasks first (overdue before today, then `sortierung`), done last. Quests with no tasks are still listed (empty array).
  - `istUeberfaellig(task, heute) -> bool` (open and `tag < heute`)
  - `backlog(tasks, quests, filter: {questId?: string, person?: 'alle'|'ich'|'niemand', ohneTag?: bool}, meId) -> Task[]` — open, non-archived tasks of non-archived quests; `person:'ich'` = assigned to me or unassigned-in-private-quest; `'niemand'` = `zugewiesen_an == null` in shared quests; sorted by `tag` (null last) then `sortierung`.
  - `summeProQuest(zeiten, vonIso, bisIso, jetzt) -> {[questId]: sek}` — entries whose local start day is within [von, bis].
  - `rueckblick(zeiten, quests, tasks, kunden, vonIso, bisIso, jetzt) -> {gesamtSek, quests: [{quest, sek, tasks: [{task|null, sek}]}], firma: {gesamtSek, abrechenbarSek, kunden: [{kunde|null, sek, abrechenbarSek}], personen: [{user_id, sek, abrechenbarSek}]}}` — lists sorted by `sek` desc; `firma` only counts entries of quests with `firma=true`; entries without task go under `task: null` („Ohne Aufgabe“).
  - `laufendZuLange(zeit, jetzt) -> bool` — `ende == null` and running > 12 h.

- [ ] **Step 1:** Write tests with a fixture: quests Mediawo (`geteilt:true, firma:true`), Sport, Master (private, owner me); tasks incl. overdue, today, tomorrow, done today, done yesterday, Kai's task in Mediawo, unassigned task in Mediawo, archived task. Assert:
  - `heuteAnsicht` for 2026-11-24 contains overdue + today + done-today, excludes tomorrow, done-yesterday, archived, Kai's task; includes unassigned Mediawo task; Sport with no tasks appears with `[]`.
  - `backlog(...,{person:'niemand'})` returns only the unassigned Mediawo task; `{ohneTag:true}` only tasks with `tag == null`.
  - `summeProQuest` with an entry 23:00–01:00 local on 24→25 counts 7200 s to 24th, nothing to 25th.
  - `rueckblick` on Mediawo entries (Luca 2 h with Kunde billable, Luca 1 h no Kunde, Kai 30 m billable): `firma.gesamtSek===12600`, `firma.abrechenbarSek===9000`, personen Luca 10800/7200, Kai 1800/1800.
  - `laufendZuLange` true at 12 h 1 s, false at 11 h 59 m, false when `ende` set.
- [ ] **Step 2:** Run `/tests/`, expect new tests failing.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `/tests/` → 0 fehlgeschlagen.
- [ ] **Step 5:** Commit `feat: Logik für Heute, Backlog und Rückblick`.

### Task 3: Datenbank-Skript

**Files:** Create `supabase/01_lw_schema.sql`, `supabase/02_lw_pruefen.sql`

**Interfaces:**
- Produces tables (exact columns as in spec „Datenmodell“ plus): `lw_tasks.archiviert bool not null default false`; `lw_quests.farbe text not null default '#4F7CAC'`; defaults `owner_id/created_by/user_id default auth.uid()`; `lw_profile(id uuid pk references auth.users, name text not null)`.
- FKs (tracked time must never be lost): `lw_zeiten.task_id → lw_tasks on delete restrict`, `lw_zeiten.quest_id → lw_quests on delete restrict`, `lw_tasks.quest_id → lw_quests on delete cascade` (tasks without time may go with their quest; restrict from `lw_zeiten` still blocks if any time exists). `kunde_id → kunden(id) on delete set null`. `rechnung_id → rechnungen(id)`.
- Unique partial index `lw_zeiten_ein_laufender on lw_zeiten(user_id) where ende is null`. Check `ende is null or ende > start`.
- Helper `lw_sichtbar(q uuid) returns bool` (security definer, stable): quest owned by `auth.uid()` or `geteilt`.
- RLS policies (separate per action):
  - `lw_profile`: select all authenticated; insert/update only `id = auth.uid()`.
  - `lw_quests`: select/update where `owner_id = auth.uid() or geteilt`; insert with `owner_id = auth.uid()`; delete where owner or geteilt.
  - `lw_tasks`: all actions where `lw_sichtbar(quest_id)`.
  - `lw_zeiten`: select where `user_id = auth.uid()` or the entry's quest is `geteilt`; insert/update/delete only `user_id = auth.uid()` and `lw_sichtbar(quest_id)`.
  - `revoke all … from anon`; grants select/insert/update/delete to authenticated.
- Lock trigger `lw_zeiten_sperre` (before update or delete): if `old.rechnung_id` is not null and the invoice's `status <> 'storniert'` → `raise exception 'Diese Zeit ist abgerechnet und gesperrt.'`. Clearing `rechnung_id` is allowed only when the invoice is `storniert`. (Billing itself is Step 2, not built now.)
- `02_lw_pruefen.sql`: read-only checks that list the four tables with `relrowsecurity = true`, the policies per table, the index and the trigger, so Luca can run it after setup and see everything in one result.

- [ ] **Step 1:** Write `01_lw_schema.sql` in the style of `Mediawo_OS/supabase/01_schema.sql` (header comment in German explaining „SQL Editor → einfügen → Run“, `create … if not exists`, `drop policy if exists` before each `create policy`, `create or replace` for functions/triggers).
- [ ] **Step 2:** Write `02_lw_pruefen.sql`.
- [ ] **Step 3:** Self-check by reading: every `lw_` table has RLS enabled, no policy uses `using (true)`, anon revoked, script re-runnable. (No Postgres available locally; the reviewer re-checks; Luca runs it later.)
- [ ] **Step 4:** Commit `feat: Datenbank-Skript mit Zugriffsregeln und Abrechnungssperre`.

### Task 4: Datenzugriff (Supabase + Demo)

**Files:** Create `js/db.js`, `tests/db.test.js` (add to `tests/index.html`)

**Interfaces:**
- Consumes: `LW_CONFIG`, `window.supabase`, `LW.logic.isoTag`.
- Produces `LW.db` (all async unless noted; errors thrown as `Error` with German message; Postgres lock/restrict errors mapped to `'Diese Zeit ist abgerechnet und gesperrt.'` and `'Auf dieser Aufgabe ist Zeit gebucht. Archiviere sie stattdessen.'`):
  - `demo: bool` (sync), `linkTyp()`, `session()`, `onAuth(cb)`, `login(email, pw)`, `logout()`, `passwortVergessen(email)`, `passwortSetzen(pw)` — as in Mediawo OS.
  - `ich() -> {id, email, name}` (creates `lw_profile` row from email prefix if missing)
  - `profile() -> [{id, name}]`, `saveProfil({name})`
  - `quests() -> Quest[]`, `saveQuest(q) -> Quest` (insert if no id)
  - `tasks() -> Task[]` (all visible, incl. archived), `saveTask(t) -> Task`, `deleteTask(id)`
  - `kunden() -> [{id, name}]` from `kunden` where status `aktiv`, name like Mediawo's `kundeName`
  - `zeiten(vonIso, bisIso) -> Zeit[]` (start within local range, plus my running entry)
  - `laufend() -> Zeit|null` (mine)
  - `starteTimer(task) -> Zeit` (stops my running entry first; billable default per Global Constraints; on unique violation returns `laufend()`)
  - `stoppeTimer(id, endeIso?) -> Zeit`
  - `saveZeit(z) -> Zeit`, `deleteZeit(id)`
- Demo backend: in-memory, seeded on load: users Luca (me) and Kai; quests Mediawo (geteilt, firma), Sport, Master; kunden incl. „Susanne Kreutz“; ~8 tasks across this week incl. one overdue, one for Kai, one unassigned; time entries for today and the last 6 days. Demo enforces the same rules as the DB (one running entry, billed lock, delete-restrict) so tests cover them. `?demo` in URL selects it; login accepts anything.

- [ ] **Step 1:** Tests against the demo backend: seed visible; `starteTimer stoppt laufenden` (start A, start B → A has `ende`, only B running); billable default true for Mediawo task with Kunde, false for Master task; `deleteTask` on a task with time rejects with the archive message; editing a seeded billed entry (`rechnung_id` set, invoice not storniert) rejects with the lock message.
- [ ] **Step 2:** Run `/tests/`, expect failures.
- [ ] **Step 3:** Implement both backends with the same interface.
- [ ] **Step 4:** `/tests/` → 0 fehlgeschlagen.
- [ ] **Step 5:** Commit `feat: Datenzugriff mit Supabase und Demo-Modus`.

### Task 5: App-Hülle, Login, Navigation

**Files:** Modify `index.html`; Create `css/app.css`, `js/app.js`, `js/ui.js`, `manifest.webmanifest`, `img/icon.svg`, `img/icon.png` (512×512, render the SVG with `qlmanage -t -s 512 -o img img/icon.svg` and rename; if that fails, draw it with Python PIL if available, else ask the controller), `fonts/` (copy Poppins from Mediawo OS or choose system font — your call)

**Interfaces:**
- Consumes: `LW.db`, `LW.logic`.
- Produces `LW.ui`: `$`, `esc(str)`, `toast(msg, err?)`, `openDlg(html)`, `closeDlg()`, `confirmDlg(titel, text, ok, danger) -> Promise<bool>`, `guard(fn, okMsg?)`.
- Produces `LW.app`: `S` state `{ich, profile, quests, tasks, kunden, laufend}`, `laden()`, `go(view, param?)`, view registry `LW.views[name] = {titel, render(main, param)}`; views `heute` (default), `woche`, `backlog`, `rueckblick`, `fokus`; `LW.app.tastatur` registers `N`, `F`, `Cmd/Ctrl+K`, `Cmd/Ctrl+Enter`, `Esc` and calls hooks views provide (`LW.app.neueAufgabe()`, `LW.app.fokus(taskId?)`, `LW.app.befehle()`); no-ops until later tasks define them.
- Layout: desktop sidebar (LW monogram, nav Heute / Woche / Backlog / Rückblick, quest list with colour dot and today's hours, user + theme toggle + Abmelden); phone: bottom tab bar with the four views, sidebar content in a menu. A persistent „läuft gerade“ chip (task title + elapsed) when a timer runs, clicking opens Fokus.

- [ ] **Step 1:** Build shell, login (incl. Passwort vergessen / setzen flow like Mediawo OS), demo badge, routing via `location.hash` (`#heute`, `#woche`, …), theme toggle, manifest/icon.
- [ ] **Step 2:** Verify in preview: `/?demo` → login → Heute placeholder; hash navigation works; reload keeps view; dark/light toggle; 375 px width has no horizontal scroll; console has no errors.
- [ ] **Step 3:** UX audit skill, fix findings.
- [ ] **Step 4:** Commit `feat: App-Hülle mit Login und Navigation`.

### Task 6: Quests, Aufgaben und Heute-Ansicht

**Files:** Create `js/views/heute.js`, `js/dialoge.js` (quest + task dialogs); Modify `index.html`, `css/app.css`

**Interfaces:**
- Consumes: `LW.logic.heuteAnsicht`, `summeProQuest`, `istUeberfaellig`, `LW.db.*`, `LW.ui.*`.
- Produces: `LW.dialoge.quest(quest?)`, `LW.dialoge.aufgabe(task?, vorgaben?: {quest_id, tag})`; sets `LW.app.neueAufgabe = () => LW.dialoge.aufgabe(null, {tag: heute})`.
- Quest dialog: Name, Farbe (6 presets), Schalter „Mit Kai teilen“ (label „Geteilt“), „Firma (Mediawo-Kunden, abrechenbar)“, Archivieren. Task dialog: Titel (required), Quest, Tag (date, optional), Zugewiesen an (only in geteilt quests: Ich / Kai / niemand), Kunde (only in firma quests), Notiz; Löschen → if restricted, offer „Archivieren“.
- Heute: date heading; per quest a block with colour, name, today's hours bar and tasks; each task row: check circle (toggle `erledigt_am`), title, overdue badge „überfällig“, Kunde tag, „▶ Fokus“ button (one click starts timer and opens Fokus). Empty quest shows a quiet „Nichts für heute“ + „Aufgabe hinzufügen“. Sidebar shows the same hours.

- [ ] **Step 1:** Implement dialogs and Heute.
- [ ] **Step 2:** Verify in `?demo`: create quest „Test“ geteilt+firma; create task with Kunde for today → appears; toggle done → moves to bottom; overdue badge shows; `N` opens task dialog, but not while typing; delete task with time → archive offer.
- [ ] **Step 3:** UX audit skill, fix findings.
- [ ] **Step 4:** Commit `feat: Quests, Aufgaben und Heute-Ansicht`.

### Task 7: Fokus-Modus und Zeiten

**Files:** Create `js/views/fokus.js`, `js/zeiten.js` (Zeit-Dialog); Modify `css/app.css`, `js/app.js`

**Interfaces:**
- Consumes: `LW.db.starteTimer/stoppeTimer/laufend/saveZeit/deleteZeit/zeiten`, `LW.logic.formatTimer`, `dauerSek`, `laufendZuLange`.
- Produces: `LW.app.fokus(taskId?)` (no id → selected task in Heute, else first open task of Heute; if a timer runs → show it); `LW.zeiten.dialog(zeit?, vorgaben?)` for edit/manual entry (Aufgabe, Datum, Von, Bis, Abrechenbar, Notiz).
- Fokus screen: full-height, calm; quest name + task title, big `formatTimer` updating every second from stored `start`; buttons Pause (stop entry), Weiter (new entry), Stopp (stop and leave), Erledigt (stop + mark done, `Cmd/Ctrl+Enter`); list of today's entries for this task with total; „Zeit nachtragen“. Warning banner when `laufendZuLange` with „Endzeit korrigieren“. Billed entries show a lock and no edit/delete.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Verify in `?demo`: ▶ from Heute opens Fokus and runs; reload keeps it running with correct elapsed time; Pause/Weiter creates two entries; Erledigt marks task done and returns to Heute with hours updated; manual entry appears in hours; billed demo entry is locked; simulate a running entry 13 h old (demo seed or console) → warning shows.
- [ ] **Step 3:** UX audit skill, fix findings.
- [ ] **Step 4:** Commit `feat: Fokus-Modus und Zeiterfassung`.

### Task 8: Wochenplaner und Backlog

**Files:** Create `js/views/woche.js`, `js/views/backlog.js`; Modify `css/app.css`

**Interfaces:**
- Consumes: `LW.logic.wochenTage`, `backlog`, `summeProQuest`, `LW.dialoge.aufgabe`, `LW.db.saveTask`.
- Woche: 7 day columns (Mon–Sun) with week navigation (‹ Heute ›) and KW number; each day lists its tasks (mine + unassigned in shared quests; toggle „Alle (inkl. Kai)“) and tracked hours; a side column „Ohne Tag“. Desktop: drag a task onto a day sets `tag` (native HTML5 drag and drop). Phone: days stacked; each task has a „Tag“ menu (Heute, Morgen, Wochentage, Kein Tag). „+“ per day opens task dialog with that `tag`.
- Backlog: all open tasks grouped by quest; filter chips: Quest, Person (Alle / Ich / Niemand zugewiesen), „Ohne Tag“; per row quick actions: Tag setzen, Zuweisen, Fokus.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Verify in `?demo`: drag task to Thursday → appears there and in Heute on that day; phone width uses the Tag menu; backlog filters return expected tasks (Niemand → only unassigned Mediawo task).
- [ ] **Step 3:** UX audit skill, fix findings.
- [ ] **Step 4:** Commit `feat: Wochenplaner und Backlog`.

### Task 9: Rückblick

**Files:** Create `js/views/rueckblick.js`; Modify `css/app.css`

**Interfaces:**
- Consumes: `LW.logic.rueckblick`, `LW.db.zeiten`, `LW.zeiten.dialog`.
- Range switch Tag / Woche with ‹ › navigation. Top line: „Heute 5h 40m“ style total. Per quest: horizontal bar (quest colour) + hours, expandable to tasks. Firma section (only if a firma quest exists): Gesamt vs. abrechenbar (two numbers + share in %), per Kunde, per Person (Luca / Kai). Entry list for the range (editable unless billed). Bars are plain CSS (no chart library).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Verify in `?demo`: numbers match `rueckblick()` for the seed; week view sums 7 days; editing an entry updates totals.
- [ ] **Step 3:** UX audit skill, fix findings.
- [ ] **Step 4:** Commit `feat: Rückblick`.

### Task 10: Befehlsleiste, Feinschliff, Anleitung

**Files:** Create `js/befehle.js`, `ANLEITUNG.txt`; Modify as needed

**Interfaces:**
- Produces `LW.app.befehle()`: `Cmd/Ctrl+K` palette with fuzzy search over: tasks (Enter → Fokus, Alt+Enter → bearbeiten), views (Heute, Woche, Backlog, Rückblick), actions (Neue Aufgabe, Neue Quest, Zeit nachtragen, Hell/Dunkel). Arrow keys + Enter, Esc closes, focus returns.
- `ANLEITUNG.txt` in the style of Mediawo OS: what's in the folder; `?demo`; one-time setup: Supabase → SQL Editor → run `supabase/01_lw_schema.sql`, then `02_lw_pruefen.sql`; Authentication → URL Configuration → add `https://luca221203.github.io/lw/` to Redirect URLs; check „Allow new users to sign up“ is off; GitHub repo `lw`, Pages; updates; note that login is shared with Mediawo OS.

- [ ] **Step 1:** Implement palette; write ANLEITUNG.
- [ ] **Step 2:** Full walkthrough in `?demo` at 1280 px and 375 px, light and dark: morning (Heute) → Fokus → Pause/Weiter → Erledigt → Woche drag → Backlog filter → Rückblick; `/tests/` still 0 fehlgeschlagen; console clean.
- [ ] **Step 3:** UX audit skill across all screens, fix findings.
- [ ] **Step 4:** Commit `feat: Befehlsleiste, Feinschliff und Anleitung`.
