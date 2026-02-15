const CSV_FILE = "./중등_수능필수영단어_1800.csv";
const QUIZ_TIME_LIMIT_MS = 10000;
const RECENT_WORD_LIMIT = 30;
const RECENT_BG_LIMIT = 10;
const SWIPE_MIN_Y = 64;
const SWIPE_AXIS_RATIO = 1.2;
const SWIPE_COMMIT_RATIO = 0.22;
const SWIPE_VELOCITY_THRESHOLD = 0.65;
const SWIPE_MAX_DRAG = 180;
const SWIPE_ROTATE_MAX = 4;
const SWIPE_RESTORE_MS = 220;
const HARD_TYPES = new Set(["OX", "FILL_BLANK", "SPEED_PICK"]);

const COMBO_TIER_THRESHOLDS = [0, 3, 6];
const COMBO_TIER_LABELS = ["CALM", "WARM", "BLAZE"];

const TYPES = [
  "WORD_TO_MEANING",
  "MEANING_TO_WORD",
  "OX",
  "FILL_BLANK",
  "EASY_BONUS",
  "SPEED_PICK",
];

const typeLabels = {
  WORD_TO_MEANING: "단어 -> 뜻",
  MEANING_TO_WORD: "뜻 -> 단어",
  OX: "OX 스피드",
  FILL_BLANK: "빈칸 완성",
  EASY_BONUS: "보너스",
  SPEED_PICK: "스피드 선택",
};

const dom = {
  app: document.getElementById("app"),
  card: document.getElementById("card"),
  prompt: document.getElementById("prompt"),
  options: document.getElementById("options"),
  typeLabel: document.getElementById("typeLabel"),
  caption: document.getElementById("caption"),
  timerBar: document.getElementById("timerBar"),
  streakValue: document.getElementById("streakValue"),
  speedValue: document.getElementById("speedValue"),
  comboTierValue: document.getElementById("comboTierValue"),
  progressLabel: document.getElementById("progressLabel"),
  soundToggle: document.getElementById("soundToggle"),
  bgLayer: document.querySelector(".bg-layer"),
  feedbackLayer: document.getElementById("feedbackLayer"),
  modeOverlay: document.getElementById("modeOverlay"),
  resultOverlay: document.getElementById("resultOverlay"),
  resultSummary: document.getElementById("resultSummary"),
  retryBtn: document.getElementById("retryBtn"),
  chooseModeBtn: document.getElementById("chooseModeBtn"),
  modeButtons: [...document.querySelectorAll(".mode-btn[data-limit]")],
};

const state = {
  words: [],
  cardCount: 0,
  streak: 0,
  peakCombo: 0,
  comboTier: 0,
  peakTier: 0,
  challengeXp: 0,
  responseMs: [],
  lastCardStartedAt: 0,
  timerId: null,
  question: null,
  locked: false,
  recentWordIds: [],
  recentBgIds: [],
  recentTypes: [],
  seenWordType: new Set(),
  soundOn: false,
  feed: [],
  feedIndex: -1,
  isReviewMode: false,
  navLockUntil: 0,
  wheelDeltaY: 0,
  wheelResetTimer: null,
  gesture: {
    active: false,
    dragging: false,
    startX: 0,
    startY: 0,
    currentY: 0,
    lastY: 0,
    lastTs: 0,
    velocityY: 0,
    pointerId: null,
  },
  sessionLimit: null,
  selectedModeLabel: "무한모드",
  sessionActive: false,
};

class SoundEngine {
  constructor() {
    this.ctx = null;
  }

  ensureCtx() {
    if (!this.ctx) this.ctx = new window.AudioContext();
    return this.ctx;
  }

