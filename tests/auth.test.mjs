import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { AuthError, createAuthStore } from "../auth.mjs";

function createStore(options) {
  const db = new DatabaseSync(":memory:");
  return { db, auth: createAuthStore(db, options) };
}

function isAuthError(status) {
  return (error) => error instanceof AuthError && error.status === status;
}

test("register creates an account and a session that identifies the user", () => {
  const { auth } = createStore();
  const { user, token } = auth.register({
    username: "林夏",
    password: "voice-first",
    displayName: "小林"
  });

  assert.ok(user.id > 0);
  assert.equal(user.username, "林夏");
  assert.equal(user.displayName, "小林");
  assert.equal(auth.userForSession(token).id, user.id);
});

test("register falls back to the username when no display name is given", () => {
  const { auth } = createStore();
  const { user } = auth.register({ username: "linxia", password: "password123" });
  assert.equal(user.displayName, "linxia");
});

test("duplicate usernames are rejected regardless of case", () => {
  const { auth } = createStore();
  auth.register({ username: "HearYou", password: "password123" });

  assert.throws(
    () => auth.register({ username: "hearyou", password: "password123" }),
    isAuthError(409)
  );
});

test("login verifies the stored password hash", () => {
  const { auth } = createStore();
  const registered = auth.register({ username: "linxia", password: "password123" });

  const { user, token } = auth.login({ username: "LINXIA", password: "password123" });
  assert.equal(user.id, registered.user.id);
  assert.equal(auth.userForSession(token).username, "linxia");

  assert.throws(
    () => auth.login({ username: "linxia", password: "wrong-password" }),
    isAuthError(401)
  );
});

test("invalid registration input is rejected", () => {
  const { auth } = createStore();

  assert.throws(
    () => auth.register({ username: "a", password: "password123" }),
    isAuthError(400)
  );
  assert.throws(
    () => auth.register({ username: "valid_name", password: "short" }),
    isAuthError(400)
  );
});

test("logout invalidates the session token", () => {
  const { auth } = createStore();
  const { token } = auth.register({ username: "linxia", password: "password123" });

  auth.logout(token);
  assert.equal(auth.userForSession(token), null);
});

test("expired sessions are rejected", () => {
  const { auth } = createStore({ sessionTtlMs: -1 });
  const { token } = auth.register({ username: "linxia", password: "password123" });
  assert.equal(auth.userForSession(token), null);
});

test("accounts survive closing and reopening the database file", () => {
  const directory = mkdtempSync(join(tmpdir(), "hear-you-auth-"));
  const databasePath = join(directory, "accounts.db");

  try {
    const firstDb = new DatabaseSync(databasePath);
    createAuthStore(firstDb).register({
      username: "returning",
      password: "password123",
      displayName: "回来的人"
    });
    firstDb.close();

    const secondDb = new DatabaseSync(databasePath);
    const { user } = createAuthStore(secondDb).login({
      username: "returning",
      password: "password123"
    });
    assert.equal(user.displayName, "回来的人");
    secondDb.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
