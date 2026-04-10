import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

import uploadRoutes from './routes/upload.js';
import analyseRoutes from './routes/analyse.js';
import extractRoutes from './routes/extract.js';
import instrumentRoutes from './routes/instruments.js';
import crossrefRoutes from './routes/crossref.js';
import reverseEngineerRoutes from './routes/reverseengineer.js';
import pnidRoutes from './routes/pnid.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// Ensure upload directories exist
const uploadsDir = join(__dirname, 'uploads');
const tmpDir = join(uploadsDir, 'tmp');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

// Auto-detect and add Ghostscript + GraphicsMagick to PATH
const extraPaths = [
  'C:\\Program Files\\gs\\gs10.07.0\\bin',
  'C:\\Program Files\\GraphicsMagick-1.3.45-Q16'
];
for (const p of extraPaths) {
  if (existsSync(p) && !process.env.PATH.includes(p)) {
    process.env.PATH += `;${p}`;
  }
}

// Check for Ghostscript
try {
  execSync('gswin64c --version', { stdio: 'ignore' });
} catch {
  try {
    execSync('gs --version', { stdio: 'ignore' });
  } catch {
    console.warn('\n⚠  Ghostscript not found on PATH. PDF rasterisation will fail.');
    console.warn('   Install from: https://ghostscript.com/releases/gsdnld.html\n');
  }
}

// Check for GraphicsMagick
try {
  execSync('gm version', { stdio: 'ignore' });
} catch {
  console.warn('⚠  GraphicsMagick not found. PDF page rendering will use placeholders.');
}

app.use(cors());
app.use(express.json({ limit: '500mb' }));

// API routes
app.use('/api/upload', uploadRoutes);
app.use('/api/analyse', analyseRoutes);
app.use('/api/extract', extractRoutes);
app.use('/api/instruments', instrumentRoutes);
app.use('/api/crossref', crossrefRoutes);
app.use('/api/reverseengineer', reverseEngineerRoutes);
app.use('/api/pnid', pnidRoutes);

// Serve static frontend in production
const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*splat}', (req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`ElecDocs server running on http://localhost:${PORT}`);
});
server.timeout = 600000;        // 10 minutes
server.keepAliveTimeout = 620000;
