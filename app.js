import {
  ACCESSIBILITY_OPTIONS,
  COMMUNICATION,
  DEMO_PROFILES,
  GENDERS,
  GROUP_PREFERENCES,
  INTERESTS,
  INTENTS,
  START_PROMPTS,
  buildMatchSummary,
  filterProfilesByGender,
  normalizedProfile,
  paginateProfiles,
  planLabel,
  profileIsReady,
  profileSyncAction,
  rankProfiles
} from "./logic.js";
import { createLocalAuth } from "./local-auth.js";

const STORAGE_KEY = "tingjianni.prototype.v1";
const DISPLAY_KEY = "tingjianni.display.v1";
const INVITES_KEY = "tingjianni.invites.v1";
const API_BASE = "./api";

const views = [...document.querySelectorAll(".view")];
const main = document.querySelector("main");
const safetySection = document.querySelector("#safety");
const toastElement = document.querySelector("#toast");
const promptList = document.querySelector("#prompt-list");
const matchList = document.querySelector("#match-list");
const detailContent = document.querySelector("#detail-content");
const planResult = document.querySelector("#plan-result");
const planResultContent = document.querySelector("#plan-result-content");
const inviteSection = document.querySelector("#invite-section");
const exitStatus = document.querySelector("#exit-status");
const profileError = document.querySelector("#profile-error");
const recordError = document.querySelector("#record-error");
const micSupport = document.querySelector("#mic-support");
const accountNav = document.querySelector("#account-nav");
const accountPanel = document.querySelector("#account-panel");
const authForms = document.querySelector("#auth-forms");
const authServiceNote = document.querySelector("#auth-service-note");
const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const loginTab = document.querySelector("#login-tab");
const registerTab = document.querySelector("#register-tab");
const loginError = document.querySelector("#login-error");
const registerError = document.querySelector("#register-error");
const accountName = document.querySelector("#account-name");
const accountMeta = document.querySelector("#account-meta");
const photoPreview = document.querySelector("#photo-preview");
const photoInput = document.querySelector("#photo-input");
const photoChoose = document.querySelector("#photo-choose");
const photoRemove = document.querySelector("#photo-remove");
const photoStatus = document.querySelector("#photo-status");
const refreshMatches = document.querySelector("#refresh-matches");
const matchBatch = document.querySelector("#match-batch");
const photoModal = document.querySelector("#photo-modal");
const photoModalImage = document.querySelector("#photo-modal-image");
const photoModalClose = document.querySelector("#photo-modal-close");
const photoModalCaption = document.querySelector("#photo-modal-caption");

const mediaRecorderSupported =
  "MediaRecorder" in window && Boolean(navigator.mediaDevices?.getUserMedia);
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recordedUrls = new Map();

let activeRecording = null;
let matchFilter = "all";
let matchGenderFilter = "all";
let matchPage = 0;
let matchBatchCount = 1;
const MATCH_PAGE_SIZE = 3;
let toastTimer;
let authUser = null;
let authMode = "server";
let localAuth = null;
let sessionReady = Promise.resolve();
let sessionSettled = false;

function loadStoredState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      profile: normalizedProfile(stored.profile || {}),
      selectedMatchId: stored.selectedMatchId || null,
      plan: stored.plan || null,
      profileUpdatedAt: stored.profileUpdatedAt || null,
      profileOwner: stored.profileOwner || null
    };
  } catch {
    return {
      profile: normalizedProfile({}),
      selectedMatchId: null,
      plan: null,
      profileUpdatedAt: null,
      profileOwner: null
    };
  }
}

let state = loadStoredState();

function loadInvites() {
  try {
    const stored = JSON.parse(localStorage.getItem(INVITES_KEY) || "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function saveInvites() {
  localStorage.setItem(INVITES_KEY, JSON.stringify(invites));
}

let invites = loadInvites();

function persistState() {
  const profile = {
    ...state.profile,
    voicePrompts: state.profile.voicePrompts.filter((key) => recordedUrls.has(key))
  };
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      profile,
      selectedMatchId: state.selectedMatchId,
      plan: state.plan,
      profileUpdatedAt: state.profileUpdatedAt || null,
      profileOwner: state.profileOwner || null
    })
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.classList.add("show");
  toastTimer = window.setTimeout(() => {
    toastElement.classList.remove("show");
  }, 3600);
}

let photoModalTrigger = null;

function openPhotoModal(src, alt, trigger) {
  if (!src) return;
  photoModalTrigger = trigger || null;
  photoModalImage.src = src;
  photoModalImage.alt = alt;
  photoModalCaption.textContent = alt;
  photoModal.hidden = false;
  document.body.classList.add("modal-open");
  photoModalClose.focus();
}

function closePhotoModal() {
  if (photoModal.hidden) return;
  photoModal.hidden = true;
  photoModalImage.removeAttribute("src");
  photoModalImage.alt = "";
  photoModalCaption.textContent = "";
  document.body.classList.remove("modal-open");
  if (photoModalTrigger) photoModalTrigger.focus();
  photoModalTrigger = null;
}

function selectedMatch() {
  const ranked = rankProfiles(state.profile, DEMO_PROFILES);
  return (
    ranked.find((item) => item.profile.id === state.selectedMatchId) ||
    ranked[0] ||
    null
  );
}

function currentViewFromHash() {
  const requested = window.location.hash.replace("#", "");
  const validViews = ["home", "profile", "record", "matches", "detail", "plan", "safety", "auth"];
  const view = validViews.includes(requested) ? requested : "home";

  if (["matches", "detail", "plan"].includes(view) && !profileIsReady(state.profile)) {
    return "home";
  }
  return view;
}

