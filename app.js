/* NE-BC Exam Simulator — Application Logic */

const ACCESS_CODE = "NEBC9000";
const EXAM_SECONDS = 4 * 60 * 60; // 4 hours for 300 questions
const PASSING_PCT = 72;
const STORAGE_KEY = "nebc_exam_state_v2";

let questions = [];
let state = {
  phase: "gate",
  answers: {},
  flags: {},
  current: 1,
  timeLeft: EXAM_SECONDS,
  submitted: false,
  startTime: null,
};

let timerInterval = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await loadQuestions();
  shuffleExamQuestions(); // always prepare a fresh shuffled deck on page load
  restoreState();

  if (state.phase === "exam") {
    showExam();
    startTimer();
    renderQuestion(state.current);
    renderGrid();
  } else if (state.phase === "results") {
    showResults();
  } else {
    document.getElementById("access-gate").style.display = "flex";
  }

  bindGate();
  bindResultsFilter();
});

async function loadQuestions() {
  // Load from embedded questions.js (works fully offline — no server needed)
  if (!window.EXAM_QUESTIONS || !window.EXAM_QUESTIONS.length) {
    console.error("No questions found. Make sure questions.js is in the simulator folder.");
    document.getElementById("gate-error").textContent =
      "Error: questions.js not found. Please ensure all simulator files are present.";
  }
  // questions array is populated by shuffleExamQuestions() at exam start
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleExamQuestions() {
  const letters = ["A", "B", "C", "D"];
  const base = window.EXAM_QUESTIONS || [];
  const shuffledOrder = shuffleArray(base);
  questions = shuffledOrder.map((q, idx) => {
    // Shuffle which letter A/B/C/D each option gets so the correct letter varies
    const newLetters = shuffleArray([...letters]);
    const newOptions = {};
    let newCorrect = q.correct;
    letters.forEach((oldLetter, i) => {
      const newLetter = newLetters[i];
      newOptions[newLetter] = q.options[oldLetter];
      if (oldLetter === q.correct) newCorrect = newLetter;
    });
    return { ...q, num: idx + 1, options: newOptions, correct: newCorrect };
  });
}

// ── Persistence ───────────────────────────────────────────────────────────────
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function restoreState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    if (parsed && parsed.phase) {
      if (parsed.phase === "exam" && !parsed.submitted && parsed.startTime) {
        const elapsed = Math.floor((Date.now() - parsed.startTime) / 1000);
        parsed.timeLeft = Math.max(0, parsed.timeLeft - elapsed);
      }
      Object.assign(state, parsed);
      state.startTime = Date.now();
    }
  } catch (e) { /* ignore */ }
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Access Gate ───────────────────────────────────────────────────────────────
function bindGate() {
  const codeInput = document.getElementById("access-code-input");
  const submitBtn = document.getElementById("gate-submit");
  const errorEl  = document.getElementById("gate-error");

  function attempt() {
    const val = codeInput.value.trim().toUpperCase();
    if (val === ACCESS_CODE) {
      errorEl.textContent = "";
      shuffleExamQuestions();
      state.phase = "exam";
      state.timeLeft = EXAM_SECONDS;
      state.startTime = Date.now();
      state.answers = {};
      state.flags = {};
      state.current = 1;
      state.submitted = false;
      saveState();
      showExam();
      startTimer();
      renderQuestion(1);
      renderGrid();
    } else {
      errorEl.textContent = "Incorrect access code. Please try again.";
      codeInput.value = "";
      codeInput.focus();
    }
  }

  submitBtn.addEventListener("click", attempt);
  codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
}

