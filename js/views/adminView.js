// Admin / Settings view
const AdminView = (() => {
  let currentAdminTab = 'sheets';
  let masterSubTab = 'substances';

  async function render() {
    App.setActiveNav('/admin');
    App.renderContent(`
      <h4 class="fw-bold mb-3">관리</h4>
      <ul class="nav nav-tabs mb-3" id="adminTabs">
        <li class="nav-item"><a class="nav-link active" href="#" onclick="AdminView.switchTab('sheets',this);return false;">Google Sheets 설정</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="AdminView.switchTab('master',this);return false;">기준정보</a></li>
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
    else if (tab === 'master') renderMaster(c);
    else if (tab === 'backup') renderBackup(c);
  }

  // ---- Google Sheets Settings ----
  function renderSheets(c) {
    const current = localStorage.getItem('xm_apps_script_url') || '';
    c.innerHTML = `
      <div class="card p-4">
        <h6 class="fw-bold mb-2">Google Sheets (Apps Script) 연결 설정</h6>
        <p class="small text-muted mb-3">기본 URL이 앱에 내장되어 있어 별도 설정 없이 바로 사용 가능합니다.<br>
          URL 변경 시 관리자 비밀번호를 입력하세요.</p>
        <div class="row g-2 align-items-end mb-2">
          <div class="col-md-7">
            <label class="form-label">Apps Script 웹 앱 URL</label>
            <input class="form-control" id="gasUrl" value="${current}" placeholder="기본 내장 URL 사용 중 (비워두면 기본값)">
          </div>
          <div class="col-md-2">
            <label class="form-label">관리자 비밀번호</label>
            <input class="form-control" type="password" id="adminPw" placeholder="****">
          </div>
          <div class="col-md-3">
            <button class="btn btn-primary w-100" onclick="AdminView.saveGasUrl()">URL 저장</button>
          </div>
        </div>
        <div class="mt-2">
          <button class="btn btn-outline-secondary btn-sm" onclick="AdminView.testConnection()">연결 테스트</button>
          <span id="testResult" class="ms-2 small"></span>
        </div>
      </div>`;
  }

  function saveGasUrl() {
    const url = document.getElementById('gasUrl')?.value?.trim();
    const pw = document.getElementById('adminPw')?.value;
    if (!url) return App.showToast('URL을 입력해주세요.', 'error');
    if (pw !== '0000') {
      App.showToast('관리자 비밀번호가 올바르지 않습니다.', 'error');
      document.getElementById('adminPw').value = '';
      return;
    }
    localStorage.setItem('xm_apps_script_url', url);
    document.getElementById('adminPw').value = '';
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

  // ---- 기준정보 통합 탭 ----
  const MASTER_TABS = [
    { key: 'substances', label: '물질' },
    { key: 'competitors', label: '경쟁사 DB' },
    { key: 'modelName', label: '모델명' },
    { key: 'strain', label: 'Strain' },
    { key: 'CRO', label: 'CRO' },
    { key: 'project', label: '과제명' }
  ];

  async function renderMaster(c) {
    const subTabBtns = MASTER_TABS.map(t =>
      `<button class="btn btn-sm ${masterSubTab === t.key ? 'btn-dark' : 'btn-outline-dark'}"
        onclick="AdminView.switchMasterTab('${t.key}')">${t.label}</button>`
    ).join('');

    c.innerHTML = `
      <div class="card p-4">
        <h6 class="fw-bold mb-3">기준정보 관리</h6>
        <div class="btn-group btn-group-sm mb-3 flex-wrap">${subTabBtns}</div>
        <div id="masterSubContent"></div>
      </div>`;

    await renderMasterSubTab();
  }

  async function switchMasterTab(key) {
    masterSubTab = key;
    // Update button styles
    document.querySelectorAll('#masterSubContent').forEach(() => {});
    const btns = document.querySelectorAll('.btn-group.btn-group-sm.mb-3 button');
    btns.forEach(b => {
      const isActive = b.textContent.trim() === MASTER_TABS.find(t => t.key === key)?.label;
      b.className = `btn btn-sm ${isActive ? 'btn-dark' : 'btn-outline-dark'}`;
    });
    await renderMasterSubTab();
  }

  async function renderMasterSubTab() {
    const c = document.getElementById('masterSubContent');
    if (!c) return;
    if (masterSubTab === 'substances') await renderSubstances(c);
    else if (masterSubTab === 'competitors') await renderCompetitors(c);
    else await renderCodeCategory(c, masterSubTab);
  }

  // ---- Substances ----
  async function renderSubstances(c) {
    let substances = [];
    try { substances = await api.getSubstances(); } catch (e) {}

    c.innerHTML = `
      <div id="substanceFormWrap"></div>
      <div class="d-flex justify-content-end mb-2">
        <button class="btn btn-sm btn-primary" onclick="AdminView.showSubstanceForm()">+ 물질 추가</button>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-bordered table-hover">
          <thead><tr><th>물질명</th><th>유형</th><th>Target</th><th>MOA</th><th>비고</th><th style="width:60px"></th></tr></thead>
          <tbody>
            ${substances.length ? substances.map(s => `<tr>
              <td class="fw-semibold">${s.substanceName || ''}</td>
              <td><span class="badge ${s.type === 'SB' ? 'bg-primary' : s.type === 'comparator' ? 'bg-danger' : 'bg-secondary'}">${s.type || ''}</span></td>
              <td>${s.target || ''}</td>
              <td>${s.moa || ''}</td>
              <td class="small text-muted">${s.note || ''}</td>
              <td><button class="btn btn-xs btn-sm btn-outline-danger" onclick="AdminView.deleteSubstance('${s.substanceId}','${(s.substanceName||'').replace(/'/g,'')}')">삭제</button></td>
            </tr>`).join('') : '<tr><td colspan="6" class="text-center text-muted py-3">등록된 물질이 없습니다.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  function showSubstanceForm() {
    const wrap = document.getElementById('substanceFormWrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="p-3 mb-3 rounded" style="background:#f8f9fa;border:1px solid #dee2e6">
        <div class="row g-2">
          <div class="col-md-3"><input class="form-control form-control-sm" id="sb_name" placeholder="물질명 *"></div>
          <div class="col-md-2">
            <select class="form-select form-select-sm" id="sb_type">
              <option value="SB">SB</option>
              <option value="comparator">Comparator</option>
              <option value="vehicle">Vehicle</option>
            </select>
          </div>
          <div class="col-md-2"><input class="form-control form-control-sm" id="sb_target" placeholder="Target"></div>
          <div class="col-md-3"><input class="form-control form-control-sm" id="sb_moa" placeholder="MOA"></div>
          <div class="col-md-2"><input class="form-control form-control-sm" id="sb_note" placeholder="비고"></div>
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
    // Duplicate check
    try {
      const existing = await api.getSubstances();
      if (existing.some(s => s.substanceName === name)) {
        return App.showToast(`"${name}"은 이미 등록된 물질입니다.`, 'error');
      }
    } catch(e) {}
    const data = {
      substanceId: App.uuid(), substanceName: name,
      type: document.getElementById('sb_type')?.value || 'SB',
      target: document.getElementById('sb_target')?.value?.trim() || '',
      moa: document.getElementById('sb_moa')?.value?.trim() || '',
      note: document.getElementById('sb_note')?.value?.trim() || ''
    };
    try {
      await App.withLoading(() => api.saveSubstance(data), '저장 중...');
      App.showToast('저장되었습니다.');
      renderSubstances(document.getElementById('masterSubContent'));
    } catch (e) { App.showToast('저장 실패: ' + e.message, 'error'); }
  }

  async function deleteSubstance(id, name) {
    if (!confirm(`"${name}" 물질을 삭제하시겠습니까?`)) return;
    try {
      await api.deleteSubstance(id);
      App.showToast('삭제되었습니다.');
      renderSubstances(document.getElementById('masterSubContent'));
    } catch (e) { App.showToast('삭제 실패: ' + e.message, 'error'); }
  }

  // ---- Competitors ----
  async function renderCompetitors(c) {
    let competitors = [];
    try { competitors = await api.getCompetitors(); } catch (e) {}

    c.innerHTML = `
      <div id="competitorFormWrap"></div>
      <div class="d-flex justify-content-end mb-2">
        <button class="btn btn-sm btn-primary" onclick="AdminView.showCompetitorForm()">+ 경쟁사 추가</button>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-bordered table-hover">
          <thead><tr><th>회사명</th><th>물질명</th><th>적응증</th><th>출처</th><th>비고</th><th style="width:60px"></th></tr></thead>
          <tbody>
            ${competitors.length ? competitors.map(cp => `<tr>
              <td class="fw-semibold">${cp.companyName || ''}</td>
              <td>${cp.substanceName || ''}</td>
              <td>${cp.indication || ''}</td>
              <td class="small">${cp.source || ''}</td>
              <td class="small text-muted">${cp.note || ''}</td>
              <td><button class="btn btn-xs btn-sm btn-outline-danger" onclick="AdminView.deleteCompetitor('${cp.competitorId}','${(cp.substanceName||'').replace(/'/g,'')}')">삭제</button></td>
            </tr>`).join('') : '<tr><td colspan="6" class="text-center text-muted py-3">등록된 경쟁사 정보가 없습니다.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  function showCompetitorForm() {
    const wrap = document.getElementById('competitorFormWrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="p-3 mb-3 rounded" style="background:#f8f9fa;border:1px solid #dee2e6">
        <div class="row g-2">
          <div class="col-md-2"><input class="form-control form-control-sm" id="cp_company" placeholder="회사명 *"></div>
          <div class="col-md-2"><input class="form-control form-control-sm" id="cp_substance" placeholder="물질명 *"></div>
          <div class="col-md-2"><input class="form-control form-control-sm" id="cp_indication" placeholder="적응증"></div>
          <div class="col-md-3"><input class="form-control form-control-sm" id="cp_source" placeholder="출처 (논문/학회)"></div>
          <div class="col-md-3"><input class="form-control form-control-sm" id="cp_note" placeholder="비고"></div>
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
    // Duplicate check
    try {
      const existing = await api.getCompetitors();
      if (existing.some(c => c.companyName === company && c.substanceName === substance)) {
        return App.showToast(`${company} - ${substance}는 이미 등록되어 있습니다.`, 'error');
      }
    } catch(e) {}
    const data = {
      competitorId: App.uuid(), companyName: company, substanceName: substance,
      indication: document.getElementById('cp_indication')?.value?.trim() || '',
      source: document.getElementById('cp_source')?.value?.trim() || '',
      note: document.getElementById('cp_note')?.value?.trim() || ''
    };
    try {
      await App.withLoading(() => api.saveCompetitor(data), '저장 중...');
      App.showToast('저장되었습니다.');
      renderCompetitors(document.getElementById('masterSubContent'));
    } catch (e) { App.showToast('저장 실패: ' + e.message, 'error'); }
  }

  async function deleteCompetitor(id, name) {
    if (!confirm(`"${name}" 경쟁사 데이터를 삭제하시겠습니까?`)) return;
    try {
      await api.deleteCompetitor(id);
      App.showToast('삭제되었습니다.');
      renderCompetitors(document.getElementById('masterSubContent'));
    } catch (e) { App.showToast('삭제 실패: ' + e.message, 'error'); }
  }

  // ---- Code Categories ----
  const CODE_META = {
    modelName: { label: '모델명', placeholder: 'HCT116' },
    strain:    { label: 'Strain', placeholder: 'BALB/c nude' },
    CRO:       { label: 'CRO', placeholder: 'Charles River' },
    project:   { label: '과제명', placeholder: '과제명' }
  };

  async function renderCodeCategory(c, codeType) {
    let codes = [];
    try { codes = (await api.getCodes(codeType)) || []; } catch(e) {}
    const meta = CODE_META[codeType] || { label: codeType, placeholder: '' };

    c.innerHTML = `
      <div class="d-flex gap-2 mb-3 align-items-end">
        <div>
          <label class="form-label small">${meta.label} 추가</label>
          <input class="form-control form-control-sm" id="newCodeValue" placeholder="${meta.placeholder}" style="width:220px">
        </div>
        <button class="btn btn-sm btn-primary" onclick="AdminView.addCode()">추가</button>
      </div>
      <table class="table table-sm table-bordered" style="max-width:400px">
        <thead><tr><th>${meta.label}</th><th style="width:70px"></th></tr></thead>
        <tbody>
          ${codes.length ? codes.map(cd => `<tr>
            <td>${cd.codeValue || ''}</td>
            <td><button class="btn btn-xs btn-sm btn-outline-danger" onclick="AdminView.deleteCode('${cd.codeType}','${(cd.codeValue||'').replace(/'/g,'')}')">삭제</button></td>
          </tr>`).join('') : '<tr><td colspan="2" class="text-center text-muted">항목이 없습니다.</td></tr>'}
        </tbody>
      </table>`;
  }

  async function addCode() {
    const val = document.getElementById('newCodeValue')?.value?.trim();
    if (!val) return App.showToast('값을 입력해주세요.', 'error');
    // Duplicate check
    try {
      const existing = await api.getCodes(masterSubTab);
      if (existing.some(c => c.codeValue === val)) {
        return App.showToast(`"${val}"은 이미 등록된 항목입니다.`, 'error');
      }
    } catch(e) {}
    try {
      await api.saveCode({ codeType: masterSubTab, codeValue: val, codeLabel: val, sortOrder: 0 });
      App.showToast('추가되었습니다.');
      renderCodeCategory(document.getElementById('masterSubContent'), masterSubTab);
    } catch (e) { App.showToast('추가 실패: ' + e.message, 'error'); }
  }

  async function deleteCode(codeType, codeValue) {
    if (!confirm(`"${codeValue}" 항목을 삭제하시겠습니까?`)) return;
    try {
      await api.deleteCode(codeType, codeValue);
      App.showToast('삭제되었습니다.');
      renderCodeCategory(document.getElementById('masterSubContent'), codeType);
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
        <p class="text-muted small">백업 파일은 모든 시험, 군구성, 측정 데이터, 기준정보를 포함합니다.</p>
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
    switchMasterTab,
    showSubstanceForm, saveSubstance, deleteSubstance,
    showCompetitorForm, saveCompetitor, deleteCompetitor,
    addCode, deleteCode,
    exportAll, importAll
  };
})();
