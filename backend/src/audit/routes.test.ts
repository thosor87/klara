import { describe, it, expect, vi } from "vitest";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { User } from "../types.js";
import type { AuditRepo, AuditEntry } from "./repo.js";
import { registerAuditRoutes } from "./routes.js";

const ADMIN: User = { id: "a1", email: "a@x.de", role: "admin", status: "active", classId: null, createdAt: "x" };
const MEMBER: User = { id: "m1", email: "m@x.de", role: "member", status: "active", classId: null, createdAt: "x" };

const ENTRY: AuditEntry = { id: "e1", actorEmail: "a@x.de", action: "login", summary: "angemeldet", createdAt: "x" };

function fakeAuditRepo(over: Partial<AuditRepo> = {}): AuditRepo {
  return { log: async () => {}, list: async () => [ENTRY], ...over };
}

async function makeApp(repo: AuditRepo, user: User | null) {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: "test" });
  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!user) { await reply.code(401).send({ error: "unauth" }); return; }
    if (user.role !== "admin") { await reply.code(403).send({ error: "forbidden" }); return; }
    req.user = user;
  };
  registerAuditRoutes(app, { auditRepo: repo, requireAdmin });
  await app.ready();
  return app;
}

describe("GET /api/admin/audit", () => {
  it("admin → 200 + entries", async () => {
    const app = await makeApp(fakeAuditRepo(), ADMIN);
    const res = await app.inject({ method: "GET", url: "/api/admin/audit" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([ENTRY]);
  });

  it("passes the limit through (default 200)", async () => {
    const list = vi.fn(async () => [ENTRY]);
    const app = await makeApp(fakeAuditRepo({ list }), ADMIN);
    await app.inject({ method: "GET", url: "/api/admin/audit?limit=500" });
    expect(list).toHaveBeenCalledWith(500);
    await app.inject({ method: "GET", url: "/api/admin/audit" });
    expect(list).toHaveBeenCalledWith(200);
  });

  it("non-admin → 403", async () => {
    const app = await makeApp(fakeAuditRepo(), MEMBER);
    const res = await app.inject({ method: "GET", url: "/api/admin/audit" });
    expect(res.statusCode).toBe(403);
  });
});
