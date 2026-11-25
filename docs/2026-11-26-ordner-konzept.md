# TM – Ordner in Quests (Konzept)

Stand: 26.11.2026 · Für: Luca (und Kai) · Baut auf `2026-11-24-lw-konzept.md` auf
(App heißt inzwischen „TM“, Adresse bleibt `luca221203.github.io/lw/`).

## Worum es geht

Luca will innerhalb einer Quest eine feste Ordnerstruktur, „ein bisschen wie ein
Projektmanagement-Tool“: Er schreibt eine Aufgabe wie „Website machen für Susanne“ und legt sie
in Mediawo → Extern → Susanne Kreutz → Website. So sieht er genau, **für was wie viel Zeit**
aufgebracht wurde – pro Projekt, pro Kunde, intern vs. extern.

**Warum jetzt:** Die App läuft seit 25.11. mit echten Daten. Bisher hat eine Aufgabe nur
optional einen Kunden; das reicht nicht, um Zeit pro Projekt zu sehen, und „abrechenbar“ ist
im Alltag schwer zu finden (die Kunden-Auswahl erscheint erst, wenn die Quest „Firma“ ist,
und der Stift dafür sitzt nur in der Heute-Ansicht).

## Die Struktur (von Luca entschieden)

Firma-Quest (z. B. Mediawo):

```
Mediawo
├─ Intern                 ← fester Ordner
│   ├─ Marketing          ← Projekt, frei benannt
│   └─ Weiterbildung
└─ Extern                 ← fester Ordner
    ├─ Susanne Kreutz     ← Kunden-Ordner, verknüpft mit Mediawo-OS-Kunde
    │   ├─ Website        ← Projekt, frei benannt
    │   └─ Reels
    └─ DeFORIS
        └─ Angebot
```

Andere Quest (z. B. Master, Sport): Projekte direkt unter der Quest, ohne Intern/Extern
(Master → Thesis, Statistik).

- **Feste Tiefe**, keine beliebig verschachtelten Ordner (Approach 1, siehe unten).
- **Intern** und **Extern** sind feste Ordner jeder Firma-Quest. Sie werden automatisch angelegt,
  nicht umbenannt, nicht gelöscht.
- **Kunden-Ordner** liegen nur unter Extern. Angelegt durch Auswahl eines Kunden aus der
  Mediawo-OS-Tabelle `kunden` (Variante A, von Luca gewählt). Der Name kommt aus `kunden`, nicht
  frei. Pro Quest höchstens ein Ordner je Kunde. Darf leer sein.
- **Projekte** liegen unter Intern, unter einem Kunden-Ordner oder (Nicht-Firma-Quest) direkt
  unter der Quest. Frei benannt.

## Aufgaben und Zeit

- Eine Aufgabe liegt in **genau einem Ordner oder in keinem** (direkt in der Quest). Schnell
  notierte Aufgaben ohne Ordner sind erlaubt und lassen sich später einsortieren.
  *Builder-Vorschlag, von Luca bestätigt.*
- Aufgaben dürfen in jedem Ordner liegen, nicht nur in Projekten (z. B. „Rechnung prüfen“
  direkt im Kunden-Ordner Susanne). *Builder-Entscheidung.*
- **Kunde einer Aufgabe ergibt sich aus dem Ordner**: liegt sie im Kunden-Ordner oder in einem
  Projekt darunter, ist das ihr Kunde. Das Kunden-Feld im Aufgaben-Dialog entfällt; an seine
  Stelle tritt die Ordner-Auswahl.
- **Abrechenbar:** Zeit auf einer Aufgabe mit Kunde ist standardmäßig abrechenbar, sonst intern
  (gleiche Regel wie bisher: Firma-Quest und Kunde). Also: alles unter einem Kunden-Ordner
  abrechenbar; Intern, Extern ohne Kunde und Aufgaben ohne Ordner nicht. **Pro Zeiteintrag
  umschaltbar** (Luca ausdrücklich).
