# Manzl Objekt OS v0.3

ChatGPT/MCP Objekt-Cockpit für Manzl Immobilien.

## Zielprozess
Outlook-Unterlagen → Intake → Adresse erkennen/verifizieren → Objekt in Supabase finden/neu anlegen → Dateien in Dropbox versioniert ablegen → Objektaufnahme/Jobs → Cockpit in ChatGPT.

## Systeme
- ChatGPT: Oberfläche + Orchestrierung
- Vercel: öffentliches Backend + `/mcp`
- Supabase: `objects`, `documents`, `units`, `jobs`
- Dropbox: Originalunterlagen und erzeugte Artefakte
- GitHub: Quellcode

## Vercel Environment Variables
Siehe `.env.example`. Niemals Service-Keys ins Repo committen.

## Endpunkte
- `GET /health`
- `POST /mcp`
- `POST /api/intake`
- `GET /api/objects`
- `POST /api/objects/:id/enrich`

## Dropbox-Struktur
Unter jedem Objekt werden Bereiche mit `aktuell/` und `archiv/` angelegt. Automatik darf archivieren/versionieren, aber nichts endgültig löschen.

## Lokal
```bash
npm install
npm start
```
