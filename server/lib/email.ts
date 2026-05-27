/**
 * Email Service Module
 *
 * Provides email sending capabilities using:
 * - AWS SES (Primary) - High deliverability, production-grade
 * - Gmail SMTP via Nodemailer (Fallback) - For development or if SES unavailable
 *
 * Features:
 * - Automatic fallback from SES to SMTP
 * - HTML email templates with branding
 * - OTP email helpers (password reset, email verification, account deletion)
 * - Rate limiting integration ready
 * - Logging for debugging
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface EmailConfig {
  // AWS SES Configuration
  aws: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  // SMTP Fallback Configuration (Gmail)
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  // Sender Configuration
  from: {
    email: string;
    name: string;
  };
  // App Configuration
  app: {
    name: string;
    url: string;
    supportEmail: string;
    logoUrl: string;
  };
}

// Load configuration from environment
function loadConfig(): EmailConfig {
  return {
    aws: {
      region: process.env.AWS_REGION || 'ap-south-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    from: {
      email: process.env.EMAIL_FROM || process.env.SES_FROM_EMAIL || 'noreply@your-domain.com',
      name: process.env.EMAIL_FROM_NAME || 'EquityPro',
    },
    app: {
      name: 'EquityPro',
      url: process.env.APP_URL || 'https://your-domain.com',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@your-domain.com',
      logoUrl: process.env.LOGO_URL || 'https://your-domain.com/logo.svg',
    },
  };
}

const config = loadConfig();

// =============================================================================
// EMAIL CLIENTS
// =============================================================================

// AWS SES Client (lazy initialization)
let sesClient: SESClient | null = null;

function getSESClient(): SESClient | null {
  if (!config.aws.accessKeyId || !config.aws.secretAccessKey) {
    return null;
  }

  if (!sesClient) {
    sesClient = new SESClient({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
    console.log('[EMAIL] AWS SES client initialized for region:', config.aws.region);
  }

  return sesClient;
}

// Nodemailer Transporter (lazy initialization)
let smtpTransporter: Transporter | null = null;

function getSMTPTransporter(): Transporter | null {
  if (!config.smtp.user || !config.smtp.pass) {
    return null;
  }

  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
    console.log('[EMAIL] SMTP transporter initialized for:', config.smtp.host);
  }

  return smtpTransporter;
}

// =============================================================================
// EMAIL SENDING
// =============================================================================

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  provider: 'ses' | 'smtp' | 'none';
  error?: string;
}

/**
 * Send email via AWS SES
 */
async function sendViaSES(options: SendEmailOptions): Promise<SendEmailResult> {
  const client = getSESClient();
  if (!client) {
    return { success: false, provider: 'ses', error: 'SES not configured' };
  }

  try {
    const command = new SendEmailCommand({
      Source: `${config.from.name} <${config.from.email}>`,
      Destination: {
        ToAddresses: [options.to],
      },
      Message: {
        Subject: {
          Data: options.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: options.html,
            Charset: 'UTF-8',
          },
          ...(options.text && {
            Text: {
              Data: options.text,
              Charset: 'UTF-8',
            },
          }),
        },
      },
      ReplyToAddresses: options.replyTo ? [options.replyTo] : undefined,
    });

    const response = await client.send(command);
    console.log('[EMAIL] Sent via SES:', options.to, 'MessageId:', response.MessageId);

    return {
      success: true,
      messageId: response.MessageId,
      provider: 'ses',
    };
  } catch (error: any) {
    console.error('[EMAIL] SES error:', error.message);
    return {
      success: false,
      provider: 'ses',
      error: error.message,
    };
  }
}

/**
 * Send email via SMTP (Nodemailer)
 */
async function sendViaSMTP(options: SendEmailOptions): Promise<SendEmailResult> {
  const transporter = getSMTPTransporter();
  if (!transporter) {
    return { success: false, provider: 'smtp', error: 'SMTP not configured' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"${config.from.name}" <${config.from.email}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    });

    console.log('[EMAIL] Sent via SMTP:', options.to, 'MessageId:', info.messageId);

    return {
      success: true,
      messageId: info.messageId,
      provider: 'smtp',
    };
  } catch (error: any) {
    console.error('[EMAIL] SMTP error:', error.message);
    return {
      success: false,
      provider: 'smtp',
      error: error.message,
    };
  }
}

