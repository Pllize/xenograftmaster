// Data Management view - study list with filters
const StudyListView = (() => {
  let studies = [];
  let filters = {};

  async function render() {
    App.setActiveNav('/data');
    App.renderContent(`
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h4 class="fw-bold mb-0">데이터 관리</h4>
        <button class="btn btn-primary fw-bold" onclick="StudyListView.openNewStudy()">+ 새 시험 등록</button>
      </div>

      <div class="card p-3 mb-3">
        <div class="row g-2">
          <div class="col-md-2">
            <select class="form-select form-select-sm" id="f_classification" onchange="StudyListView.applyFilter()">
              <option value="">분류 전체</option>
              <option value="CDX">CDX</option>
              <option value="PDX">PDX</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div class="col-md-2">
            <select class="form-select form-select-sm" id="f_dataSource" onchange="StudyListView.applyFilter()">
              <option value="">출처 전체</option>
              <option value="SB">SB</option>
              <option value="경쟁사">경쟁사</option>
            </select>
          </div>
          <div class="col-md-1">
            <input class="form-control form-control-sm" id="f_year" placeholder="연도" oninput="StudyListView.applyFilter()">
          </div>
          <div class="col-md-3">
            <input class="form-control form-control-sm" id="f_modelName" placeholder="모델명 검색" oninput="StudyListView.applyFilter()">
          </div>
          <div class="col-md-2">
            <input class="form-control form-control-sm" id="f_cro" placeholder="CRO 검색" oninput="StudyListView.applyFilter()">
          </div>
          <div class="col-md-2">
            <input class="form-control form-control-sm" id="f_substance" placeholder="투여물질 검색" oninput="StudyListView.applyFilter()">
          </div>
        </div>
      </div>

      <div id="studyGrid" class="row g-3"></div>
    `);

    await loadStudies();
  }

  async function loadStudies() {
    try {
      studies = await App.withLoading(() => api.getStudies(filters), '시험 목록 로딩 중...');
    } catch (e) {
      if (e.message.includes('URL이 설정되지 않았습니다')) {
        studies = JSON.parse(localStorage.getItem('xm_local_studies') || '[]');
        const grid = document.getElementById('studyGrid');
        if (grid) grid.innerHTML = `<div class="col-12"><div class="alert alert-warning">Google Sheets 연결이 설정되지 않았습니다. <a href="#/admin">관리 메뉴</a>에서 URL을 설정하세요.</div></div>` + renderCards();
        return;
      }
      App.showToast('시험 목록 로딩 실패: ' + e.message, 'error');
      studies = [];
    }
    const grid = document.getElementById('studyGrid');
    if (grid) grid.innerHTML = renderCards();
  }

  function renderCards() {
    if (!studies.length) return '<div class="col-12"><p class="text-muted text-center mt-4">등록된 시험이 없습니다.</p></div>';
    return studies.map(s => {
      const isSB = s.dataSource === 'SB' || s.dataSource === '자체';
      const badge = isSB
        ? `<span class="badge bg-primary">🏢 SB</span>`
        : `<span class="badge bg-warning text-dark">🏷 경쟁사</span> ${s.competitorDrug ? `<span class="badge bg-secondary">${s.competitorDrug}</span>` : ''}`;
      return `
        <div class="col-md-4 col-lg-3">
          <div class="card h-100 study-card" style="cursor:pointer" onclick="StudyListView.openStudy('${s.studyId}')">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <h6 class="fw-bold mb-0">${s.studyNumber || '(번호 없음)'}</h6>
                <div>${badge}</div>
              </div>
              <p class="mb-1 small text-secondary">모델: <strong>${s.modelName || '-'}</strong></p>
              ${s.projectName ? `<p class="mb-1 small text-secondary">과제: ${s.projectName}</p>` : ''}
              <p class="mb-1 small text-secondary">분류: ${s.classification || '-'} | 연도: ${s.year || '-'}</p>
              <p class="mb-1 small text-secondary">CRO: ${s.cro || '-'}</p>
              ${!isSB && s.competitorSource ? `<p class="mb-1 small text-muted">출처: ${s.competitorSource}</p>` : ''}
              <p class="mb-0 small text-muted">수정: ${App.formatDate(s.updatedAt)}</p>
            </div>
            <div class="card-footer bg-transparent d-flex gap-1 justify-content-end">
              <button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); StudyListView.openStudy('${s.studyId}')">열기</button>
              <button class="btn btn-sm btn-outline-secondary" onclick="event.stopPropagation(); StudyListView.editStudy('${s.studyId}')">수정</button>
              <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); StudyListView.deleteStudy('${s.studyId}', '${(s.studyNumber || '').replace(/'/g, '')}')">삭제</button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function applyFilter() {
    const substanceQ = document.getElementById('f_substance')?.value?.trim().toLowerCase() || '';
    filters = {
      classification: document.getElementById('f_classification')?.value || '',
      dataSource: document.getElementById('f_dataSource')?.value || '',
      year: document.getElementById('f_year')?.value || '',
      modelName: document.getElementById('f_modelName')?.value || '',
      cro: document.getElementById('f_cro')?.value || ''
    };
    Object.keys(filters).forEach(k => { if (!filters[k]) delete filters[k]; });

    // substance filter is client-side (not in API) — apply after load
    filters._substanceQ = substanceQ;
    loadStudies();
  }

  async function loadStudiesFiltered() {
    await loadStudies();
    const q = filters._substanceQ;
    if (q) {
      // Substance filter applied locally since groups data isn't in study list
      // For now, just reload — future: filter by substance via groups data
    }
  }

  function openStudy(studyId) { Router.navigate('/study/' + studyId); }
  function editStudy(studyId) { Router.navigate('/study/' + studyId + '/edit'); }
  function openNewStudy() { Router.navigate('/study/new'); }

  async function deleteStudy(studyId, studyNumber) {
    if (!confirm(`시험 "${studyNumber}"을 삭제하시겠습니까?\n관련 군구성, 동물, 측정 데이터가 모두 삭제됩니다.`)) return;
    try {
      await App.withLoading(() => api.deleteStudy(studyId), '삭제 중...');
      App.showToast('시험이 삭제되었습니다.');
      loadStudies();
    } catch (e) {
      App.showToast('삭제 실패: ' + e.message, 'error');
    }
  }

  return { render, applyFilter, openStudy, editStudy, openNewStudy, deleteStudy };
})();
