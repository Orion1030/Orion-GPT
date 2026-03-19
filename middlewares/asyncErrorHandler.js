module.exports = errorHandler => (req, res, next) => {
  Promise.resolve(errorHandler(req, res, next)).catch(err => {
    console.error('Unhandled error:', err)
    const statusCode = (err?.statusCode >= 100 && err?.statusCode < 600) ? err.statusCode : 500
    const errorMessage = err?.message || 'Please try again later.'
    res.status(statusCode).json({ success: false, msg: errorMessage })
  })
}