- **Zeit wandert mit der Aufgabe (Luca entschieden).** Wird eine Aufgabe in einen anderen Ordner
  verschoben, zählt ihre gesamte bisherige Zeit zum neuen Ordner. Alle Summen (Seitenleiste,
  Ordner-Ansicht, Rückblick inkl. „je Kunde“) müssen danach übereinstimmen. Nicht abgerechnete
  Einträge übernehmen den Kunden des neuen Ordners; ändert sich dabei der Kunde (oder fällt er
  weg), wird auch „abrechenbar“ neu auf den Standard gesetzt (mit Kunde ja, ohne nein). Bleibt der
  Kunde gleich, bleibt ein von Hand umgeschaltetes „abrechenbar“ erhalten. Abgerechnete
  (gesperrte) Einträge bleiben unverändert. Typischer Fall: morgens ohne Ordner notiert und
  getrackt, abends nach Extern → Susanne → Website einsortiert – die Zeit ist dann dort und
  abrechenbar. Gilt auch für Einträge von Kai auf geteilten Quests.
- **Fokus** zeigt unter dem Titel den Ordnerpfad (Mediawo › Extern › Susanne Kreutz › Website)
  und deutlich „Abrechenbar“ bzw. „Intern“ für den laufenden Eintrag; ein Klick darauf schaltet
  um. (Anlass: Luca fand im Fokus nicht, wo abrechenbar/intern steht.)

## Seitenleiste

```
▾ Mediawo                 2h 10m
   ▸ Intern
   ▾ Extern
      ▸ Atelier Arnoldy
      ▸ DeFORIS
      ▾ Susanne Kreutz
          Website         1h 30m
          Reels
▸ Master
▸ Sport
```

- Quests und alle Ordner sind **einzeln auf- und zuklappbar** (Lucas Anliegen: bei 10–15 aktiven
  Kunden darf die Leiste nicht überlaufen). Der Zustand wird pro Gerät gemerkt.
- Am Anfang (nichts gemerkt) ist nur der Pfad zur Aufgabe mit dem laufenden Timer offen.
- Hinter jeder Quest und jedem Ordner: eigene Zeit **heute** (inkl. Unterordner), nur wenn > 0.
- Klick auf einen Ordner öffnet eine **Ordner-Ansicht**: offene und erledigte Aufgaben dieses
  Ordners und seiner Unterordner, Zeit (heute / Woche / gesamt), „+ Aufgabe“ legt direkt dort an.
- Quests und Ordner direkt in der Leiste **bearbeiten, umbenennen, archivieren**, Ordner anlegen
  (Menü am Eintrag, z. B. „…“). Bisher ging „Quest bearbeiten“ nur über den Stift in Heute.

## Andere Ansichten

- **Heute, Woche, Backlog:** Aufgaben zeigen klein ihren Ordner (letzte Ebene, z. B.
  „Susanne Kreutz › Website“). Backlog bekommt einen Ordner-Filter.
- **Rückblick:** pro Quest aufklappbar bis Ordner → Aufgabe; Firma-Abschnitt wie bisher
  (Gesamt vs. abrechenbar, je Kunde, je Person), zusätzlich Intern vs. Extern.
- **Befehlsleiste (⌘K):** findet auch Ordner.

## Bestehende Daten

- Firma-Quests bekommen beim ersten Laden nach dem Update Intern und Extern.
- Mediawo-Aufgaben, die schon einen Kunden haben, wandern nach Extern → (Kunde) → „Allgemein“.
  Aufgaben ohne Kunde bleiben ohne Ordner. Zeiteinträge bleiben unverändert.
- Datenbank-Änderung als **eigenes, wiederholbares Skript** `supabase/03_lw_ordner.sql`
  (01 sagt ausdrücklich: spätere Änderungen in ein eigenes Skript). Luca führt es im SQL Editor
  aus; `02_lw_pruefen.sql` wird um die neuen Prüfungen ergänzt.

## Rechte und Sicherheit

- Ordner gehören zu einer Quest und haben **dieselben Rechte wie ihre Aufgaben**: privat nur der
  Besitzer, in geteilten Quests beide alles (anlegen, umbenennen, archivieren).
- Ordner mit Aufgaben, auf denen Zeit liegt, können nicht gelöscht, nur archiviert werden
  (getrackte Zeit geht nie verloren – wie bei Aufgaben und Quests).
- Die Datenbank erzwingt die feste Struktur (welche Art Ordner wo liegen darf, Kunden-Ordner nur
  unter Extern, ein Kunden-Ordner pro Kunde und Quest), nicht nur die Oberfläche.
