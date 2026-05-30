// Core analysis functions - extracted from original index.html
// These pure functions receive the analysis payload and return results.

const Analysis = (() => {
  const getMean = (arr) => arr.length ? jStat.mean(arr) : null;
  const getMedian = (arr) => arr.length ? jStat.median(arr) : null;
  const getSEM = (arr) => arr.length > 1 ? jStat.stdev(arr, true) / Math.sqrt(arr.length) : 0;
  const getSD = (arr) => arr.length > 1 ? jStat.stdev(arr, true) : 0;
  const getNearestDay = (target, days) => days.reduce((prev, curr) =>
    Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev);

  function calcSubjectNormAUC(subject, days) {
    let auc = 0, firstDay = null, prevDay = null, lastDay = null;
    days.forEach(d => {
      const v = subject.vols[d];
      if (v !== undefined) {
        if (firstDay === null) firstDay = d;
        if (prevDay !== null) auc += ((subject.vols[prevDay] + v) / 2) * (d - prevDay);
        prevDay = d; lastDay = d;
      }
    });
    const totalDays = lastDay - firstDay;
    return (totalDays > 0) ? (auc / totalDays) : null;
  }

  // TGI using T/C ratio at a specific day
  function calcTGI_TC(grpVolDay, ctrlVolDay) {
    if (ctrlVolDay == null || grpVolDay == null) return null;
    return (1 - grpVolDay / ctrlVolDay) * 100;
  }

  // TGI using delta T / delta C (change from baseline)
  function calcTGI_Delta(grpBaseline, grpFinal, ctrlBaseline, ctrlFinal) {
    if (grpBaseline == null || grpFinal == null || ctrlBaseline == null || ctrlFinal == null) return null;
    const deltaC = ctrlFinal - ctrlBaseline;
    const deltaT = grpFinal - grpBaseline;
    if (deltaC === 0) return null;
    return ((deltaC - deltaT) / deltaC) * 100;
  }

  function calculateGroupMetrics(groups, controlGrp, days, crThreshold = 0) {
    const controlData = groups[controlGrp] || [];
    const day21 = getNearestDay(21, days);
    const day42 = getNearestDay(42, days);
    const day1 = days[0];

    const ctrlVol21 = getMean(controlData.map(s => s.vols[day21]).filter(v => v !== undefined));
    const ctrlVol42 = getMean(controlData.map(s => s.vols[day42]).filter(v => v !== undefined));
    const ctrlBaseline = getMean(controlData.map(s => s.vols[day1]).filter(v => v !== undefined));
    const ctrlFinal21 = ctrlVol21;
    const ctrlFinal42 = ctrlVol42;

    const controlNormAUCs = controlData.map(s => calcSubjectNormAUC(s, days)).filter(v => v !== null);
    const meanCtrlNormAUC = getMean(controlNormAUCs);

    const results = {};

    Object.keys(groups).forEach(grp => {
      const subjects = groups[grp];
      const N = subjects.length;
      const responses = [], ttrs = [], dors = [], efs2s = [], efs4s = [], normAUCs = [];

      const grpVol21 = getMean(subjects.map(s => s.vols[day21]).filter(v => v !== undefined));
      const grpVol42 = getMean(subjects.map(s => s.vols[day42]).filter(v => v !== undefined));
      const grpBaseline = getMean(subjects.map(s => s.vols[day1]).filter(v => v !== undefined));

      const tgi21_TC = grp === controlGrp ? 0 : calcTGI_TC(grpVol21, ctrlVol21);
      const tgi42_TC = grp === controlGrp ? 0 : calcTGI_TC(grpVol42, ctrlVol42);
      const tgi21_Delta = grp === controlGrp ? 0 : calcTGI_Delta(grpBaseline, grpVol21, ctrlBaseline, ctrlFinal21);
      const tgi42_Delta = grp === controlGrp ? 0 : calcTGI_Delta(grpBaseline, grpVol42, ctrlBaseline, ctrlFinal42);

      subjects.forEach(sub => {
        const nAuc = calcSubjectNormAUC(sub, days);
        if (nAuc !== null) normAUCs.push(nAuc);

        const v0 = sub.vols[day1];
        const availableDays = Object.keys(sub.vols).map(Number).sort((a, b) => a - b);
        const lastDay = availableDays[availableDays.length - 1];
        if (v0 === undefined) return;

        let nadir = v0, ttr = null, isCR = false, isPR = false;
        let efs2Day = lastDay, efs4Day = lastDay, efs2Met = false, efs4Met = false;

        for (const d of availableDays) {
          const v = sub.vols[d];
          if (!efs2Met && v >= v0 * 2) { efs2Day = d; efs2Met = true; }
          if (!efs4Met && v >= v0 * 4) { efs4Day = d; efs4Met = true; }
          if (d === day1) continue;
          if (v < nadir) nadir = v;
          const reduction = (v - v0) / v0;
          const isCRNow = crThreshold > 0 ? v <= crThreshold : reduction <= -1.0;
          if (isCRNow) { if (ttr === null) ttr = d; isCR = true; }
          else if (reduction <= -0.3) { if (ttr === null) ttr = d; isPR = true; }
        }

        efs2s.push(efs2Day); efs4s.push(efs4Day);
        if (isCR) responses.push('CR'); else if (isPR) responses.push('PR'); else responses.push('None');

        if (ttr !== null) {
          ttrs.push(ttr);
          let progDay = lastDay, localNadir = sub.vols[ttr];
          for (const d of availableDays.filter(day => day >= ttr)) {
            const v = sub.vols[d];
            if (v < localNadir) localNadir = v;
            if (v >= localNadir * 1.2) { progDay = d; break; }
          }
          dors.push(progDay - ttr);
        }
      });

      const crCount = responses.filter(r => r === 'CR').length;
      const prCount = responses.filter(r => r === 'PR').length;
      const orr = N > 0 ? ((crCount + prCount) / N) * 100 : null;
      const meanNormAUC = getMean(normAUCs);
      const aucRatio = grp === controlGrp ? 1 : (meanCtrlNormAUC && meanNormAUC ? meanNormAUC / meanCtrlNormAUC : null);

      results[grp] = {
        N, orr, crCount, prCount, responses,
        meanTTR: getMean(ttrs),
        medianDOR: getMedian(dors),
        medianEFS2: getMedian(efs2s),
        medianEFS4: getMedian(efs4s),
        efs2s, efs4s,
        aucRatio,
        tgi21_TC, tgi42_TC,
        tgi21_Delta, tgi42_Delta,
        grpVol21, grpVol42
      };
    });

    return results;
  }

  function calcGroupStats(groups, days) {
    const stats = {};
    let globalMaxChange = 0;

    Object.keys(groups).forEach(grp => {
      stats[grp] = {};
      days.forEach(d => {
        const vals = groups[grp].map(s => s.vols[d]).filter(v => v !== undefined && !isNaN(v));
        const mean = getMean(vals);
        stats[grp][d] = { mean, sem: getSEM(vals), sd: getSD(vals), n: vals.length, vals };
        if (d !== days[0] && mean !== null && stats[grp][days[0]]?.mean != null) {
          const change = mean - stats[grp][days[0]].mean;
          if (change > globalMaxChange) globalMaxChange = change;
        }
      });
    });
    if (globalMaxChange === 0) globalMaxChange = 1;

    const scaledStats = {};
    Object.keys(groups).forEach(grp => {
      scaledStats[grp] = {};
      days.forEach(d => {
        const m = stats[grp][d].mean;
        const baseline = stats[grp][days[0]]?.mean;
        if (m === null || baseline === null) { scaledStats[grp][d] = null; return; }
        const change = m - baseline;
        scaledStats[grp][d] = change >= 0
          ? (change / globalMaxChange) * 100
          : baseline > 0 ? (change / baseline) * 100 : 0;
      });
    });

    return { stats, scaledStats };
  }

  function calcBodyWeightStats(groups, days) {
    const stats = {};
    Object.keys(groups).forEach(grp => {
      stats[grp] = {};
      days.forEach(d => {
        const vals = groups[grp].map(s => s.bws?.[d]).filter(v => v !== undefined && v !== null && !isNaN(v));
        const mean = getMean(vals);
        stats[grp][d] = { mean, sem: getSEM(vals), sd: getSD(vals), n: vals.length };
      });
    });
    return stats;
  }

  function calcNecropsyStats(groups) {
    const stats = {};
    Object.keys(groups).forEach(grp => {
      const vals = groups[grp].map(s => s.tumorWeight).filter(v => v !== undefined && v !== null && !isNaN(v));
      stats[grp] = { mean: getMean(vals), sem: getSEM(vals), sd: getSD(vals), n: vals.length, vals };
    });
    return stats;
  }

  // Welch's t-test
  function welchTTest(vals1, vals2) {
    if (vals1.length < 2 || vals2.length < 2) return { pValue: null, sig: '-' };
    const v1 = jStat.variance(vals1, true), v2 = jStat.variance(vals2, true);
    const n1 = vals1.length, n2 = vals2.length;
    if (v1 === 0 && v2 === 0 && getMean(vals1) === getMean(vals2)) return { pValue: 1, sig: 'ns' };
    if (v1 === 0 && v2 === 0) return { pValue: 0.00001, sig: '***' };
    const tStat = Math.abs(getMean(vals1) - getMean(vals2)) / Math.sqrt((v1 / n1) + (v2 / n2));
    const df = Math.pow((v1 / n1) + (v2 / n2), 2) /
      (Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1));
    const pValue = 2 * (1 - jStat.studentt.cdf(tStat, df));
    return { pValue, sig: pValue < 0.001 ? '***' : pValue < 0.01 ? '**' : pValue < 0.05 ? '*' : 'ns' };
  }

  // Mann-Whitney U test approximation
  function mannWhitneyU(vals1, vals2) {
    if (vals1.length < 2 || vals2.length < 2) return { pValue: null, sig: '-' };
    const n1 = vals1.length, n2 = vals2.length;
    let U = 0;
    vals1.forEach(v1 => vals2.forEach(v2 => {
      if (v1 > v2) U++;
      else if (v1 === v2) U += 0.5;
    }));
    const meanU = n1 * n2 / 2;
    const stdU = Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12);
    if (stdU === 0) return { pValue: 1, sig: 'ns' };
    const z = (U - meanU) / stdU;
    const pValue = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
    return { pValue, sig: pValue < 0.001 ? '***' : pValue < 0.01 ? '**' : pValue < 0.05 ? '*' : 'ns' };
  }

  // One-way ANOVA F-test
  function oneWayANOVA(groupArrays) {
    const k = groupArrays.length;
    if (k < 2) return null;
    const allVals = groupArrays.flat();
    const N = allVals.length;
    const grandMean = getMean(allVals);
    const SSB = groupArrays.reduce((sum, g) => {
      const m = getMean(g);
      return sum + g.length * Math.pow(m - grandMean, 2);
    }, 0);
    const SSW = groupArrays.reduce((sum, g) => {
      const m = getMean(g);
      return sum + g.reduce((s, v) => s + Math.pow(v - m, 2), 0);
    }, 0);
    const dfB = k - 1, dfW = N - k;
    if (dfW <= 0 || SSW === 0) return null;
    const F = (SSB / dfB) / (SSW / dfW);
    const pValue = 1 - jStat.centralF.cdf(F, dfB, dfW);
    return { F, dfB, dfW, pValue, sig: pValue < 0.001 ? '***' : pValue < 0.01 ? '**' : pValue < 0.05 ? '*' : 'ns' };
  }

  // Dunnett's test approximation (uses t-distribution with pooled variance)
  function dunnettTest(controlVals, treatmentVals) {
    if (controlVals.length < 2 || treatmentVals.length < 2) return { pValue: null, sig: '-' };
    const nc = controlVals.length, nt = treatmentVals.length;
    const mc = getMean(controlVals), mt = getMean(treatmentVals);
    const ssc = controlVals.reduce((s, v) => s + Math.pow(v - mc, 2), 0);
    const sst = treatmentVals.reduce((s, v) => s + Math.pow(v - mt, 2), 0);
    const pooledVar = (ssc + sst) / (nc + nt - 2);
    if (pooledVar === 0) return { pValue: mc === mt ? 1 : 0.00001, sig: mc === mt ? 'ns' : '***' };
    const se = Math.sqrt(pooledVar * (1 / nc + 1 / nt));
    const t = Math.abs(mc - mt) / se;
    const df = nc + nt - 2;
    const pValue = 2 * (1 - jStat.studentt.cdf(t, df));
    return { pValue, sig: pValue < 0.001 ? '***' : pValue < 0.01 ? '**' : pValue < 0.05 ? '*' : 'ns' };
  }

  function runStatisticsAtDay(groups, day, grp1Name, grp2Name, method = 'welch') {
    const vals1 = groups[grp1Name].map(s => s.vols[day]).filter(v => v !== undefined && !isNaN(v));
    const vals2 = groups[grp2Name].map(s => s.vols[day]).filter(v => v !== undefined && !isNaN(v));
    const mean1 = getMean(vals1), sem1 = getSEM(vals1), sd1 = getSD(vals1);
    const mean2 = getMean(vals2), sem2 = getSEM(vals2), sd2 = getSD(vals2);
    let test;
    if (method === 'mann-whitney') test = mannWhitneyU(vals1, vals2);
    else if (method === 'dunnett') test = dunnettTest(vals1, vals2);
    else test = welchTTest(vals1, vals2);
    return { day, mean1, sem1, sd1, n1: vals1.length, mean2, sem2, sd2, n2: vals2.length, ...test };
  }

  return {
    getMean, getMedian, getSEM, getSD, getNearestDay,
    calcSubjectNormAUC, calculateGroupMetrics, calcGroupStats,
    calcBodyWeightStats, calcNecropsyStats,
    welchTTest, mannWhitneyU, oneWayANOVA, dunnettTest, runStatisticsAtDay
  };
})();
