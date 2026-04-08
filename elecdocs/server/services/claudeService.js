import { spawn } from 'child_process';

// ─── Text Preprocessor ──────────────────────────────────────

const NOISE_PATTERNS = [
  /^1\nA\n2345678910\nA\nBB\nCC\nDD\nEE\nFF$/m,
  /Innovation House\nHolbeach, PE12 7FH\n01406 424954/g,
  /ALLIA FUTURE BUSINESS PARK\n6 Cibus Way/g,
  /Phone:\nEmail:info@ajsspalding\.co\.uk/g,
  /Client:\nAddress:\nPUFC\nPE2 8AN/g,
  /Project:\nSTEVENAGE WATER FLOW METER\nSite:\nENERTHERM ENGINEERING/g,
  /Job \/ Drawing No:Sheet:Revision:\nNext:\nPanel Ref:\nPage:/g,
  /Rev:Description:Drawn by:Date:Apprvd by:/g,
  /Panel Title:\nDrawing type:\nDescription:/g,
  /GG\nPanel ID:\nENC03\n03/g,
  /WATER METER DATA COLLECTION PANEL\nCA-251836\nEUROPE SNACKS STEVENAGE/g,
];

const PAGE_CLASSIFIERS = [
  { type: 'cover', pattern: /Cover Page|Title page|cover sheet/i },
  { type: 'index', pattern: /Index|Table of contents/i },
  { type: 'parts_list', pattern: /Parts List|parts list/i },
  { type: 'terminal', pattern: /Terminal Diagram|terminal diagram/i },
  { type: 'layout', pattern: /3D Model|Door Layout|Back Plate|LeftFront|Model view/i },
  { type: 'structure', pattern: /Structure Overview|structure identifier/i },
  { type: 'schematic', pattern: /Schematic|INCOMMING SUPPLY|24V PSU|NETWORK SWITCH|PLC|WATER METER|PROFINET|RACK/i },
  { type: 'overview', pattern: /Overview|SLOT/i },
];

/**
 * Preprocesses raw PDF text: strips noise, classifies pages, returns clean sections.
 */
function preprocessText(rawText) {
  // Split into pages (separated by double newlines with page structure)
  const rawPages = rawText.split(/\n\n1\nA\n2345678910\nA\nBB\nCC\nDD\nEE\nFF\n/);

  const pages = rawPages.map((pageText, i) => {
    // Strip noise patterns
    let clean = pageText;
    for (const pat of NOISE_PATTERNS) {
      clean = clean.replace(pat, '');
    }

    // Collapse multiple blank lines
    clean = clean.replace(/\n{3,}/g, '\n\n').trim();

    // Classify page
    let type = 'other';
    for (const { type: t, pattern } of PAGE_CLASSIFIERS) {
      if (pattern.test(pageText)) { type = t; break; }
    }

    return { type, content: clean, index: i };
  });

  return pages;
}

/**
 * Selects and joins relevant pages for a given task, capped at maxChars.
 */
function selectPages(pages, types, maxChars = 15000) {
  const selected = pages.filter(p => types.includes(p.type) && p.content.length > 20);
  let text = '';
  for (const page of selected) {
    if (text.length + page.content.length > maxChars) {
      text += `\n\n[Page ${page.index} (${page.type}) truncated]\n`;
      text += page.content.substring(0, maxChars - text.length);
      break;
    }
    text += `\n\n=== Page ${page.index} (${page.type}) ===\n${page.content}`;
  }
  return text.trim();
}

// ─── Claude CLI Caller ───────────────────────────────────────

/**
 * Calls claude CLI by piping prompt via stdin.
 * Uses the user's Claude Code subscription — no API key needed.
 */
function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    const chunks = [];
    const errChunks = [];
    const child = spawn('claude', [
      '--output-format', 'text',
      '--max-turns', '1'
    ], { env, stdio: ['pipe', 'pipe', 'pipe'] });

    child.stdin.write(prompt);
    child.stdin.end();

    child.stdout.on('data', d => chunks.push(d));
    child.stderr.on('data', d => errChunks.push(d));

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Claude CLI timed out after 180s'));
    }, 180000);

    child.on('close', (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString().trim();
      const stderr = Buffer.concat(errChunks).toString().trim();
      if (stderr) console.error('Claude CLI stderr:', stderr.substring(0, 300));
      if (!output && code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr.substring(0, 200)}`));
      } else {
        resolve(output);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Claude CLI spawn failed: ${err.message}`));
    });
  });
}

/**
 * Calls Claude CLI and parses JSON from the response.
 */
async function callClaudeJSON(prompt) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const suffix = attempt === 0
      ? '\n\nReturn ONLY valid JSON. No markdown fences, no explanation.'
      : '\n\nYou MUST return ONLY raw JSON. No markdown, no text, no explanation. Start with { and end with }.';

    const response = await callClaude(prompt + suffix);
    try {
      return JSON.parse(stripFences(response));
    } catch {
      console.error(`JSON parse attempt ${attempt + 1} failed. Response start:`, response.substring(0, 200));
      if (attempt === 1) throw new Error('Claude returned invalid JSON after retry');
    }
  }
}

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
}

