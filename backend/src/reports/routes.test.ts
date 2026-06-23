import { describe, it, expect, vi } from "vitest";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { User } from "../types.js";
import type { ReportsService, ReportAdminItem } from "./service.js";
import { AppError } from "./service.js";
import { registerReportRoutes } from "./routes.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER: User = {
  id: "u-member",
  email: "member@grundschule.de",
  role: "member",
  status: "active",
  classId: null,
  createdAt: "2024-01-01",
};

const ADMIN: User = {
  id: "u-admin",
  email: "admin@grundschule.de",
  role: "admin",
  status: "active",
  classId: null,
  createdAt: "2024-01-01",
};

const ADMIN_REPORT: ReportAdminItem = {
  id: "r1",
  itemId: "item1",
  reason: "Unangemessener Inhalt",
  status: "open",
  response: "",
  createdAt: "2024-01-02",
  folderName: "Klasse 3b",
  reportedByEmail: "reporter@grundschule.de",
  thumbUrl: "https://s3.example.com/thumb",
  webUrl: "https://s3.example.com/web",
};

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function fakeReportsService(over: Partial<ReportsService> = {}): ReportsService {
  return {
    report: async () => ({ ok: true }),
    listForAdmin: async () => [],
    ignore: async () => ({ ok: true }),
    answer: async () => ({ ok: true }),
    delete: async () => ({ ok: true }),
    ...over,
  };
}

async function makeApp(svc: ReportsService, user: User | null) {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: "test-secret" });

  const requireUser = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!user) { await reply.code(401).send({ error: "unauthenticated" }); return; }
    req.user = user;
  };

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!user) { await reply.code(401).send({ error: "unauthenticated" }); return; }
    if (user.role !== "admin") { await reply.code(403).send({ error: "forbidden" }); return; }
    req.user = user;
  };

  registerReportRoutes(app, { reportsService: svc, requireUser, requireAdmin });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// POST /api/items/:itemId/reports
// ---------------------------------------------------------------------------

describe("POST /api/items/:itemId/reports", () => {
  it("member reports an approved item → 201 { ok: true }", async () => {
    const app = await makeApp(fakeReportsService(), MEMBER);

    const res = await app.inject({
      method: "POST",
      url: "/api/items/item1/reports",
      payload: { reason: "Unangemessener Inhalt" },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ ok: true });
  });

  it("missing reason → 400", async () => {
    const app = await makeApp(fakeReportsService(), MEMBER);

    const res = await app.inject({
      method: "POST",
      url: "/api/items/item1/reports",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "reason is required" });
  });

  it("item_not_found → 404", async () => {
    const svc = fakeReportsService({
      report: async () => { throw new AppError("item_not_found", "not found"); },
    });
    const app = await makeApp(svc, MEMBER);

    const res = await app.inject({
      method: "POST",
      url: "/api/items/missing/reports",
      payload: { reason: "reason" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "item_not_found" });
  });

  it("unauthenticated → 401", async () => {
    const app = await makeApp(fakeReportsService(), null);

    const res = await app.inject({
      method: "POST",
      url: "/api/items/item1/reports",
      payload: { reason: "reason" },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/reports
// ---------------------------------------------------------------------------

describe("GET /api/admin/reports", () => {
  it("admin → 200 + report list", async () => {
    const svc = fakeReportsService({ listForAdmin: async () => [ADMIN_REPORT] });
    const app = await makeApp(svc, ADMIN);

    const res = await app.inject({ method: "GET", url: "/api/admin/reports" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].id).toBe("r1");
  });

  it("member → 403", async () => {
    const app = await makeApp(fakeReportsService(), MEMBER);

    const res = await app.inject({ method: "GET", url: "/api/admin/reports" });

    expect(res.statusCode).toBe(403);
  });

  it("unauthenticated → 401", async () => {
    const app = await makeApp(fakeReportsService(), null);

    const res = await app.inject({ method: "GET", url: "/api/admin/reports" });

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/reports/:id
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/reports/:id", () => {
  it("action=ignore → 200 { ok: true }", async () => {
    const ignore = vi.fn(async () => ({ ok: true as const }));
    const svc = fakeReportsService({ ignore });
    const app = await makeApp(svc, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/reports/r1",
      payload: { action: "ignore" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(ignore).toHaveBeenCalledWith("r1");
  });

  it("action=answer with response text → 200 { ok: true }", async () => {
    const answer = vi.fn(async () => ({ ok: true as const }));
    const svc = fakeReportsService({ answer });
    const app = await makeApp(svc, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/reports/r1",
      payload: { action: "answer", response: "Danke, haben wir geprüft." },
    });

    expect(res.statusCode).toBe(200);
    expect(answer).toHaveBeenCalledWith("r1", "Danke, haben wir geprüft.");
  });

  it("action=answer without response → 400", async () => {
    const app = await makeApp(fakeReportsService(), ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/reports/r1",
      payload: { action: "answer" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("action=delete → 200 { ok: true } (sets report + item trashed)", async () => {
    const deleteFn = vi.fn(async () => ({ ok: true as const }));
    const svc = fakeReportsService({ delete: deleteFn });
    const app = await makeApp(svc, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/reports/r1",
      payload: { action: "delete" },
    });

    expect(res.statusCode).toBe(200);
    expect(deleteFn).toHaveBeenCalledWith("r1");
  });

  it("missing action → 400", async () => {
    const app = await makeApp(fakeReportsService(), ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/reports/r1",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("report_not_found → 404", async () => {
    const svc = fakeReportsService({
      ignore: async () => { throw new AppError("report_not_found", "not found"); },
    });
    const app = await makeApp(svc, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/reports/missing",
      payload: { action: "ignore" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "report_not_found" });
  });

  it("member → 403", async () => {
    const app = await makeApp(fakeReportsService(), MEMBER);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/reports/r1",
      payload: { action: "ignore" },
    });

    expect(res.statusCode).toBe(403);
  });
});
