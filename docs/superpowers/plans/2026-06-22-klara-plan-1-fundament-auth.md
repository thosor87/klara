# KlaRa Plan 1 — Fundament + Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine deploybare, login-geschützte App-Hülle für KlaRa: Monorepo im fragkim-Muster, Neon-Postgres, E-Mail-Login per Magic-Link **und** 6-stelligem Code, persistente Session, geseedeter Erst-Admin und eine minimale Login-Oberfläche.

**Architecture:** npm-Workspaces-Monorepo. Eine Fastify-App (`buildApp()`), die als **eine** Vercel-Function (`api/index.ts`, Region `fra1`) läuft und die gebaute Vite-SPA ausliefert. Auth-Logik ist in reine, testbare Module zerlegt (Eligibility, Tokens) plus eine Service-Schicht, die über injizierte Interfaces (`AuthRepo`, `Mailer`) auf Postgres und SES zugreift — dadurch sind Routen ohne echte DB/SES unit-testbar.

**Tech Stack:** TypeScript, Fastify 5, @fastify/cookie, `postgres` (porsager) gegen Neon (pooled URL), `@aws-sdk/client-sesv2`, React 19 + Vite 8, Vitest 4, tsx.

---

## File Structure

```
klara/
├── package.json                 # Workspaces-Root, Build-/Dev-Skripte
├── tsconfig.base.json           # gemeinsame TS-Optionen
├── vercel.json                  # Build + Function fra1 + Rewrites
├── .env.example                 # alle Env-Variablen dokumentiert
├── api/
│   ├── index.ts                 # Vercel-Function-Entry (lazy buildApp)
│   ├── package.json             # { "type": "module" }
│   └── tsconfig.json
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts            # buildApp(), lokaler Listener, SPA-Serve, /healthz
│       ├── config.ts            # Env → typisiertes config-Objekt
│       ├── db.ts                # postgres-Client (sql)
│       ├── types.ts            # User, UserRole, UserStatus, LoginTokenRow
│       └── auth/
│           ├── eligibility.ts   # reine Funktionen: Normalisierung, Domain-Check, Entscheidung
│           ├── tokens.ts        # reine Funktionen: Code/Token erzeugen, hashen, vergleichen
│           ├── repo.ts          # AuthRepo-Interface + Postgres-Implementierung
│           ├── mailer.ts        # Mailer-Interface + SES-Implementierung
│           ├── service.ts       # requestLogin / verifyCode / verifyLink (nutzt repo+mailer)
│           └── routes.ts        # Fastify-Routen + Session-Cookie + getCurrentUser
├── migrations/
│   └── 001_init.sql             # users, login_tokens
├── scripts/
│   ├── migrate.ts               # führt migrations/*.sql aus
│   └── seed-admin.ts            # legt INITIAL_ADMIN_EMAIL als active admin an
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx              # Login-Flow + eingeloggte Ansicht
        ├── api.ts               # fetch-Wrapper auf /api/*
        └── styles.css
```

---

## Task 1: Monorepo-Scaffold

**Files:**
- Create: `package.json`, `tsconfig.base.json`

- [ ] **Step 1: Root-`package.json` anlegen**

```json
{
  "name": "klara",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "workspaces": ["backend", "frontend"],
  "scripts": {
    "dev:backend": "npm --workspace backend run dev",
    "dev:frontend": "npm --workspace frontend run dev",
    "build": "npm --workspace frontend run build && npm --workspace backend run build",
    "start": "node backend/dist/server.js",
    "test": "npm --workspace backend run test",
    "migrate": "tsx scripts/migrate.ts",
    "seed:admin": "tsx scripts/seed-admin.ts"
  },
  "devDependencies": {
    "tsx": "^4.22.4",
    "typescript": "^6.0.3"
  }
}
```

- [ ] **Step 2: `tsconfig.base.json` anlegen**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 3: Dev-Dependencies installieren**

Run: `npm install`
Expected: `node_modules/` entsteht, kein Fehler.

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.base.json package-lock.json
git commit -m "chore: monorepo scaffold (workspaces, tsconfig base)"
```

---

## Task 2: Backend-Skeleton + Healthcheck + Function-Entry

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/src/server.ts`
- Create: `api/index.ts`, `api/package.json`, `api/tsconfig.json`
- Create: `vercel.json`

- [ ] **Step 1: `backend/package.json` anlegen**

```json
{
  "name": "klara-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@aws-sdk/client-sesv2": "^3.700.0",
    "@fastify/cookie": "^11.0.2",
    "@fastify/static": "^9.1.3",
    "dotenv": "^17.4.2",
    "fastify": "^5.8.5",
    "postgres": "^3.4.5"
  },
  "devDependencies": {
    "@types/node": "^25.9.3",
    "tsx": "^4.22.4",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: `backend/tsconfig.json` anlegen**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: `backend/src/server.ts` anlegen (buildApp, /healthz, SPA-Serve, lokaler Listener)**

```ts
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveFrontendDist(): string {
  if (process.env.FRONTEND_DIST) return path.resolve(process.env.FRONTEND_DIST);
  return path.resolve(__dirname, "../../frontend/dist");
}

export interface BuildOptions {
  /** Test-Hooks: in Tests echte Adapter durch Fakes ersetzen. */
  registerRoutes?: (app: FastifyInstance) => Promise<void> | void;
}

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const frontendDist = resolveFrontendDist();
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === "production" ? "info" : "debug" },
    bodyLimit: 64 * 1024,
  });

  await app.register(fastifyCookie, { secret: process.env.SESSION_SECRET ?? "dev-secret" });

  app.get("/healthz", async () => ({ ok: true }));

  if (opts.registerRoutes) await opts.registerRoutes(app);

  if (existsSync(frontendDist)) {
    await app.register(fastifyStatic, { root: frontendDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      reply.type("text/html").sendFile("index.html");
    });
  }

  return app;
}

