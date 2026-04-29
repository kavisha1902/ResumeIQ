const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');

/**
 * Extract plain text from uploaded file buffer.
 * Supports PDF, DOCX, DOC, TXT.
 */
async function extractText(buffer, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  try {
    if (ext === '.pdf') {
      const data = await pdfParse(buffer);
      return data.text || '';
    }

    if (ext === '.docx' || ext === '.doc') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    }

    if (ext === '.txt') {
      return buffer.toString('utf8');
    }

    // Fallback: try as text
    return buffer.toString('utf8');
  } catch (err) {
    console.warn(`[extractText] Failed for ${originalName}:`, err.message);
    return `[Could not parse file: ${originalName}]`;
  }
}

module.exports = { extractText };
