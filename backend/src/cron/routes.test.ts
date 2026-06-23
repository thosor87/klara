import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { ItemsRepo, ItemWithFolderName, TrashedS3Keys } from "../items/repo.js";
import type { ReportsRepo } from "../reports/repo.js";
import type { Storage } from "../storage/s3.js";
import type { Mailer, DigestData } from "../auth/mailer.js";
import type { AuthRepo, NewLoginToken } from "../auth/repo.js";
import type { User, UserRole, UserStatus, LoginTokenRow } from "../types.js";
import { registerCronRoutes } from "./routes.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN: User = {
  id: "u-admin",
  email: "admin@grundschule.de",
  role: "admin",
  status: "active",
  createdAt: "2024-01-01",
};

const CRON_SECRET = "test-cron-secret-xyz";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function fakeItemsRepo(overrides: Partial<ItemsRepo> = {}): ItemsRepo {
  return {
    insertPending: async () => null,
    listByFolder: async () => [],
    listForMember: async () => [],
    listPending: async () => [],
    setStatusApproved: async () => 0,
    setStatusTrashed: async () => 0,
    setStatusPending: async () => 0,
    findById: async () => null,
    deleteById: async () => null,
    listTrashed: async () => [],
    restore: async () => true,
    countPending: async () => 0,
    purgeTrashed: async () => [],
    trashItemById: async () => true,
    uploadCountsByUser: async () => ({}),
    ...overrides,
  };
}

function fakeReportsRepo(overrides: Partial<ReportsRepo> = {}): ReportsRepo {
  return {
    create: async () => ({
      id: "r1", itemId: "i1", reason: "", reportedBy: null,
      status: "open", response: "", createdAt: "x", trashedAt: null,
    }),
    listForAdmin: async () => [],
    findById: async () => null,
    setIgnored: async () => true,
    setAnswered: async () => true,
    setTrashed: async () => true,
    countOpen: async () => 0,
    purgeTrashed: async () => 0,
    ...overrides,
  };
}

function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  return {
    presignPut: async (key) => `https://s3.example.com/put/${key}`,
    presignGet: async (key) => `https://s3.example.com/get/${key}`,
    headExists: async () => true,
    deleteObjects: async () => {},
    ...overrides,
  };
}

function fakeMailer(overrides: Partial<Mailer> = {}): Mailer {
  return {
    sendLoginEmail: async () => {},
    sendDigest: async () => {},
    ...overrides,
  };
}

function fakeAuthRepo(overrides: Partial<AuthRepo> = {}): AuthRepo {
  return {
    findUserByEmail: async () => null,
    findUserById: async () => null,
    createPendingUser: async (email) => ({ id: "u1", email, role: "member", status: "pending", createdAt: "x" }),
    insertLoginToken: async () => {},
    findLatestActiveToken: async () => null,
    findActiveTokenByLinkHash: async () => null,
    markTokenUsed: async () => {},
    incrementCodeAttempts: async () => {},
    listUsers: async () => [],
    upsertActiveUser: async (email, role) => ({ id: "u1", email, role, status: "active", createdAt: "x" }),
    updateUser: async () => null,
    listAdminEmails: async () => [],
    ...overrides,
  };
}

async function makeApp(
  itemsRepo: ItemsRepo,
  reportsRepo: ReportsRepo,
  storage: Storage,
  mailer: Mailer,
  authRepo: AuthRepo,
  cronSecretOverride = CRON_SECRET,
) {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: "test-secret" });
  registerCronRoutes(app, {
    itemsRepo,
    reportsRepo,
    storage,
    mailer,
    authRepo,
    cronSecret: cronSecretOverride,
    trashRetentionDays: 30,
  });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Cron auth — 401 without / with wrong bearer
// ---------------------------------------------------------------------------

