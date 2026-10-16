require('dotenv').config();
const express = require('express');
const app = express();
const captainRoutes = require("./routes/captain.routes")
const cookieParser = require("cookie-parser")
const connectDB = require("./config/db")
const morgan = require("morgan")
const rabbitMQ = require("./services/rabbit")
const rideWorker = require("./services/rideWorker")



connectDB().then(async () => {
	await rabbitMQ.connect()
	await rideWorker.start()
}).catch((error) => {
	console.error("Captain service startup failed:", error.message)
	process.exit(1)
})

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(morgan("dev"))
app.use("/", captainRoutes)

module.exports = app;