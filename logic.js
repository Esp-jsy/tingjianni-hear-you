export const INTENTS = {
  friend: "认识朋友",
  activity: "寻找同频伙伴",
  date: "发展一段关系"
};

export const GENDERS = {
  female: "女生",
  male: "男生",
  nonbinary: "其他",
  undisclosed: "不透露"
};

export const GENDER_FILTERS = [
  { value: "all", label: "全部" },
  { value: "female", label: "女生" },
  { value: "male", label: "男生" }
];

export const COMMUNICATION = {
  voice: "语音优先",
  text: "文字辅助",
  mixed: "语音与文字"
};

export const GROUP_PREFERENCES = {
  pair: "更安心的一对一",
  small: "三到四人的小局",
  either: "都可以"
};

export const ACCESSIBILITY_OPTIONS = [
  "读屏支持",
  "字幕与文字转录",
  "安静低刺激环境",
  "无障碍路线",
  "不公开照片"
];

export const INTERESTS = [
  "现场音乐",
  "散步",
  "咖啡",
  "流浪猫",
  "旧电影",
  "城市漫游",
  "摄影",
  "独立游戏",
  "播客",
  "做饭",
  "阅读",
  "植物",
  "桌游",
  "手工"
];

const portraitPhoto = (prompt) =>
  `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=square_hd`;

