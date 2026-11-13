const { authenticatePassword, getAuthenticatedUser, getVerifiedTwoFactorUser } = require("../../BLL/auth/userService");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { verifyLoginTwoFactor } = require("../../BLL/auth/twoFactorDbService");
const express = require("express");
const { rateLimit } = require("express-rate-limit");

const {
  verifyEmailToken,
  resendVerification,
} = require("../../BLL/auth/verificationService");

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
router.get("/me", requireAuth, async (req, res) => {
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

// Temporary RBAC test endpoints
router.get(
  "/test-customer",
  requireAuth,
  requireRole("customer"),
  (req, res) => {
    res.json({ message: "Customer access granted" });
  },
);

router.get("/test-admin", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ message: "Admin access granted" });
});

module.exports = router;