  beep({ freq = 440, duration = 0.08, type = "sine", gain = 0.04, delay = 0 } = {}) {
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime + delay;
    osc.start(now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.stop(now + duration);
  }

  play(name) {
    if (!state.soundOn) return;
    if (name === "SFX_CORRECT") {
      this.beep({ freq: 680, duration: 0.07, type: "triangle", gain: 0.04 });
      this.beep({ freq: 860, duration: 0.07, type: "triangle", gain: 0.036, delay: 0.05 });
      this.beep({ freq: 1080, duration: 0.08, type: "triangle", gain: 0.032, delay: 0.1 });
    } else if (name === "SFX_WRONG" || name === "SFX_TIMEOUT") {
      this.beep({ freq: 220, duration: 0.1, type: "sawtooth", gain: 0.035 });
      this.beep({ freq: 170, duration: 0.09, type: "square", gain: 0.03, delay: 0.06 });
    } else if (name === "SFX_REWARD") {
      this.beep({ freq: 520, duration: 0.07, type: "square", gain: 0.04 });
      this.beep({ freq: 760, duration: 0.07, type: "square", gain: 0.035, delay: 0.05 });
      this.beep({ freq: 980, duration: 0.09, type: "square", gain: 0.03, delay: 0.1 });
    }
  }
}

const sound = new SoundEngine();
init();

async function init() {
  wireControls();
  wireGestureControls();
  state.words = await loadWords();
  if (state.words.length < 8) {
    dom.prompt.textContent = "CSV 데이터가 부족해.";
    return;
  }
  applyComboTheme(0, { burst: false });
  openModeOverlay();
}

function wireControls() {
  dom.soundToggle.addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    dom.soundToggle.textContent = state.soundOn ? "사운드 ON" : "사운드 OFF";
    if (state.soundOn) sound.play("SFX_REWARD");
  });

  dom.modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.dataset.limit;
      const limit = raw === "inf" ? null : Number(raw);
      startSession(limit, btn.textContent?.trim() || "모드");
    });
  });

  dom.retryBtn.addEventListener("click", () => startSession(state.sessionLimit, state.selectedModeLabel));
  dom.chooseModeBtn.addEventListener("click", () => {
    dom.resultOverlay.classList.add("hidden");
    openModeOverlay();
  });
}

function wireGestureControls() {
  dom.app.addEventListener("pointerdown", onPointerDown);
  dom.app.addEventListener("pointermove", onPointerMove);
  dom.app.addEventListener("pointerup", onPointerUp);
  dom.app.addEventListener("pointercancel", clearGesture);
  dom.app.addEventListener("wheel", onWheel, { passive: false });
}

function onPointerDown(e) {
  if (state.locked || !state.sessionActive) return;
  if (e.target.closest(".opt-btn") || e.target.closest(".sound-btn") || e.target.closest(".mode-btn")) return;
  state.gesture.active = true;
  state.gesture.dragging = false;
  state.gesture.startX = e.clientX;
  state.gesture.startY = e.clientY;
  state.gesture.currentY = e.clientY;
  state.gesture.lastY = e.clientY;
  state.gesture.lastTs = e.timeStamp || performance.now();
  state.gesture.velocityY = 0;
  state.gesture.pointerId = e.pointerId;
}

function onPointerMove(e) {
  if (!state.gesture.active || state.gesture.pointerId !== e.pointerId) return;
  if (state.locked || !state.sessionActive) return;
  const dx = e.clientX - state.gesture.startX;
  const dy = e.clientY - state.gesture.startY;
  const mostlyVertical = Math.abs(dy) > Math.abs(dx) * 0.7;
  const movedEnough = Math.abs(dy) > 10;
  if (mostlyVertical && movedEnough) state.gesture.dragging = true;
  if (!state.gesture.dragging) return;

  const now = e.timeStamp || performance.now();
  const dt = Math.max(1, now - state.gesture.lastTs);
  state.gesture.velocityY = (e.clientY - state.gesture.lastY) / dt;
  state.gesture.currentY = e.clientY;
  state.gesture.lastY = e.clientY;
  state.gesture.lastTs = now;

  applyDragTransform(dy);
}

function onPointerUp(e) {
  if (!state.gesture.active) return;
  if (state.gesture.pointerId !== e.pointerId) return;
  const dx = e.clientX - state.gesture.startX;
  const dy = e.clientY - state.gesture.startY;
  const vy = state.gesture.velocityY;
  const cardHeight = Math.max(1, dom.card.getBoundingClientRect().height);
  const commitDist = Math.max(SWIPE_MIN_Y, cardHeight * SWIPE_COMMIT_RATIO);
  const distEnough = Math.abs(dy) >= commitDist;
  const velocityEnough = Math.abs(vy) >= SWIPE_VELOCITY_THRESHOLD;
  const axisOk = Math.abs(dy) > Math.abs(dx) * SWIPE_AXIS_RATIO;
  const shouldCommit = state.gesture.dragging && axisOk && (distEnough || velocityEnough);
  clearGesture();
  if (!shouldCommit) {
    animateRestoreFromDrag();
    return;
  }
  resetCardTransform();
  handleSwipeNavigate(dy < 0 ? "up" : "down");
}

