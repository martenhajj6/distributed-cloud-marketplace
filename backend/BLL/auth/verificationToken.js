
const crypto = require("crypto");

function hashVerificationToken(token) {
    return crypto.createHash("sha256")
        .update(token)
        .digest("hex");
}

function createVerificationToken() {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashVerificationToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    return { token, tokenHash, expiresAt };
}

module.exports = {
    createVerificationToken,
    hashVerificationToken
};

