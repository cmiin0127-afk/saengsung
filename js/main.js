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
  if (stepId === 'result') updateFavoriteButton();

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

// 비교 결과 처리 함수
function processComparison() {
  const career = document.getElementById('career').value.trim();
  const tasks = document.getElementById('tasks').value.trim();
  const skills = document.getElementById('skills').value.trim();

  if (!skills) {
    showError('errorSkills');
    return;
  }

  document.getElementById('resultCareer').textContent = career;
  document.getElementById('outTasks').textContent = tasks;
  document.getElementById('outSkills').textContent = skills;

  const isSample = career.replace(/\s/g, '') === '마케팅기획자';
  document.getElementById('matchedResult').hidden = !isSample;
  document.getElementById('missingResult').hidden = isSample;

  if (isSample) {
    document.getElementById('resultCaption').textContent = '';
  } else {
    document.getElementById('resultCaption').textContent = '현재 해당 직업의 예시 데이터가 마련되어 있지 않습니다.';
  }

  isResultAvailable = true;
  saveComparisonRecord({ career, tasks, skills, date: new Date().toISOString() });
  navigateToStep('result');
}

// 실시간 상태 표시줄 시간 변경
function updateStatusTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('statusTime').textContent = `${hours}:${minutes}`;
}

document.addEventListener("DOMContentLoaded", () => {
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
