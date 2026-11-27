import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AuthError } from "../auth.mjs";
import { createJsonStores, ensureSeeded } from "../json-store.mjs";
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

test("json store lists saved profiles as recommendation candidates", () => {
  const { auth, profiles } = setup();
  const first = auth.register({ username: "linxia", password: "password123" }).user;
  const second = auth.register({ username: "ahang", password: "password123" }).user;

  profiles.save(first.id, { name: "林夏", gender: "female", interests: ["咖啡", "散步"] });
  profiles.save(second.id, { name: "阿航", gender: "male", interests: ["徒步", "咖啡"] });

  const list = profiles.list();
  assert.equal(list.length, 2);
  assert.deepEqual(
    list.map((item) => item.profile.name).sort(),
    ["林夏", "阿航"].sort()
  );
  assert.ok(list.every((item) => item.username && item.updatedAt));
});

test("json store seeds a fresh database from the previous deployment snapshot", () => {
  const seedDir = mkdtempSync(join(tmpdir(), "hear-you-seed-"));
  const seedPath = join(seedDir, "accounts.json");
  const seedStores = createJsonStores(seedPath);
  seedStores.auth.register({
    username: "kept",
    password: "password123",
    displayName: "保留账号"
  });

  const freshDir = mkdtempSync(join(tmpdir(), "hear-you-fresh-"));
  const storePath = join(freshDir, "hear-you.json");
  assert.equal(ensureSeeded(storePath, seedPath), true);

  const stores = createJsonStores(storePath);
  const { user } = stores.auth.login({ username: "kept", password: "password123" });
  assert.equal(user.username, "kept");
  assert.equal(ensureSeeded(storePath, seedPath), false);
});

test("json store persists invites after reopening", () => {
  const dir = mkdtempSync(join(tmpdir(), "hear-you-invites-"));
  const storePath = join(dir, "hear-you.json");
  const stores = createJsonStores(storePath);
  const a = stores.auth.register({
    username: "json-a",
    password: "password123",
    displayName: "发起者"
  }).user;
  const b = stores.auth.register({
    username: "json-b",
    password: "password123",
    displayName: "接收者"
  }).user;

  const invite = stores.invites.create({
    fromUserId: a.id,
    toUserId: b.id,
    place: "城市书房",
    time: "周六 15:00",
    message: "一起读书吗？"
  });
  assert.equal(invite.status, "pending");

  const reopened = createJsonStores(storePath);
  const received = reopened.invites.list(b.id);
  assert.equal(received.received.length, 1);
  assert.equal(received.unread, 1);

  const responded = reopened.invites.respond(b.id, invite.id, "accepted", "可以。");
  assert.equal(responded.status, "accepted");
  assert.equal(reopened.invites.list(a.id).unread, 1);
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
