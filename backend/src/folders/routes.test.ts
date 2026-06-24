import { describe, it, expect } from "vitest";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { User } from "../types.js";
import type { FoldersRepo, Folder } from "./repo.js";
import type { ItemsRepo, Item } from "../items/repo.js";
import type { Storage } from "../storage/s3.js";
import { registerFolderRoutes } from "./routes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEMBER: User = {
  id: "u-member",
  email: "member@grundschule.de",
  role: "member",
  status: "active",
  classId: "class-a",
  createdAt: "2024-01-01",
};

const MEMBER_NO_CLASS: User = { ...MEMBER, id: "u-noclass", classId: null };

const ADMIN: User = {
  id: "u-admin",
  email: "admin@grundschule.de",
  role: "admin",
  status: "active",
  classId: null,
  createdAt: "2024-01-01",
};

const FOLDER_ENABLED: Folder = {
  id: "f-enabled",
  name: "Klassenfahrt 2024",
  schoolYear: "2023/24",
  classLabel: "4a",
  enabled: true,
  createdBy: "u-admin",
  createdAt: "2024-01-01",
  coverItemId: null,
  startDate: null,
  endDate: null,
  sortOrder: 0,
  classIds: [],
};

const FOLDER_DISABLED: Folder = {
  id: "f-disabled",
  name: "Archiv",
  schoolYear: "2022/23",
  classLabel: "3b",
  enabled: false,
  createdBy: "u-admin",
  createdAt: "2023-01-01",
  coverItemId: null,
  startDate: null,
  endDate: null,
  sortOrder: 1,
  classIds: [],
};

const APPROVED_ITEM: Item = {
  id: "item-cover",
  folderId: "f-enabled",
  type: "photo",
  status: "approved",
  s3Key: "items/item-cover/web.jpg",
  thumbKey: "items/item-cover/thumb.jpg",
  caption: "",
  uploadedBy: "u-member",
  approvedBy: "u-admin",
  createdAt: "2024-01-01",
  trashedAt: null,
};