function navigate(view, options = {}) {
  const { focus = true, updateHash = true } = options;
  const guardedViews = ["matches", "detail", "plan"];
  closePhotoModal();

  if (guardedViews.includes(view) && !profileIsReady(state.profile)) {
    showToast("先留下显示名称、至少两个兴趣和一段回答，再开始匹配。");
    view = "profile";
  }

  if (view === "detail" && !state.selectedMatchId) {
    state.selectedMatchId = selectedMatch()?.profile.id || null;
  }

  if (view === "safety") {
    main.hidden = true;
    safetySection.hidden = false;
  } else {
    main.hidden = false;
    safetySection.hidden = true;
    views.forEach((section) => {
      section.hidden = section.id !== `view-${view}`;
    });
  }

  const navView = ["matches", "detail", "plan"].includes(view) ? "matches" : view;
  document.querySelectorAll(".primary-nav [data-nav]").forEach((button) => {
    if (button.dataset.nav === navView) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  if (updateHash) {
    history.replaceState(null, "", `#${view}`);
  }

  if (view === "profile") hydrateProfileForm();
  if (view === "record") renderPromptList();
  if (view === "matches") renderMatches();
  if (view === "detail") renderDetail();
  if (view === "plan") renderPlan();
  if (view === "auth") renderAccountView();

  if (focus) {
    window.scrollTo({ top: 0, behavior: "auto" });
    const activeSection =
      view === "safety" ? safetySection : document.querySelector(`#view-${view}`);
    const heading = activeSection?.querySelector("h1");
    if (heading) {
      heading.tabIndex = -1;
      window.setTimeout(() => heading.focus({ preventScroll: true }), 30);
    }
  }
}

function createChoiceChip(value, selected, type) {
  return `
    <button
      type="button"
      class="choice-chip"
      data-choice-type="${type}"
      data-value="${escapeHtml(value)}"
      aria-pressed="${selected ? "true" : "false"}"
    >${escapeHtml(value)}</button>
  `;
}

function renderProfileChoices() {
  document.querySelector("#interest-options").innerHTML = INTERESTS.map((interest) =>
    createChoiceChip(
      interest,
      state.profile.interests.includes(interest),
      "interest"
    )
  ).join("");

  document.querySelector("#accessibility-options").innerHTML = ACCESSIBILITY_OPTIONS.map(
    (option) =>
      createChoiceChip(
        option,
        state.profile.accessibility.includes(option),
        "accessibility"
      )
  ).join("");
}

function hydrateProfileForm() {
  document.querySelector("#display-name").value = state.profile.name || "";
  document.querySelectorAll('input[name="gender"]').forEach((input) => {
    input.checked = input.value === state.profile.gender;
  });
  document.querySelectorAll('input[name="intent"]').forEach((input) => {
    input.checked = input.value === state.profile.intent;
  });
  document.querySelectorAll('input[name="communication"]').forEach((input) => {
    input.checked = input.value === state.profile.communication;
  });
  document.querySelectorAll('input[name="groupPreference"]').forEach((input) => {
    input.checked = input.value === state.profile.groupPreference;
  });
  renderPhotoPreview();
  renderProfileChoices();
}

function renderPhotoPreview() {
  if (state.profile.photo) {
    photoPreview.innerHTML = `<img src="${escapeHtml(state.profile.photo)}" alt="你的照片预览" />`;
  } else {
    photoPreview.innerHTML = "<span>尚未选择照片</span>";
  }
  photoRemove.hidden = !state.profile.photo;
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("照片读取失败，请重试。"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("无法识别这张图片，请换一张。"));
      image.onload = () => {
        const maxEdge = 640;
        const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhotoChange(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    photoStatus.textContent = "请选择图片文件（JPG / PNG 等）。";
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    photoStatus.textContent = "图片超过 8MB，请换一张更小的。";
    return;
  }

  photoStatus.textContent = "正在压缩照片…";
  try {
    state.profile.photo = await compressPhoto(file);
    persistState();
    renderPhotoPreview();
    photoStatus.textContent = "照片已保存，可随时移除或重新选择。";
  } catch (error) {
    photoStatus.textContent = error.message;
  }
}

function toggleChoice(button) {
  const type = button.dataset.choiceType;
  const property = type === "interest" ? "interests" : "accessibility";
  const values = new Set(state.profile[property]);
  const value = button.dataset.value;

  if (values.has(value)) {
    values.delete(value);
  } else {
    if (type === "interest" && values.size >= 8) {
      showToast("兴趣最多选择 8 个，先保留最想聊的。");
      return;
    }
    values.add(value);
  }

  state.profile[property] = [...values];
  button.setAttribute("aria-pressed", values.has(value) ? "true" : "false");
}

function saveProfileStep() {
  profileError.hidden = true;
  const form = document.querySelector("#profile-form");
  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  state.profile = normalizedProfile({
    ...state.profile,
    name: formData.get("displayName"),
    gender: formData.get("gender"),
    intent: formData.get("intent"),
    communication: formData.get("communication"),
    groupPreference: formData.get("groupPreference")
  });

  if (state.profile.interests.length < 2) {
    profileError.textContent = "至少选择两个兴趣，匹配理由才不会只剩一句“随缘”。";
    profileError.hidden = false;
    document.querySelector("#interest-options .choice-chip")?.focus();
    return;
  }

  persistState();
  syncProfileToServer().then((synced) => {
    if (synced) showToast("资料已保存并同步到服务器。");
  });
  navigate("record");
}

function audioMarkup(key) {
  const url = recordedUrls.get(key);
  if (!url) return "";
  return `<audio class="recorded-audio" controls src="${url}" aria-label="你的第 ${START_PROMPTS.findIndex((prompt) => prompt.key === key) + 1} 段录音"></audio>`;
}

function renderPromptList() {
  if (!promptList.dataset.rendered) {
    promptList.innerHTML = START_PROMPTS.map(
      (prompt, index) => `
        <article class="prompt-card" data-prompt-card="${prompt.key}">
          <div class="prompt-heading">
            <span class="prompt-number" aria-hidden="true">0${index + 1}</span>
            <div>
              <h2>${escapeHtml(prompt.title)}</h2>
              <p>${escapeHtml(prompt.hint)}</p>
            </div>
          </div>
          <div class="answer-field">
            <label for="answer-${prompt.key}">文字回答或录音转写</label>
            <textarea
              id="answer-${prompt.key}"
              data-answer-key="${prompt.key}"
              rows="3"
              placeholder="可以直接录音；也可以把想说的话写在这里。"
            >${escapeHtml(state.profile.answers[prompt.key] || "")}</textarea>
          </div>
          <div class="record-controls">
            <button
              class="record-button"
              type="button"
              data-record-key="${prompt.key}"
              ${mediaRecorderSupported ? "" : "disabled"}
            >开始录音</button>
            <span class="record-meta" data-record-meta="${prompt.key}" aria-live="polite">
              ${mediaRecorderSupported ? "录音只保存在当前浏览器" : "当前浏览器不支持录音，可填写文字"}
            </span>
          </div>
          <div data-audio-slot="${prompt.key}">${audioMarkup(prompt.key)}</div>
        </article>
      `
    ).join("");
    promptList.dataset.rendered = "true";
  }

  promptList.querySelectorAll("textarea[data-answer-key]").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      state.profile.answers[textarea.dataset.answerKey] = textarea.value.trim();
    });
  });

  promptList.querySelectorAll("[data-record-key]").forEach((button) => {
    button.addEventListener("click", () => toggleRecording(button.dataset.recordKey, button));
  });

  micSupport.textContent = mediaRecorderSupported
    ? SpeechRecognition
      ? "已启用浏览器录音与语音转写。你可停止录音后继续修改转写文字。"
      : "已启用浏览器录音。当前浏览器不支持自动转写，但可继续录音并补充文字。"
    : "当前浏览器不能直接录音。资料仍可通过文字填写，完整页面不依赖麦克风。";

  promptList.querySelectorAll("textarea[data-answer-key]").forEach((textarea) => {
    if (document.activeElement !== textarea) {
      textarea.value = state.profile.answers[textarea.dataset.answerKey] || "";
    }
  });
}

function chooseMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function toggleRecording(key, button) {
  if (activeRecording?.key === key) {
    stopRecording();
    return;
  }

  if (!mediaRecorderSupported) {
    showToast("当前浏览器不支持录音，请使用文字回答。");
    return;
  }

  if (activeRecording) {
    stopRecording();
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  } catch {
    showToast("没有获得麦克风权限。你仍可以填写文字回答。");
    return;
  }

  const mimeType = chooseMimeType();
  let recorder;
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    showToast("录音启动失败，请改用文字回答。");
    return;
  }

  const chunks = [];
  const textarea = document.querySelector(`#answer-${key}`);
  const meta = document.querySelector(`[data-record-meta="${key}"]`);
  const baseTranscript = textarea.value.trim();
  let recognition = null;

  const recording = {
    key,
    button,
    meta,
    textarea,
    baseTranscript,
    recorder,
    stream,
    chunks,
    startedAt: Date.now(),
    timer: null,
    recognition
  };

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  recorder.addEventListener("stop", () => {
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    const previousUrl = recordedUrls.get(key);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const url = URL.createObjectURL(blob);
    recordedUrls.set(key, url);

    if (!state.profile.voicePrompts.includes(key)) {
      state.profile.voicePrompts.push(key);
    }
    persistState();

    const slot = document.querySelector(`[data-audio-slot="${key}"]`);
    if (slot) slot.innerHTML = audioMarkup(key);
    if (button) {
      button.classList.remove("recording");
      button.textContent = "重新录音";
    }

    const seconds = Math.max(1, Math.round((Date.now() - recording.startedAt) / 1000));
    if (meta) meta.textContent = `已保存 ${seconds} 秒录音`;
    clearInterval(recording.timer);
    stream.getTracks().forEach((track) => track.stop());
  });

  recorder.addEventListener("error", () => {
    stream.getTracks().forEach((track) => track.stop());
    clearInterval(recording.timer);
    button.classList.remove("recording");
    button.textContent = "重新录音";
    if (meta) meta.textContent = "录音发生错误，请重试或填写文字";
  });

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.addEventListener("result", (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;
        if (event.results[index].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }
      textarea.value = [baseTranscript, finalText.trim()].filter(Boolean).join(" ");
      if (interimText.trim()) textarea.value += ` ${interimText.trim()}`;
      state.profile.answers[key] = textarea.value.trim();
    });

    recognition.addEventListener("error", () => {
      if (meta && recording.recorder.state === "recording") {
        meta.textContent = "正在录音；自动听写暂不可用";
      }
    });

    try {
      recognition.start();
    } catch {
      recognition = null;
    }
  }

  Object.assign(recording, { recognition });
  activeRecording = recording;
  button.classList.add("recording");
  button.textContent = "停止并保存";
  if (meta) {
    meta.textContent = SpeechRecognition ? "正在录音并听写… 00:00" : "正在录音… 00:00";
  }

  recording.timer = window.setInterval(() => {
    const seconds = Math.floor((Date.now() - recording.startedAt) / 1000);
    if (meta) {
      const prefix = SpeechRecognition ? "正在录音并听写…" : "正在录音…";
      meta.textContent = `${prefix} 00:${String(seconds).padStart(2, "0")}`;
    }
  }, 500);

  recorder.start(250);
}

function stopRecording() {
  if (!activeRecording) return;
  const current = activeRecording;
  activeRecording = null;

  if (current.recognition) {
    try {
      current.recognition.stop();
    } catch {
      // The browser may already have stopped recognition.
    }
  }

  if (current.recorder.state !== "inactive") {
    current.recorder.stop();
  } else {
    current.stream.getTracks().forEach((track) => track.stop());
  }
}

function saveRecordStep() {
  recordError.hidden = true;
  promptList.querySelectorAll("textarea[data-answer-key]").forEach((textarea) => {
    state.profile.answers[textarea.dataset.answerKey] = textarea.value.trim();
  });

  if (!profileIsReady(state.profile)) {
    recordError.textContent =
      "至少留下一段文字回答或一段录音，别人才能从具体内容开始认识你。";
    recordError.hidden = false;
    recordError.focus();
    return;
  }

  persistState();
  syncProfileToServer().then((synced) => {
    if (synced) showToast("资料已保存并同步到服务器。");
  });
  navigate("matches");
}

function matchPassesFilter(item) {
  if (matchFilter === "quiet") {
    return (
      item.profile.accessibility.includes("安静低刺激环境") ||
      Object.values(item.profile.answers).some((answer) => /安静|不吵/.test(answer))
    );
  }
  if (matchFilter === "accessibility") {
    return item.profile.accessibility.length > 0;
  }
  if (matchFilter === "voice") {
    return (
      item.profile.communication === "voice" ||
      item.profile.accessibility.includes("读屏支持")
    );
  }
  return true;
}

