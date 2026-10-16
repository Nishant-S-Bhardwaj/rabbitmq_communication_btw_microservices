
const userModel = require("../models/user.model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const blacklisttokenModel = require("../models/blacklisttoken.model");
const { subscribeToQueue } = require("../services/rabbit");
const { EventEmitter } = require("events");

const rideEventEmitter = new EventEmitter();

// Register user
async function register(req, res) {
    try {
        const { name, email, password } = req.body;

        const user = await userModel.findOne({ email });

        if (user) {
            return res.status(400).json({
                message: "User already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new userModel({
            name,
            email,
            password: hashedPassword
        });

        await newUser.save();

        const token = jwt.sign(
            { userId: newUser._id },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.cookie("token", token);

        delete newUser._doc.password;

        return res.status(201).json({
            message: "User registered successfully",
            newUser,
            token
        });
    } catch (error) {
        console.error("User registration error:", error.message);

        return res.status(500).json({
            message: error.message
        });
    }
}

// Login user
async function login(req, res) {
    try {
        const { email, password } = req.body;

        const user = await userModel
            .findOne({ email })
            .select("+password");

        if (!user) {
            return res.status(400).json({
                message: "Invalid email or password"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "4h" }
        );

        delete user._doc.password;

        res.cookie("token", token);

        return res.json({
            token,
            user
        });
    } catch (error) {
        console.error("User login error:", error.message);

        return res.status(500).json({
            message: error.message
        });
    }
}

// Logout user
async function logout(req, res) {
    try {
        const token = req.cookies?.token;

        if (!token) {
            return res.status(400).json({
                message: "No authentication cookie found"
            });
        }

        await blacklisttokenModel.create({ token });

        res.clearCookie("token");

        return res.json({
            message: "User logged out successfully"
        });
    } catch (error) {
        console.error("User logout error:", error.message);

        return res.status(500).json({
            message: error.message
        });
    }
}

// Get user profile
async function profile(req, res) {
    try {
        return res.json(req.user);
    } catch (error) {
        console.error("User profile error:", error.message);

        return res.status(500).json({
            message: error.message
        });
    }
}

// Long-poll for ride acceptance
async function acceptedRide(req, res) {
    let responded = false;
    let timeout;

    const cleanup = () => {
        clearTimeout(timeout);
        rideEventEmitter.removeListener("ride-accepted", onAccepted);
        res.removeListener("close", onClose);
    };

    const onAccepted = (data) => {
        if (responded) return;

        responded = true;
        cleanup();

        if (!res.writableEnded) {
            res.json(data);
        }
    };

    const onClose = () => {
        if (responded) return;

        responded = true;
        cleanup();
    };

    timeout = setTimeout(() => {
        if (responded) return;

        responded = true;
        cleanup();

        if (!res.writableEnded) {
            res.status(204).end();
        }
    }, 30000);

    rideEventEmitter.once("ride-accepted", onAccepted);
    res.on("close", onClose);
}

// Consume accepted-ride messages from RabbitMQ
subscribeToQueue("ride-accepted", async (msg) => {
    try {
        const data = JSON.parse(msg);

        console.log(
            "Received ride-accepted message:",
            data._id || data.id || "unknown ride"
        );

        rideEventEmitter.emit("ride-accepted", data);
    } catch (error) {
        console.error(
            "Error processing ride-accepted message:",
            error.message
        );
    }
});

module.exports = {
    register,
    login,
    logout,
    profile,
    acceptedRide
};

