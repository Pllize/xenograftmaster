// Admin / Settings view
const AdminView = (() => {
  async function render() {
    App.setActiveNav('/admin');
    App.renderContent(`
      <h4 class="fw-bold mb-3">관리</h4>
      <ul class="nav nav-tabs mb-3" id="adminTabs">
        <li class="nav-item"><a class="nav-link active" href="#" onclick="AdminView.switchTab('sheets',this);return false;">Google Sheets 설정</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="AdminView.switchTab('competitor',this);return false;">경쟁사 데이터</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="AdminView.switchTab('backup',this);return false;">백업/복원</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="AdminView.switchTab('codes',this);return false;">공통 코드</a></li>
      </ul>
      <div id="adminContent"></div>
    `);
    switchTab('sheets');
  }

  function switchTab(tab, el) {
    document.querySelectorAll('#adminTabs .nav-link').forEach(a => a.classList.remove('active'));
    if (el) el.classList.add('active');
    else {
      const link = document.querySelector(`#adminTabs .nav-link[onclick*="'${tab}'"]`);
      if (link) link.classList.add('active');
    }
    const c = document.getElementById('adminContent');
    if (tab === 'sheets') renderSheets(c);
    else if (tab === 'competitor') renderCompetitor(c);
    else if (tab === 'backup') renderBackup(c);
    else if (tab === 'codes') renderCodes(c);
  }

  function renderSheets(c) {
    const current = localStorage.getItem('xm_apps_script_url') || '';
    c.innerHTML = `
      <div class="card p-4">
        <h6 class="fw-bold mb-3">Google Sheets (Apps Script) 연결 설정</h6>
        <ol class="mb-3 small text-muted">
          <li>Google Apps Script에서 <code>gas/Code.gs</code>를 새 프로젝트에 붙여넣기</li>
          <li>웹 앱으로 배포: 실행 계정 "나", 액세스 "조직 내 모든 사용자"</li>
          <li>웹 앱 URL을 아래에 입력</li>
          <li>Google Spreadsheet ID를 <code>Code.gs</code>의 <code>SHEET_ID</code>에 설정</li>
        </ol>
        <div class="row g-2 align-items-end">
          <div class="col-md-9">
            <label class="form-label">Apps Script 웹 앱 URL</label>
            <input class="form-control" id="gasUrl" value="${current}" placeholder="https://script.google.com/macros/s/.../exec">
          </div>
          <div class="col-md-3">
            <button class="btn btn-primary w-100" onclick="AdminView.saveGasUrl()">저장</button>
          </div>
        </div>
        <div class="mt-3">
          <button class="btn btn-outline-secondary btn-sm" onclick="AdminView.testConnection()">연결 테스트</button>
          <span id="testResult" class="ms-2 small"></span>
        </div>
      </div>`;
  }

  function saveGasUrl() {
    const url = document.getElementById('gasUrl')?.value?.trim();
    if (!url) return App.showToast('URL을 입력해주세요.', 'error');
    localStorage.setItem('xm_apps_script_url', url);
    App.showToast('URL이 저장되었습니다.');
  }

  async function testConnection() {
    const result = document.getElementById('testResult');
    if (result) result.textContent = '테스트 중...';
    try {
      await api.init();
      if (result) result.innerHTML = '<span class="text-success">✓ 연결 성공</span>';
    } catch (e) {
      if (result) result.innerHTML = `<span class="text-danger">✗ 실패: ${e.message}</span>`;
    }
  }

  function renderCompetitor(c) {
    c.innerHTML = `
      <div class="card p-4">
        <h6 class="fw-bold mb-3">경쟁사 데이터 등록</h6>
        <p class="text-muted small">경쟁사 데이터는 시험 등록 시 "데이터 출처: 경쟁사"를 선택하여 추가하거나, 아래 버튼으로 바로 추가할 수 있습니다.</p>
        <div class="d-flex gap-2">
          <button class="btn btn-primary" onclick="Router.navigate('/study/new?type=competitor')">+ 경쟁사 데이터 등록</button>
          <button class="btn btn-outline-secondary" onclick="Router.navigate('/data')">데이터 관리로 이동</button>
        </div>
      </div>`;
  }

  function renderBackup(c) {
    c.innerHTML = `
      <div class="card p-4">
        <h6 class="fw-bold mb-3">전체 데이터 백업/복원</h6>
        <div class="d-flex flex-wrap gap-3 mb-3">
          <button class="btn btn-outline-primary" onclick="AdminView.exportAll()">📤 전체 내보내기 (JSON)</button>
          <button class="btn btn-outline-success" onclick="document.getElementById('importFile').click()">📥 JSON 가져오기</button>
          <input type="file" id="importFile" accept=".json" style="display:none" onchange="AdminView.importAll(this)">
        </div>
        <p class="text-muted small">백업 파일은 모든 시험, 군구성, 측정 데이터를 포함합니다.</p>
      </div>`;
  }

  async function exportAll() {
    try {
      const data = await App.withLoading(() => api.exportAll(), '데이터 내보내는 중...');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `xenograftmaster_backup_${new Date().toISOString().split('T')[0]}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      App.showToast('내보내기 실패: ' + e.message, 'error');
    }
  }

  function importAll(input) {
    const file = input.files[0];
    if (!file) return;
    if (!confirm('가져오기 시 기존 데이터와 중복될 수 있습니다. 계속하시겠습니까?')) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const data = JSON.parse(e.target.result);
        await App.withLoading(() => api.importAll(data), '가져오는 중...');
        App.showToast('가져오기 완료!');
      } catch (err) {
        App.showToast('가져오기 실패: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  async function renderCodes(c) {
    let codes = [];
    try { codes = await api.getCodes(); } catch (e) {}
    const codeTypes = [...new Set(codes.map(c => c.codeType))];

    c.innerHTML = `
      <div class="card p-4">
        <h6 class="fw-bold mb-3">공통 코드 관리 (CRO 목록 등)</h6>
        <div class="row g-2 align-items-end mb-3">
          <div class="col-md-3">
            <input class="form-control form-control-sm" id="newCodeType" placeholder="코드 유형 (예: CRO)">
          </div>
          <div class="col-md-4">
            <input class="form-control form-control-sm" id="newCodeValue" placeholder="값 (예: Charles River)">
          </div>
          <div class="col-md-3">
            <input class="form-control form-control-sm" id="newCodeLabel" placeholder="표시명 (선택)">
          </div>
          <div class="col-md-2">
            <button class="btn btn-primary btn-sm w-100" onclick="AdminView.addCode()">추가</button>
          </div>
        </div>
        <table class="table table-sm table-bordered">
          <thead><tr><th>유형</th><th>값</th><th>표시명</th><th></th></tr></thead>
          <tbody>
            ${codes.map(cd => `<tr>
              <td>${cd.codeType}</td><td>${cd.codeValue}</td><td>${cd.codeLabel || ''}</td>
              <td><button class="btn btn-xs btn-sm btn-outline-danger" onclick="AdminView.deleteCode('${cd.codeType}','${cd.codeValue}')">삭제</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function addCode() {
    const codeType = document.getElementById('newCodeType')?.value?.trim();
    const codeValue = document.getElementById('newCodeValue')?.value?.trim();
    const codeLabel = document.getElementById('newCodeLabel')?.value?.trim();
    if (!codeType || !codeValue) return App.showToast('유형과 값을 입력해주세요.', 'error');
    try {
      await api.saveCode({ codeType, codeValue, codeLabel: codeLabel || codeValue, sortOrder: 0 });
      App.showToast('추가되었습니다.');
      renderCodes(document.getElementById('adminContent'));
    } catch (e) { App.showToast('추가 실패: ' + e.message, 'error'); }
  }

  async function deleteCode(codeType, codeValue) {
    if (!confirm(`"${codeValue}" 코드를 삭제하시겠습니까?`)) return;
    try {
      await api.deleteCode(codeType, codeValue);
      App.showToast('삭제되었습니다.');
      renderCodes(document.getElementById('adminContent'));
    } catch (e) { App.showToast('삭제 실패: ' + e.message, 'error'); }
  }

  return { render, switchTab, saveGasUrl, testConnection, exportAll, importAll, addCode, deleteCode };
})();