function renderMatches() {
  document.querySelector("#match-intro").textContent = state.profile.name
    ? `${state.profile.name}，先听声音和具体回答，再决定是否继续。`
    : "先听声音和具体回答，再决定是否继续。";

  document.querySelectorAll(".filter-chip[data-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === matchFilter);
    button.setAttribute(
      "aria-pressed",
      button.dataset.filter === matchFilter ? "true" : "false"
    );
  });

  document.querySelectorAll(".filter-chip[data-gender]").forEach((button) => {
    button.classList.toggle("active", button.dataset.gender === matchGenderFilter);
    button.setAttribute(
      "aria-pressed",
      button.dataset.gender === matchGenderFilter ? "true" : "false"
    );
  });

  const ranked = filterProfilesByGender(
    rankProfiles(state.profile, DEMO_PROFILES),
    matchGenderFilter
  ).filter(matchPassesFilter);

  if (!ranked.length) {
    matchBatch.textContent = "当前筛选下暂无人选";
    matchList.innerHTML = `
      <div class="empty-state">
        <h2>这一组暂时没有合适的人</h2>
        <p>可以取消筛选，或换一种兴趣组合再听一次。</p>
      </div>
    `;
    return;
  }

  const batch = paginateProfiles(ranked, matchPage, MATCH_PAGE_SIZE);
  matchPage = batch.page;
  matchBatchCount = batch.totalPages;
  matchBatch.textContent = `第 ${batch.page + 1} / ${batch.totalPages} 批 · 共 ${ranked.length} 人`;

  matchList.innerHTML = batch.items
    .map(
      (item, index) => `
        <article class="match-card" style="animation-delay:${index * 55}ms">
          ${
            item.profile.photo
              ? `<button
                  class="match-photo"
                  type="button"
                  data-photo-src="${escapeHtml(item.profile.photo)}"
                  data-photo-alt="${escapeHtml(item.profile.name)}的照片"
                  aria-label="放大查看 ${escapeHtml(item.profile.name)} 的照片"
                ><img src="${escapeHtml(item.profile.photo)}" alt="" loading="lazy" /></button>`
              : `<div class="voice-avatar" aria-hidden="true">
                  <div class="waveform"><i></i><i></i><i></i><i></i><i></i></div>
                </div>`
          }
          <div class="match-main">
            <h2>${escapeHtml(item.profile.name)}</h2>
            <div class="match-meta">
              <span class="meta-tag">${escapeHtml(GENDERS[item.profile.gender])}</span>
              <span class="meta-tag">${escapeHtml(INTENTS[item.profile.intent])}</span>
              <span class="meta-tag">${escapeHtml(COMMUNICATION[item.profile.communication])}</span>
              <span class="meta-tag">${escapeHtml(item.profile.interests.slice(0, 2).join(" · "))}</span>
            </div>
            <div class="match-reasons">
              ${item.reasons
                .map((reason) => `<span class="reason-tag">${escapeHtml(reason)}</span>`)
                .join("")}
            </div>
          </div>
          <button
            class="button button-primary match-action"
            type="button"
            data-open-match="${escapeHtml(item.profile.id)}"
          >听见 ${escapeHtml(item.profile.name)}</button>
        </article>
      `
    )
    .join("");

  matchList.querySelectorAll("[data-open-match]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedMatchId = button.dataset.openMatch;
      persistState();
      navigate("detail");
    });
  });
}

