import { Router } from 'express';
import { getSession } from '../services/sessionStore.js';
import { loadSkill } from '../services/skillLoader.js';
import { extractStructuredJSON } from '../services/claudeService.js';

const router = Router();

// POST /api/extract/components
router.post('/components', async (req, res) => {
  try {
    const { uploadId, componentListText, ioListText } = req.body;
    const session = getSession(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    let systemPrompt = loadSkill('component-extractor');
    if (ioListText) {
      systemPrompt += '\n\n' + loadSkill('io-list-extractor');
    }

    let userPrompt = `Extract all components and I/O signals from this electrical schematic. Return JSON with "components", "ioSignals", and "summary" keys matching the required schema.`;
    if (componentListText) userPrompt += `\n\nSupplied component list:\n${componentListText}`;
    if (ioListText) userPrompt += `\n\nSupplied I/O list:\n${ioListText}\n\nAlso reconcile the I/O list against schematic signals.`;

    const result = await extractStructuredJSON({
      images: session.pageImages,
      extractedText: session.extractedText,
      systemPrompt,
      userPrompt
    });

    res.json(result);
  } catch (err) {
    console.error('Extract components error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/extract/fielddevices
router.post('/fielddevices', async (req, res) => {
  try {
    const { uploadId } = req.body;
    const session = getSession(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const skill = loadSkill('field-device-extractor');

    const result = await extractStructuredJSON({
      images: session.pageImages,
      extractedText: session.extractedText,
      systemPrompt: skill,
      userPrompt: 'Extract all field devices from this electrical schematic. Return JSON with "fieldDevices" array and "summary" object matching the required schema.'
    });

    // Store in session for cross-reference
    session.fieldDevices = result;
    res.json(result);
  } catch (err) {
    console.error('Extract field devices error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
