const MAX_TEXT_LENGTH = 120;
const STATUSES = new Set(["pending", "accepted", "declined"]);

export class InviteError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "InviteError";
    this.status = status;
  }
}

function cleanText(value, label, { required = false } = {}) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new InviteError(400, `请填写${label}。`);
  if (text.length > MAX_TEXT_LENGTH) {
    throw new InviteError(400, `${label}不能超过 ${MAX_TEXT_LENGTH} 个字符。`);
  }
  return text;
}

function mapInvite(row, viewerId) {
  const direction = row.to_user_id === viewerId ? "received" : "sent";
  const unread =
    direction === "received"
      ? row.status === "pending" && !row.recipient_read_at
      : row.status !== "pending" && !row.sender_read_at;
  return {
    id: Number(row.id),
    fromUserId: Number(row.from_user_id),
    toUserId: Number(row.to_user_id),
    fromName: row.from_name,
    toName: row.to_name,
    place: row.place,
    time: row.time,
    message: row.message,
    status: row.status,
    responseMessage: row.response_message,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    direction,
    unread
  };
}

export function createInviteStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      place TEXT NOT NULL,
      time TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      response_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      responded_at TEXT,
      recipient_read_at TEXT,
      sender_read_at TEXT
    );
  `);

  const selectInvite = db.prepare(`
    SELECT i.*, f.display_name AS from_name, t.display_name AS to_name
    FROM invites i
    JOIN users f ON f.id = i.from_user_id
    JOIN users t ON t.id = i.to_user_id
    WHERE i.id = ?
  `);
  const selectInvites = db.prepare(`
    SELECT i.*, f.display_name AS from_name, t.display_name AS to_name
    FROM invites i
    JOIN users f ON f.id = i.from_user_id
    JOIN users t ON t.id = i.to_user_id
    WHERE i.from_user_id = ? OR i.to_user_id = ?
    ORDER BY i.created_at DESC, i.id DESC
    LIMIT 50
  `);
  const findUser = db.prepare("SELECT id, display_name FROM users WHERE id = ?");
  const findPending = db.prepare(`
    SELECT id FROM invites
    WHERE status = 'pending'
      AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
    LIMIT 1
  `);
  const insertInvite = db.prepare(`
    INSERT INTO invites (from_user_id, to_user_id, place, time, message, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `);
  const updateStatus = db.prepare(`
    UPDATE invites
    SET status = ?, response_message = ?, responded_at = ?, recipient_read_at = ?
    WHERE id = ?
  `);
  const markSenderRead = db.prepare("UPDATE invites SET sender_read_at = ? WHERE id = ?");
  const markRecipientRead = db.prepare("UPDATE invites SET recipient_read_at = ? WHERE id = ?");

  return {
    create({ fromUserId, toUserId, place, time, message }) {
      const recipient = findUser.get(Number(toUserId));
      if (!recipient) throw new InviteError(404, "没有找到要邀请的账号。");
      if (Number(toUserId) === Number(fromUserId)) {
        throw new InviteError(400, "不能邀请自己。");
      }
      if (findPending.get(fromUserId, toUserId, toUserId, fromUserId)) {
        throw new InviteError(409, "你们之间已有待回应的邀请。");
      }

      const createdAt = new Date().toISOString();
      const result = insertInvite.run(
        fromUserId,
        toUserId,
        cleanText(place, "见面地点", { required: true }),
        cleanText(time, "见面时间", { required: true }),
        cleanText(message, "附言"),
        createdAt
      );
      return mapInvite(selectInvite.get(result.lastInsertRowid), fromUserId);
    },

    list(viewerId) {
      const items = selectInvites.all(viewerId, viewerId).map((row) => mapInvite(row, viewerId));
      return {
        received: items.filter((item) => item.direction === "received"),
        sent: items.filter((item) => item.direction === "sent"),
        unread: items.filter((item) => item.unread).length
      };
    },

    respond(viewerId, inviteId, action, message) {
      if (action !== "accepted" && action !== "declined") {
        throw new InviteError(400, "请选择同意或婉拒。");
      }
      const row = selectInvite.get(Number(inviteId));
      if (!row) throw new InviteError(404, "没有找到这条邀请。");
      if (Number(row.to_user_id) !== Number(viewerId)) {
        throw new InviteError(403, "只有收到邀请的人可以回应。");
      }
      if (row.status !== "pending") throw new InviteError(409, "这条邀请已经回应过了。");

      const now = new Date().toISOString();
      updateStatus.run(
        action,
        cleanText(message, "回复"),
        now,
        now,
        inviteId
      );
      return mapInvite(selectInvite.get(Number(inviteId)), viewerId);
    },

    markRead(viewerId, inviteId) {
      const row = selectInvite.get(Number(inviteId));
      if (!row) throw new InviteError(404, "没有找到这条邀请。");
      const isSender = Number(row.from_user_id) === Number(viewerId);
      const isRecipient = Number(row.to_user_id) === Number(viewerId);
      if (!isSender && !isRecipient) throw new InviteError(404, "没有找到这条邀请。");

      const now = new Date().toISOString();
      if (isSender) {
        markSenderRead.run(now, inviteId);
      } else {
        markRecipientRead.run(now, inviteId);
      }
      return mapInvite(selectInvite.get(Number(inviteId)), viewerId);
    }
  };
}
