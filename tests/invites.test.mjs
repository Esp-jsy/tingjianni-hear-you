import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createAuthStore } from "../auth.mjs";
import { InviteError, createInviteStore } from "../invites.mjs";

function setup() {
  const db = new DatabaseSync(":memory:");
  const auth = createAuthStore(db);
  const invites = createInviteStore(db);
  const a = auth.register({
    username: "invite-a",
    password: "password123",
    displayName: "发起者"
  }).user;
  const b = auth.register({
    username: "invite-b",
    password: "password123",
    displayName: "接收者"
  }).user;
  const c = auth.register({
    username: "invite-c",
    password: "password123",
    displayName: "旁观者"
  }).user;
  return { auth, invites, a, b, c };
}

test("创建邀请后双方都能在通知列表看到", () => {
  const { invites, a, b } = setup();
  const invite = invites.create({
    fromUserId: a.id,
    toUserId: b.id,
    place: "城市书房",
    time: "周六 15:00",
    message: "一起读书吗？"
  });
  assert.equal(invite.status, "pending");
  assert.equal(invite.direction, "sent");

  const senderView = invites.list(a.id);
  assert.equal(senderView.sent.length, 1);
  assert.equal(senderView.unread, 0);

  const receiverView = invites.list(b.id);
  assert.equal(receiverView.received.length, 1);
  assert.equal(receiverView.received[0].unread, true);
  assert.equal(receiverView.unread, 1);
});

test("接收者同意后发起者收到未读回应通知", () => {
  const { invites, a, b } = setup();
  const invite = invites.create({
    fromUserId: a.id,
    toUserId: b.id,
    place: "咖啡店",
    time: "周日 10:30",
    message: ""
  });

  const responded = invites.respond(b.id, invite.id, "accepted", "可以，靠窗的位置吧。");
  assert.equal(responded.status, "accepted");
  assert.equal(responded.responseMessage, "可以，靠窗的位置吧。");
  assert.equal(responded.unread, false);

  const senderView = invites.list(a.id);
  assert.equal(senderView.unread, 1);
  assert.equal(senderView.sent[0].status, "accepted");

  invites.markRead(a.id, invite.id);
  assert.equal(invites.list(a.id).unread, 0);
});

test("只有接收者能回应，且不能重复回应", () => {
  const { invites, a, b, c } = setup();
  const invite = invites.create({
    fromUserId: a.id,
    toUserId: b.id,
    place: "公园",
    time: "周六 09:00"
  });

  assert.throws(
    () => invites.respond(a.id, invite.id, "accepted", ""),
    (error) => error instanceof InviteError && error.status === 403
  );
  assert.throws(
    () => invites.respond(c.id, invite.id, "declined", ""),
    (error) => error instanceof InviteError && error.status === 403
  );

  invites.respond(b.id, invite.id, "declined", "这次时间不方便。");
  assert.throws(
    () => invites.respond(b.id, invite.id, "accepted", ""),
    (error) => error instanceof InviteError && error.status === 409
  );
});

test("不能邀请自己，也不能重复发送待回应邀请", () => {
  const { invites, a, b } = setup();
  assert.throws(
    () =>
      invites.create({
        fromUserId: a.id,
        toUserId: a.id,
        place: "公园",
        time: "周六"
      }),
    (error) => error instanceof InviteError && error.status === 400
  );

  invites.create({
    fromUserId: a.id,
    toUserId: b.id,
    place: "公园",
    time: "周六"
  });
  assert.throws(
    () =>
      invites.create({
        fromUserId: b.id,
        toUserId: a.id,
        place: "书店",
        time: "周日"
      }),
    (error) => error instanceof InviteError && error.status === 409
  );
});