// Lokaler Start (npm start / tsx). Auf Vercel wird stattdessen api/index.ts genutzt.
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  const port = Number(process.env.PORT ?? 3000);
  buildApp().then((app) => app.listen({ port, host: "0.0.0.0" }))
    .then(() => console.log(`KlaRa backend on :${port}`))
    .catch((err) => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 4: `api/index.ts` anlegen (Vercel-Function-Entry)**

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.FRONTEND_DIST = path.resolve(__dirname, "../frontend/dist");

let appPromise: Promise<unknown> | null = null;
async function getApp() {
  if (!appPromise) {
    appPromise = import("../backend/dist/server.js").then(async (mod: any) => {
      const app = await mod.buildApp(await mod.defaultRuntime());
      await app.ready();
      return app;
    });
  }
  return appPromise as Promise<{
    server: { emit: (e: string, req: IncomingMessage, res: ServerResponse) => void };
  }>;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app.server.emit("request", req, res);
}

export const config = { maxDuration: 30 };
```

Hinweis: `defaultRuntime()` wird in Task 11 in `server.ts` ergänzt (liefert die echten Routen-Registrierungen). Bis dahin schlägt der Vercel-Entry nicht fehl, weil er erst in Task 11 benutzt wird; lokal läuft alles über den Listener in Step 3.

- [ ] **Step 5: `api/package.json` und `api/tsconfig.json` anlegen**

`api/package.json`:
```json
{ "type": "module" }
```

`api/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node"] },
  "include": ["index.ts"]
}
```

- [ ] **Step 6: `vercel.json` anlegen**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "installCommand": "npm ci",
  "outputDirectory": "public",
  "regions": ["fra1"],
  "functions": {
    "api/index.ts": { "maxDuration": 30, "includeFiles": "{backend/dist/**,frontend/dist/**}" }
  },
  "rewrites": [{ "source": "/(.*)", "destination": "/api/index" }]
}
```

Außerdem leeren Platzhalter anlegen, damit `outputDirectory` existiert:

Run: `mkdir -p public && touch public/.gitkeep`

- [ ] **Step 7: Installieren, bauen, Healthcheck lokal prüfen**

Run: `npm install && npm --workspace backend run build && node backend/dist/server.js &`
Dann: `sleep 1 && curl -s localhost:3000/healthz`
Expected: `{"ok":true}` — danach den Hintergrundprozess beenden (`kill %1`).

- [ ] **Step 8: Commit**

```bash
git add backend api vercel.json public/.gitkeep package-lock.json
git commit -m "feat: fastify skeleton, healthz, vercel function entry (fra1)"
```

---

## Task 3: Frontend-Skeleton (Vite-SPA, vom Backend ausgeliefert)

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/styles.css`

- [ ] **Step 1: `frontend/package.json` anlegen**

```json
{
  "name": "klara-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  },
  "devDependencies": {
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.2",
    "typescript": "^6.0.3",
    "vite": "^8.0.16"
  }
}
```

- [ ] **Step 2: `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html` anlegen**

`frontend/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "noEmit": true,
    "types": []
  },
  "include": ["src"]
}
```

`frontend/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3000", "/healthz": "http://localhost:3000" } },
});
```

`frontend/index.html`:
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>KlaRa — Klassenraum</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/styles.css` anlegen (Platzhalter)**

`frontend/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
```

`frontend/src/App.tsx` (vorläufig, wird in Task 13 ersetzt):
```tsx
export function App() {
  return <main className="card"><h1>KlaRa</h1><p>Lädt …</p></main>;
}
```

`frontend/src/styles.css`:
```css
:root { font-family: system-ui, -apple-system, sans-serif; color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #f3f1fb; color: #1f1b2e; }
.card { max-width: 420px; margin: 12vh auto; padding: 2rem; background: #fff;
        border-radius: 18px; box-shadow: 0 8px 30px rgba(80,60,160,.12); }
h1 { margin: 0 0 1rem; color: #5b3fb0; }
input, button { font: inherit; width: 100%; padding: .8rem 1rem; border-radius: 12px;
                border: 1px solid #d9d3ef; margin-top: .6rem; }
button { background: #5b3fb0; color: #fff; border: none; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.err { color: #b00038; margin-top: .6rem; }
.muted { color: #6b6580; font-size: .9rem; }
```

- [ ] **Step 4: Bauen und prüfen, dass das Backend die SPA ausliefert**

Run: `npm install && npm run build && node backend/dist/server.js &`
Dann: `sleep 1 && curl -s localhost:3000/ | grep -o "<title>[^<]*</title>"`
Expected: `<title>KlaRa — Klassenraum</title>` — danach `kill %1`.

- [ ] **Step 5: Commit**

```bash
git add frontend package-lock.json
git commit -m "feat: vite react spa skeleton served by backend"
```

---

## Task 4: Config-Modul

**Files:**
- Create: `backend/src/config.ts`, `.env.example`
- Test: `backend/src/config.test.ts`

- [ ] **Step 1: Failing test schreiben**

`backend/src/config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseAllowedDomains } from "./config.js";

describe("parseAllowedDomains", () => {
  it("splittet, trimmt und lowercased", () => {
    expect(parseAllowedDomains("Grundschule-XY.de, beispiel.de ")).toEqual([
      "grundschule-xy.de",
      "beispiel.de",
    ]);
  });
  it("liefert leeres Array bei undefined/leer", () => {
    expect(parseAllowedDomains(undefined)).toEqual([]);
    expect(parseAllowedDomains("")).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `npm --workspace backend run test -- config`
Expected: FAIL — `parseAllowedDomains` existiert nicht.

- [ ] **Step 3: `backend/src/config.ts` implementieren**

```ts
import "dotenv/config";