- Kein Zugriff für `anon`; neue Tabelle nicht in der „nur_team“-Schleife von Mediawo OS.
- Mediawo OS selbst wird **nicht** verändert. `kunden` wird nur gelesen.

## Ziele, Nicht-Ziele, Anti-Ziele

**Ziele:** Zeit pro Projekt und Kunde sichtbar; Aufgaben in zwei Klicks einsortiert; die
Seitenleiste bleibt bei 15 Kunden übersichtlich; abrechenbar/intern ist im Fokus auf einen Blick
erkennbar und umschaltbar.

**Nicht-Ziele (jetzt):** beliebig tiefe Ordner; Ordner zwischen Quests verschieben; Projekte
mit Budget, Deadline oder Status; Übernahme in Rechnungen (bleibt Schritt 2 in Mediawo OS).

**Wäre ein Fehlschlag, auch wenn es technisch läuft:** wenn Aufgabe-anlegen spürbar langsamer
wird als heute (Ordner muss optional und schnell wählbar sein); wenn die Seitenleiste springt
oder überläuft; wenn bereits gebuchte Zeit durch Umsortieren ihren Kunden oder ihr
„abrechenbar“ verliert; wenn der Start des Fokus mehr als zwei Klicks kostet.

## Approaches

1. **Feste Struktur Intern/Extern → Kunde → Projekt (gewählt).** Passt genau zu Lucas Beispiel,
   einfache Bedienung und Auswertung, Kunde ergibt sich sauber aus dem Ordner. Nachteil: nicht
   tiefer als drei Ebenen.
2. **Freie Ordner, beliebig tief, Ordner optional mit Kunde verknüpft.** Maximal flexibel, aber
   aufwendiger zu bauen und zu bedienen, unklar welcher Ordner den Kunden bestimmt,
   Auswertung unübersichtlicher. Verworfen.
3. **Schlagwörter statt Ordner.** Verworfen: Luca will Ordner und saubere Summen pro Projekt.

Luca hat 1 gewählt; zunächst sollten Kunden nur „automatisch erscheinen“, auf seinen Wunsch
(Übersicht bei vielen Kunden) sind auch Kunden sowie Intern/Extern eigene, zuklappbare Ordner.

## Entscheidungen nach der Prüfung (Builder-Entscheidungen, von Luca zu prüfen)

- **Firma einschalten** bei einer Quest mit Projekten: Intern und Extern werden angelegt, die
  bestehenden Projekte wandern nach Intern. **Firma ausschalten** geht nur, solange es keine
  Kunden-Ordner gibt (Hinweis: erst archivieren oder verschieben); dann werden Intern/Extern
  aufgelöst und ihre Projekte liegen direkt unter der Quest.
- **Archivieren** eines Ordners archiviert seine Unterordner mit. Archivierte Ordner stehen in der
  Seitenleiste unter „Archiviert“ (zugeklappt); ihre Aufgaben erscheinen nicht mehr in Heute,
  Woche und Backlog, ihre Zeit bleibt im Rückblick. In archivierte Ordner wird nicht einsortiert.
  Ein archivierter Kunden-Ordner zählt für „ein Ordner je Kunde“: Kunde erneut hinzufügen holt ihn
  zurück.
- **Löschen** nur für leere Ordner (keine Aufgaben, keine Unterordner). Sonst archivieren.
- **Rückblick Firma-Quest:** Zeit ohne Ordner (und ohne Aufgabe) zählt als **Intern**, sodass
  Intern + Extern = Gesamt (so mit Luca besprochen).
- **Kunde in Mediawo OS inaktiv oder gelöscht:** Der Kunden-Ordner bleibt und zeigt den zuletzt
  bekannten Namen (Kopie im Ordner); gelöscht wird er als „(gelöscht)“ markiert. Mediawo OS wird
  nicht blockiert. Inaktive Kunden mit Ordner werden weiterhin mit Namen geladen.

## Dem Builder überlassen

Tabellen- und Spaltennamen, wie die Struktur in der Datenbank erzwungen wird, wie der Kunde
einer Aufgabe gespeichert wird (abgeleitet oder mitgeführt), Aussehen des Ordner-Menüs und der
Ordner-Auswahl im Aufgaben-Dialog, Reihenfolge der Ordner (Vorschlag: Kunden alphabetisch,
Projekte nach Anlage), Demo-Daten für `?demo`.
