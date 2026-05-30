// CRO data converter - parses various CSV/TSV formats into XenograftMaster internal format

const CSVParser = (() => {
  function detectDelimiter(text) {
    const sample = text.split('\n').slice(0, 5).join('\n');
    const counts = {
      '\t': (sample.match(/\t/g) || []).length,
      ',': (sample.match(/,/g) || []).length,
      ';': (sample.match(/;/g) || []).length
    };
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  function parseCSV(text, delimiter) {
    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim() !== '');
    return lines.map(line => {
      const cells = [];
      let current = '', inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === delimiter && !inQuote) { cells.push(current.trim()); current = ''; }
        else { current += ch; }
      }
      cells.push(current.trim());
      return cells;
    });
  }

  function findHeaderRow(rows) {
    const keywords = ['subject', 'id', 'group', 'day', 'animal', 'mouse', 'rat', 'tumor', 'vol', 'bw', 'body'];
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const rowText = rows[i].join(' ').toLowerCase();
      const matches = keywords.filter(k => rowText.includes(k));
      if (matches.length >= 2) return i;
    }
    return 0;
  }

  function classifyColumn(header) {
    const h = header.toLowerCase().trim();
    if (!h) return { type: 'unknown' };

    // Subject ID
    if (h.includes('subject') || h === 'id' || h === 'animal id' || h === 'mouse' || h === 'animal') {
      return { type: 'subjectId' };
    }
    // Group
    if (h.includes('group') || h === 'treatment' || h === 'arm') {
      return { type: 'group' };
    }
    // Day + Tumor Volume
    const tvPatterns = [/day\s*(\d+)\s*(?:tv|vol|tumor|volume|mm)?/i, /^(\d+)\s*(?:tv|vol|mm)$/i, /tv\s*(\d+)/i];
    for (const pat of tvPatterns) {
      const m = h.match(pat);
      if (m) return { type: 'tumorVolume', day: parseInt(m[1]) };
    }
    // Day + Body Weight
    const bwPatterns = [/day\s*(\d+)\s*(?:bw|body|weight|g$)/i, /^(\d+)\s*(?:bw|body|g)$/i, /bw\s*(\d+)/i];
    for (const pat of bwPatterns) {
      const m = h.match(pat);
      if (m) return { type: 'bodyWeight', day: parseInt(m[1]) };
    }
    // Plain day number (ambiguous - default to tumorVolume)
    const dayMatch = h.match(/^day\s*(\d+)$/i) || h.match(/^(\d+)$/);
    if (dayMatch) return { type: 'tumorVolume', day: parseInt(dayMatch[1]) };

    return { type: 'unknown', header };
  }

  function parse(text) {
    const delimiter = detectDelimiter(text);
    const rows = parseCSV(text, delimiter);
    if (rows.length < 2) return { error: '데이터가 너무 적습니다 (최소 헤더 + 1행 필요).' };

    const headerRowIdx = findHeaderRow(rows);
    const headers = rows[headerRowIdx].map(h => h.replace(/^"|"$/g, '').trim());
    const dataRows = rows.slice(headerRowIdx + 1).filter(r => r.some(c => c.trim() !== ''));

    const columnMap = headers.map((h, i) => ({ index: i, header: h, ...classifyColumn(h) }));

    const subjectCol = columnMap.find(c => c.type === 'subjectId');
    const groupCol = columnMap.find(c => c.type === 'group');
    const tvCols = columnMap.filter(c => c.type === 'tumorVolume').sort((a, b) => a.day - b.day);
    const bwCols = columnMap.filter(c => c.type === 'bodyWeight').sort((a, b) => a.day - b.day);

    const records = dataRows.map(row => {
      const rec = {
        subjectId: subjectCol ? (row[subjectCol.index] || '') : '',
        group: groupCol ? (row[groupCol.index] || '') : '',
        tumorVolumes: {},
        bodyWeights: {}
      };
      tvCols.forEach(c => {
        const val = parseFloat(row[c.index]);
        if (!isNaN(val)) rec.tumorVolumes[c.day] = val;
      });
      bwCols.forEach(c => {
        const val = parseFloat(row[c.index]);
        if (!isNaN(val)) rec.bodyWeights[c.day] = val;
      });
      return rec;
    }).filter(r => r.subjectId || r.group);

    // Warnings
    const warnings = [];
    records.forEach(r => {
      Object.entries(r.tumorVolumes).forEach(([day, val]) => {
        if (val < 0) warnings.push(`${r.subjectId}: Day ${day} 종양 부피가 음수 (${val})`);
        if (val > 10000) warnings.push(`${r.subjectId}: Day ${day} 종양 부피가 비정상적으로 큼 (${val} mm³)`);
      });
    });

    return {
      headers,
      columnMap,
      records,
      tvDays: tvCols.map(c => c.day),
      bwDays: bwCols.map(c => c.day),
      warnings,
      subjectColIndex: subjectCol?.index ?? null,
      groupColIndex: groupCol?.index ?? null
    };
  }

  return { parse, classifyColumn, detectDelimiter };
})();
