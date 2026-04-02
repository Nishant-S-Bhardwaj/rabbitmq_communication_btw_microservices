require('dotenv').config();
const express = require('express');
const app = express();
const rideRoutes = require("./routes/ride.routes")
const cookieParser = require("cookie-parser")
const connectDB = require("./config/db")
const morgan = require("morgan")
const rabbitMQ = require("./services/rabbit")



connectDB()
rabbitMQ.connect()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(morgan("dev"))
app.use("/", rideRoutes)

module.exports = app;