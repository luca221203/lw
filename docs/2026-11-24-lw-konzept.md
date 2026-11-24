# LW – Konzept (Version 1)

Stand: 24.11.2026 · Für: Luca Wunderlich (und Kai)

## Worum es geht

LW ist Lucas persönlicher Tagesplaner nach dem Prinzip von quest.app (Niklas Steenfatt):
Langfristige Ziele („Quests“) → konkrete Aufgaben → getrackte Zeit. Es zählt nicht, wie viele
Aufgaben abgehakt sind, sondern wohin die Zeit tatsächlich gegangen ist.

Eigenständige App mit eigenem Namen und Logo („LW“). Kein 1:1-Nachbau von Quest (Name, Logo,
Look werden nicht übernommen), nur das Prinzip.

**Warum:** Luca will die App täglich selbst nutzen (Handy und Laptop). Kai soll sie ebenfalls nutzen
können. Die Mediawo-Zeit soll später direkt in Mediawo OS als abrechenbare Stunden landen.
Nicht zum Verkaufen gedacht.

## Ein Tag mit LW

1. **Morgens** Heute-Ansicht überfliegen: Was steht pro Quest an?
2. **Fokus**: Task wählen → Fokusfenster mit laufender Zeit. Zeit wird Task und Quest gutgeschrieben.
3. **Nachmittags/abends** Rückblick: Wie viele Stunden gingen in welche Quest, wie viel davon
   abrechenbare Mediawo-Zeit?
4. **Planen**: Wochenkalender, Tasks auf Tage legen.

## Ziele (Version 1)

- **Quests** wie Ordner: z. B. Mediawo, Sport, Master. Jeder Nutzer hat eigene, private Quests.
- **Geteilte Quest** (Schalter „geteilt“): Luca und Kai sehen dieselben Aufgaben und die Zeiten
  beider, können sich Aufgaben gegenseitig zuweisen. Es kann mehrere geteilte Quests geben.
- **Firmen-Quest** (eigener Schalter „Firma“, unabhängig von „geteilt“): Aufgaben können einen
  **Mediawo-Kunden** (aus der bestehenden Tabelle `kunden`) bekommen. Zeit auf Aufgaben mit Kunde ist
  standardmäßig abrechenbar, Zeit ohne Kunde (z. B. Recherche, Weiterbildung) nicht. Ziel: Vergleich
  „wie viel arbeiten wir insgesamt – wie viel davon ist abrechenbar?“
- **Aufgaben** in einer Quest: Titel, optionale Notiz, geplanter Tag, zugewiesene Person, erledigt,
  optional Kunde (nur in Firmen-Quests).
- **Heute-Ansicht**: Quests mit den heute geplanten und überfälligen Aufgaben und den heute
  getrackten Stunden pro Quest. In geteilten Quests nur eigene und nicht zugewiesene Aufgaben.
  Wird morgens benutzt, Überblick in Sekunden.
- **Backlog**: alle offenen Aufgaben aller Quests (in geteilten Quests auch die des anderen),
  filterbar nach Quest, Person und „ohne Tag“. Von hier aus Aufgaben auf Tage legen oder zuweisen.
- **Fokus-Modus**: eine Aufgabe, großer Timer (läuft hoch), Start/Pause/Stopp, „Erledigt“.
  Der laufende Timer liegt in der Datenbank, also überlebt er Neuladen und Gerätewechsel
  (am Handy starten, am Laptop stoppen). Pro Person läuft höchstens ein Timer.
- **Zeiteinträge**: Jeder Timer-Lauf ist ein Eintrag (Start, Ende, Dauer, Person, Aufgabe, Quest).
  Nachträglich bearbeitbar und manuell anlegbar (Zeit vergessen zu starten).
  Einträge zu einem Mediawo-Kunden sind standardmäßig **abrechenbar** (umschaltbar).
- **Wochenplaner**: 7 Tage nebeneinander (am Handy untereinander). Aufgaben ohne Tag lassen sich
  einem Tag zuordnen (Ziehen am Laptop, Tippen und Auswählen am Handy).
