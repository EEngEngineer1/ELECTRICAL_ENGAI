import { Router } from 'express';
import { getSession } from '../services/sessionStore.js';
import { loadSkill } from '../services/skillLoader.js';
import { extractStructuredJSON } from '../services/claudeService.js';

const router = Router();

// POST /api/instruments/generate
router.post('/generate', async (req, res) => {
  try {
    const { uploadId, reqIds } = req.body;
    const session = getSession(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const skill = loadSkill('instrumentation-list-generator');
    const reqContents = reqIds
      .map(id => session.requirements.get(id))
      .filter(Boolean)
      .map(r => `[${r.type}]\n${r.content}`)
      .join('\n\n---\n\n');

    const result = await extractStructuredJSON({
      images: [],
      extractedText: '',
      systemPrompt: skill,
      userPrompt: `Parse these requirement documents and extract a complete instrumentation list. Return JSON with "instruments" array and "summary" object.\n\n${reqContents}`
    });

    // Store instruments in session
    for (const reqId of reqIds) {
      const reqData = session.requirements.get(reqId);
      if (reqData) reqData.instruments = result;
    }

    // If field devices available, auto-verify
    if (session.fieldDevices) {
      verifyCoverage(result, session.fieldDevices);
    }

    res.json(result);
  } catch (err) {
    console.error('Generate instruments error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/instruments/verify
router.post('/verify', async (req, res) => {
  try {
    const { uploadId, reqIds } = req.body;
    const session = getSession(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!session.fieldDevices) return res.status(400).json({ error: 'Field devices not yet extracted' });

    // Collect all instruments from requirements
    const allInstruments = [];
    for (const reqId of reqIds) {
      const reqData = session.requirements.get(reqId);
      if (reqData?.instruments?.instruments) {
        allInstruments.push(...reqData.instruments.instruments);
      }
    }

    const fieldDevices = session.fieldDevices.fieldDevices || [];
    const result = verifyCoverage({ instruments: allInstruments }, session.fieldDevices);

    res.json(result);
  } catch (err) {
    console.error('Verify instruments error:', err);
    res.status(500).json({ error: err.message });
  }
});

function verifyCoverage(instrumentData, fieldDeviceData) {
  const instruments = instrumentData.instruments || [];
  const fieldDevices = fieldDeviceData.fieldDevices || [];

  const fdByTag = new Map();
  for (const fd of fieldDevices) {
    if (fd.tagNumber) fdByTag.set(fd.tagNumber.toUpperCase(), fd);
  }

  let matched = 0, tagOnly = 0, missing = 0;
  const missingItems = [];

  for (const inst of instruments) {
    const tag = (inst.tagNumber || '').toUpperCase();
    const fd = fdByTag.get(tag);

    if (fd) {
      const typeMatch = !inst.instrumentType || !fd.deviceType ||
        inst.instrumentType.toLowerCase() === fd.deviceType.toLowerCase();
      inst.coverageStatus = typeMatch ? 'matched' : 'tag_only';
      inst.schematicTagMatch = fd.tagNumber;
      if (typeMatch) matched++; else tagOnly++;
      fdByTag.delete(tag);
    } else {
      inst.coverageStatus = 'missing';
      missing++;
      missingItems.push({
        instId: inst.id,
        tagNumber: inst.tagNumber,
        description: inst.description,
        isSafetyCritical: inst.isSafetyCritical || false,
        clauseRef: inst.clauseRef || ''
      });
    }
  }

  // Remaining field devices are extras
  const extraInSchematic = fdByTag.size;

  const total = instruments.length;
  return {
    instruments,
    coverage: {
      totalSpecified: total,
      matched,
      partialMatch: tagOnly,
      missing,
      extraInSchematic,
      coveragePercent: total > 0 ? Math.round((matched + tagOnly) / total * 100) : 0,
      missingItems
    }
  };
}

export default router;