export const DEMO_PROFILES = [
  {
    id: "zhou-yuan",
    name: "周予安",
    gender: "female",
    photo: portraitPhoto(
      "natural candid portrait of a young Chinese woman in her twenties, soft window light, cozy bookstore, gentle smile, realistic photography"
    ),
    intent: "friend",
    communication: "voice",
    groupPreference: "small",
    interests: ["现场音乐", "散步", "流浪猫", "咖啡"],
    accessibility: ["字幕与文字转录", "安静低刺激环境", "不公开照片"],
    answers: {
      happy: "最近开心的是，在校园里遇到一只愿意让我摸两分钟的三花猫。",
      afternoon: "想去旧书店翻一小时书，再沿着湖边慢慢走，累了就找一家不吵的咖啡店。",
      support: "不必一直找话题，安静一会儿也没关系。如果我要离开，直接告诉我就好。",
      try: "想尝试参加一次小型现场演出，但人太多的场合会让我有点紧张。"
    },
    intro: "你好，我是周予安。比起照片，我更愿意先从一件小事认识一个人。"
  },
  {
    id: "chen-mo",
    name: "陈默",
    gender: "male",
    photo: portraitPhoto(
      "natural candid portrait of a young Chinese man in his twenties holding a vintage camera, overcast city street, quiet expression, realistic photography"
    ),
    intent: "activity",
    communication: "mixed",
    groupPreference: "pair",
    interests: ["旧电影", "城市漫游", "摄影", "散步"],
    accessibility: ["无障碍路线", "不公开照片"],
    answers: {
      happy: "最近把一条走过很多次的路拍出了完全不同的颜色。",
      afternoon: "带一台旧相机，在城市里随便走，看到有趣的招牌就停下来。",
      support: "我不擅长一直发消息，但见面时会认真听。",
      try: "想和一个人合作拍一组关于南昌雨天的照片。"
    },
    intro: "我是陈默。先一起做一件具体的小事，可能比互相查资料更容易认识我。"
  },
  {
    id: "a-lan",
    name: "阿岚",
    gender: "female",
    photo: portraitPhoto(
      "natural candid portrait of a young Chinese woman with headphones, warm desk lamp, small game room, relaxed smile, realistic photography"
    ),
    intent: "friend",
    communication: "voice",
    groupPreference: "either",
    interests: ["独立游戏", "播客", "做饭", "现场音乐"],
    accessibility: ["读屏支持", "字幕与文字转录", "安静低刺激环境"],
    answers: {
      happy: "自己做的番茄汤第一次没有糊，还意外地很好喝。",
      afternoon: "找一家安静的小店玩双人独立游戏，再录一期十分钟的播客。",
      support: "看到我没主动说话，不代表不想理你。直接约一个具体的时间就好。",
      try: "想组织一次只有四个人的小型游戏之夜。"
    },
    intro: "你好，我是阿岚。声音让我能保留停顿和笑意，也让资料不只剩下几张照片。"
  },
  {
    id: "shen-zhiyao",
    name: "沈知遥",
    gender: "male",
    photo: portraitPhoto(
      "natural candid portrait of a young Chinese man with a camera, rainy bus stop, soft daylight, thoughtful expression, realistic photography"
    ),
    intent: "activity",
    communication: "mixed",
    groupPreference: "pair",
    interests: ["摄影", "城市漫游", "咖啡", "旧电影"],
    accessibility: ["无障碍路线", "不公开照片"],
    answers: {
      happy: "在旧城区拍到一块掉了漆的招牌，颜色像一部老电影。",
      afternoon: "带上相机坐一趟没坐过的公交，在终点站附近找家小店坐一会儿。",
      support: "我说话比较慢，想到哪里说哪里，不需要帮我总结。",
      try: "想拍一组关于雨天公交站的照片，需要有人帮我撑伞。"
    },
    intro: "我是沈知遥。比起展示自己，我更想先听听你最近在做什么。"
  },
  {
    id: "xu-nan",
    name: "许南",
    gender: "female",
    photo: portraitPhoto(
      "natural candid portrait of a young Chinese woman reading by a window, potted plants, afternoon light, calm expression, realistic photography"
    ),
    intent: "friend",
    communication: "text",
    groupPreference: "small",
    interests: ["阅读", "植物", "做饭", "播客"],
    accessibility: ["安静低刺激环境", "字幕与文字转录"],
    answers: {
      happy: "阳台上那盆薄荷终于长出新叶子，泡水喝有很淡的香味。",
      afternoon: "在图书馆各看各的书，傍晚一起去菜市场买点菜。",
      support: "我更喜欢用文字约时间，见面时安静待着也不会尴尬。",
      try: "想试试四个人的小型读书会，每人带一本薄薄的书。"
    },
    intro: "你好，我是许南。说话不多，但会认真记住你提过的小事。"
  },
  {
    id: "lin-yue",
    name: "林越",
    gender: "male",
    photo: portraitPhoto(
      "natural candid portrait of a young Chinese man at a small live music venue, warm stage light, relaxed smile, realistic photography"
    ),
    intent: "date",
    communication: "voice",
    groupPreference: "pair",
    interests: ["现场音乐", "独立游戏", "桌游", "咖啡"],
    accessibility: ["读屏支持", "不公开照片"],
    answers: {
      happy: "和朋友打通了一个很难的双人合作游戏，笑到半夜。",
      afternoon: "先在咖啡店玩一局桌游，再去看一场小型演出。",
      support: "有事直接说就好，我不太会猜暗示，但会认真回应。",
      try: "想找人一起去看下个月的独立音乐现场。"
    },
    intro: "我是林越。声音比照片更能说明我现在的状态。"
  },
  {
    id: "su-he",
    name: "苏禾",
    gender: "female",
    photo: portraitPhoto(
      "natural candid portrait of a young Chinese woman doing crafts at a wooden table, dried leaves, soft daylight, focused expression, realistic photography"
    ),
    intent: "activity",
    communication: "mixed",
    groupPreference: "either",
    interests: ["手工", "植物", "摄影", "散步"],
    accessibility: ["安静低刺激环境", "无障碍路线"],
    answers: {
      happy: "把捡来的落叶压进本子里，做成了几张书签。",
      afternoon: "逛一趟花市，找一个有长椅的地方慢慢整理照片。",
      support: "如果我在专注做东西，可以直接拍我一下，我不会觉得被打扰。",
      try: "想组织一次四五个人的手工交换小聚。"
    },
    intro: "你好，我是苏禾。喜欢慢慢做东西，也喜欢慢慢认识一个人。"
  },
  {
    id: "gu-xing",
    name: "顾行",
    gender: "male",
    photo: portraitPhoto(
      "natural candid portrait of a young Chinese man walking by a river at dusk, calm expression, realistic photography"
    ),
    intent: "friend",
    communication: "voice",
    groupPreference: "small",
    interests: ["播客", "阅读", "城市漫游", "做饭"],
    accessibility: ["字幕与文字转录", "不公开照片"],
    answers: {
      happy: "录了一期只有八分钟的播客，第一次没有剪掉自己的停顿。",
      afternoon: "沿着江边走一段，找一家能看见水的小店吃晚饭。",
      support: "我偶尔会突然没话说，那不是不想聊，只是需要一点时间。",
      try: "想做一期关于普通人的城市夜晚的播客，找个人一起走一趟。"
    },
    intro: "我是顾行。喜欢边走边聊，也接受沉默。"
  }
];

export const START_PROMPTS = [
  {
    key: "happy",
    title: "最近让你开心的一件小事",
    hint: "不用讲得很完整，一只猫、一顿饭都可以。"
  },
  {
    key: "afternoon",
    title: "理想中的一个下午",
    hint: "说说你想去哪儿、和谁、做什么。"
  },
  {
    key: "support",
    title: "希望朋友怎样和你相处",
    hint: "比如：不必一直聊天、请直接说出想法。"
  },
  {
    key: "try",
    title: "想尝试的一件新事情",
    hint: "越具体，越容易遇到愿意一起出发的人。"
  }
];

