const { authenticatePassword, getAuthenticatedUser, getVerifiedTwoFactorUser } = require("../../../BLL/auth/userService");
const { authenticate } = require("../../middleware/access");
const { register } = require("../../../BLL/auth/registrationService");
const { startTwoFactorEnrollment, confirmTwoFactorEnrollment } = require("../../../BLL/auth/twoFactorDbService");
const { getTwoFactorStatus } = require("../../../BLL/auth/userService");
const { verifyLoginTwoFactor } = require("../../../BLL/auth/twoFactorDbService");
const express = require("express");
const { rateLimit } = require("express-rate-limit");

const {
  verifyEmailToken,
  resendVerification,
} = require("../../../BLL/auth/verificationService");

const router = express.Router();

// Limit verification attempts
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

// Limit resend requests
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

// 1. Verify email
router.post("/verify-email", verifyLimiter, async (req, res) => {
  const token = req.body?.token;

  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({
      message: "Invalid or expired verification link",
    });
  }

  try {
    await verifyEmailToken(token);

    return res.json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    const knownErrors = [
      "Invalid verification token",
      "Invalid or expired verification link",
      "Invalid or already verified account",
    ];

    if (knownErrors.includes(error.message)) {
      return res.status(400).json({
        message: "Invalid or expired verification link",
      });
    }

    console.error("Verification error:", error);

    return res.status(500).json({
      message: "Unable to verify email right now",
    });
  }
});

// 2. Resend verification email
router.post("/resend-verification", resendLimiter, async (req, res) => {
  const email = req.body?.email;

  if (typeof email !== "string" || email.length > 254) {
    return res.status(400).json({
      message: "Invalid email address",
    });
  }

  try {
    const result = await resendVerification(email);
    return res.json(result);
  } catch (error) {
    console.error("Resend verification error:", error);

    return res.status(500).json({
      message: "Unable to process the request",
    });
  }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

router.post("/login", loginLimiter, async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  const password = req.body?.password;

  if (
    !email ||
    email.length > 254 ||
    typeof password !== "string" ||
    !password ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return res.status(400).json({
      message: "Invalid login request",
    });
  }

  try {
    const user = await authenticatePassword(email, password);

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials or unverified account",
      });
    }

    // Generate a new session ID to prevent session fixation
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    if (user.enabled_at) {
      // Password is valid, but 2FA is still required
      req.session.pending2FA = {
        userId: user.user_id,
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
    } else {
      // No 2FA: authentication is complete
      req.session.user = {
        userId: user.user_id,
        role: user.role,
      };
    }

    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    if (user.enabled_at) {
      return res.status(202).json({
        requires2FA: true,
        message: "Enter your Google Authenticator code",
      });
    }

    return res.json({
      authenticated: true,
      user: {
        userId: user.user_id,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Unable to log in right now",
    });
  }
});

const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

router.post("/login/2fa", twoFactorLimiter, async (req, res) => {
  const pending = req.session?.pending2FA;
  const code = req.body?.code;

  // Check for a valid, unexpired login challenge
  if (
    !pending ||
    !Number.isSafeInteger(pending.userId) ||
    !Number.isFinite(pending.expiresAt) ||
    pending.expiresAt <= Date.now()
  ) {
    if (req.session?.pending2FA) {
      delete req.session.pending2FA;
    }

    return res.status(401).json({
      message: "Login challenge expired. Please log in again.",
    });
  }

  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return res.status(400).json({
      message: "Invalid 2FA code format",
    });
  }

  try {
    // Check that the account still exists and 2FA is enabled
    const user = await getVerifiedTwoFactorUser(pending.userId);

    if (!user) {
      delete req.session.pending2FA;

      return res.status(401).json({
        message: "Authentication failed",
      });
    }

    // Verify the code against Google Authenticator TOTP
    const result = await verifyLoginTwoFactor(pending.userId, code);

    if (!result.valid) {
      pending.attempts = (pending.attempts || 0) + 1;

      // Cancel the challenge after five failed attempts
      if (pending.attempts >= 5) {
        delete req.session.pending2FA;
      }

      await new Promise((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      return res.status(401).json({
        message: "Invalid or expired 2FA code",
      });
    }

    // Generate a new session ID after completing 2FA
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    // Authentication is now fully completed
    req.session.user = {
      userId: user.user_id,
      role: user.role,
    };

    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    return res.json({
      authenticated: true,
      message: "Login successful",
      user: req.session.user,
    });
  } catch (error) {
    console.error("2FA login error:", error);

    return res.status(500).json({
      message: "Unable to complete authentication",
    });
  }
});

// Get the currently authenticated user
router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req.session.user.userId);

    if (!user) {
      return res.status(401).json({
        authenticated: false,
        message: "Account unavailable",
      });
    }

    return res.json({
      authenticated: true,
      user: user,
    });
  } catch (error) {
    console.error("Session lookup error:", error.message);

    return res.status(500).json({
      message: "Unable to retrieve account",
    });
  }
});

// Destroy the current session
router.post("/logout", (req, res) => {
  if (!req.session) {
    return res.json({ message: "Logged out" });
  }

  req.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error.message);
      return res.status(500).json({
        message: "Unable to log out",
      });
    }

    res.clearCookie("cortexops.sid", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res.json({
      message: "Logged out successfully",
    });
  });
});

// Public registration and protected 2FA enrollment.
const registerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false });
router.post("/register", registerLimiter, async (req, res) => {
    try {
        const result = await register(req.body || {});
        return res.status(201).json(result);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        console.error("Registration failed:", error);
        return res.status(500).json({ message: "Could not create account" });
    }
});

const enrollLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });
router.get("/2fa/status", authenticate, async (req, res) => {
    try {
        res.setHeader("Cache-Control", "no-store");
        return res.json(await getTwoFactorStatus(req.user.id));
    } catch (error) { return res.status(500).json({ message: "Could not read 2FA status" }); }
});

router.post("/2fa/setup", authenticate, enrollLimiter, async (req, res) => {
    try {
        const result = await startTwoFactorEnrollment(req.user.id);
        res.setHeader("Cache-Control", "no-store");
        return res.json(result);
    } catch (error) {
        if (["2FA is already enabled", "Verify your email first", "Invalid user ID"].includes(error.message))
            return res.status(400).json({ message: error.message });
        console.error("2FA setup failed:", error.message);
        return res.status(500).json({ message: "Unable to start 2FA setup" });
    }
});

router.post("/2fa/confirm", authenticate, enrollLimiter, async (req, res) => {
    try {
        const result = await confirmTwoFactorEnrollment(req.user.id, req.body?.code);
        return res.json(result);
    } catch (error) {
        if (["Invalid 2FA code", "Invalid or expired 2FA code", "2FA enrollment not found", "2FA is already enabled"].includes(error.message))
            return res.status(400).json({ message: error.message });
        console.error("2FA confirmation failed:", error.message);
        return res.status(500).json({ message: "Unable to confirm 2FA setup" });
    }
});

module.exports = router;