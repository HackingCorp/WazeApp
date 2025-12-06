import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<number>('SMTP_PORT', 3587);
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    const smtpSecure = this.configService.get<boolean>('SMTP_SECURE', false);

    if (!smtpHost) {
      this.logger.warn('SMTP_HOST not configured. Email sending will be disabled.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure, // true for 465, false for other ports
      auth: smtpUser && smtpPass ? {
        user: smtpUser,
        pass: smtpPass,
      } : undefined,
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates
      },
    });

    // Verify connection
    this.transporter.verify((error, success) => {
      if (error) {
        this.logger.error('SMTP connection failed:', error);
      } else {
        this.logger.log('✅ SMTP server is ready to send emails');
      }
    });
  }

  private getFromAddress(): string {
    return this.configService.get<string>('SMTP_FROM', 'noreply@wazeapp.xyz');
  }

  private getFromName(): string {
    return this.configService.get<string>('SMTP_FROM_NAME', 'WazeApp');
  }

  private getAppUrl(): string {
    return this.configService.get<string>('APP_URL', 'https://wazeapp.xyz');
  }

  private getDashboardUrl(): string {
    return this.configService.get<string>('DASHBOARD_URL', 'https://app.wazeapp.xyz');
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${this.getAppUrl()}/verify-email?token=${token}`;

    const html = this.getVerificationEmailTemplate(verificationUrl);

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: 'Vérifiez votre adresse email - WazeApp',
        html,
        text: `Bienvenue sur WazeApp!\n\nPour vérifier votre adresse email, cliquez sur ce lien: ${verificationUrl}\n\nCe lien expire dans 24 heures.\n\nSi vous n'avez pas créé de compte, ignorez cet email.`,
      });

      this.logger.log(`✅ Verification email sent to ${email}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send verification email to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${this.getAppUrl()}/reset-password?token=${token}`;

    const html = this.getPasswordResetEmailTemplate(resetUrl);

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: 'Réinitialisation de votre mot de passe - WazeApp',
        html,
        text: `Vous avez demandé à réinitialiser votre mot de passe.\n\nPour réinitialiser votre mot de passe, cliquez sur ce lien: ${resetUrl}\n\nCe lien expire dans 15 minutes.\n\nSi vous n'avez pas demandé cette réinitialisation, ignorez cet email.`,
      });

      this.logger.log(`✅ Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send password reset email to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Send invitation email
   */
  async sendInvitationEmail(
    email: string,
    token: string,
    organizationName: string,
  ): Promise<void> {
    const inviteUrl = `${this.getAppUrl()}/accept-invitation?token=${token}`;

    const html = this.getInvitationEmailTemplate(inviteUrl, organizationName);

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: `Invitation à rejoindre ${organizationName} sur WazeApp`,
        html,
        text: `Vous avez été invité à rejoindre l'organisation ${organizationName} sur WazeApp.\n\nPour accepter l'invitation, cliquez sur ce lien: ${inviteUrl}\n\nSi vous ne souhaitez pas rejoindre cette organisation, ignorez cet email.`,
      });

      this.logger.log(`✅ Invitation email sent to ${email}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send invitation email to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Send quota alert email
   */
  async sendQuotaAlertEmail(
    email: string,
    firstName: string,
    percentUsed: number,
    currentUsage: number,
    limit: number,
    planName: string,
  ): Promise<void> {
    const dashboardUrl = this.getDashboardUrl();
    const billingUrl = `${dashboardUrl}/billing`;

    const html = this.getQuotaAlertEmailTemplate(
      firstName,
      percentUsed,
      currentUsage,
      limit,
      planName,
      billingUrl,
    );

    const subject = percentUsed >= 100
      ? `🚨 Quota de messages atteint - WazeApp`
      : `⚠️ ${percentUsed}% de votre quota utilisé - WazeApp`;

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject,
        html,
        text: `Bonjour ${firstName},\n\nVous avez utilisé ${percentUsed}% de votre quota de messages mensuel (${currentUsage}/${limit} messages).\n\nPlan actuel: ${planName}\n\nPour éviter toute interruption de service, pensez à mettre à niveau votre plan: ${billingUrl}\n\nL'équipe WazeApp`,
      });

      this.logger.log(`✅ Quota alert email (${percentUsed}%) sent to ${email}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send quota alert email to ${email}:`, error);
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    const dashboardUrl = this.getDashboardUrl();

    const html = this.getWelcomeEmailTemplate(firstName, dashboardUrl);

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: 'Bienvenue sur WazeApp! 🎉',
        html,
        text: `Bienvenue ${firstName}!\n\nVotre compte WazeApp est maintenant actif.\n\nCommencez à créer vos agents IA WhatsApp: ${dashboardUrl}\n\nMerci de nous faire confiance!\n\nL'équipe WazeApp`,
      });

      this.logger.log(`✅ Welcome email sent to ${email}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send welcome email to ${email}:`, error);
      // Don't throw for welcome emails
    }
  }

  // ============= EMAIL TEMPLATES =============

  private getVerificationEmailTemplate(verificationUrl: string): string {
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vérifiez votre email</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">WazeApp</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px;">Agents IA WhatsApp</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 24px;">Vérifiez votre adresse email</h2>
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
                Merci de vous être inscrit sur WazeApp ! Pour activer votre compte et commencer à créer vos agents IA WhatsApp, veuillez vérifier votre adresse email.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Vérifier mon email
                </a>
              </div>
              <p style="color: #666666; line-height: 1.6; margin: 20px 0 0 0; font-size: 14px;">
                Ou copiez ce lien dans votre navigateur:<br>
                <a href="${verificationUrl}" style="color: #25D366; word-break: break-all;">${verificationUrl}</a>
              </p>
              <p style="color: #999999; line-height: 1.6; margin: 20px 0 0 0; font-size: 12px;">
                Ce lien expire dans 24 heures. Si vous n'avez pas créé de compte WazeApp, ignorez cet email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px 30px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="color: #999999; margin: 0; font-size: 12px;">
                © 2025 WazeApp. Tous droits réservés.<br>
                <a href="https://wazeapp.xyz" style="color: #25D366; text-decoration: none;">wazeapp.xyz</a>
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

  private getPasswordResetEmailTemplate(resetUrl: string): string {
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Réinitialisation de mot de passe</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">WazeApp</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px;">Agents IA WhatsApp</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 24px;">Réinitialisation de mot de passe</h2>
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
                Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Réinitialiser mon mot de passe
                </a>
              </div>
              <p style="color: #666666; line-height: 1.6; margin: 20px 0 0 0; font-size: 14px;">
                Ou copiez ce lien dans votre navigateur:<br>
                <a href="${resetUrl}" style="color: #25D366; word-break: break-all;">${resetUrl}</a>
              </p>
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                <p style="color: #856404; margin: 0; font-size: 14px;">
                  <strong>⚠️ Important:</strong> Ce lien expire dans 15 minutes pour des raisons de sécurité.
                </p>
              </div>
              <p style="color: #999999; line-height: 1.6; margin: 20px 0 0 0; font-size: 12px;">
                Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe restera inchangé.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px 30px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="color: #999999; margin: 0; font-size: 12px;">
                © 2025 WazeApp. Tous droits réservés.<br>
                <a href="https://wazeapp.xyz" style="color: #25D366; text-decoration: none;">wazeapp.xyz</a>
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

  private getInvitationEmailTemplate(inviteUrl: string, organizationName: string): string {
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation à rejoindre ${organizationName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">WazeApp</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px;">Invitation</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 24px;">Vous êtes invité!</h2>
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
                Vous avez été invité à rejoindre l'organisation <strong style="color: #25D366;">${organizationName}</strong> sur WazeApp.
              </p>
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
                En acceptant cette invitation, vous pourrez collaborer avec votre équipe pour créer et gérer des agents IA WhatsApp.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteUrl}" style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Accepter l'invitation
                </a>
              </div>
              <p style="color: #666666; line-height: 1.6; margin: 20px 0 0 0; font-size: 14px;">
                Ou copiez ce lien dans votre navigateur:<br>
                <a href="${inviteUrl}" style="color: #25D366; word-break: break-all;">${inviteUrl}</a>
              </p>
              <p style="color: #999999; line-height: 1.6; margin: 20px 0 0 0; font-size: 12px;">
                Si vous ne souhaitez pas rejoindre cette organisation, ignorez simplement cet email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px 30px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="color: #999999; margin: 0; font-size: 12px;">
                © 2025 WazeApp. Tous droits réservés.<br>
                <a href="https://wazeapp.xyz" style="color: #25D366; text-decoration: none;">wazeapp.xyz</a>
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

  private getWelcomeEmailTemplate(firstName: string, dashboardUrl: string): string {
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenue sur WazeApp</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px;">🎉 Bienvenue sur WazeApp!</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0; font-size: 18px;">
                Bonjour <strong style="color: #25D366;">${firstName}</strong>,
              </p>
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
                Félicitations ! Votre compte WazeApp est maintenant actif. Vous pouvez commencer à créer vos agents IA WhatsApp et automatiser vos conversations.
              </p>
              <h3 style="color: #333333; margin: 30px 0 15px 0;">🚀 Premiers pas :</h3>
              <ul style="color: #666666; line-height: 1.8; padding-left: 20px;">
                <li>Connectez votre numéro WhatsApp</li>
                <li>Créez votre premier agent IA</li>
                <li>Ajoutez des connaissances à votre base</li>
                <li>Commencez à converser avec vos clients</li>
              </ul>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${dashboardUrl}" style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Accéder au Dashboard
                </a>
              </div>
              <p style="color: #666666; line-height: 1.6; margin: 20px 0 0 0;">
                Besoin d'aide ? Notre équipe support est là pour vous à <a href="mailto:support@wazeapp.xyz" style="color: #25D366;">support@wazeapp.xyz</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px 30px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="color: #999999; margin: 0 0 10px 0; font-size: 12px;">
                Merci de nous faire confiance! 💚
              </p>
              <p style="color: #999999; margin: 0; font-size: 12px;">
                © 2025 WazeApp. Tous droits réservés.<br>
                <a href="https://wazeapp.xyz" style="color: #25D366; text-decoration: none;">wazeapp.xyz</a>
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

  private getQuotaAlertEmailTemplate(
    firstName: string,
    percentUsed: number,
    currentUsage: number,
    limit: number,
    planName: string,
    billingUrl: string,
  ): string {
    const isExceeded = percentUsed >= 100;
    const alertColor = isExceeded ? '#dc3545' : percentUsed >= 90 ? '#fd7e14' : '#ffc107';
    const alertBgColor = isExceeded ? '#f8d7da' : percentUsed >= 90 ? '#fff3cd' : '#fff3cd';
    const alertIcon = isExceeded ? '🚨' : '⚠️';
    const headerBg = isExceeded
      ? 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)'
      : 'linear-gradient(135deg, #fd7e14 0%, #e06700 100%)';

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alerte Quota - WazeApp</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: ${headerBg}; padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">WazeApp</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px;">${alertIcon} Alerte Quota</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0; font-size: 18px;">
                Bonjour <strong style="color: #333;">${firstName}</strong>,
              </p>

              <!-- Alert Box -->
              <div style="background-color: ${alertBgColor}; border-left: 4px solid ${alertColor}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #333; margin: 0; font-size: 16px; font-weight: bold;">
                  ${isExceeded
                    ? '🚨 Votre quota de messages est atteint!'
                    : `⚠️ Vous avez utilisé ${percentUsed}% de votre quota`}
                </p>
              </div>

              <!-- Usage Stats -->
              <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin: 0 0 15px 0; font-size: 16px;">📊 Utilisation actuelle</h3>

                <div style="margin-bottom: 15px;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="color: #666;">Messages utilisés</span>
                    <span style="color: #333; font-weight: bold;">${currentUsage.toLocaleString()} / ${limit.toLocaleString()}</span>
                  </div>
                  <!-- Progress Bar -->
                  <div style="background-color: #e9ecef; border-radius: 10px; height: 20px; overflow: hidden;">
                    <div style="background-color: ${alertColor}; height: 100%; width: ${Math.min(percentUsed, 100)}%; border-radius: 10px;"></div>
                  </div>
                  <p style="color: #666; font-size: 12px; margin: 5px 0 0 0; text-align: right;">
                    ${percentUsed}% utilisé
                  </p>
                </div>

                <div style="border-top: 1px solid #dee2e6; padding-top: 15px; margin-top: 15px;">
                  <p style="color: #666; margin: 0; font-size: 14px;">
                    <strong>Plan actuel:</strong> ${planName}
                  </p>
                </div>
              </div>

              ${isExceeded ? `
              <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <p style="color: #721c24; margin: 0; font-size: 14px;">
                  <strong>Important:</strong> Vos agents WhatsApp ne pourront plus répondre aux messages tant que votre quota n'aura pas été renouvelé ou que vous n'aurez pas mis à niveau votre plan.
                </p>
              </div>
              ` : `
              <p style="color: #666666; line-height: 1.6; margin: 20px 0;">
                Pour éviter toute interruption de service, nous vous recommandons de mettre à niveau votre plan avant d'atteindre la limite.
              </p>
              `}

              <div style="text-align: center; margin: 30px 0;">
                <a href="${billingUrl}" style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Mettre à niveau mon plan
                </a>
              </div>

              <p style="color: #999999; line-height: 1.6; margin: 20px 0 0 0; font-size: 12px; text-align: center;">
                Vous recevez cet email car vous avez atteint un seuil d'utilisation important.<br>
                Questions? Contactez-nous à <a href="mailto:support@wazeapp.xyz" style="color: #25D366;">support@wazeapp.xyz</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px 30px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="color: #999999; margin: 0; font-size: 12px;">
                © 2025 WazeApp. Tous droits réservés.<br>
                <a href="https://wazeapp.xyz" style="color: #25D366; text-decoration: none;">wazeapp.xyz</a>
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
}
