let activeStep = 'start';
let isResultAvailable = false;

// 스텝 변경 및 화면 조작 인터랙션
function navigateToStep(stepId) {
  // 희망 직업을 입력한 뒤에는 통합 입력 화면으로 이동
  if (activeStep === 'career' && ['tasks', 'result'].includes(stepId)) {
    if (!document.getElementById('career').value.trim()) {
      showError('errorCareer');
      return;
    }
  }

  // 통합 입력 화면에서 비교 결과로 이동할 때 업무와 역량 모두 확인
  if (activeStep === 'tasks' && stepId === 'result') {
    if (!document.getElementById('tasks').value.trim()) {
      showError('errorTasks');
      return;
    }
    if (!document.getElementById('skills').value.trim()) {
      showError('errorSkills');
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

  // 입력 단계 진행 표시: 희망 직업 / 업무·역량 통합 입력
  const stepBar = document.getElementById('stepBar');
  if (['career', 'tasks'].includes(stepId)) {
    stepBar.hidden = false;
    document.getElementById('dot1').classList.toggle('active', true);
    document.getElementById('dot2').classList.toggle('active', stepId === 'tasks');
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
   - data/job_subclassifications.json : 연구 직업 데이터 (앞의 41개가 최종 선정 신직업)
   - data/occupations_537.json : 직업 세세분류 537개
   - data/2025_new_jobs_study_summary.json : 연구 출처, 영역별 직업 수, 신직업 공통 특징
   ============================================================ */
const DATA_PATHS = {
  jobs: 'data/job_subclassifications.json',
  study: 'data/2025_new_jobs_study_summary.json',
  occupations: 'data/occupations_537.json',
  fallback: 'data/data-fallback.js'
};

let jobData = [];        // 직업 목록
let domainOrder = [];    // 영역 표시 순서 (연구 요약 파일 기준)
let studyInfo = null;    // 연구 요약 정보
let occupationData = []; // 직업 세세분류 537개
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
  let rawOccupations = [];
  try {
    // 파일을 더블클릭해서 열면(file://) 브라우저가 fetch를 막으므로 대체 파일 사용
    if (location.protocol === 'file:') throw new Error('file protocol');
    [rawJobs, rawStudy, rawOccupations] = await Promise.all([
      fetchJson(DATA_PATHS.jobs),
      fetchJson(DATA_PATHS.study),
      fetchJson(DATA_PATHS.occupations)
    ]);
  } catch (error) {
    try {
      await loadScript(DATA_PATHS.fallback);
      rawJobs = window.JINROFIT_FALLBACK.jobs;
      rawStudy = window.JINROFIT_FALLBACK.study;
      rawOccupations = window.JINROFIT_FALLBACK.occupations || [];
    } catch (fallbackError) {
      console.warn('직업 데이터를 불러오지 못했습니다.', error);
    }
  }

  studyInfo = Array.isArray(rawStudy) ? (rawStudy[0] || null) : rawStudy;
  // 연구 보고서 요약에서 최종 선정한 신직업은 41개이며, 원본 직업 데이터 앞 41개가 해당 목록입니다.
  jobData = (rawJobs || []).slice(0, 41).map(item => ({
    id: item['연번'],
    domain: item['영역'],
    group: item['직군'],
    name: item['직업'],
    overview: item['직무개요'],
    variants: nameVariants(item['직업'])
  }));

  occupationData = (rawOccupations || []).map(item => ({
    name: item['KNOW직업명'],
    major: item['KNOW직업대분류'],
    middle: item['KNOW직업중분류'],
    small: item['KNOW직업소분류'],
    subclass: item['KNOW직업세분류'],
    detail: item['KNOW직업세세분류']
  })).filter(item => item.name);
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

// 537개 직업 세세분류 데이터에서 직업명 찾기
function findGeneralOccupation(input) {
  const variants = nameVariants(input);
  return occupationData.find(item => nameVariants(item.name).some(v => variants.includes(v))) || null;
}


/* ============================================================
   홈 '직업 분야 탐색' 8개 분야 → 직업 목록
   - 직업 세세분류(537개): KNOW 대분류-중분류 코드로 분야 지정, 일부는 직업명으로 예외 지정
   - 2025 신직업(41개): 영역 기준으로 분야 지정, 일부는 직업명으로 예외 지정
   - 8개 분야에 해당하지 않는 직업(서비스, 운전·운송, 농림어업 등)은 '직업 목록에서 선택'에서 검색 가능
   ============================================================ */
const CATEGORY_LIST = ['IT · 기술', '디자인 · 콘텐츠', '경영 · 마케팅', '금융 · 회계', '교육 · 사회', '보건 · 의료', '공학 · 제조', '공공 · 안전'];

// 대분류-중분류 코드 → 분야
const CATEGORY_BY_GROUP = {
  '1-3': 'IT · 기술', '8-4': 'IT · 기술',
  '4-1': '디자인 · 콘텐츠',
  '0-1': '경영 · 마케팅', '0-2': '경영 · 마케팅', '6-1': '경영 · 마케팅',
  '0-3': '금융 · 회계',
  '1-1': '교육 · 사회', '2-1': '교육 · 사회', '2-3': '교육 · 사회', '4-2': '교육 · 사회',
  '3-0': '보건 · 의료', '5-5': '보건 · 의료',
  '1-2': '공학 · 제조', '1-4': '공학 · 제조', '1-5': '공학 · 제조', '7-0': '공학 · 제조',
  '8-1': '공학 · 제조', '8-2': '공학 · 제조', '8-3': '공학 · 제조', '8-5': '공학 · 제조',
  '8-6': '공학 · 제조', '8-7': '공학 · 제조', '8-8': '공학 · 제조',
  '2-2': '공공 · 안전', '2-4': '공공 · 안전', '2-5': '공공 · 안전', '5-4': '공공 · 안전'
};

// 직업명 예외 (코드 기준 분야보다 우선)
const CATEGORY_BY_NAME = {};
[
  ['IT · 기술', ['정보통신관리자']],
  ['디자인 · 콘텐츠', ['예술·디자인·방송관리자', '공연·영화·음반기획자', '출판·자료편집사무원']],
  ['금융 · 회계', ['금융관리자', '보험관리자', '회계사', '세무사', '관세사', '감정평가사', '회계사무원', '경리사무원', '감사사무원']],
  ['교육 · 사회', ['유치원 원장 및 원감', '초등학교 교장 및 교감', '중고등학교 교장 및 교감', '대학교 총장 및 대학학장', '사회복지관리자', '취업알선원', '인적자원전문가', '인사·교육·훈련사무원']],
  ['보건 · 의료', ['보건·의료관리자', '의학연구원', '약학연구원', '축산학·수의학연구원', '생명과학시험원', '의학물리사']],
  ['공학 · 제조', ['건설·채굴관리자', '전기·가스·수도관리자', '제조·생산관리자']],
  ['공공 · 안전', ['고위공무원', '정부행정관리자', '경찰·소방·교도관리자', '경비·청소관리자', '정부·공공행정전문가', '행정사', '조세행정사무원', '관세행정사무원', '병무행정사무원', '공공행정사무원', '법원공무원']]
].forEach(([category, names]) => names.forEach(name => { CATEGORY_BY_NAME[normalizeName(name)] = category; }));

// 신직업 영역 → 분야
function categoryOfNewJobDomain(domain) {
  return String(domain || '').includes('인공지능') ? 'IT · 기술' : '공학 · 제조';
}

function categoryOfOccupation(item) {
  return CATEGORY_BY_NAME[normalizeName(item.name)] || CATEGORY_BY_GROUP[`${item.major}-${item.middle}`] || null;
}

function categoryOfNewJob(job) {
  return CATEGORY_BY_NAME[normalizeName(job.name)] || categoryOfNewJobDomain(job.domain);
}

// 분야별 직업 목록: 2025 신직업을 먼저, 이어서 직업 세세분류
function getCategoryItems(category) {
  const newJobs = jobData
    .filter(job => categoryOfNewJob(job) === category)
    .map(job => ({ name: job.name, group: job.group, isNew: true }));
  const occupations = occupationData.filter(item => categoryOfOccupation(item) === category);
  return [...newJobs, ...occupations];
}

let activeCategory = null; // null이면 전체 직업 목록

// 홈의 분야 버튼: 해당 분야 직업 목록 창 열기
async function openCategoryBrowser(category) {
  if (jobDataReady) await jobDataReady;
  const modal = document.getElementById('occupationModal');
  if (!modal) { navigateToStep('career'); return; }
  activeCategory = category;
  const items = getCategoryItems(category);
  const newCount = items.filter(item => item.isNew).length;
  document.getElementById('occupationModalKicker').textContent = 'CAREER FIELD';
  document.getElementById('occupationModalTitle').textContent = `${category} 직업`;
  document.getElementById('occupationModalDesc').textContent =
    `이 분야의 직업 ${items.length}개${newCount ? ` (2025 신직업 ${newCount}개 포함)` : ''}를 확인할 수 있어요.`;
  modal.hidden = false;
  const search = document.getElementById('occupationSearch');
  if (search) {
    search.value = '';
    renderOccupationBrowser('');
    setTimeout(() => search.focus(), 30);
  }
}

// 홈의 '직업 비교하기'에서 537개 직업 목록 창 열기
async function openOccupationBrowser() {
  if (jobDataReady) await jobDataReady;
  const modal = document.getElementById('occupationModal');
  if (!modal) { navigateToStep('career'); return; }
  activeCategory = null;
  document.getElementById('occupationModalKicker').textContent = 'CAREER DATABASE';
  document.getElementById('occupationModalTitle').textContent = '직업 목록에서 선택하기';
  document.getElementById('occupationModalDesc').textContent = '직업 세세분류 데이터 537개를 검색할 수 있어요.';
  modal.hidden = false;
  const search = document.getElementById('occupationSearch');
  if (search) {
    search.value = '';
    renderOccupationBrowser('');
    setTimeout(() => search.focus(), 30);
  }
}

function closeOccupationBrowser() {
  const modal = document.getElementById('occupationModal');
  if (modal) modal.hidden = true;
}

function renderOccupationBrowser(query) {
  const list = document.getElementById('occupationResults');
  const meta = document.getElementById('occupationResultsMeta');
  if (!list || !meta) return;
  const key = normalizeName(query);
  const pool = activeCategory ? getCategoryItems(activeCategory) : occupationData;
  const matches = pool.filter(item => !key || normalizeName(item.name).includes(key));
  meta.textContent = `검색 결과 ${matches.length}개 / 전체 ${pool.length}개`;
  list.textContent = '';
  if (!matches.length) {
    const empty = document.createElement('div');
    empty.className = 'occupation-empty';
    empty.textContent = '검색 결과가 없어요. 다른 직업명으로 검색해 주세요.';
    list.appendChild(empty);
    return;
  }
  matches.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'occupation-option';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const code = document.createElement('small');
    code.textContent = item.isNew
      ? `2025 신직업 · ${item.group}`
      : `분류 코드 ${item.major}-${item.middle}-${item.small}-${item.subclass}-${item.detail}`;
    if (item.isNew) button.classList.add('is-new');
    button.append(name, code);
    button.addEventListener('click', () => {
      document.getElementById('career').value = item.name;
      closeOccupationBrowser();
      navigateToStep('career');
    });
    list.appendChild(button);
  });
}

function openNewJobsWindow() {
  const popup = window.open('new-jobs.html', 'jinrofitNewJobs', 'width=1080,height=820,resizable=yes,scrollbars=yes');
  if (!popup) alert('새 창이 차단되었어요. 브라우저에서 팝업을 허용한 뒤 다시 눌러 주세요.');
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

function renderMissingResult(career, candidates, generalOccupation = null) {
  const suggest = document.getElementById('missingSuggest');
  suggest.textContent = '';

  const generalPanel = document.getElementById('generalOccupationResult');
  if (generalPanel) generalPanel.hidden = !generalOccupation;
  if (generalOccupation) {
    setText('missingTitle', '직업 분류 정보를 찾았어요');
    setText('missingText', `'${career}' 직업은 직업 세세분류 데이터에서 확인했어요. 다만 이 데이터에는 업무·필요 역량 설명이 없어 키워드 비교는 제공되지 않습니다.`);
    setText('generalOccupationNote', '첫 번째 파일에 수록된 직업명과 분류 코드를 표시합니다. 업무·역량의 실제 비교에는 별도의 직무정보가 필요합니다.');
    setText('occupationMajor', generalOccupation.major);
    setText('occupationMiddle', generalOccupation.middle);
    setText('occupationSmall', generalOccupation.small);
    setText('occupationSub', generalOccupation.subclass);
    setText('occupationDetail', generalOccupation.detail);
    setText('resultCaption', '직업 세세분류 데이터 기준');
  } else if (candidates.length) {
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
  const generalPanel = document.getElementById('generalOccupationResult');
  if (generalPanel) generalPanel.hidden = true;
  document.getElementById('matchedResult').hidden = true;
  document.getElementById('missingResult').hidden = false;
}

// 비교 결과 처리 함수
async function processComparison() {
  const career = document.getElementById('career').value.trim();
  const tasks = document.getElementById('tasks').value.trim();
  const skills = document.getElementById('skills').value.trim();

  if (!tasks) {
    showError('errorTasks');
    return;
  }
  if (!skills) {
    showError('errorSkills');
    return;
  }

  await jobDataReady;
  const { job, exact, candidates } = findJob(career);
  const generalOccupation = job ? null : findGeneralOccupation(career);
  const careerName = job ? job.name : (generalOccupation ? generalOccupation.name : career);

  document.getElementById('resultCareer').textContent = careerName;
  document.getElementById('outTasks').textContent = tasks;
  document.getElementById('outSkills').textContent = skills;
  setResultHeadVisible(true);

  if (job) renderMatchedResult(job, { career, tasks, skills, exact });
  else renderMissingResult(career, candidates, generalOccupation);

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
  const occupationSearch = document.getElementById('occupationSearch');
  if (occupationSearch) occupationSearch.addEventListener('input', () => renderOccupationBrowser(occupationSearch.value));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeOccupationBrowser();
  });
  updateStatusTime();
  setInterval(updateStatusTime, 30000);
});


// 브라우저에 비교 기록과 좋아요 직업 저장
function storageKeyForUser(key) {
  const user = window.jinrofitUser;
  return user && user.uid ? `${key}_${user.uid}` : key;
}

function readSavedList(key) {
  try {
    const scopedKey = storageKeyForUser(key);
    return JSON.parse(localStorage.getItem(scopedKey) || (window.jinrofitUser ? '[]' : '[]'));
  } catch (error) {
    return [];
  }
}

function writeSavedList(key, value) {
  try {
    localStorage.setItem(storageKeyForUser(key), JSON.stringify(value));
  } catch (error) {
    console.warn('브라우저 저장 공간을 사용할 수 없습니다.', error);
  }
}

function saveComparisonRecord(record) {
  const history = readSavedList('jinrofitComparisonHistory');
  history.unshift({ ...record, id: record.id || (Date.now() + '-' + Math.random().toString(16).slice(2)) });
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
      <div class="mypage-job-item history-job-item">
        <button class="mypage-job-open" type="button" onclick="openSavedJob(decodeURIComponent('${encodeURIComponent(item.career)}'))">
          <span><strong>${escapeHtml(item.career)}</strong><small>${formatSavedDate(item.date)} 비교함</small></span>
        </button>
        <button class="remove-history" type="button" onclick="removeHistory('${escapeHtml(String(item.id || item.date))}')" aria-label="비교 기록 삭제">삭제</button>
      </div>`).join('')
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

function removeHistory(recordId) {
  const history = readSavedList('jinrofitComparisonHistory');
  const updated = history.filter(item => String(item.id || item.date) !== String(recordId));
  writeSavedList('jinrofitComparisonHistory', updated);
  renderMyPage();
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