function speakText(text, context = "candidate") {
  if (!("speechSynthesis" in window)) {
    showToast("当前浏览器不支持朗读，请使用读屏软件阅读页面文字。");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.93;
  utterance.pitch = context === "plan" ? 1 : 0.98;
  window.speechSynthesis.speak(utterance);
}

function renderDetail() {
  const match = selectedMatch();
  if (!match) {
    navigate("matches");
    return;
  }

  const { profile, reasons, sharedAccessibility } = match;
  const storyEntries = START_PROMPTS.filter((prompt) => profile.answers[prompt.key]);
  const spokenIntro = [
    profile.intro,
    ...storyEntries.map(
      (prompt) => `${prompt.title}：${profile.answers[prompt.key]}`
    )
  ].join(" ");

  detailContent.innerHTML = `
    <article class="profile-hero">
      <p class="eyebrow">声音资料 · 原型演示</p>
      <h1 id="detail-title">${escapeHtml(profile.name)}</h1>
      ${
        profile.photo
          ? `<button
              class="detail-photo"
              type="button"
              data-photo-src="${escapeHtml(profile.photo)}"
              data-photo-alt="${escapeHtml(profile.name)}的照片"
              aria-label="放大查看 ${escapeHtml(profile.name)} 的照片"
            >
              <img src="${escapeHtml(profile.photo)}" alt="${escapeHtml(profile.name)}的照片" loading="lazy" />
              <span>点击放大</span>
            </button>`
          : ""
      }
      <blockquote>“${escapeHtml(profile.intro)}”</blockquote>
      <div class="voice-player">
        <button
          id="prototype-voice-button"
          class="play-button"
          type="button"
          aria-label="播放 ${escapeHtml(profile.name)} 的原型演示声音"
        >▶</button>
        <div class="waveform" aria-hidden="true">
          <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
        </div>
        <small>原型使用浏览器朗读<br />正式版播放本人录音</small>
      </div>
      <div class="profile-tags">
        <span>${escapeHtml(GENDERS[profile.gender])}</span>
        <span>${escapeHtml(INTENTS[profile.intent])}</span>
        <span>${escapeHtml(COMMUNICATION[profile.communication])}</span>
        <span>${escapeHtml(GROUP_PREFERENCES[profile.groupPreference])}</span>
        ${profile.interests.map((interest) => `<span>${escapeHtml(interest)}</span>`).join("")}
      </div>
    </article>
    <div class="profile-column">
      <section class="story-panel" aria-labelledby="story-title">
        <h2 id="story-title">从四件小事听见 ${escapeHtml(profile.name)}</h2>
        <dl class="story-list">
          ${storyEntries
            .map(
              (prompt) => `
                <div>
                  <dt>${escapeHtml(prompt.title)}</dt>
                  <dd>${escapeHtml(profile.answers[prompt.key])}</dd>
                </div>
              `
            )
            .join("")}
        </dl>
      </section>
      <section class="match-evidence" aria-labelledby="evidence-title">
        <h2 id="evidence-title">为什么先推荐这个人</h2>
        <ul class="evidence-list">
          ${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
          ${
            sharedAccessibility.length
              ? `<li>双方都提到了${escapeHtml(sharedAccessibility.join("、"))}</li>`
              : ""
          }
        </ul>
        <p class="consent-note">
          ${escapeHtml(buildMatchSummary(profile))}
          这些是共同点和偏好，不是对性格、健康或关系价值的判断。
        </p>
        <div class="form-actions">
          <button class="button button-ghost" type="button" id="pass-button">暂时不继续</button>
          <button class="button button-primary" type="button" id="plan-button">
            约一次轻松见面 <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </div>
  `;

  document.querySelector("#prototype-voice-button").addEventListener("click", () => {
    speakText(spokenIntro);
  });
  document.querySelector("#pass-button").addEventListener("click", () => {
    showToast(`已记录：暂时不继续了解 ${profile.name}，不会通知对方。`);
    navigate("matches");
  });
  document.querySelector("#plan-button").addEventListener("click", () => {
    navigate("plan");
  });
}

function renderPlan() {
  const match = selectedMatch();
  if (!match) {
    navigate("matches");
    return;
  }

  document.querySelector("#plan-title").textContent =
    `和${match.profile.name}，先来一次轻松的见面`;

  if (state.plan?.profileId === match.profile.id) {
    renderPlanResult(state.plan);
  } else {
    planResult.hidden = true;
  }
  exitStatus.hidden = true;
}

function planFromForm() {
  const form = document.querySelector("#plan-form");
  const formData = new FormData(form);
  const placeInput = form.querySelector('input[name="place"]:checked');
  return {
    profileId: state.selectedMatchId,
    note: String(formData.get("note") || "").trim().slice(0, 120),
    place: String(formData.get("place") || "校园书店"),
    duration: placeInput?.dataset.duration || "30 分钟",
    groupSize:
      state.profile.groupPreference === "pair" ? "一对一见" : "三四人小局",
    checkIn: formData.has("checkIn"),
    quiet: formData.has("quiet"),
    route: formData.has("route")
  };
}

function renderPlanResult(plan) {
  planResult.hidden = false;
  planResult.tabIndex = -1;
  document.querySelectorAll('input[name="place"]').forEach((input) => {
    input.checked = input.value === plan.place;
  });

  document.querySelector("#plan-result-title").textContent =
    `${plan.place} · ${plan.duration}`;

  planResultContent.innerHTML = `
    <p>
      ${planLabel(plan)}。双方看到同一张见面卡后，再确认是否出发。
      ${plan.checkIn ? "活动开始 30 分钟后只做一次轻柔提醒。" : "不发送自动提醒。"}
    </p>
    <ol class="itinerary">
      <li><span>见面之前</span><strong>确认同一张卡</strong><small>时间、地点与退出方式一致</small></li>
      <li><span>00—05 分钟</span><strong>先坐一会儿</strong><small>从“最近一件开心的小事”开始</small></li>
      <li><span>05—25 分钟</span><strong>聊一个具体场景</strong><small>${plan.quiet ? "优先安静区域，允许自然停顿" : "用共同兴趣找话题"}</small></li>
      <li><span>结束</span><strong>愿意继续再约</strong><small>${plan.route ? "查看无障碍路线与休息点" : "各自安全离开"}</small></li>
    </ol>
  `;
  renderPlanInvite(plan);
  window.setTimeout(() => {
    planResult.focus({ preventScroll: true });
  }, 20);
}

function createPlan(event) {
  event.preventDefault();
  if (!state.selectedMatchId) return;
  state.plan = planFromForm();
  persistState();
  const invite = sendInvite(state.plan);
  renderPlanResult(state.plan);
  showToast(`见面邀请已发送给 ${invite.profileName}，等 TA 同意或婉拒。`);
  planResult.scrollIntoView({ behavior: "smooth", block: "start" });
}

function sendInvite(plan) {
  const match = DEMO_PROFILES.find((profile) => profile.id === plan.profileId);
  invites[plan.profileId] = {
    id: `invite-${Date.now()}`,
    profileId: plan.profileId,
    profileName: match ? match.name : "对方",
    fromName: state.profile.name || "匿名用户",
    plan,
    status: "pending",
    reply: "",
    createdAt: Date.now(),
    respondedAt: null
  };
  saveInvites();
  return invites[plan.profileId];
}

function inviteStatusLabel(status) {
  if (status === "accepted") return { label: "已同意", message: "已同意这次见面" };
  if (status === "declined") return { label: "已婉拒", message: "婉拒了这次邀请" };
  return { label: "等待回应", message: "邀请已发送，等待回应" };
}

function renderPlanInvite(plan) {
  const invite = invites[plan.profileId];
  if (!invite) {
    inviteSection.hidden = true;
    inviteSection.innerHTML = "";
    return;
  }

  const meta = inviteStatusLabel(invite.status);
  const responded = invite.status !== "pending";
  const canSimulateResponse = authMode === "server" && sessionSettled;
  const timeLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(invite.createdAt);

  inviteSection.hidden = false;
  inviteSection.innerHTML = `
    <div class="invite-status">
      <span class="invite-dot" data-status="${invite.status}" aria-hidden="true"></span>
      <div>
        <p class="eyebrow">双方确认 · ${meta.label}</p>
        <h3 tabindex="-1">${escapeHtml(invite.profileName)} ${escapeHtml(meta.message)}</h3>
        <p class="invite-detail">
          ${escapeHtml(invite.fromName)} 在 ${escapeHtml(timeLabel)} 发出邀请：${escapeHtml(planLabel(invite.plan))}。
          ${
            responded
              ? "如需调整时间或地点，修改左侧安排后重新确认路线，会再次发送邀请。"
              : canSimulateResponse
              ? "真实产品里 TA 会在自己的设备上收到通知；这个原型可以在下方切换到对方视角替 TA 回应。"
              : "TA 会在自己的设备上收到通知并自行回应；当前线上演示不会跨设备送达，邀请会保持等待状态。"
          }
        </p>
      </div>
    </div>
    <div class="invite-messages">
      <div class="invite-message mine">
        <span>来自 ${escapeHtml(invite.fromName)} 的邀请附言</span>
        <p>${escapeHtml(invite.plan.note || "（没有附言，直接看见面卡）")}</p>
      </div>
      <div class="invite-message theirs" ${responded ? "" : "hidden"}>
        <span>${escapeHtml(invite.profileName)} 的回复</span>
        <p>${escapeHtml(
          invite.reply ||
            `（${invite.status === "accepted" ? "同意了这次见面" : "婉拒了这次邀请"}，没有留言）`
        )}</p>
      </div>
    </div>
    ${
      canSimulateResponse
        ? `
    <div class="invite-actions">
      <button class="button ${responded ? "button-ghost" : "button-primary"}" type="button" data-invite-role="toggle">
        ${responded ? "再看一次 TA 的回应（演示）" : "查看 TA 收到的通知（演示）"}
      </button>
    </div>
    <div class="counterpart-view" data-invite-role="counterpart" hidden>
      <p class="eyebrow">对方视角 · 原型演示</p>
      <h3>以下是 ${escapeHtml(invite.profileName)} 收到的通知</h3>
      <p>正式版中这条通知会实时推送到 TA 的设备；原型在本机模拟 TA 的选择。</p>
      <div class="counterpart-card">
        <strong>见面邀请</strong>
        <p>${escapeHtml(invite.fromName)} 想约你：${escapeHtml(planLabel(invite.plan))}</p>
        <p class="invite-detail">附言：${escapeHtml(invite.plan.note || "对方没有留言。")}</p>
      </div>
      ${
        responded
          ? `
      <div class="form-actions">
        <button class="button button-ghost" type="button" data-invite-role="close">收起</button>
      </div>
      `
          : `
      <label class="counterpart-reply">
        <span>回复（选填）</span>
        <textarea data-invite-role="reply" rows="2" maxlength="120" placeholder="例如：周六下午可以，书店见。"></textarea>
      </label>
      <div class="form-actions">
        <button class="button button-primary" type="button" data-invite-role="accept">同意这次见面</button>
        <button class="button button-ghost" type="button" data-invite-role="decline">婉拒这次邀请</button>
        <button class="button button-ghost" type="button" data-invite-role="close">收起</button>
      </div>
      `
      }
    </div>
    `
        : ""
    }
  `;

  const counterpart = inviteSection.querySelector("[data-invite-role='counterpart']");
  const toggle = inviteSection.querySelector("[data-invite-role='toggle']");

  if (counterpart && toggle) {
    toggle.addEventListener("click", () => {
      counterpart.hidden = !counterpart.hidden;
      if (!counterpart.hidden) {
        counterpart.scrollIntoView({ behavior: "smooth", block: "nearest" });
        counterpart.querySelector("[data-invite-role='reply']")?.focus();
      }
    });

    inviteSection.querySelector("[data-invite-role='close']")?.addEventListener("click", () => {
      counterpart.hidden = true;
      toggle.focus();
    });
  }

  const respond = (status) => {
    const reply =
      inviteSection.querySelector("[data-invite-role='reply']")?.value.trim() || "";
    invite.status = status;
    invite.reply = reply;
    invite.respondedAt = Date.now();
    saveInvites();
    renderPlanInvite(plan);
    inviteSection.querySelector(".invite-status h3")?.focus();
    showToast(
      status === "accepted"
        ? `${invite.profileName} 已同意见面${reply ? "，并留下了回复。" : "。"}`
        : `${invite.profileName} 婉拒了这次邀请${reply ? "，并留下了回复。" : "。"}`
    );
  };

  inviteSection
    .querySelector("[data-invite-role='accept']")
    ?.addEventListener("click", () => respond("accepted"));
  inviteSection
    .querySelector("[data-invite-role='decline']")
    ?.addEventListener("click", () => respond("declined"));
}

function showSilentExit() {
  exitStatus.hidden = false;
  exitStatus.textContent =
    "已生成一条中性消息：“临时有事，需要先离开。今天谢谢你。”原型仅在本机展示；正式版会在双方客户端同步，并立即停止自动提醒。";
  speakText("你好，临时有事，我需要先离开。今天谢谢你。", "plan");
}

function startQuickDemo(targetView = "matches") {
  if (activeRecording) stopRecording();
  state.profile = normalizedProfile({
    name: "林夏",
    gender: "female",
    photo: "",
    intent: "friend",
    communication: "voice",
    groupPreference: "small",
    interests: ["现场音乐", "散步", "流浪猫", "咖啡"],
    accessibility: ["字幕与文字转录", "安静低刺激环境", "不公开照片"],
    answers: {
      happy: "上周在校园里遇到一只愿意跟着我走很久的橘猫。",
      afternoon: "想找一家不吵的咖啡店，和一个人各带一本书，读一会儿再聊天。",
      support: "不必一直找话题，安静一会儿也没关系；如果有事，请直接告诉我。",
      try: "想参加一次小型现场演出，但需要提前知道怎么离场。"
    },
    voicePrompts: []
  });
  state.selectedMatchId = "zhou-yuan";
  state.plan = null;
  persistState();
  hydrateProfileForm();
  navigate(["matches", "detail", "plan"].includes(targetView) ? targetView : "matches");
  showToast("已载入演示资料。点击“听见周予安”继续体验。");
}

async function requestJson(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || "请求失败，请稍后再试。");
  }
  return payload;
}

