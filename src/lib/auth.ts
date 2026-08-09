import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import db from "./db";

export const SESSION_COOKIE = "citable_session";
const SESSION_TTL_DAYS = 30;

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

// scrypt (Node's built-in, no extra native dependency) instead of bcrypt —
// this app already ships one native module (better-sqlite3); no reason to
// add a second just for password hashing.
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

function rowToUser(row: UserRow): AuthUser {
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

export class AuthError extends Error {}

/** Creates an account. Throws AuthError on a duplicate email or a too-short password. */
export function registerUser(email: string, password: string): AuthUser {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AuthError("Enter a valid email address.");
  }
  if (password.length < 8) {
    throw new AuthError("Password must be at least 8 characters.");
  }

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(normalizedEmail);
  if (existing) {
    throw new AuthError("An account with that email already exists.");
  }

  const id = randomUUID();
  db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)`).run(
    id,
    normalizedEmail,
    hashPassword(password)
  );

  return { id, email: normalizedEmail, createdAt: new Date().toISOString() };
}

/** Returns the user on a correct email+password, or null. Never throws on bad credentials. */
export function verifyCredentials(email: string, password: string): AuthUser | null {
  const normalizedEmail = email.trim().toLowerCase();
  const row = db.prepare(`SELECT * FROM users WHERE email = ?`).get(normalizedEmail) as UserRow | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return rowToUser(row);
}

/** Issues a new session token for a user, valid for SESSION_TTL_DAYS. */
export function createSession(userId: string): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
    token,
    userId,
    expiresAt.toISOString()
  );
  return { token, expiresAt };
}

export function deleteSession(token: string): void {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

/** Resolves a session cookie value to its user, or null if missing/expired/invalid. */
export function getUserForSession(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .get(token) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}
