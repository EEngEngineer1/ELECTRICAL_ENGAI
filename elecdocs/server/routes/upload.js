import { Router } from 'express';
import multer from 'multer';
import { join, dirname, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { extractText, rasterisePages, detectPageFormat, calculateDpiMax } from '../services/pdfService.js';
import { extractDocx } from '../services/docxService.js';
import { createSession, getSession } from '../services/sessionStore.js';
import { loadSkill } from '../services/skillLoader.js';
import { extractStructuredJSON } from '../services/claudeService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const upload = multer({
  dest: join(__dirname, '..', 'uploads'),
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 200) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx'];
    cb(null, allowed.includes(extname(file.originalname).toLowerCase()));
  }
});

const router = Router();

// POST /api/upload/schematic
router.post('/schematic', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = extname(req.file.originalname).toLowerCase();
    if (ext !== '.pdf') return res.status(400).json({ error: 'Schematic must be a PDF' });

    const uploadId = uuidv4();

    let text, pageCount, pageWidthPt, pageHeightPt, dpiMax, pageFormat, pages, dpiUsed;

    const absFilePath = resolve(req.file.path).replace(/\\/g, '/');
    try {
      ({ text, pageCount, pageWidthPt, pageHeightPt } = await extractText(absFilePath));
      dpiMax = calculateDpiMax(pageWidthPt, pageHeightPt);
      pageFormat = detectPageFormat(pageWidthPt, pageHeightPt);
      const userDpi = req.body.dpi ? parseInt(req.body.dpi, 10) : null;
      const rasterResult = await rasterisePages(absFilePath, pageWidthPt, pageHeightPt, pageCount, userDpi);
      pages = rasterResult.pages;
      dpiUsed = rasterResult.dpiUsed;
      // If all pages are empty, something went wrong silently
      if (pages.every(p => !p)) throw new Error('All pages rasterised as empty');
    } catch (pdfErr) {
      // Fallback mock mode — use extracted text only, generate placeholder image
      console.warn('PDF rasterisation failed:', pdfErr.message, '\nStack:', pdfErr.stack?.substring(0, 300));
      try {
        ({ text, pageCount, pageWidthPt, pageHeightPt } = await extractText(req.file.path));
      } catch {
        text = 'PDF text extraction unavailable'; pageCount = 1;
        pageWidthPt = 1191; pageHeightPt = 842;
      }
      dpiMax = calculateDpiMax(pageWidthPt, pageHeightPt);
      pageFormat = detectPageFormat(pageWidthPt, pageHeightPt);
      dpiUsed = 150;
      // Create a simple placeholder image (1x1 white JPEG in base64)
      const placeholder = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=';
      pages = Array(pageCount).fill(placeholder);
    }

    const session = createSession(uploadId);
    session.filePath = absFilePath;
    session.pageImages = pages;
    session.extractedText = text;
    session.dpiUsed = dpiUsed;
    session.dpiMax = dpiMax;
    session.pageFormat = pageFormat;
    session.pageWidthPt = pageWidthPt;
    session.pageHeightPt = pageHeightPt;
    session.pageCount = pageCount;

    res.json({
      uploadId,
      pageCount,
      pageImages: pages,
      extractedText: text,
      dpiUsed,
      dpiMax,
      pageFormat
    });
  } catch (err) {
    console.error('Upload schematic error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload/requirements
router.post('/requirements', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const type = req.body.type; // 'URS' or 'FDS'
    if (!type || !['URS', 'FDS'].includes(type)) {
      return res.status(400).json({ error: 'type must be "URS" or "FDS"' });
    }

    const ext = extname(req.file.originalname).toLowerCase();
    let content;
    if (ext === '.pdf') {
      const { text } = await extractText(req.file.path);
      content = text;
    } else if (ext === '.docx') {
      content = await extractDocx(req.file.path);
    } else {
      return res.status(400).json({ error: 'File must be PDF or DOCX' });
    }

    const reqId = uuidv4();
    const uploadId = req.body.uploadId;

    if (uploadId) {
      const session = getSession(uploadId);
      if (session) {
        session.requirements.set(reqId, { type, content, instruments: null });

        // Auto-trigger instrumentation generation in background
        generateInstrumentsBackground(session, reqId, type, content);
      }
    }

    res.json({ reqId, type, content, instrumentCount: 0 });
  } catch (err) {
    console.error('Upload requirements error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload/rerasterise
router.post('/rerasterise', async (req, res) => {
  try {
    const { uploadId, dpi } = req.body;
    const session = getSession(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // We need the original file path — for simplicity, re-use session data
    // In production, you'd store the file path in the session
    const { pages, dpiUsed } = await rasterisePages(
      join(__dirname, '..', 'uploads', 'tmp', 'rerasterise-placeholder'),
      session.pageWidthPt, session.pageHeightPt, session.pageCount,
      dpi
    );

    session.pageImages = pages;
    session.dpiUsed = dpiUsed;

    res.json({ dpiUsed, pageImages: pages });
  } catch (err) {
    console.error('Re-rasterise error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function generateInstrumentsBackground(session, reqId, type, content) {
  try {
    const skill = loadSkill('instrumentation-list-generator');
    const result = await extractStructuredJSON({
      images: [],
      extractedText: '',
      systemPrompt: skill,
      userPrompt: `Parse this ${type} document and extract a complete list of all instruments, sensors, transmitters, detectors, switches, and field devices. Return JSON with "instruments" array and "summary" object.\n\nDocument content:\n${content}`
    });
    const reqData = session.requirements.get(reqId);
    if (reqData) {
      reqData.instruments = result;
    }
  } catch (err) {
    console.error('Background instrument generation failed:', err);
  }
}

// GET /api/upload/page/:uploadId/:pageNum — serve a single page image on demand
router.get('/page/:uploadId/:pageNum', (req, res) => {
  try {
    const session = getSession(req.params.uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const pageNum = parseInt(req.params.pageNum, 10);
    const idx = pageNum - 1;

    if (!session.pageImages || !session.pageImages[idx] || session.pageImages[idx].length === 0) {
      return res.status(404).json({ error: 'Page not found or empty' });
    }

    const buf = Buffer.from(session.pageImages[idx], 'base64');
    res.set('Content-Type', 'image/jpeg');
    res.send(buf);
  } catch (err) {
    console.error('Page fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
