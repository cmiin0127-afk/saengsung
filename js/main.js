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
  fallback: 'data/data-fallback.js',
  report: 'data/new_jobs_report.json',          // 2025 신직업 연구(2차 연도) 부록 1 직업별 해설
  reportFallback: 'data/new-jobs-report.js'
};

let jobData = [];        // 신직업 41개 목록
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

// 한국고용직업분류(KNOW) 대분류-중분류 코드별 직무 및 역량 표준 설명
const KNOW_GROUP_DESC = {
  '0-1': { label: '고위임원 및 기업고위직', task: '조직의 경영 목표와 전략을 수립하고 부서 간 주요 정책과 사업 운영을 총괄·조정합니다.', skill: '경영 전략 수립, 의사결정, 리더십, 조직 관리 역량이 요구됩니다.' },
  '0-2': { label: '행정·경영·금융·보험 관리자', task: '행정, 인사, 기획, 총무 등 조직 운영과 지원 업무를 계획하고 실무 과정을 관리·감독합니다.', skill: '기획력, 문서 작성, 일정 및 자원 관리, 협업 소통 역량이 요구됩니다.' },
  '0-3': { label: '금융·보험 관리자', task: '금융 상품 운용, 자금 조달, 리스크 관리 및 재무 관련 부서 업무를 기획·감독합니다.', skill: '재무 분석, 리스크 관리, 금융 규정 이해, 수치 데이터 분석 역량이 요구됩니다.' },
  '1-1': { label: '인문·사회과학 연구직', task: '인문, 사회, 교육, 경제 등 분야의 자료를 조사·분석하고 연구 보고서와 정책 대안을 도출합니다.', skill: '자료 조사, 통계 및 문헌 분석, 논리적 글쓰기, 연구 설계 역량이 요구됩니다.' },
  '1-2': { label: '자연·생명과학 연구직', task: '자연과학 및 생명과학 분야의 원리를 탐구하고 실험, 데이터 측정, 연구 개발을 수행합니다.', skill: '실험 설계, 과학적 분석력, 연구 장비 활용, 데이터 해석 역량이 요구됩니다.' },
  '1-3': { label: '정보통신 연구개발직 및 공학기술직', task: '소프트웨어, 시스템, 네트워크, 데이터 등 IT 기술을 설계·개발하고 테스트 및 유지보수를 수행합니다.', skill: '프로그래밍, 시스템 설계, 문제 해결, 최신 디지털 기술 활용 역량이 요구됩니다.' },
  '1-4': { label: '건설·채굴 연구개발직 및 공학기술직', task: '건축물, 토목 구조물, 플랜트 등의 설계, 시공 관리, 안전 점검 및 공정 개선을 수행합니다.', skill: '도면 설계 및 해석, 공정 관리, 안전 규정 준수, 현장 문제 해결 역량이 요구됩니다.' },
  '1-5': { label: '제조 연구개발직 및 공학기술직', task: '기계, 전기, 전자, 화학 등 산업 제품의 기술을 연구·개발하고 생산 공정을 설계·개선합니다.', skill: '공학 설계, 품질 및 공정 분석, 기술 문서 작성, 협업 역량이 요구됩니다.' },
  '2-1': { label: '교육 전문가', task: '학습자의 수준에 맞춰 교육 과정을 설계하고 강의, 학습 지도, 평가 및 상담을 수행합니다.', skill: '교수법, 의사소통, 학습자 이해, 교육 콘텐츠 기획 역량이 요구됩니다.' },
  '2-2': { label: '법률 전문가', task: '법령 해석, 소송 수행, 법률 자문, 계약 검토 등 권리 보호와 분쟁 해결 업무를 담당합니다.', skill: '법률 지식, 논리적 사고, 문서 작성, 협상 및 분석 역량이 요구됩니다.' },
  '2-3': { label: '사회복지·종교직', task: '취약계층 및 지역사회의 복지 수요를 파악해 상담, 지원 프로그램 운영, 자원 연계를 수행합니다.', skill: '공감 및 상담 능력, 사례 관리, 유관 기관 협력, 문제 해결 역량이 요구됩니다.' },
  '2-4': { label: '경찰·소방·교도직', task: '공공의 안전과 질서를 유지하고 범죄 예방, 화재 진압, 구조·구급 및 교정 업무를 수행합니다.', skill: '위기 대응, 상황 판단력, 체력 및 안전 수칙 준수, 책임감이 요구됩니다.' },
  '2-5': { label: '군인', task: '국가 방위와 안보를 위해 작전 수행, 부대 지휘·관리, 장비 운용 및 교육 훈련을 담당합니다.', skill: '지휘 통솔, 전략적 판단, 팀워크, 규율 준수 및 위기 대처 역량이 요구됩니다.' },
  '3-0': { label: '보건·의료직', task: '환자의 건강 상태를 진단·치료·간호하거나 재활, 약제, 의료 검사 등 보건 의료 서비스를 제공합니다.', skill: '전문 의학·보건 지식, 정밀한 처치 능력, 환자 소통, 윤리 의식이 요구됩니다.' },
  '4-1': { label: '문화·예술·디자인·방송직', task: '시각·제품·콘텐츠 디자인, 창작, 연출, 방송 제작 등을 통해 창의적 결과물을 기획·구현합니다.', skill: '창의적 기획력, 디자인 및 제작 툴 활용, 트렌드 분석, 표현 역량이 요구됩니다.' },
  '4-2': { label: '스포츠·레크리에이션직', task: '체육 활동 지도, 경기 수행, 훈련 프로그램 설계 및 여가·레저 활동 운영을 담당합니다.', skill: '전문 운동 기능, 지도력, 안전 관리, 체력 및 자기 관리 역량이 요구됩니다.' },
  '5-4': { label: '경호·경비직', task: '시설물 보안 유지, 출입 통제, 순찰, 신변 보호 등 안전사고와 범죄 예방 업무를 수행합니다.', skill: '주의력, 보안 장비 운용, 돌발 상황 대처, 성실성과 책임감이 요구됩니다.' },
  '5-5': { label: '돌봄·보건·개인생활 서비스직', task: '아동, 노인, 환자 등의 일상생활과 건강 유지를 지원하고 맞춤형 돌봄·생활 서비스를 제공합니다.', skill: '배려심, 의사소통, 위생 및 안전 관리, 세심한 관찰 역량이 요구됩니다.' },
  '6-1': { label: '영업·판매직', task: '고객과 시장을 분석해 제품·서비스를 제안하고 계약 체결, 매출 관리, 고객 관계 유지를 수행합니다.', skill: '설득 및 협상력, 시장 분석, 고객 응대, 목표 달성 추진력이 요구됩니다.' },
  '7-0': { label: '운전·운송직', task: '여객 또는 화물을 안전하고 정확하게 목적지까지 수송하기 위해 차량·운송 장비를 운행·점검합니다.', skill: '안전 운행 능력, 경로 파악, 장비 점검, 시간 준수 및 집중력이 요구됩니다.' },
  '8-1': { label: '식품가공·농림어업 생산직', task: '농축수산물의 생산과 식품 원료의 가공·품질 검사·포장 공정을 운영하고 관리합니다.', skill: '위생 및 품질 관리, 공정 설비 운용, 원료 특성 이해 역량이 요구됩니다.' },
  '8-2': { label: '섬유·의복 생산직', task: '원단 가공, 패턴 제작, 재단·봉제 등 섬유 및 의복 제품의 제조 공정을 수행합니다.', skill: '제작 기술, 소재 이해, 정밀 작업 능력, 품질 검수 역량이 요구됩니다.' },
  '8-3': { label: '화학·환경 생산직', task: '화학 제품 제조 설비를 운전하거나 수질·대기·폐기물 등 환경 오염 방지 시설을 운영·관리합니다.', skill: '안전 수칙 준수, 설비 제어, 환경·화학 공정 이해, 측정 분석 역량이 요구됩니다.' },
  '8-4': { label: '정보통신·전기·전자 설치·정비·생산직', task: '전기·전자 기기 및 통신 설비를 제작·조립하고 현장에 설치·점검·보수하는 업무를 수행합니다.', skill: '회로 및 장비 이해, 계측기 활용, 고장 진단 및 수리, 안전 관리 역량이 요구됩니다.' },
  '8-5': { label: '기계 설치·정비·생산직', task: '산업용 기계 및 장비를 제작·조립·설치하고 정기 점검과 정비를 통해 가동 상태를 유지합니다.', skill: '기계 구조 이해, 도면 판독, 정밀 가공 및 정비 기술, 안전 관리 역량이 요구됩니다.' },
  '8-6': { label: '금속·재료 설치·정비·생산직', task: '금속 및 비금속 재료를 가공·용접·성형하여 구조물과 부품을 생산·정비합니다.', skill: '재료 특성 이해, 가공·용접 장비 운용, 정밀 측정, 현장 안전 역량이 요구됩니다.' },
  '8-7': { label: '건설·채굴직', task: '건물과 토목 현장에서 기초 공사, 골조, 마감, 설비 시공 등 건설 작업을 수행합니다.', skill: '시공 기술, 설계 도면 이해, 현장 협업, 산업 안전 수칙 준수 역량이 요구됩니다.' },
  '5-1': { label: '이용·미용·예식·장례 서비스직', task: '고객의 외모·위생 관리, 예식 및 장례 진행 등 개인 맞춤형 생활 서비스를 제공합니다.', skill: '섬세한 손기술, 고객 응대 및 상담, 위생·안전 관리, 심미적 감각이 요구됩니다.' },
  '5-2': { label: '여행·숙박·오락 서비스직', task: '여행 상품 기획, 안내, 객실·숙박·오락 시설 운영 등 이용객이 편안하고 안전하게 즐기도록 서비스를 제공합니다.', skill: '고객 응대, 외국어 및 정보 안내, 안전 관리, 상황 대처 역량이 요구됩니다.' },
  '5-3': { label: '음식 서비스직', task: '음식·음료를 조리하거나 주문·서빙·배달하며 주방과 홀의 위생과 운영을 관리합니다.', skill: '조리 기술, 식품 위생 관리, 협업, 시간 관리 및 고객 응대 역량이 요구됩니다.' },
  '5-6': { label: '청소·방역·생활지원 서비스직', task: '시설과 주거 공간의 청소, 방역, 세탁, 점검 및 관리를 통해 쾌적하고 안전한 환경을 유지합니다.', skill: '성실성, 위생·안전 수칙 준수, 장비 및 도구 활용, 꼼꼼한 점검 역량이 요구됩니다.' },
  '6-2': { label: '운전·운항·운송·관제직', task: '항공기, 선박, 열차, 차량 및 중장비를 운행하거나 교통을 관제해 사람과 화물을 안전하게 수송합니다.', skill: '안전 운행 능력, 상황 판단력, 장비 점검, 규정 준수 및 집중력이 요구됩니다.' },
  '9-0': { label: '농림어업직', task: '작물 재배, 가축 사육, 산림 및 수산 자원 관리 등 농림어업 생산 활동을 수행합니다.', skill: '생육·사육 환경 이해, 기계 및 도구 활용, 체력, 계절·기상 변화 대응 역량이 요구됩니다.' },
  '8-8': { label: '제조 단순직 및 기타 생산직', task: '생산 라인에서 부품 조립, 제품 선별, 포장, 적재 등 제조 지원 및 품질 확인 업무를 수행합니다.', skill: '작업 표준 준수, 집중력, 협업 태도, 현장 안전 관리 역량이 요구됩니다.' }
};

