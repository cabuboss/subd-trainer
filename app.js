// SUBD trainer — pure vanilla JS, no deps
let QUIZ = [];
let SECTIONS = {};

const state = {
  mode: null,
  list: [],
  idx: 0,
  correct: 0,
  wrong: 0,
  answered: false,
  errors: [],
};

const $ = (id) => document.getElementById(id);
const screen = (name) => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(name).classList.add('active');
};

// Классификация вопросов по теме (на основе ключевых слов)
function classify(q) {
  const t = (q.question || '').toLowerCase();
  const all = t + ' ' + (q.options || []).join(' ').toLowerCase();
  if (/normal|нормал|1nf|2nf|3nf|bcnf|зависимост|декомпозиц/.test(all)) return 'Нормализация';
  if (/transact|трансакц|транзакц|commit|rollback|acid|isolation|savepoint|deadlock/.test(all)) return 'Транзакции';
  if (/trigger|триггер/.test(all)) return 'Триггеры';
  if (/stored\s*procedure|хранимая\s*процедура|процедур/.test(all)) return 'Процедуры';
  if (/function|функци|udf|t-sql|tsql|@@/.test(all)) return 'Функции и T-SQL';
  if (/index|индекс|clustered|кластериз/.test(all)) return 'Индексы';
  if (/join|select|where|group by|having|union|подзапрос|выборк/.test(all)) return 'SELECT и JOIN';
  if (/insert|update|delete|merge|вставк|обновлен|удален/.test(all)) return 'DML';
  if (/create\s*(table|view|database)|alter|drop|схем|структур/.test(all)) return 'DDL';
  if (/grant|revoke|role|роль|разрешен|безопасн|user|пользоват/.test(all)) return 'Безопасность';
  if (/backup|restore|резерв|восстанов|recovery/.test(all)) return 'Резервное копирование';
  if (/cursor|курсор/.test(all)) return 'Курсоры';
  if (/view|представлен/.test(all)) return 'Представления (Views)';
  if (/constraint|ограничен|primary|foreign|unique|check/.test(all)) return 'Ограничения и ключи';
  return 'Прочее / Теория';
}

async function loadQuiz() {
  try {
    const res = await fetch('quiz.json');
    QUIZ = await res.json();
  } catch (e) {
    QUIZ = [];
    console.error('Failed to load quiz.json', e);
  }

  // Keep all valid: either quiz-ready (>=2 opts + correctIdx) or flashcard-only (has correctText)
  QUIZ = QUIZ.filter(q => q.question && (
    (q.options && q.options.length >= 2 && q.correctIdx !== null && q.correctIdx !== undefined) ||
    (q.flashcardOnly && q.correctText)
  ));

  SECTIONS = {};
  QUIZ.forEach(q => {
    const sec = classify(q);
    q._section = sec;
    if (!SECTIONS[sec]) SECTIONS[sec] = [];
    SECTIONS[sec].push(q);
  });

  $('globalStats').textContent = `${QUIZ.length} вопросов`;
  $('badgeAll').textContent = `${QUIZ.length} вопросов`;

  renderSectionList();
  maybeShowResume();
}

function maybeShowResume() {
  const saved = loadProgress();
  if (!saved || !saved.listKeys || saved.idx >= saved.listKeys.length) return;
  const qByKey = new Map(QUIZ.map(q => [q.question?.substring(0, 80), q]));
  const list = saved.listKeys.map(k => qByKey.get(k)).filter(Boolean);
  if (list.length === 0) { clearProgress(); return; }

  const menu = $('menu');
  const banner = document.createElement('div');
  banner.style.cssText = 'background:var(--bg-card);border:1px solid var(--accent);border-radius:12px;padding:18px 22px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap';
  const date = new Date(saved.ts).toLocaleString('ru');
  banner.innerHTML = `
    <div>
      <div style="font-weight:600;font-size:16px">Продолжить с вопроса ${saved.idx + 1}/${list.length}?</div>
      <div style="color:var(--text-dim);font-size:13px;margin-top:4px">Режим: ${saved.mode === 'all-random' ? 'Случайно' : saved.mode === 'marathon' ? 'Марафон' : saved.mode === 'flashcards' ? 'Карточки' : saved.mode} · ✓ ${saved.correct} · ✗ ${saved.wrong} · ${date}</div>
    </div>
    <div style="display:flex;gap:8px">
      <button id="resumeBtn" class="btn-primary">Продолжить</button>
      <button id="discardBtn" class="btn-secondary">Заново</button>
    </div>
  `;
  menu.insertBefore(banner, menu.firstChild);
  banner.querySelector('#resumeBtn').addEventListener('click', () => {
    state.mode = saved.mode;
    state.lastPayload = saved.lastPayload;
    state.list = list;
    state.idx = saved.idx;
    state.correct = saved.correct;
    state.wrong = saved.wrong;
    state.errors = (saved.errorKeys || []).map(k => qByKey.get(k)).filter(Boolean);
    state.answered = false;
    if (state.mode === 'flashcards') {
      screen('flashcards');
      renderFlashcard();
    } else {
      screen('quiz');
      renderQuestion();
    }
    banner.remove();
  });
  banner.querySelector('#discardBtn').addEventListener('click', () => {
    clearProgress();
    banner.remove();
  });
}

