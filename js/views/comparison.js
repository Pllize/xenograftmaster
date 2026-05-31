// Multi-study comparison view
const ComparisonView = (() => {
  let studies = [];
  let selected = new Set();
  let studyDataMap = {};
  let compareCharts = {};
  let modelCodes = [];

  async function render() {
    App.setActiveNav('/compare');
    try {
      const codes = await api.getCodes('modelName');
      modelCodes = (codes || []).map(c => c.codeValue);
    } catch(e) { modelCodes = []; }

    App.renderContent(`
      <h4 class="fw-bold mb-3">시험 비교</h4>
      <div class="card p-3 mb-3">
        <div class="row g-2 mb-2">
          <div class="col-md-3">
            <select class="form-select form-select-sm" id="c_classification" onchange="ComparisonView.loadStudies()">
              <option value="">분류 전체</option>
              <option value="CDX">CDX</option><option value="PDX">PDX</option><option value="기타">기타</option>
            </select>
          </div>
          <div class="col-md-3">
            <input class="form-control form-control-sm" id="c_model" placeholder="모델명 검색"
              list="dl_cmp_model" oninput="ComparisonView.loadStudies()">
            <datalist id="dl_cmp_model">${modelCodes.map(v => `<option value="${v}">`).join('')}</datalist>
          </div>
          <div class="col-md-3">
            <select class="form-select form-select-sm" id="c_source" onchange="ComparisonView.loadStudies()">
              <option value="">출처 전체</option>
              <option value="SB">SB</option>
              <option value="경쟁사">경쟁사</option>
            </select>
          </div>
          <div class="col-md-3 d-flex align-items-end">
            <button class="btn btn-primary btn-sm w-100" onclick="ComparisonView.compare()">비교 실행</button>
          </div>
        </div>
        <div id="studyCheckboxes" class="d-flex flex-wrap gap-2"></div>
      </div>
      <div id="comparisonResult"></div>
    `);
    await loadStudies();
  }

  async function loadStudies() {
    const filters = {
      classification: document.getElementById('c_classification')?.value || '',
      modelName: document.getElementById('c_model')?.value || '',
      dataSource: document.getElementById('c_source')?.value || ''
    };
    Object.keys(filters).forEach(k => { if (!filters[k]) delete filters[k]; });
    try {
      studies = await api.getStudies(filters);
    } catch (e) {
      studies = [];
    }
    renderCheckboxes();
  }

  function renderCheckboxes() {
    const container = document.getElementById('studyCheckboxes');
    if (!container) return;
    if (!studies.length) {
      container.innerHTML = '<p class="text-muted small mb-0">조건에 맞는 시험이 없습니다.</p>';
      return;
    }
    container.innerHTML = studies.map(s => `
      <div class="form-check form-check-inline">
        <input class="form-check-input" type="checkbox" id="cs_${s.studyId}" value="${s.studyId}"
          ${selected.has(s.studyId) ? 'checked' : ''}
          onchange="ComparisonView.toggleStudy('${s.studyId}',this.checked)">
        <label class="form-check-label small" for="cs_${s.studyId}">
          ${s.studyNumber} (${s.modelName || '-'})
          ${s.dataSource === '경쟁사' ? `<span class="badge bg-warning text-dark">경쟁사</span>` : ''}
        </label>
      </div>`).join('');
  }

  function toggleStudy(id, checked) {
    if (checked) selected.add(id); else selected.delete(id);
  }

  async function compare() {
    if (selected.size < 2) return App.showToast('2개 이상의 시험을 선택하세요.', 'error');
    studyDataMap = {};
    await App.withLoading(async () => {
      for (const id of selected) {
        studyDataMap[id] = await api.getStudyData(id);
      }
    }, '데이터 로딩 중...');
    renderComparison();
  }

  const COLORS = ['#0d6efd','#dc3545','#198754','#ffc107','#0dcaf0','#6f42c1','#d63384','#fd7e14'];

  function renderComparison() {
    const container = document.getElementById('comparisonResult');
    if (!container) return;
    container.innerHTML = `
      <div class="card p-4 mb-3">
        <h6 class="fw-bold mb-3">Tumor Growth Curve Overlay (Day 1 기준)</h6>
        <div style="height:350px"><canvas id="cmpChart"></canvas></div>
      </div>
      <div class="card p-3">
        <h6 class="fw-bold mb-3">시험 간 지표 비교</h6>
        <div class="table-responsive" id="cmpTable"></div>
      </div>`;

    const datasets = [];
    let colorIdx = 0;
    const tableRows = [];

    Array.from(selected).forEach(id => {
      const data = studyDataMap[id];
      if (!data) return;
      const payload = api.buildAnalysisPayload(data);
      const controlGrp = Object.keys(payload.groupMeta).find(g => payload.groupMeta[g]?.isControl) || Object.keys(payload.groups)[0];
      const { stats } = Analysis.calcGroupStats(payload.groups, payload.days);
      const metrics = Analysis.calculateGroupMetrics(payload.groups, controlGrp, payload.days);
      const studyLabel = data.study.studyNumber;

      Object.keys(payload.groups).forEach(grp => {
        const isCtrl = grp === controlGrp;
        datasets.push({
          label: `${studyLabel} | ${grp}${isCtrl ? ' (ctrl)' : ''}`,
          data: payload.days.map(d => ({ x: d, y: stats[grp][d]?.mean ?? null })),
          borderColor: COLORS[colorIdx % COLORS.length],
          backgroundColor: COLORS[colorIdx % COLORS.length],
          fill: false, tension: 0.2, pointRadius: 3,
          borderDash: isCtrl ? [5, 3] : []
        });
        colorIdx++;

        const m = metrics[grp];
        const isSB = data.study.dataSource === 'SB' || data.study.dataSource === '자체';
        tableRows.push(`<tr>
          <td>${studyLabel}</td>
          <td>${data.study.modelName || '-'}</td>
          <td>${!isSB ? `<span class="badge bg-warning text-dark">경쟁사</span> ${data.study.competitorDrug || ''}` : '<span class="badge bg-primary">SB</span>'}</td>
          <td>${grp} ${isCtrl ? '<span class="badge bg-secondary">ctrl</span>' : ''}</td>
          <td>${m.N}</td>
          <td>${m.tgi21_TC != null ? m.tgi21_TC.toFixed(1) : '-'}</td>
          <td>${m.tgi42_TC != null ? m.tgi42_TC.toFixed(1) : '-'}</td>
          <td>${m.orr?.toFixed(1) ?? '-'}</td>
          <td>${m.aucRatio != null ? m.aucRatio.toFixed(2) : '-'}</td>
        </tr>`);
      });
    });

    if (compareCharts.main) { compareCharts.main.destroy(); }
    compareCharts.main = new Chart(document.getElementById('cmpChart'), {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Day' } },
          y: { title: { display: true, text: 'Mean Tumor Volume (mm³)' }, beginAtZero: true }
        }
      }
    });

    document.getElementById('cmpTable').innerHTML = `
      <table class="table table-sm table-bordered table-hover text-center">
        <thead><tr><th>시험번호</th><th>모델</th><th>출처</th><th>군</th><th>N</th>
          <th>TGI D21 T/C</th><th>TGI D42 T/C</th><th>ORR(%)</th><th>AUC Ratio</th></tr></thead>
        <tbody>${tableRows.join('')}</tbody>
      </table>`;
  }

  return { render, loadStudies, toggleStudy, compare };
})();
