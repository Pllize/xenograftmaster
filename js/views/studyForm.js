// Study create/edit form
const StudyFormView = (() => {
  let study = null;
  let groups = [];
  let isEdit = false;
  let cachedCodes = {};
  let substances = [];
  let selectedGroupIdx = -1;

  const GROUP_ROLES = [
    { value: 'vehicle',    label: 'Vehicle/Control', color: '#1a1a1a' },
    { value: 'SB',         label: 'SB',              color: '#0d6efd' },
    { value: 'comparator', label: 'Comparator',       color: '#dc3545' }
  ];

  async function render(params) {
    isEdit = params.id && params.id !== 'new';
    selectedGroupIdx = -1;
    App.setActiveNav('/data');

    try {
      const [codes, subs] = await App.withLoading(() =>
        Promise.all([api.getCodes(), api.getSubstances()]), '로딩 중...');
      substances = subs || [];
      ['modelName','strain','projectName','cro'].forEach(type => {
        cachedCodes[type] = (codes || []).filter(c => c.codeType === type).map(c => c.codeValue);
      });
    } catch(e) { substances = []; cachedCodes = {}; }

    if (isEdit) {
      try {
        const data = await App.withLoading(() => api.getStudyData(params.id), '데이터 로딩 중...');
        study = data.study;
        groups = (data.groups || []).map(g => ({
          ...g,
          measurementDays: Array.isArray(g.measurementDays) ? g.measurementDays : [],
          dosingSchedule: g.dosingSchedule ? (typeof g.dosingSchedule === 'string' ? (() => { try { return JSON.parse(g.dosingSchedule); } catch(e) { return null; } })() : g.dosingSchedule) : null
        }));
      } catch (e) {
        App.showToast('데이터 로딩 실패: ' + e.message, 'error');
        Router.navigate('/data'); return;
      }
    } else {
      study = {
        studyId: App.uuid(), studyNumber: '', year: new Date().getFullYear(),
        classification: 'CDX', modelName: '', strain: '', cro: '', projectName: '',
        protocolLink: '', reportLink: '', dataSource: 'SB',
        competitorDrug: '', competitorSource: '',
        implantationDate: '', separationDate: ''
      };
      groups = [];
    }

    App.renderContent(buildFormHTML());
    renderBasicInfo();
    renderGroupTable();
  }

  function dl(id, values) {
    return `<datalist id="${id}">${(values||[]).map(v => `<option value="${v}">`).join('')}</datalist>`;
  }

  function buildFormHTML() {
    return `
      <div class="d-flex align-items-center mb-4 gap-2">
        <button class="btn btn-sm btn-outline-secondary" onclick="Router.navigate('/data')">← 목록</button>
        <h4 class="fw-bold mb-0">${isEdit ? '시험 수정' : '새 시험 등록'}</h4>
      </div>

      <div class="form-section mb-4">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <div class="form-section-title mb-0">기본 정보</div>
          <div class="btn-group" role="group">
            <input type="radio" class="btn-check" name="dataSource" id="ds_sb" value="SB"
              ${study.dataSource !== '경쟁사' ? 'checked' : ''} onchange="StudyFormView.onSourceChange()">
            <label class="btn btn-outline-primary btn-sm" for="ds_sb">SB</label>
            <input type="radio" class="btn-check" name="dataSource" id="ds_comp" value="경쟁사"
              ${study.dataSource === '경쟁사' ? 'checked' : ''} onchange="StudyFormView.onSourceChange()">
            <label class="btn btn-outline-danger btn-sm" for="ds_comp">경쟁사</label>
          </div>
        </div>
        <div id="basicInfoSection"></div>
      </div>

      <div class="form-section mb-4">
        <div class="row g-2 mb-3">
          <div class="col-md-3">
            <label class="form-label small">이식일 (공통)</label>
            <input class="form-control form-control-sm" type="date" id="f_implantationDate" value="${study.implantationDate||''}">
          </div>
          <div class="col-md-3">
            <label class="form-label small">군분리일 (공통)</label>
            <input class="form-control form-control-sm" type="date" id="f_separationDate" value="${study.separationDate||''}">
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="form-section-title mb-0">군 구성</div>
          <button class="btn btn-sm btn-primary" onclick="StudyFormView.addGroup()">+ 군 추가</button>
        </div>
        <div id="groupTableContainer"></div>
        <div id="groupDetailPanel" class="mt-3"></div>
      </div>

      <div class="d-flex gap-2 justify-content-end pb-4">
        <button class="btn btn-outline-secondary px-4" onclick="Router.navigate('/data')">취소</button>
        <button class="btn btn-primary fw-bold px-5" onclick="StudyFormView.save()">저장</button>
      </div>
    `;
  }

  function buildBasicInfoHTML(isComp) {
    const substanceNames = substances.map(s => s.substanceName);
    if (!isComp) {
      return `
        <div class="row g-3">
          <div class="col-md-3">
            <label class="form-label small">시험번호 <span class="text-danger">*</span></label>
            <input class="form-control form-control-sm" id="f_studyNumber" value="${study.studyNumber||''}" placeholder="예: XG-2024-001">
          </div>
          <div class="col-md-2">
            <label class="form-label small">수행년도</label>
            <input class="form-control form-control-sm" type="number" id="f_year" value="${study.year||''}">
          </div>
          <div class="col-md-2">
            <label class="form-label small">분류</label>
            <select class="form-select form-select-sm" id="f_classification">
              ${['CDX','PDX','기타'].map(v => `<option value="${v}" ${study.classification===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small">모델명</label>
            <input class="form-control form-control-sm" id="f_modelName" value="${study.modelName||''}" placeholder="예: HCT116" list="dl_model">
            ${dl('dl_model', cachedCodes.modelName)}
          </div>
          <div class="col-md-2">
            <label class="form-label small">Strain</label>
            <input class="form-control form-control-sm" id="f_strain" value="${study.strain||''}" placeholder="예: BALB/c nude" list="dl_strain">
            ${dl('dl_strain', cachedCodes.strain)}
          </div>
          <div class="col-md-4">
            <label class="form-label small">과제명</label>
            <input class="form-control form-control-sm" id="f_projectName" value="${study.projectName||''}" list="dl_project">
            ${dl('dl_project', cachedCodes.projectName)}
          </div>
          <div class="col-md-3">
            <label class="form-label small">CRO</label>
            <input class="form-control form-control-sm" id="f_cro" value="${study.cro||''}" list="dl_cro">
            ${dl('dl_cro', cachedCodes.cro)}
          </div>
          <div class="col-md-5">
            <label class="form-label small">시험계획서 링크</label>
            <input class="form-control form-control-sm" id="f_protocolLink" value="${study.protocolLink||''}" placeholder="https://...">
          </div>
          <div class="col-md-5">
            <label class="form-label small">시험보고서 링크</label>
            <input class="form-control form-control-sm" id="f_reportLink" value="${study.reportLink||''}" placeholder="https://...">
          </div>
        </div>`;
    } else {
      return `
        <div class="row g-3">
          <div class="col-md-3">
            <label class="form-label small">시험번호 <span class="text-muted">(선택)</span></label>
            <input class="form-control form-control-sm" id="f_studyNumber" value="${study.studyNumber||''}" placeholder="비워두면 자동 생성">
          </div>
          <div class="col-md-2">
            <label class="form-label small">수행년도</label>
            <input class="form-control form-control-sm" type="number" id="f_year" value="${study.year||''}">
          </div>
          <div class="col-md-2">
            <label class="form-label small">분류</label>
            <select class="form-select form-select-sm" id="f_classification">
              ${['CDX','PDX','기타'].map(v => `<option value="${v}" ${study.classification===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small">모델명 <span class="text-danger">*</span></label>
            <input class="form-control form-control-sm" id="f_modelName" value="${study.modelName||''}" placeholder="예: HCT116" list="dl_model">
            ${dl('dl_model', cachedCodes.modelName)}
          </div>
          <div class="col-md-2">
            <label class="form-label small">Strain</label>
            <input class="form-control form-control-sm" id="f_strain" value="${study.strain||''}" placeholder="예: BALB/c nude" list="dl_strain">
            ${dl('dl_strain', cachedCodes.strain)}
          </div>
          <div class="col-md-4">
            <label class="form-label small">경쟁사 약물명 <span class="text-danger">*</span></label>
            <input class="form-control form-control-sm" id="f_competitorDrug" value="${study.competitorDrug||''}" list="dl_substance">
            ${dl('dl_substance', substanceNames)}
          </div>
          <div class="col-md-8">
            <label class="form-label small">출처 (논문/학회)</label>
            <input class="form-control form-control-sm" id="f_competitorSource" value="${study.competitorSource||''}" placeholder="예: AACR 2024, PMID:12345678">
          </div>
        </div>`;
    }
  }

  function renderBasicInfo() {
    const isComp = document.querySelector('input[name="dataSource"]:checked')?.value === '경쟁사';
    const el = document.getElementById('basicInfoSection');
    if (el) el.innerHTML = buildBasicInfoHTML(isComp);
  }

  function onSourceChange() {
    renderBasicInfo();
  }

  // ---- Group Table ----

  function addGroup() {
    const gNum = groups.length + 1;
    const defaultRole = gNum === 1 ? 'vehicle' : 'SB';
    groups.push({
      groupId: App.uuid(), studyId: study.studyId,
      groupNumber: gNum, substanceName: '', groupRole: defaultRole,
      animalCount: 6, sex: 'M',
      implantationDate: '', separationDate: '',
      day1Date: '', necropsyDate: '',
      measurementDays: App.suggestMeasurementDays(2, 42),
      dosingSchedule: null, isControl: gNum === 1, sameAsGroup1: false
    });
    selectedGroupIdx = groups.length - 1;
    renderGroupTable();
  }

  function removeGroup(idx) {
    groups.splice(idx, 1);
    groups.forEach((g, i) => { g.groupNumber = i + 1; });
    if (selectedGroupIdx >= groups.length) selectedGroupIdx = groups.length - 1;
    renderGroupTable();
  }

  function selectGroup(idx) {
    selectedGroupIdx = selectedGroupIdx === idx ? -1 : idx;
    renderGroupTable();
  }

  function renderGroupTable() {
    const container = document.getElementById('groupTableContainer');
    const panel = document.getElementById('groupDetailPanel');
    if (!container) return;

    if (!groups.length) {
      container.innerHTML = '<p class="text-muted small">군이 없습니다. 위 버튼으로 추가하세요.</p>';
      if (panel) panel.innerHTML = '';
      return;
    }

    const substanceNames = substances.map(s => s.substanceName);

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-bordered table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th style="width:40px">#</th>
              <th>투여물질명</th>
              <th style="width:160px">역할</th>
              <th style="width:70px">동물수</th>
              <th style="width:80px">성별</th>
              <th style="width:130px">Day 1</th>
              <th style="width:60px"></th>
            </tr>
          </thead>
          <tbody>
            ${groups.map((g, idx) => {
              const role = GROUP_ROLES.find(r => r.value === g.groupRole) || GROUP_ROLES[1];
              const isSelected = selectedGroupIdx === idx;
              return `
                <tr class="${isSelected ? 'table-primary' : ''}" style="cursor:pointer" onclick="StudyFormView.selectGroup(${idx})">
                  <td class="text-center fw-bold">${g.groupNumber}</td>
                  <td>
                    <input class="form-control form-control-sm border-0 bg-transparent" value="${g.substanceName||''}"
                      list="dl_sub_${idx}"
                      onclick="event.stopPropagation()"
                      oninput="StudyFormView.updateGroupField(${idx},'substanceName',this.value)">
                    <datalist id="dl_sub_${idx}">${substanceNames.map(n=>`<option value="${n}">`).join('')}</datalist>
                  </td>
                  <td>
                    <select class="form-select form-select-sm border-0 bg-transparent fw-semibold"
                      style="color:${role.color}"
                      onclick="event.stopPropagation()"
                      onchange="StudyFormView.setGroupRole(${idx},this.value)">
                      ${GROUP_ROLES.map(r => `<option value="${r.value}" style="color:${r.color}" ${g.groupRole===r.value?'selected':''}>${r.label}</option>`).join('')}
                    </select>
                  </td>
                  <td>
                    <input class="form-control form-control-sm border-0 bg-transparent text-center" type="number" min="1" value="${g.animalCount}"
                      onclick="event.stopPropagation()"
                      oninput="StudyFormView.updateGroupField(${idx},'animalCount',parseInt(this.value)||1)">
                  </td>
                  <td>
                    <select class="form-select form-select-sm border-0 bg-transparent"
                      onclick="event.stopPropagation()"
                      onchange="StudyFormView.updateGroupField(${idx},'sex',this.value)">
                      <option value="M" ${g.sex!=='F'?'selected':''}>M</option>
                      <option value="F" ${g.sex==='F'?'selected':''}>F</option>
                    </select>
                  </td>
                  <td>
                    <input class="form-control form-control-sm border-0 bg-transparent" type="date" value="${g.day1Date||''}"
                      onclick="event.stopPropagation()"
                      oninput="StudyFormView.updateGroupField(${idx},'day1Date',this.value)">
                  </td>
                  <td class="text-center">
                    <button class="btn btn-sm btn-link text-danger p-0" onclick="event.stopPropagation();StudyFormView.removeGroup(${idx})">×</button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    if (panel) {
      panel.innerHTML = selectedGroupIdx >= 0 && selectedGroupIdx < groups.length
        ? renderGroupDetailPanel(groups[selectedGroupIdx], selectedGroupIdx)
        : '';
    }
  }

  function renderGroupDetailPanel(g, idx) {
    const dosingSpecific = g.dosingSchedule?.specificDays || '';
    return `
      <div class="card border-secondary">
        <div class="card-header d-flex justify-content-between align-items-center py-2">
          <span class="fw-semibold">군 ${g.groupNumber} 상세 설정</span>
          <div class="d-flex gap-2">
            ${idx > 0 ? `<button class="btn btn-sm btn-outline-secondary py-0" onclick="StudyFormView.copyFromGroup1(${idx})">군 1과 동일</button>` : ''}
            <button class="btn btn-sm btn-outline-secondary py-0" onclick="StudyFormView.selectGroup(${idx})">닫기</button>
          </div>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-3">
              <label class="form-label small">부검일</label>
              <input class="form-control form-control-sm" type="date" value="${g.necropsyDate||''}"
                oninput="StudyFormView.updateGroupField(${idx},'necropsyDate',this.value)">
            </div>
            <div class="col-12">
              <label class="form-label small d-flex justify-content-between align-items-center">
                <span>측정일 (Day)</span>
                <span class="d-flex gap-2">
                  <button class="btn btn-link btn-sm p-0" onclick="StudyFormView.suggestDays(${idx},2)">주2회(~D42)</button>
                  <button class="btn btn-link btn-sm p-0" onclick="StudyFormView.suggestDays(${idx},3)">주3회(~D42)</button>
                </span>
              </label>
              <div class="days-chips-container" id="daysChips_${idx}">
                ${renderDayChips(g.measurementDays, idx)}
                <input type="number" class="form-control form-control-sm day-add-input" style="width:70px"
                  placeholder="+Day" id="dayInput_${idx}"
                  onkeydown="if(event.key==='Enter'){StudyFormView.addDay(${idx});event.preventDefault();}">
              </div>
            </div>
            <div class="col-12">
              <label class="form-label small">반복 투여 스케줄</label>
              <div class="d-flex flex-wrap gap-2 align-items-center">
                <div class="input-group input-group-sm" style="width:auto">
                  <span class="input-group-text">간격</span>
                  <input type="number" class="form-control" style="width:60px"
                    value="${g.dosingSchedule?.interval||''}" placeholder="7"
                    oninput="StudyFormView.updateDosingSchedule(${idx},'interval',this.value)">
                  <span class="input-group-text">일</span>
                </div>
                <div class="input-group input-group-sm" style="width:auto">
                  <span class="input-group-text">총</span>
                  <input type="number" class="form-control" style="width:60px"
                    value="${g.dosingSchedule?.totalDoses||''}" placeholder="4"
                    oninput="StudyFormView.updateDosingSchedule(${idx},'totalDoses',this.value)">
                  <span class="input-group-text">회</span>
                </div>
                <span class="text-muted small">또는 직접 지정 (측정일과 연동):</span>
                <input class="form-control form-control-sm" style="width:220px"
                  placeholder="Day 1,8,15,22 (쉼표 구분)"
                  value="${dosingSpecific}"
                  oninput="StudyFormView.updateDosingSchedule(${idx},'specificDays',this.value)">
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderDayChips(days, idx) {
    return (days||[]).map((d, di) =>
      `<span class="day-chip">Day ${d}<button onclick="StudyFormView.removeDay(${idx},${di})">×</button></span>`
    ).join('');
  }

  function updateGroupField(idx, field, value) {
    groups[idx][field] = value;
  }

  function setGroupRole(idx, role) {
    groups[idx].groupRole = role;
    groups[idx].isControl = role === 'vehicle';
    renderGroupTable();
  }

  function updateDosingSchedule(idx, field, value) {
    if (!groups[idx].dosingSchedule) groups[idx].dosingSchedule = {};
    if (field === 'interval' || field === 'totalDoses') {
      groups[idx].dosingSchedule[field] = parseInt(value) || null;
    } else if (field === 'specificDays') {
      groups[idx].dosingSchedule.specificDays = value;
      // Merge specific days into measurementDays
      const parsed = value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0);
      parsed.forEach(d => {
        if (!groups[idx].measurementDays.includes(d)) groups[idx].measurementDays.push(d);
      });
      groups[idx].measurementDays.sort((a, b) => a - b);
      // Re-render chips only
      const container = document.getElementById(`daysChips_${idx}`);
      if (container) {
        const addInput = container.querySelector('.day-add-input');
        container.innerHTML = renderDayChips(groups[idx].measurementDays, idx);
        if (addInput) container.appendChild(addInput);
      }
    }
  }

  function suggestDays(idx, freq) {
    const g = groups[idx];
    let totalDays = 42;
    if (g.day1Date && g.necropsyDate) {
      const d1 = new Date(g.day1Date), dn = new Date(g.necropsyDate);
      totalDays = Math.round((dn - d1) / 86400000) + 1;
    }
    groups[idx].measurementDays = App.suggestMeasurementDays(freq, totalDays);
    renderGroupTable();
  }

  function addDay(idx) {
    const input = document.getElementById(`dayInput_${idx}`);
    const val = parseInt(input.value);
    if (isNaN(val) || val < 0) return;
    if (!groups[idx].measurementDays.includes(val)) {
      groups[idx].measurementDays.push(val);
      groups[idx].measurementDays.sort((a, b) => a - b);
    }
    input.value = '';
    const container = document.getElementById(`daysChips_${idx}`);
    if (container) {
      const addInput = container.querySelector('.day-add-input');
      container.innerHTML = renderDayChips(groups[idx].measurementDays, idx);
      if (addInput) container.appendChild(addInput);
    }
  }

  function removeDay(idx, dayIdx) {
    groups[idx].measurementDays.splice(dayIdx, 1);
    const container = document.getElementById(`daysChips_${idx}`);
    if (container) {
      const addInput = container.querySelector('.day-add-input');
      container.innerHTML = renderDayChips(groups[idx].measurementDays, idx);
      if (addInput) container.appendChild(addInput);
    }
  }

  function copyFromGroup1(idx) {
    if (idx === 0 || !groups[0]) return;
    const g0 = groups[0];
    groups[idx] = {
      ...groups[idx],
      necropsyDate: g0.necropsyDate,
      measurementDays: [...(g0.measurementDays||[])],
      dosingSchedule: g0.dosingSchedule ? { ...g0.dosingSchedule } : null,
      sameAsGroup1: true
    };
    renderGroupTable();
    App.showToast(`군 ${groups[idx].groupNumber}: 군 1 설정이 복사되었습니다.`);
  }

  // ---- Save ----

  function collectBasicInfo() {
    const isComp = document.querySelector('input[name="dataSource"]:checked')?.value === '경쟁사';
    study.dataSource = isComp ? '경쟁사' : 'SB';
    study.year = parseInt(document.getElementById('f_year')?.value) || study.year;
    study.classification = document.getElementById('f_classification')?.value || study.classification;
    study.modelName = document.getElementById('f_modelName')?.value || '';
    study.strain = document.getElementById('f_strain')?.value || '';

    if (isComp) {
      study.competitorDrug = document.getElementById('f_competitorDrug')?.value || '';
      study.competitorSource = document.getElementById('f_competitorSource')?.value || '';
      let sNum = document.getElementById('f_studyNumber')?.value?.trim() || '';
      if (!sNum) {
        sNum = [study.modelName, study.competitorDrug, study.year].filter(Boolean).join('_');
      }
      study.studyNumber = sNum;
      study.projectName = '';
      study.cro = '';
      study.protocolLink = '';
      study.reportLink = '';
    } else {
      study.studyNumber = document.getElementById('f_studyNumber')?.value?.trim() || '';
      study.projectName = document.getElementById('f_projectName')?.value || '';
      study.cro = document.getElementById('f_cro')?.value || '';
      study.protocolLink = document.getElementById('f_protocolLink')?.value || '';
      study.reportLink = document.getElementById('f_reportLink')?.value || '';
      study.competitorDrug = '';
      study.competitorSource = '';
    }

    // Common dates applied to all groups
    study.implantationDate = document.getElementById('f_implantationDate')?.value || '';
    study.separationDate = document.getElementById('f_separationDate')?.value || '';
    groups.forEach(g => {
      g.implantationDate = study.implantationDate;
      g.separationDate = study.separationDate;
    });
  }

  async function save() {
    collectBasicInfo();

    const isComp = study.dataSource === '경쟁사';
    if (!isComp && !study.studyNumber) return App.showToast('시험번호를 입력해주세요.', 'error');
    if (isComp && !study.modelName) return App.showToast('모델명을 입력해주세요.', 'error');

    groups.forEach(g => {
      if (g.dosingSchedule) g.dosingSchedule = JSON.stringify(g.dosingSchedule);
      g.isControl = g.groupRole === 'vehicle';
    });

    try {
      await App.withLoading(async () => {
        await api.saveStudy(study);
        await api.saveGroups(study.studyId, groups);

        if (!isEdit) {
          const allAnimals = [];
          groups.forEach(g => {
            for (let i = 1; i <= (g.animalCount||1); i++) {
              allAnimals.push({
                animalId: App.uuid(), studyId: study.studyId, groupId: g.groupId,
                subjectId: `G${g.groupNumber}M${String(i).padStart(2,'0')}`,
                randomId: Math.random().toString(36).substring(2,8).toUpperCase(),
                animalNumber: '', studyAnimalId: '', sex: g.sex || 'M'
              });
            }
          });
          await api.saveAnimals(study.studyId, allAnimals);
        }

        // Auto-save new codes
        const codeUpdates = [
          { type: 'modelName', val: study.modelName },
          { type: 'strain', val: study.strain },
          { type: 'projectName', val: study.projectName },
          { type: 'cro', val: study.cro }
        ];
        for (const { type, val } of codeUpdates) {
          if (val && !cachedCodes[type]?.includes(val)) {
            await api.saveCode({ codeType: type, codeValue: val, codeLabel: val, sortOrder: 0 });
          }
        }
      }, '저장 중...');

      App.showToast('저장되었습니다.');
      Router.navigate('/study/' + study.studyId);
    } catch (e) {
      // Restore dosingSchedule if save failed
      groups.forEach(g => {
        if (typeof g.dosingSchedule === 'string') {
          try { g.dosingSchedule = JSON.parse(g.dosingSchedule); } catch(_) { g.dosingSchedule = null; }
        }
      });
      App.showToast('저장 실패: ' + e.message, 'error');
    }
  }

  return {
    render, onSourceChange, addGroup, removeGroup, selectGroup,
    updateGroupField, setGroupRole, copyFromGroup1,
    updateDosingSchedule, suggestDays, addDay, removeDay, save
  };
})();