function fakeFoldersRepo(over: Partial<FoldersRepo> = {}): FoldersRepo {
  return {
    listAll: async () => [],
    listEnabled: async () => [],
    listForClass: async () => [],
    create: async (d) => ({
      id: "f1",
      name: d.name,
      schoolYear: d.schoolYear,
      classLabel: d.classLabel,
      enabled: true,
      createdBy: d.createdBy,
      createdAt: "2024-01-01",
      coverItemId: d.coverItemId ?? null,
      startDate: d.startDate ?? null,
      endDate: d.endDate ?? null,
      sortOrder: 0,
      classIds: d.classIds ?? [],
    }),
    update: async () => null,
    setClasses: async () => {},
    isVisibleToClass: async () => false,
    findById: async () => null,
    itemCounts: async () => new Map(),
    move: async () => false,
    softDelete: async () => true,
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

function fakeStorage(over: Partial<Storage> = {}): Storage {
  return {
    presignPut: async (key) => `https://s3.example.com/put/${key}`,
    presignGet: async (key) => `https://s3.example.com/get/${key}`,
    headExists: async () => true,
    head: async () => ({ size: 0 }),
    deleteObjects: async () => {},
    ...over,
  };
}

async function makeApp(
  foldersRepo: FoldersRepo,
  user: User | null,
  itemsRepo?: ItemsRepo,
  storage?: Storage,
) {
  const app = Fastify();
  await app.register(fastifyCookie, { secret: "test-secret" });

  // Fake guards inject req.user from test-controlled `user`
  const requireUser = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!user) {
      await reply.code(401).send({ error: "unauthenticated" });
      return;
    }
    req.user = user;
  };

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

  registerFolderRoutes(app, {
    foldersRepo,
    itemsRepo: itemsRepo ?? fakeItemsRepo(),
    documentsRepo: {
      listByFolder: async () => [],
      countByFolder: async () => 0,
      countsByFolder: async () => new Map(),
      insert: async () => ({ id: "d", folderId: "f", filename: "x", contentType: "x", sizeBytes: 0, s3Key: "x", uploadedBy: null, createdAt: "x" }),
      findById: async () => null,
      deleteById: async () => null,
    },
    storage: storage ?? fakeStorage(),
    requireUser,
    requireAdmin,
  });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// GET /api/folders
// ---------------------------------------------------------------------------

describe("GET /api/folders", () => {
  it("member sees only folders for their class, each with itemCount", async () => {
    const repo = fakeFoldersRepo({
      listForClass: async () => [FOLDER_ENABLED],
      itemCounts: async () => new Map([["f-enabled", 5]]),
    });
    const app = await makeApp(repo, MEMBER);

    const res = await app.inject({ method: "GET", url: "/api/folders" });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ id: string; itemCount: number; enabled: boolean }>;
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("f-enabled");
    expect(body[0].itemCount).toBe(5);
    expect(body[0].enabled).toBe(true);
  });

  it("member list is filtered by their classId via listForClass", async () => {
    let capturedClassId: string | null | undefined;
    const repo = fakeFoldersRepo({
      listForClass: async (classId) => {
        capturedClassId = classId;
        return [FOLDER_ENABLED];
      },
    });
    const app = await makeApp(repo, MEMBER);

    await app.inject({ method: "GET", url: "/api/folders" });

    expect(capturedClassId).toBe("class-a");
  });

  it("member without a class → empty list", async () => {
    // listForClass(null) returns [] in the real repo; the route must call it.
    const repo = fakeFoldersRepo({
      listForClass: async (classId) => (classId ? [FOLDER_ENABLED] : []),
    });
    const app = await makeApp(repo, MEMBER_NO_CLASS);

    const res = await app.inject({ method: "GET", url: "/api/folders" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("folder response carries classIds", async () => {
    const shared: Folder = { ...FOLDER_ENABLED, classIds: ["class-a", "class-b"] };
    const repo = fakeFoldersRepo({ listForClass: async () => [shared] });
    const app = await makeApp(repo, MEMBER);

    const res = await app.inject({ method: "GET", url: "/api/folders" });

    const body = res.json() as Array<{ classIds: string[] }>;
    expect(body[0].classIds).toEqual(["class-a", "class-b"]);
  });

  it("admin sees all folders (including disabled) with itemCount", async () => {
    const repo = fakeFoldersRepo({
      listAll: async () => [FOLDER_ENABLED, FOLDER_DISABLED],
      itemCounts: async () => new Map([["f-enabled", 3]]),
    });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({ method: "GET", url: "/api/folders" });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ id: string; itemCount: number }>;
    expect(body).toHaveLength(2);
    expect(body.find((f) => f.id === "f-disabled")?.itemCount).toBe(0);
    expect(body.find((f) => f.id === "f-enabled")?.itemCount).toBe(3);
  });

  it("folder with cover item returns coverThumbUrl", async () => {
    const folderWithCover: Folder = { ...FOLDER_ENABLED, coverItemId: APPROVED_ITEM.id };
    const repo = fakeFoldersRepo({
      listForClass: async () => [folderWithCover],
      itemCounts: async () => new Map(),
    });
    const itemsRepo = fakeItemsRepo({ findById: async () => APPROVED_ITEM });
    const app = await makeApp(repo, MEMBER, itemsRepo);

    const res = await app.inject({ method: "GET", url: "/api/folders" });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ coverThumbUrl: string | null }>;
    expect(body[0].coverThumbUrl).toBe(`https://s3.example.com/get/${APPROVED_ITEM.thumbKey}`);
  });

  it("folder without cover item returns coverThumbUrl: null", async () => {
    const repo = fakeFoldersRepo({
      listForClass: async () => [FOLDER_ENABLED],
      itemCounts: async () => new Map(),
    });
    const app = await makeApp(repo, MEMBER);

    const res = await app.inject({ method: "GET", url: "/api/folders" });

    const body = res.json() as Array<{ coverThumbUrl: string | null }>;
    expect(body[0].coverThumbUrl).toBeNull();
  });

  it("unauthenticated → 401", async () => {
    const app = await makeApp(fakeFoldersRepo(), null);
    const res = await app.inject({ method: "GET", url: "/api/folders" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthenticated" });
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/folders
// ---------------------------------------------------------------------------

describe("POST /api/admin/folders", () => {
  it("admin creates folder → 201 with folder data", async () => {
    const repo = fakeFoldersRepo({
      create: async (d) => ({
        id: "f-new",
        name: d.name,
        schoolYear: d.schoolYear,
        classLabel: d.classLabel,
        enabled: true,
        createdBy: d.createdBy,
        createdAt: "2024-06-01",
        coverItemId: null,
        startDate: null,
        endDate: null,
        sortOrder: 0,
      }),
    });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/folders",
      payload: { name: "Ausflug Wald", schoolYear: "2024/25", classLabel: "2b" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as Folder;
    expect(body.id).toBe("f-new");
    expect(body.name).toBe("Ausflug Wald");
    expect(body.schoolYear).toBe("2024/25");
    expect(body.classLabel).toBe("2b");
    expect(body.createdBy).toBe(ADMIN.id);
  });

  it("admin creates folder with startDate/endDate → included in result", async () => {
    const repo = fakeFoldersRepo({
      create: async (d) => ({
        id: "f-new",
        name: d.name,
        schoolYear: d.schoolYear ?? "",
        classLabel: d.classLabel ?? "",
        enabled: true,
        createdBy: d.createdBy,
        createdAt: "2024-06-01",
        coverItemId: null,
        startDate: d.startDate ?? null,
        endDate: d.endDate ?? null,
        sortOrder: 0,
      }),
    });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/folders",
      payload: { name: "Ausflug", startDate: "2024-06-14", endDate: "2024-06-16" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as Folder;
    expect(body.startDate).toBe("2024-06-14");
    expect(body.endDate).toBe("2024-06-16");
  });

  it("admin creates folder with classIds → persisted + in response", async () => {
    let captured: string[] | undefined;
    const repo = fakeFoldersRepo({
      create: async (d) => {
        captured = d.classIds;
        return {
          id: "f-new", name: d.name, schoolYear: d.schoolYear, classLabel: d.classLabel,
          enabled: true, createdBy: d.createdBy, createdAt: "x",
          coverItemId: null, startDate: null, endDate: null, sortOrder: 0,
          classIds: d.classIds ?? [],
        };
      },
    });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/folders",
      payload: { name: "Ausflug", classIds: ["class-a", "class-b"] },
    });

    expect(res.statusCode).toBe(201);
    expect(captured).toEqual(["class-a", "class-b"]);
    expect((res.json() as Folder).classIds).toEqual(["class-a", "class-b"]);
  });

  it("member → 403", async () => {
    const app = await makeApp(fakeFoldersRepo(), MEMBER);
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/folders",
      payload: { name: "Test" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden" });
  });

  it("missing name → 400", async () => {
    const app = await makeApp(fakeFoldersRepo(), ADMIN);
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/folders",
      payload: { schoolYear: "2024/25" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: expect.stringContaining("name") });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/folders/:id
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/folders/:id", () => {
  it("admin updates folder → 200 with updated folder", async () => {
    const updated: Folder = {
      ...FOLDER_ENABLED, name: "Aktualisiert", enabled: false,
      coverItemId: null, startDate: null, endDate: null, sortOrder: 0,
    };
    const repo = fakeFoldersRepo({
      update: async (_id, _data) => updated,
    });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/folders/${FOLDER_ENABLED.id}`,
      payload: { name: "Aktualisiert", enabled: false },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Folder;
    expect(body.name).toBe("Aktualisiert");
    expect(body.enabled).toBe(false);
  });

  it("admin updates classIds → passed through to repo.update", async () => {
    let captured: string[] | undefined;
    const updated: Folder = { ...FOLDER_ENABLED, classIds: ["class-c"] };
    const repo = fakeFoldersRepo({
      update: async (_id, data) => {
        captured = data.classIds;
        return updated;
      },
    });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/folders/${FOLDER_ENABLED.id}`,
      payload: { classIds: ["class-c"] },
    });

    expect(res.statusCode).toBe(200);
    expect(captured).toEqual(["class-c"]);
    expect((res.json() as Folder).classIds).toEqual(["class-c"]);
  });

  it("setting valid coverItemId (approved, same folder) → 200", async () => {
    const updated: Folder = { ...FOLDER_ENABLED, coverItemId: APPROVED_ITEM.id };
    const repo = fakeFoldersRepo({ update: async () => updated });
    const itemsRepo = fakeItemsRepo({ findById: async () => APPROVED_ITEM });
    const app = await makeApp(repo, ADMIN, itemsRepo);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/folders/${FOLDER_ENABLED.id}`,
      payload: { coverItemId: APPROVED_ITEM.id },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ coverItemId: APPROVED_ITEM.id });
  });

  it("coverItemId from different folder → 400 invalid_cover", async () => {
    const wrongFolderItem: Item = { ...APPROVED_ITEM, folderId: "other-folder" };
    const repo = fakeFoldersRepo();
    const itemsRepo = fakeItemsRepo({ findById: async () => wrongFolderItem });
    const app = await makeApp(repo, ADMIN, itemsRepo);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/folders/${FOLDER_ENABLED.id}`,
      payload: { coverItemId: APPROVED_ITEM.id },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_cover" });
  });

  it("coverItemId pointing to pending item → 400 invalid_cover", async () => {
    const pendingItem: Item = { ...APPROVED_ITEM, status: "pending" };
    const repo = fakeFoldersRepo();
    const itemsRepo = fakeItemsRepo({ findById: async () => pendingItem });
    const app = await makeApp(repo, ADMIN, itemsRepo);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/folders/${FOLDER_ENABLED.id}`,
      payload: { coverItemId: APPROVED_ITEM.id },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_cover" });
  });

  it("unknown id → 404", async () => {
    const repo = fakeFoldersRepo({ update: async () => null });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/folders/nonexistent",
      payload: { name: "X" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not found" });
  });

  it("member → 403", async () => {
    const app = await makeApp(fakeFoldersRepo(), MEMBER);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/folders/f-enabled",
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden" });
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/folders/:id/move
// ---------------------------------------------------------------------------

describe("POST /api/admin/folders/:id/move", () => {
  it("admin moves folder up → 200 { moved: true }", async () => {
    const repo = fakeFoldersRepo({ move: async () => true });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/folders/f-enabled/move",
      payload: { direction: "up" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ moved: true });
  });

  it("already at top, move up → 200 { moved: false } (no-op)", async () => {
    const repo = fakeFoldersRepo({ move: async () => false });
    const app = await makeApp(repo, ADMIN);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/folders/f-enabled/move",
      payload: { direction: "up" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ moved: false });
  });

  it("invalid direction → 400", async () => {
    const app = await makeApp(fakeFoldersRepo(), ADMIN);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/folders/f-enabled/move",
      payload: { direction: "sideways" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("member → 403", async () => {
    const app = await makeApp(fakeFoldersRepo(), MEMBER);
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/folders/f-enabled/move",
      payload: { direction: "up" },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/folders/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/folders/:id", () => {
  it("disabled album → 204, trashes its photos and soft-deletes the album", async () => {
    let trashed: string[] | undefined;
    let softDeleted: string | undefined;
    const foldersRepo = fakeFoldersRepo({
      findById: async () => FOLDER_DISABLED,
      softDelete: async (id) => { softDeleted = id; return true; },
    });
    const itemsRepo = fakeItemsRepo({
      listByFolder: async () => [APPROVED_ITEM],
      setStatusTrashed: async (ids) => { trashed = ids; return ids.length; },
    });
    const app = await makeApp(foldersRepo, ADMIN, itemsRepo);

    const res = await app.inject({ method: "DELETE", url: "/api/admin/folders/f-disabled" });

    expect(res.statusCode).toBe(204);
    expect(trashed).toEqual([APPROVED_ITEM.id]);
    expect(softDeleted).toBe("f-disabled");
  });

  it("enabled album → 400 must_disable_first (no trashing)", async () => {
    let softCalled = false;
    const foldersRepo = fakeFoldersRepo({
      findById: async () => FOLDER_ENABLED,
      softDelete: async () => { softCalled = true; return true; },
    });
    const app = await makeApp(foldersRepo, ADMIN);

    const res = await app.inject({ method: "DELETE", url: "/api/admin/folders/f-enabled" });

    expect(res.statusCode).toBe(400);
    expect(softCalled).toBe(false);
  });

  it("unknown album → 404", async () => {
    const foldersRepo = fakeFoldersRepo({ findById: async () => null });
    const app = await makeApp(foldersRepo, ADMIN);
    const res = await app.inject({ method: "DELETE", url: "/api/admin/folders/nope" });
    expect(res.statusCode).toBe(404);
  });

  it("non-admin → 403", async () => {
    const app = await makeApp(fakeFoldersRepo(), MEMBER);
    const res = await app.inject({ method: "DELETE", url: "/api/admin/folders/f-disabled" });
    expect(res.statusCode).toBe(403);
  });
});
