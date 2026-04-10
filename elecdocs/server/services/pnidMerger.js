/**
 * Merges multiple batch P&ID extraction results into one deduplicated result.
 */

export function mergePnidResults(batches) {
  const merged = {
    instruments: deduplicateByTag([].concat(...batches.map(b => b.instruments || []))),
    valves: deduplicateByTag([].concat(...batches.map(b => b.valves || []))),
    equipment: deduplicateByTag([].concat(...batches.map(b => b.equipment || []))),
    processLines: deduplicateByLineId([].concat(...batches.map(b => b.processLines || []))),
    controlLoops: deduplicateByLoopId([].concat(...batches.map(b => b.controlLoops || []))),
    interlocks: deduplicateByKey([].concat(...batches.map(b => b.interlocks || [])), 'interlockId'),
    summary: {}
  };

  merged.summary = {
    totalInstruments: merged.instruments.length,
    totalValves: merged.valves.length,
    totalEquipment: merged.equipment.length,
    totalProcessLines: merged.processLines.length,
    totalControlLoops: merged.controlLoops.length,
    totalInterlocks: merged.interlocks.length,
    safetyCriticalInstruments: merged.instruments.filter(i => i.isSafetyCritical).length,
    safetyCriticalValves: merged.valves.filter(v => v.isSafetyCritical).length,
    dataQuality: batches.some(b => b.summary?.dataQuality === 'low') ? 'low'
               : batches.some(b => b.summary?.dataQuality === 'medium') ? 'medium' : 'high'
  };

  return merged;
}

function deduplicateByTag(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.tag;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      mergeFields(map.get(key), item);
    }
  }
  return Array.from(map.values());
}

function deduplicateByKey(items, keyField) {
  const map = new Map();
  for (const item of items) {
    const key = item[keyField];
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      mergeFields(map.get(key), item);
    }
  }
  return Array.from(map.values());
}

function deduplicateByLineId(lines) {
  const map = new Map();
  for (const line of lines) {
    const key = line.lineId;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { ...line, instruments: [...(line.instruments || [])], valves: [...(line.valves || [])] });
    } else {
      const existing = map.get(key);
      existing.instruments = [...new Set([...existing.instruments, ...(line.instruments || [])])];
      existing.valves = [...new Set([...existing.valves, ...(line.valves || [])])];
      existing.notes = ((existing.notes || '') + ' [NOTE: line continues across multiple sheets]').trim();
    }
  }
  return Array.from(map.values());
}

function deduplicateByLoopId(loops) {
  const map = new Map();
  for (const loop of loops) {
    const key = loop.loopId;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { ...loop });
    } else {
      const existing = map.get(key);
      for (const field of Object.keys(loop)) {
        if (!existing[field] && loop[field]) existing[field] = loop[field];
      }
      existing.notes = ((existing.notes || '') + ' [NOTE: loop elements span multiple sheets]').trim();
    }
  }
  return Array.from(map.values());
}

function mergeFields(existing, incoming) {
  for (const field of Object.keys(incoming)) {
    if (field === 'notes') continue;
    if (!existing[field] && incoming[field]) {
      existing[field] = incoming[field];
    } else if (existing[field] && incoming[field] && existing[field] !== incoming[field]) {
      existing[field] = `${existing[field]} | ${incoming[field]}`;
      existing.notes = ((existing.notes || '') + ` [NOTE: conflicting ${field} across sheets]`).trim();
    }
  }
}
