/**
 * End-to-end test for the compliance cross-reference endpoint.
 *
 * Flow:
 *  1. Upload the real schematic PDF  -> get uploadId
 *  2. Extract field devices           -> stored in session
 *  3. Create a minimal valid DOCX with realistic FDS content, upload as requirements
 *  4. Wait for background instrument generation, then verify
 *  5. Generate instruments explicitly
 *  6. Run compliance analysis via /api/crossref/analyse
 *  7. Inspect instrumentationCoverage and fieldDeviceCoverage
 */

import { Document, Packer, Paragraph, TextRun } from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3001';

// ── helpers ──────────────────────────────────────────────────────────────────

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function uploadFile(url, filePath, fieldName, extraFields = {}) {
  const form = new FormData();

  const fileData = fs.readFileSync(filePath);
  const file = new File([fileData], path.basename(filePath), { type: 'application/octet-stream' });
  form.append(fieldName, file);

  for (const [k, v] of Object.entries(extraFields)) {
    form.append(k, v);
  }

  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload ${res.status}: ${text}`);
  }
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── main test ────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== ElecDocs Cross-Reference E2E Test ===\n');

  // 1. Find a schematic PDF
  const drawingDir = path.resolve(__dirname, '..', 'Drawing');
  const pdfs = fs.readdirSync(drawingDir).filter(f => f.endsWith('.pdf'));
  if (pdfs.length === 0) throw new Error('No PDFs found in Drawing/');
  const schematicPath = path.join(drawingDir, pdfs[0]);
  console.log(`[1] Uploading schematic: ${pdfs[0]}`);

  const uploadResult = await uploadFile(
    `${BASE}/api/upload/schematic`,
    schematicPath,
    'file'
  );
  const { uploadId, pageCount, extractedText } = uploadResult;
  console.log(`    uploadId=${uploadId}  pages=${pageCount}  textLen=${extractedText?.length || 0}`);

  // 2. Extract field devices
  console.log('\n[2] Extracting field devices...');
  const fdResult = await postJSON(`${BASE}/api/extract/fielddevices`, { uploadId });
  const fieldDevices = fdResult.fieldDevices || [];
  console.log(`    Found ${fieldDevices.length} field devices`);
  if (fieldDevices.length > 0) {
    console.log('    First 5 tags:', fieldDevices.slice(0, 5).map(fd => fd.tagNumber || fd.tag).join(', '));
  }

  // 3. Create a minimal DOCX containing FDS-style requirements that reference
  //    some of the actual field device tags so we get real matches.
  console.log('\n[3] Creating FDS DOCX...');

  // Build realistic FDS content using discovered field device tags
  const fdsLines = [
    'FUNCTIONAL DESIGN SPECIFICATION',
    'Document No: FDS-001  Rev 2.0',
    '',
    '1. SCOPE',
    'This FDS defines the instrumentation requirements for the process control system.',
    '',
    '2. INSTRUMENTATION REQUIREMENTS',
    ''
  ];

  // Add some real tags from the schematic so they match
  const tagsToInclude = fieldDevices.slice(0, Math.min(5, fieldDevices.length));
  for (let i = 0; i < tagsToInclude.length; i++) {
    const fd = tagsToInclude[i];
    const tag = fd.tagNumber || fd.tag || `INST-${i + 1}`;
    const desc = fd.description || fd.deviceType || fd.type || 'Field instrument';
    fdsLines.push(`2.${i + 1} Instrument ${tag}: ${desc}`);
    fdsLines.push(`     Tag Number: ${tag}`);
    fdsLines.push(`     Type: ${fd.deviceType || fd.type || 'Sensor'}`);
    fdsLines.push(`     Safety Critical: ${i === 0 ? 'Yes' : 'No'}`);
    fdsLines.push('');
  }

  // Also add some fake instruments that WON'T match to test "missing" logic
  fdsLines.push('2.90 Instrument FAKE-TT-901: Temperature transmitter for non-existent loop');
  fdsLines.push('     Tag Number: FAKE-TT-901');
  fdsLines.push('     Type: Temperature Transmitter');
  fdsLines.push('     Safety Critical: Yes');
  fdsLines.push('');
  fdsLines.push('2.91 Instrument FAKE-PT-902: Pressure transmitter for non-existent vessel');
  fdsLines.push('     Tag Number: FAKE-PT-902');
  fdsLines.push('     Type: Pressure Transmitter');
  fdsLines.push('     Safety Critical: No');
  fdsLines.push('');
  fdsLines.push('3. SAFETY REQUIREMENTS');
  fdsLines.push('All safety critical instruments must be SIL2 rated per IEC 61511.');

  const doc = new Document({
    sections: [{
      children: fdsLines.map(line => new Paragraph({
        children: [new TextRun(line)]
      }))
    }]
  });

  const docxPath = path.join(__dirname, 'server', 'uploads', 'tmp', 'test-fds.docx');
  fs.mkdirSync(path.dirname(docxPath), { recursive: true });
  const docxBuffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, docxBuffer);
  console.log(`    Created ${docxPath} (${docxBuffer.length} bytes)`);

  // 4. Upload the FDS as requirements
  console.log('\n[4] Uploading FDS requirements...');
  const reqResult = await uploadFile(
    `${BASE}/api/upload/requirements`,
    docxPath,
    'file',
    { type: 'FDS', uploadId }
  );
  const reqId = reqResult.reqId;
  console.log(`    reqId=${reqId}  type=${reqResult.type}  contentLen=${reqResult.content?.length || 0}`);

  // 5. Wait for background instrument generation, then explicitly generate
  console.log('\n[5] Waiting for background instrument generation (5s)...');
  await sleep(5000);

  console.log('    Explicitly generating instruments...');
  const instResult = await postJSON(`${BASE}/api/instruments/generate`, {
    uploadId,
    reqIds: [reqId]
  });
  const instruments = instResult.instruments || [];
  console.log(`    Generated ${instruments.length} instruments`);
  if (instruments.length > 0) {
    console.log('    First 5 instrument tags:', instruments.slice(0, 5).map(i => i.tagNumber || i.tag || '?').join(', '));
  }

  // 6. Run compliance cross-reference analysis
  console.log('\n[6] Running compliance cross-reference analysis...');
  const crossrefResult = await postJSON(`${BASE}/api/crossref/analyse`, {
    uploadId,
    reqIds: [reqId]
  });

  // 7. Report results
  console.log('\n=== COMPLIANCE ANALYSIS RESULTS ===\n');

  const ic = crossrefResult.instrumentationCoverage;
  const fdc = crossrefResult.fieldDeviceCoverage;

  console.log('--- Instrumentation Coverage ---');
  if (ic) {
    console.log(`  totalSpecified: ${ic.totalSpecified}`);
    console.log(`  matched:        ${ic.matched}`);
    console.log(`  missing:        ${ic.missing}`);
    console.log(`  coveragePercent: ${ic.coveragePercent}%`);

    if (ic.matchedItems?.length > 0) {
      console.log('  Matched items:');
      for (const m of ic.matchedItems.slice(0, 5)) {
        console.log(`    - ${m.tagNumber}: ${m.schematicEvidence}`);
      }
    }
    if (ic.missingItems?.length > 0) {
      console.log('  Missing items:');
      for (const m of ic.missingItems.slice(0, 5)) {
        console.log(`    - ${m.tagNumber}: ${m.missingReason} (safety=${m.isSafetyCritical})`);
      }
    }
  } else {
    console.log('  (null or undefined!)');
  }

  console.log('\n--- Field Device Coverage ---');
  if (fdc) {
    console.log(`  totalInSchematic:      ${fdc.totalInSchematic}`);
    console.log(`  tracedToRequirements:  ${fdc.tracedToRequirements}`);
    console.log(`  untraced:              ${fdc.untraced}`);

    if (fdc.tracedItems?.length > 0) {
      console.log('  Traced items:');
      for (const t of fdc.tracedItems.slice(0, 5)) {
        console.log(`    - ${t.tagNumber}: ${t.tracedToReq}`);
      }
    }
    if (fdc.untracedItems?.length > 0) {
      console.log(`  Untraced items (first 5 of ${fdc.untracedItems.length}):`);
      for (const u of fdc.untracedItems.slice(0, 5)) {
        console.log(`    - ${u.tagNumber}: ${u.reason}`);
      }
    }
  } else {
    console.log('  (null or undefined!)');
  }

  // Summary
  console.log('\n--- Summary ---');
  const summary = crossrefResult.summary;
  if (summary) {
    console.log(`  missingInstruments: ${summary.missingInstruments}`);
    console.log(`  untracedDevices:    ${summary.untracedDevices}`);
    for (const [k, v] of Object.entries(summary)) {
      if (!['missingInstruments', 'untracedDevices'].includes(k)) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
    }
  }

  // Verdict
  console.log('\n=== VERDICT ===');
  const hasRealData = ic && (ic.matched > 0 || ic.missing > 0) && ic.totalSpecified > 0;
  if (hasRealData) {
    console.log('PASS: instrumentationCoverage shows real matched/missing data (not all zeros)');
  } else {
    console.log('FAIL: instrumentationCoverage shows zeros or missing data');
  }

  // Cleanup
  try { fs.unlinkSync(docxPath); } catch {}

  process.exit(hasRealData ? 0 : 1);
}

main().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
