import { Router } from 'express';
import { getSession, setSession } from '../services/sessionStore.js';
import { analyseReverseEngineer } from '../services/claudeService.js';
import { generateReverseEngineerReport } from '../services/exportService.js';

const router = Router();

// POST /api/reverseengineer/analyse
router.post('/analyse', async (req, res) => {
  try {
    const { uploadId, components: clientComp, fieldDevices: clientFD } = req.body;
    const session = getSession(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const result = await analyseReverseEngineer({
      extractedText: session.extractedText,
      components: session.components || clientComp || [],
      fieldDevices: session.fieldDevices?.fieldDevices || clientFD || []
    });

    setSession(uploadId + '_reverseengineer', result);
    res.json(result);
  } catch (err) {
    console.error('Reverse engineer error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reverseengineer/export
router.post('/export', async (req, res) => {
  try {
    const { uploadId } = req.body;
    const result = getSession(uploadId + '_reverseengineer');
    if (!result) return res.status(404).json({ error: 'Run reverse engineering analysis first' });

    const buffer = await generateReverseEngineerReport(result);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="ElecDocs-Reverse-Engineer-Report.docx"');
    res.send(buffer);
  } catch (err) {
    console.error('Export reverse engineer error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
