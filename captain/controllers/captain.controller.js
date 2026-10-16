const captainModel = require("../models/captain.model")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const blacklisttokenModel = require("../models/blacklisttoken.model")
const { getQueueStatus } = require("../services/rabbit")

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
        if (captain.currentRideId) {
            return res.status(409).json({ message: "Captain is completing a ride" });
        }
        captain.isAvailable = !captain.isAvailable;
        await captain.save();
        res.send({ message: `Captain is now ${captain.isAvailable ? 'available' : 'unavailable'}` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function waitForNewRide (req, res){
    const timeout = setTimeout(() => {
        pendingRequests.splice(pendingRequests.indexOf(res), 1);
        res.status(204).end();
    }, 30000);
    res.on("close", () => clearTimeout(timeout));
    pendingRequests.push(res);
}

function notifyNewRide(ride) {
    pendingRequests.splice(0).forEach((res) => {
        if (!res.writableEnded) res.json(ride);
    });
}

async function queueStatus(req, res) {
    try {
        const { messageCount, consumerCount } = await getQueueStatus("new-ride");
        res.json({ queue: "new-ride", messagesReady: messageCount, consumers: consumerCount });
    } catch (error) {
        res.status(503).json({ message: error.message });
    }
}

module.exports = {
    register,
    login,
    logout,
    profile,
    toggleAvailability,
    waitForNewRide,
    notifyNewRide,
    queueStatus
}