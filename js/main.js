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
    document.getElementById('resultCaption').textContent = '내가 입력한 내용과 마케팅 기획자 직업 표준 DB를 비교했습니다.';
  } else {
    document.getElementById('resultCaption').textContent = '현재 해당 직업의 예시 데이터가 마련되어 있지 않습니다.';
  }

  isResultAvailable = true;
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
