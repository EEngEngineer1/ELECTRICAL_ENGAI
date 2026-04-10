/**
 * ElecDocs AI Service — uses aiConnector.js for all model calls.
 * All exported function signatures remain unchanged.
 */
import { chat, chatJSON, chatStream, checkHealth } from './aiConnector.js';
import { loadSkill } from './skillLoader.js';

// Check connection on startup
checkHealth().then(h => {
  if (h.ok) console.log(`⚡ AI connected: ${h.model}`);
  else console.warn(`⚠ AI issue: ${h.error}`);
});

// ─── Helpers ─────────────────────────────────────────────────

function getUsableText(text, maxChars = 5000) {
  return (text || '').substring(0, maxChars);
}

// ─── Exports ─────────────────────────────────────────────────

export async function* answerSchematicQuestion({ images, extractedText, question, systemPrompt }) {
  const text = getUsableText(extractedText, 5000);
  const prompt = `You are an expert electrical engineer. Answer concisely in UK English. Reference component designations. No markdown formatting — plain text, numbered lists only.

Schematic data:
${text}

Question: ${question}`;

  for await (const chunk of chatStream(prompt)) {
    yield chunk;
  }
}

export async function extractStructuredJSON({ images, extractedText, systemPrompt, userPrompt }) {
  if (userPrompt.includes('field device') || userPrompt.includes('field-device')) {
    const text = getUsableText(extractedText, 5000);
    return await chatJSON(`${systemPrompt}\n\nSchematic data:\n${text}\n\n${userPrompt}`);
  }

  if (userPrompt.includes('instrument')) {
    const contentMatch = userPrompt.match(/Document content:\n([\s\S]*)$/);
    const docContent = contentMatch ? contentMatch[1] : userPrompt;
    return await extractInstrumentsChunked(docContent, systemPrompt);
  }

  // Component + I/O — sequential to avoid overloading local model
  const text = getUsableText(extractedText, 5000);

  const components = await chatJSON(`Extract EVERY component from this schematic. Include isolators, MCBs, RCBOs, PSUs, PLCs, modules, contactors, relays, switches, VFDs, terminal blocks, enclosures.

Return JSON: {"components": [{"designation":"","description":"","type":"","manufacturer":"","partNumber":"","rating":"","location":"","connections":[],"pages":[],"notes":""}], "summary": {"totalComponents": 0, "manufacturers": [], "panelsList": []}}

Schematic:
${text}`);

  const ioSignals = await chatJSON(`Extract all I/O signals. Look for PLC connections, DI/DO/AI/AO signals.

Return JSON: {"ioSignals": [{"tagNumber":"","description":"","signalType":"DI|DO|AI|AO|PI","range":"","plcAddress":"","panel":"","cableRef":"","terminalFrom":"","terminalTo":"","pages":[],"notes":""}], "summary": {"totalIOSignals": 0, "signalTypeCounts": {"DI":0,"DO":0,"AI":0,"AO":0,"PI":0}}}

Schematic:
${text}`);

  return {
    components: components.components || [],
    ioSignals: ioSignals.ioSignals || [],
    summary: {
      totalComponents: (components.components || []).length,
      totalIOSignals: (ioSignals.ioSignals || []).length,
      manufacturers: components.summary?.manufacturers || [],
      panelsList: components.summary?.panelsList || [],
      signalTypeCounts: ioSignals.summary?.signalTypeCounts || {}
    }
  };
}

