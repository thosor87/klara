export interface Me { id: string; email: string; role: "admin" | "member"; status: string; classId: string | null; }

/** Klares Feedback auf einen Login-Request (kein generisches "Mail gesendet"). */
export type RequestLoginOutcome = "code_sent" | "pending" | "denied";

export interface Folder {
  id: string;
  name: string;
  schoolYear?: string;
  classLabel?: string;
  enabled: boolean;
  itemCount: number;
  documentCount?: number;
  sortOrder?: number;
  startDate?: string | null;
  endDate?: string | null;
  coverItemId?: string | null;
  coverThumbUrl?: string | null;
  classIds: string[];
}

/** Lifecycle status computed server-side from track + Einschulungsjahr. */
export type ClassStatus = "active" | "alumni" | "archived" | "expired" | "future" | "legacy";

export interface ClassOption {
  id: string;
  /** Server-computed display label (e.g. "2m"); for legacy = stored label. */
  label: string;
  /** Zug, e.g. "m" — empty string for a Regelklasse. */
  track: string;
  /** Einschulungsjahr; null for legacy classes. */
  startYear: number | null;
  /** Lifecycle status, computed server-side. */
  status: ClassStatus;
  /** Current school year (e.g. "2025/26") for active classes; otherwise null. */
  schoolYear: string | null;
}

export interface Item {
  id: string;
  type?: "photo" | "video";
  processing?: boolean;
  caption: string;
  status: string;
  createdAt: string;
  thumbUrl: string;
  webUrl: string;
  mine?: boolean;
}

export interface AlbumDocument {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  downloadUrl: string;
}

export interface PendingItem extends Item {
  folderId: string;
  folderName: string;
}

export interface User {
  id: string;
  email: string;
  role: "admin" | "member";
  status: string;
  createdAt: string;
  classId: string | null;
  uploadCount?: number;
}

/** The admin list endpoint returns plain domain strings. */
export type Domain = string;

export interface ReportItem {
  id: string;
  itemId: string;
  reason: string;
  status: "open" | "answered" | "ignored" | "trashed";
  response: string;
  createdAt: string;
  thumbUrl: string;
  webUrl: string;
  folderName: string;
  reportedByEmail: string;
}

export interface TrashItem {
  id: string;
  folderName: string;
  caption: string;
  trashedAt: string;
  daysLeft: number;
  thumbUrl: string;
}

export interface PresignResult {
  itemId: string;
  webUploadUrl: string;
  thumbUploadUrl: string;
}

async function jsonOrNull(res: Response): Promise<any> {
  if (!res.ok) { console.error(`API ${res.url} → ${res.status}`); return null; }
  return res.json();
}

