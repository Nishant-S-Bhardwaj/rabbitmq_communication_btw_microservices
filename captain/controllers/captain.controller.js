const captainModel = require("../models/captain.model")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const blacklisttokenModel = require("../models/blacklisttoken.model")
const { subscribeToQueue } = require("../services/rabbit")

const pendingRequests = []; 


async function register(req, res) {
    try {
        const { name, email, password } = req.body
        const captain = await captainModel.findOne({ email })
        if (captain) {
            return res.status(400).json({ message: "Captain already exists" })
        }
        const hashedPassword = await bcrypt.hash(password, 10)
        const newCaptain = new captainModel({
            name,
            email,
            password: hashedPassword
        })
        await newCaptain.save()

        const token = jwt.sign({ userId: newCaptain._id }, process.env.JWT_SECRET, { expiresIn: "1h" })
        res.cookie("token", token)

        // delete password field from the fetched object before sending response (DB remains unchanged)
        delete newCaptain._doc.password
        res.status(201).json({
            message: "Captain registered successfully",
            newCaptain,
            token
        })
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
}
async function login(req, res) {
    try {
        const { email, password } = req.body;
        const captain = await captainModel
            .findOne({ email })
            .select('+password');

        if (!captain) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, captain.password);

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }


        const token = jwt.sign({ id: captain._id }, process.env.JWT_SECRET, { expiresIn: '4h' });

        // delete password field from the fetched object before sending response (DB remains unchanged)
        delete captain._doc.password;

        res.cookie('token', token);
        delete captain._doc.password;
        res.send({ token, captain });

    } catch (error) {

        res.status(500).json({ message: error.message });
    }

}

async function logout(req, res) {
    try {
        const token = req.cookies.token;
        await blacklisttokenModel.create({ token });
        res.clearCookie('token');
        res.send({ message: 'User logged out successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function profile(req, res) {
    try {
        res.send(req.captain);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function toggleAvailability(req, res) {
    try {
        const captain = await captainModel.findById(req.captain._id);
        captain.isAvailable = !captain.isAvailable;
        await captain.save();
        res.send({ message: `Captain is now ${captain.isAvailable ? 'available' : 'unavailable'}` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function waitForNewRide (req, res){
    // Set timeout for long polling (e.g., 30 seconds)
    req.setTimeout(30000, () => {
        res.status(204).end(); // No Content
    });

    // Add the response object to the pendingRequests array
    pendingRequests.push(res);
};

subscribeToQueue("new-ride", (data) => {
    const rideData = JSON.parse(data);

    // Send the new ride data to all pending requests
    pendingRequests.forEach(res => {
        res.json(rideData);
    });

    // Clear the pending requests
    pendingRequests.length = 0;
});
module.exports = {
    register,
    login,
    logout,
    profile,
    toggleAvailability,
    waitForNewRide
}