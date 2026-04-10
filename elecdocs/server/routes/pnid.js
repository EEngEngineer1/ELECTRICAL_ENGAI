import { Router } from 'express';
import multer from 'multer';
import { join, dirname, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { extractText, rasterisePages, detectPageFormat, calculateDpiMax } from '../services/pdfService.js';
import { getSession, setSession } from '../services/sessionStore.js';
import { loadSkill } from '../services/skillLoader.js';
import { chatJSON as ollamaChatJSON } from '../services/aiConnector.js';
import { mergePnidResults } from '../services/pnidMerger.js';
import { generatePnidReport } from '../services/exportService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

async function chatJSON(prompt, options = {}) {
  if (!GEMINI_KEY) return ollamaChatJSON(prompt, options);
  const parts = [{ text: prompt + '\n\nReturn ONLY valid JSON. No markdown fences.' }];
  if (options.images) {
    for (const img of options.images) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: img } });
    }
  }
  const res = await fetch(GEMINI_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } })
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { instruments: [], valves: [], equipment: [], processLines: [], controlLoops: [], interlocks: [], summary: {} };
  try {
    return JSON.parse(text);
  } catch {
    // Strip markdown fences if present, try again
    const clean = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    return JSON.parse(clean);
  }
}
const upload = multer({
  dest: join(__dirname, '..', 'uploads'),
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 200) * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, extname(file.originalname).toLowerCase() === '.pdf')
});

const router = Router();
const BATCH_SIZE = 1;

// Multer error handler
function handleMulterError(err, req, res, next) {
  if (err) return res.status(400).json({ error: err.message || 'File upload error' });
  next();
}