/**
 * Send email with automatic fallback
 *
 * Tries AWS SES first, falls back to SMTP if SES fails
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  // In development without email config, print to terminal but do NOT fake success.
  // Returning success:true here masked delivery failures in production-like envs.
  if (process.env.NODE_ENV !== 'production') {
    const sesAvailable = !!getSESClient();
    const smtpAvailable = !!getSMTPTransporter();

    if (!sesAvailable && !smtpAvailable) {
      console.log('='.repeat(60));
      console.log('[EMAIL] DEV MODE — no provider configured, printing email');
      console.log('[EMAIL] To:     ', options.to);
      console.log('[EMAIL] Subject:', options.subject);
      console.log('[EMAIL] Body (text):', options.text ?? '(no plain-text body)');
      console.log('='.repeat(60));
      return {
        success: false,
        provider: 'none',
        error: 'No email provider configured (SES and SMTP both absent)',
      };
    }
  }

  // Try SES first
  const sesResult = await sendViaSES(options);
  if (sesResult.success) {
    return sesResult;
  }

  // Fallback to SMTP
  console.log('[EMAIL] SES failed, trying SMTP fallback...');
  const smtpResult = await sendViaSMTP(options);
  if (smtpResult.success) {
    return smtpResult;
  }

  // Both failed
  console.error('[EMAIL] All providers failed for:', options.to);
  return {
    success: false,
    provider: 'none',
    error: `SES: ${sesResult.error}, SMTP: ${smtpResult.error}`,
  };
}

// =============================================================================
// EMAIL TEMPLATES
// =============================================================================

/**
 * Base email template with EquityPro branding
 */
function baseTemplate(content: string, preheader: string = ''): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${config.app.name}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <!-- Preheader text (hidden) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    ${preheader}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <!-- Email Container -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Content Card -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 480px; background-color: #171717; border-radius: 16px; border: 1px solid #262626;">
          <!-- Header with Logo Text -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #262626;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <!-- EquityPro Text Logo -->
                    <span style="font-size: 28px; font-weight: 700; color: #ffa31a; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">${config.app.name}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #262626; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #737373;">
                This email was sent by ${config.app.name}
              </p>
              <p style="margin: 0; font-size: 12px; color: #737373;">
                Need help? <a href="mailto:${config.app.supportEmail}" style="color: #ffa31a; text-decoration: none;">Contact Support</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Security Notice -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 480px;">
          <tr>
            <td style="padding: 24px 16px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #525252;">
                If you didn't request this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * OTP display component (used in templates)
 */
function otpDisplay(otp: string): string {
  const digits = otp.split('');
  const boxes = digits
    .map(
      (digit) => `
    <td style="width: 44px; height: 52px; background-color: #262626; border-radius: 8px; text-align: center; vertical-align: middle;">
      <span style="font-size: 24px; font-weight: 700; color: #ffffff; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;">${digit}</span>
    </td>
  `
    )
    .join('<td style="width: 8px;"></td>');

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 24px auto;">
      <tr>
        ${boxes}
      </tr>
    </table>
  `;
}

// =============================================================================
// OTP EMAIL METHODS
// =============================================================================

export interface OTPEmailOptions {
  to: string;
  otp: string;
  expiryMinutes: number;
  userName?: string;
}

/**
 * Send password reset OTP email
 */
export async function sendPasswordResetEmail(options: OTPEmailOptions): Promise<SendEmailResult> {
  const { to, otp, expiryMinutes, userName } = options;
  const greeting = userName ? `Hi ${userName},` : 'Hi,';

  const content = `
    <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #ffffff; text-align: center;">
      Reset Your Password
    </h1>
    <p style="margin: 0 0 24px 0; font-size: 15px; color: #a3a3a3; text-align: center; line-height: 1.6;">
      ${greeting} We received a request to reset your ${config.app.name} password. Use the code below to complete the process.
    </p>

    ${otpDisplay(otp)}

    <p style="margin: 0 0 24px 0; font-size: 14px; color: #737373; text-align: center;">
      This code expires in <strong style="color: #ffa31a;">${expiryMinutes} minutes</strong>
    </p>

    <div style="background-color: #1a1a1a; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 13px; color: #a3a3a3; text-align: center;">
        <strong style="color: #ef4444;">⚠️ Security Notice:</strong><br>
        Never share this code with anyone. ${config.app.name} will never ask for your code via phone or chat.
      </p>
    </div>

    <p style="margin: 0; font-size: 13px; color: #525252; text-align: center;">
      If you didn't request a password reset, please ignore this email or <a href="mailto:${config.app.supportEmail}" style="color: #ffa31a; text-decoration: none;">contact support</a> if you have concerns.
    </p>
  `;

  return sendEmail({
    to,
    subject: `${otp} is your ${config.app.name} password reset code`,
    html: baseTemplate(content, `Your password reset code is ${otp}. Valid for ${expiryMinutes} minutes.`),
    text: `Your ${config.app.name} password reset code is: ${otp}\n\nThis code expires in ${expiryMinutes} minutes.\n\nIf you didn't request this, please ignore this email.`,
  });
}