function authErrorMessage(error) {
  if (error instanceof TypeError) {
    return "无法连接账号服务，请确认已通过 npm start 启动本地服务器。";
  }
  return error.message || "请求失败，请稍后再试。";
}

async function syncProfileToServer() {
  if (authMode !== "server" || !authUser) return false;
  try {
    const saved = await requestJson(`${API_BASE}/profile`, {
      method: "PUT",
      body: { profile: state.profile }
    });
    state.profileUpdatedAt = saved.updatedAt || new Date().toISOString();
    state.profileOwner = authUser.username;
    persistState();
    renderAccountView();
    return true;
  } catch {
    return false;
  }
}

function clearLocalProfile() {
  state.profile = normalizedProfile({});
  state.profileUpdatedAt = null;
  state.profileOwner = null;
  persistState();
  hydrateProfileForm();
  renderPromptList();
}

async function reconcileProfileWithServer() {
  if (authMode !== "server" || !authUser) return;

  let remote;
  try {
    remote = await requestJson(`${API_BASE}/profile`);
  } catch {
    return;
  }

  const action = profileSyncAction({
    localReady: profileIsReady(state.profile),
    localOwner: state.profileOwner,
    currentOwner: authUser.username,
    localUpdatedAt: state.profileUpdatedAt,
    remoteUpdatedAt: remote.updatedAt,
    hasRemote: Boolean(remote.profile)
  });

  if (action === "pull") {
    state.profile = normalizedProfile(remote.profile);
    state.profileUpdatedAt = remote.updatedAt || null;
    state.profileOwner = authUser.username;
    persistState();
    hydrateProfileForm();
    renderPromptList();
    renderPhotoPreview();
    showToast("已从服务器恢复资料与照片。");
    return;
  }

  if (action === "reset") {
    clearLocalProfile();
    return;
  }

  if (action === "push") {
    const synced = await syncProfileToServer();
    if (synced) showToast("资料已同步到服务器。");
  }
}

