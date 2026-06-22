export interface Me { id: string; email: string; role: "admin" | "member"; status: string; }

async function jsonOrNull(res: Response): Promise<any> {
  if (!res.ok) return null;
  return res.json();
}

export const api = {
  async me(): Promise<Me | null> {
    const data = await jsonOrNull(await fetch("/api/me"));
    return data?.user ?? null;
  },
  async requestLogin(email: string): Promise<void> {
    await fetch("/api/auth/request", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
  },
  async verify(email: string, code: string): Promise<Me | null> {
    const data = await jsonOrNull(await fetch("/api/auth/verify", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code }) }));
    return data?.user ?? null;
  },
  async logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
  },
};
