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
    const smtpPort = this.configService.get<number>('SMTP_PORT', 587);
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    const smtpSecure = this.configService.get<boolean>('SMTP_SECURE', false);

    if (!smtpHost) {
      this.logger.warn('SMTP_HOST not configured. Email sending will be disabled. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables to enable emails.');
      return;
    }

    if (!smtpUser || !smtpPass) {
      this.logger.warn('SMTP_USER or SMTP_PASS not configured. Email sending will be disabled.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        tls: {
          rejectUnauthorized: false, // Allow self-signed certificates
        },
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });

      // Verify connection asynchronously without blocking startup
      this.transporter.verify()
        .then(() => {
          this.logger.log('✅ SMTP server is ready to send emails');
        })
        .catch((error) => {
          this.logger.warn(`SMTP connection verification failed: ${error.message}. Emails may not be sent until SMTP is properly configured.`);
          // Don't set transporter to null - let it retry on actual send
        });
    } catch (error) {
      this.logger.warn(`Failed to initialize SMTP transporter: ${error.message}. Email sending will be disabled.`);
      this.transporter = null;
    }
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

    if (!this.transporter) {
      this.logger.warn(`⚠️ SMTP not configured, skipping verification email to ${email}`);
      return;
    }

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
      this.logger.error(`❌ Failed to send verification email to ${email}: ${error.message}`);
      // Don't throw - registration should succeed even if email fails
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

  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmationEmail(
    email: string,
    firstName: string,
    paymentDetails: {
      amount: number;
      currency: string;
      transactionId: string;
      paymentMethod: string;
      planName: string;
      date: Date;
    },
  ): Promise<void> {
    const dashboardUrl = this.getDashboardUrl();

    const html = this.getPaymentConfirmationEmailTemplate(firstName, paymentDetails, dashboardUrl);

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: `✅ Confirmation de paiement - ${paymentDetails.amount.toLocaleString()} ${paymentDetails.currency}`,
        html,
        text: `Bonjour ${firstName},\n\nVotre paiement de ${paymentDetails.amount.toLocaleString()} ${paymentDetails.currency} a été reçu avec succès.\n\nDétails:\n- Plan: ${paymentDetails.planName}\n- Transaction: ${paymentDetails.transactionId}\n- Méthode: ${paymentDetails.paymentMethod}\n- Date: ${paymentDetails.date.toLocaleDateString('fr-FR')}\n\nMerci pour votre confiance!\n\nL'équipe WazeApp`,
      });

      this.logger.log(`✅ Payment confirmation email sent to ${email}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send payment confirmation email to ${email}:`, error);
      // Don't throw for confirmation emails
    }
  }

  /**
   * Send payment reminder email
   */
  async sendPaymentReminderEmail(
    email: string,
    firstName: string,
    reminderDetails: {
      invoiceNumber: string;
      amount: number;
      currency: string;
      dueDate: Date;
      daysUntilDue: number;
      daysOverdue: number;
      planName: string;
      organizationName: string;
      isOverdue: boolean;
      reminderCount: number;
    },
  ): Promise<void> {
    const dashboardUrl = this.getDashboardUrl();
    const billingUrl = `${dashboardUrl}/billing`;

    const html = this.getPaymentReminderEmailTemplate(firstName, reminderDetails, billingUrl);

    const subject = reminderDetails.isOverdue
      ? `🚨 Facture en retard - ${reminderDetails.invoiceNumber}`
      : reminderDetails.daysUntilDue <= 1
        ? `⚠️ Dernière chance - Facture ${reminderDetails.invoiceNumber} due demain`
        : `📅 Rappel - Facture ${reminderDetails.invoiceNumber} due dans ${reminderDetails.daysUntilDue} jours`;

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject,
        html,
        text: `Bonjour ${firstName},\n\n${reminderDetails.isOverdue ? 'Votre facture est en retard!' : 'Rappel de paiement'}\n\nFacture: ${reminderDetails.invoiceNumber}\nMontant: ${reminderDetails.amount.toLocaleString()} ${reminderDetails.currency}\nDate d'échéance: ${reminderDetails.dueDate.toLocaleDateString('fr-FR')}\nPlan: ${reminderDetails.planName}\n\nPour payer: ${billingUrl}\n\nL'équipe WazeApp`,
      });

      this.logger.log(`✅ Payment reminder email sent to ${email} for invoice ${reminderDetails.invoiceNumber}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send payment reminder email to ${email}:`, error);
      // Don't throw for reminder emails
    }
  }

  /**
   * Send new invoice email (for renewal invoices generated 10 days before end)
   */
  async sendNewInvoiceEmail(
    email: string,
    firstName: string,
    invoiceDetails: {
      invoiceNumber: string;
      amount: number;
      currency: string;
      dueDate: Date;
      planName: string;
      organizationName: string;
      periodStart: Date;
      periodEnd: Date;
    },
  ): Promise<void> {
    const dashboardUrl = this.getDashboardUrl();
    const billingUrl = `${dashboardUrl}/billing`;

    const periodFormatted = `${invoiceDetails.periodStart.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} - ${invoiceDetails.periodEnd.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    const dueDateFormatted = invoiceDetails.dueDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nouvelle facture</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">📄 Nouvelle Facture</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Bonjour ${firstName},</p>

              <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
                Votre facture de renouvellement pour <strong>${invoiceDetails.organizationName}</strong> est disponible.
              </p>

              <!-- Invoice Details Box -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea;">
                <table width="100%" style="border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Numéro de facture:</td>
                    <td style="padding: 8px 0; color: #333; font-weight: bold; text-align: right;">${invoiceDetails.invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Plan:</td>
                    <td style="padding: 8px 0; color: #333; font-weight: bold; text-align: right;">${invoiceDetails.planName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Période:</td>
                    <td style="padding: 8px 0; color: #333; text-align: right;">${periodFormatted}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Montant:</td>
                    <td style="padding: 8px 0; color: #667eea; font-weight: bold; font-size: 18px; text-align: right;">${invoiceDetails.amount.toLocaleString()} ${invoiceDetails.currency}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Date d'échéance:</td>
                    <td style="padding: 8px 0; color: #e74c3c; font-weight: bold; text-align: right;">${dueDateFormatted}</td>
                  </tr>
                </table>
              </div>

              <p style="font-size: 14px; color: #666; margin: 20px 0;">
                Pour assurer la continuité de votre service, veuillez procéder au paiement avant la date d'échéance.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${billingUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 25px; font-weight: bold; font-size: 16px;">Payer maintenant</a>
              </div>

              <p style="font-size: 14px; color: #999; text-align: center;">
                Des questions? Contactez-nous à support@wazeapp.xyz
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} WazeApp. Tous droits réservés.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: `📄 Facture de renouvellement - ${invoiceDetails.invoiceNumber}`,
        html,
        text: `Bonjour ${firstName},\n\nVotre facture de renouvellement est disponible.\n\nFacture: ${invoiceDetails.invoiceNumber}\nPlan: ${invoiceDetails.planName}\nPériode: ${periodFormatted}\nMontant: ${invoiceDetails.amount.toLocaleString()} ${invoiceDetails.currency}\nDate d'échéance: ${dueDateFormatted}\n\nPour payer: ${billingUrl}\n\nL'équipe WazeApp`,
      });

      this.logger.log(`✅ New invoice email sent to ${email} for invoice ${invoiceDetails.invoiceNumber}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send new invoice email to ${email}:`, error);
      // Don't throw for invoice emails
    }
  }

  /**
   * Send subscription upgrade confirmation email
   */
  async sendSubscriptionUpgradeEmail(
    email: string,
    firstName: string,
    upgradeDetails: {
      previousPlan: string;
      newPlan: string;
      newLimits: {
        messages: number;
        agents: number;
        storage: string;
      };
      nextBillingDate: Date;
      amount: number;
      currency: string;
    },
  ): Promise<void> {
    const dashboardUrl = this.getDashboardUrl();

    const html = this.getSubscriptionUpgradeEmailTemplate(firstName, upgradeDetails, dashboardUrl);

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: `🚀 Abonnement mis à niveau vers ${upgradeDetails.newPlan}!`,
        html,
        text: `Bonjour ${firstName},\n\nFélicitations! Votre abonnement a été mis à niveau de ${upgradeDetails.previousPlan} vers ${upgradeDetails.newPlan}.\n\nVos nouvelles limites:\n- ${upgradeDetails.newLimits.messages.toLocaleString()} messages/mois\n- ${upgradeDetails.newLimits.agents} agents\n- ${upgradeDetails.newLimits.storage} stockage\n\nProchaine facturation: ${upgradeDetails.nextBillingDate.toLocaleDateString('fr-FR')}\n\nAccédez à votre dashboard: ${dashboardUrl}\n\nMerci pour votre confiance!\n\nL'équipe WazeApp`,
      });

      this.logger.log(`✅ Subscription upgrade email sent to ${email}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send subscription upgrade email to ${email}:`, error);
      // Don't throw for upgrade emails
    }
  }

  /**
   * Send trial start email
   */
  async sendTrialStartEmail(
    email: string,
    firstName: string,
    details: {
      planName: string;
      trialDays: number;
      trialEndsAt: Date;
    },
  ): Promise<void> {
    const dashboardUrl = this.getDashboardUrl();
    const billingUrl = `${dashboardUrl}/billing`;
    const trialEndFormatted = details.trialEndsAt.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Essai gratuit active</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Votre essai gratuit est actif !</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Bonjour ${firstName},</p>
              <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
                Votre essai gratuit du plan <strong>${details.planName}</strong> est maintenant actif pour <strong>${details.trialDays} jours</strong>.
              </p>
              <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #155724; margin: 0; font-size: 16px;">
                  Profitez de toutes les fonctionnalites du plan ${details.planName} jusqu'au <strong>${trialEndFormatted}</strong>.
                </p>
              </div>
              <p style="font-size: 14px; color: #666; margin: 20px 0;">
                Une facture a ete generee et sera due a la fin de votre periode d'essai. Si vous payez avant cette date, votre abonnement sera active sans interruption.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${billingUrl}" style="display: inline-block; background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 25px; font-weight: bold; font-size: 16px;">Acceder au dashboard</a>
              </div>
              <p style="font-size: 14px; color: #999; text-align: center;">
                Des questions? Contactez-nous a support@wazeapp.xyz
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                &copy; ${new Date().getFullYear()} WazeApp. Tous droits reserves.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    if (!this.transporter) {
      this.logger.warn(`SMTP not configured, skipping trial start email to ${email}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: `Essai gratuit active - Plan ${details.planName} (${details.trialDays} jours)`,
        html,
        text: `Bonjour ${firstName},\n\nVotre essai gratuit du plan ${details.planName} est actif pour ${details.trialDays} jours (jusqu'au ${trialEndFormatted}).\n\nUne facture a ete generee et sera due a la fin de votre essai.\n\nAccedez au dashboard: ${billingUrl}\n\nL'equipe WazeApp`,
      });
      this.logger.log(`Trial start email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send trial start email to ${email}: ${error.message}`);
    }
  }

  /**
   * Send trial reminder email
   */
  async sendTrialReminderEmail(
    email: string,
    firstName: string,
    details: {
      planName: string;
      daysRemaining: number;
      trialEndsAt: Date;
    },
  ): Promise<void> {
    const dashboardUrl = this.getDashboardUrl();
    const billingUrl = `${dashboardUrl}/billing`;
    const trialEndFormatted = details.trialEndsAt.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const urgencyColor = details.daysRemaining <= 1 ? '#dc3545' : '#fd7e14';
    const urgencyBg = details.daysRemaining <= 1 ? '#f8d7da' : '#fff3cd';
    const urgencyText = details.daysRemaining === 0
      ? 'Votre essai gratuit expire aujourd\'hui !'
      : details.daysRemaining === 1
        ? 'Votre essai gratuit expire demain !'
        : `Votre essai gratuit expire dans ${details.daysRemaining} jours.`;

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rappel essai gratuit</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, ${urgencyColor} 0%, #c82333 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Rappel - Essai Gratuit</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Bonjour ${firstName},</p>
              <div style="background-color: ${urgencyBg}; border-left: 4px solid ${urgencyColor}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #333; margin: 0; font-size: 16px; font-weight: bold;">
                  ${urgencyText}
                </p>
              </div>
              <p style="font-size: 14px; color: #666; margin: 20px 0;">
                Votre essai du plan <strong>${details.planName}</strong> se termine le <strong>${trialEndFormatted}</strong>.
                Pour continuer a profiter de toutes les fonctionnalites, payez votre facture avant cette date.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${billingUrl}" style="display: inline-block; background: ${urgencyColor}; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 25px; font-weight: bold; font-size: 16px;">Payer maintenant</a>
              </div>
              <p style="font-size: 14px; color: #999; text-align: center;">
                Des questions? Contactez-nous a support@wazeapp.xyz
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                &copy; ${new Date().getFullYear()} WazeApp. Tous droits reserves.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    if (!this.transporter) {
      this.logger.warn(`SMTP not configured, skipping trial reminder email to ${email}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: details.daysRemaining === 0
          ? `Votre essai gratuit expire aujourd'hui !`
          : `Rappel: Essai gratuit - ${details.daysRemaining} jour(s) restant(s)`,
        html,
        text: `Bonjour ${firstName},\n\n${urgencyText}\n\nPlan: ${details.planName}\nExpiration: ${trialEndFormatted}\n\nPour payer: ${billingUrl}\n\nL'equipe WazeApp`,
      });
      this.logger.log(`Trial reminder email sent to ${email} (${details.daysRemaining} days remaining)`);
    } catch (error) {
      this.logger.error(`Failed to send trial reminder email to ${email}: ${error.message}`);
    }
  }

  /**
   * Send trial expired email
   */
  async sendTrialExpiredEmail(
    email: string,
    firstName: string,
    details: {
      planName: string;
    },
  ): Promise<void> {
    const dashboardUrl = this.getDashboardUrl();
    const billingUrl = `${dashboardUrl}/billing`;

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Essai gratuit expire</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Essai Gratuit Expire</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Bonjour ${firstName},</p>
              <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #721c24; margin: 0; font-size: 16px; font-weight: bold;">
                  Votre essai gratuit du plan ${details.planName} a expire.
                </p>
              </div>
              <p style="font-size: 14px; color: #666; margin: 20px 0;">
                Votre compte a ete temporairement limite aux fonctionnalites du plan gratuit.
                Pour reactiver toutes les fonctionnalites du plan ${details.planName}, payez votre facture en attente.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${billingUrl}" style="display: inline-block; background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 25px; font-weight: bold; font-size: 16px;">Reactiver mon compte</a>
              </div>
              <p style="font-size: 14px; color: #999; text-align: center;">
                Des questions? Contactez-nous a support@wazeapp.xyz
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                &copy; ${new Date().getFullYear()} WazeApp. Tous droits reserves.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    if (!this.transporter) {
      this.logger.warn(`SMTP not configured, skipping trial expired email to ${email}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: `Essai gratuit expire - Plan ${details.planName}`,
        html,
        text: `Bonjour ${firstName},\n\nVotre essai gratuit du plan ${details.planName} a expire. Votre compte est limite aux fonctionnalites du plan gratuit.\n\nPour reactiver: ${billingUrl}\n\nL'equipe WazeApp`,
      });
      this.logger.log(`Trial expired email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send trial expired email to ${email}: ${error.message}`);
    }
  }

  /**
   * Send email when subscription becomes PAST_DUE (payment overdue)
   */
  async sendSubscriptionPastDueEmail(
    email: string,
    firstName: string,
    details: {
      planName: string;
      gracePeriodDays: number;
      nextBillingDate: Date;
    },
  ): Promise<void> {
    const dashboardUrl = this.getDashboardUrl();
    const billingUrl = `${dashboardUrl}/billing`;

    const deadlineDate = new Date(details.nextBillingDate);
    deadlineDate.setDate(deadlineDate.getDate() + details.gracePeriodDays);

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Paiement en retard</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #e67e22 0%, #d35400 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Paiement en retard</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Bonjour ${firstName},</p>
              <div style="background-color: #fef3cd; border-left: 4px solid #e67e22; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #856404; margin: 0; font-size: 16px; font-weight: bold;">
                  Votre abonnement ${details.planName} n'a pas ete renouvele.
                </p>
                <p style="color: #856404; margin: 10px 0 0 0; font-size: 14px;">
                  Le paiement prevu le ${details.nextBillingDate.toLocaleDateString('fr-FR')} n'a pas ete recu.
                </p>
              </div>
              <p style="font-size: 14px; color: #666; margin: 20px 0;">
                Vous disposez d'un <strong>delai de grace de ${details.gracePeriodDays} jours</strong>
                (jusqu'au <strong>${deadlineDate.toLocaleDateString('fr-FR')}</strong>) pour effectuer votre paiement.
              </p>
              <p style="font-size: 14px; color: #666; margin: 20px 0;">
                Passe ce delai, votre compte sera automatiquement retrograde vers le plan gratuit
                et vous perdrez l'acces aux fonctionnalites du plan ${details.planName}.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${billingUrl}" style="display: inline-block; background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 25px; font-weight: bold; font-size: 16px;">Payer maintenant</a>
              </div>
              <p style="font-size: 14px; color: #999; text-align: center;">
                Des questions? Contactez-nous a support@wazeapp.xyz
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                &copy; ${new Date().getFullYear()} WazeApp. Tous droits reserves.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    if (!this.transporter) {
      this.logger.warn(`SMTP not configured, skipping past-due email to ${email}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: `Paiement en retard - Abonnement ${details.planName}`,
        html,
        text: `Bonjour ${firstName},\n\nVotre abonnement ${details.planName} n'a pas ete renouvele. Le paiement prevu le ${details.nextBillingDate.toLocaleDateString('fr-FR')} n'a pas ete recu.\n\nVous avez ${details.gracePeriodDays} jours pour payer avant la retrogradation vers le plan gratuit.\n\nPayer: ${billingUrl}\n\nL'equipe WazeApp`,
      });
      this.logger.log(`Past-due email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send past-due email to ${email}: ${error.message}`);
    }
  }

  /**
   * Send email when subscription is downgraded to FREE after grace period
   */
  async sendSubscriptionDowngradedEmail(
    email: string,
    firstName: string,
    details: {
      previousPlan: string;
      gracePeriodDays: number;
    },
  ): Promise<void> {
    const dashboardUrl = this.getDashboardUrl();
    const billingUrl = `${dashboardUrl}/billing`;

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Abonnement retrograde</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Abonnement retrograde</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Bonjour ${firstName},</p>
              <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #721c24; margin: 0; font-size: 16px; font-weight: bold;">
                  Votre abonnement ${details.previousPlan} a ete retrograde vers le plan Gratuit.
                </p>
              </div>
              <p style="font-size: 14px; color: #666; margin: 20px 0;">
                Apres ${details.gracePeriodDays} jours sans paiement, votre compte a ete automatiquement
                retrograde vers le plan gratuit. Vos donnees sont conservees, mais l'acces aux
                fonctionnalites avancees est desormais limite.
              </p>
              <p style="font-size: 14px; color: #666; margin: 20px 0;">
                <strong>Ce que cela signifie :</strong>
              </p>
              <ul style="font-size: 14px; color: #666; margin: 10px 0; padding-left: 20px;">
                <li>Limites reduites sur les campagnes, contacts et templates</li>
                <li>Fonctionnalites avancees desactivees (webhooks, API, etc.)</li>
                <li>Vos donnees existantes sont conservees</li>
              </ul>
              <p style="font-size: 14px; color: #666; margin: 20px 0;">
                Vous pouvez reactiver votre abonnement ${details.previousPlan} a tout moment
                depuis votre espace de facturation.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${billingUrl}" style="display: inline-block; background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 25px; font-weight: bold; font-size: 16px;">Reactiver mon abonnement</a>
              </div>
              <p style="font-size: 14px; color: #999; text-align: center;">
                Des questions? Contactez-nous a support@wazeapp.xyz
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                &copy; ${new Date().getFullYear()} WazeApp. Tous droits reserves.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    if (!this.transporter) {
      this.logger.warn(`SMTP not configured, skipping downgrade email to ${email}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: `Abonnement retrograde - Plan ${details.previousPlan} vers Gratuit`,
        html,
        text: `Bonjour ${firstName},\n\nVotre abonnement ${details.previousPlan} a ete retrograde vers le plan Gratuit apres ${details.gracePeriodDays} jours sans paiement.\n\nVos donnees sont conservees. Reactivez votre abonnement: ${billingUrl}\n\nL'equipe WazeApp`,
      });
      this.logger.log(`Downgrade email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send downgrade email to ${email}: ${error.message}`);
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

  private getPaymentConfirmationEmailTemplate(
    firstName: string,
    paymentDetails: {
      amount: number;
      currency: string;
      transactionId: string;
      paymentMethod: string;
      planName: string;
      date: Date;
    },
    dashboardUrl: string,
  ): string {
    const formattedDate = paymentDetails.date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmation de paiement</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">✅ Paiement Confirmé</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px;">Merci pour votre confiance!</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0; font-size: 18px;">
                Bonjour <strong style="color: #333;">${firstName}</strong>,
              </p>
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
                Votre paiement a été traité avec succès. Voici les détails de votre transaction :
              </p>

              <!-- Payment Details Box -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 25px; margin: 25px 0;">
                <table width="100%" cellpadding="5" cellspacing="0">
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Montant</td>
                    <td style="color: #25D366; font-weight: bold; font-size: 20px; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${paymentDetails.amount.toLocaleString()} ${paymentDetails.currency}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Plan</td>
                    <td style="color: #333; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${paymentDetails.planName}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Méthode</td>
                    <td style="color: #333; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${paymentDetails.paymentMethod}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Date</td>
                    <td style="color: #333; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${formattedDate}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0;">Référence</td>
                    <td style="color: #999; text-align: right; padding: 8px 0; font-size: 12px;">
                      ${paymentDetails.transactionId}
                    </td>
                  </tr>
                </table>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${dashboardUrl}" style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Accéder au Dashboard
                </a>
              </div>

              <p style="color: #999999; line-height: 1.6; margin: 20px 0 0 0; font-size: 12px; text-align: center;">
                Conservez cet email comme preuve de paiement.<br>
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

  private getSubscriptionUpgradeEmailTemplate(
    firstName: string,
    upgradeDetails: {
      previousPlan: string;
      newPlan: string;
      newLimits: {
        messages: number;
        agents: number;
        storage: string;
      };
      nextBillingDate: Date;
      amount: number;
      currency: string;
    },
    dashboardUrl: string,
  ): string {
    const formattedBillingDate = upgradeDetails.nextBillingDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Abonnement mis à niveau</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🚀 Félicitations!</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px;">Votre abonnement a été mis à niveau</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0; font-size: 18px;">
                Bonjour <strong style="color: #333;">${firstName}</strong>,
              </p>
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
                Votre abonnement WazeApp a été mis à niveau avec succès !
              </p>

              <!-- Upgrade Summary -->
              <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 8px; padding: 25px; margin: 25px 0; text-align: center;">
                <div style="display: inline-block; margin-bottom: 10px;">
                  <span style="color: #666; font-size: 14px; text-decoration: line-through;">${upgradeDetails.previousPlan}</span>
                  <span style="color: #25D366; font-size: 24px; margin: 0 15px;">→</span>
                  <span style="color: #25D366; font-size: 24px; font-weight: bold;">${upgradeDetails.newPlan}</span>
                </div>
              </div>

              <!-- New Limits -->
              <h3 style="color: #333; margin: 30px 0 15px 0; font-size: 16px;">🎁 Vos nouvelles limites :</h3>
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 15px 0;">
                <table width="100%" cellpadding="8" cellspacing="0">
                  <tr>
                    <td style="color: #666;">💬 Messages / mois</td>
                    <td style="color: #25D366; font-weight: bold; text-align: right;">
                      ${upgradeDetails.newLimits.messages.toLocaleString()}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666;">🤖 Agents WhatsApp</td>
                    <td style="color: #25D366; font-weight: bold; text-align: right;">
                      ${upgradeDetails.newLimits.agents}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666;">💾 Stockage</td>
                    <td style="color: #25D366; font-weight: bold; text-align: right;">
                      ${upgradeDetails.newLimits.storage}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Billing Info -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <p style="color: #666; margin: 0; font-size: 14px;">
                  <strong>Prochaine facturation :</strong> ${formattedBillingDate}<br>
                  <strong>Montant :</strong> ${upgradeDetails.amount.toLocaleString()} ${upgradeDetails.currency}
                </p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${dashboardUrl}" style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Profiter de mon nouveau plan
                </a>
              </div>

              <p style="color: #999999; line-height: 1.6; margin: 20px 0 0 0; font-size: 12px; text-align: center;">
                Merci de nous faire confiance! 💚<br>
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

  /**
   * Send WhatsApp disconnection alert email
   */
  async sendWhatsAppDisconnectionAlert(
    email: string,
    firstName: string,
    details: {
      sessionName: string;
      phoneNumber: string;
      organizationName: string;
      disconnectedAt: Date;
    },
  ): Promise<void> {
    this.logger.log(`📧 Attempting to send WhatsApp disconnection alert to ${email} for session ${details.sessionName}`);

    if (!this.transporter) {
      this.logger.error(`❌ Cannot send WhatsApp disconnection alert: SMTP transporter not configured. Please set SMTP_HOST environment variable.`);
      return;
    }

    const dashboardUrl = this.getDashboardUrl();
    const whatsappUrl = `${dashboardUrl}/dashboard/whatsapp`;

    const html = this.getWhatsAppDisconnectionEmailTemplate(firstName, details, whatsappUrl);

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: `🔴 Session WhatsApp déconnectée - ${details.sessionName}`,
        html,
        text: `Bonjour ${firstName},\n\nVotre session WhatsApp "${details.sessionName}" (${details.phoneNumber}) s'est déconnectée le ${details.disconnectedAt.toLocaleDateString('fr-FR')} à ${details.disconnectedAt.toLocaleTimeString('fr-FR')}.\n\nVos agents IA ne peuvent plus répondre aux messages sur ce numéro.\n\nPour reconnecter: ${whatsappUrl}\n\nL'équipe WazeApp`,
      });

      this.logger.log(`✅ WhatsApp disconnection alert sent to ${email}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send WhatsApp disconnection alert to ${email}:`, error);
    }
  }

  /**
   * Send WhatsApp reconnection alert email
   */
  async sendWhatsAppReconnectionAlert(
    email: string,
    firstName: string,
    details: {
      sessionName: string;
      phoneNumber: string;
      organizationName: string;
      reconnectedAt: Date;
      downtimeMinutes: number;
    },
  ): Promise<void> {
    this.logger.log(`📧 Attempting to send WhatsApp reconnection alert to ${email} for session ${details.sessionName}`);

    if (!this.transporter) {
      this.logger.error(`❌ Cannot send WhatsApp reconnection alert: SMTP transporter not configured. Please set SMTP_HOST environment variable.`);
      return;
    }

    const dashboardUrl = this.getDashboardUrl();
    const whatsappUrl = `${dashboardUrl}/dashboard/whatsapp`;

    const html = this.getWhatsAppReconnectionEmailTemplate(firstName, details, whatsappUrl);

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: `🟢 Session WhatsApp reconnectée - ${details.sessionName}`,
        html,
        text: `Bonjour ${firstName},\n\nBonne nouvelle! Votre session WhatsApp "${details.sessionName}" (${details.phoneNumber}) est de nouveau connectée.\n\nTemps d'indisponibilité: ${details.downtimeMinutes} minutes.\n\nVos agents IA peuvent à nouveau répondre aux messages.\n\nL'équipe WazeApp`,
      });

      this.logger.log(`✅ WhatsApp reconnection alert sent to ${email}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send WhatsApp reconnection alert to ${email}:`, error);
    }
  }

  private getPaymentReminderEmailTemplate(
    firstName: string,
    reminderDetails: {
      invoiceNumber: string;
      amount: number;
      currency: string;
      dueDate: Date;
      daysUntilDue: number;
      planName: string;
      organizationName: string;
      isOverdue: boolean;
    },
    billingUrl: string,
  ): string {
    const formattedDueDate = reminderDetails.dueDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const headerBg = reminderDetails.isOverdue
      ? 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)'
      : reminderDetails.daysUntilDue <= 1
        ? 'linear-gradient(135deg, #fd7e14 0%, #e06700 100%)'
        : 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)';

    const alertIcon = reminderDetails.isOverdue ? '🚨' : reminderDetails.daysUntilDue <= 1 ? '⚠️' : '📅';
    const alertColor = reminderDetails.isOverdue ? '#dc3545' : reminderDetails.daysUntilDue <= 1 ? '#fd7e14' : '#25D366';
    const alertBgColor = reminderDetails.isOverdue ? '#f8d7da' : reminderDetails.daysUntilDue <= 1 ? '#fff3cd' : '#d4edda';

    const headerTitle = reminderDetails.isOverdue
      ? 'Facture en retard'
      : reminderDetails.daysUntilDue <= 1
        ? 'Dernière chance de paiement'
        : 'Rappel de paiement';

    const urgencyMessage = reminderDetails.isOverdue
      ? `Votre facture est en retard de ${Math.abs(reminderDetails.daysUntilDue)} jour(s). Pour éviter une suspension de votre service, veuillez régler cette facture dès que possible.`
      : reminderDetails.daysUntilDue <= 1
        ? `Votre facture arrive à échéance demain. Pensez à effectuer votre paiement pour garantir la continuité de votre service.`
        : `Votre facture arrive à échéance dans ${reminderDetails.daysUntilDue} jours. Pensez à effectuer votre paiement avant la date limite.`;

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerTitle}</title>
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
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px;">${alertIcon} ${headerTitle}</p>
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
                <p style="color: #333; margin: 0; font-size: 14px;">
                  ${urgencyMessage}
                </p>
              </div>

              <!-- Invoice Details Box -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 25px; margin: 25px 0;">
                <h3 style="color: #333; margin: 0 0 15px 0; font-size: 16px;">📄 Détails de la facture</h3>
                <table width="100%" cellpadding="5" cellspacing="0">
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Numéro de facture</td>
                    <td style="color: #333; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${reminderDetails.invoiceNumber}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Organisation</td>
                    <td style="color: #333; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${reminderDetails.organizationName}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Plan</td>
                    <td style="color: #333; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${reminderDetails.planName}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Date d'échéance</td>
                    <td style="color: ${reminderDetails.isOverdue ? '#dc3545' : '#333'}; font-weight: ${reminderDetails.isOverdue ? 'bold' : 'normal'}; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${formattedDueDate}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0;">Montant à payer</td>
                    <td style="color: ${alertColor}; font-weight: bold; font-size: 20px; text-align: right; padding: 8px 0;">
                      ${reminderDetails.amount.toLocaleString()} ${reminderDetails.currency}
                    </td>
                  </tr>
                </table>
              </div>

              ${reminderDetails.isOverdue ? `
              <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <p style="color: #721c24; margin: 0; font-size: 14px;">
                  <strong>Important:</strong> Sans paiement dans les 48 heures, votre accès aux services WazeApp pourrait être temporairement suspendu.
                </p>
              </div>
              ` : ''}

              <div style="text-align: center; margin: 30px 0;">
                <a href="${billingUrl}" style="display: inline-block; background-color: ${alertColor}; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Payer maintenant
                </a>
              </div>

              <p style="color: #666666; line-height: 1.6; margin: 20px 0 0 0; font-size: 14px; text-align: center;">
                Vous pouvez payer par Mobile Money (MTN, Orange Money) directement depuis votre tableau de bord.
              </p>

              <p style="color: #999999; line-height: 1.6; margin: 20px 0 0 0; font-size: 12px; text-align: center;">
                Si vous avez déjà effectué ce paiement, ignorez cet email.<br>
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

  private getWhatsAppDisconnectionEmailTemplate(
    firstName: string,
    details: {
      sessionName: string;
      phoneNumber: string;
      organizationName: string;
      disconnectedAt: Date;
    },
    whatsappUrl: string,
  ): string {
    const formattedDate = details.disconnectedAt.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const formattedTime = details.disconnectedAt.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session WhatsApp déconnectée</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🔴 Session Déconnectée</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px;">Action requise</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0; font-size: 18px;">
                Bonjour <strong style="color: #333;">${firstName}</strong>,
              </p>

              <!-- Alert Box -->
              <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #721c24; margin: 0; font-size: 16px; font-weight: bold;">
                  Votre session WhatsApp s'est déconnectée !
                </p>
              </div>

              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
                Vos agents IA ne peuvent plus répondre aux messages sur ce numéro tant que la session n'est pas reconnectée.
              </p>

              <!-- Session Details Box -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 25px; margin: 25px 0;">
                <h3 style="color: #333; margin: 0 0 15px 0; font-size: 16px;">📱 Détails de la session</h3>
                <table width="100%" cellpadding="5" cellspacing="0">
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Nom de la session</td>
                    <td style="color: #333; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${details.sessionName}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Numéro WhatsApp</td>
                    <td style="color: #333; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${details.phoneNumber}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Organisation</td>
                    <td style="color: #333; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${details.organizationName}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0;">Déconnexion</td>
                    <td style="color: #dc3545; font-weight: bold; text-align: right; padding: 8px 0;">
                      ${formattedDate} à ${formattedTime}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Warning Box -->
              <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <p style="color: #856404; margin: 0; font-size: 14px;">
                  <strong>⚠️ Important:</strong> Les messages WhatsApp reçus pendant la déconnexion ne seront pas traités par vos agents IA.
                </p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${whatsappUrl}" style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Reconnecter maintenant
                </a>
              </div>

              <p style="color: #999999; line-height: 1.6; margin: 20px 0 0 0; font-size: 12px; text-align: center;">
                Vous recevez cet email car vous êtes administrateur de l'organisation.<br>
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

  private getWhatsAppReconnectionEmailTemplate(
    firstName: string,
    details: {
      sessionName: string;
      phoneNumber: string;
      organizationName: string;
      reconnectedAt: Date;
      downtimeMinutes: number;
    },
    whatsappUrl: string,
  ): string {
    const formattedDate = details.reconnectedAt.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const formattedTime = details.reconnectedAt.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // Format downtime
    let downtimeText = '';
    if (details.downtimeMinutes < 60) {
      downtimeText = `${details.downtimeMinutes} minute${details.downtimeMinutes > 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(details.downtimeMinutes / 60);
      const minutes = details.downtimeMinutes % 60;
      downtimeText = `${hours} heure${hours > 1 ? 's' : ''}`;
      if (minutes > 0) {
        downtimeText += ` et ${minutes} minute${minutes > 1 ? 's' : ''}`;
      }
    }

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session WhatsApp reconnectée</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🟢 Session Reconnectée</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px;">Tout est revenu à la normale</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0; font-size: 18px;">
                Bonjour <strong style="color: #333;">${firstName}</strong>,
              </p>

              <!-- Success Box -->
              <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #155724; margin: 0; font-size: 16px; font-weight: bold;">
                  ✅ Bonne nouvelle ! Votre session WhatsApp est de nouveau connectée.
                </p>
              </div>

              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
                Vos agents IA peuvent à nouveau répondre aux messages sur ce numéro.
              </p>

              <!-- Session Details Box -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 25px; margin: 25px 0;">
                <h3 style="color: #333; margin: 0 0 15px 0; font-size: 16px;">📱 Détails de la session</h3>
                <table width="100%" cellpadding="5" cellspacing="0">
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Nom de la session</td>
                    <td style="color: #333; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${details.sessionName}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Numéro WhatsApp</td>
                    <td style="color: #333; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${details.phoneNumber}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Organisation</td>
                    <td style="color: #333; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${details.organizationName}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Reconnexion</td>
                    <td style="color: #25D366; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${formattedDate} à ${formattedTime}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0;">Durée d'indisponibilité</td>
                    <td style="color: #666; text-align: right; padding: 8px 0;">
                      ${downtimeText}
                    </td>
                  </tr>
                </table>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${whatsappUrl}" style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Voir le statut
                </a>
              </div>

              <p style="color: #999999; line-height: 1.6; margin: 20px 0 0 0; font-size: 12px; text-align: center;">
                Vous recevez cet email car vous êtes administrateur de l'organisation.<br>
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

  /**
   * Send escalation alert email to operator
   */
  async sendEscalationAlert(
    email: string,
    details: {
      agentName: string;
      clientPhoneNumber: string;
      reason: string;
      conversationId: string;
      escalatedAt: Date;
    },
  ): Promise<void> {
    this.logger.log(`📧 Attempting to send escalation alert to ${email} for conversation ${details.conversationId}`);

    if (!this.transporter) {
      this.logger.error(`❌ Cannot send escalation alert: SMTP transporter not configured.`);
      return;
    }

    const dashboardUrl = this.getDashboardUrl();
    const conversationsUrl = `${dashboardUrl}/conversations`;

    const html = this.getEscalationAlertEmailTemplate(details, conversationsUrl);

    try {
      await this.transporter.sendMail({
        from: `"${this.getFromName()}" <${this.getFromAddress()}>`,
        to: email,
        subject: `🚨 Escalade conversation - Agent ${details.agentName}`,
        html,
        text: `Alerte d'escalade\n\nUne conversation a été escaladée vers un opérateur humain.\n\nAgent: ${details.agentName}\nClient: ${details.clientPhoneNumber}\nRaison: ${details.reason}\nDate: ${details.escalatedAt.toLocaleDateString('fr-FR')} à ${details.escalatedAt.toLocaleTimeString('fr-FR')}\n\nAccéder aux conversations: ${conversationsUrl}\n\nL'équipe WazeApp`,
      });

      this.logger.log(`✅ Escalation alert sent to ${email}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send escalation alert to ${email}:`, error);
    }
  }

  private getEscalationAlertEmailTemplate(
    details: {
      agentName: string;
      clientPhoneNumber: string;
      reason: string;
      conversationId: string;
      escalatedAt: Date;
    },
    conversationsUrl: string,
  ): string {
    const formattedDate = details.escalatedAt.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const formattedTime = details.escalatedAt.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Escalade de conversation</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🚨 Escalade de Conversation</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px;">Intervention humaine requise</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0; font-size: 16px;">
                Une conversation a été transférée à un opérateur humain et nécessite votre attention.
              </p>

              <!-- Alert Box -->
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #92400e; margin: 0; font-size: 16px; font-weight: bold;">
                  Un client attend une réponse humaine !
                </p>
              </div>

              <!-- Details Box -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 25px; margin: 25px 0;">
                <h3 style="color: #333; margin: 0 0 15px 0; font-size: 16px;">📋 Détails de l'escalade</h3>
                <table width="100%" cellpadding="5" cellspacing="0">
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Agent IA</td>
                    <td style="color: #333; font-weight: bold; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${details.agentName}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Numéro du client</td>
                    <td style="color: #333; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${details.clientPhoneNumber}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0; border-bottom: 1px solid #e9ecef;">Raison</td>
                    <td style="color: #333; text-align: right; padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                      ${details.reason}
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 8px 0;">Date</td>
                    <td style="color: #f59e0b; font-weight: bold; text-align: right; padding: 8px 0;">
                      ${formattedDate} à ${formattedTime}
                    </td>
                  </tr>
                </table>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${conversationsUrl}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Voir la conversation
                </a>
              </div>

              <p style="color: #999999; line-height: 1.6; margin: 20px 0 0 0; font-size: 12px; text-align: center;">
                Vous recevez cet email car vous êtes configuré comme destinataire des alertes d'escalade.<br>
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
