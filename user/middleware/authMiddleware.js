const jwt = require('jsonwebtoken');
const userModel = require("../models/user.model")
const blacklisttokenModel = require("../models/blacklisttoken.model")

const userAuth = async (req, res, next) => {
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

        const user = await userModel.findById(decoded.id); // ✅ use decoded.id

        if (!user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        req.user = user;
        next();

    } catch (error) {
        console.log(error);
        return res.status(401).json({ message: "Unauthorized" });
    }
};

module.exports = { userAuth };