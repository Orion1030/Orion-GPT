require('dotenv').config({ path: './.env' })
const serverless = require('serverless-http')
const { DBConnection, UserModel } = require('./dbModels')

DBConnection.on('connected', async () => {
  console.log('Connected to appDB');
})

const app = require('./app')
const PORT = process.env.PORT || 5050

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
module.exports.handler = serverless(app)
