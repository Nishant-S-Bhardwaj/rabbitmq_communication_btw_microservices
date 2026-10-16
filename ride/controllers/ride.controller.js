const rideModel = require("../models/ride.model")
const { publishToQueue } = require("../services/rabbit")

const createRide = async (req, res) => {
    try {
        const { pickup, destination } = req.body
        const newRide = new rideModel({
            user: req.user._id,
            pickup,
            destination
        });

        await newRide.save();
        await publishToQueue("new-ride", JSON.stringify(newRide));
        
        res.status(201).json({ message: "Ride requested successfully", ride: newRide });
    } catch (error) {
        res.status(500).json({ message: "Error requesting ride", error });
    }
};
async function getRideStatus(req, res) {
    const ride = await rideModel.findById(req.params.rideId);
    if (!ride || String(ride.user) !== String(req.user._id)) {
        return res.status(404).json({ message: "Ride not found" });
    }
    res.json(ride);
}

async function getInternalRide(req, res) {
    const ride = await rideModel.findById(req.params.rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    res.json(ride);
}

async function updateInternalRide(req, res) {
    const { action, captainId } = req.body;
    const ride = await rideModel.findById(req.params.rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });

    const transitions = {
        accept: { from: "requested", to: "accepted" },
        start: { from: "accepted", to: "started" },
        complete: { from: "started", to: "completed" },
    };
    const transition = transitions[action];
    if (!transition) return res.status(400).json({ message: "Unknown ride action" });

    if (ride.status === transition.to && (action !== "accept" || String(ride.captain) === String(captainId))) {
        return res.json(ride);
    }
    if (ride.status !== transition.from) {
        return res.status(409).json({ message: `Cannot ${action} a ${ride.status} ride` });
    }

    const update = { status: transition.to };
    if (action === "accept") {
        if (!captainId) return res.status(400).json({ message: "Captain is required" });
        update.captain = captainId;
    }
    const updatedRide = await rideModel.findOneAndUpdate(
        { _id: ride._id, status: transition.from },
        { $set: update },
        { new: true }
    );
    if (updatedRide) return res.json(updatedRide);

    const currentRide = await rideModel.findById(ride._id);
    if (currentRide.status === transition.to && (action !== "accept" || String(currentRide.captain) === String(captainId))) {
        return res.json(currentRide);
    }
    res.status(409).json({ message: `Cannot ${action} a ${currentRide.status} ride` });
}

module.exports = {
    createRide,
    getRideStatus,
    getInternalRide,
    updateInternalRide,
};