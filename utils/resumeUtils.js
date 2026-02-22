const puppeteer = require('puppeteer');

/**
 * Sends an HTML resume as a file download.
 * @param {Object} resume - Resume object with `.content` (HTML) and optional `.name`.
 * @param {Object} res - Express response object.
 */
function sendHtmlResume(resume, res) {
    const htmlWithMeta = `
    <html>
        <head>
            <title>${resume.name || 'Resume'}</title>
            <meta name="author" content="${user.name || user.email || ''}">
        </head>
        <body>
            ${resume.content}
        </body>
    </html>
    `;
    res.set({
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="${resume.name || 'resume'}.html"`,
    });
    res.send(htmlWithMeta);
}

/**
 * Generates a PDF from the resume's HTML and sends it as a download.
 * @param {Object} resume - Resume object with `.content` (HTML) and optional `.name`.
 * @param {Object} res - Express response object.
 * @param {Object} [user] - (Optional) User object (for metadata).
 */
async function sendPdfResume(resume, res, user = {}) {
    const htmlWithMeta = `
        <html>
        <head>
            <title>${resume.name || 'Resume'}</title>
            <meta name="author" content="${user.name || user.email || ''}">
        </head>
        <body>
            ${resume.content}
        </body>
        </html>
    `;

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(htmlWithMeta, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
    });

    await browser.close();

    res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${resume.name || 'resume'}.pdf"`,
        'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
}

/**
 * Sends a minimal DOCX as an attachment. Needs a library like "docx" or "officegen".
 * This is a simple version using just HTML and mimicking DOC file for basic scenarios.
 * For real DOCX support, use a specialized library.
 */
function sendDocResume(resume, res) {
    const docContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office'
            xmlns:w='urn:schemas-microsoft-com:office:word'
            xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <title>${resume.name || 'Resume'}</title>
            <meta name="author" content="${user.name || user.email || ''}">
        </head>
        <body>${resume.content}</body>
        </html>`;
    res.set({
        'Content-Type': 'application/msword',
        'Content-Disposition': `attachment; filename="${resume.name || 'resume'}.doc"`,
    });
    res.send(docContent);
}

module.exports = {
    sendHtmlResume,
    sendPdfResume,
    sendDocResume,
};