function clearGesture() {
  state.gesture.active = false;
  state.gesture.dragging = false;
  state.gesture.pointerId = null;
  state.gesture.velocityY = 0;
}

function onWheel(e) {
  if (state.locked || !state.sessionActive) return;
  e.preventDefault();
  if (performance.now() < state.navLockUntil) return;
  state.wheelDeltaY += e.deltaY;
  if (state.wheelResetTimer) window.clearTimeout(state.wheelResetTimer);
  state.wheelResetTimer = window.setTimeout(() => {
    state.wheelDeltaY = 0;
  }, 120);
  if (Math.abs(state.wheelDeltaY) < 90) return;
  const dir = state.wheelDeltaY > 0 ? "up" : "down";
  state.wheelDeltaY = 0;
  handleSwipeNavigate(dir);
}

function handleSwipeNavigate(direction) {
  if (!state.sessionActive) return;
  const now = performance.now();
  if (state.locked || now < state.navLockUntil) return;
  state.navLockUntil = now + 260;
  if (direction === "up") goNextCard("up");
  else goPrevCard("down");
}

function openModeOverlay() {
  resetTimer();
  state.sessionActive = false;
  dom.modeOverlay.classList.remove("hidden");
}

function startSession(limit, label) {
  state.sessionLimit = limit;
  state.selectedModeLabel = label;
  state.sessionActive = true;
  state.cardCount = 0;
  state.streak = 0;
  state.peakCombo = 0;
  state.comboTier = 0;
  state.peakTier = 0;
  state.challengeXp = 0;
  state.responseMs = [];
  state.feed = [];
  state.feedIndex = -1;
  state.isReviewMode = false;
  state.recentWordIds = [];
  state.recentTypes = [];
  state.seenWordType = new Set();
  applyComboTheme(0, { burst: false });
  dom.modeOverlay.classList.add("hidden");
  dom.resultOverlay.classList.add("hidden");
  updateHud();
  goNextCard("up");
}

async function loadWords() {
  try {
    const bytes = await fetch(CSV_FILE).then((r) => r.arrayBuffer());
    const text = decodeCsvText(bytes);
    return parseCsv(text)
      .filter((r) => r.Word && r.Meaning)
      .map((r, idx) => ({
        id: `${idx}-${r.Word.trim().toLowerCase()}`,
        word: r.Word.trim(),
        meaning: r.Meaning.trim(),
      }));
  } catch (_err) {
    return [];
  }
}

function decodeCsvText(buffer) {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!hasHeavyReplacement(utf8)) return utf8;
  try {
    const euckr = new TextDecoder("euc-kr").decode(buffer);
    return hasHeavyReplacement(euckr) ? utf8 : euckr;
  } catch (_err) {
    return utf8;
  }
}

function hasHeavyReplacement(text) {
  const bad = (text.match(/\uFFFD/g) || []).length;
  return bad > Math.max(3, Math.floor(text.length * 0.002));
}

function parseCsv(text) {
  const rows = [];
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (!lines.length) return rows;
  const header = splitCsvLine(lines[0]);
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

function splitCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else cur += c;
  }
  result.push(cur);
  return result;
}

function goNextCard(direction = "up") {
  if (!state.sessionActive) return;
  resetCardTransform();
  resetTimer();
  state.locked = false;

  if (state.isReviewMode && state.feedIndex < state.feed.length - 1) {
    state.feedIndex += 1;
    state.question = state.feed[state.feedIndex];
    state.isReviewMode = state.feedIndex < state.feed.length - 1;
    renderQuestion(state.question, { direction, reviewMode: state.isReviewMode });
    if (!state.isReviewMode) startTimer(state.question.timeLimitMs);
    return;
  }

  state.isReviewMode = false;
  const question = buildQuestion();
  state.question = question;
  state.feed.push(question);
  if (state.feed.length > 200) state.feed.shift();
  state.feedIndex = state.feed.length - 1;
  renderQuestion(question, { direction, reviewMode: false });
  startTimer(question.timeLimitMs);
}

function goPrevCard(direction = "down") {
  resetCardTransform();
  if (state.feedIndex <= 0) {
    pulseNoHistory();
    return;
  }
  resetTimer();
  state.locked = false;
  state.feedIndex -= 1;
  state.question = state.feed[state.feedIndex];
  state.isReviewMode = true;
  renderQuestion(state.question, { direction, reviewMode: true });
}

