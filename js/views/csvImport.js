// CRO data conversion tool
const CSVImportView = (() => {
  let parsed = null;
  let columnMapOverride = {};

  async function render() {
    App.setActiveNav('/import');
    App.renderContent(`
      <h4 class="fw-bold mb-3">CRO 데이터 변환</h4>
      <p class="text-muted mb-3">CRO에서 받은 원본 데이터를 XenograftMaster 형식으로 변환합니다.</p>

      <div class="card p-4 mb-3">
        <h6 class="fw-bold mb-2">1단계: 원본 데이터 입력</h6>
        <div class="d-flex gap-2 mb-2">
          <button class="btn btn-sm btn-outline-primary" onclick="document.getElementById('csvFile').click()">파일 업로드</button>
          <input type="file" id="csvFile" accept=".csv,.tsv,.txt,.xls,.xlsx" style="display:none" onchange="CSVImportView.loadFile(this)">
          <span class="text-muted small align-self-center">또는 아래에 직접 붙여넣기</span>
        </div>
        <textarea id="csvInput" class="form-control font-monospace" rows="8" placeholder="CRO에서 받은 데이터를 여기에 붙여넣기 하세요 (CSV, TSV 모두 가능)..."></textarea>
        <div class="mt-2">
          <button class="btn btn-primary" onclick="CSVImportView.parse()">분석 시작</button>
        </div>
      </div>

      <div id="parseResult" style="display:none"></div>
      <div id="mappingSection" style="display:none"></div>
      <div id="previewSection" style="display:none"></div>
      <div id="saveSection" style="display:none"></div>
    `);
  }

  function loadFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('csvInput').value = e.target.result;
    };
    reader.readAsText(file);
  }

  function parse() {
    const text = document.getElementById('csvInput')?.value?.trim();
    if (!text) return App.showToast('데이터를 입력해주세요.', 'error');
    parsed = CSVParser.parse(text);
    if (parsed.error) return App.showToast(parsed.error, 'error');
    columnMapOverride = {};
    showParseResult();
    showMappingSection();
    showPreview();
    showSaveSection();
  }

  function showParseResult() {
    const el = document.getElementById('parseResult');
    el.style.display = 'block';
    el.innerHTML = `
      <div class="alert alert-success">
        파싱 완료: <strong>${parsed.records.length}개 개체</strong>,
        종양 부피 측정일: <strong>${parsed.tvDays.length}개</strong>,
        체중 측정일: <strong>${parsed.bwDays.length}개</strong>
        ${parsed.warnings.length ? `<br><span class="text-warning">⚠ 경고 ${parsed.warnings.length}건</span>` : ''}
      </div>
      ${parsed.warnings.length ? `<ul class="list-group mb-3">${parsed.warnings.map(w => `<li class="list-group-item list-group-item-warning small">${w}</li>`).join('')}</ul>` : ''}`;
  }

  function showMappingSection() {
    const el = document.getElementById('mappingSection');
    el.style.display = 'block';
    const types = ['subjectId', 'group', 'tumorVolume', 'bodyWeight', 'unknown'];
    el.innerHTML = `
      <div class="card p-4 mb-3">
        <h6 class="fw-bold mb-3">2단계: 컬럼 매핑 확인/수정</h6>
        <div class="table-responsive">
          <table class="table table-sm table-bordered">
            <thead><tr><th>원본 컬럼명</th><th>자동 인식 유형</th><th>Day 번호</th></tr></thead>
            <tbody>
              ${parsed.columnMap.map((c, i) => `<tr>
                <td class="fw-bold">${c.header}</td>
                <td>
                  <select class="form-select form-select-sm" data-col="${i}" onchange="CSVImportView.updateMapping(${i},this.value)">
                    ${types.map(t => `<option value="${t}" ${(columnMapOverride[i]?.type || c.type) === t ? 'selected' : ''}>${typeLabel(t)}</option>`).join('')}
                  </select>
                </td>
                <td>
                  ${(columnMapOverride[i]?.type || c.type) === 'tumorVolume' || (columnMapOverride[i]?.type || c.type) === 'bodyWeight'
                    ? `<input type="number" class="form-control form-control-sm" style="width:80px"
                        value="${columnMapOverride[i]?.day ?? c.day ?? ''}"
                        onchange="CSVImportView.updateMappingDay(${i},this.value)">`
                    : '-'}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <button class="btn btn-sm btn-outline-secondary mt-2" onclick="CSVImportView.showPreview()">매핑 적용</button>
      </div>`;
  }

  function typeLabel(t) {
    const map = { subjectId: '개체 ID', group: '군명', tumorVolume: '종양 부피 (TV)', bodyWeight: '체중 (BW)', unknown: '무시' };
    return map[t] || t;
  }

  function updateMapping(idx, type) {
    columnMapOverride[idx] = { ...parsed.columnMap[idx], ...(columnMapOverride[idx] || {}), type };
    showMappingSection();
    showPreview();
  }

  function updateMappingDay(idx, day) {
    columnMapOverride[idx] = { ...parsed.columnMap[idx], ...(columnMapOverride[idx] || {}), day: parseInt(day) };
  }

  function getEffectiveMap() {
    return parsed.columnMap.map((c, i) => ({ ...c, ...(columnMapOverride[i] || {}) }));
  }

  function getConvertedRecords() {
    const effectiveMap = getEffectiveMap();
    const subjectCol = effectiveMap.find(c => c.type === 'subjectId');
    const groupCol = effectiveMap.find(c => c.type === 'group');
    const tvCols = effectiveMap.filter(c => c.type === 'tumorVolume');
    const bwCols = effectiveMap.filter(c => c.type === 'bodyWeight');

    return parsed.records.map(r => ({
      subjectId: subjectCol ? r.subjectId : '',
      group: groupCol ? r.group : '',
      tumorVolumes: Object.fromEntries(tvCols.map(c => [c.day, r.tumorVolumes[c.day] ?? null]).filter(([, v]) => v != null)),
      bodyWeights: Object.fromEntries(bwCols.map(c => [c.day, r.bodyWeights[c.day] ?? null]).filter(([, v]) => v != null))
    }));
  }

  function showPreview() {
    const el = document.getElementById('previewSection');
    el.style.display = 'block';
    const records = getConvertedRecords();
    const allTVDays = [...new Set(records.flatMap(r => Object.keys(r.tumorVolumes)))].sort((a, b) => Number(a) - Number(b));

    el.innerHTML = `
      <div class="card p-4 mb-3">
        <h6 class="fw-bold mb-3">3단계: 변환 미리보기</h6>
        <div class="table-responsive">
          <table class="table table-sm table-bordered table-hover text-center">
            <thead><tr>
              <th>개체 ID</th><th>군명</th>
              ${allTVDays.map(d => `<th>TV Day ${d}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${records.map(r => `<tr>
                <td>${r.subjectId || '<em class="text-muted">없음</em>'}</td>
                <td>${r.group || '<em class="text-muted">없음</em>'}</td>
                ${allTVDays.map(d => {
                  const v = r.tumorVolumes[d];
                  const warn = v != null && (v < 0 || v > 10000);
                  return `<td ${warn ? 'class="table-warning"' : ''}>${v ?? ''}</td>`;
                }).join('')}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function showSaveSection() {
    const el = document.getElementById('saveSection');
    el.style.display = 'block';
    el.innerHTML = `
      <div class="card p-4">
        <h6 class="fw-bold mb-3">4단계: 저장</h6>
        <div class="row g-2 align-items-end">
          <div class="col-md-4">
            <label class="form-label small">저장 방식</label>
            <select class="form-select form-select-sm" id="saveMode" onchange="CSVImportView.toggleSaveMode()">
              <option value="new">새 시험으로 저장</option>
              <option value="existing">기존 시험에 추가</option>
            </select>
          </div>
          <div id="newStudyFields" class="col-md-5">
            <label class="form-label small">시험번호</label>
            <input class="form-control form-control-sm" id="newStudyNumber" placeholder="예: XG-2024-001">
          </div>
          <div id="existingStudyFields" class="col-md-5" style="display:none">
            <label class="form-label small">기존 시험 선택</label>
            <select class="form-select form-select-sm" id="existingStudySelect"></select>
          </div>
          <div class="col-md-3 d-flex align-items-end">
            <button class="btn btn-success w-100" onclick="CSVImportView.saveConverted()">저장</button>
          </div>
        </div>
      </div>`;
    loadExistingStudies();
  }

  async function loadExistingStudies() {
    try {
      const studies = await api.getStudies();
      const sel = document.getElementById('existingStudySelect');
      if (sel) sel.innerHTML = studies.map(s => `<option value="${s.studyId}">${s.studyNumber} (${s.modelName || '-'})</option>`).join('');
    } catch (e) {}
  }

  function toggleSaveMode() {
    const mode = document.getElementById('saveMode')?.value;
    document.getElementById('newStudyFields').style.display = mode === 'new' ? 'block' : 'none';
    document.getElementById('existingStudyFields').style.display = mode === 'existing' ? 'block' : 'none';
  }

  async function saveConverted() {
    const records = getConvertedRecords();
    const mode = document.getElementById('saveMode')?.value;
    let studyId;

    if (mode === 'new') {
      const studyNumber = document.getElementById('newStudyNumber')?.value?.trim();
      if (!studyNumber) return App.showToast('시험번호를 입력해주세요.', 'error');
      studyId = App.uuid();
      const study = {
        studyId, studyNumber, year: new Date().getFullYear(),
        classification: '기타', modelName: '', cro: '', dataSource: '자체',
        protocolLink: '', reportLink: '', competitorDrug: '', competitorSource: ''
      };
      await api.saveStudy(study);
    } else {
      studyId = document.getElementById('existingStudySelect')?.value;
      if (!studyId) return App.showToast('시험을 선택해주세요.', 'error');
    }

    // Group records by group name and create groups/animals/measurements
    const groupNames = [...new Set(records.map(r => r.group).filter(Boolean))];
    const allDays = [...new Set(records.flatMap(r => Object.keys(r.tumorVolumes).map(Number)))].sort((a, b) => a - b);

    const groups = groupNames.map((gn, i) => ({
      groupId: App.uuid(), studyId, groupNumber: i + 1, groupName: gn,
      animalCount: records.filter(r => r.group === gn).length,
      implantationDate: '', separationDate: '', day1Date: '', necropsyDate: '',
      measurementDays: allDays, isControl: i === 0
    }));

    const animals = [], measurements = [];
    groups.forEach(g => {
      records.filter(r => r.group === g.groupName).forEach((r, i) => {
        const animalId = App.uuid();
        animals.push({ animalId, studyId, groupId: g.groupId, subjectId: r.subjectId || `G${g.groupNumber}M${String(i + 1).padStart(2, '0')}`, sex: 'M' });
        Object.entries(r.tumorVolumes).forEach(([day, tv]) => {
          measurements.push({ measurementId: `${animalId}_${day}`, studyId, animalId, day: Number(day), tumorVolume: tv, bodyWeight: r.bodyWeights[day] ?? null, date: null });
        });
      });
    });

    try {
      await App.withLoading(async () => {
        await api.saveGroups(studyId, groups);
        await api.saveAnimals(studyId, animals);
        if (measurements.length) await api.bulkSaveMeasurements(studyId, measurements);
      }, '저장 중...');
      App.showToast('변환 완료! 시험 데이터가 저장되었습니다.');
      Router.navigate('/study/' + studyId);
    } catch (e) {
      App.showToast('저장 실패: ' + e.message, 'error');
    }
  }

  return { render, loadFile, parse, showPreview, updateMapping, updateMappingDay, toggleSaveMode, saveConverted };
})();
