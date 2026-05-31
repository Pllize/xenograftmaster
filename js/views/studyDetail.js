// Study Detail view - Overview, Data Entry, Analysis, Export tabs
const StudyDetailView = (() => {
  let studyData = null;
  let localMeasurements = {};
  let localNecropsy = {};
  let currentTab = 'overview';
  let unsaved = false;
  let selectedGroupIds = new Set();
  let obsTab = 'tv';
  let groupColorMap = {};

  let analysisState = {
    visibleGroups: new Set(),
    errorBarType: 'sem',
    controlGroup: null,
    statMethod: 'welch',
    crThreshold: 0,
    yMin: '',
    yMax: ''
  };

  let charts = {};

  const ROLE_PALETTES = {
    vehicle:    ['#1a1a1a'],
    control:    ['#555555'],
    SB:         ['#0d6efd','#0a58ca','#084298','#6ea8fe','#9ec5fe'],
    comparator: ['#dc3545','#b02a37','#842029','#f1aeb5','#f8d7da']
  };

  function buildGroupColorMap(groups) {
    const map = {};
    const counters = { vehicle: 0, control: 0, SB: 0, comparator: 0 };
    const sorted = [...groups].sort((a, b) => (Number(a.groupNumber) || 0) - (Number(b.groupNumber) || 0));
    sorted.forEach(g => {
      const role = g.groupRole || 'SB';
      const palette = ROLE_PALETTES[role] || ROLE_PALETTES.SB;
      const idx = counters[role] || 0;
      map[g.groupId] = palette[idx % palette.length];
      counters[role] = idx + 1;
    });
    return map;
  }

  function getContrastColor(hex) {
    if (!hex || hex.length < 7) return '#000';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128 ? '#fff' : '#000';
  }

  function groupDisplayName(g) {
    return g.substanceName || g.groupName || ('Group ' + g.groupNumber);
  }

  async function render(params) {
    App.setActiveNav('/data');
    try {
      studyData = await App.withLoading(() => api.getStudyData(params.id), '데이터 로딩 중...');
    } catch (e) {
      App.showToast('데이터 로딩 실패: ' + e.message, 'error');
      Router.navigate('/data');
      return;
    }

    localMeasurements = {};
    localNecropsy = {};
    (studyData.measurements || []).forEach(m => {
      if (!localMeasurements[m.animalId]) localMeasurements[m.animalId] = {};
      if (!localMeasurements[m.animalId][m.day]) localMeasurements[m.animalId][m.day] = {};
      if (m.tumorVolume !== null && m.tumorVolume !== '') localMeasurements[m.animalId][m.day].tv = Number(m.tumorVolume);
      if (m.bodyWeight !== null && m.bodyWeight !== '') localMeasurements[m.animalId][m.day].bw = Number(m.bodyWeight);
    });
    (studyData.necropsy || []).forEach(n => {
      localNecropsy[n.animalId] = { tumorWeight: Number(n.tumorWeight) };
    });

    groupColorMap = buildGroupColorMap(studyData.groups || []);
    selectedGroupIds = new Set((studyData.groups || []).map(g => g.groupId));
    obsTab = 'tv';

    const s = studyData.study;
    const isSB = s.dataSource === 'SB' || s.dataSource === '자체';
    const badge = isSB
      ? `<span class="badge bg-primary ms-2">🏢 SB</span>`
      : `<span class="badge bg-warning text-dark ms-2">🏷 경쟁사</span>`;

    App.renderContent(`
      <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-sm btn-outline-secondary" onclick="Router.navigate('/data')">← 목록</button>
          <h4 class="fw-bold mb-0">${s.studyNumber || '(번호 없음)'}${badge}</h4>
        </div>
        <button class="btn btn-sm btn-outline-secondary" onclick="Router.navigate('/study/${s.studyId}/edit')">수정</button>
      </div>

      <div id="unsavedBannerLocal" class="alert alert-warning d-none align-items-center gap-2 mb-3">
        <span>⚠ 저장되지 않은 변경사항이 있습니다.</span>
        <button class="btn btn-sm btn-warning ms-auto" onclick="StudyDetailView.saveData()">저장</button>
      </div>

      <ul class="nav nav-tabs mb-3" id="detailTabs">
        <li class="nav-item"><a class="nav-link active" href="#" onclick="StudyDetailView.switchTab('overview',this);return false;">개요</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="StudyDetailView.switchTab('data',this);return false;">데이터 입력</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="StudyDetailView.switchTab('analysis',this);return false;">분석</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="StudyDetailView.switchTab('export',this);return false;">내보내기</a></li>
      </ul>

      <div id="tabContent"></div>
    `);

    switchTab('overview');
  }

  function switchTab(tab, el) {
    currentTab = tab;
    document.querySelectorAll('#detailTabs .nav-link').forEach(a => a.classList.remove('active'));
    if (el) el.classList.add('active');
    else {
      const link = document.querySelector(`#detailTabs .nav-link[onclick*="'${tab}'"]`);
      if (link) link.classList.add('active');
    }
    const content = document.getElementById('tabContent');
    if (!content) return;
    if (tab === 'overview') renderOverview(content);
    else if (tab === 'data') renderDataEntry(content);
    else if (tab === 'analysis') renderAnalysis(content);
    else if (tab === 'export') renderExport(content);
  }

  function renderOverview(container) {
    const s = studyData.study;
    const groups = studyData.groups || [];
    const isCompetitor = s.dataSource === '경쟁사';
    container.innerHTML = `
      <div class="card p-4">
        <div class="row g-3">
          <div class="col-md-3"><strong>시험번호</strong><p>${s.studyNumber || '-'}</p></div>
          <div class="col-md-2"><strong>연도</strong><p>${s.year || '-'}</p></div>
          <div class="col-md-2"><strong>분류</strong><p>${s.classification || '-'}</p></div>
          <div class="col-md-3"><strong>모델명</strong><p>${s.modelName || '-'}</p></div>
          <div class="col-md-2"><strong>Strain</strong><p>${s.strain || '-'}</p></div>
          ${s.projectName ? `<div class="col-md-4"><strong>과제명</strong><p>${s.projectName}</p></div>` : ''}
          <div class="col-md-2"><strong>CRO</strong><p>${s.cro || '-'}</p></div>
          ${s.protocolLink ? `<div class="col-md-6"><strong>시험계획서</strong><p><a href="${s.protocolLink}" target="_blank">링크 열기</a></p></div>` : ''}
          ${s.reportLink ? `<div class="col-md-6"><strong>시험보고서</strong><p><a href="${s.reportLink}" target="_blank">링크 열기</a></p></div>` : ''}
          ${isCompetitor ? `
          <div class="col-md-4"><strong>약물명</strong><p>${s.competitorDrug || '-'}</p></div>
          <div class="col-md-8"><strong>출처</strong><p>${s.competitorSource || '-'}</p></div>` : ''}
        </div>
      </div>
      <div class="card p-4 mt-3">
        <h6 class="fw-bold mb-3">군 구성 (${groups.length}개 군)</h6>
        <div class="table-responsive">
          <table class="table table-sm table-bordered">
            <thead><tr><th>#</th><th>투여물질</th><th>역할</th><th>동물수</th><th>이식일</th><th>군분리일</th><th>Day 1</th><th>부검일</th><th>측정일</th></tr></thead>
            <tbody>
              ${groups.map(g => {
                const color = groupColorMap[g.groupId] || '#888';
                const contrast = getContrastColor(color);
                const role = g.groupRole || (g.isControl ? 'control' : 'SB');
                return `<tr>
                  <td>${g.groupNumber}</td>
                  <td><span style="background:${color};color:${contrast};padding:2px 8px;border-radius:4px;font-size:0.8rem">${groupDisplayName(g)}</span></td>
                  <td>${role}</td><td>${g.animalCount}</td>
                  <td>${App.formatDate(g.implantationDate)}</td>
                  <td>${App.formatDate(g.separationDate)}</td>
                  <td>${App.formatDate(g.day1Date)}</td>
                  <td>${App.formatDate(g.necropsyDate)}</td>
                  <td class="small">${(Array.isArray(g.measurementDays) ? g.measurementDays : []).map(d => 'D'+d).join(', ')}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function renderDataEntry(container) {
    const groups = studyData.groups || [];
    if (!groups.length) {
      container.innerHTML = '<div class="alert alert-info">군 구성이 없습니다. 수정 버튼으로 군을 추가하세요.</div>';
      return;
    }

    const allSelected = selectedGroupIds.size === groups.length;
    const groupBtns = groups.map(g => {
      const color = groupColorMap[g.groupId] || '#888';
      const isSelected = selectedGroupIds.has(g.groupId);
      const contrast = getContrastColor(color);
      const style = isSelected
        ? `background:${color};color:${contrast};border-color:${color}`
        : `color:${color};border-color:${color};background:transparent`;
      return `<button class="btn btn-sm" style="${style}" onclick="StudyDetailView.toggleGroupData('${g.groupId}')">${groupDisplayName(g)}</button>`;
    }).join('');

    container.innerHTML = `
      <div class="card p-3 mb-3">
        <div class="mb-2 d-flex flex-wrap align-items-center gap-1">
          <span class="small fw-semibold text-secondary me-1">군:</span>
          <button class="btn btn-sm ${allSelected ? 'btn-dark' : 'btn-outline-dark'}" onclick="StudyDetailView.selectAllGroups()">전체</button>
          ${groupBtns}
        </div>
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div class="btn-group btn-group-sm">
            <button class="btn ${obsTab==='tv' ? 'btn-dark' : 'btn-outline-dark'}" onclick="StudyDetailView.switchObsTab('tv')">Tumor Volume</button>
            <button class="btn ${obsTab==='bw' ? 'btn-dark' : 'btn-outline-dark'}" onclick="StudyDetailView.switchObsTab('bw')">Body Weight</button>
            <button class="btn ${obsTab==='necropsy' ? 'btn-dark' : 'btn-outline-dark'}" onclick="StudyDetailView.switchObsTab('necropsy')">Necropsy</button>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-secondary" onclick="StudyDetailView.pasteData()">📋 붙여넣기</button>
            <button class="btn btn-sm btn-primary fw-bold" onclick="StudyDetailView.saveData()">💾 저장</button>
          </div>
        </div>
      </div>
      <div id="dataTableContainer"></div>`;

    renderDataTable();
  }

  function renderDataTable() {
    const container = document.getElementById('dataTableContainer');
    if (!container) return;
    const groups = (studyData.groups || []).filter(g => selectedGroupIds.has(g.groupId));
    if (!groups.length) { container.innerHTML = '<div class="alert alert-info">군을 선택해주세요.</div>'; return; }

    if (obsTab === 'necropsy') {
      renderNecropsyTable(container, groups);
    } else {
      renderMeasurementTable(container, groups, obsTab);
    }
  }

  function renderMeasurementTable(container, groups, type) {
    const allDays = new Set();
    groups.forEach(g => {
      (Array.isArray(g.measurementDays) ? g.measurementDays : []).forEach(d => allDays.add(Number(d)));
    });
    const days = Array.from(allDays).sort((a, b) => a - b);
    if (!days.length) { container.innerHTML = '<div class="alert alert-info">측정일이 설정되지 않았습니다.</div>'; return; }

    const colLabel = type === 'tv' ? 'mm³' : 'g';

    const bodyRows = groups.flatMap(g => {
      const animals = studyData.animals.filter(a => a.groupId === g.groupId);
      const color = groupColorMap[g.groupId] || '#888';
      const contrast = getContrastColor(color);
      const name = groupDisplayName(g);
      const gDays = new Set((Array.isArray(g.measurementDays) ? g.measurementDays : []).map(Number));

      const headerRow = `<tr>
        <td colspan="${days.length + 1}"
          style="background:${color};color:${contrast};font-weight:600;padding:5px 12px;font-size:0.82rem">
          ${g.groupNumber}. ${name} (n=${animals.length})
        </td>
      </tr>`;

      const animalRows = animals.map(a => {
        const label = a.subjectId || a.studyAnimalId || a.animalNumber || a.animalId.slice(-6);
        return `<tr>
          <td class="fw-semibold small ps-3" style="min-width:80px">${label}</td>
          ${days.map(d => {
            if (!gDays.has(d)) return '<td style="background:#f5f5f5"></td>';
            const val = type === 'tv'
              ? (localMeasurements[a.animalId]?.[d]?.tv ?? '')
              : (localMeasurements[a.animalId]?.[d]?.bw ?? '');
            return `<td><input type="number" step="any" class="excel-input"
              data-animal="${a.animalId}" data-day="${d}" data-type="${type}"
              value="${val}" placeholder="" oninput="StudyDetailView.onCellChange(this)"></td>`;
          }).join('')}
        </tr>`;
      }).join('');

      return headerRow + animalRows;
    }).join('');

    container.innerHTML = `
      <div class="card p-3">
        <div class="table-responsive">
          <table class="table table-bordered table-sm text-center excel-table">
            <thead>
              <tr>
                <th style="min-width:80px">개체 ID</th>
                ${days.map(d => `<th style="min-width:85px">Day ${d}<br><small class="text-muted fw-normal">${colLabel}</small></th>`).join('')}
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function renderNecropsyTable(container, groups) {
    const bodyRows = groups.flatMap(g => {
      const animals = studyData.animals.filter(a => a.groupId === g.groupId);
      const color = groupColorMap[g.groupId] || '#888';
      const contrast = getContrastColor(color);
      const name = groupDisplayName(g);

      const headerRow = `<tr>
        <td colspan="2" style="background:${color};color:${contrast};font-weight:600;padding:5px 12px;font-size:0.82rem">
          ${g.groupNumber}. ${name} — 부검일: ${App.formatDate(g.necropsyDate) || '미설정'}
        </td>
      </tr>`;

      const animalRows = animals.map(a => {
        const label = a.subjectId || a.studyAnimalId || a.animalNumber || a.animalId.slice(-6);
        return `<tr>
          <td class="fw-semibold small ps-3">${label}</td>
          <td><input type="number" step="any" class="excel-input" data-animal="${a.animalId}" data-type="tw"
            value="${localNecropsy[a.animalId]?.tumorWeight ?? ''}" placeholder=""
            oninput="StudyDetailView.onCellChange(this)" style="min-height:34px"></td>
        </tr>`;
      }).join('');

      return headerRow + animalRows;
    }).join('');

    container.innerHTML = `
      <div class="card p-3">
        <p class="small text-muted mb-2">Tumor Weight (mg) — 부검 시 1회 측정</p>
        <div class="table-responsive">
          <table class="table table-bordered table-sm excel-table" style="max-width:400px">
            <thead><tr><th>개체 ID</th><th style="min-width:140px">Tumor Weight (mg)</th></tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function toggleGroupData(groupId) {
    if (selectedGroupIds.has(groupId)) {
      if (selectedGroupIds.size > 1) selectedGroupIds.delete(groupId);
    } else {
      selectedGroupIds.add(groupId);
    }
    renderDataEntry(document.getElementById('tabContent'));
  }

  function selectAllGroups() {
    (studyData.groups || []).forEach(g => selectedGroupIds.add(g.groupId));
    renderDataEntry(document.getElementById('tabContent'));
  }

  function switchObsTab(type) {
    obsTab = type;
    renderDataEntry(document.getElementById('tabContent'));
  }

  function onCellChange(input) {
    const { animal, day, type } = input.dataset;
    const val = input.value === '' ? null : parseFloat(input.value);
    if (type === 'tw') {
      if (!localNecropsy[animal]) localNecropsy[animal] = {};
      localNecropsy[animal].tumorWeight = val;
    } else {
      if (!localMeasurements[animal]) localMeasurements[animal] = {};
      if (!localMeasurements[animal][day]) localMeasurements[animal][day] = {};
      localMeasurements[animal][day][type] = val;
    }
    setUnsaved(true);
  }

  function setUnsaved(flag) {
    unsaved = flag;
    const banner = document.getElementById('unsavedBannerLocal');
    if (banner) banner.classList.toggle('d-none', !flag);
  }

  async function saveData() {
    const studyId = studyData.study.studyId;
    const measurements = [];
    const necropsyRecords = [];

    Object.entries(localMeasurements).forEach(([animalId, dayMap]) => {
      Object.entries(dayMap).forEach(([day, vals]) => {
        measurements.push({
          measurementId: `${animalId}_${day}`,
          studyId, animalId, day: Number(day),
          tumorVolume: vals.tv ?? null,
          bodyWeight: vals.bw ?? null,
          date: null
        });
      });
    });

    Object.entries(localNecropsy).forEach(([animalId, vals]) => {
      necropsyRecords.push({
        necropsyId: `necropsy_${animalId}`,
        studyId, animalId,
        tumorWeight: vals.tumorWeight ?? null,
        date: null
      });
    });

    try {
      await App.withLoading(async () => {
        if (measurements.length) await api.bulkSaveMeasurements(studyId, measurements);
        if (necropsyRecords.length) await api.bulkSaveNecropsy(studyId, necropsyRecords);
      }, '저장 중...');
      setUnsaved(false);
      App.showToast('저장되었습니다.');
    } catch (e) {
      App.showToast('저장 실패: ' + e.message, 'error');
    }
  }

  function pasteData() {
    const text = prompt('엑셀에서 복사한 데이터를 붙여넣어 주세요:\n(첫 행: Day 번호들, 나머지 행: 개체별 값)');
    if (!text) return;
    const lines = text.trim().split(/\r\n|\n|\r/);
    const selGroups = (studyData.groups || []).filter(g => selectedGroupIds.has(g.groupId));
    if (!selGroups.length) return;
    const type = obsTab === 'bw' ? 'bw' : 'tv';

    const headerDays = lines[0].split('\t').map(Number).filter(n => !isNaN(n));
    const allAnimals = selGroups.flatMap(g => studyData.animals.filter(a => a.groupId === g.groupId));

    lines.slice(1).forEach((line, i) => {
      if (i >= allAnimals.length) return;
      const vals = line.split('\t');
      headerDays.forEach((day, di) => {
        const val = parseFloat(vals[di]);
        if (!isNaN(val)) {
          const animalId = allAnimals[i].animalId;
          if (!localMeasurements[animalId]) localMeasurements[animalId] = {};
          if (!localMeasurements[animalId][day]) localMeasurements[animalId][day] = {};
          localMeasurements[animalId][day][type] = val;
        }
      });
    });
    renderDataTable();
    setUnsaved(true);
    App.showToast('데이터가 적용되었습니다.');
  }

  // ---- Analysis tab ----

  function buildAnalysisGroupColorMap(groupMeta) {
    const map = {};
    const counters = { vehicle: 0, control: 0, SB: 0, comparator: 0 };
    const entries = Object.entries(groupMeta).sort((a, b) =>
      (a[1].groupNumber || 0) - (b[1].groupNumber || 0));
    entries.forEach(([name, meta]) => {
      const role = meta.groupRole || 'SB';
      const palette = ROLE_PALETTES[role] || ROLE_PALETTES.SB;
      const idx = counters[role] || 0;
      map[name] = palette[idx % palette.length];
      counters[role] = idx + 1;
    });
    return map;
  }

  function renderAnalysis(container) {
    const payload = api.buildAnalysisPayload(studyData);
    const groupNames = Object.keys(payload.groups);
    if (!groupNames.length) {
      container.innerHTML = '<div class="alert alert-info">분석할 데이터가 없습니다. 데이터 입력 탭에서 측정값을 입력하세요.</div>';
      return;
    }

    if (!analysisState.controlGroup) {
      analysisState.controlGroup = groupNames.find(g => payload.groupMeta[g]?.isControl) || groupNames[0];
    }
    if (!analysisState.visibleGroups.size) groupNames.forEach(g => analysisState.visibleGroups.add(g));

    container.innerHTML = `
      <div class="card p-3 mb-3">
        <div class="row g-2 align-items-end">
          <div class="col-md-3">
            <label class="form-label small">Control 군</label>
            <select class="form-select form-select-sm" id="a_controlGroup" onchange="StudyDetailView.runAnalysis()">
              ${groupNames.map(g => `<option value="${g}" ${analysisState.controlGroup === g ? 'selected' : ''}>${g}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small">Error Bar</label>
            <div class="btn-group btn-group-sm">
              <button class="btn ${analysisState.errorBarType==='sem' ? 'btn-dark' : 'btn-outline-dark'}" onclick="StudyDetailView.setErrorBar('sem')">SEM</button>
              <button class="btn ${analysisState.errorBarType==='sd' ? 'btn-dark' : 'btn-outline-dark'}" onclick="StudyDetailView.setErrorBar('sd')">SD</button>
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label small">Y축 범위 (Tumor Volume)</label>
            <div class="d-flex gap-1 align-items-center">
              <input type="number" class="form-control form-control-sm" id="yAxisMin" placeholder="min" value="${analysisState.yMin}" style="width:80px">
              <span class="small">~</span>
              <input type="number" class="form-control form-control-sm" id="yAxisMax" placeholder="max" value="${analysisState.yMax}" style="width:80px">
              <button class="btn btn-sm btn-outline-secondary" onclick="StudyDetailView.applyYScale()">적용</button>
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label small">CR threshold (mm³)</label>
            <input class="form-control form-control-sm" type="number" id="a_crThreshold" value="${analysisState.crThreshold}"
              onchange="analysisState.crThreshold=Number(this.value);StudyDetailView.runAnalysis();" style="width:120px">
          </div>
        </div>
        <div class="mt-2">
          <label class="form-label small">표시 군</label>
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-sm btn-sm btn-outline-secondary" onclick="StudyDetailView.toggleAllGroups(true,${JSON.stringify(groupNames)})">전체</button>
            <button class="btn btn-sm btn-sm btn-outline-secondary" onclick="StudyDetailView.toggleAllGroups(false,${JSON.stringify(groupNames)})">해제</button>
            ${groupNames.map(g => `
              <div class="form-check form-check-inline mb-0">
                <input class="form-check-input" type="checkbox" id="vg_${g.replace(/\W/g,'_')}"
                  ${analysisState.visibleGroups.has(g) ? 'checked' : ''}
                  onchange="StudyDetailView.toggleGroup('${g.replace(/'/g,"\\'")}',this.checked)">
                <label class="form-check-label small" for="vg_${g.replace(/\W/g,'_')}">${g}</label>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div id="analysisCharts"></div>
      <div id="efficacyTable" class="mt-3"></div>
      <div id="statsSection" class="mt-3"></div>`;

    runAnalysis();
  }

  function applyYScale() {
    analysisState.yMin = document.getElementById('yAxisMin')?.value || '';
    analysisState.yMax = document.getElementById('yAxisMax')?.value || '';
    runAnalysis();
  }

  function runAnalysis() {
    const payload = api.buildAnalysisPayload(studyData);
    analysisState.controlGroup = document.getElementById('a_controlGroup')?.value || analysisState.controlGroup;
    analysisState.yMin = document.getElementById('yAxisMin')?.value ?? analysisState.yMin;
    analysisState.yMax = document.getElementById('yAxisMax')?.value ?? analysisState.yMax;

    const visible = {};
    Object.keys(payload.groups).forEach(g => {
      if (analysisState.visibleGroups.has(g)) visible[g] = payload.groups[g];
    });

    const { stats, scaledStats } = Analysis.calcGroupStats(visible, payload.days);
    const metrics = Analysis.calculateGroupMetrics(payload.groups, analysisState.controlGroup, payload.days, analysisState.crThreshold);
    const bwStats = Analysis.calcBodyWeightStats(visible, payload.days);
    const necropsyStats = Analysis.calcNecropsyStats(visible);

    const aColorMap = buildAnalysisGroupColorMap(payload.groupMeta);
    renderCharts(visible, payload.days, stats, scaledStats, bwStats, necropsyStats, aColorMap);
    renderEfficacyTable(metrics, analysisState.controlGroup, aColorMap);
    renderStatsSection(payload.groups, payload.days);
  }

  function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  function renderCharts(groups, days, stats, scaledStats, bwStats, necropsyStats, colorMap) {
    const container = document.getElementById('analysisCharts');
    if (!container) return;
    const groupNames = Object.keys(groups);

    container.innerHTML = `
      <div class="card p-4 mb-3">
        <h6 class="fw-bold mb-3">In Vivo Efficacy Curves</h6>
        <div class="row">
          <div class="col-lg-6 mb-3">
            <h6 class="text-center text-secondary small">Average Tumor Volume (Absolute)</h6>
            <div style="height:300px"><canvas id="chartAbs"></canvas></div>
          </div>
          <div class="col-lg-6 mb-3">
            <h6 class="text-center text-secondary small">Scaled Average Change (%)</h6>
            <div style="height:300px"><canvas id="chartScaled"></canvas></div>
          </div>
          <div class="col-lg-6 mb-3">
            <h6 class="text-center text-secondary small">Individual Tumor Growth (Spider Plot)</h6>
            <div style="height:300px"><canvas id="chartSpider"></canvas></div>
          </div>
          <div class="col-lg-6 mb-3">
            <h6 class="text-center text-secondary small">Waterfall Plot (Best Response)</h6>
            <div style="height:300px"><canvas id="chartWaterfall"></canvas></div>
          </div>
          <div class="col-lg-6 mb-3">
            <h6 class="text-center text-secondary small">Body Weight (%BL)</h6>
            <div style="height:300px"><canvas id="chartBW"></canvas></div>
          </div>
          <div class="col-lg-6 mb-3">
            <h6 class="text-center text-secondary small">Tumor Weight at Necropsy (mg)</h6>
            <div style="height:300px"><canvas id="chartNecropsy"></canvas></div>
          </div>
        </div>
      </div>`;

    const ebKey = analysisState.errorBarType;
    const yMin = analysisState.yMin !== '' ? Number(analysisState.yMin) : undefined;
    const yMax = analysisState.yMax !== '' ? Number(analysisState.yMax) : undefined;

    destroyChart('abs');
    charts['abs'] = new Chart(document.getElementById('chartAbs'), {
      type: 'line',
      data: {
        labels: days.map(d => 'Day ' + d),
        datasets: groupNames.map(g => ({
          label: g,
          data: days.map(d => stats[g][d]?.mean ?? null),
          borderColor: colorMap[g] || '#888',
          backgroundColor: colorMap[g] || '#888',
          fill: false, tension: 0.2, pointRadius: 4,
          errorBars: days.reduce((acc, d) => {
            acc['Day ' + d] = { plus: stats[g][d]?.[ebKey] ?? 0, minus: stats[g][d]?.[ebKey] ?? 0 };
            return acc;
          }, {})
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { title: { display: true, text: 'Days' } },
          y: {
            title: { display: true, text: 'Volume (mm³)' },
            beginAtZero: yMin === undefined,
            ...(yMin !== undefined ? { min: yMin } : {}),
            ...(yMax !== undefined ? { max: yMax } : {})
          }
        }
      }
    });

    destroyChart('scaled');
    charts['scaled'] = new Chart(document.getElementById('chartScaled'), {
      type: 'line',
      data: {
        labels: days.map(d => 'Day ' + d),
        datasets: groupNames.map(g => ({
          label: g, data: days.map(d => scaledStats[g][d] ?? null),
          borderColor: colorMap[g] || '#888', backgroundColor: colorMap[g] || '#888',
          fill: false, tension: 0.2, pointRadius: 4
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { title: { display: true, text: 'Days' } },
          y: { suggestedMax: 100, suggestedMin: -100, title: { display: true, text: 'Scaled Change (%)' } }
        }
      }
    });

    destroyChart('spider');
    const spiderDatasets = [];
    groupNames.forEach(g => {
      groups[g].forEach((sub, si) => {
        spiderDatasets.push({
          label: si === 0 ? g : '',
          data: days.map(d => sub.vols[d] ?? null),
          borderColor: (colorMap[g] || '#888') + '88',
          backgroundColor: 'transparent',
          borderWidth: 1.5, pointRadius: 2, tension: 0.2
        });
      });
    });
    charts['spider'] = new Chart(document.getElementById('chartSpider'), {
      type: 'line',
      data: { labels: days.map(d => 'Day ' + d), datasets: spiderDatasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Days' } },
          y: { title: { display: true, text: 'Volume (mm³)' }, beginAtZero: true }
        }
      }
    });

    destroyChart('waterfall');
    const waterfallData = [];
    groupNames.forEach(g => {
      groups[g].forEach(sub => {
        const v0 = sub.vols[days[0]];
        if (!v0) return;
        const vols = Object.values(sub.vols).filter(v => v !== undefined);
        const minVol = Math.min(...vols);
        waterfallData.push({ label: sub.id, pct: ((minVol - v0) / v0) * 100, color: colorMap[g] || '#888' });
      });
    });
    waterfallData.sort((a, b) => a.pct - b.pct);
    charts['waterfall'] = new Chart(document.getElementById('chartWaterfall'), {
      type: 'bar',
      data: {
        labels: waterfallData.map(d => d.label),
        datasets: [{ data: waterfallData.map(d => d.pct), backgroundColor: waterfallData.map(d => d.color), borderColor: waterfallData.map(d => d.color), borderWidth: 1 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: { size: 9 } } },
          y: { title: { display: true, text: 'Best % Change from BL' } }
        }
      }
    });

    destroyChart('bw');
    charts['bw'] = new Chart(document.getElementById('chartBW'), {
      type: 'line',
      data: {
        labels: days.map(d => 'Day ' + d),
        datasets: groupNames.map(g => {
          const bl = bwStats[g][days[0]]?.mean;
          return {
            label: g,
            data: days.map(d => bwStats[g][d]?.mean != null && bl ? (bwStats[g][d].mean / bl) * 100 : null),
            borderColor: colorMap[g] || '#888', backgroundColor: colorMap[g] || '#888',
            fill: false, tension: 0.2, pointRadius: 4
          };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { x: { title: { display: true, text: 'Days' } }, y: { title: { display: true, text: 'BW (% of Day 1)' } } }
      }
    });

    destroyChart('necropsy');
    const nGroups = groupNames.filter(g => necropsyStats[g]?.n > 0);
    charts['necropsy'] = new Chart(document.getElementById('chartNecropsy'), {
      type: 'bar',
      data: {
        labels: nGroups,
        datasets: [{
          data: nGroups.map(g => necropsyStats[g]?.mean ?? 0),
          backgroundColor: nGroups.map(g => colorMap[g] || '#888'),
          borderColor: nGroups.map(g => colorMap[g] || '#888'),
          borderWidth: 1,
          errorBars: nGroups.reduce((acc, g) => {
            acc[g] = { plus: necropsyStats[g]?.[ebKey] ?? 0, minus: necropsyStats[g]?.[ebKey] ?? 0 };
            return acc;
          }, {})
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { title: { display: true, text: 'Tumor Weight (mg)' }, beginAtZero: true } }
      }
    });
  }

  function renderEfficacyTable(metrics, controlGroup, colorMap) {
    const container = document.getElementById('efficacyTable');
    if (!container) return;
    const rows = Object.entries(metrics).map(([grp, m]) => {
      const color = colorMap?.[grp] || '';
      const dot = color ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:5px"></span>` : '';
      return `<tr ${grp === controlGroup ? 'class="table-secondary"' : ''}>
        <td class="fw-bold">${dot}${grp} ${grp === controlGroup ? '<span class="badge bg-secondary">Control</span>' : ''}</td>
        <td>${m.N}</td>
        <td>${m.orr?.toFixed(1) ?? 'N/A'}</td>
        <td>${m.meanTTR?.toFixed(1) ?? 'N/A'}</td>
        <td>${m.medianDOR?.toFixed(1) ?? 'N/A'}</td>
        <td>${m.medianEFS2?.toFixed(1) ?? 'N/A'}</td>
        <td>${m.medianEFS4?.toFixed(1) ?? 'N/A'}</td>
        <td>${m.aucRatio != null ? m.aucRatio.toFixed(2) : 'N/A'}</td>
        <td>${m.tgi21_TC != null ? m.tgi21_TC.toFixed(1) : 'N/A'}</td>
        <td>${m.tgi21_Delta != null ? m.tgi21_Delta.toFixed(1) : 'N/A'}</td>
        <td>${m.tgi42_TC != null ? m.tgi42_TC.toFixed(1) : 'N/A'}</td>
        <td>${m.tgi42_Delta != null ? m.tgi42_Delta.toFixed(1) : 'N/A'}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="card p-3">
        <h6 class="fw-bold mb-3">Efficacy Summary</h6>
        <div class="table-responsive">
          <table class="table table-sm table-bordered table-hover text-center">
            <thead><tr>
              <th>Group</th><th>N</th><th>ORR(%)</th><th>TTR(d)</th><th>mDOR(d)</th>
              <th>mEFS2(d)</th><th>mEFS4(d)</th><th>AUC Ratio</th>
              <th title="T/C 방식">TGI D21 T/C</th><th title="ΔT/ΔC 방식">TGI D21 ΔT/ΔC</th>
              <th title="T/C 방식">TGI D42 T/C</th><th title="ΔT/ΔC 방식">TGI D42 ΔT/ΔC</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="small text-muted mt-1">TGI T/C: (1 - T/C) × 100 | TGI ΔT/ΔC: (ΔC - ΔT)/ΔC × 100</p>
      </div>`;
  }

  function renderStatsSection(groups, days) {
    const container = document.getElementById('statsSection');
    if (!container) return;
    const groupNames = Object.keys(groups);

    container.innerHTML = `
      <div class="card p-3">
        <h6 class="fw-bold mb-3">통계 분석</h6>
        <div class="row g-2 align-items-end mb-3">
          <div class="col-md-3">
            <label class="form-label small">Group A</label>
            <select class="form-select form-select-sm" id="s_grp1">
              ${groupNames.map(g => `<option value="${g}" ${g === analysisState.controlGroup ? 'selected' : ''}>${g}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small">Group B</label>
            <select class="form-select form-select-sm" id="s_grp2">
              ${groupNames.map((g, i) => `<option value="${g}" ${i === 1 ? 'selected' : ''}>${g}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small">통계 방법</label>
            <select class="form-select form-select-sm" id="s_method">
              <option value="welch">Welch t-test</option>
              <option value="dunnett">Dunnett's</option>
              <option value="mann-whitney">Mann-Whitney U</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small">기준일</label>
            <select class="form-select form-select-sm" id="s_dayMode" onchange="StudyDetailView.toggleDaySelect()">
              <option value="all">전체 timepoint</option>
              <option value="select">특정 Day 선택</option>
            </select>
          </div>
          <div class="col-md-1 d-flex align-items-end">
            <button class="btn btn-dark btn-sm w-100" onclick="StudyDetailView.runStats()">비교</button>
          </div>
        </div>
        <div id="daySelectContainer" class="mb-3 d-none">
          <div class="d-flex flex-wrap gap-2">
            ${days.map(d => `<div class="form-check form-check-inline">
              <input class="form-check-input" type="checkbox" id="sd_${d}" value="${d}" checked>
              <label class="form-check-label small" for="sd_${d}">Day ${d}</label>
            </div>`).join('')}
          </div>
        </div>
        <div id="statsResult"></div>
      </div>`;
  }

  function toggleDaySelect() {
    const mode = document.getElementById('s_dayMode')?.value;
    document.getElementById('daySelectContainer')?.classList.toggle('d-none', mode !== 'select');
  }

  function runStats() {
    const payload = api.buildAnalysisPayload(studyData);
    const grp1 = document.getElementById('s_grp1')?.value;
    const grp2 = document.getElementById('s_grp2')?.value;
    const method = document.getElementById('s_method')?.value || 'welch';
    const dayMode = document.getElementById('s_dayMode')?.value;
    if (!grp1 || !grp2 || grp1 === grp2) { App.showToast('서로 다른 군을 선택하세요.', 'error'); return; }

    let targetDays = payload.days;
    if (dayMode === 'select') {
      targetDays = payload.days.filter(d => document.getElementById('sd_' + d)?.checked);
    }

    const ebKey = analysisState.errorBarType;
    const rows = targetDays.map(d => {
      const r = Analysis.runStatisticsAtDay(payload.groups, d, grp1, grp2, method);
      const fmt = (m, s) => m != null ? `${m.toFixed(1)} ± ${s.toFixed(1)}` : 'N/A';
      const pFmt = r.pValue != null ? (r.pValue < 0.0001 ? '< 0.0001' : r.pValue.toFixed(4)) : 'N/A';
      return `<tr>
        <td class="fw-bold">Day ${d}</td>
        <td>${fmt(r.mean1, ebKey === 'sem' ? r.sem1 : r.sd1)} (n=${r.n1})</td>
        <td>${fmt(r.mean2, ebKey === 'sem' ? r.sem2 : r.sd2)} (n=${r.n2})</td>
        <td>${pFmt}</td>
        <td class="fw-bold ${r.sig !== 'ns' && r.sig !== '-' ? 'text-danger' : 'text-secondary'}">${r.sig}</td>
      </tr>`;
    }).join('');

    document.getElementById('statsResult').innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-bordered table-hover text-center">
          <thead><tr>
            <th>Day</th><th>${grp1} Mean ± ${ebKey.toUpperCase()}</th><th>${grp2} Mean ± ${ebKey.toUpperCase()}</th>
            <th>p-value</th><th>유의성</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="small text-muted">방법: ${method} | ns: p≥0.05 | *: p<0.05 | **: p<0.01 | ***: p<0.001</p>
      </div>`;
  }

  function setErrorBar(type) {
    analysisState.errorBarType = type;
    runAnalysis();
  }

  function toggleGroup(g, checked) {
    if (checked) analysisState.visibleGroups.add(g);
    else analysisState.visibleGroups.delete(g);
    runAnalysis();
  }

  function toggleAllGroups(checked, groupNames) {
    if (checked) groupNames.forEach(g => analysisState.visibleGroups.add(g));
    else analysisState.visibleGroups.clear();
    renderAnalysis(document.getElementById('tabContent'));
  }

  function renderExport(container) {
    container.innerHTML = `
      <div class="card p-4">
        <h6 class="fw-bold mb-3">데이터 내보내기</h6>
        <div class="d-flex flex-wrap gap-3">
          <button class="btn btn-outline-primary" onclick="StudyDetailView.exportCSV()">📄 CSV 내보내기</button>
          <button class="btn btn-outline-success" onclick="StudyDetailView.exportJSON()">💾 JSON 백업</button>
        </div>
        <p class="text-muted small mt-3">* PRISM (.pzfx) 내보내기는 향후 업데이트 예정입니다.</p>
      </div>`;
  }

  function exportCSV() {
    const { study, groups, animals, measurements } = studyData;
    const animalMap = {};
    animals.forEach(a => { animalMap[a.animalId] = a; });
    let csv = 'Subject_ID,Group,Day,Tumor_Volume_mm3,Body_Weight_g\n';
    measurements.forEach(m => {
      const a = animalMap[m.animalId];
      if (!a) return;
      const g = groups.find(gr => gr.groupId === a.groupId);
      csv += `${a.subjectId},${groupDisplayName(g) || ''},${m.day},${m.tumorVolume ?? ''},${m.bodyWeight ?? ''}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${study.studyNumber || 'study'}_data.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(studyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${studyData.study.studyNumber || 'study'}_backup.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return {
    render, switchTab, saveData, pasteData, onCellChange,
    toggleGroupData, selectAllGroups, switchObsTab,
    runAnalysis, runStats, setErrorBar, toggleGroup, toggleAllGroups,
    applyYScale, toggleDaySelect, exportCSV, exportJSON
  };
})();