/**
 * Send email verification OTP email
 */
export async function sendEmailVerificationEmail(options: OTPEmailOptions): Promise<SendEmailResult> {
  const { to, otp, expiryMinutes, userName } = options;
  const greeting = userName ? `Hi ${userName},` : 'Hi,';

  const content = `
    <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #ffffff; text-align: center;">
      Verify Your Email
    </h1>
    <p style="margin: 0 0 24px 0; font-size: 15px; color: #a3a3a3; text-align: center; line-height: 1.6;">
      ${greeting} Thanks for signing up for ${config.app.name}! Please verify your email address using the code below.
    </p>

    ${otpDisplay(otp)}

    <p style="margin: 0 0 24px 0; font-size: 14px; color: #737373; text-align: center;">
      This code expires in <strong style="color: #ffa31a;">${expiryMinutes} minutes</strong>
    </p>

    <div style="background-color: #0d2818; border: 1px solid #166534; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 13px; color: #86efac; text-align: center;">
        ✓ Once verified, you'll have full access to all ${config.app.name} features
      </p>
    </div>

    <p style="margin: 0; font-size: 13px; color: #525252; text-align: center;">
      If you didn't create a ${config.app.name} account, please ignore this email.
    </p>
  `;

  return sendEmail({
    to,
    subject: `${otp} - Verify your ${config.app.name} email`,
    html: baseTemplate(content, `Your verification code is ${otp}. Verify your email to access ${config.app.name}.`),
    text: `Your ${config.app.name} verification code is: ${otp}\n\nThis code expires in ${expiryMinutes} minutes.\n\nIf you didn't create an account, please ignore this email.`,
  });
}

/**
 * Send account deletion confirmation OTP email
 */
export async function sendAccountDeletionEmail(options: OTPEmailOptions): Promise<SendEmailResult> {
  const { to, otp, expiryMinutes, userName } = options;
  const greeting = userName ? `Hi ${userName},` : 'Hi,';

  const content = `
    <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #ffffff; text-align: center;">
      Confirm Account Deletion
    </h1>
    <p style="margin: 0 0 24px 0; font-size: 15px; color: #a3a3a3; text-align: center; line-height: 1.6;">
      ${greeting} We received a request to permanently delete your ${config.app.name} account. This action cannot be undone.
    </p>

    ${otpDisplay(otp)}

    <p style="margin: 0 0 24px 0; font-size: 14px; color: #737373; text-align: center;">
      This code expires in <strong style="color: #ffa31a;">${expiryMinutes} minutes</strong>
    </p>

    <div style="background-color: #2a1215; border: 1px solid #991b1b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 13px; color: #fca5a5; text-align: center;">
        <strong>⚠️ Warning:</strong> Deleting your account will permanently remove all your data including watchlists, saved screens, and preferences.
      </p>
    </div>

    <p style="margin: 0; font-size: 13px; color: #525252; text-align: center;">
      If you didn't request account deletion, please ignore this email and <a href="mailto:${config.app.supportEmail}" style="color: #ffa31a; text-decoration: none;">contact support</a> immediately.
    </p>
  `;

  return sendEmail({
    to,
    subject: `${otp} - Confirm ${config.app.name} account deletion`,
    html: baseTemplate(content, `Confirm your account deletion with code ${otp}. This action is permanent.`),
    text: `Your ${config.app.name} account deletion code is: ${otp}\n\nThis code expires in ${expiryMinutes} minutes.\n\nWARNING: This action cannot be undone.\n\nIf you didn't request this, please ignore this email and contact support.`,
  });
}

