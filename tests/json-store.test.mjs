import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AuthError } from "../auth.mjs";
import { createJsonStores } from "../json-store.mjs";
import { ProfileError } from "../profiles.mjs";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "hear-you-json-"));
  const filePath = join(dir, "accounts.json");
  const stores = createJsonStores(filePath);
  return { dir, filePath, ...stores };
}

test("json store registers a user and resolves the session", () => {
  const { auth } = setup();
  const { user, token } = auth.register({
    username: "林夏",
    password: "password123",
    displayName: "小夏"
  });

  assert.equal(user.username, "林夏");
  assert.equal(user.displayName, "小夏");
  assert.equal(auth.userForSession(token).username, "林夏");
});

test("json store rejects duplicate usernames case-insensitively", () => {
  const { auth } = setup();
  auth.register({ username: "LinXia", password: "password123" });

  assert.throws(
    () => auth.register({ username: "linxia", password: "password123" }),
    (error) => error instanceof AuthError && error.status === 409
  );
});

test("json store verifies the password on login", () => {
  const { auth } = setup();
  auth.register({ username: "linxia", password: "password123" });

  assert.throws(
    () => auth.login({ username: "linxia", password: "wrongpass" }),
    (error) => error instanceof AuthError && error.status === 401
  );

  const { user, token } = auth.login({ username: "linxia", password: "password123" });
  assert.equal(user.username, "linxia");
  auth.logout(token);
  assert.equal(auth.userForSession(token), null);
});

test("json store saves and loads a profile with photo", () => {
  const { auth, profiles } = setup();
  const { user } = auth.register({ username: "linxia", password: "password123" });
  const photo = `data:image/jpeg;base64,${"a".repeat(2048)}`;

  const saved = profiles.save(user.id, { name: "林夏", gender: "female", photo });
  assert.equal(saved.profile.photo, photo);

  const loaded = profiles.get(user.id);
  assert.equal(loaded.profile.name, "林夏");
  assert.ok(loaded.updatedAt);
});

test("json store rejects oversized photos", () => {
  const { auth, profiles } = setup();
  const { user } = auth.register({ username: "linxia", password: "password123" });
  const photo = `data:image/jpeg;base64,${"a".repeat(410 * 1024)}`;

  assert.throws(
    () => profiles.save(user.id, { name: "林夏", photo }),
    (error) => error instanceof ProfileError && error.status === 413
  );
});

test("json store keeps data after reopening the file", () => {
  const { filePath, auth, profiles } = setup();
  const { user, token } = auth.register({ username: "linxia", password: "password123" });
  profiles.save(user.id, { name: "林夏", gender: "female" });

  const reopened = createJsonStores(filePath);
  assert.equal(reopened.auth.userForSession(token).username, "linxia");
  assert.equal(reopened.profiles.get(user.id).profile.name, "林夏");

  rmSync(filePath, { force: true });
});