// 일반 직업(세세분류)의 '주요 업무' 설명: 첨부한 JSON의 직무설명을 우선 사용
function buildGeneralJobOverview(item) {
  if (item.duty) return item.duty;
  const groupKey = `${item.major}-${item.middle}`;
  const groupInfo = KNOW_GROUP_DESC[groupKey];
  const category = categoryOfOccupation(item);
  const fieldPrefix = category ? `[${category} 분야] ` : '';
  if (groupInfo) {
    return `${fieldPrefix}'${item.name}'(${groupInfo.label} 직군)은(는) ${groupInfo.task}`;
  }
  return `${fieldPrefix}'${item.name}'은(는) 해당 전문 분야의 실무 절차를 계획·수행하고 결과물의 품질과 안전을 관리하는 직업입니다.`;
}

// 일반 직업(세세분류)의 '필요 역량' 설명: 직군(KNOW 대·중분류)별 표준 역량 설명
function buildGeneralJobSkill(item) {
  const groupInfo = KNOW_GROUP_DESC[`${item.major}-${item.middle}`];
  const base = groupInfo ? groupInfo.skill : '관련 직무 지식, 문제 해결 능력, 협업 및 의사소통 역량이 요구됩니다.';
  return `'${item.name}'${josa(item.name, '은', '는')} ${groupInfo ? `${groupInfo.label} 직군으로, ` : ''}${base}`;
}

