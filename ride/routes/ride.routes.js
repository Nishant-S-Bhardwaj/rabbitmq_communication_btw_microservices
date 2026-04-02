const express = require('express');
const router = express.Router();
const rideController = require("../controllers/ride.controller")
const authMiddleware = require("../middleware/authMiddleware")

router.post("/create-ride", authMiddleware.userAuth, rideController.createRide)
router.put("/accept-ride", authMiddleware.captainAuth, rideController.acceptRide)


module.exports = router;
