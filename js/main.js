let activeStep = 'start';
let isResultAvailable = false;

// 스텝 변경 및 화면 조작 인터랙션
function navigateToStep(stepId) {
  // 입력 화면 단계를 거칠 때 유효성 체크
  if (activeStep === 'career' && ['tasks', 'skills', 'result'].includes(stepId)) {
    if (!document.getElementById('career').value.trim()) {
      showError('errorCareer');
      return;
    }
  }
  if (activeStep === 'tasks' && ['skills', 'result'].includes(stepId)) {
    if (!document.getElementById('tasks').value.trim()) {
      showError('errorTasks');
      return;
    }
  }

  hideAllErrors();
  closeJobSuggest();
  activeStep = stepId;

  // 화면 전환
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const targetScreen = document.getElementById(`screen-${stepId}`);
  if (targetScreen) targetScreen.classList.add('active');

  // 스텝바 제어 (홈 및 결과 제외)
  const stepBar = document.getElementById('stepBar');
  if (['career', 'tasks', 'skills'].includes(stepId)) {
    stepBar.hidden = false;
    document.getElementById('dot1').classList.toggle('active', true);
    document.getElementById('dot2').classList.toggle('active', ['tasks', 'skills'].includes(stepId));
    document.getElementById('dot3').classList.toggle('active', stepId === 'skills');
  } else {
    stepBar.hidden = true;
  }

  // 탭 상태 전환
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  const currentTab = document.getElementById(`tab-${stepId}`);
  if (currentTab) currentTab.classList.add('active');

  if (stepId === 'mypage') renderMyPage();
  if (stepId === 'result') {
    if (!isResultAvailable) showEmptyResult();
    updateFavoriteButton();
  }

  // 스크롤 탑
  const contentArea = document.querySelector('.content-area');
  if (contentArea) contentArea.scrollTop = 0;
}

function hideAllErrors() {
  document.querySelectorAll('.form-error').forEach(e => e.classList.remove('show'));
}

function showError(id) {
  hideAllErrors();
  const elem = document.getElementById(id);
  if (elem) elem.classList.add('show');
}


/* ============================================================
   직업 데이터 (JSON 호출)
   - data/job_subclassifications.json : 신직업 41개 (영역 · 직군 · 직업 · 직무개요)
   - data/2025_new_jobs_study_summary.json : 연구 출처, 영역별 직업 수, 신직업 공통 특징
   ============================================================ */
const DATA_PATHS = {
  jobs: 'data/job_subclassifications.json',
  study: 'data/2025_new_jobs_study_summary.json',
  fallback: 'data/data-fallback.js'
};

let jobData = [];        // 직업 목록
let domainOrder = [];    // 영역 표시 순서 (연구 요약 파일 기준)
let studyInfo = null;    // 연구 요약 정보
let jobDataReady = null; // 데이터 로딩 Promise

