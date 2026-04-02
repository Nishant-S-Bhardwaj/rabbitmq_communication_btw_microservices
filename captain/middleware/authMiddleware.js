const jwt = require('jsonwebtoken');
const captainModel = require("../models/captain.model")
const blacklisttokenModel = require("../models/blacklisttoken.model")

const captainAuth = async (req, res, next) => {
    try {
        // Read token from Authorization header instead of cookies
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Extract token after "Bearer"

        if (!token) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const isblacklisted = await blacklisttokenModel.findOne({ token });
        if (isblacklisted) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const captain = await captainModel.findById(decoded.id); // ✅ use decoded.id

        if (!captain) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        req.captain = captain;
        next();

    } catch (error) {
        console.log(error);
        return res.status(401).json({ message: "Unauthorized" });
    }
};

module.exports = { captainAuth };