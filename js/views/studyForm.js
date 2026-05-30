// Study create/edit form
const StudyFormView = (() => {
  let study = null;
  let groups = [];
  let isEdit = false;
  let cachedCodes = {};   // { modelName: [...], strain: [...], projectName: [...], cro: [...] }
  let substances = [];

  const GROUP_ROLES = [
    { value: 'vehicle',    label: 'Vehicle',    color: '#1a1a1a' },
    { value: 'control',   label: 'Control',    color: '#555555' },
    { value: 'SB',        label: 'SB',         color: '#0d6efd' },
    { value: 'comparator',label: 'Comparator', color: '#dc3545' }
  ];

  async function render(params) {
    isEdit = params.id && params.id !== 'new';
    App.setActiveNav('/data');

    // Load codes & substances in parallel
    try {
      const [codes, subs] = await App.withLoading(() =>
        Promise.all([api.getCodes(), api.getSubstances()]), '로딩 중...');
      substances = subs || [];
      ['modelName','strain','projectName','cro'].forEach(type => {
        cachedCodes[type] = (codes || []).filter(c => c.codeType === type).map(c => c.codeValue);
      });
      // Also gather unique values from existing studies
    } catch(e) { substances = []; cachedCodes = {}; }

    if (isEdit) {
      try {
        const data = await App.withLoading(() => api.getStudyData(params.id), '데이터 로딩 중...');
        study = data.study;
        groups = (data.groups || []).map(g => ({
          ...g,
          measurementDays: Array.isArray(g.measurementDays) ? g.measurementDays : [],
          dosingSchedule: g.dosingSchedule ? (typeof g.dosingSchedule === 'string' ? JSON.parse(g.dosingSchedule) : g.dosingSchedule) : null
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
        competitorDrug: '', competitorSource: ''
      };
      groups = [];
    }

    App.renderContent(buildFormHTML());
    renderGroups();
    updateSourceFields();
  }

  function datalist(id, values) {
    return `<datalist id="${id}">${(values||[]).map(v => `<option value="${v}">`).join('')}</datalist>`;
  }

  function buildFormHTML() {
    const substanceNames = substances.map(s => s.substanceName);
    return `
      <div class="d-flex align-items-center mb-4 gap-2">
        <button class="btn btn-sm btn-outline-secondary" onclick="Router.navigate('/data')">← 목록</button>
        <h4 class="fw-bold mb-0">${isEdit ? '시험 수정' : '새 시험 등록'}</h4>
      </div>

      <div class="form-section mb-4">
        <div class="form-section-title">기본 정보</div>
        <div class="row g-3">
          <div class="col-md-3">
            <label class="form-label">시험번호 <span class="text-danger">*</span></label>
            <input class="form-control" id="f_studyNumber" value="${study.studyNumber || ''}" placeholder="예: XG-2024-001">
          </div>
          <div class="col-md-2">
            <label class="form-label">수행년도</label>
            <input class="form-control" type="number" id="f_year" value="${study.year || ''}">
          </div>
          <div class="col-md-2">
            <label class="form-label">분류</label>
            <select class="form-select" id="f_classification">
              ${['CDX','PDX','기타'].map(v => `<option value="${v}" ${study.classification===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">모델명</label>
            <input class="form-control" id="f_modelName" value="${study.modelName||''}" placeholder="예: HCT116" list="dl_model">
            ${datalist('dl_model', cachedCodes.modelName)}
          </div>
          <div class="col-md-2">
            <label class="form-label">Strain</label>
            <input class="form-control" id="f_strain" value="${study.strain||''}" placeholder="예: BALB/c nude" list="dl_strain">
            ${datalist('dl_strain', cachedCodes.strain)}
          </div>
          <div class="col-md-3">
            <label class="form-label">과제명</label>
            <input class="form-control" id="f_projectName" value="${study.projectName||''}" placeholder="예: SB-001 IND" list="dl_project">
            ${datalist('dl_project', cachedCodes.projectName)}
          </div>
          <div class="col-md-3">
            <label class="form-label">CRO</label>
            <input class="form-control" id="f_cro" value="${study.cro||''}" list="dl_cro">
            ${datalist('dl_cro', cachedCodes.cro)}
          </div>
          <div class="col-md-3">
            <label class="form-label">데이터 출처</label>
            <div class="btn-group w-100" role="group">
              <input type="radio" class="btn-check" name="dataSource" id="ds_sb" value="SB" ${study.dataSource!=='경쟁사'?'checked':''} onchange="StudyFormView.updateSourceFields()">
              <label class="btn btn-outline-primary" for="ds_sb">SB</label>
              <input type="radio" class="btn-check" name="dataSource" id="ds_comp" value="경쟁사" ${study.dataSource==='경쟁사'?'checked':''} onchange="StudyFormView.updateSourceFields()">
              <label class="btn btn-outline-danger" for="ds_comp">경쟁사</label>
            </div>
          </div>
          <div id="competitorFields" class="col-12 row g-3 mt-0" style="display:none">
            <div class="col-md-4">
              <label class="form-label">경쟁사 약물명</label>
              <input class="form-control" id="f_competitorDrug" value="${study.competitorDrug||''}" list="dl_substance">
              ${datalist('dl_substance', substanceNames)}
            </div>
            <div class="col-md-8">
              <label class="form-label">출처 (논문/학회)</label>
              <input class="form-control" id="f_competitorSource" value="${study.competitorSource||''}" placeholder="예: AACR 2024, PMID:12345678">
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label">시험계획서 (EFSS 링크)</label>
            <input class="form-control" id="f_protocolLink" value="${study.protocolLink||''}" placeholder="https://...">
          </div>
          <div class="col-md-6">
            <label class="form-label">시험보고서 (EFSS 링크)</label>
            <input class="form-control" id="f_reportLink" value="${study.reportLink||''}" placeholder="https://...">
          </div>
        </div>
      </div>

      <div class="form-section mb-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="form-section-title mb-0">군 구성</div>
          <button class="btn btn-sm btn-primary" onclick="StudyFormView.addGroup()">+ 군 추가</button>
        </div>
        <div id="groupsContainer"></div>
      </div>

      <div class="d-flex gap-2 justify-content-end pb-4">
        <button class="btn btn-outline-secondary px-4" onclick="Router.navigate('/data')">취소</button>
        <button class="btn btn-primary fw-bold px-5" onclick="StudyFormView.save()">저장</button>
      </div>
    `;
  }

  function updateSourceFields() {
    const isComp = document.querySelector('input[name="dataSource"]:checked')?.value === '경쟁사';
    const el = document.getElementById('competitorFields');
    if (el) el.style.display = isComp ? 'flex' : 'none';
  }

  function getGroupColor(role) {
    return GROUP_ROLES.find(r => r.value === role)?.color || '#6c757d';
  }

  function addGroup() {
    const gNum = groups.length + 1;
    // Default role: 1st group = vehicle, rest = SB
    const defaultRole = gNum === 1 ? 'vehicle' : 'SB';
    groups.push({
      groupId: App.uuid(), studyId: study.studyId,
      groupNumber: gNum, substanceName: '', groupRole: defaultRole,
      animalCount: 6, implantationDate: '', separationDate: '',
      day1Date: '', necropsyDate: '',
      measurementDays: App.suggestMeasurementDays(2, 42),
      dosingSchedule: null, isControl: gNum === 1, sameAsGroup1: false
    });
    renderGroups();
  }

  function removeGroup(idx) {
    groups.splice(idx, 1);
    groups.forEach((g, i) => { g.groupNumber = i + 1; });
    renderGroups();
  }

  function copyFromGroup1(idx) {
    if (idx === 0 || !groups[0]) return;
    const g0 = groups[0];
    groups[idx] = {
      ...groups[idx],
      implantationDate: g0.implantationDate,
      separationDate: g0.separationDate,
      day1Date: g0.day1Date,
      necropsyDate: g0.necropsyDate,
      measurementDays: [...g0.measurementDays],
      dosingSchedule: g0.dosingSchedule ? { ...g0.dosingSchedule } : null,
      sameAsGroup1: true
    };
    renderGroups();
    App.showToast(`군 ${groups[idx].groupNumber}: 군 1 설정이 복사되었습니다.`);
  }

  function renderGroups() {
    const container = document.getElementById('groupsContainer');
    if (!container) return;
    if (!groups.length) {
      container.innerHTML = '<p class="text-muted small">군이 없습니다. 위 버튼으로 추가하세요.</p>';
      return;
    }
    const substanceNames = substances.map(s => s.substanceName);
    container.innerHTML = groups.map((g, idx) => {
      const roleColor = getGroupColor(g.groupRole);
      return `
      <div class="group-card mb-3" style="border-left: 4px solid ${roleColor}">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="d-flex align-items-center gap-2">
            <span class="fw-bold" style="color:${roleColor}">군 ${g.groupNumber}</span>
            <span class="badge" style="background:${roleColor}">${GROUP_ROLES.find(r=>r.value===g.groupRole)?.label||g.groupRole}</span>
          </div>
          <div class="d-flex gap-2">
            ${idx > 0 ? `<button class="btn btn-xs btn-sm btn-outline-secondary" onclick="StudyFormView.copyFromGroup1(${idx})">군 1과 동일</button>` : ''}
            <button class="btn btn-xs btn-sm btn-outline-danger" onclick="StudyFormView.removeGroup(${idx})">삭제</button>
          </div>
        </div>
        <div class="row g-2">
          <div class="col-md-4">
            <label class="form-label small">투여물질명</label>
            <input class="form-control form-control-sm" value="${g.substanceName||''}"
              list="dl_sub_${idx}"
              oninput="StudyFormView.updateGroupField(${idx},'substanceName',this.value)">
            <datalist id="dl_sub_${idx}">${substanceNames.map(n=>`<option value="${n}">`).join('')}</datalist>
          </div>
          <div class="col-md-4">
            <label class="form-label small">역할 (Role)</label>
            <div class="d-flex gap-1 flex-wrap">
              ${GROUP_ROLES.map(r => `
                <div class="form-check form-check-inline mb-0">
                  <input class="form-check-input" type="radio" name="role_${idx}" id="role_${idx}_${r.value}" value="${r.value}"
                    ${g.groupRole===r.value?'checked':''}
                    onchange="StudyFormView.setGroupRole(${idx},'${r.value}')">
                  <label class="form-check-label small" for="role_${idx}_${r.value}" style="color:${r.color};font-weight:600">${r.label}</label>
                </div>`).join('')}
            </div>
          </div>
          <div class="col-md-2">
            <label class="form-label small">동물수</label>
            <input class="form-control form-control-sm" type="number" min="1" value="${g.animalCount}"
              oninput="StudyFormView.updateGroupField(${idx},'animalCount',parseInt(this.value)||1)">
          </div>
          <div class="col-md-2">
            <label class="form-label small">성별</label>
            <select class="form-select form-select-sm" onchange="StudyFormView.updateGroupField(${idx},'sex',this.value)">
              <option value="M" ${g.sex==='M'?'selected':''}>수컷(M)</option>
              <option value="F" ${g.sex==='F'?'selected':''}>암컷(F)</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small">이식일</label>
            <input class="form-control form-control-sm" type="date" value="${g.implantationDate||''}"
              oninput="StudyFormView.updateGroupField(${idx},'implantationDate',this.value)">
          </div>
          <div class="col-md-3">
            <label class="form-label small">군분리일</label>
            <input class="form-control form-control-sm" type="date" value="${g.separationDate||''}"
              oninput="StudyFormView.updateGroupField(${idx},'separationDate',this.value)">
          </div>
          <div class="col-md-3">
            <label class="form-label small">Day 1 (첫투여일)</label>
            <input class="form-control form-control-sm" type="date" value="${g.day1Date||''}"
              oninput="StudyFormView.onDay1Change(${idx},this.value)">
          </div>
          <div class="col-md-3">
            <label class="form-label small">부검일</label>
            <input class="form-control form-control-sm" type="date" value="${g.necropsyDate||''}"
              oninput="StudyFormView.updateGroupField(${idx},'necropsyDate',this.value)">
          </div>

          <div class="col-12">
            <label class="form-label small">반복 투여 스케줄</label>
            <div class="row g-2">
              <div class="col-auto">
                <div class="input-group input-group-sm">
                  <span class="input-group-text">간격</span>
                  <input type="number" class="form-control" style="width:60px"
                    value="${g.dosingSchedule?.interval||''}" placeholder="7"
                    oninput="StudyFormView.updateDosingSchedule(${idx},'interval',this.value)">
                  <span class="input-group-text">일</span>
                </div>
              </div>
              <div class="col-auto">
                <div class="input-group input-group-sm">
                  <span class="input-group-text">총</span>
                  <input type="number" class="form-control" style="width:60px"
                    value="${g.dosingSchedule?.totalDoses||''}" placeholder="4"
                    oninput="StudyFormView.updateDosingSchedule(${idx},'totalDoses',this.value)">
                  <span class="input-group-text">회</span>
                </div>
              </div>
              <div class="col-auto d-flex align-items-center">
                <span class="text-muted small">또는 직접 지정:</span>
              </div>
              <div class="col-auto">
                <input class="form-control form-control-sm" style="width:200px"
                  placeholder="Day 1,8,15,22 (쉼표 구분)"
                  value="${g.dosingSchedule?.specificDays||''}"
                  oninput="StudyFormView.updateDosingSchedule(${idx},'specificDays',this.value)">
              </div>
            </div>
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
        </div>
      </div>`;
    }).join('');
  }

  function renderDayChips(days, idx) {
    return days.map((d, di) =>
      `<span class="day-chip">Day ${d}<button onclick="StudyFormView.removeDay(${idx},${di})">×</button></span>`
    ).join('');
  }

  function updateGroupField(idx, field, value) { groups[idx][field] = value; }

  function setGroupRole(idx, role) {
    groups[idx].groupRole = role;
    renderGroups();
  }

  function updateDosingSchedule(idx, field, value) {
    if (!groups[idx].dosingSchedule) groups[idx].dosingSchedule = {};
    groups[idx].dosingSchedule[field] = field === 'interval' || field === 'totalDoses' ? parseInt(value)||null : value;
  }

  function onDay1Change(idx, value) {
    groups[idx].day1Date = value;
    if (value && !groups[idx].measurementDays.length) {
      groups[idx].measurementDays = App.suggestMeasurementDays(2, 42);
      renderGroups();
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
    renderGroups();
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
    const addInput = container.querySelector('.day-add-input');
    container.innerHTML = renderDayChips(groups[idx].measurementDays, idx);
    container.appendChild(addInput);
  }

  function removeDay(idx, dayIdx) {
    groups[idx].measurementDays.splice(dayIdx, 1);
    renderGroups();
  }

  async function save() {
    const studyNumber = document.getElementById('f_studyNumber')?.value?.trim();
    if (!studyNumber) return App.showToast('시험번호를 입력해주세요.', 'error');

    study.studyNumber = studyNumber;
    study.year = parseInt(document.getElementById('f_year')?.value) || study.year;
    study.classification = document.getElementById('f_classification')?.value;
    study.modelName = document.getElementById('f_modelName')?.value || '';
    study.strain = document.getElementById('f_strain')?.value || '';
    study.projectName = document.getElementById('f_projectName')?.value || '';
    study.cro = document.getElementById('f_cro')?.value || '';
    study.protocolLink = document.getElementById('f_protocolLink')?.value || '';
    study.reportLink = document.getElementById('f_reportLink')?.value || '';
    study.dataSource = document.querySelector('input[name="dataSource"]:checked')?.value || 'SB';
    study.competitorDrug = document.getElementById('f_competitorDrug')?.value || '';
    study.competitorSource = document.getElementById('f_competitorSource')?.value || '';

    // Serialize dosingSchedule
    groups.forEach(g => {
      if (g.dosingSchedule) g.dosingSchedule = JSON.stringify(g.dosingSchedule);
      // Keep backward compat: isControl from groupRole
      g.isControl = g.groupRole === 'vehicle' || g.groupRole === 'control';
    });

    try {
      await App.withLoading(async () => {
        await api.saveStudy(study);
        await api.saveGroups(study.studyId, groups);

        // Only generate animals on new study creation
        if (!isEdit) {
          const allAnimals = [];
          groups.forEach(g => {
            for (let i = 1; i <= g.animalCount; i++) {
              const rId = Math.random().toString(36).substring(2, 8).toUpperCase();
              allAnimals.push({
                animalId: App.uuid(), studyId: study.studyId, groupId: g.groupId,
                subjectId: `G${g.groupNumber}M${String(i).padStart(2,'0')}`,
                randomId: rId, animalNumber: '', studyAnimalId: '', sex: g.sex || 'M'
              });
            }
          });
          await api.saveAnimals(study.studyId, allAnimals);
        }

        // Auto-save new model/strain/project/cro to codes
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
      App.showToast('저장 실패: ' + e.message, 'error');
    }
  }

  return {
    render, addGroup, removeGroup, updateGroupField, setGroupRole, copyFromGroup1,
    updateDosingSchedule, onDay1Change, suggestDays, addDay, removeDay,
    updateSourceFields, save
  };
})();
