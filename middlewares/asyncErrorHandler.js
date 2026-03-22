module.exports = errorHandler => (req, res, next) => {
  Promise.resolve(errorHandler(req, res, next)).catch(err => {
    console.error('Unhandled error:', err)
    const statusCode = (err?.statusCode >= 100 && err?.statusCode < 600) ? err.statusCode : 500
    const errorMessage = err?.message || 'Please try again later.'
    const showNotification = err.showNotification !== false
    res.status(statusCode).json({
      success: false,
      data: null,
      message: errorMessage,
      msg: errorMessage,
      showNotification,
    })
  })
}
