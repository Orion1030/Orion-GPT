const { PDFParse } = require("pdf-parse");

function normalizeExtractedPdfText(value) {
  return String(value || "")
    .replace(/\u0000/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPlainTextFromPdfBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return {
      result: null,
      error: { message: "PDF file is empty or invalid.", statusCode: 400 },
    };
  }

  let parser = null;
  try {
    parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    const text = normalizeExtractedPdfText(parsed?.text);
    if (!text) {
      return {
        result: null,
        error: {
          message:
            "No selectable text was found in this PDF. Text-based PDFs are supported; scanned PDFs are not.",
          statusCode: 422,
        },
      };
    }

    return {
      result: {
        text,
        pageCount: Number(parsed?.total || 0),
      },
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      error: {
        message: "Could not extract text from this PDF.",
        statusCode: 422,
      },
    };
  } finally {
    if (parser && typeof parser.destroy === "function") {
      try {
        await parser.destroy();
      } catch (_destroyError) {
        // Ignore parser cleanup issues after extraction has completed.
      }
    }
  }
}

module.exports = {
  extractPlainTextFromPdfBuffer,
  _normalizeExtractedPdfText: normalizeExtractedPdfText,
};
