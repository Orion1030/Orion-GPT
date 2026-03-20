/**
 * Backward-compatible re-export.
 * All logic lives in templateRenderer.js, pdfExport.js, and docExport.js.
 */
const templateRenderer = require('./templateRenderer');
const pdfExport = require('./pdfExport');
const docExport = require('./docExport');

module.exports = {
    ...templateRenderer,
    ...pdfExport,
    ...docExport,
};
