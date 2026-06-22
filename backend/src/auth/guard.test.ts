import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { User } from "../types.js";
import { makeGuards } from "./guard.js";

const ACTIVE_MEMBER: User = {
  id: "u-member",
  email: "member@grundschule.de",
  role: "member",
  status: "active",
  createdAt: "2024-01-01",
};

const ACTIVE_ADMIN: User = {
  id: "u-admin",
  email: "admin@grundschule.de",
  role: "admin",
  status: "active",
  createdAt: "2024-01-01",
};

const DISABLED_USER: User = {
  id: "u-disabled",
  email: "disabled@grundschule.de",
  role: "member",
  status: "disabled",
  createdAt: "2024-01-01",
};

const TEST_SECRET = "test-guard-secret";

async function makeApp(findUserById: (id: string) => Promise<User | null>) {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: TEST_SECRET });
  const { requireUser, requireAdmin } = makeGuards(findUserById);

  // Protected member-only route
  app.get("/api/protected", { preHandler: requireUser }, async (req) => {
    return { userId: (req as Record<string, unknown> & typeof req).user };
  });

  // Protected admin-only route
  app.get("/api/admin-only", { preHandler: requireAdmin }, async () => {
    return { ok: true };
  });

  await app.ready();
  return app;
}

async function getSignedCookieHeader(app: Awaited<ReturnType<typeof makeApp>>, userId: string): Promise<string> {
  // Set a cookie via a helper route, then extract the signed value
  const tmpApp = Fastify();
  await tmpApp.register(fastifyCookie, { secret: TEST_SECRET });
  tmpApp.get("/set", async (_req, reply) => {
    reply.setCookie("klara_session", userId, { signed: true, path: "/" });
    return { ok: true };
  });
  await tmpApp.ready();
  const res = await tmpApp.inject({ method: "GET", url: "/set" });
  const cookieHeader = String(res.headers["set-cookie"]).split(";")[0];
  return cookieHeader;
}

describe("requireUser", () => {
  it("returns 401 without any cookie", async () => {
    const app = await makeApp(async () => null);
    const res = await app.inject({ method: "GET", url: "/api/protected" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthenticated" });
  });

  it("returns 200 and attaches user for active member with valid signed cookie", async () => {
    const app = await makeApp(async (id) => id === ACTIVE_MEMBER.id ? ACTIVE_MEMBER : null);
    const cookie = await getSignedCookieHeader(app, ACTIVE_MEMBER.id);
    const res = await app.inject({ method: "GET", url: "/api/protected", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toMatchObject({ id: ACTIVE_MEMBER.id });
  });

  it("returns 401 for a disabled user even with a valid signed cookie", async () => {
    const app = await makeApp(async (id) => id === DISABLED_USER.id ? DISABLED_USER : null);
    const cookie = await getSignedCookieHeader(app, DISABLED_USER.id);
    const res = await app.inject({ method: "GET", url: "/api/protected", headers: { cookie } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthenticated" });
  });
});

describe("requireAdmin", () => {
  it("returns 401 without cookie", async () => {
    const app = await makeApp(async () => null);
    const res = await app.inject({ method: "GET", url: "/api/admin-only" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthenticated" });
  });

  it("returns 403 for active member hitting an admin route", async () => {
    const app = await makeApp(async (id) => id === ACTIVE_MEMBER.id ? ACTIVE_MEMBER : null);
    const cookie = await getSignedCookieHeader(app, ACTIVE_MEMBER.id);
    const res = await app.inject({ method: "GET", url: "/api/admin-only", headers: { cookie } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden" });
  });

  it("returns 200 for active admin", async () => {
    const app = await makeApp(async (id) => id === ACTIVE_ADMIN.id ? ACTIVE_ADMIN : null);
    const cookie = await getSignedCookieHeader(app, ACTIVE_ADMIN.id);
    const res = await app.inject({ method: "GET", url: "/api/admin-only", headers: { cookie } });
    expect(res.statusCode).toBe(200);
  });
});