function buildQuestion() {
  const { type, base } = pickTypeAndWordPair();
  const distractors = pickDistinctWords(8, [base.id]);

  if (type === "WORD_TO_MEANING") {
    return {
      type,
      wordId: base.id,
      answer: base.meaning,
      prompt: base.word,
      options: shuffle([base.meaning, ...distractors.slice(0, 3).map((x) => x.meaning)]),
      timeLimitMs: QUIZ_TIME_LIMIT_MS,
      caption: "뜻이 맞는 걸 골라.",
      bonusMultiplier: 1,
    };
  }

  if (type === "MEANING_TO_WORD") {
    return {
      type,
      wordId: base.id,
      answer: base.word,
      prompt: base.meaning,
      options: shuffle([base.word, ...distractors.slice(0, 3).map((x) => x.word)]),
      timeLimitMs: QUIZ_TIME_LIMIT_MS,
      caption: "단어가 맞는 걸 골라.",
      bonusMultiplier: 1,
    };
  }

  if (type === "OX") {
    const isTrue = Math.random() > 0.5;
    const shownMeaning = isTrue ? base.meaning : pickOne(distractors).meaning;
    return {
      type,
      wordId: base.id,
      answer: isTrue ? "O" : "X",
      prompt: `${base.word} = ${shownMeaning}`,
      options: ["O", "X"],
      timeLimitMs: QUIZ_TIME_LIMIT_MS,
      caption: "맞으면 O, 틀리면 X.",
      bonusMultiplier: 1,
    };
  }

  if (type === "FILL_BLANK") {
    return {
      type,
      wordId: base.id,
      answer: base.word,
      prompt: `뜻이 '${base.meaning}'인 단어는 ____.`,
      options: shuffle([base.word, ...distractors.slice(0, 3).map((x) => x.word)]),
      timeLimitMs: QUIZ_TIME_LIMIT_MS,
      caption: "빈칸을 빠르게 채워.",
      bonusMultiplier: 1,
    };
  }

  if (type === "EASY_BONUS") {
    const wrongs = distractors.slice(0, 3).map((x) => x.meaning);
    return {
      type,
      wordId: base.id,
      answer: base.meaning,
      prompt: `보너스 문제: ${base.word}`,
      options: shuffle([base.meaning, ...wrongs]),
      timeLimitMs: QUIZ_TIME_LIMIT_MS,
      caption: "맞히면 연속 카운트 보너스!",
      bonusMultiplier: 2,
    };
  }

  return {
    type,
    wordId: base.id,
    answer: base.word,
    prompt: `${base.meaning}`,
    options: shuffle([base.word, ...distractors.slice(0, 3).map((x) => x.word)]),
    timeLimitMs: QUIZ_TIME_LIMIT_MS,
    caption: "여러 단어 중 정답을 빨리 골라.",
    bonusMultiplier: 1,
  };
}

function pickTypeAndWordPair() {
  for (let i = 0; i < 24; i += 1) {
    const type = pickType();
    const base = pickWord();
    const key = `${base.id}:${type}`;
    if (!state.seenWordType.has(key)) return { type, base };
  }
  return { type: pickType(), base: pickWord() };
}

function pickType() {
  const recentTwo = state.recentTypes.slice(-2);
  const candidates = TYPES.filter((t) => !(recentTwo.length === 2 && recentTwo[0] === t && recentTwo[1] === t));
  return pickOne(candidates);
}

function pickWord() {
  const recentSet = new Set(state.recentWordIds);
  const candidates = state.words.filter((w) => !recentSet.has(w.id));
  if (!candidates.length) {
    state.recentWordIds.length = 0;
    return pickOne(state.words);
  }
  return pickOne(candidates);
}

function pickDistinctWords(count, excludedIds = []) {
  const set = new Set(excludedIds);
  return shuffle(state.words.filter((w) => !set.has(w.id))).slice(0, count);
}

function renderQuestion(q, { direction, reviewMode }) {
  applyVisualBackground();
  dom.typeLabel.textContent = reviewMode ? `${typeLabels[q.type]} / 복습` : typeLabels[q.type];
  dom.prompt.textContent = q.prompt;
  dom.caption.textContent = reviewMode ? "복습 모드(기록 반영 안 됨)." : q.caption;
  dom.options.innerHTML = "";
  q.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opt-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => submitAnswer(opt));
    dom.options.appendChild(btn);
  });
  updateHud();
  animateIn(direction);
  state.lastCardStartedAt = performance.now();
}

