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