/**
 * Send welcome email after signup
 */
export async function sendWelcomeEmail(options: { to: string; userName: string }): Promise<SendEmailResult> {
  const { to, userName } = options;

  const content = `
    <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #ffffff; text-align: center;">
      Welcome to ${config.app.name}! 🎉
    </h1>
    <p style="margin: 0 0 24px 0; font-size: 15px; color: #a3a3a3; text-align: center; line-height: 1.6;">
      Hi ${userName}, your account has been created successfully. You're now ready to explore AI-powered stock analysis.
    </p>

    <div style="background-color: #1a1a1a; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #ffffff;">
        Get Started:
      </h2>
      <ul style="margin: 0; padding: 0 0 0 20px; color: #a3a3a3; font-size: 14px; line-height: 1.8;">
        <li>�� <strong style="color: #ffffff;">Expert Screener</strong> - Find stocks matching your criteria</li>
        <li>🤖 <strong style="color: #ffffff;">AI Sentiment Analysis</strong> - Analyze market sentiment</li>
        <li>📈 <strong style="color: #ffffff;">Strategy Backtesting</strong> - Test trading strategies</li>
        <li>🎯 <strong style="color: #ffffff;">Market Mood Index</strong> - Track fear & greed</li>
      </ul>
    </div>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td align="center">
          <a href="${config.app.url}" style="display: inline-block; background: linear-gradient(135deg, #ffa31a 0%, #ff8c00 100%); color: #000000; font-weight: 600; font-size: 15px; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
            Start Exploring →
          </a>
        </td>
      </tr>
    </table>
  `;

  return sendEmail({
    to,
    subject: `Welcome to ${config.app.name} - Let's get started!`,
    html: baseTemplate(content, `Welcome to ${config.app.name}! Start exploring AI-powered stock analysis.`),
    text: `Welcome to ${config.app.name}, ${userName}!\n\nYour account has been created successfully.\n\nGet started at: ${config.app.url}\n\nFeatures:\n- Expert Screener\n- AI Sentiment Analysis\n- Strategy Backtesting\n- Market Mood Index`,
  });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): { ses: boolean; smtp: boolean; any: boolean } {
  const ses = !!(config.aws.accessKeyId && config.aws.secretAccessKey);
  const smtp = !!(config.smtp.user && config.smtp.pass);
  return { ses, smtp, any: ses || smtp };
}

/**
 * Verify email configuration by sending a test email
 */
export async function verifyEmailConfig(testAddress: string): Promise<SendEmailResult> {
  return sendEmail({
    to: testAddress,
    subject: `${config.app.name} Email Configuration Test`,
    html: baseTemplate(`
      <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #ffffff; text-align: center;">
        Email Configuration Verified ✓
      </h1>
      <p style="margin: 0; font-size: 15px; color: #a3a3a3; text-align: center; line-height: 1.6;">
        This is a test email to verify your ${config.app.name} email configuration is working correctly.
      </p>
    `),
    text: 'Email configuration test successful.',
  });
}

/**
 * Get current email configuration status (for debugging)
 */
export function getEmailStatus(): {
  configured: { ses: boolean; smtp: boolean };
  from: string;
  region: string;
} {
  const configStatus = isEmailConfigured();
  return {
    configured: { ses: configStatus.ses, smtp: configStatus.smtp },
    from: config.from.email,
    region: config.aws.region,
  };
}