function normalizeName(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

// 이름 비교용 변형: 공백 제거 / 괄호 내용 제거 / 괄호 기호만 제거
function nameVariants(value) {
  const base = normalizeName(value);
  const noParenText = base.replace(/\([^)]*\)/g, '');
  const noParenChars = base.replace(/[()]/g, '');
  return [...new Set([base, noParenText, noParenChars].filter(Boolean))];
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} (${response.status})`);
  return response.json();
}

async function loadJobData() {
  let rawJobs = [];
  let rawStudy = [];
  try {
    // 파일을 더블클릭해서 열면(file://) 브라우저가 fetch를 막으므로 바로 대체 파일 사용
    if (location.protocol === 'file:') throw new Error('file protocol');
    [rawJobs, rawStudy] = await Promise.all([fetchJson(DATA_PATHS.jobs), fetchJson(DATA_PATHS.study)]);
  } catch (error) {
    // fetch 실패 시 data/data-fallback.js (JSON과 같은 내용) 사용
    try {
      await loadScript(DATA_PATHS.fallback);
      rawJobs = window.JINROFIT_FALLBACK.jobs;
      rawStudy = window.JINROFIT_FALLBACK.study;
    } catch (fallbackError) {
      console.warn('직업 데이터를 불러오지 못했습니다.', error);
    }
  }

  studyInfo = Array.isArray(rawStudy) ? (rawStudy[0] || null) : rawStudy;
  jobData = (rawJobs || []).map(item => ({
    id: item['연번'],
    domain: item['영역'],
    group: item['직군'],
    name: item['직업'],
    overview: item['직무개요'],
    variants: nameVariants(item['직업'])
  }));

  const studyDomains = studyInfo && studyInfo.final_selected_jobs_by_domain
    ? Object.keys(studyInfo.final_selected_jobs_by_domain) : [];
  const jobDomains = [...new Set(jobData.map(job => job.domain))];
  domainOrder = [...studyDomains.filter(d => jobDomains.includes(d)), ...jobDomains.filter(d => !studyDomains.includes(d))];
}

// 입력한 직업명과 일치하는 직업 찾기
function findJob(input) {
  const inputVariants = nameVariants(input).filter(v => v.length >= 2);
  if (!inputVariants.length || !jobData.length) return { job: null, exact: false, candidates: [] };

  const exact = jobData.find(job => job.variants.some(v => inputVariants.includes(v)));
  if (exact) return { job: exact, exact: true, candidates: [] };

  const candidates = jobData.filter(job =>
    job.variants.some(v => inputVariants.some(iv => v.includes(iv) || iv.includes(v)))
  );
  if (candidates.length === 1) return { job: candidates[0], exact: false, candidates };
  return { job: null, exact: false, candidates };
}

// 받침 유무에 따라 조사 선택 (예: josa('크리에이터', '이', '가') → '가')
function josa(word, withBatchim, withoutBatchim) {
  const chars = String(word).replace(/[^가-힣a-zA-Z0-9]/g, '');
  const last = chars.charAt(chars.length - 1);
  if (!last) return withoutBatchim;
  const code = last.charCodeAt(0);
  let hasBatchim;
  if (code >= 0xAC00 && code <= 0xD7A3) hasBatchim = (code - 0xAC00) % 28 !== 0;
  else if (/[0-9]/.test(last)) hasBatchim = '013678'.includes(last);
  else hasBatchim = 'lmnrLMNR'.includes(last);
  return hasBatchim ? withBatchim : withoutBatchim;
}

function sourceLabel() {
  if (!studyInfo) return '출처: 2025 신직업 연구';
  const title = String(studyInfo.title || '').replace(/\([^)]*\)\s*$/, '').trim();
  const date = String(studyInfo.publication_date || '').replace('-', '.');
  return `출처: ${studyInfo.publisher} 「${title}」 (${date})`;
}


// 홈: 신직업 목록에서 하나를 골라 희망 직업에 채워 넣고 입력 단계로 이동
async function recommendJob() {
  await jobDataReady;
  const input = document.getElementById('career');
  const current = nameVariants(input.value);
  const pool = jobData.filter(job => !job.variants.some(v => current.includes(v)));
  if (pool.length) input.value = pool[Math.floor(Math.random() * pool.length)].name;
  navigateToStep('career');
}

/* ===== 희망 직업 입력: 신직업 자동완성 ===== */
let suggestOpen = false;
let suggestIndex = -1;

function getSuggestBox() { return document.getElementById('jobSuggest'); }

function suggestOptions() { return [...getSuggestBox().querySelectorAll('.job-option')]; }

function renderJobSuggest(query) {
  const box = getSuggestBox();
  if (!box) return;
  const keys = nameVariants(query);
  const matches = jobData.filter(job => {
    if (!keys.length) return true;
    const haystacks = [...job.variants, normalizeName(job.group), normalizeName(job.domain)];
    return keys.some(k => haystacks.some(h => h.includes(k)));
  });

  box.innerHTML = '';
  suggestIndex = -1;

  if (!jobData.length) {
    box.innerHTML = '<div class="job-suggest-empty">직업 데이터를 불러오지 못했어요.</div>';
    return;
  }
  if (!matches.length) {
    box.innerHTML = '<div class="job-suggest-empty">일치하는 신직업이 없어요.</div>';
    return;
  }

  domainOrder.forEach(domain => {
    const inDomain = matches.filter(job => job.domain === domain);
    if (!inDomain.length) return;

    const heading = document.createElement('div');
    heading.className = 'job-suggest-domain';
    heading.textContent = `${domain} · ${inDomain.length}`;
    box.appendChild(heading);

    inDomain.forEach(job => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'job-option';
      option.setAttribute('role', 'option');
      const title = document.createElement('strong');
      title.textContent = job.name;
      const sub = document.createElement('small');
      sub.textContent = job.group;
      option.append(title, sub);
      option.addEventListener('click', () => selectJob(job.name));
      box.appendChild(option);
    });
  });
}

function openJobSuggest(query) {
  const box = getSuggestBox();
  if (!box) return;
  suggestOpen = true;
  box.hidden = false;
  document.getElementById('career').setAttribute('aria-expanded', 'true');
  jobDataReady.then(() => { if (suggestOpen) renderJobSuggest(query); });
}

function closeJobSuggest() {
  const box = getSuggestBox();
  if (!box) return;
  suggestOpen = false;
  box.hidden = true;
  const input = document.getElementById('career');
  if (input) input.setAttribute('aria-expanded', 'false');
}

function selectJob(name) {
  document.getElementById('career').value = name;
  hideAllErrors();
  closeJobSuggest();
}

function moveSuggestIndex(step) {
  const options = suggestOptions();
  if (!options.length) return;
  suggestIndex = (suggestIndex + step + options.length) % options.length;
  options.forEach((option, index) => option.classList.toggle('is-active', index === suggestIndex));
  options[suggestIndex].scrollIntoView({ block: 'nearest' });
}

function initJobSuggest() {
  const input = document.getElementById('career');
  if (!input) return;
  input.addEventListener('focus', () => openJobSuggest(''));
  input.addEventListener('input', () => openJobSuggest(input.value));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (!suggestOpen) openJobSuggest(''); else moveSuggestIndex(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveSuggestIndex(-1); }
    else if (event.key === 'Enter' && suggestOpen && suggestIndex >= 0) { event.preventDefault(); suggestOptions()[suggestIndex].click(); }
    else if (event.key === 'Escape' || event.key === 'Tab') closeJobSuggest();
  });
  document.addEventListener('mousedown', event => {
    if (!event.target.closest('.combo')) closeJobSuggest();
  });
}


/* ===== 키워드 기반 간단 비교 ===== */
const IGNORED_WORDS = new Set(['능력', '업무', '관련', '통해', '위해', '수행', '역량', '지식', '기술']);

function extractWords(text) {
  const words = String(text).split(/[\s,，、./·;:()[\]{}"'“”‘’!?~\-]+/).map(word => word.trim()).filter(word => word.length >= 2);
  return [...new Set(words)];
}

// 사용자가 쓴 단어가 직무개요에 들어 있는지 확인 ('기획하고' → '기획'처럼 어미를 줄여가며 비교)
function findOverlap(userText, overview) {
  const target = String(overview).replace(/\s+/g, '').toLowerCase();
  const hits = [];
  extractWords(userText).forEach(word => {
    if (IGNORED_WORDS.has(word)) return;
    const lower = word.toLowerCase();
    let found = null;
    if (/^[a-z0-9]+$/.test(lower)) {
      if (target.includes(lower)) found = word;
    } else {
      for (let len = lower.length; len >= Math.max(2, lower.length - 2); len--) {
        const stem = lower.slice(0, len);
        if (target.includes(stem)) { found = word.slice(0, len); break; }
      }
    }
    if (found && !hits.includes(found)) hits.push(found);
  });
  return hits;
}

function setStatus(id, kind, label) {
  const elem = document.getElementById(id);
  if (!elem) return;
  elem.className = `status ${kind}`;
  elem.textContent = label;
}

function setText(id, text) {
  const elem = document.getElementById(id);
  if (elem) elem.textContent = text;
}

function keywordText(hits) {
  return hits.length ? hits.join(', ') : '겹치는 키워드가 없어요';
}

// 문장 조각(문자열 / {strong: 문자열})을 안전하게 채우기
function setRichText(id, parts) {
  const elem = document.getElementById(id);
  if (!elem) return;
  elem.textContent = '';
  parts.forEach(part => {
    if (typeof part === 'string') elem.appendChild(document.createTextNode(part));
    else {
      const strong = document.createElement('strong');
      strong.textContent = part.strong;
      elem.appendChild(strong);
    }
  });
}

function makeChip(label, onClick) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'suggest-chip';
  chip.textContent = label;
  chip.addEventListener('click', onClick);
  return chip;
}

// 다른 직업으로 같은 입력 내용 다시 비교
function compareWith(name) {
  document.getElementById('career').value = name;
  processComparison();
}

function setResultHeadVisible(visible) {
  document.querySelector('.result-career-line').hidden = !visible;
  document.querySelector('.example-badge').hidden = !visible;
}

function renderMatchedResult(job, ctx) {
  const taskHits = findOverlap(ctx.tasks, job.overview);
  const skillHits = findOverlap(ctx.skills, job.overview);
  const source = sourceLabel();

  setText('resultCaption', `${job.domain} · ${job.group}`);

  // 1. 주요 업무
  if (taskHits.length >= 2) setStatus('cardTaskStatus', 'match', '일치');
  else if (taskHits.length === 1) setStatus('cardTaskStatus', 'check', '추가 확인 필요');
  else setStatus('cardTaskStatus', 'diff', '차이');
  setText('cardTaskUser', ctx.tasks);
  setText('cardTaskActual', job.overview);
  setText('cardTaskKeywords', keywordText(taskHits));

  // 2. 필요 역량
  if (skillHits.length >= 1) setStatus('cardSkillStatus', 'match', '일치');
  else setStatus('cardSkillStatus', 'check', '추가 확인 필요');
  setText('cardSkillUser', ctx.skills);
  setText('cardSkillActual', job.overview);
  setText('cardSkillKeywords', keywordText(skillHits));

  // 3. 직업 분류
  setText('cardClassTitle', `직업 분류 · ${job.domain}`);
  if (ctx.exact) setStatus('cardClassStatus', 'match', '일치');
  else setStatus('cardClassStatus', 'check', '추가 확인 필요');
  setText('cardClassUser', ctx.career);
  setText('cardClassActual', `${job.domain} > ${job.group} > ${job.name}`);

  document.querySelectorAll('#matchedResult .source').forEach(elem => { elem.textContent = source; });

  // 리포트
  let verdict;
  if (taskHits.length >= 2) verdict = '예상한 업무가 실제 직무와 꽤 맞닿아 있어요.';
  else if (taskHits.length === 1) verdict = '예상한 업무가 일부만 겹쳐요. 직무개요를 읽으며 빠진 업무를 찾아보세요.';
  else verdict = '예상한 업무와 직무개요가 거의 겹치지 않아요. 어떤 일을 하는 직업인지 직무개요를 다시 확인해 보세요.';
  setRichText('resultReport', [
    { strong: job.name },
    `${josa(job.name, '은', '는')} ${job.domain}의 '${job.group}' 직군에 속하는 신직업이에요. 입력하신 업무에서 `,
    { strong: `${taskHits.length}개 키워드` },
    `가 직무개요와 겹쳐요. ${verdict}`
  ]);

  const trends = (studyInfo && studyInfo.key_characteristics_of_new_jobs) || [];
  const trendList = document.getElementById('trendList');
  trendList.textContent = '';
  trends.forEach(text => {
    const item = document.createElement('li');
    item.textContent = text;
    trendList.appendChild(item);
  });
  document.getElementById('trendBox').hidden = !trends.length;

  // 추가 탐색 질문 + 관련 직업
  setText('resultQuestion', `'${job.group}' 분야에서 ${job.name}${josa(job.name, '이', '가')} 하는 일 중, 내가 가장 해보고 싶은 업무는 무엇인가요?`);
  let related = jobData.filter(item => item.group === job.group && item.id !== job.id);
  let relatedLabel = '같은 직군의 다른 직업';
  if (!related.length) {
    related = jobData.filter(item => item.domain === job.domain && item.id !== job.id).slice(0, 3);
    relatedLabel = '같은 영역의 다른 직업';
  }
  const relatedList = document.getElementById('relatedList');
  relatedList.textContent = '';
  related.forEach(item => relatedList.appendChild(makeChip(item.name, () => compareWith(item.name))));
  setText('relatedLabel', relatedLabel);
  document.getElementById('relatedJobs').hidden = !related.length;

  document.getElementById('favoriteButton').hidden = false;
  document.getElementById('matchedResult').hidden = false;
  document.getElementById('missingResult').hidden = true;
}

function renderMissingResult(career, candidates) {
  const suggest = document.getElementById('missingSuggest');
  suggest.textContent = '';

  if (candidates.length) {
    setText('missingTitle', '혹시 이런 직업을 찾으셨나요?');
    setText('missingText', `'${career}'${josa(career, '과', '와')} 비슷한 신직업이 여러 개 있어요. 하나를 고르면 입력하신 내용으로 바로 비교해요.`);
    candidates.slice(0, 8).forEach(job => suggest.appendChild(makeChip(job.name, () => compareWith(job.name))));
    setText('resultCaption', '');
  } else {
    const total = (studyInfo && studyInfo.final_selected_jobs_count) || jobData.length;
    setText('missingTitle', '실제 직업정보를 찾을 수 없어요');
    setText('missingText', jobData.length
      ? `입력하신 직업은 2025 신직업 ${total}개 목록에 없어요. 아래 직업 중에서 골라 비교해 보세요.`
      : '직업 데이터를 불러오지 못했어요. 파일 위치(data 폴더)를 확인해 주세요.');
    domainOrder.forEach(domain => {
      const first = jobData.find(job => job.domain === domain);
      if (first) suggest.appendChild(makeChip(first.name, () => compareWith(first.name)));
    });
    setText('resultCaption', '현재 해당 직업의 예시 데이터가 마련되어 있지 않습니다.');
  }

  document.getElementById('favoriteButton').hidden = true;
  document.getElementById('matchedResult').hidden = true;
  document.getElementById('missingResult').hidden = false;
}

// 비교 전에 결과 탭을 누른 경우
function showEmptyResult() {
  setResultHeadVisible(false);
  setText('resultCareer', '');
  setText('resultCaption', '');
  setText('missingTitle', '아직 비교 결과가 없어요');
  setText('missingText', '희망 직업, 예상 업무, 필요 역량을 입력하면 결과를 확인할 수 있어요.');
  document.getElementById('missingSuggest').textContent = '';
  document.getElementById('matchedResult').hidden = true;
  document.getElementById('missingResult').hidden = false;
}

// 비교 결과 처리 함수
async function processComparison() {
  const career = document.getElementById('career').value.trim();
  const tasks = document.getElementById('tasks').value.trim();
  const skills = document.getElementById('skills').value.trim();

  if (!skills) {
    showError('errorSkills');
    return;
  }

  await jobDataReady;
  const { job, exact, candidates } = findJob(career);
  const careerName = job ? job.name : career;

  document.getElementById('resultCareer').textContent = careerName;
  document.getElementById('outTasks').textContent = tasks;
  document.getElementById('outSkills').textContent = skills;
  setResultHeadVisible(true);

  if (job) renderMatchedResult(job, { career, tasks, skills, exact });
  else renderMissingResult(career, candidates);

  isResultAvailable = true;
  saveComparisonRecord({ career: careerName, tasks, skills, date: new Date().toISOString() });
  navigateToStep('result');
}

// 실시간 상태 표시줄 시간 변경
function updateStatusTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const statusTime = document.getElementById('statusTime');
  if (statusTime) statusTime.textContent = `${hours}:${minutes}`;
}

document.addEventListener("DOMContentLoaded", () => {
  jobDataReady = loadJobData();
  initJobSuggest();
  updateStatusTime();
  setInterval(updateStatusTime, 30000);
});


// 브라우저에 비교 기록과 좋아요 직업 저장
function readSavedList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch (error) {
    return [];
  }
}

function writeSavedList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('브라우저 저장 공간을 사용할 수 없습니다.', error);
  }
}

function saveComparisonRecord(record) {
  const history = readSavedList('jinrofitComparisonHistory');
  history.unshift(record);
  writeSavedList('jinrofitComparisonHistory', history.slice(0, 30));
}

function toggleFavorite() {
  const career = (document.getElementById('resultCareer')?.textContent || '').trim();
  if (!career) return;

  const favorites = readSavedList('jinrofitFavoriteJobs');
  const exists = favorites.some(item => item.career === career);
  const updated = exists
    ? favorites.filter(item => item.career !== career)
    : [{ career, date: new Date().toISOString() }, ...favorites];

  writeSavedList('jinrofitFavoriteJobs', updated);
  updateFavoriteButton();
}

function updateFavoriteButton() {
  const button = document.getElementById('favoriteButton');
  const career = (document.getElementById('resultCareer')?.textContent || '').trim();
  if (!button || !career) return;
  const saved = readSavedList('jinrofitFavoriteJobs').some(item => item.career === career);
  button.classList.toggle('is-favorite', saved);
  button.setAttribute('aria-pressed', String(saved));
  button.innerHTML = saved ? '♥ 좋아요 취소' : '♡ 좋아요';
}

function renderMyPage() {
  const history = readSavedList('jinrofitComparisonHistory');
  const favorites = readSavedList('jinrofitFavoriteJobs');
  const historyBox = document.getElementById('comparisonHistory');
  const favoriteBox = document.getElementById('favoriteJobs');

  document.getElementById('historyCount').textContent = history.length;
  document.getElementById('favoriteCount').textContent = favorites.length;

  historyBox.innerHTML = history.length
    ? history.map(item => `
      <button class="mypage-job-item" type="button" onclick="openSavedJob(decodeURIComponent('${encodeURIComponent(item.career)}'))">
        <span><strong>${escapeHtml(item.career)}</strong><small>${formatSavedDate(item.date)} 비교함</small></span>
        <span class="mypage-arrow" aria-hidden="true">›</span>
      </button>`).join('')
    : '<div class="mypage-empty">아직 비교한 직업이 없어요.<br>희망 직업을 입력하고 비교해 보세요.</div>';

  favoriteBox.innerHTML = favorites.length
    ? favorites.map(item => `
      <div class="mypage-job-item favorite-job-item">
        <button class="mypage-job-open" type="button" onclick="openSavedJob(decodeURIComponent('${encodeURIComponent(item.career)}'))">
          <span><strong>${escapeHtml(item.career)}</strong><small>관심 직업으로 저장됨</small></span>
        </button>
        <button class="remove-favorite" type="button" onclick="removeFavorite(decodeURIComponent('${encodeURIComponent(item.career)}'))" aria-label="좋아요 취소">♥</button>
      </div>`).join('')
    : '<div class="mypage-empty">아직 좋아요한 직업이 없어요.<br>비교 결과에서 하트 버튼을 눌러 저장해 보세요.</div>';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function formatSavedDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR');
}

function openSavedJob(career) {
  document.getElementById('career').value = career;
  navigateToStep('career');
}

function removeFavorite(career) {
  const favorites = readSavedList('jinrofitFavoriteJobs').filter(item => item.career !== career);
  writeSavedList('jinrofitFavoriteJobs', favorites);
  renderMyPage();
  updateFavoriteButton();
}

function openLogin() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.hidden = false;
}

function closeLogin() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.hidden = true;
}

function showLoginNotice() {
  const notice = document.getElementById('loginNotice');
  if (notice) notice.textContent = '로그인 UI 미리보기입니다. 실제 계정 인증 및 서버 연동은 아직 구현되지 않았습니다.';
}
