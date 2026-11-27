import { createHash } from "node:crypto";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_FRAME_BYTES = 1024 * 1024;

export function websocketAccept(key) {
  return createHash("sha1").update(`${key}${WS_GUID}`).digest("base64");
}

function frame(opcode, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || "");
  const length = data.length;
  let header;

  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, data]);
}

export function encodeText(text) {
  return frame(0x1, text);
}

export function encodePing(payload = "") {
  return frame(0x9, payload);
}

export function encodePong(payload = "") {
  return frame(0xa, payload);
}

export function encodeClose(code = 1000) {
  const payload = Buffer.alloc(2);
  payload.writeUInt16BE(code, 0);
  return frame(0x8, payload);
}

export function createFrameParser({ onText, onPing, onClose } = {}) {
  let buffer = Buffer.alloc(0);

  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const first = buffer[0];
      const second = buffer[1];
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      if (length > MAX_FRAME_BYTES) {
        throw new Error("WebSocket frame too large");
      }

      const maskOffset = offset;
      if (masked) offset += 4;
      if (buffer.length < offset + length) return;

      let payload = Buffer.from(buffer.subarray(offset, offset + length));
      if (masked) {
        const mask = buffer.subarray(maskOffset, maskOffset + 4);
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= mask[index % 4];
        }
      }

      buffer = buffer.subarray(offset + length);
      if (!fin) continue;

      if (opcode === 0x1) onText?.(payload.toString("utf8"));
      else if (opcode === 0x9) onPing?.(payload);
      else if (opcode === 0x8) {
        onClose?.();
        return;
      }
    }
  };
}

export function createRealtimeHub() {
  const clients = new Map();

  return {
    add(socket, userId) {
      clients.set(socket, Number(userId));
    },

    remove(socket) {
      clients.delete(socket);
    },

    size() {
      return clients.size;
    },

    notify(userId, payload) {
      const message = encodeText(JSON.stringify(payload));
      for (const [socket, clientUserId] of clients) {
        if (clientUserId !== Number(userId) || socket.destroyed) continue;
        try {
          socket.write(message);
        } catch {
          clients.delete(socket);
        }
      }
    },

    broadcast(payload) {
      const message = encodeText(JSON.stringify(payload));
      for (const [socket] of clients) {
        if (socket.destroyed) continue;
        try {
          socket.write(message);
        } catch {
          clients.delete(socket);
        }
      }
    }
  };
}
