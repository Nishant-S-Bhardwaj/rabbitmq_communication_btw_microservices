const express = require('express');
const router = express.Router();
const rideController = require("../controllers/ride.controller")
const authMiddleware = require("../middleware/authMiddleware")

const serviceAuth = (req, res, next) => {
	const expected = process.env.INTERNAL_API_TOKEN || process.env.JWT_SECRET;
	if (!expected || req.headers["x-service-token"] !== expected) {
		return res.status(401).json({ message: "Unauthorized service request" });
	}
	next();
};

router.post("/create-ride", authMiddleware.userAuth, rideController.createRide)
router.get("/status/:rideId", authMiddleware.userAuth, rideController.getRideStatus)
router.get("/internal/rides/:rideId", serviceAuth, rideController.getInternalRide)
router.patch("/internal/rides/:rideId", serviceAuth, rideController.updateInternalRide)


module.exports = router;