- **Rückblick**: Tag und Woche. Stunden pro Quest und pro Aufgabe. Für Firmen-Quests zusätzlich
  pro Kunde, gesamt vs. abrechenbar, und pro Person (Luca / Kai).
- **Tastatur**: `N` neue Aufgabe, `F` Fokus, `⌘/Strg+K` Befehlsleiste (Aufgabe suchen, Ansicht
  wechseln, Timer starten), `⌘/Strg+Enter` erledigt.
- Hell/Dunkel nach Systemeinstellung. Ruhig, aufgeräumt, schnell.
- **Installierbar** am Handy (Web-App-Manifest), wie Mediawo OS.
- **Demo-Modus** (`?demo`): Beispieldaten nur im Browser, wie bei Mediawo OS. Zum Ausprobieren und
  zum Testen beim Bauen.

## Nicht in Version 1 (Schritt 2)

- **Übernahme in Rechnungen**: In Mediawo OS beim Erstellen einer Rechnung „Stunden übernehmen“:
  zeigt noch nicht abgerechnete, abrechenbare Einträge des Kunden, erzeugt Positionen und markiert
  die Einträge als abgerechnet. Die Datenbank wird in Version 1 schon dafür vorbereitet
  (Feld `rechnung_id` am Zeiteintrag).

## Bewusst nicht

- Kein Verkauf, keine offene Registrierung, keine Bezahlfunktion.
- Keine KI-Funktionen, keine Gamification (Punkte, Level).
- Keine native App, kein App Store.
- Keine Unteraufgaben, keine wiederkehrenden Aufgaben in V1 (kann später kommen).

**Wäre ein Fehlschlag, auch wenn es technisch läuft:** Wenn die App sich nach Aufgaben-Zählen
anfühlt statt nach Zeit, wenn sie morgens mehr als ein paar Sekunden zum Überblick braucht, oder
wenn das Starten des Fokus mehr als zwei Klicks kostet.

## Vorgehen (Approaches)

Erwogen wurden:

1. **Nur im Browser speichern (lokal):** am schnellsten, kostenlos, aber kein Abgleich zwischen
   Handy und Laptop und kein Teilen mit Kai. Verworfen, weil Luca beide Geräte nutzt.
2. **Eigenes Supabase-Projekt nur für LW:** sauber getrennt, gut zum Verkaufen. Verworfen, weil
   nicht verkauft wird und die Mediawo-Verbindung dann eine zusätzliche Brücke bräuchte.
3. **Eigene Web-App, gleiches Supabase-Projekt wie Mediawo OS (gewählt):** Gleiche Logins für
   Luca und Kai, direkter Zugriff auf `kunden`, Stunden liegen dort, wo Mediawo OS sie in Schritt 2
   in Rechnungen übernehmen kann. Kostenlos. LW bleibt eine eigene App mit eigener Adresse,
   damit private Quests (Sport, Master) nicht in die Firmensoftware gemischt werden.

Luca hat sich für 3 entschieden.

## Rahmen (vorgegeben)

- **Technik wie Mediawo OS:** HTML/CSS/JavaScript ohne Build-Schritt, `vendor/supabase.js`,
  Hosting auf GitHub Pages (eigenes Repository, z. B. `lw`), Upload per Weboberfläche.
  Vorbild für Aufbau, Login, Demo-Modus und `db.js`-Schnittstelle: `~/Desktop/Claude/Mediawo_OS`.
- **Login:** dieselben Supabase-Accounts wie Mediawo OS (E-Mail + Passwort, Passwort vergessen).
  Keine Registrierung in der App.
- **Datenbank:** neue Tabellen mit Präfix `lw_`. Bestehende Mediawo-Tabellen werden nicht
  verändert; `kunden` wird nur gelesen. Ein SQL-Skript zum einmaligen Ausführen im SQL-Editor,
  gefahrlos wiederholbar (wie `01_schema.sql`).
