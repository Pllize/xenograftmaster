// Study create/edit form
const StudyFormView = (() => {
  let study = null;
  let groups = [];
  let isEdit = false;

  async function render(params) {
    isEdit = params.id && params.id !== 'new';
    const isCompetitor = window.location.hash.includes('type=competitor');
    App.setActiveNav('/data');

    if (isEdit) {
      try {
        const data = await App.withLoading(() => api.getStudyData(params.id), '데이터 로딩 중...');
        study = data.study;
        groups = data.groups.map(g => ({
          ...g,
          measurementDays: Array.isArray(g.measurementDays) ? g.measurementDays : []
        }));
      } catch (e) {
        App.showToast('데이터 로딩 실패: ' + e.message, 'error');
        Router.navigate('/data');
        return;
      }
    } else {
      study = {
        studyId: App.uuid(),
        studyNumber: '', year: new Date().getFullYear(),
        classification: 'CDX', modelName: '', cro: '',
        protocolLink: '', reportLink: '',
        dataSource: isCompetitor ? '경쟁사' : '자체',
        competitorDrug: '', competitorSource: ''
      };
      groups = [];
    }

    App.renderContent(buildFormHTML());
    renderGroups();
    updateCompetitorFields();
  }

  function buildFormHTML() {
    return `
      <div class="d-flex align-items-center mb-3 gap-2">
        <button class="btn btn-sm btn-outline-secondary" onclick="Router.navigate('/data')">← 목록</button>
        <h4 class="fw-bold mb-0">${isEdit ? '시험 수정' : '새 시험 등록'}</h4>
      </div>

      <div class="card p-4 mb-3">
        <h6 class="fw-bold mb-3">기본 정보</h6>
        <div class="row g-3">
          <div class="col-md-3">
            <label class="form-label">시험번호 *</label>
            <input class="form-control" id="f_studyNumber" value="${study.studyNumber || ''}" placeholder="예: XG-2024-001">
          </div>
          <div class="col-md-2">
            <label class="form-label">수행년도</label>
            <input class="form-control" type="number" id="f_year" value="${study.year || ''}">
          </div>
          <div class="col-md-2">
            <label class="form-label">분류</label>
            <select class="form-select" id="f_classification">
              ${['CDX','PDX','기타'].map(v => `<option value="${v}" ${study.classification === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">모델명</label>
            <input class="form-control" id="f_modelName" value="${study.modelName || ''}" placeholder="예: HCT116">
          </div>
          <div class="col-md-2">
            <label class="form-label">CRO</label>
            <input class="form-control" id="f_cro" value="${study.cro || ''}">
          </div>
          <div class="col-md-6">
            <label class="form-label">시험계획서 (EFSS 링크)</label>
            <input class="form-control" id="f_protocolLink" value="${study.protocolLink || ''}" placeholder="https://...">
          </div>
          <div class="col-md-6">
            <label class="form-label">시험보고서 (EFSS 링크)</label>
            <input class="form-control" id="f_reportLink" value="${study.reportLink || ''}" placeholder="https://...">
          </div>
          <div class="col-md-3">
            <label class="form-label">데이터 출처</label>
            <select class="form-select" id="f_dataSource" onchange="StudyFormView.updateCompetitorFields()">
              <option value="자체" ${study.dataSource !== '경쟁사' ? 'selected' : ''}>자체 데이터</option>
              <option value="경쟁사" ${study.dataSource === '경쟁사' ? 'selected' : ''}>경쟁사 데이터</option>
            </select>
          </div>
          <div id="competitorFields" class="col-12 row g-3" style="display:none;">
            <div class="col-md-4">
              <label class="form-label">경쟁사 약물명</label>
              <input class="form-control" id="f_competitorDrug" value="${study.competitorDrug || ''}">
            </div>
            <div class="col-md-8">
              <label class="form-label">출처 (논문/학회)</label>
              <input class="form-control" id="f_competitorSource" value="${study.competitorSource || ''}" placeholder="예: AACR 2024, PMID:12345678">
            </div>
          </div>
        </div>
      </div>

      <div class="card p-4 mb-3">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="fw-bold mb-0">군 구성</h6>
          <button class="btn btn-sm btn-outline-primary" onclick="StudyFormView.addGroup()">+ 군 추가</button>
        </div>
        <div id="groupsContainer"></div>
      </div>

      <div class="d-flex gap-2 justify-content-end">
        <button class="btn btn-outline-secondary" onclick="Router.navigate('/data')">취소</button>
        <button class="btn btn-primary fw-bold px-4" onclick="StudyFormView.save()">저장</button>
      </div>
    `;
  }

  function updateCompetitorFields() {
    const isComp = document.getElementById('f_dataSource')?.value === '경쟁사';
    const el = document.getElementById('competitorFields');
    if (el) el.style.display = isComp ? 'flex' : 'none';
  }

  function addGroup() {
    const gNum = groups.length + 1;
    groups.push({
      groupId: App.uuid(),
      studyId: study.studyId,
      groupNumber: gNum,
      groupName: `Group ${gNum}`,
      animalCount: 6,
      implantationDate: '', separationDate: '', day1Date: '', necropsyDate: '',
      measurementDays: App.suggestMeasurementDays(2, 28),
      isControl: gNum === 1
    });
    renderGroups();
  }

  function removeGroup(idx) {
    groups.splice(idx, 1);
    groups.forEach((g, i) => { g.groupNumber = i + 1; });
    renderGroups();
  }

  function renderGroups() {
    const container = document.getElementById('groupsContainer');
    if (!container) return;
    if (!groups.length) {
      container.innerHTML = '<p class="text-muted">군이 없습니다. 위 버튼으로 추가하세요.</p>';
      return;
    }
    container.innerHTML = groups.map((g, idx) => `
      <div class="border rounded p-3 mb-3 group-card">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="fw-bold">군 ${g.groupNumber}</span>
          <div class="d-flex align-items-center gap-2">
            <div class="form-check form-check-inline mb-0">
              <input class="form-check-input" type="checkbox" id="ctrl_${idx}" ${g.isControl ? 'checked' : ''}
                onchange="StudyFormView.setControl(${idx})">
              <label class="form-check-label small" for="ctrl_${idx}">Control</label>
            </div>
            <button class="btn btn-sm btn-outline-danger" onclick="StudyFormView.removeGroup(${idx})">삭제</button>
          </div>
        </div>
        <div class="row g-2">
          <div class="col-md-4">
            <label class="form-label small">군명</label>
            <input class="form-control form-control-sm" value="${g.groupName}" oninput="StudyFormView.updateGroupField(${idx},'groupName',this.value)">
          </div>
          <div class="col-md-2">
            <label class="form-label small">동물수</label>
            <input class="form-control form-control-sm" type="number" min="1" value="${g.animalCount}" oninput="StudyFormView.updateGroupField(${idx},'animalCount',parseInt(this.value)||1)">
          </div>
          <div class="col-md-3">
            <label class="form-label small">이식일</label>
            <input class="form-control form-control-sm" type="date" value="${g.implantationDate || ''}" oninput="StudyFormView.updateGroupField(${idx},'implantationDate',this.value)">
          </div>
          <div class="col-md-3">
            <label class="form-label small">군분리일</label>
            <input class="form-control form-control-sm" type="date" value="${g.separationDate || ''}" oninput="StudyFormView.updateGroupField(${idx},'separationDate',this.value)">
          </div>
          <div class="col-md-3">
            <label class="form-label small">Day 1 (첫투여일)</label>
            <input class="form-control form-control-sm" type="date" value="${g.day1Date || ''}" oninput="StudyFormView.onDay1Change(${idx},this.value)">
          </div>
          <div class="col-md-3">
            <label class="form-label small">부검일</label>
            <input class="form-control form-control-sm" type="date" value="${g.necropsyDate || ''}" oninput="StudyFormView.updateGroupField(${idx},'necropsyDate',this.value)">
          </div>
          <div class="col-md-6">
            <label class="form-label small d-flex justify-content-between">
              측정일 (Day)
              <span>
                <button class="btn btn-link btn-sm p-0 me-2" onclick="StudyFormView.suggestDays(${idx},2)">주2회</button>
                <button class="btn btn-link btn-sm p-0" onclick="StudyFormView.suggestDays(${idx},3)">주3회</button>
              </span>
            </label>
            <div class="d-flex flex-wrap gap-1 align-items-center border rounded p-2" id="daysChips_${idx}">
              ${renderDayChips(g.measurementDays, idx)}
              <input type="number" class="form-control form-control-sm" style="width:70px" placeholder="+Day" id="dayInput_${idx}"
                onkeydown="if(event.key==='Enter'){StudyFormView.addDay(${idx});event.preventDefault();}">
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  function renderDayChips(days, idx) {
    return days.map((d, di) =>
      `<span class="badge bg-light text-dark border me-1">Day ${d}
        <button class="btn-close btn-close ms-1" style="font-size:0.5rem" onclick="StudyFormView.removeDay(${idx},${di})"></button>
      </span>`
    ).join('');
  }

  function updateGroupField(idx, field, value) {
    groups[idx][field] = value;
  }

  function setControl(idx) {
    groups.forEach((g, i) => { g.isControl = i === idx; });
    renderGroups();
  }

  function onDay1Change(idx, value) {
    groups[idx].day1Date = value;
    if (value && !groups[idx].measurementDays.length) {
      groups[idx].measurementDays = App.suggestMeasurementDays(2, 28);
      renderGroups();
    }
  }

  function suggestDays(idx, freq) {
    const g = groups[idx];
    let totalDays = 28;
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
    const input2 = container.querySelector('input');
    container.innerHTML = renderDayChips(groups[idx].measurementDays, idx);
    container.appendChild(input2);
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
    study.modelName = document.getElementById('f_modelName')?.value;
    study.cro = document.getElementById('f_cro')?.value;
    study.protocolLink = document.getElementById('f_protocolLink')?.value;
    study.reportLink = document.getElementById('f_reportLink')?.value;
    study.dataSource = document.getElementById('f_dataSource')?.value;
    study.competitorDrug = document.getElementById('f_competitorDrug')?.value || '';
    study.competitorSource = document.getElementById('f_competitorSource')?.value || '';

    try {
      await App.withLoading(async () => {
        await api.saveStudy(study);
        await api.saveGroups(study.studyId, groups);

        // Generate animals for each group
        const allAnimals = [];
        groups.forEach(g => {
          for (let i = 1; i <= g.animalCount; i++) {
            allAnimals.push({
              animalId: App.uuid(),
              studyId: study.studyId,
              groupId: g.groupId,
              subjectId: `G${g.groupNumber}M${String(i).padStart(2, '0')}`,
              sex: 'M'
            });
          }
        });
        await api.saveAnimals(study.studyId, allAnimals);
      }, '저장 중...');

      App.showToast('저장되었습니다.');
      Router.navigate('/study/' + study.studyId);
    } catch (e) {
      App.showToast('저장 실패: ' + e.message, 'error');
    }
  }

  return { render, addGroup, removeGroup, updateGroupField, setControl, onDay1Change, suggestDays, addDay, removeDay, updateCompetitorFields, save };
})();
