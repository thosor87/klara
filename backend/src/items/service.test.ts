import { describe, it, expect, vi } from "vitest";
import type { Storage } from "../storage/s3.js";
import type { FoldersRepo, Folder } from "../folders/repo.js";
import type { ItemsRepo, Item, ItemWithFolderName, ItemStatus } from "./repo.js";
import { createItemsService, AppError } from "./service.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FOLDER: Folder = {
  id: "f1",
  name: "Klasse 3b",
  schoolYear: "2025",
  classLabel: "3b",
  enabled: true,
  createdBy: null,
  createdAt: "x",
};

const DISABLED_FOLDER: Folder = { ...FOLDER, id: "f-dis", enabled: false };

const ITEM: Item = {
  id: "item1",
  folderId: "f1",
  type: "photo",
  status: "pending",
  s3Key: "items/item1/web.jpg",
  thumbKey: "items/item1/thumb.jpg",
  caption: "",
  uploadedBy: "u1",
  approvedBy: null,
  createdAt: "x",
  trashedAt: null,
};

// ---------------------------------------------------------------------------
// Fake factories
// ---------------------------------------------------------------------------

function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  return {
    presignPut: async (key) => `https://s3.example.com/put/${key}`,
    presignGet: async (key) => `https://s3.example.com/get/${key}`,
    headExists: async () => true,
    deleteObjects: async () => {},
    ...overrides,
  };
}

function fakeFoldersRepo(overrides: Partial<FoldersRepo> = {}): FoldersRepo {
  return {
    listAll: async () => [],
    listEnabled: async () => [],
    create: async () => FOLDER,
    update: async () => null,
    findById: async () => null,
    itemCounts: async () => new Map(),
    ...overrides,
  };
}

function fakeItemsRepo(overrides: Partial<ItemsRepo> = {}): ItemsRepo {
  return {
    insertPending: async () => ITEM,
    listByFolder: async () => [],
    listPending: async () => [],
    setStatusApproved: async (ids) => ids.length,
    setStatusTrashed: async (ids) => ids.length,
    findById: async () => null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// presignUpload
// ---------------------------------------------------------------------------

describe("presignUpload", () => {
  it("returns itemId, webUploadUrl, thumbUploadUrl from storage.presignPut", async () => {
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo(),
      foldersRepo: fakeFoldersRepo({ findById: async () => FOLDER }),
      storage: fakeStorage(),
    });

    const result = await svc.presignUpload("f1", "image/jpeg");

    expect(result.itemId).toBeTypeOf("string");
    expect(result.webUploadUrl).toContain("https://s3.example.com/put/items/");
    expect(result.webUploadUrl).toContain("/web.jpg");
    expect(result.thumbUploadUrl).toContain("https://s3.example.com/put/items/");
    expect(result.thumbUploadUrl).toContain("/thumb.jpg");
  });

  it("throws AppError folder_not_found when folder does not exist", async () => {
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo(),
      foldersRepo: fakeFoldersRepo({ findById: async () => null }),
      storage: fakeStorage(),
    });

    await expect(svc.presignUpload("f-missing", "image/jpeg")).rejects.toMatchObject({
      name: "AppError",
      code: "folder_not_found",
    });
  });

  it("throws AppError folder_not_found when folder.enabled = false", async () => {
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo(),
      foldersRepo: fakeFoldersRepo({ findById: async () => DISABLED_FOLDER }),
      storage: fakeStorage(),
    });

    await expect(svc.presignUpload("f-dis", "image/jpeg")).rejects.toMatchObject({
      name: "AppError",
      code: "folder_not_found",
    });
  });

  it("does NOT call insertPending (no DB write)", async () => {
    const insertPending = vi.fn(async () => ITEM);
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo({ insertPending }),
      foldersRepo: fakeFoldersRepo({ findById: async () => FOLDER }),
      storage: fakeStorage(),
    });

    await svc.presignUpload("f1", "image/jpeg");

    expect(insertPending).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// confirmUpload
// ---------------------------------------------------------------------------