async function loadJobData() {
  let rawJobs = [];
  let rawStudy = [];
  let rawOccupations = [];
  try {
    // 단일 파일 버전: 데이터가 페이지 안에 내장되어 있으면 그대로 사용
    if (window.JINROFIT_FALLBACK) throw new Error('embedded data');
    // 파일을 더블클릭해서 열면(file://) 브라우저가 fetch를 막으므로 대체 파일 사용
    if (location.protocol === 'file:') throw new Error('file protocol');
    [rawJobs, rawStudy, rawOccupations] = await Promise.all([
      fetchJson(DATA_PATHS.jobs),
      fetchJson(DATA_PATHS.study),
      fetchJson(DATA_PATHS.occupations)
    ]);
  } catch (error) {
    try {
      if (!window.JINROFIT_FALLBACK) await loadScript(DATA_PATHS.fallback);
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
    variants: nameVariants(item['직업']),
    isNewJob: true
  }));

  occupationData = (rawOccupations || []).map(item => ({
    name: item['KNOW직업명'],
    major: item['KNOW직업대분류'],
    middle: item['KNOW직업중분류'],
    small: item['KNOW직업소분류'],
    subclass: item['KNOW직업세분류'],
    detail: item['KNOW직업세세분류'],
    duty: String(item['직무설명'] || '').trim()
  })).filter(item => item.name).map(item => {
    const groupInfo = KNOW_GROUP_DESC[`${item.major}-${item.middle}`];
    const category = categoryOfOccupation(item);
    return {
      ...item,
      id: `know-${item.major}-${item.middle}-${item.small}-${item.subclass}-${item.detail}`,
      domain: category || '일반 직업 (KNOW 세세분류)',
      group: groupInfo ? groupInfo.label : `분류코드 ${item.major}-${item.middle}-${item.small}`,
      codePath: `${item.major}-${item.middle}-${item.small}-${item.subclass}-${item.detail}`,
      overview: buildGeneralJobOverview(item),
      skillOverview: buildGeneralJobSkill(item),
      variants: nameVariants(item.name),
      isNewJob: false
    };
  });

  const studyDomains = studyInfo && studyInfo.final_selected_jobs_by_domain
    ? Object.keys(studyInfo.final_selected_jobs_by_domain) : [];
  const jobDomains = [...new Set(jobData.map(job => job.domain))];
  domainOrder = [...studyDomains.filter(d => jobDomains.includes(d)), ...jobDomains.filter(d => !studyDomains.includes(d))];
}

