# Prompt für Claude Code: Seerr-Fork mit personalisierten Empfehlungen

## Kontext

Ich betreibe einen eigenen Plex-Mediaserver (Homelab, Docker-basiert) und nutze **Seerr** (github.com/seerr-team/seerr, MIT-Lizenz, TypeScript/Next.js, unifizierte Weiterentwicklung von Overseerr/Jellyseerr) als Request-Management-Tool, angebunden an Radarr/Sonarr.

Ziel dieses Projekts ist **kein** Neubau von Seerr, sondern ein **Fork** des bestehenden Seerr-Codes, den ich um eigene, personalisierte Empfehlungs-Features erweitere. Der Fork ersetzt danach meine bisherige Standard-Seerr-Instanz (ein Container, kein separater Zusatzdienst).

**Architekturprinzip, das unbedingt eingehalten werden soll:** Alle neuen Features sollen möglichst **isoliert/modular** umgesetzt werden (z. B. als neuer Discover-Slider-Typ, neue eigenständige Routen/Komponenten, neue eigene Backend-Services), statt bestehende Kern-Dateien von Seerr grossflächig zu verändern. Grund: Ich möchte künftige Upstream-Updates von Seerr weiterhin per `git fetch upstream` + Merge einspielen können, ohne dass es dabei zu grossflächigen Konflikten kommt.

Bestehende Seerr-Funktionalität (Auth, Permissions, Request-Erstellung, Radarr/Sonarr-Anbindung, Discover-Slider-System) soll wiederverwendet werden, nicht dupliziert.

## Datenquellen

- **Plex API**: Watch History / bereits gesehene Titel des jeweiligen Nutzers, Bibliotheksstatus, ggf. Nutzer-Rating (userRating-Feld).
- **TMDB API**: "Similar"/"Recommendations"-Endpunkte für Kandidaten-Generierung, Metadaten/Poster.
- Seerr selbst kennt bereits, was schon in der Bibliothek vorhanden bzw. bereits angefragt ist – das soll für Ausschlusslisten wiederverwendet werden.

## Feature 1: Personalisierte Discover-Rubrik

- Neue Rubrik auf der bestehenden Seerr-"Discover"-Seite, analog zu den bereits vorhandenen Slider-Typen (Genre, Keyword, Studio, Streaming-Anbieter – Seerr verwaltet diese über eine "DiscoverSlider"-Entität samt zugehöriger API).
- Vorschläge basieren auf den in Plex bereits gesehenen Filmen/Serien des eingeloggten Nutzers (nicht serverweit gemittelt über alle Nutzer, sondern personalisiert pro Account).
- Kandidaten-Generierung: TMDB "Similar"/"Recommendations", geseedet mit den zuletzt bzw. am besten bewerteten geschauten Titeln aus Plex.
- Ausschluss: bereits in der Bibliothek vorhandene Titel, bereits angefragte Titel, sowie (siehe Feature 2) nach links geswipte Titel.

## Feature 2: Swipe-Tab ("Tinder für Filme")

- Neuer Tab/neue Route in der Seerr-Navigation.
- Zeigt einzelne Kandidaten aus demselben Empfehlungs-Pool wie Feature 1 (noch nicht gesehene, aber anhand der Watch History empfohlene Titel), einen nach dem anderen als Karte.
- Swipe rechts = gefällt mir, swipe links = gefällt mir nicht. Für Desktop-Nutzung zusätzlich Buttons als Alternative zur Touch-Geste.
- Jede Swipe-Aktion wird persistent gespeichert (neue Datenbanktabelle: User-ID, TMDB-ID, Medientyp, Richtung, Zeitstempel).
- Nach links geswipte Titel werden zukünftig weder im Swipe-Pool noch in Feature 1 erneut vorgeschlagen.

## Feature 3: "Geliked"-Rubrik auf Discover

- Weitere neue Rubrik auf der Discover-Seite, gespeist aus den nach rechts geswipten (positiv bewerteten) Titeln aus Feature 2.
- Titel bleiben normal anklick- und anfragbar wie jede andere Discover-Kachel.

## Nicht Priorität für den ersten Wurf (später ggf. nachrüstbar)

- Verbindung zum nativen 5-Sterne-Rating von Plex (lesend/schreibend). Falls es sich technisch günstig anbietet, gerne mitdenken, aber kein Blocker.

## Technischer Ansatz (Vorschlag, gerne challengen)

- Empfehlungs-Logik (Kandidaten-Generierung aus Plex-Watch-History + TMDB, inkl. Ausschlusslisten) als **ein** klar abgegrenzter Backend-Service umsetzen, den sowohl Feature 1 (Slider) als auch Feature 2 (Swipe-Pool) nutzen – keine Code-Duplikation zwischen den beiden.
- Neue Datenbanktabelle für Swipe-Daten so gestalten, dass sie sowohl für die Ausschlusslogik (Feature 1/2) als auch für die "Geliked"-Rubrik (Feature 3) direkt abfragbar ist.

## Bitte vor Implementierungsbeginn mit mir klären

1. Soll die "Geliked"-Rubrik (Feature 3) unbegrenzt wachsen oder z. B. auf die letzten X Titel / X Tage begrenzt werden?
2. Wie viele Kandidaten soll der Swipe-Pool auf einmal vorhalten bzw. wann automatisch nachladen (z. B. Batch von 20)?
3. Soll ein nach links geswipter Titel dauerhaft gesperrt sein, oder soll es eine Möglichkeit geben, die Ablehnungsliste zurückzusetzen?
4. Gibt es eine Präferenz Mobile- vs. Desktop-Priorität bei der Swipe-UI?
5. Falls mehrere Plex-Nutzer/Familienmitglieder Seerr-Accounts haben: sollen Feature 1–3 pro Nutzer komplett getrennt sein, oder gibt es Fälle, wo eine gemeinsame/gemischte Ansicht gewünscht ist?

## Deployment-Kontext (zur Info, bei Bedarf berücksichtigen)

Mein Homelab läuft auf einer UGREEN NAS mit Docker Compose. Bestehende Container teilen sich ein gemeinsames Docker-Netzwerk (`immich_default`, `external: true`), und öffentlicher Zugriff läuft über einen Cloudflare Tunnel mit `container_name:internal_port`-Verweisen pro Hostname. Der neue Seerr-Fork-Container sollte nach demselben Muster eingebunden werden wie meine bisherigen Services.