export function parseAllowedDomains(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL ?? "",
  allowedDomains: parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAINS),
  initialAdminEmail: (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase() || null,
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret",
  sessionMaxDays: Number(process.env.SESSION_MAX_DAYS ?? 30),
  tokenTtlMinutes: Number(process.env.LOGIN_TOKEN_TTL_MINUTES ?? 15),
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  ses: {
    region: process.env.SES_REGION ?? "eu-central-1",
    fromAddress: process.env.SES_FROM_ADDRESS ?? "",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
};

export { required };
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `npm --workspace backend run test -- config`
Expected: PASS (2 Tests grün).

- [ ] **Step 5: `.env.example` anlegen**

```bash
# Datenbank (Neon, pooled connection string)
DATABASE_URL=postgres://user:pass@ep-xxx-pooler.eu-central-1.aws.neon.tech/klara?sslmode=require

# Login
ALLOWED_EMAIL_DOMAINS=grundschule-xy.de
INITIAL_ADMIN_EMAIL=lehrerin@grundschule-xy.de
SESSION_SECRET=bitte-langen-zufallswert-setzen
SESSION_MAX_DAYS=30
LOGIN_TOKEN_TTL_MINUTES=15
APP_BASE_URL=http://localhost:3000

# AWS SES (eu-central-1)
SES_REGION=eu-central-1
SES_FROM_ADDRESS=klara@grundschule-xy.de
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/config.ts backend/src/config.test.ts .env.example
git commit -m "feat: config module with env parsing + .env.example"
```

---

## Task 5: Datenbank-Modul + Migration (users, login_tokens)

**Files:**
- Create: `backend/src/db.ts`, `backend/src/types.ts`, `migrations/001_init.sql`, `scripts/migrate.ts`

- [ ] **Step 1: `backend/src/types.ts` anlegen (geteilte Typen)**

```ts
export type UserRole = "admin" | "member";
export type UserStatus = "pending" | "active" | "disabled";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export interface LoginTokenRow {
  id: string;
  email: string;
  codeHash: string;
  linkTokenHash: string;
  expiresAt: string;
  usedAt: string | null;
}
```

- [ ] **Step 2: `backend/src/db.ts` anlegen**

```ts
import postgres from "postgres";
import { config } from "./config.js";

// Eine Verbindung pro Prozess; Neon-pooled-URL verträgt Serverless.
export const sql = postgres(config.databaseUrl, {
  ssl: "require",
  max: 1,
  idle_timeout: 20,
});
```

- [ ] **Step 3: `migrations/001_init.sql` anlegen**

```sql
create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  role       text not null default 'member' check (role in ('admin','member')),
  status     text not null default 'pending' check (status in ('pending','active','disabled')),
  created_at timestamptz not null default now()
);

create table if not exists login_tokens (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  code_hash       text not null,
  link_token_hash text not null,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists login_tokens_email_idx on login_tokens (email);
```

- [ ] **Step 4: `scripts/migrate.ts` anlegen**

```ts
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "../migrations");

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });

const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  const text = readFileSync(path.join(dir, file), "utf8");
  console.log(`applying ${file} …`);
  await sql.unsafe(text);
}
console.log("migrations done");
await sql.end();
```

- [ ] **Step 5: Migration gegen Neon ausführen**

Voraussetzung: `DATABASE_URL` in `.env` gesetzt (Neon-Projekt „klara", Region Frankfurt).
Run: `npm run migrate`
Expected: `applying 001_init.sql …` und `migrations done`, kein Fehler.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db.ts backend/src/types.ts migrations scripts/migrate.ts
git commit -m "feat: db client + initial migration (users, login_tokens)"
```

---

## Task 6: Auth-Eligibility (reine Logik, TDD)

**Files:**
- Create: `backend/src/auth/eligibility.ts`
- Test: `backend/src/auth/eligibility.test.ts`

- [ ] **Step 1: Failing test schreiben**

`backend/src/auth/eligibility.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeEmail, isDomainAllowed, decideLoginAction } from "./eligibility.js";

describe("normalizeEmail", () => {
  it("trimmt und lowercased", () => {
    expect(normalizeEmail("  Kind@Grundschule-XY.de ")).toBe("kind@grundschule-xy.de");
  });
});

describe("isDomainAllowed", () => {
  const domains = ["grundschule-xy.de"];
  it("akzeptiert passende Domain", () => {
    expect(isDomainAllowed("kind@grundschule-xy.de", domains)).toBe(true);
  });
  it("lehnt fremde Domain ab", () => {
    expect(isDomainAllowed("kind@gmail.com", domains)).toBe(false);
  });
});

describe("decideLoginAction", () => {
  const domains = ["grundschule-xy.de"];
  it("aktiver Nutzer → send_login", () => {
    expect(decideLoginAction({ email: "a@grundschule-xy.de", allowedDomains: domains,
      existingUser: { status: "active" } }).action).toBe("send_login");
  });
  it("neuer Domain-Nutzer → create_pending", () => {
    expect(decideLoginAction({ email: "neu@grundschule-xy.de", allowedDomains: domains,
      existingUser: null }).action).toBe("create_pending");
  });
  it("bestehender pending → noop", () => {
    expect(decideLoginAction({ email: "p@grundschule-xy.de", allowedDomains: domains,
      existingUser: { status: "pending" } }).action).toBe("noop");
  });
  it("disabled → deny", () => {
    expect(decideLoginAction({ email: "d@grundschule-xy.de", allowedDomains: domains,
      existingUser: { status: "disabled" } }).action).toBe("deny");
  });
  it("fremde Domain ohne Account → deny", () => {
    expect(decideLoginAction({ email: "x@gmail.com", allowedDomains: domains,
      existingUser: null }).action).toBe("deny");
  });
});
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `npm --workspace backend run test -- eligibility`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: `backend/src/auth/eligibility.ts` implementieren**

```ts
import type { UserStatus } from "../types.js";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

export function isDomainAllowed(email: string, allowedDomains: string[]): boolean {
  return allowedDomains.includes(emailDomain(email));
}

export type LoginAction = "send_login" | "create_pending" | "noop" | "deny";

export interface EligibilityInput {
  email: string;
  allowedDomains: string[];
  existingUser: { status: UserStatus } | null;
}

/**
 * Entscheidet, was beim Login-Request passiert. Rein, ohne Seiteneffekte.
 * - active  → send_login (Mail mit Code/Link)
 * - pending → noop (wartet auf Admin, keine Mail)
 * - disabled→ deny
 * - kein Account, aber Domain erlaubt → create_pending
 * - kein Account, Domain nicht erlaubt → deny
 */
export function decideLoginAction(input: EligibilityInput): { action: LoginAction } {
  const { existingUser } = input;
  if (existingUser) {
    if (existingUser.status === "active") return { action: "send_login" };
    if (existingUser.status === "pending") return { action: "noop" };
    return { action: "deny" };
  }
  if (isDomainAllowed(input.email, input.allowedDomains)) return { action: "create_pending" };
  return { action: "deny" };
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `npm --workspace backend run test -- eligibility`
Expected: PASS (alle Cases grün).

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/eligibility.ts backend/src/auth/eligibility.test.ts
git commit -m "feat: auth eligibility (domain check + login action decision)"
```

---

## Task 7: Token-Erzeugung & -Vergleich (reine Logik, TDD)

**Files:**
- Create: `backend/src/auth/tokens.ts`
- Test: `backend/src/auth/tokens.test.ts`

- [ ] **Step 1: Failing test schreiben**

`backend/src/auth/tokens.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { generateCode, generateLinkToken, hashSecret, verifySecret } from "./tokens.js";

describe("generateCode", () => {
  it("liefert genau 6 Ziffern", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
});

describe("generateLinkToken", () => {
  it("liefert 64 Hex-Zeichen", () => {
    expect(generateLinkToken()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashSecret / verifySecret", () => {
  it("verifiziert korrektes Geheimnis", () => {
    const h = hashSecret("123456");
    expect(verifySecret("123456", h)).toBe(true);
  });
  it("lehnt falsches Geheimnis ab", () => {
    const h = hashSecret("123456");
    expect(verifySecret("000000", h)).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `npm --workspace backend run test -- tokens`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: `backend/src/auth/tokens.ts` implementieren**

```ts
import { randomInt, randomBytes, createHash, timingSafeEqual } from "node:crypto";

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function generateLinkToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifySecret(plain: string, hash: string): boolean {
  const a = Buffer.from(hashSecret(plain), "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `npm --workspace backend run test -- tokens`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/tokens.ts backend/src/auth/tokens.test.ts
git commit -m "feat: login token generation + hashing"
```

---

## Task 8: Auth-Service mit injizierten Interfaces (TDD mit Fakes)

**Files:**
- Create: `backend/src/auth/repo.ts` (nur Interface in diesem Task)
- Create: `backend/src/auth/mailer.ts` (nur Interface in diesem Task)
- Create: `backend/src/auth/service.ts`
- Test: `backend/src/auth/service.test.ts`

- [ ] **Step 1: Interfaces anlegen (`repo.ts` + `mailer.ts`, vorerst nur Typen)**

`backend/src/auth/repo.ts`:
```ts
import type { User, LoginTokenRow } from "../types.js";

export interface NewLoginToken {
  email: string;
  codeHash: string;
  linkTokenHash: string;
  expiresAt: Date;
}

export interface AuthRepo {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createPendingUser(email: string): Promise<User>;
  insertLoginToken(t: NewLoginToken): Promise<void>;
  /** Neuester, nicht verbrauchter, nicht abgelaufener Token für die E-Mail. */
  findLatestActiveToken(email: string): Promise<LoginTokenRow | null>;
  /** Token über den Link-Hash finden (der Link trägt keine E-Mail). */
  findActiveTokenByLinkHash(linkHash: string): Promise<LoginTokenRow | null>;
  markTokenUsed(id: string): Promise<void>;
}
```

`backend/src/auth/mailer.ts`:
```ts
export interface Mailer {
  sendLoginEmail(to: string, code: string, link: string): Promise<void>;
}
```

- [ ] **Step 2: Failing test schreiben (`service.test.ts`)**

`backend/src/auth/service.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { User, LoginTokenRow } from "../types.js";
import type { AuthRepo, NewLoginToken } from "./repo.js";
import type { Mailer } from "./mailer.js";
import { createAuthService } from "./service.js";

// --- In-Memory-Fakes ---
class FakeRepo implements AuthRepo {
  users: User[] = [];
  tokens: (LoginTokenRow & { _expires: Date })[] = [];
  seq = 0;
  async findUserByEmail(email: string) { return this.users.find((u) => u.email === email) ?? null; }
  async findUserById(id: string) { return this.users.find((u) => u.id === id) ?? null; }
  async createPendingUser(email: string) {
    const u: User = { id: `u${++this.seq}`, email, role: "member", status: "pending",
      createdAt: new Date(0).toISOString() };
    this.users.push(u); return u;
  }
  async insertLoginToken(t: NewLoginToken) {
    this.tokens.push({ id: `t${++this.seq}`, email: t.email, codeHash: t.codeHash,
      linkTokenHash: t.linkTokenHash, expiresAt: t.expiresAt.toISOString(), usedAt: null,
      _expires: t.expiresAt });
  }
  async findLatestActiveToken(email: string) {
    const now = Date.now();
    const list = this.tokens.filter((t) => t.email === email && !t.usedAt && t._expires.getTime() > now);
    return list.length ? list[list.length - 1] : null;
  }
  async findActiveTokenByLinkHash(linkHash: string) {
    const now = Date.now();
    const list = this.tokens.filter((t) => t.linkTokenHash === linkHash && !t.usedAt && t._expires.getTime() > now);
    return list.length ? list[list.length - 1] : null;
  }
  async markTokenUsed(id: string) {
    const t = this.tokens.find((x) => x.id === id); if (t) t.usedAt = new Date().toISOString();
  }
}
class FakeMailer implements Mailer {
  sent: { to: string; code: string; link: string }[] = [];
  async sendLoginEmail(to: string, code: string, link: string) { this.sent.push({ to, code, link }); }
}

const DOMAINS = ["grundschule-xy.de"];
function makeService(repo: AuthRepo, mailer: Mailer) {
  return createAuthService({ repo, mailer, allowedDomains: DOMAINS,
    tokenTtlMinutes: 15, appBaseUrl: "https://klara.test" });
}

describe("requestLogin", () => {
  let repo: FakeRepo; let mailer: FakeMailer;
  beforeEach(() => { repo = new FakeRepo(); mailer = new FakeMailer(); });

  it("aktiver Nutzer bekommt Mail mit 6-stelligem Code und Link", async () => {
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", createdAt: "x" });
    await makeService(repo, mailer).requestLogin("  A@Grundschule-XY.de ");
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe("a@grundschule-xy.de");
    expect(mailer.sent[0].code).toMatch(/^\d{6}$/);
    expect(mailer.sent[0].link).toContain("https://klara.test/api/auth/link?token=");
    expect(repo.tokens).toHaveLength(1);
  });

  it("neuer Domain-Nutzer wird pending angelegt, KEINE Mail", async () => {
    await makeService(repo, mailer).requestLogin("neu@grundschule-xy.de");
    expect(repo.users).toHaveLength(1);
    expect(repo.users[0].status).toBe("pending");
    expect(mailer.sent).toHaveLength(0);
  });

  it("fremde Domain: keine Mail, kein Nutzer", async () => {
    await makeService(repo, mailer).requestLogin("x@gmail.com");
    expect(repo.users).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("verifyCode", () => {
  let repo: FakeRepo; let mailer: FakeMailer;
  beforeEach(() => { repo = new FakeRepo(); mailer = new FakeMailer(); });

  it("korrekter Code eines aktiven Nutzers → User zurück, Token verbraucht", async () => {
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", createdAt: "x" });
    const svc = makeService(repo, mailer);
    await svc.requestLogin("a@grundschule-xy.de");
    const code = mailer.sent[0].code;
    const user = await svc.verifyCode("a@grundschule-xy.de", code);
    expect(user?.id).toBe("u1");
    expect(repo.tokens[0].usedAt).not.toBeNull();
  });

  it("falscher Code → null", async () => {
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", createdAt: "x" });
    const svc = makeService(repo, mailer);
    await svc.requestLogin("a@grundschule-xy.de");
    expect(await svc.verifyCode("a@grundschule-xy.de", "000000")).toBeNull();
  });

  it("verbrauchter Token kann nicht erneut genutzt werden", async () => {
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", createdAt: "x" });
    const svc = makeService(repo, mailer);
    await svc.requestLogin("a@grundschule-xy.de");
    const code = mailer.sent[0].code;
    await svc.verifyCode("a@grundschule-xy.de", code);
    expect(await svc.verifyCode("a@grundschule-xy.de", code)).toBeNull();
  });
});

describe("verifyLink", () => {
  it("gültiger Link-Token → User", async () => {
    const repo = new FakeRepo(); const mailer = new FakeMailer();
    repo.users.push({ id: "u1", email: "a@grundschule-xy.de", role: "member",
      status: "active", createdAt: "x" });
    const svc = makeService(repo, mailer);
    await svc.requestLogin("a@grundschule-xy.de");
    const token = new URL(mailer.sent[0].link).searchParams.get("token")!;
    const user = await svc.verifyLink(token);
    expect(user?.id).toBe("u1");
  });
});
```

- [ ] **Step 3: Test laufen lassen (muss fehlschlagen)**

Run: `npm --workspace backend run test -- service`
Expected: FAIL — `createAuthService` existiert nicht.

- [ ] **Step 4: `backend/src/auth/service.ts` implementieren**

```ts
import type { User } from "../types.js";
import type { AuthRepo } from "./repo.js";
import type { Mailer } from "./mailer.js";
import { normalizeEmail, decideLoginAction } from "./eligibility.js";
import { generateCode, generateLinkToken, hashSecret, verifySecret } from "./tokens.js";

export interface AuthServiceDeps {
  repo: AuthRepo;
  mailer: Mailer;
  allowedDomains: string[];
  tokenTtlMinutes: number;
  appBaseUrl: string;
}

export interface AuthService {
  requestLogin(rawEmail: string): Promise<void>;
  verifyCode(rawEmail: string, code: string): Promise<User | null>;
  verifyLink(linkToken: string): Promise<User | null>;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { repo, mailer, allowedDomains, tokenTtlMinutes, appBaseUrl } = deps;

  async function issueToken(email: string): Promise<void> {
    const code = generateCode();
    const linkToken = generateLinkToken();
    const expiresAt = new Date(Date.now() + tokenTtlMinutes * 60_000);
    await repo.insertLoginToken({
      email, codeHash: hashSecret(code), linkTokenHash: hashSecret(linkToken), expiresAt,
    });
    const link = `${appBaseUrl}/api/auth/link?token=${linkToken}`;
    await mailer.sendLoginEmail(email, code, link);
  }

  async function resolveActiveByToken(email: string, secret: string, field: "codeHash" | "linkTokenHash"): Promise<User | null> {
    const tok = await repo.findLatestActiveToken(email);
    if (!tok) return null;
    if (!verifySecret(secret, tok[field])) return null;
    await repo.markTokenUsed(tok.id);
    const user = await repo.findUserByEmail(email);
    if (!user || user.status !== "active") return null;
    return user;
  }

  return {
    async requestLogin(rawEmail) {
      const email = normalizeEmail(rawEmail);
      const existing = await repo.findUserByEmail(email);
      const { action } = decideLoginAction({
        email, allowedDomains, existingUser: existing ? { status: existing.status } : null,
      });
      if (action === "send_login") await issueToken(email);
      else if (action === "create_pending") await repo.createPendingUser(email);
      // noop / deny: bewusst nichts (kein Leak, keine Mail)
    },

    async verifyCode(rawEmail, code) {
      return resolveActiveByToken(normalizeEmail(rawEmail), code, "codeHash");
    },

    async verifyLink(linkToken) {
      const tok = await repo.findActiveTokenByLinkHash(hashSecret(linkToken));
      if (!tok) return null;
      await repo.markTokenUsed(tok.id);
      const user = await repo.findUserByEmail(tok.email);
      if (!user || user.status !== "active") return null;
      return user;
    },
  };
}
```

- [ ] **Step 5: Test laufen lassen (muss bestehen)**

Run: `npm --workspace backend run test -- service`
Expected: PASS (requestLogin-, verifyCode-, verifyLink-Cases grün).

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/service.ts backend/src/auth/service.test.ts backend/src/auth/repo.ts backend/src/auth/mailer.ts
git commit -m "feat: auth service (requestLogin/verifyCode/verifyLink) with injected repo+mailer"
```

---

## Task 9: Postgres-Implementierung von AuthRepo

**Files:**
- Modify: `backend/src/auth/repo.ts` (Implementierung ergänzen)

- [ ] **Step 1: Postgres-`AuthRepo` implementieren**

Ergänze in `backend/src/auth/repo.ts` (unter den Interfaces):
```ts
import { sql } from "../db.js";
import type { User } from "../types.js";

function mapUser(r: any): User {
  return { id: r.id, email: r.email, role: r.role, status: r.status,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at) };
}

export function createPostgresAuthRepo(): AuthRepo {
  return {
    async findUserByEmail(email) {
      const rows = await sql`select * from users where email = ${email} limit 1`;
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async findUserById(id) {
      const rows = await sql`select * from users where id = ${id} limit 1`;
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async createPendingUser(email) {
      const rows = await sql`insert into users (email, status) values (${email}, 'pending') returning *`;
      return mapUser(rows[0]);
    },
    async insertLoginToken(t) {
      await sql`insert into login_tokens (email, code_hash, link_token_hash, expires_at)
                values (${t.email}, ${t.codeHash}, ${t.linkTokenHash}, ${t.expiresAt})`;
    },
    async findLatestActiveToken(email) {
      const rows = await sql`select * from login_tokens
        where email = ${email} and used_at is null and expires_at > now()
        order by created_at desc limit 1`;
      return rows[0] ? mapToken(rows[0]) : null;
    },
    async findActiveTokenByLinkHash(linkHash) {
      const rows = await sql`select * from login_tokens
        where link_token_hash = ${linkHash} and used_at is null and expires_at > now()
        order by created_at desc limit 1`;
      return rows[0] ? mapToken(rows[0]) : null;
    },
    async markTokenUsed(id) {
      await sql`update login_tokens set used_at = now() where id = ${id}`;
    },
  };
}

function mapToken(r: any) {
  return { id: r.id, email: r.email, codeHash: r.code_hash, linkTokenHash: r.link_token_hash,
    expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : String(r.expires_at),
    usedAt: r.used_at ? String(r.used_at) : null };
}
```

- [ ] **Step 2: Build prüfen (Typen passen)**

Run: `npm --workspace backend run build`
Expected: Kompiliert ohne Fehler. (Der `FakeRepo` in `service.test.ts` implementiert `findActiveTokenByLinkHash` bereits, daher erfüllt auch er das vollständige `AuthRepo`-Interface.)

- [ ] **Step 3: Bestehende Tests laufen lassen (kein Regress)**

Run: `npm --workspace backend run test`
Expected: PASS (alle bisherigen Suites grün).

- [ ] **Step 4: Commit**

```bash
git add backend/src/auth/repo.ts
git commit -m "feat: postgres implementation of AuthRepo"
```

---

## Task 10: SES-Implementierung von Mailer

**Files:**
- Modify: `backend/src/auth/mailer.ts` (Implementierung ergänzen)

- [ ] **Step 1: SES-`Mailer` implementieren**

Ergänze in `backend/src/auth/mailer.ts`:
```ts
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { config } from "../config.js";

export function createSesMailer(): Mailer {
  const client = new SESv2Client({
    region: config.ses.region,
    credentials: { accessKeyId: config.ses.accessKeyId, secretAccessKey: config.ses.secretAccessKey },
  });
  return {
    async sendLoginEmail(to, code, link) {
      const text =
        `Hallo!\n\nDein Anmelde-Code für KlaRa lautet: ${code}\n\n` +
        `Oder klick einfach diesen Link auf demselben Gerät:\n${link}\n\n` +
        `Der Code gilt ${config.tokenTtlMinutes} Minuten. ` +
        `Wenn du das nicht warst, ignorier diese Mail einfach.\n`;
      const html =
        `<p>Hallo!</p><p>Dein Anmelde-Code für <b>KlaRa</b> lautet:</p>` +
        `<p style="font-size:28px;letter-spacing:4px;"><b>${code}</b></p>` +
        `<p>Oder <a href="${link}">hier klicken</a> (gleiches Gerät).</p>` +
        `<p style="color:#888">Gilt ${config.tokenTtlMinutes} Minuten.</p>`;
      await client.send(new SendEmailCommand({
        FromEmailAddress: config.ses.fromAddress,
        Destination: { ToAddresses: [to] },
        Content: { Simple: {
          Subject: { Data: "Dein KlaRa-Anmelde-Code" },
          Body: { Text: { Data: text }, Html: { Data: html } },
        } },
      }));
    },
  };
}

/** Dev-Fallback: schreibt die Mail in die Konsole statt sie zu versenden. */
export function createConsoleMailer(): Mailer {
  return {
    async sendLoginEmail(to, code, link) {
      console.log(`[MAIL→${to}] Code ${code}  Link ${link}`);
    },
  };
}
```

- [ ] **Step 2: Build prüfen**

Run: `npm --workspace backend run build`
Expected: Kompiliert ohne Fehler.

- [ ] **Step 3: Commit**

```bash
git add backend/src/auth/mailer.ts
git commit -m "feat: SES mailer + console fallback for login emails"
```

---

## Task 11: Auth-Routen + Session-Cookie + Verdrahtung in server.ts

**Files:**
- Create: `backend/src/auth/routes.ts`
- Modify: `backend/src/server.ts` (defaultRuntime + Routen registrieren)
- Test: `backend/src/auth/routes.test.ts`

- [ ] **Step 1: Failing test schreiben (`routes.test.ts`, nutzt Fastify `.inject()` mit Fake-Service)**

`backend/src/auth/routes.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { User } from "../types.js";
import type { AuthService } from "./service.js";
import { registerAuthRoutes } from "./routes.js";

function fakeService(over: Partial<AuthService> = {}): AuthService {
  return {
    requestLogin: async () => {},
    verifyCode: async () => null,
    verifyLink: async () => null,
    ...over,
  };
}
const ACTIVE: User = { id: "u1", email: "a@grundschule-xy.de", role: "admin",
  status: "active", createdAt: "x" };

async function makeApp(svc: AuthService, lookup: (id: string) => Promise<User | null>) {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: "test-secret" });
  registerAuthRoutes(app, { service: svc, findUserById: lookup,
    sessionSecret: "test-secret", sessionMaxDays: 30, isProd: false });
  await app.ready();
  return app;
}

describe("POST /api/auth/request", () => {
  it("antwortet generisch 200, egal ob berechtigt", async () => {
    const app = await makeApp(fakeService(), async () => null);
    const res = await app.inject({ method: "POST", url: "/api/auth/request",
      payload: { email: "x@gmail.com" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("POST /api/auth/verify", () => {
  it("falscher Code → 401, kein Cookie", async () => {
    const app = await makeApp(fakeService({ verifyCode: async () => null }), async () => null);
    const res = await app.inject({ method: "POST", url: "/api/auth/verify",
      payload: { email: "a@grundschule-xy.de", code: "000000" } });
    expect(res.statusCode).toBe(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("korrekter Code → 200 + Session-Cookie", async () => {
    const app = await makeApp(fakeService({ verifyCode: async () => ACTIVE }), async () => ACTIVE);
    const res = await app.inject({ method: "POST", url: "/api/auth/verify",
      payload: { email: "a@grundschule-xy.de", code: "123456" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe("a@grundschule-xy.de");
    expect(String(res.headers["set-cookie"])).toContain("klara_session=");
  });
});

describe("GET /api/me", () => {
  it("ohne Cookie → 401", async () => {
    const app = await makeApp(fakeService(), async () => null);
    const res = await app.inject({ method: "GET", url: "/api/me" });
    expect(res.statusCode).toBe(401);
  });

  it("mit gültiger Session → aktueller User", async () => {
    const app = await makeApp(fakeService({ verifyCode: async () => ACTIVE }), async () => ACTIVE);
    const login = await app.inject({ method: "POST", url: "/api/auth/verify",
      payload: { email: "a@grundschule-xy.de", code: "123456" } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const res = await app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe("u1");
  });
});
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `npm --workspace backend run test -- routes`
Expected: FAIL — `registerAuthRoutes` existiert nicht.

- [ ] **Step 3: `backend/src/auth/routes.ts` implementieren**

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { User } from "../types.js";
import type { AuthService } from "./service.js";

const COOKIE = "klara_session";

export interface AuthRoutesDeps {
  service: AuthService;
  findUserById: (id: string) => Promise<User | null>;
  sessionSecret: string;
  sessionMaxDays: number;
  isProd: boolean;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  const { service, findUserById, sessionMaxDays, isProd } = deps;

  function setSession(reply: FastifyReply, userId: string) {
    reply.setCookie(COOKIE, userId, {
      path: "/", httpOnly: true, sameSite: "lax", secure: isProd, signed: true,
      maxAge: sessionMaxDays * 24 * 60 * 60,
    });
  }

  async function currentUser(req: FastifyRequest): Promise<User | null> {
    const raw = req.cookies[COOKIE];
    if (!raw) return null;
    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return null;
    const user = await findUserById(unsigned.value);
    if (!user || user.status !== "active") return null;
    return user;
  }

  app.post<{ Body: { email?: string } }>("/api/auth/request", async (req, reply) => {
    const email = req.body?.email;
    if (email) await service.requestLogin(email);
    return reply.send({ ok: true }); // immer generisch, kein Enumeration-Leak
  });

  app.post<{ Body: { email?: string; code?: string } }>("/api/auth/verify", async (req, reply) => {
    const { email, code } = req.body ?? {};
    if (!email || !code) return reply.code(400).send({ error: "missing" });
    const user = await service.verifyCode(email, code);
    if (!user) return reply.code(401).send({ error: "invalid" });
    setSession(reply, user.id);
    return reply.send({ user });
  });

  app.get<{ Querystring: { token?: string } }>("/api/auth/link", async (req, reply) => {
    const token = req.query.token;
    const user = token ? await service.verifyLink(token) : null;
    if (!user) return reply.redirect("/?login=fehlgeschlagen");
    setSession(reply, user.id);
    return reply.redirect("/");
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/api/me", async (req, reply) => {
    const user = await currentUser(req);
    if (!user) return reply.code(401).send({ error: "unauthenticated" });
    return reply.send({ user });
  });
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `npm --workspace backend run test -- routes`
Expected: PASS.

- [ ] **Step 5: `server.ts` verdrahten (`defaultRuntime` + Routen registrieren)**

Ergänze in `backend/src/server.ts` die Imports und `defaultRuntime` und nutze `registerRoutes`:
```ts
import { config } from "./config.js";
import { createAuthService } from "./auth/service.js";
import { createPostgresAuthRepo } from "./auth/repo.js";
import { createSesMailer, createConsoleMailer } from "./auth/mailer.js";
import { registerAuthRoutes } from "./auth/routes.js";

/** Baut die echten Adapter und liefert BuildOptions für buildApp(). */
export async function defaultRuntime(): Promise<BuildOptions> {
  const repo = createPostgresAuthRepo();
  const mailer = config.ses.fromAddress && config.ses.accessKeyId
    ? createSesMailer() : createConsoleMailer();
  const service = createAuthService({
    repo, mailer, allowedDomains: config.allowedDomains,
    tokenTtlMinutes: config.tokenTtlMinutes, appBaseUrl: config.appBaseUrl,
  });
  return {
    registerRoutes(app) {
      registerAuthRoutes(app, {
        service, findUserById: (id) => repo.findUserById(id),
        sessionSecret: config.sessionSecret, sessionMaxDays: config.sessionMaxDays,
        isProd: config.nodeEnv === "production",
      });
    },
  };
}
```

Ändere den lokalen Listener am Dateiende, damit er die echten Routen lädt:
```ts
if (isDirectRun) {
  const port = Number(process.env.PORT ?? 3000);
  defaultRuntime()
    .then((rt) => buildApp(rt))
    .then((app) => app.listen({ port, host: "0.0.0.0" }))
    .then(() => console.log(`KlaRa backend on :${port}`))
    .catch((err) => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 6: Voller Build + Testlauf**

Run: `npm --workspace backend run build && npm --workspace backend run test`
Expected: Build grün, alle Tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth/routes.ts backend/src/auth/routes.test.ts backend/src/server.ts
git commit -m "feat: auth routes + session cookie, wired into server runtime"
```

---

## Task 12: Seed-Skript für Erst-Admin

**Files:**
- Create: `scripts/seed-admin.ts`

- [ ] **Step 1: `scripts/seed-admin.ts` anlegen**

```ts
import postgres from "postgres";
import "dotenv/config";

const email = (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase();
if (!email) { console.error("INITIAL_ADMIN_EMAIL nicht gesetzt"); process.exit(1); }

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });

await sql`
  insert into users (email, role, status) values (${email}, 'admin', 'active')
  on conflict (email) do update set role = 'admin', status = 'active'
`;
console.log(`Erst-Admin gesetzt: ${email}`);
await sql.end();
```

- [ ] **Step 2: Seed ausführen und prüfen**

Run: `npm run seed:admin`
Expected: `Erst-Admin gesetzt: <deine INITIAL_ADMIN_EMAIL>`.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-admin.ts
git commit -m "feat: seed initial admin script"
```

---

## Task 13: Frontend Login-Flow + eingeloggte Ansicht

**Files:**
- Create: `frontend/src/api.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: `frontend/src/api.ts` anlegen**

```ts
export interface Me { id: string; email: string; role: "admin" | "member"; status: string; }

async function jsonOrNull(res: Response): Promise<any> {
  if (!res.ok) return null;
  return res.json();
}

export const api = {
  async me(): Promise<Me | null> {
    const data = await jsonOrNull(await fetch("/api/me"));
    return data?.user ?? null;
  },
  async requestLogin(email: string): Promise<void> {
    await fetch("/api/auth/request", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
  },
  async verify(email: string, code: string): Promise<Me | null> {
    const data = await jsonOrNull(await fetch("/api/auth/verify", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code }) }));
    return data?.user ?? null;
  },
  async logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
  },
};
```

- [ ] **Step 2: `frontend/src/App.tsx` ersetzen (Login-Flow)**

```tsx
import { useEffect, useState } from "react";
import { api, type Me } from "./api";

type Stage = "loading" | "email" | "code" | "in";

export function App() {
  const [stage, setStage] = useState<Stage>("loading");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.me().then((u) => { if (u) { setMe(u); setStage("in"); } else setStage("email"); });
  }, []);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    await api.requestLogin(email);
    setBusy(false); setStage("code");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    const u = await api.verify(email, code.trim());
    setBusy(false);
    if (u) { setMe(u); setStage("in"); }
    else setErr("Code stimmt nicht oder ist abgelaufen.");
  }

  async function logout() { await api.logout(); setMe(null); setEmail(""); setCode(""); setStage("email"); }

  if (stage === "loading") return <main className="card"><p>Lädt …</p></main>;

  if (stage === "in" && me) return (
    <main className="card">
      <h1>KlaRa</h1>
      <p>Angemeldet als <b>{me.email}</b>{me.role === "admin" ? " (Lehrerin/Admin)" : ""}.</p>
      <button onClick={logout}>Abmelden</button>
    </main>
  );

  if (stage === "code") return (
    <main className="card">
      <h1>KlaRa</h1>
      <p className="muted">Wir haben dir eine Mail geschickt — falls deine Adresse freigeschaltet ist.
        Gib den 6-stelligen Code ein (oder klick den Link in der Mail).</p>
      <form onSubmit={submitCode}>
        <input inputMode="numeric" autoComplete="one-time-code" placeholder="6-stelliger Code"
          value={code} onChange={(e) => setCode(e.target.value)} />
        <button disabled={busy || code.trim().length < 6}>Anmelden</button>
      </form>
      {err && <p className="err">{err}</p>}
      <button onClick={() => setStage("email")} style={{ background: "transparent", color: "#5b3fb0" }}>
        Andere Adresse</button>
    </main>
  );

  return (
    <main className="card">
      <h1>KlaRa</h1>
      <p className="muted">Melde dich mit deiner Schul-E-Mail an. Du bekommst einen Code per Mail.</p>
      <form onSubmit={submitEmail}>
        <input type="email" autoComplete="email" placeholder="name@grundschule-xy.de"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <button disabled={busy || !email.includes("@")}>Code anfordern</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: End-to-End lokal prüfen (Console-Mailer)**

Voraussetzung: `.env` mit gültiger `DATABASE_URL`; `SES_*`/`AWS_*` leer lassen → Console-Mailer aktiv. Migration + Seed gelaufen.
Run: `npm run build && node backend/dist/server.js`
Dann im Browser `http://localhost:3000`:
1. Mit der Seed-Admin-Adresse „Code anfordern".
2. Code aus der **Server-Konsole** (`[MAIL→…] Code 123456`) eingeben.
3. Erwartung: „Angemeldet als <admin> (Lehrerin/Admin)". Reload bleibt eingeloggt. „Abmelden" führt zurück zum Login.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.ts frontend/src/App.tsx
git commit -m "feat: frontend login flow (email -> code -> session)"
```

---

## Task 14: README + Deploy-Notiz

**Files:**
- Create: `README.md`
- Modify: `CLAUDE.md` (kurzer Repo-Leitfaden, optional)

- [ ] **Step 1: `README.md` anlegen**

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: readme with local + deploy instructions"
```

---

## Definition of Done (Plan 1)

- [ ] `npm --workspace backend run test` ist vollständig grün (config, eligibility, tokens, service, routes).
- [ ] `npm run build` baut Frontend + Backend ohne Fehler.
- [ ] Lokal: Seed-Admin kann sich per Code anmelden, bleibt über Reload eingeloggt, kann sich abmelden.
- [ ] `/healthz` liefert `{ ok: true }`.
- [ ] Fremde Domain / pending / disabled erhalten **keine** funktionierende Anmeldung.
- [ ] Alles committet.

**Nicht in Plan 1 (kommt in Plan 2):** Admin-UI zum Bestätigen von `pending`-Nutzern und Hinzufügen/Verwalten von Mitgliedern, Ordner, Upload, Freigabe. In Plan 1 meldet sich nur der geseedete Admin an; das ist die testbare Grundlage.
```