// ── Exam Setup ────────────────────────────────────────────────────────────────
function showExam() {
  document.getElementById("access-gate").style.display = "none";
  document.getElementById("exam-app").style.display = "block";
  document.getElementById("results-page").style.display = "none";
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    state.timeLeft--;
    saveState();
    updateTimerDisplay();
    if (state.timeLeft <= 0) {
      clearInterval(timerInterval);
      submitExam(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById("timer-value");
  const h = Math.floor(state.timeLeft / 3600);
  const m = Math.floor((state.timeLeft % 3600) / 60);
  const s = state.timeLeft % 60;
  el.textContent = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  el.classList.remove("warning", "critical");
  if (state.timeLeft < 300) el.classList.add("critical");
  else if (state.timeLeft < 900) el.classList.add("warning");
}

// ── Question Rendering ────────────────────────────────────────────────────────
function renderQuestion(num) {
  state.current = num;
  const q = questions[num - 1];
  if (!q) return;

  // Meta
  document.getElementById("q-num-label").textContent = `Question ${num} of ${questions.length}`;

  const badge = document.getElementById("domain-badge");
  badge.textContent = domainLabel(q.domain);
  badge.className = "domain-badge " + q.domain;

  // Flag button
  const flagBtn = document.getElementById("flag-btn");
  const flagLabel = document.getElementById("flag-label");
  const isFlagged = !!state.flags[num];
  flagBtn.classList.toggle("flagged", isFlagged);
  flagLabel.textContent = isFlagged ? "Flagged" : "Flag";

  // Question text
  document.getElementById("question-text").textContent = q.question;

  // Options
  const list = document.getElementById("options-list");
  list.innerHTML = "";
  const answered = state.answers[num];
  const showCorrect = state.submitted;

  ["A", "B", "C", "D"].forEach(letter => {
    if (!q.options[letter]) return;
    const li = document.createElement("li");
    li.className = "option-item";

    if (showCorrect) {
      li.classList.add("disabled");
      if (letter === q.correct) li.classList.add("correct");
      else if (letter === answered && letter !== q.correct) li.classList.add("wrong");
    } else if (answered === letter) {
      li.classList.add("selected");
    }

    const checkIcon = showCorrect
      ? (letter === q.correct ? "✓" : (letter === answered ? "✗" : ""))
      : "";

    li.innerHTML = `
      <div class="option-letter">${letter}</div>
      <div class="option-text">${q.options[letter]}</div>
      <div class="option-check">${checkIcon}</div>
    `;

    if (!showCorrect) {
      li.addEventListener("click", () => selectAnswer(num, letter));
    }

    list.appendChild(li);
  });

  // Explanation (only after submission)
  const expPanel = document.getElementById("explanation-panel");
  if (showCorrect && q.explanation) {
    expPanel.innerHTML = `
      <div class="exp-label">&#9432; Explanation</div>
      ${q.explanation}
    `;
    expPanel.classList.add("show");
  } else {
    expPanel.classList.remove("show");
    expPanel.innerHTML = "";
  }

  // Nav buttons
  document.getElementById("btn-prev").disabled = num <= 1;
  document.getElementById("btn-next").disabled = num >= questions.length;

  const submitBtn = document.getElementById("btn-submit-exam");
  if (num === questions.length && !state.submitted) {
    submitBtn.classList.add("show");
  } else {
    submitBtn.classList.remove("show");
  }

  // Progress bar + header text
  const answeredCount = Object.keys(state.answers).length;
  const pct = (answeredCount / questions.length) * 100;
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-text").textContent =
    `${answeredCount} of ${questions.length} answered`;

  updateGridDot(num);
  saveState();
}

function selectAnswer(num, letter) {
  if (state.submitted) return;
  state.answers[num] = letter;
  saveState();
  renderQuestion(num);
  renderGrid();
}

// ── Navigation ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    const prevBtn   = document.getElementById("btn-prev");
    const nextBtn   = document.getElementById("btn-next");
    const submitBtn = document.getElementById("btn-submit-exam");
    const flagBtn   = document.getElementById("flag-btn");

    prevBtn?.addEventListener("click", () => {
      if (state.current > 1) { renderQuestion(state.current - 1); renderGrid(); }
    });

    nextBtn?.addEventListener("click", () => {
      if (state.current < questions.length) { renderQuestion(state.current + 1); renderGrid(); }
    });

    submitBtn?.addEventListener("click", () => {
      const unanswered = questions.length - Object.keys(state.answers).length;
      if (unanswered > 0) {
        if (!confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
      }
      submitExam(false);
    });

    flagBtn?.addEventListener("click", () => {
      const num = state.current;
      state.flags[num] = !state.flags[num];
      if (!state.flags[num]) delete state.flags[num];
      const flagLabel = document.getElementById("flag-label");
      const isFlagged = !!state.flags[num];
      flagBtn.classList.toggle("flagged", isFlagged);
      if (flagLabel) flagLabel.textContent = isFlagged ? "Flagged" : "Flag";
      saveState();
      renderGrid();
    });
  }, 100);
});

