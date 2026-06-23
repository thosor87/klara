export interface Me { id: string; email: string; role: "admin" | "member"; status: string; }

/** Klares Feedback auf einen Login-Request (kein generisches "Mail gesendet"). */
export type RequestLoginOutcome = "code_sent" | "pending" | "denied";

export interface Folder {
  id: string;
  name: string;
  schoolYear?: string;
  classLabel?: string;
  enabled: boolean;
  itemCount: number;
  sortOrder?: number;
  startDate?: string | null;
  endDate?: string | null;
  coverItemId?: string | null;
  coverThumbUrl?: string | null;
}

export interface ClassOption {
  id: string;
  label: string;
  sortOrder: number;
  createdAt: string;
}

export interface Item {
  id: string;
  caption: string;
  status: string;
  createdAt: string;
  thumbUrl: string;
  webUrl: string;
  mine?: boolean;
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
    schoolYear?: string;
    classLabel?: string;
    startDate?: string | null;
    endDate?: string | null;
    coverItemId?: string | null;
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
    schoolYear?: string;
    classLabel?: string;
    enabled?: boolean;
    startDate?: string | null;
    endDate?: string | null;
    coverItemId?: string | null;
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
  async addClassOption(label: string): Promise<ClassOption> {
    const res = await fetch("/api/admin/class-options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label }),
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
  async presignUpload(folderId: string, contentType: string): Promise<PresignResult> {
    const res = await fetch(`/api/folders/${folderId}/uploads/presign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async confirmUpload(folderId: string, itemId: string, caption?: string): Promise<Item> {
    const res = await fetch(`/api/folders/${folderId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, caption }),
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

  // Users
  async getUsers(): Promise<User[]> {
    const data = await jsonOrNull(await fetch("/api/admin/users"));
    return data ?? [];
  },
  async createUser(body: { email: string; role?: "admin" | "member" }): Promise<User> {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async updateUser(id: string, body: { status?: string; role?: "admin" | "member" }): Promise<{ user?: User; error?: string }> {
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
    return res.json();
  },
};
