
const bcrypt = require("bcrypt");
const usersDAL = require("../../DAL/auth/usersDAL");

// Used to reduce timing differences for unknown users
const dummyHash = bcrypt.hashSync(
    "dummy-password-not-in-use", 12
);

// Validate login credentials
async function authenticatePassword(email, password) {
    const user = await usersDAL.findForLogin(email);

    const validPassword = await bcrypt.compare(
        password,
        user?.password_hash || dummyHash
    );

    if (!user || !validPassword || !user.email_verified_at) {
        return null;
    }

    return user;
}

// Retrieve authenticated user profile
async function getAuthenticatedUser(userId) {
    const user = await usersDAL.findById(userId);

    if (!user || !user.email_verified_at) {
        return null;
    }

    return {
        userId: user.user_id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role
    };
}

// Check account eligibility for 2FA login
async function getVerifiedTwoFactorUser(userId) {
    return usersDAL.findVerifiedTwoFactorUser(userId);
}

async function checkAuthorization(userId, sessionRole, allowedRoles) {
    const account = await usersDAL.findAuthorization(userId);
    if (!account || !account.email_verified_at) return { status: 401, message: "Account unavailable" };
    if (account.role !== sessionRole) return { status: 401, message: "Please log in again" };
    if (!allowedRoles.includes(account.role)) return { status: 403, message: "Access denied" };
    return null;
}

module.exports = {
    checkAuthorization,
    authenticatePassword,
    getAuthenticatedUser,
    getVerifiedTwoFactorUser
};
