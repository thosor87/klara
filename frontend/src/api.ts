export interface Me { id: string; email: string; role: "admin" | "member"; status: string; }

export interface Folder {
  id: string;
  name: string;
  schoolYear: string;
  classLabel: string;
  enabled: boolean;
  itemCount: number;
}

export interface Item {
  id: string;
  caption: string;
  status: string;
  createdAt: string;
  thumbUrl: string;
  webUrl: string;
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
  async requestLogin(email: string): Promise<void> {
    const res = await fetch("/api/auth/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error(`requestLogin failed: ${res.status}`);
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
  async createFolder(body: { name: string; schoolYear?: string; classLabel?: string }): Promise<Folder> {
    const res = await fetch("/api/admin/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async updateFolder(id: string, body: { name?: string; schoolYear?: string; classLabel?: string; enabled?: boolean }): Promise<Folder> {
    const res = await fetch(`/api/admin/folders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
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
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Items
  async getFolderItems(folderId: string): Promise<Item[]> {
    const data = await jsonOrNull(await fetch(`/api/folders/${folderId}/items`));
    return data ?? [];
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
    if (res.status === 400) {
      const data = await res.json().catch(() => ({}));
      if (data?.error === "cannot_modify_self") return { error: "cannot_modify_self" };
    }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};
