const captainModel = require("../models/captain.model");
const { subscribeToQueue } = require("./rabbit");
const { notifyNewRide } = require("../controllers/captain.controller");

const RIDE_SERVICE_URL = process.env.RIDE_SERVICE_URL || "http://ride:3003";
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN || process.env.JWT_SECRET;
const PICKUP_DELAY_MS = Number(process.env.PICKUP_DELAY_MS) || 5000;
const TRIP_DURATION_MS = Number(process.env.TRIP_DURATION_MS) || 15000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rideRequest(rideId, method = "GET", body) {
    const response = await fetch(`${RIDE_SERVICE_URL}/internal/rides/${rideId}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "x-service-token": INTERNAL_API_TOKEN,
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.message || `Ride service returned ${response.status}`);
    }
    return result;
}

async function processRide(data) {
    const { _id: rideId } = JSON.parse(data);
    let ride = await rideRequest(rideId);
    if (ride.status === "completed") {
        if (ride.captain) {
            await captainModel.findByIdAndUpdate(ride.captain, {
                $set: { isAvailable: true },
                $unset: { currentRideId: 1 },
            });
        }
        return;
    }

    notifyNewRide(ride);
    let captain;

    while (ride.status === "requested") {
        captain = await captainModel.findOneAndUpdate(
            { isAvailable: true },
            { $set: { isAvailable: false, currentRideId: rideId } },
            { new: true, sort: { createdAt: 1 } }
        );

        if (!captain) {
            await delay(1000);
            ride = await rideRequest(rideId);
            continue;
        }

        try {
            ride = await rideRequest(rideId, "PATCH", {
                action: "accept",
                captainId: captain._id,
            });
        } catch (error) {
            await captainModel.findByIdAndUpdate(captain._id, {
                $set: { isAvailable: true },
                $unset: { currentRideId: 1 },
            });
            throw error;
        }
    }

    const captainId = ride.captain;
    if (ride.status === "accepted") {
        await delay(PICKUP_DELAY_MS);
        ride = await rideRequest(rideId, "PATCH", { action: "start" });
        console.log(`Ride ${rideId} started with captain ${captainId}`);
    }

    if (ride.status === "started") {
        await delay(TRIP_DURATION_MS);
        ride = await rideRequest(rideId, "PATCH", { action: "complete" });
    }

    if (captainId) {
        await captainModel.findByIdAndUpdate(captainId, {
            $set: { isAvailable: true },
            $unset: { currentRideId: 1 },
        });
    }
    console.log(`Ride ${rideId} completed and acknowledged`);
}

function start() {
    return subscribeToQueue("new-ride", processRide);
}

module.exports = { start };