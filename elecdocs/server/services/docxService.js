import { readFileSync } from 'fs';
import mammoth from 'mammoth';

/**
 * Extracts text content from a DOCX file as Markdown.
 * @param {string} filePath
 * @returns {Promise<string>} Markdown text
 */
export async function extractDocx(filePath) {
  const buffer = readFileSync(filePath);
  const result = await mammoth.convertToMarkdown({ buffer });

  if (result.messages.length > 0) {
    console.warn('DOCX conversion warnings:', result.messages);
  }

  return result.value;
}
