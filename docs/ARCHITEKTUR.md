# Architektur Manzl Objekt OS

## Rollen
- **ChatGPT App / Widget:** Cockpit, Spracheingabe, Aktionen und Rückfragen.
- **Vercel:** öffentlich erreichbarer MCP-/API-Server.
- **Supabase:** strukturierte Objektwahrheit (`objects`, `documents`, `units`, `jobs`).
- **Dropbox:** Originalunterlagen und erzeugte Dateien; keine Geschäftsdatenbank.
- **GitHub:** Quellcode und Deployment-Quelle.

## Intake
1. Dateien werden hochgeladen.
2. Adresse wird aus Dateiname/Inhalt erkannt und gegen Stadt Wien verifiziert.
3. Supabase entscheidet: bestehendes Objekt / neues Objekt / unklar.
4. Neue Dateien werden gehasht; identische Dateien werden nicht doppelt gespeichert.
5. Dropbox speichert die Datei in der fachlichen Ablage.
6. Versionsfähige Dokumente ersetzen die aktuelle Version: Altversion → `archiv`, neue Version → `aktuell`.
7. Neue Zinsliste setzt bestehende Topografie auf veraltet und erzeugt einen `create_topography`-Job.
8. Automatische Objektaufnahme und weitere Jobs laufen anschließend.

## Sicherheitsregeln
- Keine Service-Keys im Repository oder Widget.
- `SUPABASE_SERVICE_ROLE_KEY`, Dropbox-App-Secret und Refresh-Token nur als Server-Secrets.
- RLS ist für die Kerntabellen aktiviert.
- Automatik löscht keine Unterlagen endgültig; sie versioniert und archiviert.
