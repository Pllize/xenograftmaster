// App initialization and global state
const App = (() => {
  const state = {
    studies: [],
    currentStudy: null,
    currentStudyData: null,
    unsavedChanges: false,
    errorBarType: 'sem' // 'sem' | 'sd'
  };

  function setUnsaved(flag) {
    state.unsavedChanges = flag;
    const banner = document.getElementById('unsavedBanner');
    if (banner) banner.style.display = flag ? 'flex' : 'none';
  }

  function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const id = 'toast_' + Date.now();
    const html = `
      <div id="${id}" class="toast align-items-center text-bg-${type === 'error' ? 'danger' : 'success'} border-0 show" role="alert">
        <div class="d-flex">
          <div class="toast-body">${msg}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>`;
    container.insertAdjacentHTML('beforeend', html);
    setTimeout(() => document.getElementById(id)?.remove(), 4000);
  }

  function showLoading(msg = '불러오는 중...') {
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('loadingMsg').textContent = msg;
  }

  function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
  }

  async function withLoading(fn, msg) {
    showLoading(msg);
    try {
      return await fn();
    } finally {
      hideLoading();
    }
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('ko-KR');
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  function suggestMeasurementDays(freq = 2, totalDays = 28) {
    const days = [1];
    let cur = 1;
    const step = freq === 3 ? 2 : [3, 4]; // alternate 3/4 for twice weekly
    if (freq === 3) {
      while (cur + 2 <= totalDays) { cur += 2; days.push(cur); }
    } else {
      let alt = 0;
      while (true) {
        const inc = alt % 2 === 0 ? 3 : 4;
        cur += inc; alt++;
        if (cur > totalDays) break;
        days.push(cur);
      }
    }
    return days;
  }

  function setActiveNav(path) {
    document.querySelectorAll('.nav-link[data-route]').forEach(el => {
      const route = el.getAttribute('data-route');
      el.classList.toggle('active', path.startsWith(route));
    });
  }

  function renderContent(html) {
    document.getElementById('mainContent').innerHTML = html;
  }

  return { state, setUnsaved, showToast, showLoading, hideLoading, withLoading, uuid, formatDate, addDays, suggestMeasurementDays, setActiveNav, renderContent };
})();
