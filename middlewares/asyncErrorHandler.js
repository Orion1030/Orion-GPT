module.exports = errorHandler => (req, res, next) => {
  Promise.resolve(errorHandler(req, res, next)).catch(err => {
    console.error('Error in asyncErrorHandler:', err)
    const errorMessage = err && err.message ? err.message : 'Please try again later.'
    res.status(400).json({ success: false, msg: errorMessage })
  })
}
