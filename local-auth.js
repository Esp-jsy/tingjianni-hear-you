const DB_NAME = "hear-you-accounts";
const DB_VERSION = 1;
const STORE_NAME = "accounts";
const SESSION_KEY = "tingjianni.session.v1";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 150000;
const USERNAME_PATTERN = /^[\p{L}\p{N}_-]{2,20}$/u;

export class LocalAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "LocalAuthError";
  }
}

function validateRegistration(input) {
  const { username, password, displayName } = input || {};
  const trimmedUsername = String(username ?? "").trim();
  if (!USERNAME_PATTERN.test(trimmedUsername)) {
    throw new LocalAuthError(
      "用户名需要 2～20 个字符，可使用中文、字母、数字、下划线或短横线。"
    );
  }

  if (typeof password !== "string" || password.length < 8) {
    throw new LocalAuthError("密码至少需要 8 位。");
  }
  if (password.length > 72) {
    throw new LocalAuthError("密码过长，请控制在 72 个字符以内。");
  }

  const trimmedDisplayName = String(displayName ?? "").trim();
  if ([...trimmedDisplayName].length > 20) {
    throw new LocalAuthError("昵称最多 20 个字符。");
  }

  return {
    username: trimmedUsername,
    password,
    displayName: trimmedDisplayName || trimmedUsername
  };
}

function validateLogin(input) {
  const { username, password } = input || {};
  const trimmedUsername = String(username ?? "").trim();
  if (!trimmedUsername || typeof password !== "string" || !password) {
    throw new LocalAuthError("请输入用户名和密码。");
  }
  if (password.length > 72) {
    throw new LocalAuthError("用户名或密码不正确。");
  }
  return { username: trimmedUsername, password };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new LocalAuthError("无法打开浏览器本地账号数据库，请检查浏览器存储权限。"));
    request.onblocked = () =>
      reject(new LocalAuthError("浏览器本地账号数据库被其他页面占用，请关闭其他标签页后重试。"));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAccount(database, key) {
  const transaction = database.transaction(STORE_NAME, "readonly");
  return requestResult(transaction.objectStore(STORE_NAME).get(key));
}

async function writeAccount(database, account) {
  const transaction = database.transaction(STORE_NAME, "readwrite");
  await requestResult(transaction.objectStore(STORE_NAME).add(account));
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function derivePasswordHash(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

function readSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!session || typeof session.key !== "string" || typeof session.expiresAt !== "number") {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function writeSession(account) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ key: account.key, expiresAt: Date.now() + SESSION_TTL_MS })
  );
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function publicUser(account) {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    createdAt: account.createdAt
  };
}

export function createLocalAuth() {
  if (!("indexedDB" in window) || !window.crypto?.subtle) {
    throw new LocalAuthError(
      "当前浏览器无法使用本地账号数据库，请换用现代浏览器或通过 npm start 启动服务器。"
    );
  }

  let databasePromise = null;
  const database = () => {
    databasePromise ||= openDatabase();
    return databasePromise;
  };

  return {
    async register(input) {
      const values = validateRegistration(input);
      const db = await database();
      const key = values.username.toLowerCase();

      if (await readAccount(db, key)) {
        throw new LocalAuthError("这个用户名已经被注册，可以直接登录。");
      }

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const passwordHash = await derivePasswordHash(
        values.password,
        salt,
        PASSWORD_ITERATIONS
      );
      const account = {
        key,
        id: crypto.randomUUID?.() || bytesToHex(crypto.getRandomValues(new Uint8Array(16))),
        username: values.username,
        displayName: values.displayName,
        salt: bytesToHex(salt),
        passwordHash: bytesToHex(passwordHash),
        iterations: PASSWORD_ITERATIONS,
        createdAt: new Date().toISOString()
      };

      await writeAccount(db, account);
      writeSession(account);
      return { user: publicUser(account) };
    },

    async login(input) {
      const values = validateLogin(input);
      const db = await database();
      const account = await readAccount(db, values.username.toLowerCase());
      if (!account) {
        throw new LocalAuthError("用户名或密码不正确。");
      }

      const passwordHash = await derivePasswordHash(
        values.password,
        hexToBytes(account.salt),
        account.iterations
      );
      if (bytesToHex(passwordHash) !== account.passwordHash) {
        throw new LocalAuthError("用户名或密码不正确。");
      }

      writeSession(account);
      return { user: publicUser(account) };
    },

    async currentUser() {
      const session = readSession();
      if (!session) return null;
      if (session.expiresAt <= Date.now()) {
        clearSession();
        return null;
      }

      const db = await database();
      const account = await readAccount(db, session.key);
      if (!account) {
        clearSession();
        return null;
      }
      return publicUser(account);
    },

    async logout() {
      clearSession();
    }
  };
}