- **Sicherheit (Row Level Security):**
  - Private Quests, ihre Aufgaben und Zeiteinträge: nur der Besitzer.
  - Geteilte Quests und ihre Aufgaben: alle angemeldeten Nutzer (Luca und Kai) dürfen alles –
    Aufgaben anlegen/ändern/zuweisen und die Quest umbenennen, archivieren, Teilen beenden
    (Lucas Entscheidung). Endet das Teilen, sieht nur noch der Besitzer der Quest sie.
  - Aufgaben, auf denen Zeit gebucht ist, können nicht gelöscht, nur archiviert werden
    (Builder-Entscheidung: getrackte Zeit geht nie verloren). Quests ebenso.
  - Zeiteinträge: jeder liest/schreibt seine eigenen; Einträge auf geteilten Quests sind für beide
    lesbar, aber nur vom Ersteller änderbar.
  - **Abrechnung (vorbereitet für Schritt 2, von Luca bestätigt):** Beide dürfen die Stunden beider in
    eine Rechnung übernehmen (in Schritt 2 über eine Datenbankfunktion). Ein Eintrag mit gesetzter
    `rechnung_id` ist gesperrt (Trigger: nicht änderbar, nicht löschbar), passend zur GoBD-Festschreibung
    der Rechnungen. Wird die Rechnung storniert, werden die Einträge wieder frei. Den Trigger legt
    schon das V1-Skript an; `rechnung_id` verweist auf `rechnungen`.
  - Kein Zugriff für `anon`.
  - Die neuen Tabellen kommen **nicht** in die „nur_team“-Schleife von Mediawo OS.
  - Voraussetzung: In Supabase ist die freie Registrierung ausgeschaltet
    (Authentication → Sign In / Providers → „Allow new users to sign up“ aus). Luca prüft das.

## Datenmodell (Vorschlag – Entscheidung des Builders im Detail)

- `lw_profile` – `id` (= auth.uid), `name` (Anzeigename für Zuweisungen).
- `lw_quests` – `id`, `owner_id`, `name`, `farbe`, `geteilt` (bool), `firma` (bool), `sortierung`, `archiviert`, `created_at`.
- `lw_tasks` – `id`, `quest_id`, `titel`, `notiz`, `tag` (date, geplant), `zugewiesen_an` (user),
  `kunde_id` (→ `kunden`, optional), `erledigt_am`, `sortierung`, `created_by`, `created_at`.
- `lw_zeiten` – `id`, `user_id`, `quest_id`, `task_id` (optional), `kunde_id` (optional),
  `start`, `ende` (null = läuft gerade), `abrechenbar` (bool), `notiz`, `rechnung_id` (optional,
  für Schritt 2). Eindeutigkeit: höchstens ein laufender Eintrag pro Person.

## Entscheidungen des Builders

- Visuelles Design im Rahmen „ruhig, aufgeräumt“, Logo „LW“ als Schriftzug-Monogramm.
- Genauer Seitenaufbau, Farben pro Quest, Animationen.
- Ob Pausen im Fokus als getrennte Einträge oder als ein Eintrag mit Pausenzeit gespeichert werden.
- Verhalten ohne Internet: V1 braucht Verbindung; der Startzeitpunkt eines Timers darf durch einen
  Verbindungsabbruch aber nicht verloren gehen.
- **Hosting (entschieden):** GitHub Pages unter demselben Account wie Mediawo OS
  (`luca221203.github.io/lw/`). Gleiche Adresse → Login wird zwischen beiden Apps geteilt. LW-Adresse
  in Supabase unter Authentication → URL Configuration → Redirect URLs eintragen. Hochladen per
  GitHub CLI durch Claude, sobald Luca sich einmal selbst angemeldet hat; sonst per Weboberfläche
  wie bei Mediawo OS.
- Ablageort: `~/Desktop/Claude/LW` (App) mit `supabase/` (SQL) und `ANLEITUNG.txt`
  (Einrichten und Hochladen, wie bei Mediawo OS).
