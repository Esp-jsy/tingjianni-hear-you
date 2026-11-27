import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const USERNAME_PATTERN = /^[\p{L}\p{N}_-]{2,20}$/u;
const MAX_PASSWORD_LENGTH = 72;
const MIN_PASSWORD_LENGTH = 8;
const HASH_LENGTH = 64;

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, HASH_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  if (!expected.length) return false;
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

function validateRegistration({ username, password, displayName } = {}) {
  const trimmedUsername = String(username ?? "").trim();
  if (!USERNAME_PATTERN.test(trimmedUsername)) {
    throw new AuthError(
      400,
      "用户名需要 2～20 个字符，可使用中文、字母、数字、下划线或短横线。"
    );
  }

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(400, `密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new AuthError(400, "密码过长，请控制在 72 个字符以内。");
  }

  const trimmedDisplayName = String(displayName ?? "").trim();
  if ([...trimmedDisplayName].length > 20) {
    throw new AuthError(400, "昵称最多 20 个字符。");
  }

  return {
    username: trimmedUsername,
    password,
    displayName: trimmedDisplayName || trimmedUsername
  };
}

function mapUser(row) {
  return {
    id: Number(row.id),
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at
  };
}

export function createAuthStore(db, { sessionTtlMs = SESSION_TTL_MS } = {}) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  `);

  const findUserByUsername = db.prepare(
    "SELECT id, username, display_name, password_hash, created_at FROM users WHERE username = ?"
  );
  const insertUser = db.prepare(
    "INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)"
  );
  const insertSession = db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  );
  const findSession = db.prepare(
    `SELECT u.id, u.username, u.display_name, u.created_at, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  );
  const deleteSession = db.prepare("DELETE FROM sessions WHERE token = ?");
  const deleteExpiredSessions = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");

  deleteExpiredSessions.run(Date.now());

  function createSession(userId) {
    const token = randomBytes(32).toString("hex");
    const now = Date.now();
    insertSession.run(token, userId, now + sessionTtlMs, now);
    return token;
  }

  return {
    register({ username, password, displayName } = {}) {
      const values = validateRegistration({ username, password, displayName });
      if (findUserByUsername.get(values.username)) {
        throw new AuthError(409, "这个用户名已经被注册，可以直接登录。");
      }

      let result;
      const createdAt = new Date().toISOString();
      try {
        result = insertUser.run(
          values.username,
          values.displayName,
          hashPassword(values.password),
          createdAt
        );
      } catch (error) {
        if (/UNIQUE constraint failed/.test(error.message)) {
          throw new AuthError(409, "这个用户名已经被注册，可以直接登录。");
        }
        throw error;
      }

      const user = {
        id: Number(result.lastInsertRowid),
        username: values.username,
        displayName: values.displayName,
        createdAt
      };
      return { user, token: createSession(user.id) };
    },

    login({ username, password } = {}) {
      const trimmedUsername = String(username ?? "").trim();
      if (!trimmedUsername || typeof password !== "string" || !password) {
        throw new AuthError(400, "请输入用户名和密码。");
      }
      if (password.length > MAX_PASSWORD_LENGTH) {
        throw new AuthError(401, "用户名或密码不正确。");
      }

      const row = findUserByUsername.get(trimmedUsername);
      if (!row || !verifyPassword(password, row.password_hash)) {
        throw new AuthError(401, "用户名或密码不正确。");
      }

      return {
        user: mapUser(row),
        token: createSession(Number(row.id))
      };
    },

    userForSession(token) {
      if (typeof token !== "string" || !token || token.length > 128) return null;
      const row = findSession.get(token);
      if (!row) return null;
      if (Number(row.expires_at) <= Date.now()) {
        deleteSession.run(token);
        return null;
      }
      return mapUser(row);
    },

    logout(token) {
      if (typeof token === "string" && token) deleteSession.run(token);
    }
  };
}
