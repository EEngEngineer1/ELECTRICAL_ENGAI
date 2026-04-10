import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType
} from 'docx';

const COLOURS = {
  critical: 'FF0000',
  major: 'FF8C00',
  minor: '808080',
  met: '228B22',
  partial: 'FF8C00',
  not_met: 'FF0000',
  conflict: 'FF4500'
};

/**
 * Generates the 13-section gap analysis Word report.
 */
export async function generateGapReport(matrix, executiveSummary, session) {
  const sections = [];

  // 1. Cover page
  sections.push(
    heading('ElecDocs Gap Analysis Report', HeadingLevel.TITLE),
    para(`Generated: ${new Date().toLocaleDateString('en-GB')}`),
    para(`Project: ElecDocs Compliance Analysis`),
    para('')
  );

  // 2. Executive Summary
  sections.push(heading('Executive Summary', HeadingLevel.HEADING_1));
  sections.push(...executiveSummary.split('\n').map(line => para(line)));

  // 3. Document Register
  sections.push(heading('Document Register', HeadingLevel.HEADING_1));
  sections.push(para('Documents analysed in this report:'));
  sections.push(para(`• Electrical Schematic (${session.pageCount} pages, ${session.pageFormat})`));

  // 4. Overall Compliance Score
  sections.push(heading('Overall Compliance Score', HeadingLevel.HEADING_1));
  const summary = matrix.summary || {};
  sections.push(para(`Overall Compliance: ${summary.overallCompliancePercent || 0}%`));
  sections.push(para(`Total Requirements: ${summary.totalRequirements || 0}`));
  sections.push(para(`Met: ${summary.metInBoth || 0} | Partial: ${summary.partial || 0} | Not Met: ${summary.metInNeither || 0}`));
  sections.push(para(`Conflicts: ${summary.conflicts || 0} (Critical: ${summary.criticalConflicts || 0})`));

  // 5. Requirements Cross-Reference Matrix
  sections.push(heading('Requirements Cross-Reference Matrix', HeadingLevel.HEADING_1));
  const reqs = matrix.requirements || [];
  if (reqs.length > 0) {
    sections.push(buildReqTable(reqs));
  }

  // 6. Conflict Detail Sections
  sections.push(heading('Conflict Details', HeadingLevel.HEADING_1));
  const conflicts = matrix.conflicts || [];
  for (const c of conflicts.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))) {
    sections.push(heading(`${c.severity.toUpperCase()}: ${c.conflictId}`, HeadingLevel.HEADING_2));
    sections.push(para(`Requirements: ${(c.reqIds || []).join(', ')}`));
    sections.push(para(`Description: ${c.description}`));
    if (c.aiSuggestion) sections.push(para(`Recommendation: ${c.aiSuggestion}`));
    if (c.standardsRefs?.length) sections.push(para(`Standards: ${c.standardsRefs.join(', ')}`));
  }

  // 7. Instrumentation Coverage Summary
  sections.push(heading('Instrumentation Coverage Summary', HeadingLevel.HEADING_1));
  const ic = matrix.instrumentationCoverage || {};
  sections.push(para(`${ic.matched || 0} of ${ic.totalSpecified || 0} specified instruments found (${ic.coveragePercent || 0}%)`));

  // 8. Field Device Coverage
  sections.push(heading('Field Device Coverage', HeadingLevel.HEADING_1));
  const fdc = matrix.fieldDeviceCoverage || {};
  sections.push(para(`Total in schematic: ${fdc.totalInSchematic || 0}`));
  sections.push(para(`Traced to requirements: ${fdc.tracedToRequirements || 0}`));

  // 9. Recommended Actions
  sections.push(heading('Recommended Actions', HeadingLevel.HEADING_1));
  for (const c of conflicts) {
    if (c.aiSuggestion) {
      sections.push(para(`[${c.severity.toUpperCase()}] ${c.conflictId}: ${c.aiSuggestion}`));
    }
  }

  // 10-13. Appendices
  sections.push(heading('Appendix A: Full Component List', HeadingLevel.HEADING_1));
  sections.push(para('See extracted component data in ElecDocs application.'));

  sections.push(heading('Appendix B: Full I/O Reconciliation Table', HeadingLevel.HEADING_1));
  sections.push(para('See I/O signal data in ElecDocs application.'));

  sections.push(heading('Appendix C: Full Instrumentation List', HeadingLevel.HEADING_1));
  sections.push(para('See instrumentation data in ElecDocs application.'));

  sections.push(heading('Appendix D: Full Field Device List', HeadingLevel.HEADING_1));
  sections.push(para('See field device data in ElecDocs application.'));

  const doc = new Document({
    sections: [{ children: sections }]
  });

  return await Packer.toBuffer(doc);
}

