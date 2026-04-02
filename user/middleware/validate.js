const { body, validationResult } = require('express-validator');

async function validateResult(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
}

const emailRule = body("email")
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage("Valid email is required")
    .normalizeEmail();

const validateUser = [
    body("name")
        .trim()
        .isString()
        .withMessage("Name must be a string")
        .notEmpty()
        .withMessage("Name is required")
        .isLength({ min: 2, max: 50 })
        .withMessage("Name must be between 2 and 50 characters"),
    emailRule,
    body("password")
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters long")
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage("Password must contain uppercase, lowercase, and numbers"),
    validateResult
];

const validateLogin = [
    emailRule,
    body("password")
        .notEmpty()
        .withMessage("Password is required"),
    validateResult
];

module.exports = { validateUser, validateLogin };