describe("confirmUpload", () => {
  it("calls headExists for both web and thumb keys", async () => {
    const headExists = vi.fn(async () => true);
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo(),
      foldersRepo: fakeFoldersRepo({ findById: async () => FOLDER }),
      storage: fakeStorage({ headExists }),
    });

    await svc.confirmUpload("f1", "item1", "", "u1");

    expect(headExists).toHaveBeenCalledWith("items/item1/web.jpg");
    expect(headExists).toHaveBeenCalledWith("items/item1/thumb.jpg");
    expect(headExists).toHaveBeenCalledTimes(2);
  });

  it("throws AppError upload_incomplete when web key does not exist", async () => {
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo(),
      foldersRepo: fakeFoldersRepo({ findById: async () => FOLDER }),
      storage: fakeStorage({
        headExists: async (key) => !key.endsWith("web.jpg"),
      }),
    });

    await expect(svc.confirmUpload("f1", "item1", "", "u1")).rejects.toMatchObject({
      name: "AppError",
      code: "upload_incomplete",
    });
  });

  it("throws AppError upload_incomplete when thumb key does not exist", async () => {
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo(),
      foldersRepo: fakeFoldersRepo({ findById: async () => FOLDER }),
      storage: fakeStorage({
        headExists: async (key) => !key.endsWith("thumb.jpg"),
      }),
    });

    await expect(svc.confirmUpload("f1", "item1", "", "u1")).rejects.toMatchObject({
      name: "AppError",
      code: "upload_incomplete",
    });
  });

  it("uses server-derived keys (not client input) in insertPending", async () => {
    const insertPending = vi.fn(async () => ITEM);
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo({ insertPending }),
      foldersRepo: fakeFoldersRepo({ findById: async () => FOLDER }),
      storage: fakeStorage(),
    });

    await svc.confirmUpload("f1", "item1", "a caption", "u1");

    expect(insertPending).toHaveBeenCalledWith(
      expect.objectContaining({
        s3Key: "items/item1/web.jpg",
        thumbKey: "items/item1/thumb.jpg",
      }),
    );
  });

  it("returns the inserted item", async () => {
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo({ insertPending: async () => ITEM }),
      foldersRepo: fakeFoldersRepo({ findById: async () => FOLDER }),
      storage: fakeStorage(),
    });

    const result = await svc.confirmUpload("f1", "item1", "", "u1");
    expect(result).toEqual(ITEM);
  });

  it("confirmUpload throws folder_not_found when folder is disabled", async () => {
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo({ insertPending: vi.fn() }),
      foldersRepo: fakeFoldersRepo({ findById: async () => DISABLED_FOLDER }),
      storage: fakeStorage({ headExists: async () => true }),
    });
    await expect(svc.confirmUpload("f-dis", "item1", "", "u1")).rejects.toMatchObject({ code: "folder_not_found" });
  });

  it("confirmUpload throws folder_not_found when folder not found", async () => {
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo({ insertPending: vi.fn() }),
      foldersRepo: fakeFoldersRepo({ findById: async () => null }),
      storage: fakeStorage({ headExists: async () => true }),
    });
    await expect(svc.confirmUpload("missing", "item1", "", "u1")).rejects.toMatchObject({ code: "folder_not_found" });
  });
});

// ---------------------------------------------------------------------------
// listFolderItems
// ---------------------------------------------------------------------------

describe("listFolderItems", () => {
  const APPROVED_ITEM: Item = { ...ITEM, id: "item-approved", status: "approved" };

  it("member (isAdmin=false) calls listByFolder with approved status only", async () => {
    const listByFolder = vi.fn(async () => [APPROVED_ITEM]);
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo({ listByFolder }),
      foldersRepo: fakeFoldersRepo(),
      storage: fakeStorage(),
    });

    await svc.listFolderItems("f1", { isAdmin: false });

    expect(listByFolder).toHaveBeenCalledWith("f1", ["approved"]);
  });

  it("admin (isAdmin=true) calls listByFolder with all statuses", async () => {
    const listByFolder = vi.fn(async () => []);
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo({ listByFolder }),
      foldersRepo: fakeFoldersRepo(),
      storage: fakeStorage(),
    });

    await svc.listFolderItems("f1", { isAdmin: true });

    const call = listByFolder.mock.calls[0];
    expect(call[0]).toBe("f1");
    expect(call[1]).toEqual(expect.arrayContaining(["pending", "approved", "trashed"]));
    expect(call[1]).toHaveLength(3);
  });

  it("attaches thumbUrl and webUrl to each item", async () => {
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo({ listByFolder: async () => [APPROVED_ITEM] }),
      foldersRepo: fakeFoldersRepo(),
      storage: fakeStorage(),
    });

    const result = await svc.listFolderItems("f1", { isAdmin: false });

    expect(result).toHaveLength(1);
    expect(result[0].thumbUrl).toBe(`https://s3.example.com/get/${APPROVED_ITEM.thumbKey}`);
    expect(result[0].webUrl).toBe(`https://s3.example.com/get/${APPROVED_ITEM.s3Key}`);
  });
});

// ---------------------------------------------------------------------------
// approve / reject
// ---------------------------------------------------------------------------

describe("approve", () => {
  it("calls setStatusApproved with correct ids and returns { approved: n }", async () => {
    const setStatusApproved = vi.fn(async (ids: string[]) => ids.length);
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo({ setStatusApproved }),
      foldersRepo: fakeFoldersRepo(),
      storage: fakeStorage(),
    });

    const result = await svc.approve(["id1", "id2"], "admin1");

    expect(setStatusApproved).toHaveBeenCalledWith(["id1", "id2"], "admin1");
    expect(result).toEqual({ approved: 2 });
  });
});

describe("reject", () => {
  it("calls setStatusTrashed with correct ids and returns { rejected: n }", async () => {
    const setStatusTrashed = vi.fn(async (ids: string[]) => ids.length);
    const svc = createItemsService({
      itemsRepo: fakeItemsRepo({ setStatusTrashed }),
      foldersRepo: fakeFoldersRepo(),
      storage: fakeStorage(),
    });

    const result = await svc.reject(["id1", "id2", "id3"]);

    expect(setStatusTrashed).toHaveBeenCalledWith(["id1", "id2", "id3"]);
    expect(result).toEqual({ rejected: 3 });
  });
});
