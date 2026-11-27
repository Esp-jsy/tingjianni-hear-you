import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createAuthStore } from "../auth.mjs";
import { ProfileError, createProfileStore } from "../profiles.mjs";

function setup() {
  const db = new DatabaseSync(":memory:");
  const auth = createAuthStore(db);
  const profiles = createProfileStore(db);
  const { user } = auth.register({
    username: "linxia",
    password: "password123",
    displayName: "林夏"
  });
  return { profiles, user };
}

test("profile store saves and loads a normalized profile", () => {
  const { profiles, user } = setup();
  const saved = profiles.save(user.id, {
    name: " 林夏 ",
    gender: "female",
    intent: "friend",
    interests: ["咖啡", "咖啡", "散步"],
    answers: { happy: "  遇到一只橘猫。 " }
  });

  assert.equal(saved.profile.name, "林夏");
  assert.equal(saved.profile.gender, "female");
  assert.deepEqual(saved.profile.interests, ["咖啡", "散步"]);

  const loaded = profiles.get(user.id);
  assert.ok(loaded);
  assert.equal(loaded.profile.answers.happy, "遇到一只橘猫。");
  assert.ok(loaded.updatedAt);
});

test("profile store rejects oversized photos", () => {
  const { profiles, user } = setup();
  const photo = `data:image/jpeg;base64,${"a".repeat(410 * 1024)}`;
  assert.throws(
    () => profiles.save(user.id, { name: "林夏", photo }),
    (error) => error instanceof ProfileError && error.status === 413
  );
});

test("profile store falls back to undisclosed gender and strips unsafe photos", () => {
  const { profiles, user } = setup();
  const saved = profiles.save(user.id, {
    name: "林夏",
    gender: "unknown",
    photo: "https://example.com/photo.jpg"
  });

  assert.equal(saved.profile.gender, "undisclosed");
  assert.equal(saved.profile.photo, "");
});

test("profile store updates an existing record", () => {
  const { profiles, user } = setup();
  profiles.save(user.id, { name: "林夏", gender: "female" });
  const updated = profiles.save(user.id, { name: "林夏夏", gender: "female" });

  assert.equal(updated.profile.name, "林夏夏");
  assert.equal(profiles.get(user.id).profile.name, "林夏夏");
});