function submitAnswer(value) {
  if (state.locked || !state.question) return;
  state.locked = true;
  const q = state.question;
  const correct = value === q.answer;

  if (state.isReviewMode) {
    if (correct) {
      showComboFeedback(Math.max(state.streak, 1), state.comboTier, false);
      playComboTierSfx(state.comboTier, "correct");
    } else {
      showMissFeedback(false);
      playComboTierSfx(state.comboTier, "wrong");
    }
    window.setTimeout(() => {
      state.locked = false;
    }, 420);
    return;
  }

  finishLiveCard(correct, q);
}

function handleTimeout() {
  if (state.locked || !state.question || state.isReviewMode) return;
  state.locked = true;
  finishLiveCard(false, state.question);
}

function finishLiveCard(correct, q) {
  const prevTier = state.comboTier;
  const elapsed = performance.now() - state.lastCardStartedAt;
  state.responseMs.push(elapsed);

  if (correct) {
    state.challengeXp += scoreChallenge(q, elapsed);
    state.streak += q.bonusMultiplier === 2 ? 2 : 1;
    state.peakCombo = Math.max(state.peakCombo, state.streak);
    state.comboTier = computeComboTier(state.streak);
    state.peakTier = Math.max(state.peakTier, state.comboTier);
    dom.card.classList.add("correct");
    const tierUp = state.comboTier > prevTier;
    showComboFeedback(state.streak, state.comboTier, tierUp);
    spawnParticles(state.comboTier);
    playComboTierSfx(state.comboTier, tierUp ? "tier_up" : "correct");
    applyComboTheme(state.comboTier, { burst: tierUp });
  } else {
    state.streak = 0;
    state.challengeXp = Math.max(0, state.challengeXp - 1);
    state.comboTier = computeComboTier(0);
    dom.card.classList.add("wrong");
    showMissFeedback(prevTier > 0);
    playComboTierSfx(prevTier, "wrong");
    applyComboTheme(state.comboTier, { burst: false });
  }

  state.cardCount += 1;
  state.recentWordIds.push(q.wordId);
  trimQueue(state.recentWordIds, RECENT_WORD_LIMIT);
  state.recentTypes.push(q.type);
  trimQueue(state.recentTypes, 6);
  state.seenWordType.add(`${q.wordId}:${q.type}`);
  updateHud();

  if (isSessionComplete()) {
    animateOut("up");
    window.setTimeout(() => {
      dom.card.classList.remove("correct", "wrong");
      endSession();
    }, 620);
    return;
  }

  animateOut("up");
  window.setTimeout(() => {
    dom.card.classList.remove("correct", "wrong");
    state.locked = false;
    goNextCard("up");
  }, 620);
}

function showComboFeedback(streak, tier, tierUp) {
  const el = document.createElement("div");
  el.className = "feedback-pop combo";
  const tierLabel = COMBO_TIER_LABELS[tier];
  el.textContent = tierUp ? `${tierLabel} UP! · COMBO x${streak}` : `COMBO x${streak}`;
  dom.feedbackLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 1800);
}

function showMissFeedback(hadTier) {
  const pop = document.createElement("div");
  pop.className = "feedback-pop miss";
  pop.textContent = hadTier ? "BREAK" : "MISS";
  const flash = document.createElement("div");
  flash.className = "impact-flash";
  dom.feedbackLayer.appendChild(flash);
  dom.feedbackLayer.appendChild(pop);
  window.setTimeout(() => {
    pop.remove();
    flash.remove();
  }, 1200);
}

function spawnParticles(tier = 0) {
  const cx = window.innerWidth * 0.5;
  const cy = window.innerHeight * 0.42;
  const count = tier >= 2 ? 18 : tier >= 1 ? 14 : 10;
  for (let i = 0; i < count; i += 1) {
    const p = document.createElement("div");
    const angle = (Math.PI * 2 * i) / count;
    const dist = 70 + Math.random() * (tier >= 2 ? 90 : tier >= 1 ? 65 : 42);
    p.className = "burst-particle";
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    p.style.setProperty("--tx", "0px");
    p.style.setProperty("--ty", "0px");
    p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    dom.feedbackLayer.appendChild(p);
    window.setTimeout(() => p.remove(), 560);
  }
}

