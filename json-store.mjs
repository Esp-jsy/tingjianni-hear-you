import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";
import { AuthError, SESSION_TTL_MS } from "./auth.mjs";
import { normalizedProfile } from "./logic.js";
import { ProfileError } from "./profiles.mjs";
import { InviteError } from "./invites.mjs";

const USERNAME_PATTERN = /^[\p{L}\p{N}_-]{2,20}$/u;
const MAX_PASSWORD_LENGTH = 72;
const MIN_PASSWORD_LENGTH = 8;
const HASH_LENGTH = 64;
const MAX_PHOTO_LENGTH = 400 * 1024;

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

function mapUser(user) {
  return {
    id: Number(user.id),
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt
  };
}

export function ensureSeeded(storePath, seedPath) {
  if (!seedPath || existsSync(storePath) || !existsSync(seedPath)) return false;
  mkdirSync(dirname(storePath), { recursive: true });
  copyFileSync(seedPath, storePath);
  return true;
}

export function createJsonStores(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });

  function readData() {
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      return {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        profiles: parsed.profiles && typeof parsed.profiles === "object" ? parsed.profiles : {},
        nextUserId: Number(parsed.nextUserId) || 1,
        invites: Array.isArray(parsed.invites) ? parsed.invites : [],
        nextInviteId: Number(parsed.nextInviteId) || 1
      };
    } catch {
      return { users: [], sessions: [], profiles: {}, nextUserId: 1, invites: [], nextInviteId: 1 };
    }
  }

  const data = readData();

  function persist() {
    writeFileSync(filePath, JSON.stringify(data));
  }

  const now = Date.now();
  const activeSessions = data.sessions.filter((session) => session.expiresAt > now);
  if (activeSessions.length !== data.sessions.length) {
    data.sessions = activeSessions;
    persist();
  }

  function createSession(userId) {
    const token = randomBytes(32).toString("hex");
    const createdAt = Date.now();
    data.sessions.push({
      token,
      userId,
      expiresAt: createdAt + SESSION_TTL_MS,
      createdAt
    });
    persist();
    return token;
  }

  const auth = {
    register({ username, password, displayName } = {}) {
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

      const duplicated = data.users.some(
        (user) => user.username.toLowerCase() === trimmedUsername.toLowerCase()
      );
      if (duplicated) {
        throw new AuthError(409, "这个用户名已经被注册，可以直接登录。");
      }

      const user = {
        id: data.nextUserId++,
        username: trimmedUsername,
        displayName: trimmedDisplayName || trimmedUsername,
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString()
      };
      data.users.push(user);
      persist();

      return { user: mapUser(user), token: createSession(user.id) };
    },

    login({ username, password } = {}) {
      const trimmedUsername = String(username ?? "").trim();
      if (!trimmedUsername || typeof password !== "string" || !password) {
        throw new AuthError(400, "请输入用户名和密码。");
      }
      if (password.length > MAX_PASSWORD_LENGTH) {
        throw new AuthError(401, "用户名或密码不正确。");
      }

      const user = data.users.find(
        (item) => item.username.toLowerCase() === trimmedUsername.toLowerCase()
      );
      if (!user || !verifyPassword(password, user.passwordHash)) {
        throw new AuthError(401, "用户名或密码不正确。");
      }

      return { user: mapUser(user), token: createSession(user.id) };
    },

    userForSession(token) {
      if (typeof token !== "string" || !token || token.length > 128) return null;

      const session = data.sessions.find((item) => item.token === token);
      if (!session) return null;
      if (session.expiresAt <= Date.now()) {
        data.sessions = data.sessions.filter((item) => item.token !== token);
        persist();
        return null;
      }

      const user = data.users.find((item) => item.id === session.userId);
      return user ? mapUser(user) : null;
    },

    logout(token) {
      if (typeof token !== "string" || !token) return;
      const before = data.sessions.length;
      data.sessions = data.sessions.filter((item) => item.token !== token);
      if (data.sessions.length !== before) persist();
    }
  };

  const profiles = {
    get(userId) {
      const record = data.profiles[String(userId)];
      if (!record) return null;
      return { profile: record.profile, updatedAt: record.updatedAt };
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
      data.profiles[String(userId)] = { profile, updatedAt };
      persist();
      return { profile, updatedAt };
    },

    list(limit = 20) {
      return Object.entries(data.profiles)
        .map(([userId, record]) => {
          const user = data.users.find((item) => item.id === Number(userId));
          if (!user) return null;
          return {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            profile: record.profile,
            updatedAt: record.updatedAt
          };
        })
        .filter(Boolean)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, limit);
    }
  };

  const invites = {
    create({ fromUserId, toUserId, place, time, message }) {
      const recipient = data.users.find((user) => user.id === Number(toUserId));
      if (!recipient) throw new InviteError(404, "没有找到要邀请的账号。");
      if (Number(toUserId) === Number(fromUserId)) {
        throw new InviteError(400, "不能邀请自己。");
      }
      const pending = data.invites.some(
        (invite) =>
          invite.status === "pending" &&
          ((invite.fromUserId === Number(fromUserId) && invite.toUserId === Number(toUserId)) ||
            (invite.fromUserId === Number(toUserId) && invite.toUserId === Number(fromUserId)))
      );
      if (pending) throw new InviteError(409, "你们之间已有待回应的邀请。");

      const clean = (value, label, required = false) => {
        const text = typeof value === "string" ? value.trim() : "";
        if (required && !text) throw new InviteError(400, `请填写${label}。`);
        if (text.length > 120) throw new InviteError(400, `${label}不能超过 120 个字符。`);
        return text;
      };

      const invite = {
        id: data.nextInviteId++,
        fromUserId: Number(fromUserId),
        toUserId: Number(toUserId),
        place: clean(place, "见面地点", true),
        time: clean(time, "见面时间", true),
        message: clean(message, "附言"),
        status: "pending",
        responseMessage: "",
        createdAt: new Date().toISOString(),
        respondedAt: null,
        recipientReadAt: null,
        senderReadAt: null
      };
      data.invites.push(invite);
      persist();
      return mapJsonInvite(invite, fromUserId);
    },

    list(viewerId) {
      const items = data.invites
        .filter(
          (invite) =>
            invite.fromUserId === Number(viewerId) || invite.toUserId === Number(viewerId)
        )
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id)
        .slice(0, 50)
        .map((invite) => mapJsonInvite(invite, viewerId));
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
      const invite = data.invites.find((item) => item.id === Number(inviteId));
      if (!invite) throw new InviteError(404, "没有找到这条邀请。");
      if (invite.toUserId !== Number(viewerId)) {
        throw new InviteError(403, "只有收到邀请的人可以回应。");
      }
      if (invite.status !== "pending") throw new InviteError(409, "这条邀请已经回应过了。");
      const reply = typeof message === "string" ? message.trim() : "";
      if (reply.length > 120) throw new InviteError(400, "回复不能超过 120 个字符。");

      const now = new Date().toISOString();
      invite.status = action;
      invite.responseMessage = reply;
      invite.respondedAt = now;
      invite.recipientReadAt = now;
      persist();
      return mapJsonInvite(invite, viewerId);
    },

    markRead(viewerId, inviteId) {
      const invite = data.invites.find((item) => item.id === Number(inviteId));
      if (!invite) throw new InviteError(404, "没有找到这条邀请。");
      const isSender = invite.fromUserId === Number(viewerId);
      const isRecipient = invite.toUserId === Number(viewerId);
      if (!isSender && !isRecipient) throw new InviteError(404, "没有找到这条邀请。");

      const now = new Date().toISOString();
      if (isSender) {
        invite.senderReadAt = now;
      } else {
        invite.recipientReadAt = now;
      }
      persist();
      return mapJsonInvite(invite, viewerId);
    }
  };

  function mapJsonInvite(invite, viewerId) {
    const from = data.users.find((user) => user.id === invite.fromUserId);
    const to = data.users.find((user) => user.id === invite.toUserId);
    const direction = invite.toUserId === Number(viewerId) ? "received" : "sent";
    const unread =
      direction === "received"
        ? invite.status === "pending" && !invite.recipientReadAt
        : invite.status !== "pending" && !invite.senderReadAt;
    return {
      id: invite.id,
      fromUserId: invite.fromUserId,
      toUserId: invite.toUserId,
      fromName: from ? from.displayName : "已注销用户",
      toName: to ? to.displayName : "已注销用户",
      place: invite.place,
      time: invite.time,
      message: invite.message,
      status: invite.status,
      responseMessage: invite.responseMessage,
      createdAt: invite.createdAt,
      respondedAt: invite.respondedAt,
      direction,
      unread
    };
  }

  return { auth, profiles, invites };
}