// POST /api/pnid/upload
router.post('/upload', upload.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (extname(req.file.originalname).toLowerCase() !== '.pdf')
      return res.status(400).json({ error: 'P&ID must be a PDF' });

    const pnidId = uuidv4();
    const absPath = resolve(req.file.path).replace(/\\/g, '/');

    let text, pageCount, pageWidthPt, pageHeightPt, dpiMax, pageFormat, pages, dpiUsed;
    try {
      ({ text, pageCount, pageWidthPt, pageHeightPt } = await extractText(absPath));
      dpiMax = calculateDpiMax(pageWidthPt, pageHeightPt);
      pageFormat = detectPageFormat(pageWidthPt, pageHeightPt);
      const userDpi = req.body.dpi ? parseInt(req.body.dpi, 10) : 96;
      const r = await rasterisePages(absPath, pageWidthPt, pageHeightPt, pageCount, userDpi);
      pages = r.pages; dpiUsed = r.dpiUsed;
      if (pages.every(p => !p)) throw new Error('All pages empty');
    } catch (err) {
      console.warn('P&ID rasterisation failed:', err.message);
      try { ({ text, pageCount, pageWidthPt, pageHeightPt } = await extractText(req.file.path)); }
      catch { text = ''; pageCount = 1; pageWidthPt = 1191; pageHeightPt = 842; }
      dpiMax = calculateDpiMax(pageWidthPt, pageHeightPt);
      pageFormat = detectPageFormat(pageWidthPt, pageHeightPt);
      dpiUsed = 150;
      const placeholder = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=';
      pages = Array(pageCount).fill(placeholder);
    }

    setSession(pnidId, {
      pnid: { images: pages, extractedText: text, pageCount, dpiUsed, dpiMax, pageFormat, pageWidthPt, pageHeightPt, filePath: absPath }
    });

    res.json({ pnidId, pageCount, pageImages: pages, extractedText: text, dpiUsed, dpiMax, pageFormat });
  } catch (err) {
    console.error('P&ID upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pnid/analyse (SSE)
router.post('/analyse', async (req, res) => {
  const { pnidId } = req.body;
  const session = getSession(pnidId);
  if (!session?.pnid) return res.status(404).json({ error: 'P&ID session not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (stage) => res.write(`data: ${JSON.stringify({ stage })}\n\n`);

  // Keep-alive heartbeat to prevent proxy/browser timeout
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);

  try {
    const { images, extractedText } = session.pnid;
    const skill = loadSkill('pnid-analyser');
    const totalPages = images.length;

    // Analyse only first 3 pages for speed, merge later if needed
    const pagesToAnalyse = images.slice(0, Math.min(3, totalPages));

    const batchResults = [];
    for (let pi = 0; pi < pagesToAnalyse.length; pi++) {
      send(`Analysing page ${pi + 1} of ${pagesToAnalyse.length}${totalPages > 3 ? ` (sampling ${pagesToAnalyse.length} of ${totalPages})` : ''}...`);

      const textSnippet = (extractedText || '').substring(pi * 1000, (pi + 1) * 1000).substring(0, 1500);
      const prompt = `${skill}\n\nText from page ${pi + 1}:\n${textSnippet}\n\nAnalyse this P&ID page. Return JSON only.`;

      let result;
      try {
        console.log(`[P&ID] Sending page ${pi + 1} to AI (image size: ${pagesToAnalyse[pi].length} chars)...`);
        result = await chatJSON(prompt, { images: [pagesToAnalyse[pi]] });
        console.log(`[P&ID] Page ${pi + 1} result keys:`, Object.keys(result));
      } catch (e) {
        console.error(`Page ${pi + 1} failed:`, e.message, e.stack?.substring(0, 200));
        result = { instruments: [], valves: [], equipment: [], processLines: [], controlLoops: [], interlocks: [], summary: {} };
      }
      batchResults.push(result);
    }

    send('Merging results...');
    const merged = batchResults.length === 1 ? batchResults[0] : mergePnidResults(batchResults);

    if (!merged.summary) merged.summary = {};
    merged.summary.totalInstruments = (merged.instruments || []).length;
    merged.summary.totalValves = (merged.valves || []).length;
    merged.summary.totalEquipment = (merged.equipment || []).length;
    merged.summary.totalProcessLines = (merged.processLines || []).length;
    merged.summary.totalControlLoops = (merged.controlLoops || []).length;
    merged.summary.totalInterlocks = (merged.interlocks || []).length;

    setSession(pnidId + '_analysis', merged);

    const s = merged.summary;
    send(`Analysis complete — ${s.totalInstruments} instruments, ${s.totalValves} valves, ${s.totalControlLoops} control loops found`);
    res.write(`data: ${JSON.stringify({ result: merged })}\n\n`);
    clearInterval(heartbeat);
    res.end();
  } catch (err) {
    clearInterval(heartbeat);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// POST /api/pnid/crossref (SSE)
router.post('/crossref', async (req, res) => {
  const { pnidId, uploadId, reqIds } = req.body;
  if (!pnidId) return res.status(400).json({ error: 'pnidId required' });
  if (!uploadId && (!reqIds || reqIds.length === 0))
    return res.status(400).json({ error: 'Provide uploadId, reqIds, or both' });

  const pnidAnalysis = getSession(pnidId + '_analysis');
  if (!pnidAnalysis) return res.status(404).json({ error: 'Run P&ID analysis first' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (stage) => res.write(`data: ${JSON.stringify({ stage })}\n\n`);

  try {
    const crossref = { schematicCrossRef: null, requirementsCrossRef: null };

    // Schematic cross-ref
    if (uploadId) {
      send('Comparing P&ID against electrical schematic...');
      const schSession = getSession(uploadId);
      const fieldDevices = schSession?.fieldDevices?.fieldDevices || schSession?.fieldDevices || [];
      const components = schSession?.components || [];

      // Trim payload if large
      const pnidInstr = pnidAnalysis.instruments?.map(i => ({ tag: i.tag, service: i.service, isSafetyCritical: i.isSafetyCritical })) || [];
      const pnidValves = pnidAnalysis.valves?.map(v => ({ tag: v.tag, type: v.type, associatedController: v.associatedController })) || [];

      const prompt = `Cross-reference P&ID instruments/valves against electrical schematic devices. Match on tag number (exact first, then description).

P&ID instruments: ${JSON.stringify(pnidInstr)}
P&ID valves: ${JSON.stringify(pnidValves)}
Schematic field devices: ${JSON.stringify(fieldDevices)}
Schematic components: ${JSON.stringify(components)}

Return JSON: {"matches":[{"pnidTag":"","pnidDescription":"","matchStatus":"matched|tag_only|description_match|missing_from_schematic|extra_in_schematic","schematicTag":"","discrepancy":"","isSafetyCritical":false}],"summary":{"total":0,"matched":0,"tagOnly":0,"descriptionMatch":0,"missingFromSchematic":0,"extraInSchematic":0,"safetyCriticalMissing":0}}`;

      crossref.schematicCrossRef = await chatJSON(prompt);
    }

    // Requirements cross-ref
    if (reqIds?.length > 0) {
      send('Comparing P&ID against requirements documents...');
      const reqContents = reqIds.map(id => getSession(id)).filter(Boolean).map(s => s.content || '').join('\n---\n');

      // Trim P&ID data if combined payload too large
      const estChars = JSON.stringify(pnidAnalysis).length + reqContents.length;
      const pnidData = estChars > 400000
        ? { instruments: pnidAnalysis.instruments?.map(i => ({ tag: i.tag, service: i.service, isSafetyCritical: i.isSafetyCritical })),
            interlocks: pnidAnalysis.interlocks?.map(i => ({ interlockId: i.interlockId, type: i.type, silRating: i.silRating })) }
        : pnidAnalysis;

      const prompt = `Cross-reference P&ID against requirements (URS/FDS). For each P&ID element check if requirements mention it. For each requirement check if P&ID satisfies it.

P&ID: ${JSON.stringify(pnidData)}
Requirements: ${reqContents.substring(0, 30000)}

Return JSON: {"pnidVsRequirements":[{"pnidTag":"","pnidDescription":"","mentionedInRequirements":true,"requirementRef":"","requirementText":"","status":"satisfied|partial|not_satisfied|not_mentioned","discrepancy":"","isSafetyCritical":false}],"requirementsNotInPnid":[{"requirementRef":"","requirementText":"","classification":"","gap":""}],"summary":{"total":0,"satisfied":0,"partial":0,"notSatisfied":0,"notMentioned":0,"requirementsNotInPnid":0,"safetyCriticalGaps":0}}`;

      crossref.requirementsCrossRef = await chatJSON(prompt);
    }

    send('Cross-reference complete');
    setSession(pnidId + '_crossref', crossref);
    res.write(`data: ${JSON.stringify({ result: crossref })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// POST /api/pnid/export
router.post('/export', async (req, res) => {
  try {
    const { pnidId } = req.body;
    const analysis = getSession(pnidId + '_analysis');
    if (!analysis) return res.status(404).json({ error: 'Run P&ID analysis first' });
    const crossref = getSession(pnidId + '_crossref') || null;

    const buffer = await generatePnidReport(analysis, crossref);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="ElecDocs-PNID-Report.docx"');
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (err) {
    console.error('P&ID export error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