function pulseNoHistory() {
  dom.card.classList.add("wrong");
  window.setTimeout(() => dom.card.classList.remove("wrong"), 200);
}

function updateHud() {
  dom.streakValue.textContent = String(state.streak);
  dom.comboTierValue.textContent = COMBO_TIER_LABELS[state.comboTier];
  const max = state.sessionLimit == null ? "∞" : String(state.sessionLimit);
  dom.progressLabel.textContent = `${state.cardCount} / ${max}`;
  const avg = state.responseMs.length
    ? state.responseMs.reduce((a, b) => a + b, 0) / state.responseMs.length
    : 0;
  dom.speedValue.textContent = `${(avg / 1000).toFixed(2)}s`;
}

function isSessionComplete() {
  return state.sessionLimit != null && state.cardCount >= state.sessionLimit;
}

function endSession() {
  resetTimer();
  state.sessionActive = false;
  state.locked = false;
  applyComboTheme(0, { burst: false });
  const avg = state.responseMs.length
    ? (state.responseMs.reduce((a, b) => a + b, 0) / state.responseMs.length / 1000).toFixed(2)
    : "0.00";
  dom.resultSummary.textContent = `${state.cardCount}문제 완료 · 평균 ${avg}초 · 최고 콤보 x${state.peakCombo} · 최고 ${COMBO_TIER_LABELS[state.peakTier]}`;
  dom.resultOverlay.classList.remove("hidden");
}

function startTimer(limitMs) {
  const started = performance.now();
  function tick() {
    if (state.locked || state.isReviewMode) return;
    const elapsed = performance.now() - started;
    const remainRate = Math.max(0, 1 - elapsed / limitMs);
    dom.timerBar.style.transform = `scaleX(${remainRate})`;
    if (remainRate <= 0) {
      handleTimeout();
      return;
    }
    state.timerId = window.requestAnimationFrame(tick);
  }
  state.timerId = window.requestAnimationFrame(tick);
}

function resetTimer() {
  if (state.timerId) {
    window.cancelAnimationFrame(state.timerId);
    state.timerId = null;
  }
  dom.timerBar.style.transform = "scaleX(1)";
}

function applyVisualBackground() {
  const bg = pickBackground();
  dom.bgLayer.style.background = bg.value;
}

function computeComboTier(streak) {
  if (streak >= COMBO_TIER_THRESHOLDS[2]) return 2;
  if (streak >= COMBO_TIER_THRESHOLDS[1]) return 1;
  return 0;
}

function applyComboTheme(tier, { burst = false } = {}) {
  const energy = tier === 2 ? 1 : tier === 1 ? 0.6 : 0.18;
  dom.app.style.setProperty("--energy", String(energy));
  dom.app.classList.remove("tier-calm", "tier-warm", "tier-blaze", "tier-burst");
  dom.app.classList.add(tier === 2 ? "tier-blaze" : tier === 1 ? "tier-warm" : "tier-calm");
  if (!burst) return;
  dom.app.classList.add("tier-burst");
  window.setTimeout(() => dom.app.classList.remove("tier-burst"), 340);
}

function playComboTierSfx(tier, event) {
  if (!state.soundOn) return;
  if (event === "wrong") {
    sound.play("SFX_WRONG");
    return;
  }
  if (event === "tier_up") {
    if (tier === 2) {
      sound.beep({ freq: 620, duration: 0.08, type: "square", gain: 0.045 });
      sound.beep({ freq: 880, duration: 0.08, type: "triangle", gain: 0.04, delay: 0.05 });
      sound.beep({ freq: 1180, duration: 0.1, type: "triangle", gain: 0.035, delay: 0.1 });
    } else {
      sound.play("SFX_REWARD");
    }
    return;
  }
  if (tier === 2) {
    sound.beep({ freq: 700, duration: 0.07, type: "triangle", gain: 0.038 });
    sound.beep({ freq: 930, duration: 0.08, type: "triangle", gain: 0.03, delay: 0.04 });
    return;
  }
  if (tier === 1) {
    sound.beep({ freq: 640, duration: 0.07, type: "triangle", gain: 0.034 });
    sound.beep({ freq: 820, duration: 0.07, type: "triangle", gain: 0.028, delay: 0.045 });
    return;
  }
  sound.play("SFX_CORRECT");
}