// 입력한 직업명과 일치하는 직업 찾기 (신직업 41개 + 직업 세세분류 537개 통합 검색)
function findJob(input) {
  const inputVariants = nameVariants(input).filter(v => v.length >= 2);
  const allJobs = [...jobData, ...occupationData];
  if (!inputVariants.length || !allJobs.length) return { job: null, exact: false, candidates: [] };

  // 1. 신직업 41개에서 완전 일치 우선 검색
  const exactNew = jobData.find(job => job.variants.some(v => inputVariants.includes(v)));
  if (exactNew) return { job: exactNew, exact: true, candidates: [] };

  // 2. 직업 세세분류 537개에서 완전 일치 검색
  const exactGeneral = occupationData.find(job => job.variants.some(v => inputVariants.includes(v)));
  if (exactGeneral) return { job: exactGeneral, exact: true, candidates: [] };

  // 3. 부분 일치 후보 검색 (신직업 + 일반직업 통합)
  const candidates = allJobs.filter(job =>
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

function setOccupationFoot(text) {
  const foot = document.getElementById('occupationModalFootText');
  if (foot) foot.textContent = text;
}
const NEW_JOBS_KEY = '__new_jobs__';

function getActivePool() {
  if (activeCategory === NEW_JOBS_KEY) return jobData.map(job => ({ name: job.name, group: `${job.domain} · ${job.group}`, isNew: true }));
  return activeCategory ? getCategoryItems(activeCategory) : occupationData;
}

// 홈의 분야 버튼: 해당 분야 직업 목록 창 열기
async function openCategoryBrowser(category) {
  if (jobDataReady) await jobDataReady;
  const modal = document.getElementById('occupationModal');
  if (!modal) { navigateToStep('career'); return; }
  activeCategory = category;
  const items = getCategoryItems(category);
  const newCount = items.filter(item => item.isNew).length;
  setOccupationFoot('신직업은 눌러서 관련 내용을 볼 수 있고, 일반 직업은 선택하면 비교 입력 화면으로 이동합니다.');
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
  setOccupationFoot('직업을 선택하면 비교 입력 화면으로 이동합니다.');
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
  setOccupationView('list');
  const modal = document.getElementById('occupationModal');
  if (modal) modal.hidden = true;
}

function renderOccupationBrowser(query) {
  setOccupationView('list');
  const list = document.getElementById('occupationResults');
  const meta = document.getElementById('occupationResultsMeta');
  if (!list || !meta) return;
  const key = normalizeName(query);
  const pool = getActivePool();
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
      if (item.isNew) { openNewJobDetail(item.name); return; }
      document.getElementById('career').value = item.name;
      closeOccupationBrowser();
      navigateToStep('career');
    });
    list.appendChild(button);
  });
}


