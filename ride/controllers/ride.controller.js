const rideModel = require("../models/ride.model")
const { subscribeToQueue,publishToQueue} = require("../services/rabbit")

const createRide = async (req, res) => {
    try {
        const { pickup, destination } = req.body
        const newRide = new rideModel({
            user: req.user._id,
            pickup,
            destination
        });

        publishToQueue("new-ride", JSON.stringify(newRide))

        await newRide.save();
        
        res.status(201).json({ message: "Ride requested successfully", ride: newRide });
    } catch (error) {
        res.status(500).json({ message: "Error requesting ride", error });
    }
};
async function acceptRide (req, res, next) {
    const { rideId } = req.query;
    const ride = await rideModel.findById(rideId);
    if (!ride) {
        return res.status(404).json({ message: 'Ride not found' });
    }

    ride.status = 'accepted';
    await ride.save();
    publishToQueue("ride-accepted", JSON.stringify(ride))
    res.send(ride);
}

module.exports = { createRide ,acceptRide}