function pickBackground() {
  const all = buildBackgrounds();
  const recentSet = new Set(state.recentBgIds);
  const candidates = all.filter((bg) => !recentSet.has(bg.id));
  const picked = candidates.length ? pickOne(candidates) : pickOne(all);
  state.recentBgIds.push(picked.id);
  trimQueue(state.recentBgIds, RECENT_BG_LIMIT);
  return picked;
}

let bgCache = null;
function buildBackgrounds() {
  if (bgCache) return bgCache;
  const list = [];
  for (let i = 0; i < 72; i += 1) {
    const h1 = (i * 37) % 360;
    const h2 = (h1 + 65 + (i % 7) * 4) % 360;
    const h3 = (h2 + 55) % 360;
    list.push({
      id: `bg-${i}`,
      value: `radial-gradient(circle at ${15 + (i % 5) * 18}% ${12 + (i % 6) * 14}%, hsl(${h1} 84% 54%), transparent 50%), linear-gradient(140deg, hsl(${h2} 62% 24%), hsl(${h3} 72% 16%))`,
    });
  }
  bgCache = list;
  return list;
}

function animateIn(direction = "up") {
  resetCardTransform();
  dom.card.classList.remove("slide-in-up", "slide-in-down", "slide-out-up", "slide-out-down");
  dom.card.classList.add(direction === "down" ? "slide-in-down" : "slide-in-up");
  window.setTimeout(() => dom.card.classList.remove("slide-in-up", "slide-in-down"), 280);
}

function animateOut(direction = "up") {
  resetCardTransform();
  dom.card.classList.remove("slide-in-up", "slide-in-down", "slide-out-up", "slide-out-down");
  dom.card.classList.add(direction === "down" ? "slide-out-down" : "slide-out-up");
  window.setTimeout(() => dom.card.classList.remove("slide-out-up", "slide-out-down"), 240);
}

function scoreChallenge(question, elapsedMs) {
  let xp = 1;
  if (HARD_TYPES.has(question.type)) xp += 2;
  if (question.bonusMultiplier === 2) xp += 1;
  if (elapsedMs <= question.timeLimitMs * 0.55) xp += 1;
  return xp;
}

function applyDragTransform(rawDy) {
  const dy = Math.max(-SWIPE_MAX_DRAG, Math.min(SWIPE_MAX_DRAG, rawDy));
  const ratio = Math.max(-1, Math.min(1, dy / SWIPE_MAX_DRAG));
  const rotate = ratio * SWIPE_ROTATE_MAX;
  dom.card.style.transition = "none";
  dom.card.style.transform = `translate3d(0, ${dy}px, 0) rotate(${rotate}deg)`;
  dom.card.style.opacity = String(1 - Math.abs(ratio) * 0.16);
}

function animateRestoreFromDrag() {
  dom.card.style.transition = `transform ${SWIPE_RESTORE_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity ${SWIPE_RESTORE_MS}ms ease`;
  dom.card.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
  dom.card.style.opacity = "1";
  window.setTimeout(() => {
    dom.card.style.transition = "";
  }, SWIPE_RESTORE_MS + 20);
}

function resetCardTransform() {
  dom.card.style.transition = "";
  dom.card.style.transform = "";
  dom.card.style.opacity = "";
}

function trimQueue(arr, limit) {
  while (arr.length > limit) arr.shift();
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickOne(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function renderGameToText() {
  const max = state.sessionLimit == null ? "infinite" : state.sessionLimit;
  const payload = {
    note: "No coordinates; quiz card UI state only.",
    mode: {
      sessionActive: state.sessionActive,
      reviewMode: state.isReviewMode,
      overlay: !dom.modeOverlay.classList.contains("hidden") ? "mode" : !dom.resultOverlay.classList.contains("hidden") ? "result" : "play",
    },
    progress: {
      cardCount: state.cardCount,
      sessionLimit: max,
      streak: state.streak,
      comboTier: COMBO_TIER_LABELS[state.comboTier],
      peakCombo: state.peakCombo,
    },
    question: state.question
      ? {
          type: state.question.type,
          prompt: state.question.prompt,
          options: state.question.options,
          caption: state.question.caption,
          timeLimitMs: state.question.timeLimitMs,
        }
      : null,
  };
  return JSON.stringify(payload);
}

async function advanceTime(ms) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

window.render_game_to_text = renderGameToText;
window.advanceTime = advanceTime;
