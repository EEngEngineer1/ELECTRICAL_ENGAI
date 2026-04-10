import { Router } from 'express';
import { getSession } from '../services/sessionStore.js';
import { loadSkill } from '../services/skillLoader.js';
import { generateComplianceMatrix, generateExecutiveSummary } from '../services/claudeService.js';
import { generateGapReport, generateProcessControlReport } from '../services/exportService.js';

const router = Router();

/**
 * Deterministic coverage computation using already-extracted field devices
 * and instruments. Replaces the unreliable Claude-based coverage analysis.
 */
function computeCoverageServerSide(fieldDeviceData, reqIds, session) {
  const fieldDevices = fieldDeviceData?.fieldDevices || [];

  // Collect all instruments from session requirements (generated on Instrumentation page)
  const allInstruments = [];
  for (const reqId of reqIds) {
    const reqData = session.requirements.get(reqId);
    if (reqData?.instruments?.instruments) {
      allInstruments.push(...reqData.instruments.instruments);
    }
  }

  // Build field device lookup by tag
  const fdByTag = new Map();
  for (const fd of fieldDevices) {
    const fdTag = (fd.tagNumber || fd.tag || '').toUpperCase();
    if (fdTag) fdByTag.set(fdTag, fd);
  }

  // --- Instrumentation Coverage: match required instruments against field devices ---
  let instMatched = 0, instMissing = 0;
  const matchedItems = [];
  const missingItems = [];

  for (const inst of allInstruments) {
    const tag = (inst.tagNumber || inst.tag || '').toUpperCase();
    const fd = fdByTag.get(tag);
    if (fd) {
      instMatched++;
      matchedItems.push({
        tagNumber: inst.tagNumber || inst.tag || '',
        description: inst.description || '',
        schematicEvidence: `Found as ${fd.tagNumber || fd.tag} (${fd.deviceType || fd.type || 'device'}) in schematic`
      });
    } else {
      instMissing++;
      missingItems.push({
        tagNumber: inst.tagNumber || inst.tag || '',
        description: inst.description || '',
        isSafetyCritical: inst.isSafetyCritical || false,
        clauseRef: inst.clauseRef || '',
        missingReason: 'Not found in extracted field devices'
      });
    }
  }

  const totalSpecified = allInstruments.length;
  const instrumentationCoverage = {
    totalSpecified,
    matched: instMatched,
    missing: instMissing,
    coveragePercent: totalSpecified > 0 ? Math.round(instMatched / totalSpecified * 100) : 0,
    matchedItems,
    missingItems
  };

  // --- Field Device Coverage: trace field devices back to instrument requirements ---
  const requiredTags = new Set(
    allInstruments.map(inst => (inst.tagNumber || inst.tag || '').toUpperCase()).filter(Boolean)
  );

  let traced = 0, untraced = 0;
  const tracedItems = [];
  const untracedItems = [];

  for (const fd of fieldDevices) {
    const tag = (fd.tagNumber || fd.tag || '').toUpperCase();
    if (requiredTags.has(tag)) {
      traced++;
      tracedItems.push({
        tagNumber: fd.tagNumber || fd.tag || '',
        description: fd.description || '',
        tracedToReq: 'Matches required instrument'
      });
    } else {
      untraced++;
      untracedItems.push({
        tagNumber: fd.tagNumber || fd.tag || '',
        description: fd.description || '',
        reason: 'No matching instrument requirement found'
      });
    }
  }

  const fieldDeviceCoverage = {
    totalInSchematic: fieldDevices.length,
    tracedToRequirements: traced,
    untraced,
    tracedItems,
    untracedItems
  };

  return { instrumentationCoverage, fieldDeviceCoverage };
}

// POST /api/crossref/analyse
router.post('/analyse', async (req, res) => {
  try {
    const { uploadId, reqIds, fieldDevices: clientFD, components: clientComp } = req.body;
    const session = getSession(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const requirements = [];
    for (const reqId of reqIds) {
      const reqData = session.requirements.get(reqId);
      if (reqData) requirements.push(reqData);
    }

    if (requirements.length === 0) {
      return res.status(400).json({ error: 'No requirements found' });
    }

    // Use session data, fall back to client-provided data
    const fd = session.fieldDevices || (clientFD?.length ? { fieldDevices: clientFD } : null);
    const comp = session.components || clientComp || [];

    const systemPrompt = loadSkill('gap-analysis-reporter') + '\n\n' + loadSkill('urs-fds-parser');

    const matrix = await generateComplianceMatrix({
      images: session.pageImages,
      extractedText: session.extractedText,
      fieldDevices: fd,
      requirements,
      systemPrompt
    });

    // Override Claude's unreliable coverage with deterministic server-side computation
    const serverCoverage = computeCoverageServerSide(fd, reqIds, session);
    matrix.instrumentationCoverage = serverCoverage.instrumentationCoverage;
    matrix.fieldDeviceCoverage = serverCoverage.fieldDeviceCoverage;

    // Update summary with accurate coverage data
    matrix.summary.missingInstruments = serverCoverage.instrumentationCoverage.missing;
    matrix.summary.untracedDevices = serverCoverage.fieldDeviceCoverage.untraced;

    session.complianceMatrix = matrix;
    res.json(matrix);
  } catch (err) {
    console.error('Cross-reference error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/export/gapreport
router.post('/export/gapreport', async (req, res) => {
  try {
    const { uploadId } = req.body;
    const session = getSession(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!session.complianceMatrix) return res.status(400).json({ error: 'Run analysis first' });

    const summary = await generateExecutiveSummary(session.complianceMatrix);
    const buffer = await generateGapReport(session.complianceMatrix, summary, session);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="ElecDocs-Gap-Analysis-Report.docx"');
    res.send(buffer);
  } catch (err) {
    console.error('Export gap report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/export/instrumentation
router.post('/export/instrumentation', async (req, res) => {
  try {
    const { uploadId } = req.body;
    const session = getSession(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const { generateInstrumentationReport } = await import('../services/exportService.js');
    const buffer = await generateInstrumentationReport(session);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="ElecDocs-Instrumentation-Report.docx"');
    res.send(buffer);
  } catch (err) {
    console.error('Export instrumentation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/export/processcontrol
router.post('/export/processcontrol', async (req, res) => {
  try {
    const { uploadId } = req.body;
    const result = getSession(uploadId + '_processcontrol');
    if (!result) return res.status(404).json({ error: 'Run process control analysis first' });

    const buffer = await generateProcessControlReport(result);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="ElecDocs-Process-Control-Report.docx"');
    res.send(buffer);
  } catch (err) {
    console.error('Export process control error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