function renderAccountView() {
  accountPanel.hidden = !authUser;
  authForms.hidden = Boolean(authUser);

  if (authMode === "local") {
    authServiceNote.hidden = false;
    authServiceNote.textContent =
      "当前为 GitHub Pages 静态演示：账号保存在此浏览器的 IndexedDB 中，换设备或清除浏览器数据后需要重新注册。";
  } else if (authMode === "unavailable") {
    authServiceNote.hidden = false;
    authServiceNote.textContent =
      "当前浏览器无法使用本地账号存储，请通过 npm start 启动服务器，或换用现代浏览器后重试。";
  } else {
    authServiceNote.hidden = true;
  }

  if (!authUser) return;

  accountName.textContent = authUser.displayName;
  const registeredAt = new Date(authUser.createdAt);
  const dateLabel = Number.isNaN(registeredAt.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", { dateStyle: "long" }).format(registeredAt);
  const storageLabel = authMode === "local" ? " · 保存在当前浏览器" : "";
  const syncLabel =
    authMode === "server"
      ? state.profileOwner === authUser.username && state.profileUpdatedAt
        ? " · 资料与照片已同步"
        : " · 资料尚未同步"
      : "";
  accountMeta.textContent = dateLabel
    ? `用户名：${authUser.username} · 注册于 ${dateLabel}${storageLabel}${syncLabel}`
    : `用户名：${authUser.username}${storageLabel}${syncLabel}`;
}

function updateAccountUI() {
  accountNav.textContent = authUser ? "我的账号" : "登录 / 注册";
  accountNav.classList.toggle("signed-in", Boolean(authUser));
  renderAccountView();
}

async function loadSession() {
  try {
    const payload = await requestJson(`${API_BASE}/me`);
    if (!payload || !("user" in payload)) throw new Error("账号接口不可用");
    authMode = "server";
    authUser = payload.user || null;
  } catch {
    try {
      localAuth = createLocalAuth();
      authMode = "local";
      authUser = await localAuth.currentUser();
    } catch {
      localAuth = null;
      authMode = "unavailable";
      authUser = null;
    }
  }
  sessionSettled = true;
  updateAccountUI();
  await reconcileProfileWithServer();
  if (state.plan && !planResult.hidden) {
    renderPlanInvite(state.plan);
  }
}

async function submitAuthRequest(path, runLocal, body) {
  await sessionReady;

  if (authMode === "local" && localAuth) {
    return runLocal(localAuth);
  }
  if (authMode === "unavailable") {
    throw new Error("当前浏览器无法使用本地账号存储，请通过 npm start 启动服务器后再试。");
  }
  return requestJson(path, { method: "POST", body });
}

function setAuthMode(mode, { focusTab = false } = {}) {
  const isLogin = mode === "login";
  loginTab.setAttribute("aria-selected", String(isLogin));
  loginTab.tabIndex = isLogin ? 0 : -1;
  registerTab.setAttribute("aria-selected", String(!isLogin));
  registerTab.tabIndex = isLogin ? -1 : 0;
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  loginError.hidden = true;
  registerError.hidden = true;

  if (focusTab) (isLogin ? loginTab : registerTab).focus();
}

function setSubmitBusy(form, busy, label) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;

  if (busy) {
    button.dataset.idleLabel = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.idleLabel || button.textContent;
    button.disabled = false;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  loginError.hidden = true;
  if (!loginForm.reportValidity()) return;

  const formData = new FormData(loginForm);
  const credentials = {
    username: formData.get("username"),
    password: formData.get("password")
  };
  setSubmitBusy(loginForm, true, "正在登录…");
  try {
    const { user } = await submitAuthRequest(
      `${API_BASE}/login`,
      (auth) => auth.login(credentials),
      credentials
    );
    authUser = user;
    loginForm.reset();
    updateAccountUI();
    await reconcileProfileWithServer();
    showToast(`欢迎回来，${user.displayName}。`);
    navigate("home");
  } catch (error) {
    loginError.textContent = authErrorMessage(error);
    loginError.hidden = false;
    loginError.focus();
  } finally {
    setSubmitBusy(loginForm, false);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  registerError.hidden = true;
  if (!registerForm.reportValidity()) return;

  const formData = new FormData(registerForm);
  const registration = {
    username: formData.get("username"),
    password: formData.get("password"),
    displayName: formData.get("displayName")
  };
  setSubmitBusy(registerForm, true, "正在创建…");
  try {
    const { user } = await submitAuthRequest(
      `${API_BASE}/register`,
      (auth) => auth.register(registration),
      registration
    );
    authUser = user;
    registerForm.reset();
    await reconcileProfileWithServer();
    if (!state.profile.name) {
      state.profile.name = user.displayName;
      persistState();
    }
    updateAccountUI();
    showToast("账号已创建，并已自动登录。");
    navigate("profile");
  } catch (error) {
    registerError.textContent = authErrorMessage(error);
    registerError.hidden = false;
    registerError.focus();
  } finally {
    setSubmitBusy(registerForm, false);
  }
}

async function handleLogout() {
  try {
    await sessionReady;
    if (authMode === "local" && localAuth) {
      await localAuth.logout();
    } else if (authMode === "server") {
      await requestJson(`${API_BASE}/logout`, { method: "POST" });
    }
  } catch {
    // 即使请求失败，也先退出本机界面上的登录状态。
  }
  authUser = null;
  updateAccountUI();
  showToast("已退出登录。");
  navigate("home");
}

function setupDisplayPreferences() {
  let preferences = {};
  try {
    preferences = JSON.parse(localStorage.getItem(DISPLAY_KEY) || "{}");
  } catch {
    preferences = {};
  }

  const settings = [
    ["contrast", "contrast-high", "#contrast-toggle"],
    ["largeText", "large-text", "#text-toggle"],
    ["reduceMotion", "reduce-motion", "#motion-toggle"]
  ];

  settings.forEach(([key, className, selector]) => {
    const enabled = Boolean(preferences[key]);
    document.documentElement.classList.toggle(className, enabled);
    document.querySelector(selector).setAttribute("aria-pressed", String(enabled));
  });

  function togglePreference(key, className, selector) {
    const enabled = !document.documentElement.classList.contains(className);
    document.documentElement.classList.toggle(className, enabled);
    document.querySelector(selector).setAttribute("aria-pressed", String(enabled));
    preferences[key] = enabled;
    localStorage.setItem(DISPLAY_KEY, JSON.stringify(preferences));
  }

  document.querySelector("#contrast-toggle").addEventListener("click", () => {
    togglePreference("contrast", "contrast-high", "#contrast-toggle");
  });
  document.querySelector("#text-toggle").addEventListener("click", () => {
    togglePreference("largeText", "large-text", "#text-toggle");
  });
  document.querySelector("#motion-toggle").addEventListener("click", () => {
    togglePreference("reduceMotion", "reduce-motion", "#motion-toggle");
  });
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const navigationButton = event.target.closest("[data-nav]");
    if (navigationButton) {
      event.preventDefault();
      navigate(navigationButton.dataset.nav);
      return;
    }

    const photoTrigger = event.target.closest("[data-photo-src]");
    if (photoTrigger) {
      event.preventDefault();
      openPhotoModal(
        photoTrigger.dataset.photoSrc,
        photoTrigger.dataset.photoAlt || "照片",
        photoTrigger
      );
      return;
    }

    const choiceButton = event.target.closest("[data-choice-type]");
    if (choiceButton) toggleChoice(choiceButton);
  });

  photoModalClose.addEventListener("click", closePhotoModal);
  photoModal.addEventListener("click", (event) => {
    if (event.target === photoModal) closePhotoModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePhotoModal();
  });

  document.querySelector("#profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    saveProfileStep();
  });

  photoChoose.addEventListener("click", () => photoInput.click());
  photoInput.addEventListener("change", () => {
    handlePhotoChange(photoInput.files?.[0]);
    photoInput.value = "";
  });
  photoRemove.addEventListener("click", () => {
    state.profile.photo = "";
    persistState();
    renderPhotoPreview();
    photoStatus.textContent = "照片已移除。";
  });

  document.querySelector("#save-record-button").addEventListener("click", saveRecordStep);
  document.querySelector("#demo-button").addEventListener("click", startQuickDemo);
  document.querySelector("#start-button").addEventListener("click", () => navigate("profile"));
  document.querySelector("#plan-form").addEventListener("submit", createPlan);
  document.querySelector("#exit-button").addEventListener("click", showSilentExit);
  document.querySelector("#logout-button").addEventListener("click", handleLogout);
  loginForm.addEventListener("submit", handleLogin);
  registerForm.addEventListener("submit", handleRegister);
  loginTab.addEventListener("click", () => setAuthMode("login"));
  registerTab.addEventListener("click", () => setAuthMode("register"));
  document.querySelector(".auth-tabs").addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextMode = loginTab.getAttribute("aria-selected") === "true" ? "register" : "login";
    setAuthMode(nextMode, { focusTab: true });
  });

  document.querySelector("#speak-plan-button").addEventListener("click", () => {
    const match = selectedMatch();
    if (!state.plan || !match) return;
    speakText(
      `你和${match.profile.name}的见面卡。地点是${state.plan.place}，预计${state.plan.duration}。${
        state.plan.checkIn ? "三十分钟后会询问是否愿意继续。" : ""
      }双方都确认后再出发，随时可以直接离开。`,
      "plan"
    );
  });

  document.querySelectorAll(".match-toolbar").forEach((toolbar) => {
    toolbar.addEventListener("click", (event) => {
      const filterButton = event.target.closest("[data-filter]");
      if (filterButton) {
        matchFilter = filterButton.dataset.filter;
        matchPage = 0;
        renderMatches();
        return;
      }

      const genderButton = event.target.closest("[data-gender]");
      if (genderButton) {
        matchGenderFilter = genderButton.dataset.gender;
        matchPage = 0;
        renderMatches();
      }
    });
  });

  refreshMatches.addEventListener("click", () => {
    if (matchBatchCount <= 1) {
      showToast("当前筛选下已经是全部人选。");
      return;
    }
    matchPage = (matchPage + 1) % matchBatchCount;
    renderMatches();
    showToast("已换一批人选。");
  });

  window.addEventListener("hashchange", () => {
    navigate(currentViewFromHash(), { focus: true, updateHash: false });
  });

  window.addEventListener("beforeunload", () => {
    promptList.querySelectorAll("textarea[data-answer-key]").forEach((textarea) => {
      state.profile.answers[textarea.dataset.answerKey] = textarea.value.trim();
    });
    persistState();
  });
}

function init() {
  renderProfileChoices();
  setupDisplayPreferences();
  bindEvents();
  renderPromptList();
  sessionReady = loadSession();
  const query = new URLSearchParams(window.location.search);
  if (query.get("demo") === "1") {
    startQuickDemo(query.get("view") || "matches");
  } else {
    navigate(currentViewFromHash(), { focus: false, updateHash: false });
  }
}

init();