async function extractInstrumentsChunked(content, systemPrompt) {
  const MAX_CHUNK = 5000;
  const chunks = [];
  for (let i = 0; i < content.length; i += MAX_CHUNK) {
    chunks.push(content.substring(i, i + MAX_CHUNK));
  }
  if (chunks.length === 0) chunks.push(content);

  console.log(`Instruments: ${content.length} chars → ${chunks.length} chunks`);

  const allInstruments = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  Chunk ${i + 1}/${chunks.length}...`);
    try {
      const result = await chatJSON(`Extract instruments, sensors, transmitters, detectors, switches, valves from this section.

Section ${i + 1}/${chunks.length}:
${chunks[i]}

Return JSON: {"instruments":[{"id":"","tagNumber":"","description":"","instrumentType":"","processVariable":"","location":"","signalType":"","isSafetyCritical":false,"notes":""}]}`);
      if (result?.instruments) allInstruments.push(...result.instruments);
    } catch (err) {
      console.error(`  Chunk ${i + 1} failed:`, err.message);
    }
  }

  // Deduplicate
  const seen = new Set();
  const unique = allInstruments.filter(inst => {
    const key = (inst.tagNumber || inst.description || '').toUpperCase();
    if (key && !seen.has(key)) { seen.add(key); return true; }
    return false;
  });
  unique.forEach((inst, i) => { inst.id = `INST-${String(i + 1).padStart(3, '0')}`; inst.coverageStatus = 'unverified'; });

  const byType = {};
  let safetyCritical = 0;
  for (const inst of unique) {
    byType[inst.instrumentType || 'Unknown'] = (byType[inst.instrumentType || 'Unknown'] || 0) + 1;
    if (inst.isSafetyCritical) safetyCritical++;
  }

  return { instruments: unique, summary: { totalInstruments: unique.length, byType, safetyCriticalCount: safetyCritical } };
}

export async function generateComplianceMatrix({ images, extractedText, fieldDevices, requirements, systemPrompt }) {
  const text = getUsableText(extractedText, 4000);
  const fdSummary = (fieldDevices?.fieldDevices || fieldDevices || [])
    .map(d => `${d.tagNumber || d.tag || '?'}: ${d.deviceType || d.type || ''} - ${d.description || ''}`).join('\n');
  const reqSummary = (requirements || [])
    .map(r => r.content ? r.content.substring(0, 2000) : JSON.stringify(r).substring(0, 500)).join('\n---\n');

  // Sequential to avoid overloading
  const reqResult = await chatJSON(`Check requirements against schematic. Be very concise.

Schematic: ${text}
Requirements: ${reqSummary.substring(0, 4000)}

Return JSON: {"requirements":[{"reqId":"","source":"","clauseRef":"","text":"","metInSchematic":"met|partial|not_met","evidence":"","severity":"","aiSuggestion":"","missingReason":""}]}`);

  const coverageResult = await chatJSON(`Compare field devices vs requirements. Be concise.

Field devices: ${fdSummary}
Requirements: ${reqSummary.substring(0, 3000)}

Return JSON: {"instrumentationCoverage":{"totalSpecified":0,"matched":0,"missing":0,"coveragePercent":0,"matchedItems":[],"missingItems":[]},"fieldDeviceCoverage":{"totalInSchematic":0,"tracedToRequirements":0,"untraced":0,"tracedItems":[],"untracedItems":[]}}`);

  const conflictResult = await chatJSON(`Identify conflicts. Be concise.

Schematic: ${text.substring(0, 3000)}
Field devices: ${fdSummary}

Return JSON: {"conflicts":[{"conflictId":"","severity":"critical|major|minor","reqIds":[],"description":"","aiSuggestion":""}]}`);

  const reqs = reqResult.requirements || [];
  const conflicts = conflictResult.conflicts || [];
  const met = reqs.filter(r => r.metInSchematic === 'met').length;
  const partial = reqs.filter(r => r.metInSchematic === 'partial').length;

  return {
    requirements: reqs,
    instrumentationCoverage: coverageResult.instrumentationCoverage || {},
    fieldDeviceCoverage: coverageResult.fieldDeviceCoverage || {},
    conflicts,
    summary: {
      totalRequirements: reqs.length, metInBoth: met, partial,
      metInNeither: reqs.filter(r => r.metInSchematic === 'not_met').length,
      conflicts: conflicts.length,
      criticalConflicts: conflicts.filter(c => c.severity === 'critical').length,
      majorConflicts: conflicts.filter(c => c.severity === 'major').length,
      minorConflicts: conflicts.filter(c => c.severity === 'minor').length,
      overallCompliancePercent: reqs.length > 0 ? Math.round((met + partial * 0.5) / reqs.length * 100) : 0
    }
  };
}

export async function generateExecutiveSummary(complianceData) {
  return await chat(`Write a professional executive summary in UK English, max 300 words.\n\n${JSON.stringify(complianceData, null, 2)}`);
}

export async function generateSuggestedQuestions({ images, extractedText }) {
  const text = getUsableText(extractedText, 2000);
  try {
    return await chatJSON(`Suggest 5 useful questions about this schematic. Return a JSON array of 5 strings.\n\nSchematic:\n${text}`);
  } catch {
    return ['What are the main protection devices?', 'How is power distributed?', 'What control devices are shown?', 'Are there safety circuits?', 'What field devices connect to the PLC?'];
  }
}

export async function analyseProcessControl({ extractedText }) {
  const text = getUsableText(extractedText, 5000);

  const overview = await chatJSON(`Plain English overview of this control system for a non-engineer. UK English. Use bullet points (•). Structure: opening sentence, "What it does:" bullets, "How it works:" bullets, "Key safety:" bullets.

Schematic: ${text.substring(0, 4000)}

Return JSON: {"overview": "structured text"}`);

  const loops = await chatJSON(`Identify control loops (measurement → controller → final element). Empty array if none.

Schematic: ${text}

Return JSON: {"controlLoops": [{"loopId":"LOOP-001","processVariable":"","sensor":{"tag":"","signalType":"","range":""},"controller":{"ref":"","type":""},"finalElement":{"tag":"","action":""},"loopType":"","setpoint":"","notes":""}]}`);

  const safety = await chatJSON(`Assess safety failure modes. Flag [SAFETY GAP] where no mitigation.

Schematic: ${text}

Return JSON: {"safetyAnalysis": [{"ref":"","failureMode":"","consequence":"","severity":"critical|major|minor","mitigation":"","safetyGap":true}], "safetyGapSummary": ["description"]}`);

  return { overview: overview.overview || '', controlLoops: loops.controlLoops || [], safetyAnalysis: safety.safetyAnalysis || [], safetyGapSummary: safety.safetyGapSummary || [] };
}

export async function analyseReverseEngineer({ extractedText, components, fieldDevices }) {
  const text = getUsableText(extractedText, 5000);
  const compSummary = (components || []).map(c => `${c.designation}: ${c.type} - ${c.manufacturer} (${c.rating || ''})`).join('\n');
  const fdSummary = (fieldDevices || []).map(d => `${d.tagNumber || d.tag || '?'}: ${d.deviceType || ''} - ${d.description || ''}`).join('\n');

  const desc = await chatJSON(`Professional engineering description. UK English. Bullet points (•). Structure: opening paragraph, "System Components:" bullets, "Power Supply:" bullets, "Control:" bullets, "Field Connections:" bullets.

Schematic: ${text.substring(0, 4000)}
Components: ${compSummary}

Return JSON: {"systemDescription": "structured text"}`);

  const data = await chatJSON(`Extract structured data.

Schematic: ${text}
Components: ${compSummary}
Field devices: ${fdSummary}

Return JSON: {"equipmentRegister":[{"tag":"","description":"","type":"","manufacturer":"","location":"","ioRef":""}],"loopSchedule":[{"loopNumber":"","description":"","processVariable":"","transmitterTag":"","controllerRef":"","finalElementTag":""}],"cableSchedule":[{"fromTag":"","fromTerminal":"","cableRef":"","toTag":"","toTerminal":"","signalType":"","notes":""}]}`);

  const intent = await chatJSON(`Design intent. Mark [INFERRED]. Under 400 words. Bullet points (•). Structure: "Engineering Problem:" paragraph, "Key Design Decisions:" bullets, "Safety:" bullets, "Environment:" bullets, "Notable:" bullets.

Schematic: ${text.substring(0, 4000)}
Components: ${compSummary}

Return JSON: {"designIntent": "prose with [INFERRED]"}`);

  const spec = await chatJSON(`Draft URS and FDS. Mark [INFERRED]. UK English.

Schematic: ${text.substring(0, 4000)}
Components: ${compSummary}

Return JSON: {"urs":[{"reqId":"URS-001","text":"The system shall...","classification":"","priority":"","evidence":""}],"fds":"FDS prose"}`);

  return {
    systemDescription: desc.systemDescription || '',
    structuredData: { equipmentRegister: data.equipmentRegister || [], loopSchedule: data.loopSchedule || [], cableSchedule: data.cableSchedule || [] },
    designIntent: intent.designIntent || '',
    suggestedSpec: { urs: spec.urs || [], fds: spec.fds || '' }
  };
}
