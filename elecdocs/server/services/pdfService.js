import { readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
import pdfParse from 'pdf-parse';

// Ensure Ghostscript is on PATH at module load
const GS_DIR = 'C:/Program Files/gs/gs10.07.0/bin';
if (existsSync(GS_DIR) && !(process.env.PATH || '').includes('gs10')) {
  process.env.PATH = (process.env.PATH || '') + `;${GS_DIR}`;
}

/**
 * Resolves the DPI to use for rasterising a schematic PDF page.
 * Balances image quality against Claude API context window limits.
 *
 * @param {number} pageWidthPt   - Page width in PDF points (1 pt = 1/72 inch)
 * @param {number} pageHeightPt  - Page height in PDF points
 * @param {number} pageCount     - Total number of pages in the document
 * @param {number|null} userDpi  - DPI requested by user (null = use auto)
 * @returns {number}             - Resolved DPI to use
 */
export function resolveDpi(pageWidthPt, pageHeightPt, pageCount, userDpi = null) {
  const MAX_DPI = 300;
  const MIN_DPI = 96;
  const DEFAULT_DPI = 150;
  const MAX_PX_DIMENSION = 7500;
  const TOKEN_BUDGET_PER_PAGE = 5000;

  if (userDpi !== null) {
    return Math.max(MIN_DPI, Math.min(MAX_DPI, userDpi));
  }

  let dpi = DEFAULT_DPI;
  const widthInches = pageWidthPt / 72;
  const heightInches = pageHeightPt / 72;

  const widthPx = widthInches * dpi;
  const heightPx = heightInches * dpi;

  if (widthPx > MAX_PX_DIMENSION || heightPx > MAX_PX_DIMENSION) {
    const scaleFactor = MAX_PX_DIMENSION / Math.max(widthPx, heightPx);
    dpi = Math.floor(dpi * scaleFactor);
  }

  const tokensPerPage = (widthInches * dpi) * (heightInches * dpi) / 750;
  if (tokensPerPage > TOKEN_BUDGET_PER_PAGE) {
    dpi = Math.floor(
      Math.sqrt((TOKEN_BUDGET_PER_PAGE * 750) / (widthInches * heightInches))
    );
  }

  return Math.max(MIN_DPI, dpi);
}

/**
 * Calculates the maximum achievable DPI for a given page size.
 * @param {number} pageWidthPt
 * @param {number} pageHeightPt
 * @returns {number}
 */
export function calculateDpiMax(pageWidthPt, pageHeightPt) {
  const MAX_DPI = 300;
  const MIN_DPI = 96;
  const MAX_PX_DIMENSION = 7500;

  const widthInches = pageWidthPt / 72;
  const heightInches = pageHeightPt / 72;
  const maxDimInches = Math.max(widthInches, heightInches);

  const dpiFromPixelLimit = Math.floor(MAX_PX_DIMENSION / maxDimInches);
  return Math.max(MIN_DPI, Math.min(MAX_DPI, dpiFromPixelLimit));
}

/**
 * Detects standard page format from PDF point dimensions.
 * @param {number} widthPt
 * @param {number} heightPt
 * @returns {string}
 */
export function detectPageFormat(widthPt, heightPt) {
  const w = Math.min(widthPt, heightPt);
  const h = Math.max(widthPt, heightPt);

  const formats = [
    { name: 'A4', w: 595, h: 842 },
    { name: 'A3', w: 842, h: 1191 },
    { name: 'A2', w: 1191, h: 1684 },
    { name: 'A1', w: 1684, h: 2384 },
    { name: 'A0', w: 2384, h: 3370 },
  ];

  for (const fmt of formats) {
    if (Math.abs(w - fmt.w) < 20 && Math.abs(h - fmt.h) < 20) {
      return fmt.name;
    }
  }
  return 'Custom';
}

/**
 * Extracts text content and page metadata from a PDF file.
 * @param {string} filePath
 * @returns {Promise<{text: string, pageCount: number, pageWidthPt: number, pageHeightPt: number}>}
 */
export async function extractText(filePath) {
  const buffer = readFileSync(filePath);
  const data = await pdfParse(buffer);

  // pdf-parse doesn't expose page dimensions directly,
  // so we parse the raw PDF for MediaBox
  const { pageWidthPt, pageHeightPt } = parsePageDimensions(buffer);

  return {
    text: data.text,
    pageCount: data.numpages,
    pageWidthPt,
    pageHeightPt
  };
}

/**
 * Parses PDF buffer to extract page dimensions from the first page's MediaBox.
 * @param {Buffer} buffer
 * @returns {{pageWidthPt: number, pageHeightPt: number}}
 */
function parsePageDimensions(buffer) {
  const pdfStr = buffer.slice(0, 10240).toString('latin1');
  const mediaBoxMatch = pdfStr.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);

  if (mediaBoxMatch) {
    const x1 = parseFloat(mediaBoxMatch[1]);
    const y1 = parseFloat(mediaBoxMatch[2]);
    const x2 = parseFloat(mediaBoxMatch[3]);
    const y2 = parseFloat(mediaBoxMatch[4]);
    return {
      pageWidthPt: x2 - x1,
      pageHeightPt: y2 - y1
    };
  }

  // Default to A3 landscape if MediaBox not found
  return { pageWidthPt: 1191, pageHeightPt: 842 };
}

/**
 * Rasterises PDF pages to base64 JPEG images.
 * @param {string} filePath
 * @param {number} pageWidthPt
 * @param {number} pageHeightPt
 * @param {number} pageCount
 * @param {number|null} userDpi
 * @returns {Promise<{pages: string[], dpiUsed: number}>}
 */
// Auto-detect GraphicsMagick path
const GM_PATHS = [
  'C:/Program Files/GraphicsMagick-1.3.45-Q16/gm.exe',
  'C:/Program Files (x86)/GraphicsMagick-1.3.45-Q16/gm.exe'
];
const GM_EXE = GM_PATHS.find(p => existsSync(p)) || 'gm';

export async function rasterisePages(filePath, pageWidthPt, pageHeightPt, pageCount, userDpi = null) {
  const dpiMax = calculateDpiMax(pageWidthPt, pageHeightPt);
  let dpi = resolveDpi(pageWidthPt, pageHeightPt, pageCount, userDpi);
  if (dpi > dpiMax) dpi = dpiMax;

  // Ensure Ghostscript is findable
  const gsDir = 'C:/Program Files/gs/gs10.07.0/bin';
  if (existsSync(gsDir) && !process.env.PATH.includes(gsDir)) {
    process.env.PATH += `;${gsDir}`;
  }

  const tmpDir = join(__dirname, '..', 'uploads', 'tmp');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  const pages = [];

  for (let i = 0; i < pageCount; i++) {
    const outFile = join(tmpDir, `page-${Date.now()}-${i}.jpg`).replace(/\\/g, '/');
    const inFile = filePath.replace(/\\/g, '/');
    const cmd = `"${GM_EXE}" convert -density ${dpi} "PDF:${inFile}[${i}]" -quality 85 "${outFile}"`;
    try {
      execSync(cmd, { timeout: 90000, stdio: 'pipe' });
      if (existsSync(outFile)) {
        const buf = readFileSync(outFile);
        pages.push(buf.toString('base64'));
        unlinkSync(outFile);
      } else {
        pages.push('');
      }
    } catch (err) {
      console.error(`Rasterise page ${i} failed:`, err.message?.substring(0, 200));
      if (err.stderr) console.error('stderr:', err.stderr.toString().substring(0, 300));
      pages.push('');
    }
  }

  return { pages, dpiUsed: dpi };
}
