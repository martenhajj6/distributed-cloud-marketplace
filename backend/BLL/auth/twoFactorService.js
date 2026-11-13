
const crypto = require("node:crypto");
const QRCode = require("qrcode");

// Get our AES-256 encryption key
function getEncryptionKey() {
    const hex = process.env.TOTP_ENCRYPTION_KEY;

    if (!/^[a-f0-9]{64}$/i.test(hex || "")) {
        throw new Error("Invalid TOTP encryption key");
    }

    return Buffer.from(hex, "hex");
}

// Encrypt a TOTP secret
function encryptSecret(userId, secret) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        iv
    );

    cipher.setAAD(Buffer.from(`CortexOps:TOTP:${userId}`));

    const encrypted = Buffer.concat([
        cipher.update(secret, "utf8"),
        cipher.final()
    ]);

    return Buffer.concat([
        iv,
        cipher.getAuthTag(),
        encrypted
    ]);
}

// Decrypt a stored TOTP secret
function decryptSecret(userId, encryptedData) {
    const data = Buffer.from(encryptedData);

    if (data.length < 29) {
        throw new Error("Invalid encrypted TOTP data");
    }

    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);

    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        iv
    );

    decipher.setAAD(Buffer.from(`CortexOps:TOTP:${userId}`));
    decipher.setAuthTag(tag);

    return Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
    ]).toString("utf8");
}

// Prepare 2FA enrollment
async function createTwoFactorSetup(userId, email) {
    const { generateSecret, generateURI } =
        await import("otplib");

    const secret = generateSecret();

    const uri = generateURI({
        issuer: "CortexOps",
        label: email,
        secret
    });

    const qrCode = await QRCode.toDataURL(uri);

    return {
        encryptedSecret: encryptSecret(userId, secret),
        qrCode,
        manualKey: secret
    };
}

// Verify a six-digit code
async function verifyTwoFactorCode(
    userId,
    encryptedSecret,
    code,
    lastUsedStep = null
) {
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
        return { valid: false };
    }

    const { verify } = await import("otplib");

    const secret = decryptSecret(userId, encryptedSecret);

    const options = {
        secret,
        token: code,
        epochTolerance: [30, 0]
    };

    if (lastUsedStep !== null) {
        options.afterTimeStep = Number(lastUsedStep);
    }

    const result = await verify(options);

    return result.valid
        ? { valid: true, timeStep: result.timeStep }
        : { valid: false };
}

module.exports = {
    createTwoFactorSetup,
    verifyTwoFactorCode,
    encryptSecret,
    decryptSecret
};

