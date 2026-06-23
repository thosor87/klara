import { describe, it, expect } from "vitest";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { User } from "../types.js";
import type { AuthRepo } from "../auth/repo.js";
import type { ItemsRepo } from "../items/repo.js";
import { registerAdminUserRoutes } from "./users-routes.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN: User = {
  id: "u-admin",
  email: "admin@grundschule.de",
  role: "admin",
  status: "active",
  classId: null,
  createdAt: "2024-01-01",
};

const MEMBER: User = {
  id: "u-member",
  email: "member@grundschule.de",
  role: "member",
  status: "active",
  classId: null,
  createdAt: "2024-01-01",
};

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function fakeAuthRepo(over: Partial<AuthRepo> = {}): AuthRepo {
  return {
    findUserByEmail: async () => null,
    findUserById: async () => null,
    createPendingUser: async (email) => ({
      id: "u-new",
      email,
      role: "member",
      status: "pending",
      classId: null,
      createdAt: "x",
    }),
    insertLoginToken: async () => {},
    findLatestActiveToken: async () => null,
    findActiveTokenByLinkHash: async () => null,
    markTokenUsed: async () => {},
    incrementCodeAttempts: async () => {},
    listUsers: async () => [],
    upsertActiveUser: async (email, role) => ({
      id: "u-new",
      email,
      role,
      status: "active",
      classId: null,
      createdAt: "x",
    }),
    updateUser: async () => null,
    listAdminEmails: async () => [],
    ...over,
  };
}

function fakeItemsRepo(over: Partial<ItemsRepo> = {}): ItemsRepo {
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
    restore: async () => false,
    countPending: async () => 0,
    purgeTrashed: async () => [],
    trashItemById: async () => false,
    uploadCountsByUser: async () => ({}),
    ...over,
  };
}

async function makeApp(authRepo: AuthRepo, user: User | null, itemsRepo?: ItemsRepo) {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: "test-secret" });

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!user) {
      await reply.code(401).send({ error: "unauthenticated" });
      return;
    }
    if (user.role !== "admin") {
      await reply.code(403).send({ error: "forbidden" });
      return;
    }
    req.user = user;
  };

  registerAdminUserRoutes(app, { authRepo, itemsRepo: itemsRepo ?? fakeItemsRepo(), requireAdmin });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// GET /api/admin/users
// ---------------------------------------------------------------------------

describe("GET /api/admin/users", () => {
  it("admin → 200 + user list with uploadCount", async () => {
    const repo = fakeAuthRepo({ listUsers: async () => [ADMIN, MEMBER] });
    // MEMBER has 3 uploads
    const itemsRepo = fakeItemsRepo({
      uploadCountsByUser: async () => ({ [MEMBER.id]: 3 }),
    });
    const app = await makeApp(repo, ADMIN, itemsRepo);

    const res = await app.inject({ method: "GET", url: "/api/admin/users" });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<User & { uploadCount: number }>;
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe(ADMIN.id);
    expect(body[0].uploadCount).toBe(0);
    expect(body[1].id).toBe(MEMBER.id);
    expect(body[1].uploadCount).toBe(3);
  });

  it("member → 403", async () => {
    const app = await makeApp(fakeAuthRepo(), MEMBER);
    const res = await app.inject({ method: "GET", url: "/api/admin/users" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden" });
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users
// ---------------------------------------------------------------------------

describe("POST /api/admin/users", () => {
  it("admin creates user → 201 + user", async () => {
    const repo = fakeAuthRepo({
      upsertActiveUser: async (email, role) => ({
        id: "u-created",
        email,
        role,
        status: "active",
        classId: null,
        createdAt: "x",
      }),
    });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/users",
      payload: { email: "new@grundschule.de", role: "admin" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as User;
    expect(body.id).toBe("u-created");
    expect(body.email).toBe("new@grundschule.de");
    expect(body.role).toBe("admin");
    expect(body.status).toBe("active");
  });

  it("missing email → 400", async () => {
    const app = await makeApp(fakeAuthRepo(), ADMIN);
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/users",
      payload: { role: "member" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "email is required" });
  });

  it("member → 403", async () => {
    const app = await makeApp(fakeAuthRepo(), MEMBER);
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/users",
      payload: { email: "x@grundschule.de" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden" });
  });

  it("defaults to role='member' when role not specified", async () => {
    let capturedRole: string | undefined;
    const repo = fakeAuthRepo({
      upsertActiveUser: async (email, role) => {
        capturedRole = role;
        return { id: "u-new", email, role, status: "active", classId: null, createdAt: "x" };
      },
    });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/users",
      payload: { email: "x@grundschule.de" },
    });

    expect(res.statusCode).toBe(201);
    expect(capturedRole).toBe("member");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/:id
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/users/:id", () => {
  it("admin updates user → 200 + updated user", async () => {
    const updated: User = { ...MEMBER, status: "disabled" };
    const repo = fakeAuthRepo({ updateUser: async () => updated });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${MEMBER.id}`,
      payload: { status: "disabled" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as User;
    expect(body.status).toBe("disabled");
  });

  it("unknown id → 404", async () => {
    const repo = fakeAuthRepo({ updateUser: async () => null });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/users/nonexistent",
      payload: { status: "disabled" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not found" });
  });

  it("member → 403", async () => {
    const app = await makeApp(fakeAuthRepo(), MEMBER);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/users/some-id",
      payload: { status: "disabled" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden" });
  });

  it("cannot_modify_self: disabling own account → 400", async () => {
    const app = await makeApp(fakeAuthRepo(), ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${ADMIN.id}`,
      payload: { status: "disabled" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "cannot_modify_self" });
  });

  it("cannot_modify_self: demoting own account admin→member → 400", async () => {
    const app = await makeApp(fakeAuthRepo(), ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${ADMIN.id}`,
      payload: { role: "member" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "cannot_modify_self" });
  });

  it("admin assigns classId → 200 + updateUser called with classId", async () => {
    let captured: { status?: string; role?: string; classId?: string | null } | undefined;
    const repo = fakeAuthRepo({
      updateUser: async (_id, data) => {
        captured = data;
        return { ...MEMBER, classId: "class-a" };
      },
    });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${MEMBER.id}`,
      payload: { classId: "class-a" },
    });

    expect(res.statusCode).toBe(200);
    expect(captured).toMatchObject({ classId: "class-a" });
    expect((res.json() as User).classId).toBe("class-a");
  });

  it("admin clears classId (null) → 200 + updateUser called with classId=null", async () => {
    let captured: { classId?: string | null } | undefined;
    const repo = fakeAuthRepo({
      updateUser: async (_id, data) => {
        captured = data;
        return { ...MEMBER, classId: null };
      },
    });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${MEMBER.id}`,
      payload: { classId: null },
    });

    expect(res.statusCode).toBe(200);
    expect(captured).toHaveProperty("classId", null);
    expect((res.json() as User).classId).toBeNull();
  });

  it("admin can patch own id with role='admin' (no-op) → 200", async () => {
    const repo = fakeAuthRepo({ updateUser: async () => ADMIN });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${ADMIN.id}`,
      payload: { role: "admin" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as User;
    expect(body.role).toBe("admin");
  });
});