function renderSectionList() {
  const list = $('sectionList');
  const entries = Object.entries(SECTIONS).sort((a,b) => b[1].length - a[1].length);
  if (entries.length === 0) {
    list.innerHTML = '<p style="color:var(--text-dim);grid-column:1/-1">Разделы появятся после загрузки вопросов</p>';
    return;
  }
  list.innerHTML = '<h2 style="grid-column:1/-1;margin-bottom:8px;font-size:22px">Разделы</h2>' +
    entries.map(([name, items]) =>
      `<div class="section-card" data-section="${name}">
         <div class="name">${name}</div>
         <div class="count">${items.length} вопрос${plural(items.length)}</div>
       </div>`
    ).join('');

  list.querySelectorAll('.section-card').forEach(card => {
    card.addEventListener('click', () => startMode('section', card.dataset.section));
  });
}

function plural(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return '';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'а';
  return 'ов';
}

const SAVE_KEY = 'subd_progress_v1';

function saveProgress() {
  if (!state.mode || state.mode === 'review') return;
  const data = {
    mode: state.mode,
    lastPayload: state.lastPayload,
    idx: state.idx,
    correct: state.correct,
    wrong: state.wrong,
    listKeys: state.list.map(q => q.question?.substring(0, 80)),
    errorKeys: state.errors.map(q => q.question?.substring(0, 80)),
    ts: Date.now(),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch {}
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function clearProgress() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

function startMode(mode, payload) {
  // For restart from results, preserve last payload (e.g. section name)
  if (payload === undefined && mode === state.mode && state.lastPayload !== undefined) {
    payload = state.lastPayload;
  }
  state.mode = mode;
  state.lastPayload = payload;
  state.idx = 0;
  state.correct = 0;
  state.wrong = 0;
  state.answered = false;
  state.prevErrors = state.errors;  // keep last errors for review
  state.errors = [];

  // For quiz/marathon, only quiz-ready questions; for flashcards — all
  const quizReady = QUIZ.filter(q => !q.flashcardOnly);
  if (mode === 'all-random') state.list = shuffle([...quizReady]);
  else if (mode === 'marathon') state.list = [...quizReady];
  else if (mode === 'flashcards') state.list = shuffle([...QUIZ]);
  else if (mode === 'section') state.list = shuffle([...SECTIONS[payload]]);
  else if (mode === 'review' && payload) state.list = [...payload];

  if (state.list.length === 0) {
    alert('Нет вопросов в этом разделе');
    return;
  }

  if (mode === 'flashcards') {
    screen('flashcards');
    renderFlashcard();
  } else {
    screen('quiz');
    renderQuestion();
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function renderQuestion() {
  const q = state.list[state.idx];
  if (!q) return finishQuiz();

  state.answered = false;
  $('sectionTag').textContent = q._section || 'Вопрос';
  $('questionText').textContent = q.question;
  $('qNum').textContent = state.idx + 1;
  $('qTotal').textContent = state.list.length;
  $('correctCount').textContent = state.correct;
  $('wrongCount').textContent = state.wrong;
  $('progressFill').style.width = `${(state.idx / state.list.length) * 100}%`;
  $('nextBtn').classList.add('hidden');
  $('skipBtn').classList.remove('hidden');

  const opts = $('options');
  opts.innerHTML = q.options.map((opt, i) =>
    `<button class="option" data-idx="${i}">
       <span class="marker">${String.fromCharCode(65 + i)}</span>
       <span class="text">${escapeHtml(opt)}</span>
     </button>`
  ).join('');

  opts.querySelectorAll('.option').forEach(btn => {
    btn.addEventListener('click', () => handleAnswer(+btn.dataset.idx));
  });
}

function handleAnswer(picked) {
  if (state.answered) return;
  state.answered = true;
  const q = state.list[state.idx];
  const correct = q.correctIdx;

  $('options').querySelectorAll('.option').forEach((btn, i) => {
    btn.classList.add('disabled');
    if (i === correct) btn.classList.add('correct');
    else if (i === picked && picked !== correct) btn.classList.add('wrong');
  });

  if (picked === correct) state.correct++;
  else {
    state.wrong++;
    state.errors.push(q);
  }

  $('correctCount').textContent = state.correct;
  $('wrongCount').textContent = state.wrong;
  $('skipBtn').classList.add('hidden');
  $('nextBtn').classList.remove('hidden');
  $('nextBtn').focus();
}

function nextQuestion() {
  state.idx++;
  saveProgress();
  if (state.idx >= state.list.length) finishQuiz();
  else renderQuestion();
}

function finishQuiz() {
  clearProgress();
  const total = state.correct + state.wrong;
  const pct = total > 0 ? Math.round((state.correct / total) * 100) : 0;
  $('scoreValue').textContent = `${pct}%`;
  document.querySelector('.score-circle').style.setProperty('--p', `${pct}%`);
  $('finalCorrect').textContent = state.correct;
  $('finalWrong').textContent = state.wrong;
  $('finalTotal').textContent = total;
  $('reviewBtn').classList.toggle('hidden', state.errors.length === 0);
  screen('results');
}

function renderFlashcard() {
  const q = state.list[state.idx];
  if (!q) {
    screen('menu');
    return;
  }
  $('fcQuestion').textContent = q.question;
  const correctText = q.options[q.correctIdx] || '(нет данных)';
  $('fcAnswer').textContent = correctText;
  $('fcNum').textContent = state.idx + 1;
  $('fcTotal').textContent = state.list.length;
  $('flashcard').classList.remove('flipped');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[m]));
}

document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', () => {
    const m = card.dataset.mode;
    if (m === 'by-section') {
      document.getElementById('sectionList').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    startMode(m);
  });
});

