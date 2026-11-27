import test from "node:test";
import assert from "node:assert/strict";
import {
  createFrameParser,
  createRealtimeHub,
  encodeText,
  websocketAccept
} from "../realtime.mjs";

function maskedFrame(opcode, payload) {
  const data = Buffer.from(payload);
  const mask = Buffer.from([1, 2, 3, 4]);
  const header = Buffer.from([0x80 | opcode, 0x80 | data.length]);
  const masked = Buffer.from(data);
  for (let index = 0; index < masked.length; index += 1) {
    masked[index] ^= mask[index % 4];
  }
  return Buffer.concat([header, mask, masked]);
}

test("WebSocket 握手 accept 值符合 RFC 示例", () => {
  assert.equal(
    websocketAccept("dGhlIHNhbXBsZSBub25jZQ=="),
    "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
  );
});

test("编码文本帧带有 FIN 与长度", () => {
  const frame = encodeText("hello");
  assert.equal(frame[0], 0x81);
  assert.equal(frame[1], 5);
  assert.equal(frame.subarray(2).toString(), "hello");
});

test("解析分片到达的掩码文本帧", () => {
  const messages = [];
  const parse = createFrameParser({ onText: (text) => messages.push(text) });
  const frame = maskedFrame(0x1, "你好");

  parse(frame.subarray(0, 2));
  assert.deepEqual(messages, []);
  parse(frame.subarray(2));

  assert.deepEqual(messages, ["你好"]);
});

test("解析 ping 帧并保留负载", () => {
  const pings = [];
  const parse = createFrameParser({ onPing: (payload) => pings.push(payload.toString()) });
  parse(maskedFrame(0x9, "beat"));
  assert.deepEqual(pings, ["beat"]);
});

test("实时中心只向目标用户推送", () => {
  const hub = createRealtimeHub();
  const first = { destroyed: false, chunks: [], write(chunk) { this.chunks.push(chunk); } };
  const second = { destroyed: false, chunks: [], write(chunk) { this.chunks.push(chunk); } };
  hub.add(first, 1);
  hub.add(second, 2);

  hub.notify(1, { type: "invites", event: "created" });

  assert.equal(first.chunks.length, 1);
  assert.equal(second.chunks.length, 0);
  assert.match(first.chunks[0].toString(), /invites/);
});