/* ============================================================
   신직업 상세 보기 (2025 신직업 연구 2차 연도 보고서 부록 1)
   - data/new_jobs_report.json : 직업별 해설 (직업 생성 배경, 수행 직무, 해외·국내 현황, 활성화 제언)
   - file:// 로 열면 fetch가 막히므로 data/new-jobs-report.js 로 대체
   ============================================================ */
let reportData = null;

async function loadReportData() {
  if (reportData) return reportData;
  try {
    if (window.JINROFIT_REPORT) { reportData = window.JINROFIT_REPORT; return reportData; }
    if (location.protocol === 'file:') throw new Error('file protocol');
    reportData = await fetchJson(DATA_PATHS.report);
  } catch (error) {
    try {
      await loadScript(DATA_PATHS.reportFallback);
      reportData = window.JINROFIT_REPORT || null;
    } catch (fallbackError) {
      console.warn('신직업 해설 데이터를 불러오지 못했습니다.', error);
      reportData = null;
    }
  }
  return reportData;
}

// 직업 목록 화면 / 신직업 상세 화면 전환
function setOccupationView(view) {
  const panel = document.querySelector('#occupationModal .occupation-panel');
  if (panel) panel.classList.toggle('is-detail', view === 'detail');
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function renderReportBlocks(container, blocks) {
  let list = null;
  blocks.forEach(block => {
    if (block.k === 'b') {
      if (!list) { list = makeEl('ul', 'jd-list'); container.appendChild(list); }
      list.appendChild(makeEl('li', '', block.t));
      return;
    }
    list = null;
    container.appendChild(makeEl('p', block.k === 'h' ? 'jd-h' : 'jd-p', block.t));
  });
}

async function openNewJobDetail(name) {
  const box = document.getElementById('jobDetail');
  if (!box) return;
  const job = jobData.find(item => item.name === name);
  setOccupationView('detail');
  box.textContent = '';
  const back = makeEl('button', 'jd-back', '← 목록으로');
  back.type = 'button';
  back.addEventListener('click', () => setOccupationView('list'));
  box.appendChild(back);
  if (job) {
    box.appendChild(makeEl('div', 'jd-kicker', `${job.domain} · ${job.group}`));
    box.appendChild(makeEl('h3', 'jd-name', job.name));
    const overview = makeEl('div', 'jd-overview');
    overview.append(makeEl('strong', '', '직무 개요'), makeEl('p', '', job.overview || ''));
    box.appendChild(overview);
  } else {
    box.appendChild(makeEl('h3', 'jd-name', name));
  }
  const body = makeEl('div', 'jd-body');
  body.appendChild(makeEl('p', 'jd-loading', '보고서 내용을 불러오는 중이에요…'));
  box.appendChild(body);
  box.scrollTop = 0;

  const report = await loadReportData();
  const entry = report && report.jobs ? report.jobs[name] : null;
  body.textContent = '';
  if (!entry) {
    body.appendChild(makeEl('p', 'jd-loading', '상세 해설 데이터를 불러오지 못했어요. 로컬 서버(예: python -m http.server)로 열거나 data 폴더 파일을 확인해 주세요.'));
  } else {
    entry.sections.forEach((section, index) => {
      const details = makeEl('details', 'jd-sec');
      if (section.title === '수행 직무' || (index === 0 && !entry.sections.some(s => s.title === '수행 직무'))) details.open = true;
      details.appendChild(makeEl('summary', '', section.title));
      const content = makeEl('div', 'jd-sec-body');
      renderReportBlocks(content, section.blocks);
      details.appendChild(content);
      body.appendChild(details);
    });
    const meta = report.meta || {};
    const pages = entry.pages ? ` pp.${entry.pages[0]}–${entry.pages[1]}` : '';
    body.appendChild(makeEl('p', 'jd-source', `출처: ${meta.publisher || ''} 「${meta.title || ''}」 ${meta.section || ''},${pages}. PDF를 텍스트로 변환한 원문을 문단 단위로 정리한 것이라 표·그림은 일부 생략되었어요.`));
  }
  const actions = makeEl('div', 'jd-actions');
  const go = makeEl('button', 'primary', '이 직업으로 비교하기');
  go.type = 'button';
  go.addEventListener('click', () => {
    document.getElementById('career').value = name;
    closeOccupationBrowser();
    navigateToStep('career');
  });
  actions.appendChild(go);
  box.appendChild(actions);
}

// 홈의 '요즘 떠오르는 신직업': 2025 신직업 41개 목록 창 (별도 new-jobs.html 없이 동작)
async function openNewJobsBrowser() {
  if (jobDataReady) await jobDataReady;
  const modal = document.getElementById('occupationModal');
  if (!modal) { navigateToStep('career'); return; }
  activeCategory = NEW_JOBS_KEY;
  setOccupationFoot('직업을 누르면 보고서의 관련 내용을 볼 수 있어요.');
  document.getElementById('occupationModalKicker').textContent = 'NEW JOBS 2025';
  document.getElementById('occupationModalTitle').textContent = '요즘 떠오르는 신직업';
  document.getElementById('occupationModalDesc').textContent = `2025 신성장 산업 신직업 ${jobData.length}개를 확인할 수 있어요.`;
  modal.hidden = false;
  const search = document.getElementById('occupationSearch');
  if (search) { search.value = ''; renderOccupationBrowser(''); setTimeout(() => search.focus(), 30); }
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

function sourceLabel(job) {
  if (job && !job.isNewJob) {
    return `출처: 한국고용정보원 한국고용직업분류(KNOW) 세세분류 (${job.codePath})`;
  }
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

/* ===== 희망 직업 입력: 신직업 + 직업 세세분류 통합 자동완성 ===== */
let suggestOpen = false;
let suggestIndex = -1;

function getSuggestBox() { return document.getElementById('jobSuggest'); }

function suggestOptions() { return [...getSuggestBox().querySelectorAll('.job-option')]; }

function appendSuggestGroup(box, headingText, list) {
  if (!list.length) return;
  const heading = document.createElement('div');
  heading.className = 'job-suggest-domain';
  heading.textContent = headingText;
  box.appendChild(heading);

  list.forEach(job => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'job-option';
    option.setAttribute('role', 'option');
    const title = document.createElement('strong');
    title.textContent = job.name;
    const sub = document.createElement('small');
    sub.textContent = job.isNewJob ? `2025 신직업 · ${job.group}` : `${job.domain} · ${job.group}`;
    option.append(title, sub);
    option.addEventListener('click', () => selectJob(job.name));
    box.appendChild(option);
  });
}

function renderJobSuggest(query) {
  const box = getSuggestBox();
  if (!box) return;
  const keys = nameVariants(query);

  const filterFn = job => {
    if (!keys.length) return true;
    const haystacks = [...job.variants, normalizeName(job.group), normalizeName(job.domain)];
    return keys.some(k => haystacks.some(h => h.includes(k)));
  };

  const matchedNew = jobData.filter(filterFn);
  const matchedGeneral = keys.length ? occupationData.filter(filterFn).slice(0, 30) : occupationData.slice(0, 15);

  box.innerHTML = '';
  suggestIndex = -1;

  if (!jobData.length && !occupationData.length) {
    box.innerHTML = '<div class="job-suggest-empty">직업 데이터를 불러오지 못했어요.</div>';
    return;
  }
  if (!matchedNew.length && !matchedGeneral.length) {
    box.innerHTML = '<div class="job-suggest-empty">일치하는 직업이 없어요.</div>';
    return;
  }

  appendSuggestGroup(box, `2025 신직업 · ${matchedNew.length}`, matchedNew);
  appendSuggestGroup(box, `직업 세세분류 · ${matchedGeneral.length}${keys.length ? '' : ' (일부 표시)'}`, matchedGeneral);
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
  const taskText = job.overview;                         // 주요 업무 설명 (일반 직업: 직무설명 JSON)
  const skillText = job.skillOverview || job.overview;   // 필요 역량 설명 (일반 직업: 직군별 표준 역량)
  const taskHits = findOverlap(ctx.tasks, taskText);
  const skillHits = findOverlap(ctx.skills, `${taskText} ${skillText}`);
  const source = sourceLabel(job);

  setText('resultCaption', job.isNewJob
    ? `2025 신직업 · ${job.domain} · ${job.group}`
    : `직업 세세분류 · ${job.domain} · ${job.group}`);

  // 1. 주요 업무
  if (taskHits.length >= 2) setStatus('cardTaskStatus', 'match', '일치');
  else if (taskHits.length === 1) setStatus('cardTaskStatus', 'check', '추가 확인 필요');
  else setStatus('cardTaskStatus', 'diff', '차이');
  setText('cardTaskUser', ctx.tasks);
  setText('cardTaskActual', taskText);
  setText('cardTaskKeywords', keywordText(taskHits));

  // 2. 필요 역량
  if (skillHits.length >= 1) setStatus('cardSkillStatus', 'match', '일치');
  else setStatus('cardSkillStatus', 'check', '추가 확인 필요');
  setText('cardSkillUser', ctx.skills);
  setText('cardSkillActual', skillText);
  setText('cardSkillKeywords', keywordText(skillHits));

  // 3. 직업 분류
  setText('cardClassTitle', `직업 분류 · ${job.domain}`);
  if (ctx.exact) setStatus('cardClassStatus', 'match', '일치');
  else setStatus('cardClassStatus', 'check', '추가 확인 필요');
  setText('cardClassUser', ctx.career);
  setText('cardClassActual', job.isNewJob
    ? `${job.domain} > ${job.group} > ${job.name}`
    : `${job.domain} > ${job.group} > ${job.name} (코드 ${job.codePath})`);

  document.querySelectorAll('#matchedResult .source').forEach(elem => { elem.textContent = source; });

  // 리포트
  let verdict;
  if (taskHits.length >= 2) verdict = '예상한 업무가 실제 직무와 꽤 맞닿아 있어요.';
  else if (taskHits.length === 1) verdict = '예상한 업무가 일부만 겹쳐요. 직무개요를 읽으며 빠진 업무를 찾아보세요.';
  else verdict = '예상한 업무와 직무개요가 거의 겹치지 않아요. 어떤 일을 하는 직업인지 직무개요를 다시 확인해 보세요.';

  const jobKindText = job.isNewJob
    ? `${job.domain}의 '${job.group}' 직군에 속하는 2025 신직업이에요.`
    : `${job.domain} 분야('${job.group}', 분류코드 ${job.codePath})에 속하는 직업이에요.`;

  setRichText('resultReport', [
    { strong: job.name },
    `${josa(job.name, '은', '는')} ${jobKindText} 입력하신 업무에서 `,
    { strong: `${taskHits.length}개 키워드` },
    `가 직무개요와 겹쳐요. ${verdict}`
  ]);

  const trends = job.isNewJob ? ((studyInfo && studyInfo.key_characteristics_of_new_jobs) || []) : [];
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
  const allJobs = [...jobData, ...occupationData];
  let related = allJobs.filter(item => item.group === job.group && item.id !== job.id).slice(0, 6);
  let relatedLabel = '같은 직군의 다른 직업';
  if (!related.length) {
    related = allJobs.filter(item => item.domain === job.domain && item.id !== job.id).slice(0, 6);
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

  const generalPanel = document.getElementById('generalOccupationResult');
  if (generalPanel) generalPanel.hidden = true;

  if (candidates.length) {
    setText('missingTitle', '혹시 이런 직업을 찾으셨나요?');
    setText('missingText', `'${career}'${josa(career, '과', '와')} 비슷한 직업이 여러 개 있어요. 하나를 고르면 입력하신 내용으로 바로 비교해요.`);
    candidates.slice(0, 10).forEach(job => suggest.appendChild(makeChip(job.name, () => compareWith(job.name))));
    setText('resultCaption', '');
  } else {
    const totalCount = jobData.length + occupationData.length;
    setText('missingTitle', '실제 직업정보를 찾을 수 없어요');
    setText('missingText', totalCount
      ? `입력하신 직업은 등록된 직업 목록(${totalCount}개)에 없어요. 아래 직업 중에서 골라 비교해 보세요.`
      : '직업 데이터를 불러오지 못했어요. 파일 위치(data 폴더)를 확인해 주세요.');
    domainOrder.forEach(domain => {
      const first = jobData.find(job => job.domain === domain);
      if (first) suggest.appendChild(makeChip(first.name, () => compareWith(first.name)));
    });
    setText('resultCaption', '현재 해당 직업의 데이터가 마련되어 있지 않습니다.');
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
    return JSON.parse(localStorage.getItem(scopedKey) || '[]');
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
