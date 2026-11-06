
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST,
    port: Number(process.env.BREVO_SMTP_PORT),
    secure: false,
    requireTLS: true,
    auth: {
        user: process.env.BREVO_SMTP_LOGIN,
        pass: process.env.BREVO_SMTP_KEY
    }
});

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

async function sendVerificationEmail(to, firstName, verificationUrl) {
    const url = new URL(verificationUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Invalid verification URL");
    }

    const safeName = escapeHtml(firstName);
    const safeUrl = escapeHtml(url.toString());

    return transporter.sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject: "Verify your CortexOps account",

        text: `Hello ${firstName},

Welcome to CortexOps!

Verify your email address using this link:
${url.toString()}

This link expires in 30 minutes.

If you did not create an account, ignore this email.

CortexOps Team`,

        html: `
        <div style="font-family:Arial,sans-serif;
                    max-width:560px;margin:auto;
                    padding:32px;color:#263238;">

            <h2 style="color:#172c36;">CortexOps</h2>
            <hr style="border:0;border-top:1px solid #e5e7eb;">

            <h1 style="font-size:24px;">Verify your email</h1>

            <p>Hello ${safeName},</p>

            <p>Welcome to CortexOps! Please confirm your
            email address to activate your account.</p>

            <p style="margin:32px 0;">
                <a href="${safeUrl}"
                   style="background:#172c36;color:#ffffff;
                          padding:14px 24px;text-decoration:none;
                          border-radius:6px;">
                    Verify Email Address
                </a>
            </p>

            <p style="font-size:13px;color:#64748b;">
                This verification link expires in 30 minutes.
            </p>

            <hr style="border:0;border-top:1px solid #e5e7eb;">

            <p style="font-size:12px;color:#94a3b8;">
                If you didn't create an account,
                you can safely ignore this email.
            </p>
        </div>`
    });
}

module.exports = { sendVerificationEmail };

