const bodyParser = require('body-parser')
const express = require('express')
const morgan = require('morgan')
const cookieParser = require('cookie-parser')
const cors = require('cors')
const session = require('express-session')
require('dotenv').config({ path: './.env' })

// import routes
const authRoutes = require('./routes/auth.route')
const userRoutes = require('./routes/user.route')
const adminRoutes = require('./routes/admin.route')
const promptRoutes = require('./routes/prompt.route')

// app
const app = express()

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => callback(null, true),
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true
}

app.use(
  session({
    resave: false,
    saveUninitialized: true,
    secret: 'Orion-1030'
  })
)

app.set('view engine', 'ejs')

// middlewares
app.use(morgan('dev'))

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(cors(corsOptions))

// routes middleware
app.use('/api', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/prompt', promptRoutes)
app.use('/api/admin', adminRoutes)

process.on('uncaughtException', (error, source) => {
  console.log('[UncaughtException]', error, source)
})

module.exports = app
