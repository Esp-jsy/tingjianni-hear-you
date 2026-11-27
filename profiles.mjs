import { normalizedProfile } from "./logic.js";

const MAX_PHOTO_LENGTH = 400 * 1024;

export class ProfileError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ProfileError";
    this.status = status;
  }
}

export function createProfileStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const findProfile = db.prepare(
    "SELECT data, updated_at FROM profiles WHERE user_id = ?"
  );
  const upsertProfile = db.prepare(
    `INSERT INTO profiles (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  );

  return {
    get(userId) {
      const row = findProfile.get(userId);
      if (!row) return null;
      return { profile: JSON.parse(row.data), updatedAt: row.updated_at };
    },

    save(userId, input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new ProfileError(400, "资料格式不正确。");
      }

      const profile = normalizedProfile(input);
      if (profile.photo.length > MAX_PHOTO_LENGTH) {
        throw new ProfileError(413, "照片过大，请换一张更小的图片。");
      }

      const updatedAt = new Date().toISOString();
      upsertProfile.run(userId, JSON.stringify(profile), updatedAt);
      return { profile, updatedAt };
    }
  };
}