// ─── Exported Service Functions ──────────────────────────────

/**
 * Streams an answer to a schematic question.
 */
export async function* answerSchematicQuestion({ images, extractedText, question, systemPrompt }) {
  const pages = preprocessText(extractedText);
  const relevantText = selectPages(pages,
    ['schematic', 'parts_list', 'terminal', 'overview', 'structure', 'cover'], 20000);

  const prompt = `You are an expert electrical engineer analysing an electrical schematic.

${systemPrompt}

Schematic data:
${relevantText}

Question: ${question}

Provide a detailed, accurate answer. Use UK English. Reference specific component designations.`;

  const response = await callClaude(prompt);

  for (const word of response.split(' ')) {
    yield word + ' ';
    await new Promise(r => setTimeout(r, 20));
  }
}

/**
 * Extracts structured JSON data from schematic text.
 * Splits into focused calls for components vs I/O signals.
 */
export async function extractStructuredJSON({ images, extractedText, systemPrompt, userPrompt }) {
  const pages = preprocessText(extractedText);

  if (userPrompt.includes('field device') || userPrompt.includes('field-device')) {
    // Field device extraction — use schematic + terminal pages
    const text = selectPages(pages, ['schematic', 'terminal', 'overview'], 15000);
    return await callClaudeJSON(`${systemPrompt}\n\nSchematic data:\n${text}\n\n${userPrompt}`);
  }

  if (userPrompt.includes('instrument')) {
    // Instrumentation — use the requirement text directly (no schematic preprocessing needed)
    return await callClaudeJSON(`${systemPrompt}\n\n${userPrompt}`);
  }

  // Component + I/O extraction — split into two calls
  const partsText = selectPages(pages, ['parts_list'], 8000);
  const schematicText = selectPages(pages, ['schematic', 'terminal', 'overview'], 10000);

  const [components, ioSignals] = await Promise.all([
    callClaudeJSON(`Extract all electrical components from this schematic parts list and schematic pages.
Return JSON: {"components": [{"designation":"","description":"","type":"","manufacturer":"","partNumber":"","rating":"","location":"","connections":[],"pages":[],"notes":""}], "summary": {"totalComponents": N, "manufacturers": [], "panelsList": []}}

Parts list data:
${partsText}

Schematic data:
${schematicText}`),

    callClaudeJSON(`Extract all I/O signals from this electrical schematic. Look for PLC connections, DI/DO/AI/AO signals, and field device wiring.
Return JSON: {"ioSignals": [{"tagNumber":"","description":"","signalType":"DI|DO|AI|AO|PI","range":"","plcAddress":"","panel":"","cableRef":"","terminalFrom":"","terminalTo":"","pages":[],"notes":""}], "summary": {"totalIOSignals": N, "signalTypeCounts": {"DI":0,"DO":0,"AI":0,"AO":0,"PI":0}}}

Schematic data:
${schematicText}`)
  ]);

  // Merge results
  return {
    components: components.components || [],
    ioSignals: ioSignals.ioSignals || [],
    summary: {
      totalComponents: (components.components || []).length,
      totalIOSignals: (ioSignals.ioSignals || []).length,
      manufacturers: components.summary?.manufacturers || [],
      panelsList: components.summary?.panelsList || [],
      signalTypeCounts: ioSignals.summary?.signalTypeCounts || {}
    }
  };
}

/**
 * Generates the full compliance matrix.
 */
export async function generateComplianceMatrix({ images, extractedText, fieldDevices, requirements, systemPrompt }) {
  const pages = preprocessText(extractedText);
  const text = selectPages(pages, ['schematic', 'parts_list', 'terminal', 'overview'], 12000);

  const prompt = `${systemPrompt}

Schematic data:
${text}

Field devices found:
${JSON.stringify(fieldDevices, null, 2)}

Requirements:
${JSON.stringify(requirements, null, 2)}

Analyse compliance and return JSON with: requirements[], instrumentationCoverage{}, fieldDeviceCoverage{}, conflicts[], summary{}`;

  return await callClaudeJSON(prompt);
}

/**
 * Generates executive summary for the gap report.
 */
export async function generateExecutiveSummary(complianceData) {
  return await callClaude(
    `Write a professional executive summary in UK English, max 300 words. Focus on key findings, compliance %, critical gaps.\n\n${JSON.stringify(complianceData, null, 2)}`
  );
}

/**
 * Generates suggested questions based on schematic content.
 */
export async function generateSuggestedQuestions({ images, extractedText }) {
  const pages = preprocessText(extractedText);
  const text = selectPages(pages, ['cover', 'schematic', 'parts_list'], 3000);

  try {
    return await callClaudeJSON(
      `Based on this electrical schematic, suggest exactly 5 useful questions an engineer might ask. Return a JSON array of 5 strings.\n\nSchematic:\n${text}`
    );
  } catch {
    return [
      'What are the main protection devices in this schematic?',
      'How is the power distribution organised?',
      'What control devices are shown and how are they connected?',
      'Are there any safety circuits or interlocks?',
      'What field devices are connected to the PLC?'
    ];
  }
}
