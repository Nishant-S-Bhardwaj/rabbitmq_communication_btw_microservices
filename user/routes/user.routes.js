const express = require('express');
const router = express.Router();
const userController = require("../controllers/user.controller")
const authMiddleware = require("../middleware/authMiddleware") 
const validateMiddleware = require("../middleware/validate") 

router.post("/register", validateMiddleware.validateUser, userController.register)
router.post("/login", userController.login)
router.post("/logout",userController.logout)
router.get("/profile", authMiddleware.userAuth,userController.profile)
router.get('/accepted-ride', authMiddleware.userAuth, userController.acceptedRide);


module.exports = router;
