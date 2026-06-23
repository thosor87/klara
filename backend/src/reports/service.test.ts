import { describe, it, expect, vi } from "vitest";
import type { Storage } from "../storage/s3.js";
import type { ItemsRepo, Item, ItemWithFolderName } from "../items/repo.js";
import type { ReportsRepo, Report, ReportWithDetails } from "./repo.js";
import { createReportsService, AppError } from "./service.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APPROVED_ITEM: Item = {
  id: "item1",
  folderId: "f1",
  type: "photo",
  status: "approved",
  s3Key: "items/item1/web.jpg",
  thumbKey: "items/item1/thumb.jpg",
  caption: "Test",
  uploadedBy: "u1",
  approvedBy: "admin1",
  createdAt: "2024-01-01",
  trashedAt: null,
};

const PENDING_ITEM: Item = { ...APPROVED_ITEM, id: "item2", status: "pending" };

const REPORT: Report = {
  id: "r1",
  itemId: "item1",
  reason: "Unangemessener Inhalt",
  reportedBy: "u2",
  status: "open",
  response: "",
  createdAt: "2024-01-02",
  trashedAt: null,
};

const REPORT_WITH_DETAILS: ReportWithDetails = {
  ...REPORT,
  folderName: "Klasse 3b",
  reportedByEmail: "reporter@grundschule.de",
  itemS3Key: APPROVED_ITEM.s3Key,
  itemThumbKey: APPROVED_ITEM.thumbKey,
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

function fakeItemsRepo(overrides: Partial<ItemsRepo> = {}): ItemsRepo {
  return {
    insertPending: async () => APPROVED_ITEM,
    listByFolder: async () => [],
    listPending: async () => [],
    setStatusApproved: async (ids) => ids.length,
    setStatusTrashed: async (ids) => ids.length,
    findById: async () => null,
    listTrashed: async () => [],
    restore: async () => true,
    countPending: async () => 0,
    purgeTrashed: async () => [],
    trashItemById: async () => true,
    ...overrides,
  };
}

function fakeReportsRepo(overrides: Partial<ReportsRepo> = {}): ReportsRepo {
  return {
    create: async () => REPORT,
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

// ---------------------------------------------------------------------------
// report()
// ---------------------------------------------------------------------------

describe("report", () => {
  it("reports an approved item successfully", async () => {
    const create = vi.fn(async () => REPORT);
    const svc = createReportsService({
      reportsRepo: fakeReportsRepo({ create }),
      itemsRepo: fakeItemsRepo({ findById: async () => APPROVED_ITEM }),
      storage: fakeStorage(),
    });

    const result = await svc.report("item1", "Unangemessener Inhalt", "u2");

    expect(create).toHaveBeenCalledWith({
      itemId: "item1",
      reason: "Unangemessener Inhalt",
      reportedBy: "u2",
    });
    expect(result).toEqual({ ok: true });
  });

  it("throws item_not_found when item does not exist", async () => {
    const svc = createReportsService({
      reportsRepo: fakeReportsRepo(),
      itemsRepo: fakeItemsRepo({ findById: async () => null }),
      storage: fakeStorage(),
    });

    await expect(svc.report("missing", "reason", "u2")).rejects.toMatchObject({
      name: "AppError",
      code: "item_not_found",
    });
  });

  it("throws item_not_found when item is pending (not approved)", async () => {
    const svc = createReportsService({
      reportsRepo: fakeReportsRepo(),
      itemsRepo: fakeItemsRepo({ findById: async () => PENDING_ITEM }),
      storage: fakeStorage(),
    });

    await expect(svc.report("item2", "reason", "u2")).rejects.toMatchObject({
      name: "AppError",
      code: "item_not_found",
    });
  });

  it("throws item_not_found when item is trashed", async () => {
    const trashed: Item = { ...APPROVED_ITEM, status: "trashed" };
    const svc = createReportsService({
      reportsRepo: fakeReportsRepo(),
      itemsRepo: fakeItemsRepo({ findById: async () => trashed }),
      storage: fakeStorage(),
    });

    await expect(svc.report("item1", "reason", "u2")).rejects.toMatchObject({
      name: "AppError",
      code: "item_not_found",
    });
  });
});

// ---------------------------------------------------------------------------
// listForAdmin()
// ---------------------------------------------------------------------------

describe("listForAdmin", () => {
  it("attaches presigned thumbUrl and webUrl to each report", async () => {
    const svc = createReportsService({
      reportsRepo: fakeReportsRepo({ listForAdmin: async () => [REPORT_WITH_DETAILS] }),
      itemsRepo: fakeItemsRepo(),
      storage: fakeStorage(),
    });

    const result = await svc.listForAdmin();

    expect(result).toHaveLength(1);
    expect(result[0].thumbUrl).toBe(`https://s3.example.com/get/${APPROVED_ITEM.thumbKey}`);
    expect(result[0].webUrl).toBe(`https://s3.example.com/get/${APPROVED_ITEM.s3Key}`);
    expect(result[0].folderName).toBe("Klasse 3b");
    expect(result[0].reportedByEmail).toBe("reporter@grundschule.de");
  });

  it("returns empty array when no reports", async () => {
    const svc = createReportsService({
      reportsRepo: fakeReportsRepo({ listForAdmin: async () => [] }),
      itemsRepo: fakeItemsRepo(),
      storage: fakeStorage(),
    });

    const result = await svc.listForAdmin();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ignore()
// ---------------------------------------------------------------------------

describe("ignore", () => {
  it("ignores an open report", async () => {
    const setIgnored = vi.fn(async () => true);
    const svc = createReportsService({
      reportsRepo: fakeReportsRepo({ findById: async () => REPORT, setIgnored }),
      itemsRepo: fakeItemsRepo(),
      storage: fakeStorage(),
    });

    const result = await svc.ignore("r1");

    expect(setIgnored).toHaveBeenCalledWith("r1");
    expect(result).toEqual({ ok: true });
  });

  it("throws report_not_found when report does not exist", async () => {
    const svc = createReportsService({
      reportsRepo: fakeReportsRepo({ findById: async () => null }),
      itemsRepo: fakeItemsRepo(),
      storage: fakeStorage(),
    });

    await expect(svc.ignore("missing")).rejects.toMatchObject({
      name: "AppError",
      code: "report_not_found",
    });
  });
});

// ---------------------------------------------------------------------------
// answer()
// ---------------------------------------------------------------------------

describe("answer", () => {
  it("saves response text and returns ok", async () => {
    const setAnswered = vi.fn(async () => true);
    const svc = createReportsService({
      reportsRepo: fakeReportsRepo({ findById: async () => REPORT, setAnswered }),
      itemsRepo: fakeItemsRepo(),
      storage: fakeStorage(),
    });

    const result = await svc.answer("r1", "Danke für den Hinweis, haben wir geprüft.");

    expect(setAnswered).toHaveBeenCalledWith("r1", "Danke für den Hinweis, haben wir geprüft.");
    expect(result).toEqual({ ok: true });
  });

  it("throws report_not_found when report does not exist", async () => {
    const svc = createReportsService({
      reportsRepo: fakeReportsRepo({ findById: async () => null }),
      itemsRepo: fakeItemsRepo(),
      storage: fakeStorage(),
    });

    await expect(svc.answer("missing", "response")).rejects.toMatchObject({
      name: "AppError",
      code: "report_not_found",
    });
  });
});

// ---------------------------------------------------------------------------
// delete()
// ---------------------------------------------------------------------------

describe("delete", () => {
  it("sets both the report AND the item to trashed", async () => {
    const setTrashed = vi.fn(async () => true);
    const trashItemById = vi.fn(async () => true);
    const svc = createReportsService({
      reportsRepo: fakeReportsRepo({ findById: async () => REPORT, setTrashed }),
      itemsRepo: fakeItemsRepo({ trashItemById }),
      storage: fakeStorage(),
    });

    const result = await svc.delete("r1");

    expect(setTrashed).toHaveBeenCalledWith("r1");
    expect(trashItemById).toHaveBeenCalledWith(REPORT.itemId);
    expect(result).toEqual({ ok: true });
  });

  it("throws report_not_found when report does not exist", async () => {
    const svc = createReportsService({
      reportsRepo: fakeReportsRepo({ findById: async () => null }),
      itemsRepo: fakeItemsRepo(),
      storage: fakeStorage(),
    });

    await expect(svc.delete("missing")).rejects.toMatchObject({
      name: "AppError",
      code: "report_not_found",
    });
  });
});
