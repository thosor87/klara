# KlaRa — Klassenraum

Privater, geprüfter Foto-Austausch für eine Grundschulklasse. Eltern/Kinder
laden Fotos hoch, die Lehrerin gibt sie frei. Login per Schul-E-Mail
(Magic-Link **oder** 6-stelliger Code).

Spec: `docs/superpowers/specs/2026-06-22-klara-design.md`

## Stack
React+Vite-SPA · Fastify (eine Vercel-Function, `fra1`) · Neon Postgres ·
AWS S3 (`eu-central-1`) · AWS SES.

## Lokal starten
```bash
npm install
cp .env.example .env   # DATABASE_URL etc. eintragen
npm run migrate
npm run seed:admin
npm run build
npm start              # http://localhost:3000
```
Ohne `SES_*`/`AWS_*` werden Login-Mails in die Server-Konsole geschrieben.

## Deploy
Vercel-Projekt mit Root = Repo, Region `fra1`. Env-Variablen aus `.env.example`
im Vercel-Dashboard setzen. Migration/Seed einmalig lokal gegen die
Produktions-`DATABASE_URL` laufen lassen.
