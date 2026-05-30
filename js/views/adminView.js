// Admin / Settings view
const AdminView = (() => {
  let currentAdminTab = 'sheets';

  async function render() {
    App.setActiveNav('/admin');
    App.renderContent(`
      <h4 class="fw-bold mb-3">관리</h4>
      <ul class="nav nav-tabs mb-3" id="adminTabs">
        <li class="nav-item"><a class="nav-link active" href="#" onclick="AdminView.switchTab('sheets',this);return false;">Google Sheets 설정</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="AdminView.switchTab('substances',this);return false;">물질 관리</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="AdminView.switchTab('competitors',this);return false;">경쟁사 DB</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="AdminView.switchTab('codes',this);return false;">공통 코드</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="AdminView.switchTab('backup',this);return false;">백업/복원</a></li>
      </ul>
      <div id="adminContent"></div>
    `);
    switchTab('sheets');
  }

  function switchTab(tab, el) {
    currentAdminTab = tab;
    document.querySelectorAll('#adminTabs .nav-link').forEach(a => a.classList.remove('active'));
    if (el) el.classList.add('active');
    else {
      const link = document.querySelector(`#adminTabs .nav-link[onclick*="'${tab}'"]`);
      if (link) link.classList.add('active');
    }
    const c = document.getElementById('adminContent');
    if (!c) return;
    if (tab === 'sheets') renderSheets(c);
    else if (tab === 'substances') renderSubstances(c);
    else if (tab === 'competitors') renderCompetitors(c);
    else if (tab === 'codes') renderCodes(c);
    else if (tab === 'backup') renderBackup(c);
  }

  // ---- Google Sheets Settings ----
  function renderSheets(c) {
    const current = localStorage.getItem('xm_apps_script_url') || '';
    c.innerHTML = `
      <div class="card p-4">
        <h6 class="fw-bold mb-3">Google Sheets (Apps Script) 연결 설정</h6>
        <ol class="mb-3 small text-muted">
          <li>Google Apps Script에서 <code>gas/Code.gs</code>를 새 프로젝트에 붙여넣기</li>
          <li><code>SHEET_ID</code>를 Spreadsheet ID로 설정</li>
          <li>웹 앱으로 배포: 실행 계정 "나", 액세스 "조직 내 모든 사용자"</li>
          <li>웹 앱 URL을 아래에 입력</li>
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

  // ---- Substances ----
  async function renderSubstances(c) {
    let substances = [];
    try { substances = await api.getSubstances(); } catch (e) {}

    const typeOptions = ['SB', 'comparator', 'vehicle'].map(t => `<option value="${t}">${t}</option>`).join('');

    c.innerHTML = `
      <div class="card p-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-bold mb-0">물질 관리</h6>
          <button class="btn btn-primary btn-sm" onclick="AdminView.showSubstanceForm()">+ 추가</button>
        </div>
        <div id="substanceFormWrap"></div>
        <div class="table-responsive mt-2">
          <table class="table table-sm table-bordered table-hover">
            <thead><tr><th>물질명</th><th>유형</th><th>Target</th><th>MOA</th><th>비고</th><th></th></tr></thead>
            <tbody>
              ${substances.length ? substances.map(s => `<tr>
                <td class="fw-semibold">${s.substanceName || ''}</td>
                <td><span class="badge ${s.type === 'SB' ? 'bg-primary' : s.type === 'comparator' ? 'bg-danger' : 'bg-secondary'}">${s.type || ''}</span></td>
                <td>${s.target || ''}</td>
                <td>${s.moa || ''}</td>
                <td class="small text-muted">${s.note || ''}</td>
                <td><button class="btn btn-xs btn-sm btn-outline-danger" onclick="AdminView.deleteSubstance('${s.substanceId}','${(s.substanceName||'').replace(/'/g,'')}')">삭제</button></td>
              </tr>`).join('') : '<tr><td colspan="6" class="text-center text-muted">등록된 물질이 없습니다.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function showSubstanceForm() {
    const wrap = document.getElementById('substanceFormWrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="card p-3 mb-3" style="background:#f8f9fa">
        <div class="row g-2">
          <div class="col-md-3">
            <input class="form-control form-control-sm" id="sb_name" placeholder="물질명 *">
          </div>
          <div class="col-md-2">
            <select class="form-select form-select-sm" id="sb_type">
              <option value="SB">SB</option>
              <option value="comparator">Comparator</option>
              <option value="vehicle">Vehicle</option>
            </select>
          </div>
          <div class="col-md-2">
            <input class="form-control form-control-sm" id="sb_target" placeholder="Target">
          </div>
          <div class="col-md-3">
            <input class="form-control form-control-sm" id="sb_moa" placeholder="MOA">
          </div>
          <div class="col-md-2">
            <input class="form-control form-control-sm" id="sb_note" placeholder="비고">
          </div>
        </div>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-primary" onclick="AdminView.saveSubstance()">저장</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="document.getElementById('substanceFormWrap').innerHTML=''">취소</button>
        </div>
      </div>`;
  }

  async function saveSubstance() {
    const name = document.getElementById('sb_name')?.value?.trim();
    if (!name) return App.showToast('물질명을 입력해주세요.', 'error');
    const data = {
      substanceId: App.uuid(),
      substanceName: name,
      type: document.getElementById('sb_type')?.value || 'SB',
      target: document.getElementById('sb_target')?.value?.trim() || '',
      moa: document.getElementById('sb_moa')?.value?.trim() || '',
      note: document.getElementById('sb_note')?.value?.trim() || ''
    };
    try {
      await App.withLoading(() => api.saveSubstance(data), '저장 중...');
      App.showToast('저장되었습니다.');
      renderSubstances(document.getElementById('adminContent'));
    } catch (e) { App.showToast('저장 실패: ' + e.message, 'error'); }
  }

  async function deleteSubstance(id, name) {
    if (!confirm(`"${name}" 물질을 삭제하시겠습니까?`)) return;
    try {
      await api.deleteSubstance(id);
      App.showToast('삭제되었습니다.');
      renderSubstances(document.getElementById('adminContent'));
    } catch (e) { App.showToast('삭제 실패: ' + e.message, 'error'); }
  }

  // ---- Competitors ----
  async function renderCompetitors(c) {
    let competitors = [];
    try { competitors = await api.getCompetitors(); } catch (e) {}

    c.innerHTML = `
      <div class="card p-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-bold mb-0">경쟁사 약물 DB</h6>
          <button class="btn btn-primary btn-sm" onclick="AdminView.showCompetitorForm()">+ 추가</button>
        </div>
        <div id="competitorFormWrap"></div>
        <div class="table-responsive mt-2">
          <table class="table table-sm table-bordered table-hover">
            <thead><tr><th>회사명</th><th>물질명</th><th>적응증</th><th>출처</th><th>비고</th><th></th></tr></thead>
            <tbody>
              ${competitors.length ? competitors.map(c => `<tr>
                <td class="fw-semibold">${c.companyName || ''}</td>
                <td>${c.substanceName || ''}</td>
                <td>${c.indication || ''}</td>
                <td class="small">${c.source || ''}</td>
                <td class="small text-muted">${c.note || ''}</td>
                <td><button class="btn btn-xs btn-sm btn-outline-danger" onclick="AdminView.deleteCompetitor('${c.competitorId}','${(c.substanceName||'').replace(/'/g,'')}')">삭제</button></td>
              </tr>`).join('') : '<tr><td colspan="6" class="text-center text-muted">등록된 경쟁사 데이터가 없습니다.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function showCompetitorForm() {
    const wrap = document.getElementById('competitorFormWrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="card p-3 mb-3" style="background:#f8f9fa">
        <div class="row g-2">
          <div class="col-md-2">
            <input class="form-control form-control-sm" id="cp_company" placeholder="회사명 *">
          </div>
          <div class="col-md-2">
            <input class="form-control form-control-sm" id="cp_substance" placeholder="물질명 *">
          </div>
          <div class="col-md-2">
            <input class="form-control form-control-sm" id="cp_indication" placeholder="적응증">
          </div>
          <div class="col-md-3">
            <input class="form-control form-control-sm" id="cp_source" placeholder="출처 (논문/학회)">
          </div>
          <div class="col-md-3">
            <input class="form-control form-control-sm" id="cp_note" placeholder="비고">
          </div>
        </div>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-primary" onclick="AdminView.saveCompetitor()">저장</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="document.getElementById('competitorFormWrap').innerHTML=''">취소</button>
        </div>
      </div>`;
  }

  async function saveCompetitor() {
    const company = document.getElementById('cp_company')?.value?.trim();
    const substance = document.getElementById('cp_substance')?.value?.trim();
    if (!company || !substance) return App.showToast('회사명과 물질명을 입력해주세요.', 'error');
    const data = {
      competitorId: App.uuid(),
      companyName: company,
      substanceName: substance,
      indication: document.getElementById('cp_indication')?.value?.trim() || '',
      source: document.getElementById('cp_source')?.value?.trim() || '',
      note: document.getElementById('cp_note')?.value?.trim() || ''
    };
    try {
      await App.withLoading(() => api.saveCompetitor(data), '저장 중...');
      App.showToast('저장되었습니다.');
      renderCompetitors(document.getElementById('adminContent'));
    } catch (e) { App.showToast('저장 실패: ' + e.message, 'error'); }
  }

  async function deleteCompetitor(id, name) {
    if (!confirm(`"${name}" 경쟁사 데이터를 삭제하시겠습니까?`)) return;
    try {
      await api.deleteCompetitor(id);
      App.showToast('삭제되었습니다.');
      renderCompetitors(document.getElementById('adminContent'));
    } catch (e) { App.showToast('삭제 실패: ' + e.message, 'error'); }
  }

  // ---- Codes ----
  const CODE_CATEGORIES = [
    { key: 'CRO',     label: 'CRO 목록',   placeholder: 'Charles River' },
    { key: 'strain',  label: 'Strain 목록', placeholder: 'BALB/c nude' },
    { key: 'project', label: '과제 목록',   placeholder: '과제명' }
  ];
  let codeSubTab = 'CRO';

  async function renderCodes(c) {
    let allCodes = [];
    try { allCodes = await api.getCodes(); } catch (e) {}

    const subTabBtns = CODE_CATEGORIES.map(cat =>
      `<button class="btn btn-sm ${codeSubTab === cat.key ? 'btn-dark' : 'btn-outline-dark'}"
        onclick="AdminView.switchCodeTab('${cat.key}')">${cat.label}</button>`
    ).join('');

    const cat = CODE_CATEGORIES.find(c => c.key === codeSubTab) || CODE_CATEGORIES[0];
    const filtered = allCodes.filter(cd => cd.codeType === codeSubTab);

    c.innerHTML = `
      <div class="card p-4">
        <h6 class="fw-bold mb-3">공통 코드 관리</h6>
        <div class="btn-group btn-group-sm mb-3">${subTabBtns}</div>
        <div class="d-flex gap-2 mb-3">
          <input class="form-control form-control-sm" id="newCodeValue" placeholder="${cat.placeholder}" style="max-width:280px">
          <button class="btn btn-sm btn-primary" onclick="AdminView.addCode()">추가</button>
        </div>
        <table class="table table-sm table-bordered" style="max-width:480px">
          <thead><tr><th>${cat.label}</th><th style="width:80px"></th></tr></thead>
          <tbody>
            ${filtered.length ? filtered.map(cd => `<tr>
              <td>${cd.codeValue || cd.codeLabel || ''}</td>
              <td><button class="btn btn-xs btn-sm btn-outline-danger" onclick="AdminView.deleteCode('${cd.codeType}','${(cd.codeValue||'').replace(/'/g,'')}')">삭제</button></td>
            </tr>`).join('') : '<tr><td colspan="2" class="text-center text-muted">항목이 없습니다.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  function switchCodeTab(key) {
    codeSubTab = key;
    renderCodes(document.getElementById('adminContent'));
  }

  async function addCode() {
    const val = document.getElementById('newCodeValue')?.value?.trim();
    if (!val) return App.showToast('값을 입력해주세요.', 'error');
    try {
      await api.saveCode({ codeType: codeSubTab, codeValue: val, codeLabel: val, sortOrder: 0 });
      App.showToast('추가되었습니다.');
      renderCodes(document.getElementById('adminContent'));
    } catch (e) { App.showToast('추가 실패: ' + e.message, 'error'); }
  }

  async function deleteCode(codeType, codeValue) {
    if (!confirm(`"${codeValue}" 항목을 삭제하시겠습니까?`)) return;
    try {
      await api.deleteCode(codeType, codeValue);
      App.showToast('삭제되었습니다.');
      renderCodes(document.getElementById('adminContent'));
    } catch (e) { App.showToast('삭제 실패: ' + e.message, 'error'); }
  }

  // ---- Backup/Restore ----
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

  return {
    render, switchTab, saveGasUrl, testConnection,
    showSubstanceForm, saveSubstance, deleteSubstance,
    showCompetitorForm, saveCompetitor, deleteCompetitor,
    switchCodeTab, addCode, deleteCode,
    exportAll, importAll
  };
})();