// Keyboard navigation
document.addEventListener("keydown", (e) => {
  if (state.phase !== "exam" || state.submitted) return;
  if (["A","B","C","D"].includes(e.key.toUpperCase()) && !e.ctrlKey && !e.metaKey) {
    const target = document.activeElement;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    selectAnswer(state.current, e.key.toUpperCase());
  }
  if (e.key === "ArrowRight" && state.current < questions.length) {
    renderQuestion(state.current + 1); renderGrid();
  }
  if (e.key === "ArrowLeft" && state.current > 1) {
    renderQuestion(state.current - 1); renderGrid();
  }
});

// ── Grid ──────────────────────────────────────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById("q-grid");
  if (!grid) return;
  grid.innerHTML = "";
  questions.forEach((_, i) => {
    const num = i + 1;
    const dot = document.createElement("div");
    dot.className = "q-dot";
    dot.textContent = num;
    if (state.answers[num]) dot.classList.add("answered");
    if (state.flags[num])   dot.classList.add("flagged");
    if (num === state.current) dot.classList.add("current");
    dot.title = `Question ${num}`;
    dot.addEventListener("click", () => { renderQuestion(num); renderGrid(); });
    grid.appendChild(dot);
  });

  const answered  = Object.keys(state.answers).length;
  const flagged   = Object.keys(state.flags).length;
  const remaining = questions.length - answered;

  document.getElementById("stat-answered").textContent  = answered;
  document.getElementById("stat-flagged").textContent   = flagged;
  document.getElementById("stat-remaining").textContent = remaining;
}

function updateGridDot(currentNum) {
  document.querySelectorAll(".q-dot").forEach((dot, i) => {
    dot.classList.toggle("current", i + 1 === currentNum);
  });
}

// ── Submit ────────────────────────────────────────────────────────────────────
function submitExam(timedOut) {
  clearInterval(timerInterval);
  state.submitted = true;
  state.phase = "results";
  saveState();
  showResults(timedOut);
}

// ── Results ───────────────────────────────────────────────────────────────────
let allReviewItems = []; // store for filter

function showResults(timedOut = false) {
  document.getElementById("exam-app").style.display = "none";
  document.getElementById("results-page").style.display = "block";

  // Score calculation
  let correct = 0;
  const domainStats = {};
  questions.forEach(q => {
    const d = q.domain;
    if (!domainStats[d]) domainStats[d] = { correct: 0, total: 0 };
    domainStats[d].total++;
    if (state.answers[q.num] === q.correct) {
      correct++;
      domainStats[d].correct++;
    }
  });

  const total = questions.length;
  const pct   = Math.round((correct / total) * 100);
  const passed = pct >= PASSING_PCT;

  // Score cards
  document.getElementById("res-score").textContent  = `${correct}/${total}`;
  document.getElementById("res-pct").textContent    = `${pct}%`;
  document.getElementById("res-status").textContent = passed ? "PASS" : "FAIL";
  document.getElementById("res-sub").textContent    = passed
    ? "You met the passing benchmark!"
    : `Need ${PASSING_PCT}% to pass — keep studying!`;
  document.getElementById("res-icon").textContent   = passed ? "✓" : "✗";

  const statusCard = document.getElementById("res-status-card");
  statusCard.classList.remove("pass", "fail");
  statusCard.classList.add(passed ? "pass" : "fail");

  if (timedOut) {
    document.getElementById("res-timeout-msg").style.display = "block";
  }

  // Domain breakdown
  const breakdownEl = document.getElementById("domain-breakdown-rows");
  breakdownEl.innerHTML = "";
  const domainOrder = ["leadership", "healthcare_delivery", "quality_safety", "human_capital"];
  const domainColors = {
    leadership:          "#1B3A6B",
    healthcare_delivery: "#0A7E8C",
    quality_safety:      "#C05A10",
    human_capital:       "#5B1E8A",
  };

  domainOrder.forEach(d => {
    const st = domainStats[d] || { correct: 0, total: 0 };
    const dp = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "domain-row";
    row.innerHTML = `
      <div class="dr-label">${domainLabel(d)}</div>
      <div class="dr-bar-wrap">
        <div class="dr-bar" style="width:0%;background:${domainColors[d]};border-radius:6px;" data-width="${dp}"></div>
      </div>
      <div class="dr-stat">${st.correct}/${st.total}</div>
      <div class="dr-pct">${dp}%</div>
    `;
    breakdownEl.appendChild(row);
  });

  // Animate bars after paint
  requestAnimationFrame(() => {
    document.querySelectorAll(".dr-bar[data-width]").forEach(bar => {
      bar.style.width = bar.dataset.width + "%";
    });
  });

  // Build review items
  allReviewItems = [];
  questions.forEach(q => {
    const given     = state.answers[q.num] || null;
    const isCorrect = given === q.correct;
    const isSkipped = !given;

    const givenText = given ? q.options[given] : null;
    const correctText = q.options[q.correct];

    allReviewItems.push({ q, given, isCorrect, isSkipped, givenText, correctText });
  });

  renderReviewList("all");

  // Bind results buttons
  const printBtn = document.getElementById("btn-print");
  const resetBtn = document.getElementById("btn-reset");
  if (printBtn) printBtn.onclick = () => window.print();
  if (resetBtn) resetBtn.onclick = resetExam;
}

