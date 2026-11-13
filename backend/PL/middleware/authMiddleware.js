
const { checkAuthorization } = require("../../BLL/auth/userService");

// Check whether the user is logged in
function requireAuth(req, res, next) {
    const user = req.session?.user;

    if (!user || !Number.isSafeInteger(user.userId)) {
        return res.status(401).json({
            message: "Authentication required"
        });
    }

    next();
}

// Check whether the user has permission
function requireRole(...allowedRoles) {
    return async (req, res, next) => {
        const user = req.session?.user;

        if (!user || !Number.isSafeInteger(user.userId)) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        try {
            const failure = await checkAuthorization(user.userId, user.role, allowedRoles);
            if (failure) {
                return res.status(failure.status).json({ message: failure.message });
            }

            next();

        } catch (error) {
            console.error("Authorization error:", error.message);

            return res.status(500).json({
                message: "Authorization unavailable"
            });
        }
    };
}

module.exports = { requireAuth, requireRole };

