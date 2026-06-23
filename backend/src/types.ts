export type UserRole = "admin" | "member";
export type UserStatus = "pending" | "active" | "disabled";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  classId: string | null;
  createdAt: string;
}

export interface LoginTokenRow {
  id: string;
  email: string;
  codeHash: string;
  linkTokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  attempts: number;
}