function renderReviewList(filter) {
  const reviewEl = document.getElementById("review-list");
  reviewEl.innerHTML = "";

  const items = filter === "wrong"
    ? allReviewItems.filter(item => !item.isCorrect)
    : filter === "correct"
    ? allReviewItems.filter(item => item.isCorrect && !item.isSkipped)
    : allReviewItems;

  items.forEach(({ q, given, isCorrect, isSkipped, givenText, correctText }) => {
    const item = document.createElement("div");
    item.className = "review-item " + (isCorrect ? "correct-item" : "wrong-item");

    const badgeClass = isSkipped ? "skip-badge" : isCorrect ? "correct-badge" : "wrong-badge";
    const badgeText  = isSkipped ? "Not Answered" : isCorrect ? "✓ Correct" : "✗ Incorrect";

    let answersHtml = "";
    if (isSkipped) {
      answersHtml = `<div><span class="ri-wrong-ans">Not answered</span></div>`;
    } else if (isCorrect) {
      answersHtml = `<div><span class="ri-correct-ans">✓ Your answer (${given}): ${givenText}</span></div>`;
    } else {
      answersHtml = `
        <div><span class="ri-wrong-ans">✗ Your answer (${given}): ${givenText}</span></div>
        <div><span class="ri-correct-ans">✓ Correct answer (${q.correct}): ${correctText}</span></div>
      `;
    }

    item.innerHTML = `
      <div class="ri-header">
        <div class="ri-num">Q${q.num} &mdash; ${domainLabel(q.domain)}</div>
        <div class="ri-badge ${badgeClass}">${badgeText}</div>
      </div>
      <div class="ri-q">${q.question}</div>
      <div class="ri-answers">${answersHtml}</div>
      ${q.explanation ? `
        <div class="ri-exp">
          <div class="ri-exp-label">Explanation</div>
          ${q.explanation}
        </div>` : ""}
    `;
    reviewEl.appendChild(item);
  });

  if (items.length === 0) {
    reviewEl.innerHTML = `<p style="color:var(--muted);text-align:center;padding:24px;">No questions in this category.</p>`;
  }
}

function bindResultsFilter() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderReviewList(btn.dataset.filter);
  });
}

function resetExam() {
  if (!confirm("Start a new exam? All current answers will be lost.")) return;
  clearState();
  shuffleExamQuestions();
  state = {
    phase: "exam",
    answers: {},
    flags: {},
    current: 1,
    timeLeft: EXAM_SECONDS,
    submitted: false,
    startTime: Date.now(),
  };
  allReviewItems = [];
  saveState();
  showExam();
  if (timerInterval) clearInterval(timerInterval);
  startTimer();
  renderQuestion(1);
  renderGrid();
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function domainLabel(d) {
  const map = {
    leadership:          "Leadership",
    healthcare_delivery: "Healthcare Delivery",
    quality_safety:      "Quality & Safety",
    human_capital:       "Human Capital",
  };
  return map[d] || d;
}