export const api = {
  // Auth
  async me(): Promise<Me | null> {
    const data = await jsonOrNull(await fetch("/api/me"));
    return data?.user ?? null;
  },
  async requestLogin(email: string): Promise<RequestLoginOutcome> {
    const res = await fetch("/api/auth/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error(`requestLogin failed: ${res.status}`);
    const data = await res.json();
    return data.outcome as RequestLoginOutcome;
  },
  async verify(email: string, code: string): Promise<Me | null> {
    const data = await jsonOrNull(await fetch("/api/auth/verify", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code }) }));
    return data?.user ?? null;
  },
  async logout(): Promise<void> {
    const res = await fetch("/api/auth/logout", { method: "POST" });
    if (!res.ok) throw new Error(`logout failed: ${res.status}`);
  },

  // Folders
  async getFolders(): Promise<Folder[]> {
    const data = await jsonOrNull(await fetch("/api/folders"));
    return data ?? [];
  },
  async createFolder(body: {
    name: string;
    startDate?: string | null;
    endDate?: string | null;
    coverItemId?: string | null;
    classIds?: string[];
  }): Promise<Folder> {
    const res = await fetch("/api/admin/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async updateFolder(id: string, body: {
    name?: string;
    enabled?: boolean;
    startDate?: string | null;
    endDate?: string | null;
    coverItemId?: string | null;
    classIds?: string[];
  }): Promise<Folder> {
    const res = await fetch(`/api/admin/folders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async moveFolder(id: string, direction: "up" | "down"): Promise<{ moved: boolean }> {
    const res = await fetch(`/api/admin/folders/${id}/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Delete a disabled album: its photos move to the trash, the album is hidden.
  async deleteFolder(id: string): Promise<void> {
    const res = await fetch(`/api/admin/folders/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? `Fehler ${res.status}`);
    }
  },

  // Class options (member dropdown)
  async getClassOptions(): Promise<ClassOption[]> {
    const data = await jsonOrNull(await fetch("/api/class-options"));
    return data ?? [];
  },

  // Class options (admin management)
  async getAdminClassOptions(): Promise<ClassOption[]> {
    const data = await jsonOrNull(await fetch("/api/admin/class-options"));
    return data ?? [];
  },
  /** Create a cohort class from Zug + Einschulungsjahr. */
  async addClassOption(body: { track: string; startYear: number }): Promise<ClassOption> {
    const res = await fetch("/api/admin/class-options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  /** Update a class's Zug and/or Einschulungsjahr (e.g. to convert a legacy class). */
  async updateClassOption(
    id: string,
    body: { track?: string; startYear?: number | null },
  ): Promise<ClassOption> {
    const res = await fetch(`/api/admin/class-options/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async removeClassOption(id: string): Promise<void> {
    const res = await fetch(`/api/admin/class-options/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
  },

  // Domains (admin management)
  async getDomains(): Promise<Domain[]> {
    const data = await jsonOrNull(await fetch("/api/admin/domains"));
    return data ?? [];
  },
  async addDomain(domain: string): Promise<void> {
    const res = await fetch("/api/admin/domains", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    if (!res.ok) throw new Error(await res.text());
  },
  async removeDomain(domain: string): Promise<void> {
    const res = await fetch(`/api/admin/domains/${encodeURIComponent(domain)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
  },

  // Upload
  async presignUpload(folderId: string, contentType: string, kind: "photo" | "video" = "photo"): Promise<PresignResult> {
    const res = await fetch(`/api/folders/${folderId}/uploads/presign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType, kind }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async confirmUpload(folderId: string, itemId: string, caption?: string, kind: "photo" | "video" = "photo"): Promise<Item> {
    const res = await fetch(`/api/folders/${folderId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, caption, kind }),
    });
    // 409 already_confirmed means the item exists — treat as success
    if (res.status === 409) return res.json();
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Items
  async getFolderItems(folderId: string): Promise<Item[]> {
    const data = await jsonOrNull(await fetch(`/api/folders/${folderId}/items`));
    return data ?? [];
  },
  async deleteItem(id: string): Promise<{ deleted: boolean }> {
    const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Album documents
  async getFolderDocuments(folderId: string): Promise<AlbumDocument[]> {
    const data = await jsonOrNull(await fetch(`/api/folders/${folderId}/documents`));
    return data ?? [];
  },
  async presignDocument(folderId: string, contentType: string): Promise<{ docId: string; uploadUrl: string }> {
    const res = await fetch(`/api/admin/folders/${folderId}/documents/presign`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d?.error ?? `Fehler ${res.status}`);
    }
    return res.json();
  },
  async confirmDocument(folderId: string, docId: string, filename: string, contentType: string): Promise<AlbumDocument> {
    const res = await fetch(`/api/admin/folders/${folderId}/documents`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ docId, filename, contentType }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d?.error ?? `Fehler ${res.status}`);
    }
    return res.json();
  },
  async deleteDocument(docId: string): Promise<void> {
    const res = await fetch(`/api/admin/documents/${docId}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
  },

  // Admin
  async getPending(): Promise<PendingItem[]> {
    const data = await jsonOrNull(await fetch("/api/admin/pending"));
    return data ?? [];
  },
  async approveItems(ids: string[]): Promise<{ approved: number }> {
    const res = await fetch("/api/admin/items/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async rejectItems(ids: string[]): Promise<{ rejected: number }> {
    const res = await fetch("/api/admin/items/reject", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async unapproveItems(ids: string[]): Promise<{ unapproved: number }> {
    const res = await fetch("/api/admin/items/unapprove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Reports
  async postReport(itemId: string, reason: string): Promise<{ ok: boolean }> {
    const res = await fetch(`/api/items/${itemId}/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (res.status === 404) throw Object.assign(new Error("not_found"), { status: 404 });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async getReports(): Promise<ReportItem[]> {
    const data = await jsonOrNull(await fetch("/api/admin/reports"));
    return data ?? [];
  },
  async patchReport(id: string, action: "ignore" | "answer" | "delete", response?: string): Promise<ReportItem> {
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, response }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Trash
  async getTrash(): Promise<TrashItem[]> {
    const data = await jsonOrNull(await fetch("/api/admin/trash"));
    return data ?? [];
  },
  async restoreTrashItem(itemId: string): Promise<{ ok: boolean }> {
    const res = await fetch(`/api/admin/trash/${itemId}/restore`, { method: "POST" });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async purgeTrashItem(itemId: string): Promise<{ ok: boolean }> {
    const res = await fetch(`/api/admin/trash/${itemId}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Users
  async getUsers(): Promise<User[]> {
    const data = await jsonOrNull(await fetch("/api/admin/users"));
    return data ?? [];
  },
  async createUser(body: { email: string; role?: "admin" | "member"; classId?: string | null }): Promise<User> {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async updateUser(id: string, body: { status?: string; role?: "admin" | "member"; classId?: string | null }): Promise<{ user?: User; error?: string }> {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.error === "cannot_modify_self") return { error: "cannot_modify_self" };
      throw new Error(data?.error ?? `Fehler ${res.status}`);
    }
    // The PATCH route returns the updated user object directly (not wrapped).
    const updated = (await res.json()) as User;
    return { user: updated };
  },

  async assignClass(userIds: string[], classId: string | null): Promise<User[]> {
    const res = await fetch(`/api/admin/users/assign-class`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds, classId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? `Fehler ${res.status}`);
    }
    return (await res.json()) as User[];
  },
};
