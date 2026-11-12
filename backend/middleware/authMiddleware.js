
const db = require("../db");

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
            const [rows] = await db.execute(
                `SELECT role, email_verified_at
                 FROM Users WHERE user_id = ?`,
                [user.userId]
            );

            if (!rows.length || !rows[0].email_verified_at) {
                return res.status(401).json({
                    message: "Account unavailable"
                });
            }

            // Require a fresh login if the role changed
            if (rows[0].role !== user.role) {
                return res.status(401).json({
                    message: "Please log in again"
                });
            }

            if (!allowedRoles.includes(rows[0].role)) {
                return res.status(403).json({
                    message: "Access denied"
                });
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

