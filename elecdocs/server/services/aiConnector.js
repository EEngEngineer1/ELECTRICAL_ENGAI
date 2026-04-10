/**
 * aiConnector.js — Reusable AI connector for Ollama-based local models.
 * Designed to work with any Ollama model. Import and use in any project.
 *
 * Usage:
 *   import { chat, chatJSON, chatStream } from './aiConnector.js';
 *   const answer = await chat('What is this?');
 *   const data = await chatJSON('Extract components. Return JSON: {...}');
 *   for await (const chunk of chatStream('Explain this')) { process.stdout.write(chunk); }
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = GEMINI_KEY ? `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}` : null;

/**
 * Send a prompt to Ollama and get a complete text response.
 * @param {string} prompt
 * @param {Object} options - { model, images (base64[]), temperature, maxTokens }
 * @returns {Promise<string>}
 */
export async function chat(prompt, options = {}) {
  if (GEMINI_URL) return geminiChat(prompt, options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000);
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      model: options.model || OLLAMA_MODEL,
      messages: [{
        role: 'user',
        content: prompt,
        ...(options.images ? { images: options.images } : {})
      }],
      stream: false,
      options: {
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
        ...(options.maxTokens ? { num_predict: options.maxTokens } : {}),
        num_ctx: 4096
      },
      keep_alive: '5m'
    })
  });
  clearTimeout(timeout);
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.message.content;
}

async function geminiChat(prompt, options = {}) {
  const parts = [{ text: prompt }];
  if (options.images) {
    for (const img of options.images) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: img } });
    }
  }
  const res = await fetch(GEMINI_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: options.temperature ?? 0.1 } })
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Send a prompt and parse a JSON response. Retries with increasingly explicit instructions.
 * @param {string} prompt
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function chatJSON(prompt, options = {}) {
  if (GEMINI_URL) return geminiChatJSON(prompt, options);
  const jsonSuffix = '\n\nCRITICAL: Return ONLY a valid JSON object. No markdown fences, no explanation. Start with { end with }.';
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = attempt === 0 ? prompt + jsonSuffix : `OUTPUT: JSON ONLY.\n\n${prompt}${jsonSuffix}`;
    const response = await chat(p, options);
    try {
      return JSON.parse(extractJSON(stripFences(response)));
    } catch {
      console.error(`[aiConnector] JSON parse attempt ${attempt + 1}/3 failed`);
      if (attempt === 2) throw new Error('AI returned invalid JSON after 3 attempts');
    }
  }
}

async function geminiChatJSON(prompt, options = {}) {
  const parts = [{ text: prompt + '\n\nReturn ONLY valid JSON.' }];
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
  if (!text) return {};
  try { return JSON.parse(text); } catch {
    return JSON.parse(stripFences(text));
  }
}

/**
 * Stream a response token by token.
 * @param {string} prompt
 * @param {Object} options
 * @yields {string} text chunks
 */
export async function* chatStream(prompt, options = {}) {
  if (GEMINI_URL) {
    const text = await geminiChat(prompt, options);
    yield text;
    return;
  }
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model || OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: true
    })
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.message?.content) yield data.message.content;
      } catch { /* skip */ }
    }
  }
}

/**
 * Check if Ollama is running and the model is available.
 * @returns {Promise<{ok: boolean, model: string, error?: string}>}
 */
export async function checkHealth() {
  if (GEMINI_URL) return { ok: true, model: `Gemini ${GEMINI_MODEL}` };
  try {
    const res = await fetch(`${OLLAMA_URL}/api/version`);
    if (!res.ok) return { ok: false, model: OLLAMA_MODEL, error: 'Ollama not responding' };
    const tags = await fetch(`${OLLAMA_URL}/api/tags`).then(r => r.json());
    const hasModel = tags.models?.some(m => m.name === OLLAMA_MODEL || m.name.startsWith(OLLAMA_MODEL.split(':')[0]));
    return { ok: hasModel, model: OLLAMA_MODEL, error: hasModel ? undefined : `Model ${OLLAMA_MODEL} not found. Run: ollama pull ${OLLAMA_MODEL}` };
  } catch {
    return { ok: false, model: OLLAMA_MODEL, error: 'Cannot connect to Ollama. Is it running?' };
  }
}

// ─── Internal helpers ────────────────────────────────────────

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
}

function extractJSON(text) {
  const start = text.indexOf('{');
  if (start === -1) return text;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.substring(start, i + 1); }
  }
  return text.substring(start);
}

export { OLLAMA_URL, OLLAMA_MODEL };
