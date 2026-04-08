import { Router } from 'express';
import { getSession } from '../services/sessionStore.js';
import { loadSkill } from '../services/skillLoader.js';
import { generateComplianceMatrix, generateExecutiveSummary } from '../services/claudeService.js';
import { generateGapReport } from '../services/exportService.js';

const router = Router();

// POST /api/crossref/analyse
router.post('/analyse', async (req, res) => {
  try {
    const { uploadId, reqIds } = req.body;
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

    const systemPrompt = loadSkill('gap-analysis-reporter') + '\n\n' + loadSkill('urs-fds-parser');

    const matrix = await generateComplianceMatrix({
      images: session.pageImages,
      extractedText: session.extractedText,
      fieldDevices: session.fieldDevices,
      requirements,
      systemPrompt
    });

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

export default router;