/**
 * Generates an instrumentation report Word document.
 */
export async function generateInstrumentationReport(session) {
  const sections = [];
  sections.push(heading('ElecDocs Instrumentation Report', HeadingLevel.TITLE));
  sections.push(para(`Generated: ${new Date().toLocaleDateString('en-GB')}`));
  sections.push(para(''));

  sections.push(heading('Instrumentation Summary', HeadingLevel.HEADING_1));

  // Collect all instruments from requirements
  const allInstruments = [];
  for (const [, reqData] of session.requirements) {
    if (reqData.instruments?.instruments) {
      allInstruments.push(...reqData.instruments.instruments);
    }
  }

  sections.push(para(`Total instruments: ${allInstruments.length}`));

  if (allInstruments.length > 0) {
    const rows = [
      tableRow(['Tag', 'Description', 'Type', 'Variable', 'Source', 'Coverage'], true),
      ...allInstruments.map(inst => tableRow([
        inst.tagNumber || '', inst.description || '', inst.instrumentType || '',
        inst.processVariable || '', inst.sourceDocRef || '', inst.coverageStatus || 'unverified'
      ]))
    ];
    sections.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  const doc = new Document({ sections: [{ children: sections }] });
  return await Packer.toBuffer(doc);
}

/**
 * Generates a Process Control Report Word document.
 */
export async function generateProcessControlReport(result) {
  const sections = [];
  sections.push(heading('ElecDocs Process Control Report', HeadingLevel.TITLE));
  sections.push(para(`Generated: ${new Date().toLocaleDateString('en-GB')}`));

  // Section 1: Overview
  sections.push(heading('Plain English Overview', HeadingLevel.HEADING_1));
  sections.push(para(result.overview || 'No overview available.'));

  // Section 2: Control Loops
  sections.push(heading('Control Loop Breakdown', HeadingLevel.HEADING_1));
  const loops = result.controlLoops || [];
  if (loops.length === 0) {
    sections.push(para('No formal control loops were identified in this schematic.'));
  } else {
    for (const loop of loops) {
      sections.push(heading(`${loop.loopId} — ${loop.processVariable || 'Unknown'}`, HeadingLevel.HEADING_2));
      sections.push(para(`Sensor: ${loop.sensor?.tag || 'N/A'} (${loop.sensor?.signalType || ''} ${loop.sensor?.range || ''})`));
      sections.push(para(`Controller: ${loop.controller?.ref || 'N/A'} (${loop.controller?.type || ''})`));
      sections.push(para(`Final Element: ${loop.finalElement?.tag || 'N/A'} — ${loop.finalElement?.action || ''}`));
      sections.push(para(`Loop Type: ${loop.loopType || 'unknown'} | Setpoint: ${loop.setpoint || 'Not shown'}`));
      if (loop.notes) sections.push(para(`Notes: ${loop.notes}`));
    }
  }

  // Section 3: Safety Analysis
  sections.push(heading('Safety Failure Analysis', HeadingLevel.HEADING_1));
  const gaps = result.safetyGapSummary || [];
  if (gaps.length > 0) {
    sections.push(para('SAFETY GAPS IDENTIFIED:'));
    for (const gap of gaps) sections.push(para(`  ! ${gap}`));
    sections.push(para(''));
  }
  const safety = result.safetyAnalysis || [];
  if (safety.length > 0) {
    const rows = [
      tableRow(['Reference', 'Failure Mode', 'Consequence', 'Severity', 'Mitigation', 'Gap'], true),
      ...safety.map(s => tableRow([
        s.ref || '', s.failureMode || '', s.consequence || '',
        s.severity || '', s.mitigation || '', s.safetyGap ? 'YES' : ''
      ]))
    ];
    sections.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  const doc = new Document({ sections: [{ children: sections }] });
  return await Packer.toBuffer(doc);
}

/**
 * Generates a Reverse Engineering Report Word document.
 */
export async function generateReverseEngineerReport(result) {
  const sections = [];
  sections.push(heading('ElecDocs Reverse Engineering Report', HeadingLevel.TITLE));
  sections.push(para(`Generated: ${new Date().toLocaleDateString('en-GB')}`));

  // Section 1: System Description
  sections.push(heading('System Description', HeadingLevel.HEADING_1));
  sections.push(para(result.systemDescription || 'No description available.'));

  // Section 2: Structured Data
  sections.push(heading('Structured Data', HeadingLevel.HEADING_1));

  const sd = result.structuredData || {};

  sections.push(heading('Equipment Register', HeadingLevel.HEADING_2));
  const equip = sd.equipmentRegister || [];
  if (equip.length > 0) {
    const rows = [
      tableRow(['Tag', 'Description', 'Type', 'Manufacturer', 'Location', 'I/O Ref'], true),
      ...equip.map(e => tableRow([e.tag || '', e.description || '', e.type || '', e.manufacturer || '', e.location || '', e.ioRef || '']))
    ];
    sections.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  sections.push(heading('Loop Schedule', HeadingLevel.HEADING_2));
  const loops = sd.loopSchedule || [];
  if (loops.length > 0) {
    const rows = [
      tableRow(['Loop', 'Description', 'Process Variable', 'Transmitter', 'Controller', 'Final Element'], true),
      ...loops.map(l => tableRow([l.loopNumber || '', l.description || '', l.processVariable || '', l.transmitterTag || '', l.controllerRef || '', l.finalElementTag || '']))
    ];
    sections.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  } else {
    sections.push(para('No control loops identified.'));
  }

  sections.push(heading('Cable/Signal Schedule', HeadingLevel.HEADING_2));
  const cables = sd.cableSchedule || [];
  if (cables.length > 0) {
    const rows = [
      tableRow(['From Tag', 'From Terminal', 'Cable Ref', 'To Tag', 'To Terminal', 'Signal Type', 'Notes'], true),
      ...cables.map(c => tableRow([c.fromTag || '', c.fromTerminal || '', c.cableRef || '', c.toTag || '', c.toTerminal || '', c.signalType || '', c.notes || '']))
    ];
    sections.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  // Section 3: Design Intent
  sections.push(heading('Design Intent', HeadingLevel.HEADING_1));
  sections.push(para(result.designIntent || 'No design intent analysis available.'));

  // Section 4: Suggested Specification
  sections.push(heading('Suggested Specification', HeadingLevel.HEADING_1));
  sections.push(new Paragraph({
    children: [new TextRun({ text: 'DISCLAIMER: This is an AI-generated draft specification reconstructed from the schematic. It must be reviewed, verified, and approved by a qualified engineer before use as a formal project document.', bold: true, color: 'B45309' })],
    spacing: { after: 200 }
  }));

  const spec = result.suggestedSpec || {};

  sections.push(heading('Suggested URS', HeadingLevel.HEADING_2));
  const urs = spec.urs || [];
  if (urs.length > 0) {
    const rows = [
      tableRow(['Req ID', 'Requirement', 'Classification', 'Priority', 'Evidence'], true),
      ...urs.map(r => tableRow([r.reqId || '', r.text || '', r.classification || '', r.priority || '', r.evidence || '']))
    ];
    sections.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  sections.push(heading('Suggested FDS', HeadingLevel.HEADING_2));
  const fdsText = spec.fds || 'No FDS content generated.';
  for (const line of fdsText.split('\n')) {
    sections.push(para(line));
  }

  const doc = new Document({ sections: [{ children: sections }] });
  return await Packer.toBuffer(doc);
}

/**
 * Generates a P&ID Analysis Report Word document.
 */
export async function generatePnidReport(analysis, crossref) {
  const sections = [];
  sections.push(heading('ElecDocs P&ID Analysis Report', HeadingLevel.TITLE));
  sections.push(para(`Generated: ${new Date().toLocaleDateString('en-GB')}`));
  sections.push(para(''));

  // 1. Instrument Register
  sections.push(heading('Instrument Register', HeadingLevel.HEADING_1));
  const instruments = analysis.instruments || [];
  const safetyFirst = [...instruments].sort((a, b) => (b.isSafetyCritical ? 1 : 0) - (a.isSafetyCritical ? 1 : 0));
  if (safetyFirst.length > 0) {
    sections.push(new Table({
      rows: [
        tableRow(['Tag', 'Service', 'Variable', 'Function', 'Mounting', 'Signal', 'Safety', 'Notes'], true),
        ...safetyFirst.map(i => tableRow([
          i.tag || '', i.service || '', i.measuredVariable || '', i.function || '',
          i.mounting || '', i.signalType || '', i.isSafetyCritical ? 'YES' : '', i.notes || ''
        ]))
      ], width: { size: 100, type: WidthType.PERCENTAGE }
    }));
  } else { sections.push(para('No instruments found.')); }

  // 2. Valve Register
  sections.push(heading('Valve and Final Element Register', HeadingLevel.HEADING_1));
  const valves = analysis.valves || [];
  if (valves.length > 0) {
    sections.push(new Table({
      rows: [
        tableRow(['Tag', 'Type', 'Actuator', 'Fail Pos', 'Normal Pos', 'Line', 'Controller', 'Notes'], true),
        ...valves.map(v => tableRow([
          v.tag || '', v.type || '', v.actuatorType || '', v.failPosition || '',
          v.normalPosition || '', v.line || '', v.associatedController || '', v.notes || ''
        ]))
      ], width: { size: 100, type: WidthType.PERCENTAGE }
    }));
  } else { sections.push(para('No valves found.')); }

  // 3. Equipment Register
  sections.push(heading('Equipment Register', HeadingLevel.HEADING_1));
  const equip = analysis.equipment || [];
  if (equip.length > 0) {
    sections.push(new Table({
      rows: [
        tableRow(['Tag', 'Type', 'Service', 'Parameters', 'Connections', 'Notes'], true),
        ...equip.map(e => tableRow([
          e.tag || '', e.type || '', e.service || '', e.keyParameters || '',
          (e.connections || []).join(', '), e.notes || ''
        ]))
      ], width: { size: 100, type: WidthType.PERCENTAGE }
    }));
  } else { sections.push(para('No equipment found.')); }

  // 4. Process Lines
  sections.push(heading('Process Line Summary', HeadingLevel.HEADING_1));
  const lines = analysis.processLines || [];
  if (lines.length > 0) {
    sections.push(new Table({
      rows: [
        tableRow(['Line ID', 'Fluid Service', 'Size/Spec', 'Flow', 'Instruments', 'Valves', 'Notes'], true),
        ...lines.map(l => tableRow([
          l.lineId || '', l.fluidService || '', l.sizeSpec || '', l.flowDirection || '',
          (l.instruments || []).join(', '), (l.valves || []).join(', '), l.notes || ''
        ]))
      ], width: { size: 100, type: WidthType.PERCENTAGE }
    }));
  } else { sections.push(para('No process lines found.')); }

  // 5. Control Loops
  sections.push(heading('Control Loop Summary', HeadingLevel.HEADING_1));
  const loops = analysis.controlLoops || [];
  if (loops.length > 0) {
    for (const loop of loops) {
      sections.push(heading(`${loop.loopId} — ${loop.processVariable || 'Unknown'}`, HeadingLevel.HEADING_2));
      sections.push(para(`Measurement: ${loop.measurementElement || 'N/A'}`));
      sections.push(para(`Transmitter: ${loop.transmitter || 'N/A'}`));
      sections.push(para(`Controller: ${loop.controller?.tag || 'N/A'} (${loop.controller?.type || ''})`));
      sections.push(para(`Final Element: ${loop.finalElement?.tag || 'N/A'} — ${loop.finalElement?.type || ''}, ${loop.finalElement?.failPosition || ''}`));
      sections.push(para(`Setpoint: ${loop.setpointSource || 'N/A'}${loop.cascadeFrom ? ' (cascade from ' + loop.cascadeFrom + ')' : ''}`));
      if (loop.notes) sections.push(para(`Notes: ${loop.notes}`));
    }
  } else { sections.push(para('No control loops found.')); }

  // 6. Interlocks
  sections.push(heading('Interlocks and Safety Functions', HeadingLevel.HEADING_1));
  const interlocks = analysis.interlocks || [];
  const sifs = interlocks.filter(i => i.type === 'SIF' || i.type === 'ESD');
  const proc = interlocks.filter(i => i.type !== 'SIF' && i.type !== 'ESD');
  const allInterlocks = [...sifs, ...proc];
  if (allInterlocks.length > 0) {
    sections.push(new Table({
      rows: [
        tableRow(['ID', 'Type', 'Initiator', 'Trip Condition', 'Action', 'SIL', 'Notes'], true),
        ...allInterlocks.map(i => tableRow([
          i.interlockId || '', i.type || '', i.initiator || '', i.tripCondition || '',
          i.action || '', i.silRating || '', i.notes || ''
        ]))
      ], width: { size: 100, type: WidthType.PERCENTAGE }
    }));
  } else { sections.push(para('No interlocks found.')); }

  // 7. Schematic Cross-Reference (if available)
  if (crossref?.schematicCrossRef) {
    sections.push(heading('Schematic Cross-Reference', HeadingLevel.HEADING_1));
    sections.push(para('Green = matched | Amber = tag/description match | Red = missing'));
    const matches = crossref.schematicCrossRef.matches || [];
    if (matches.length > 0) {
      sections.push(new Table({
        rows: [
          tableRow(['P&ID Tag', 'Description', 'Schematic Match', 'Status', 'Discrepancy', 'Safety'], true),
          ...matches.map(m => tableRow([
            m.pnidTag || '', m.pnidDescription || '', m.schematicTag || '',
            m.matchStatus || '', m.discrepancy || '', m.isSafetyCritical ? 'YES' : ''
          ]))
        ], width: { size: 100, type: WidthType.PERCENTAGE }
      }));
    }
    const s = crossref.schematicCrossRef.summary || {};
    sections.push(para(`${s.matched || 0} of ${s.total || 0} P&ID instruments confirmed in electrical schematic`));
  }

  // 8. Requirements Cross-Reference (if available)
  if (crossref?.requirementsCrossRef) {
    sections.push(heading('Requirements Cross-Reference', HeadingLevel.HEADING_1));
    const pvr = crossref.requirementsCrossRef.pnidVsRequirements || [];
    if (pvr.length > 0) {
      sections.push(new Table({
        rows: [
          tableRow(['P&ID Tag', 'Req Ref', 'Requirement', 'Status', 'Discrepancy'], true),
          ...pvr.map(r => tableRow([
            r.pnidTag || '', r.requirementRef || '', (r.requirementText || '').substring(0, 80),
            r.status || '', r.discrepancy || ''
          ]))
        ], width: { size: 100, type: WidthType.PERCENTAGE }
      }));
    }
    const notIn = crossref.requirementsCrossRef.requirementsNotInPnid || [];
    if (notIn.length > 0) {
      sections.push(heading('Requirements Not Addressed in P&ID', HeadingLevel.HEADING_2));
      sections.push(new Table({
        rows: [
          tableRow(['Req Ref', 'Requirement', 'Classification', 'Gap'], true),
          ...notIn.map(r => tableRow([
            r.requirementRef || '', (r.requirementText || '').substring(0, 80),
            r.classification || '', r.gap || ''
          ]))
        ], width: { size: 100, type: WidthType.PERCENTAGE }
      }));
    }
  }

  const doc = new Document({ sections: [{ children: sections }] });
  return await Packer.toBuffer(doc);
}

function heading(text, level) {
  return new Paragraph({ text, heading: level, spacing: { after: 200 } });
}

function para(text) {
  return new Paragraph({ children: [new TextRun(text)], spacing: { after: 120 } });
}

function severityOrder(s) {
  return { critical: 0, major: 1, minor: 2 }[s] ?? 3;
}

function buildReqTable(reqs) {
  const rows = [
    tableRow(['Req ID', 'Source', 'Classification', 'In Schematic', 'Severity'], true),
    ...reqs.map(r => tableRow([
      r.reqId || '', r.source || '', r.classification || '',
      r.metInSchematic || '', r.severity || ''
    ]))
  ];
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function tableRow(cells, isHeader = false) {
  return new TableRow({
    children: cells.map(text => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text, bold: isHeader, size: isHeader ? 22 : 20 })]
      })],
      shading: isHeader ? { type: ShadingType.SOLID, color: '2B579A', fill: '2B579A' } : undefined
    }))
  });
}
