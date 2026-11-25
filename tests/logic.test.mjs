import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_PROFILES,
  buildMatchSummary,
  normalizedProfile,
  overlap,
  planLabel,
  profileIsReady,
  rankProfiles,
  scoreProfile
} from "../logic.js";

const demoUser = {
  id: "demo-user",
  name: "林夏",
  intent: "friend",
  communication: "voice",
  groupPreference: "small",
  interests: ["现场音乐", "散步", "流浪猫", "咖啡"],
  accessibility: ["字幕与文字转录", "安静低刺激环境", "不公开照片"],
  answers: {
    happy: "最近遇到一只愿意跟着我走的橘猫。"
  },
  voicePrompts: []
};

test("overlap returns unique values shared by both lists", () => {
  assert.deepEqual(overlap(["散步", "咖啡", "散步"], ["咖啡", "电影"]), ["咖啡"]);
});

test("scoreProfile explains shared interests without inventing traits", () => {
  const result = scoreProfile(demoUser, DEMO_PROFILES[0]);
  assert.equal(result.profile.name, "周予安");
  assert.ok(result.sharedInterests.length === 4);
  assert.ok(result.reasons.some((reason) => reason.includes("现场音乐")));
  assert.ok(result.reasons.every((reason) => !reason.includes("人格")));
});

test("rankProfiles puts the profile with the strongest shared coordinates first", () => {
  const ranked = rankProfiles(demoUser);
  assert.equal(ranked[0].profile.id, "zhou-yuan");
  assert.ok(ranked[0].score > ranked[1].score);
});

test("normalizedProfile trims text, removes duplicate interests, and applies defaults", () => {
  const profile = normalizedProfile({
    name: "  小林  ",
    interests: ["散步", "散步", "咖啡"],
    answers: { happy: "  一件小事  " }
  });

  assert.equal(profile.name, "小林");
  assert.deepEqual(profile.interests, ["散步", "咖啡"]);
  assert.equal(profile.answers.happy, "一件小事");
  assert.equal(profile.intent, "friend");
  assert.equal(profile.communication, "mixed");
});

test("profileIsReady accepts a voice-only introduction", () => {
  const profile = normalizedProfile({
    name: "阿岚",
    interests: ["播客"],
    voicePrompts: ["happy"]
  });
  assert.equal(profileIsReady(profile), true);
});

test("buildMatchSummary quotes a concrete answer", () => {
  const summary = buildMatchSummary(DEMO_PROFILES[0]);
  assert.match(summary, /旧书店/);
});

test("planLabel presents a readable plan without private data", () => {
  assert.equal(
    planLabel({ place: "校园书店", duration: "30 分钟", groupSize: "三四人小局" }),
    "校园书店 · 30 分钟 · 三四人小局"
  );
});