$('backBtn').addEventListener('click', () => screen('menu'));
$('backBtnFC').addEventListener('click', () => screen('menu'));
$('homeBtn').addEventListener('click', () => screen('menu'));
$('restartBtn').addEventListener('click', () => startMode(state.mode, state.lastPayload));
$('reviewBtn').addEventListener('click', () => startMode('review', state.prevErrors || state.errors));
$('nextBtn').addEventListener('click', nextQuestion);
$('skipBtn').addEventListener('click', nextQuestion);

$('flashcard').addEventListener('click', () => $('flashcard').classList.toggle('flipped'));
$('fcNext').addEventListener('click', (e) => {
  e.stopPropagation();
  state.idx++;
  if (state.idx >= state.list.length) state.idx = 0;
  renderFlashcard();
});
$('fcPrev').addEventListener('click', (e) => {
  e.stopPropagation();
  state.idx = Math.max(0, state.idx - 1);
  renderFlashcard();
});

document.addEventListener('keydown', (e) => {
  if ($('quiz').classList.contains('active')) {
    if (!state.answered && /^[1-9]$/.test(e.key)) {
      const idx = +e.key - 1;
      const q = state.list[state.idx];
      if (q && idx < q.options.length) handleAnswer(idx);
    } else if (state.answered && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) {
      e.preventDefault();
      nextQuestion();
    }
  } else if ($('flashcards').classList.contains('active')) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      $('flashcard').classList.toggle('flipped');
    } else if (e.key === 'ArrowRight') $('fcNext').click();
    else if (e.key === 'ArrowLeft') $('fcPrev').click();
  }
});

loadQuiz();