describe("cron auth", () => {
  it("GET /api/cron/purge without auth → 401", async () => {
    const app = await makeApp(fakeItemsRepo(), fakeReportsRepo(), fakeStorage(), fakeMailer(), fakeAuthRepo());
    const res = await app.inject({ method: "GET", url: "/api/cron/purge" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/cron/purge with wrong bearer → 401", async () => {
    const app = await makeApp(fakeItemsRepo(), fakeReportsRepo(), fakeStorage(), fakeMailer(), fakeAuthRepo());
    const res = await app.inject({
      method: "GET",
      url: "/api/cron/purge",
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/cron/digest without auth → 401", async () => {
    const app = await makeApp(fakeItemsRepo(), fakeReportsRepo(), fakeStorage(), fakeMailer(), fakeAuthRepo());
    const res = await app.inject({ method: "GET", url: "/api/cron/digest" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/cron/digest with wrong bearer → 401", async () => {
    const app = await makeApp(fakeItemsRepo(), fakeReportsRepo(), fakeStorage(), fakeMailer(), fakeAuthRepo());
    const res = await app.inject({
      method: "GET",
      url: "/api/cron/digest",
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("empty cronSecret always returns 401", async () => {
    const app = await makeApp(fakeItemsRepo(), fakeReportsRepo(), fakeStorage(), fakeMailer(), fakeAuthRepo(), "");
    const res = await app.inject({
      method: "GET",
      url: "/api/cron/purge",
      headers: { authorization: "Bearer " },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/cron/purge
// ---------------------------------------------------------------------------

describe("GET /api/cron/purge", () => {
  it("correct bearer → 200 { purgedItems, purgedReports }", async () => {
    const app = await makeApp(fakeItemsRepo(), fakeReportsRepo(), fakeStorage(), fakeMailer(), fakeAuthRepo());
    const res = await app.inject({
      method: "GET",
      url: "/api/cron/purge",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ purgedItems: 0, purgedReports: 0 });
  });

  it("calls purgeTrashed with a Date older than retentionDays", async () => {
    const purgeTrashed = vi.fn(async () => [] as TrashedS3Keys[]);
    const repo = fakeItemsRepo({ purgeTrashed });
    const app = await makeApp(repo, fakeReportsRepo(), fakeStorage(), fakeMailer(), fakeAuthRepo());

    const before = Date.now();
    await app.inject({
      method: "GET",
      url: "/api/cron/purge",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const after = Date.now();

    expect(purgeTrashed).toHaveBeenCalledOnce();
    const [datePassed] = purgeTrashed.mock.calls[0] as [Date];
    expect(datePassed).toBeInstanceOf(Date);
    // The cutoff should be roughly 30 days ago
    const expectedCutoff = before - 30 * 86_400_000;
    expect(datePassed.getTime()).toBeLessThanOrEqual(after - 30 * 86_400_000 + 1000);
    expect(datePassed.getTime()).toBeGreaterThanOrEqual(expectedCutoff - 1000);
  });

  it("calls storage.deleteObjects with both s3Key and thumbKey of purged items", async () => {
    const keys: TrashedS3Keys[] = [
      { s3Key: "items/a/web.jpg", thumbKey: "items/a/thumb.jpg" },
      { s3Key: "items/b/web.jpg", thumbKey: "items/b/thumb.jpg" },
    ];
    const deleteObjects = vi.fn(async () => {});
    const repo = fakeItemsRepo({ purgeTrashed: async () => keys });
    const storage = fakeStorage({ deleteObjects });
    const app = await makeApp(repo, fakeReportsRepo(), storage, fakeMailer(), fakeAuthRepo());

    const res = await app.inject({
      method: "GET",
      url: "/api/cron/purge",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().purgedItems).toBe(2);
    expect(deleteObjects).toHaveBeenCalledOnce();
    const [calledKeys] = deleteObjects.mock.calls[0] as [string[]];
    expect(calledKeys).toContain("items/a/web.jpg");
    expect(calledKeys).toContain("items/a/thumb.jpg");
    expect(calledKeys).toContain("items/b/web.jpg");
    expect(calledKeys).toContain("items/b/thumb.jpg");
    expect(calledKeys).toHaveLength(4);
  });

  it("does NOT call deleteObjects when no items were purged", async () => {
    const deleteObjects = vi.fn(async () => {});
    const app = await makeApp(
      fakeItemsRepo({ purgeTrashed: async () => [] }),
      fakeReportsRepo(),
      fakeStorage({ deleteObjects }),
      fakeMailer(),
      fakeAuthRepo(),
    );

    await app.inject({
      method: "GET",
      url: "/api/cron/purge",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    expect(deleteObjects).not.toHaveBeenCalled();
  });

  it("purgedReports count comes from reportsRepo.purgeTrashed", async () => {
    const app = await makeApp(
      fakeItemsRepo(),
      fakeReportsRepo({ purgeTrashed: async () => 7 }),
      fakeStorage(),
      fakeMailer(),
      fakeAuthRepo(),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/cron/purge",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    expect(res.json().purgedReports).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// GET /api/cron/digest
// ---------------------------------------------------------------------------

describe("GET /api/cron/digest", () => {
  it("correct bearer → 200 { sent, pendingCount, openReports }", async () => {
    const app = await makeApp(fakeItemsRepo(), fakeReportsRepo(), fakeStorage(), fakeMailer(), fakeAuthRepo());
    const res = await app.inject({
      method: "GET",
      url: "/api/cron/digest",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sent: 0, pendingCount: 0, openReports: 0 });
  });

  it("sends digest to all active admins when pending > 0", async () => {
    const sendDigest = vi.fn(async () => {});
    const app = await makeApp(
      fakeItemsRepo({ countPending: async () => 3 }),
      fakeReportsRepo({ countOpen: async () => 0 }),
      fakeStorage(),
      fakeMailer({ sendDigest }),
      fakeAuthRepo({ listAdminEmails: async () => ["a@school.de", "b@school.de"] }),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/cron/digest",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sent: 2, pendingCount: 3, openReports: 0 });
    expect(sendDigest).toHaveBeenCalledTimes(2);
    expect(sendDigest).toHaveBeenCalledWith("a@school.de", { pendingCount: 3, openReports: 0 });
    expect(sendDigest).toHaveBeenCalledWith("b@school.de", { pendingCount: 3, openReports: 0 });
  });

  it("sends digest when openReports > 0", async () => {
    const sendDigest = vi.fn(async () => {});
    const app = await makeApp(
      fakeItemsRepo({ countPending: async () => 0 }),
      fakeReportsRepo({ countOpen: async () => 2 }),
      fakeStorage(),
      fakeMailer({ sendDigest }),
      fakeAuthRepo({ listAdminEmails: async () => ["admin@school.de"] }),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/cron/digest",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    expect(res.json()).toMatchObject({ sent: 1, pendingCount: 0, openReports: 2 });
    expect(sendDigest).toHaveBeenCalledOnce();
    expect(sendDigest).toHaveBeenCalledWith("admin@school.de", { pendingCount: 0, openReports: 2 });
  });

  it("does NOT send digest when both pending and openReports are 0", async () => {
    const sendDigest = vi.fn(async () => {});
    const app = await makeApp(
      fakeItemsRepo({ countPending: async () => 0 }),
      fakeReportsRepo({ countOpen: async () => 0 }),
      fakeStorage(),
      fakeMailer({ sendDigest }),
      fakeAuthRepo({ listAdminEmails: async () => ["admin@school.de"] }),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/cron/digest",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    expect(res.json()).toMatchObject({ sent: 0, pendingCount: 0, openReports: 0 });
    expect(sendDigest).not.toHaveBeenCalled();
  });

  it("returns sent=0 when no admins exist", async () => {
    const sendDigest = vi.fn(async () => {});
    const app = await makeApp(
      fakeItemsRepo({ countPending: async () => 5 }),
      fakeReportsRepo(),
      fakeStorage(),
      fakeMailer({ sendDigest }),
      fakeAuthRepo({ listAdminEmails: async () => [] }),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/cron/digest",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    expect(res.json().sent).toBe(0);
    expect(sendDigest).not.toHaveBeenCalled();
  });
});
