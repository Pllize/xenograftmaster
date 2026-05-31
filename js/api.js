// Google Apps Script URL - embedded default, overridable via admin panel
const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzXhHIh-a79UXGgZU-GZu5jWHiSW1deZOVVLQ-S4UP-T1RQ7F4rN1W-c6XZKp4X96x9/exec';
const APPS_SCRIPT_URL = localStorage.getItem('xm_apps_script_url') || DEFAULT_APPS_SCRIPT_URL;

const api = (() => {
  function getUrl() {
    return localStorage.getItem('xm_apps_script_url') || DEFAULT_APPS_SCRIPT_URL;
  }

  async function get(params) {
    const url = getUrl();
    const qs = new URLSearchParams(params).toString();
    const resp = await fetch(`${url}?${qs}`, { redirect: 'follow' });
    const json = await resp.json();
    if (json.error) throw new Error(json.error);
    return json;
  }

  // Apps Script POST via GET with payload param (avoids CORS preflight)
  async function post(action, data) {
    const url = getUrl();
    const payload = encodeURIComponent(JSON.stringify({ action, data }));
    const resp = await fetch(`${url}?payload=${payload}`, { redirect: 'follow' });
    const json = await resp.json();
    if (json.error) throw new Error(json.error);
    return json;
  }

  return {
    async init() { return get({ action: 'init' }); },

    // Studies
    async getStudies(filters = {}) { return get({ action: 'getStudies', ...filters }); },
    async getStudyData(studyId) { return get({ action: 'getStudyData', studyId }); },
    async saveStudy(study) { return post('saveStudy', study); },
    async deleteStudy(studyId) { return post('deleteStudy', { studyId }); },

    // Groups
    async saveGroups(studyId, groups) { return post('saveGroups', { studyId, groups }); },
    async deleteGroup(groupId) { return post('deleteGroup', { groupId }); },

    // Animals
    async saveAnimals(studyId, animals) { return post('saveAnimals', { studyId, animals }); },

    // Measurements
    async bulkSaveMeasurements(studyId, measurements) {
      return post('bulkSaveMeasurements', { studyId, measurements });
    },
    async bulkSaveNecropsy(studyId, records) {
      return post('bulkSaveNecropsy', { studyId, records });
    },

    // Codes
    async getCodes(codeType) { return get({ action: 'getCodes', codeType }); },
    async saveCode(data) { return post('saveCode', data); },
    async deleteCode(codeType, codeValue) { return post('deleteCode', { codeType, codeValue }); },

    // Substances
    async getSubstances() { return get({ action: 'getSubstances' }); },
    async saveSubstance(data) { return post('saveSubstance', data); },
    async deleteSubstance(substanceId) { return post('deleteSubstance', { substanceId }); },

    // Competitors
    async getCompetitors() { return get({ action: 'getCompetitors' }); },
    async saveCompetitor(data) { return post('saveCompetitor', data); },
    async deleteCompetitor(competitorId) { return post('deleteCompetitor', { competitorId }); },

    // Export/Import
    async exportAll() { return get({ action: 'exportAll' }); },
    async importAll(snapshot) { return post('importAll', snapshot); },

    // Build analysis payload from study data
    buildAnalysisPayload(studyData) {
      const { groups, animals, measurements, necropsy } = studyData;
      const groupMap = {};
      const animalMap = {};

      animals.forEach(a => { animalMap[a.animalId] = a; });

      groups.forEach(g => {
        const days = Array.isArray(g.measurementDays) ? g.measurementDays : [];
        groupMap[g.groupId] = {
          groupName: g.groupName,
          isControl: g.isControl,
          groupNumber: g.groupNumber,
          day1Date: g.day1Date,
          days,
          subjects: {}
        };
      });

      measurements.forEach(m => {
        const animal = animalMap[m.animalId];
        if (!animal) return;
        const grp = groupMap[animal.groupId];
        if (!grp) return;
        if (!grp.subjects[m.animalId]) grp.subjects[m.animalId] = { id: animal.subjectId, vols: {}, bws: {} };
        if (m.tumorVolume !== null && m.tumorVolume !== '') grp.subjects[m.animalId].vols[Number(m.day)] = Number(m.tumorVolume);
        if (m.bodyWeight !== null && m.bodyWeight !== '') grp.subjects[m.animalId].bws[Number(m.day)] = Number(m.bodyWeight);
      });

      necropsy.forEach(n => {
        const animal = animalMap[n.animalId];
        if (!animal) return;
        const grp = groupMap[animal.groupId];
        if (!grp) return;
        if (!grp.subjects[n.animalId]) grp.subjects[n.animalId] = { id: animal.subjectId, vols: {}, bws: {} };
        grp.subjects[n.animalId].tumorWeight = Number(n.tumorWeight);
      });

      // Convert to analysis format
      const analysisGroups = {};
      let allDays = new Set();

      groups.forEach(g => {
        const grpData = groupMap[g.groupId];
        const displayName = g.substanceName || g.groupName || ('Group ' + g.groupNumber);
        analysisGroups[displayName] = Object.values(grpData.subjects);
        Object.values(grpData.subjects).forEach(s => {
          Object.keys(s.vols).forEach(d => allDays.add(Number(d)));
        });
      });

      return {
        groups: analysisGroups,
        days: Array.from(allDays).sort((a, b) => a - b),
        groupMeta: groups.reduce((acc, g) => {
          const displayName = g.substanceName || g.groupName || ('Group ' + g.groupNumber);
          acc[displayName] = {
            isControl: g.isControl || g.groupRole === 'vehicle' || g.groupRole === 'control',
            groupNumber: g.groupNumber,
            groupRole: g.groupRole || 'SB',
            groupId: g.groupId
          };
          return acc;
        }, {})
      };
    }
  };
})();