export function overlap(left, right) {
  const rightSet = new Set(right);
  return [...new Set(left)].filter((item) => rightSet.has(item));
}

export function scoreProfile(user, profile) {
  const sharedInterests = overlap(user.interests || [], profile.interests);
  const sharedAccessibility = overlap(user.accessibility || [], profile.accessibility);
  let score = sharedInterests.length * 14;

  score += sharedAccessibility.length * 5;
  score += user.intent === profile.intent ? 15 : 3;
  score += user.communication === profile.communication ? 8 : 3;
  score += user.groupPreference === profile.groupPreference ? 8 : 4;

  return {
    profile,
    score,
    sharedInterests,
    sharedAccessibility,
    reasons: [
      sharedInterests.length
        ? `都喜欢${sharedInterests.slice(0, 2).join("和")}`
        : "介绍里有可以继续了解的话题",
      user.intent === profile.intent ? "期待的关系方向一致" : "期待的关系方向可以慢慢确认",
      user.communication === profile.communication ? "交流方式比较接近" : "可以先用双方舒服的方式交流"
    ]
  };
}

export function rankProfiles(user, profiles = DEMO_PROFILES) {
  return profiles
    .map((profile) => scoreProfile(user, profile))
    .sort((left, right) => right.score - left.score);
}

export function normalizedProfile(input) {
  return {
    name: String(input.name || "").trim(),
    gender: GENDERS[input.gender] ? input.gender : "undisclosed",
    photo:
      typeof input.photo === "string" && input.photo.startsWith("data:image/")
        ? input.photo
        : "",
    intent: INTENTS[input.intent] ? input.intent : "friend",
    communication: COMMUNICATION[input.communication] ? input.communication : "mixed",
    groupPreference: GROUP_PREFERENCES[input.groupPreference] ? input.groupPreference : "either",
    interests: Array.isArray(input.interests) ? [...new Set(input.interests)].slice(0, 8) : [],
    accessibility: Array.isArray(input.accessibility) ? [...new Set(input.accessibility)] : [],
    voicePrompts: Array.isArray(input.voicePrompts) ? [...new Set(input.voicePrompts)] : [],
    answers: Object.fromEntries(
      Object.entries(input.answers || {}).map(([key, value]) => [key, String(value || "").trim()])
    )
  };
}

export function profileIsReady(profile) {
  const answerCount = Object.values(profile.answers || {}).filter(Boolean).length;
  const voiceCount = (profile.voicePrompts || []).length;
  return Boolean(profile.name && profile.interests?.length && answerCount + voiceCount >= 1);
}

export function buildMatchSummary(profile) {
  const firstLine = profile.answers?.afternoon || profile.answers?.happy || "";
  if (firstLine) {
    return `对方期待的具体场景是：“${firstLine.slice(0, 64)}${firstLine.length > 64 ? "…" : ""}”`;
  }
  return "对方选择先用声音介绍自己，第一次交流可以从录音中的细节开始。";
}

export function planLabel(plan) {
  if (!plan) return "尚未安排见面";
  return `${plan.place} · ${plan.duration} · ${plan.groupSize}`;
}

export function filterProfilesByGender(ranked, gender) {
  if (!gender || gender === "all") return ranked;
  return ranked.filter((item) => item.profile.gender === gender);
}

export function paginateProfiles(ranked, page = 0, size = 3) {
  const totalPages = Math.max(1, Math.ceil(ranked.length / size));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  return {
    items: ranked.slice(safePage * size, safePage * size + size),
    page: safePage,
    totalPages
  };
}

export function profileSyncAction({
  localReady,
  localOwner,
  currentOwner,
  localUpdatedAt,
  remoteUpdatedAt,
  hasRemote
}) {
  const sameOwner = Boolean(localOwner) && localOwner === currentOwner;
  const foreignOwner = Boolean(localOwner) && localOwner !== currentOwner;
  const localTime = Date.parse(localUpdatedAt || "") || 0;
  const remoteTime = Date.parse(remoteUpdatedAt || "") || 0;

  if (hasRemote) {
    if (!sameOwner) return "pull";
    if (!localTime || remoteTime > localTime) return "pull";
    if (localTime > remoteTime) return "push";
    return "none";
  }

  if (foreignOwner) return localReady ? "reset" : "none";
  if (localReady) return "push";
  return "none";
}
