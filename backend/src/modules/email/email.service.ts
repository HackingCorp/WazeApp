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
    const smtpSecureRaw = this.configService.get<string>('SMTP_SECURE', 'false');
    const smtpSecure = smtpSecureRaw === 'true' || smtpSecureRaw === '1';

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
    return this.configService.get<string>('SMTP_FROM', 'noreply@wazeapp.ai');
  }

  private getFromName(): string {
    return this.configService.get<string>('SMTP_FROM_NAME', 'WazeApp');
  }

  private getAppUrl(): string {
    return this.configService.get<string>('APP_URL', 'https://wazeapp.ai');
  }

  private getDashboardUrl(): string {
    return this.configService.get<string>('DASHBOARD_URL', 'https://app.wazeapp.ai');
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

    const html = this.getNewInvoiceEmailTemplate(firstName, invoiceDetails, billingUrl, periodFormatted, dueDateFormatted);

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

    const html = this.getTrialStartEmailTemplate(firstName, details, billingUrl, trialEndFormatted);

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

    const urgencyText = details.daysRemaining === 0
      ? 'Votre essai gratuit expire aujourd\'hui !'
      : details.daysRemaining === 1
        ? 'Votre essai gratuit expire demain !'
        : `Votre essai gratuit expire dans ${details.daysRemaining} jours.`;

    const html = this.getTrialReminderEmailTemplate(firstName, details, billingUrl, trialEndFormatted, urgencyText);

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

    const html = this.getTrialExpiredEmailTemplate(firstName, details, billingUrl);

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

    const html = this.getSubscriptionPastDueEmailTemplate(firstName, details, billingUrl, deadlineDate);

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

    const html = this.getSubscriptionDowngradedEmailTemplate(firstName, details, billingUrl);

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

  // ============= EMAIL TEMPLATE HELPERS =============

  private baseTemplate(options: {
    title: string;
    preheader?: string;
    content: string;
    accentColor?: string;
  }): string {
    const { title, preheader, content, accentColor = '#059669' } = options;
    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
${preheader ? `<span style="display:none;font-size:1px;color:#f9fafb;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</span>` : ''}
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);border-top:4px solid ${accentColor};">
<!-- Header -->
<tr><td style="padding:32px 40px 24px 40px;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td><span style="font-size:22px;font-weight:700;color:${accentColor};letter-spacing:-0.5px;">WazeApp</span></td>
</tr></table>
</td></tr>
<!-- Content -->
<tr><td style="padding:0 40px 40px 40px;">
${content}
</td></tr>
<!-- Footer -->
<tr><td style="padding:24px 40px;border-top:1px solid #e5e7eb;">
<p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
&copy; ${new Date().getFullYear()} WazeApp. Tous droits r&eacute;serv&eacute;s.<br>
<a href="https://wazeapp.ai" style="color:#059669;text-decoration:none;">wazeapp.ai</a>
&nbsp;&middot;&nbsp;
<a href="mailto:support@wazeapp.ai" style="color:#059669;text-decoration:none;">support@wazeapp.ai</a>
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  }

  private buttonHtml(text: string, url: string, color: string = '#059669'): string {
    return `<div style="text-align:center;margin:32px 0;">
<a href="${url}" style="display:inline-block;background-color:${color};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;line-height:1;">${text}</a>
</div>`;
  }

  private infoBoxHtml(rows: Array<{label: string; value: string; valueColor?: string}>): string {
    const rowsHtml = rows.map((r, i) => {
      const border = i < rows.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : '';
      return `<tr>
<td style="padding:10px 0;color:#6b7280;font-size:14px;${border}">${r.label}</td>
<td style="padding:10px 0;text-align:right;font-weight:600;color:${r.valueColor || '#111827'};font-size:14px;${border}">${r.value}</td>
</tr>`;
    }).join('');
    return `<div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:24px 0;">
<table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
</div>`;
  }

  private alertBoxHtml(text: string, type: 'warning' | 'error' | 'success' | 'info' = 'warning'): string {
    const colors = {
      warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
      error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
      success: { bg: '#ecfdf5', border: '#059669', text: '#065f46' },
      info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
    };
    const c = colors[type];
    return `<div style="background-color:${c.bg};border-left:4px solid ${c.border};padding:16px 20px;margin:24px 0;border-radius:0 8px 8px 0;">
<p style="margin:0;color:${c.text};font-size:14px;line-height:1.5;">${text}</p>
</div>`;
  }

  private linkTextHtml(text: string, url: string): string {
    return `<p style="margin:16px 0 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">
${text}<br><a href="${url}" style="color:#059669;word-break:break-all;font-size:12px;">${url}</a>
</p>`;
  }

  // ============= EMAIL TEMPLATES =============

  private getVerificationEmailTemplate(verificationUrl: string): string {
    return this.baseTemplate({
      title: 'Vérifiez votre email',
      preheader: 'Vérifiez votre adresse email pour activer votre compte WazeApp',
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Vérifiez votre adresse email</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Merci de vous être inscrit sur WazeApp ! Pour activer votre compte et commencer à créer vos agents IA WhatsApp, veuillez vérifier votre adresse email.
</p>
${this.buttonHtml('Vérifier mon email', verificationUrl)}
${this.linkTextHtml('Ou copiez ce lien dans votre navigateur :', verificationUrl)}
<p style="margin:24px 0 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">
Ce lien expire dans 24 heures. Si vous n'avez pas créé de compte WazeApp, ignorez cet email.
</p>
      `,
    });
  }

  private getPasswordResetEmailTemplate(resetUrl: string): string {
    return this.baseTemplate({
      title: 'Réinitialisation de mot de passe',
      preheader: 'Réinitialisez votre mot de passe WazeApp',
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Réinitialisation du mot de passe</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe.
</p>
${this.buttonHtml('Réinitialiser mon mot de passe', resetUrl)}
${this.linkTextHtml('Ou copiez ce lien dans votre navigateur :', resetUrl)}
${this.alertBoxHtml('<strong>Important :</strong> Ce lien expire dans 15 minutes pour des raisons de sécurité.', 'warning')}
<p style="margin:16px 0 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">
Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe restera inchangé.
</p>
      `,
    });
  }

  private getInvitationEmailTemplate(inviteUrl: string, organizationName: string): string {
    return this.baseTemplate({
      title: `Invitation à rejoindre ${organizationName}`,
      preheader: `Vous avez été invité à rejoindre ${organizationName} sur WazeApp`,
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Invitation</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Vous avez été invité à rejoindre l'organisation <strong style="color:#111827;">${organizationName}</strong> sur WazeApp.
</p>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
En acceptant cette invitation, vous pourrez collaborer avec votre équipe pour créer et gérer des agents IA WhatsApp.
</p>
${this.buttonHtml('Accepter l\'invitation', inviteUrl)}
${this.linkTextHtml('Ou copiez ce lien dans votre navigateur :', inviteUrl)}
<p style="margin:24px 0 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">
Si vous ne souhaitez pas rejoindre cette organisation, ignorez simplement cet email.
</p>
      `,
    });
  }

  private getWelcomeEmailTemplate(firstName: string, dashboardUrl: string): string {
    return this.baseTemplate({
      title: 'Bienvenue sur WazeApp',
      preheader: `Bienvenue ${firstName} ! Votre compte WazeApp est actif.`,
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Bienvenue ${firstName}</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Votre compte WazeApp est maintenant actif. Vous pouvez commencer à créer vos agents IA WhatsApp et automatiser vos conversations.
</p>
<p style="margin:0 0 8px 0;font-size:15px;font-weight:600;color:#111827;">Premiers pas :</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">
<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;line-height:1.5;">1. Connectez votre numéro WhatsApp</td></tr>
<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;line-height:1.5;">2. Créez votre premier agent IA</td></tr>
<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;line-height:1.5;">3. Ajoutez des connaissances à votre base</td></tr>
<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;line-height:1.5;">4. Commencez à converser avec vos clients</td></tr>
</table>
${this.buttonHtml('Accéder au Dashboard', dashboardUrl)}
<p style="margin:16px 0 0 0;font-size:14px;color:#6b7280;line-height:1.6;">
Besoin d'aide ? Notre équipe support est là pour vous à <a href="mailto:support@wazeapp.ai" style="color:#059669;text-decoration:none;">support@wazeapp.ai</a>
</p>
      `,
    });
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
    const barColor = isExceeded ? '#ef4444' : percentUsed >= 90 ? '#f59e0b' : '#059669';
    const accentColor = isExceeded ? '#ef4444' : '#059669';

    const alertText = isExceeded
      ? 'Votre quota de messages est atteint ! Vos agents WhatsApp ne pourront plus répondre aux messages tant que votre quota n\'aura pas été renouvelé ou que vous n\'aurez pas mis à niveau votre plan.'
      : `Vous avez utilisé ${percentUsed}% de votre quota. Pour éviter toute interruption de service, nous vous recommandons de mettre à niveau votre plan avant d'atteindre la limite.`;

    const alertType = isExceeded ? 'error' : 'warning';

    return this.baseTemplate({
      title: 'Alerte Quota - WazeApp',
      preheader: `${percentUsed}% de votre quota de messages utilisé`,
      accentColor,
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Alerte quota de messages</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Bonjour <strong style="color:#111827;">${firstName}</strong>,
</p>
${this.alertBoxHtml(alertText, alertType)}
<div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:24px 0;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:0 0 8px 0;font-size:14px;color:#6b7280;">Messages utilisés</td>
<td style="padding:0 0 8px 0;text-align:right;font-weight:600;color:#111827;font-size:14px;">${currentUsage.toLocaleString()} / ${limit.toLocaleString()}</td>
</tr>
</table>
<div style="background-color:#e5e7eb;border-radius:4px;height:8px;overflow:hidden;margin:8px 0;">
<div style="background-color:${barColor};height:100%;width:${Math.min(percentUsed, 100)}%;border-radius:4px;"></div>
</div>
<p style="margin:8px 0 0 0;font-size:13px;color:#9ca3af;text-align:right;">${percentUsed}% utilisé</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-top:1px solid #e5e7eb;padding-top:12px;">
<tr>
<td style="font-size:14px;color:#6b7280;">Plan actuel</td>
<td style="text-align:right;font-weight:600;color:#111827;font-size:14px;">${planName}</td>
</tr>
</table>
</div>
${this.buttonHtml('Mettre à niveau mon plan', billingUrl)}
      `,
    });
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

    return this.baseTemplate({
      title: 'Confirmation de paiement',
      preheader: `Paiement de ${paymentDetails.amount.toLocaleString()} ${paymentDetails.currency} confirmé`,
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Paiement confirmé</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Bonjour <strong style="color:#111827;">${firstName}</strong>,
</p>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Votre paiement a été traité avec succès. Voici les détails de votre transaction :
</p>
${this.infoBoxHtml([
  { label: 'Montant', value: `${paymentDetails.amount.toLocaleString()} ${paymentDetails.currency}`, valueColor: '#059669' },
  { label: 'Plan', value: paymentDetails.planName },
  { label: 'Méthode', value: paymentDetails.paymentMethod },
  { label: 'Date', value: formattedDate },
  { label: 'Référence', value: paymentDetails.transactionId, valueColor: '#9ca3af' },
])}
${this.buttonHtml('Accéder au Dashboard', dashboardUrl)}
<p style="margin:16px 0 0 0;font-size:13px;color:#9ca3af;line-height:1.5;text-align:center;">
Conservez cet email comme preuve de paiement.
</p>
      `,
    });
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

    return this.baseTemplate({
      title: 'Abonnement mis à niveau',
      preheader: `Votre abonnement a été mis à niveau vers ${upgradeDetails.newPlan}`,
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Abonnement mis à niveau</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Bonjour <strong style="color:#111827;">${firstName}</strong>,
</p>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Votre abonnement WazeApp a été mis à niveau avec succès !
</p>
<div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:24px 0;text-align:center;">
<span style="color:#9ca3af;font-size:14px;text-decoration:line-through;">${upgradeDetails.previousPlan}</span>
<span style="color:#059669;font-size:20px;margin:0 12px;font-weight:700;">&rarr;</span>
<span style="color:#059669;font-size:20px;font-weight:700;">${upgradeDetails.newPlan}</span>
</div>
${this.infoBoxHtml([
  { label: 'Messages / mois', value: upgradeDetails.newLimits.messages.toLocaleString(), valueColor: '#059669' },
  { label: 'Agents WhatsApp', value: String(upgradeDetails.newLimits.agents), valueColor: '#059669' },
  { label: 'Stockage', value: upgradeDetails.newLimits.storage, valueColor: '#059669' },
  { label: 'Prochaine facturation', value: formattedBillingDate },
  { label: 'Montant', value: `${upgradeDetails.amount.toLocaleString()} ${upgradeDetails.currency}` },
])}
${this.buttonHtml('Profiter de mon nouveau plan', dashboardUrl)}
      `,
    });
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

    const headerTitle = reminderDetails.isOverdue
      ? 'Facture en retard'
      : reminderDetails.daysUntilDue <= 1
        ? 'Dernière chance de paiement'
        : 'Rappel de paiement';

    const urgencyMessage = reminderDetails.isOverdue
      ? `Votre facture est en retard de ${Math.abs(reminderDetails.daysUntilDue)} jour(s). Pour éviter une suspension de votre service, veuillez régler cette facture dès que possible.`
      : reminderDetails.daysUntilDue <= 1
        ? 'Votre facture arrive à échéance demain. Pensez à effectuer votre paiement pour garantir la continuité de votre service.'
        : `Votre facture arrive à échéance dans ${reminderDetails.daysUntilDue} jours. Pensez à effectuer votre paiement avant la date limite.`;

    const alertType: 'error' | 'warning' | 'info' = reminderDetails.isOverdue ? 'error' : reminderDetails.daysUntilDue <= 1 ? 'warning' : 'info';
    const accentColor = reminderDetails.isOverdue ? '#ef4444' : reminderDetails.daysUntilDue <= 1 ? '#f59e0b' : '#059669';
    const buttonColor = reminderDetails.isOverdue ? '#ef4444' : reminderDetails.daysUntilDue <= 1 ? '#f59e0b' : '#059669';

    const overdueWarning = reminderDetails.isOverdue
      ? this.alertBoxHtml('<strong>Important :</strong> Sans paiement dans les 48 heures, votre accès aux services WazeApp pourrait être temporairement suspendu.', 'error')
      : '';

    return this.baseTemplate({
      title: headerTitle,
      preheader: urgencyMessage,
      accentColor,
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">${headerTitle}</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Bonjour <strong style="color:#111827;">${firstName}</strong>,
</p>
${this.alertBoxHtml(urgencyMessage, alertType)}
${this.infoBoxHtml([
  { label: 'Numéro de facture', value: reminderDetails.invoiceNumber },
  { label: 'Organisation', value: reminderDetails.organizationName },
  { label: 'Plan', value: reminderDetails.planName },
  { label: 'Date d\'échéance', value: formattedDueDate, valueColor: reminderDetails.isOverdue ? '#ef4444' : '#111827' },
  { label: 'Montant à payer', value: `${reminderDetails.amount.toLocaleString()} ${reminderDetails.currency}`, valueColor: accentColor },
])}
${overdueWarning}
${this.buttonHtml('Payer maintenant', billingUrl, buttonColor)}
<p style="margin:16px 0 0 0;font-size:13px;color:#9ca3af;line-height:1.5;text-align:center;">
Si vous avez déjà effectué ce paiement, ignorez cet email.
</p>
      `,
    });
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

    return this.baseTemplate({
      title: 'Session WhatsApp déconnectée',
      preheader: `Session "${details.sessionName}" déconnectée - Action requise`,
      accentColor: '#ef4444',
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Session WhatsApp déconnectée</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Bonjour <strong style="color:#111827;">${firstName}</strong>,
</p>
${this.alertBoxHtml('Votre session WhatsApp s\'est déconnectée ! Vos agents IA ne peuvent plus répondre aux messages sur ce numéro tant que la session n\'est pas reconnectée.', 'error')}
${this.infoBoxHtml([
  { label: 'Nom de la session', value: details.sessionName },
  { label: 'Numéro WhatsApp', value: details.phoneNumber },
  { label: 'Organisation', value: details.organizationName },
  { label: 'Déconnexion', value: `${formattedDate} à ${formattedTime}`, valueColor: '#ef4444' },
])}
${this.alertBoxHtml('<strong>Important :</strong> Les messages WhatsApp reçus pendant la déconnexion ne seront pas traités par vos agents IA.', 'warning')}
${this.buttonHtml('Reconnecter maintenant', whatsappUrl)}
      `,
    });
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

    return this.baseTemplate({
      title: 'Session WhatsApp reconnectée',
      preheader: `Session "${details.sessionName}" reconnectée avec succès`,
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Session WhatsApp reconnectée</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Bonjour <strong style="color:#111827;">${firstName}</strong>,
</p>
${this.alertBoxHtml('Bonne nouvelle ! Votre session WhatsApp est de nouveau connectée. Vos agents IA peuvent à nouveau répondre aux messages.', 'success')}
${this.infoBoxHtml([
  { label: 'Nom de la session', value: details.sessionName },
  { label: 'Numéro WhatsApp', value: details.phoneNumber },
  { label: 'Organisation', value: details.organizationName },
  { label: 'Reconnexion', value: `${formattedDate} à ${formattedTime}`, valueColor: '#059669' },
  { label: 'Durée d\'indisponibilité', value: downtimeText },
])}
${this.buttonHtml('Voir le statut', whatsappUrl)}
      `,
    });
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

    return this.baseTemplate({
      title: 'Escalade de conversation',
      preheader: 'Une conversation nécessite votre attention',
      accentColor: '#f59e0b',
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Escalade de conversation</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Une conversation a été transférée à un opérateur humain et nécessite votre attention.
</p>
${this.alertBoxHtml('Un client attend une réponse humaine !', 'warning')}
${this.infoBoxHtml([
  { label: 'Agent IA', value: details.agentName },
  { label: 'Numéro du client', value: details.clientPhoneNumber },
  { label: 'Raison', value: details.reason },
  { label: 'Date', value: `${formattedDate} à ${formattedTime}`, valueColor: '#f59e0b' },
])}
${this.buttonHtml('Voir la conversation', conversationsUrl)}
      `,
    });
  }

  private getTrialStartEmailTemplate(
    firstName: string,
    details: { planName: string; trialDays: number; trialEndsAt: Date },
    billingUrl: string,
    trialEndFormatted: string,
  ): string {
    return this.baseTemplate({
      title: 'Essai gratuit activé',
      preheader: `Votre essai gratuit du plan ${details.planName} est actif pour ${details.trialDays} jours`,
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Essai gratuit activé</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Bonjour <strong style="color:#111827;">${firstName}</strong>,
</p>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Votre essai gratuit du plan <strong style="color:#111827;">${details.planName}</strong> est maintenant actif pour <strong style="color:#111827;">${details.trialDays} jours</strong>.
</p>
${this.alertBoxHtml(`Profitez de toutes les fonctionnalités du plan ${details.planName} jusqu'au <strong>${trialEndFormatted}</strong>.`, 'success')}
<p style="margin:0 0 16px 0;font-size:14px;color:#6b7280;line-height:1.6;">
Une facture a été générée et sera due à la fin de votre période d'essai. Si vous payez avant cette date, votre abonnement sera activé sans interruption.
</p>
${this.buttonHtml('Accéder au dashboard', billingUrl)}
      `,
    });
  }

  private getTrialReminderEmailTemplate(
    firstName: string,
    details: { planName: string; daysRemaining: number; trialEndsAt: Date },
    billingUrl: string,
    trialEndFormatted: string,
    urgencyText: string,
  ): string {
    const alertType: 'error' | 'warning' = details.daysRemaining <= 1 ? 'error' : 'warning';
    const accentColor = details.daysRemaining <= 1 ? '#ef4444' : '#f59e0b';
    const buttonColor = details.daysRemaining <= 1 ? '#ef4444' : '#f59e0b';

    return this.baseTemplate({
      title: 'Rappel essai gratuit',
      preheader: urgencyText,
      accentColor,
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Rappel - Essai gratuit</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Bonjour <strong style="color:#111827;">${firstName}</strong>,
</p>
${this.alertBoxHtml(`<strong>${urgencyText}</strong>`, alertType)}
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Votre essai du plan <strong style="color:#111827;">${details.planName}</strong> se termine le <strong style="color:#111827;">${trialEndFormatted}</strong>.
Pour continuer à profiter de toutes les fonctionnalités, payez votre facture avant cette date.
</p>
${this.buttonHtml('Payer maintenant', billingUrl, buttonColor)}
      `,
    });
  }

  private getTrialExpiredEmailTemplate(
    firstName: string,
    details: { planName: string },
    billingUrl: string,
  ): string {
    return this.baseTemplate({
      title: 'Essai gratuit expiré',
      preheader: `Votre essai gratuit du plan ${details.planName} a expiré`,
      accentColor: '#ef4444',
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Essai gratuit expiré</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Bonjour <strong style="color:#111827;">${firstName}</strong>,
</p>
${this.alertBoxHtml(`Votre essai gratuit du plan ${details.planName} a expiré.`, 'error')}
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Votre compte a été temporairement limité aux fonctionnalités du plan gratuit.
Pour réactiver toutes les fonctionnalités du plan ${details.planName}, payez votre facture en attente.
</p>
${this.buttonHtml('Réactiver mon compte', billingUrl)}
      `,
    });
  }

  private getSubscriptionPastDueEmailTemplate(
    firstName: string,
    details: { planName: string; gracePeriodDays: number; nextBillingDate: Date },
    billingUrl: string,
    deadlineDate: Date,
  ): string {
    return this.baseTemplate({
      title: 'Paiement en retard',
      preheader: `Votre abonnement ${details.planName} n'a pas été renouvelé`,
      accentColor: '#f59e0b',
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Paiement en retard</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Bonjour <strong style="color:#111827;">${firstName}</strong>,
</p>
${this.alertBoxHtml(`Votre abonnement ${details.planName} n'a pas été renouvelé. Le paiement prévu le ${details.nextBillingDate.toLocaleDateString('fr-FR')} n'a pas été reçu.`, 'warning')}
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Vous disposez d'un <strong style="color:#111827;">délai de grâce de ${details.gracePeriodDays} jours</strong>
(jusqu'au <strong style="color:#111827;">${deadlineDate.toLocaleDateString('fr-FR')}</strong>) pour effectuer votre paiement.
</p>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Passé ce délai, votre compte sera automatiquement rétrogradé vers le plan gratuit
et vous perdrez l'accès aux fonctionnalités du plan ${details.planName}.
</p>
${this.buttonHtml('Payer maintenant', billingUrl)}
      `,
    });
  }

  private getSubscriptionDowngradedEmailTemplate(
    firstName: string,
    details: { previousPlan: string; gracePeriodDays: number },
    billingUrl: string,
  ): string {
    return this.baseTemplate({
      title: 'Abonnement rétrogradé',
      preheader: `Votre abonnement ${details.previousPlan} a été rétrogradé vers le plan Gratuit`,
      accentColor: '#ef4444',
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Abonnement rétrogradé</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Bonjour <strong style="color:#111827;">${firstName}</strong>,
</p>
${this.alertBoxHtml(`Votre abonnement ${details.previousPlan} a été rétrogradé vers le plan Gratuit.`, 'error')}
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Après ${details.gracePeriodDays} jours sans paiement, votre compte a été automatiquement
rétrogradé vers le plan gratuit. Vos données sont conservées, mais l'accès aux
fonctionnalités avancées est désormais limité.
</p>
<p style="margin:0 0 8px 0;font-size:15px;font-weight:600;color:#111827;">Ce que cela signifie :</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">
<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;line-height:1.5;">- Limites réduites sur les campagnes, contacts et templates</td></tr>
<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;line-height:1.5;">- Fonctionnalités avancées désactivées (webhooks, API, etc.)</td></tr>
<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;line-height:1.5;">- Vos données existantes sont conservées</td></tr>
</table>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Vous pouvez réactiver votre abonnement ${details.previousPlan} à tout moment
depuis votre espace de facturation.
</p>
${this.buttonHtml('Réactiver mon abonnement', billingUrl)}
      `,
    });
  }

  private getNewInvoiceEmailTemplate(
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
    billingUrl: string,
    periodFormatted: string,
    dueDateFormatted: string,
  ): string {
    return this.baseTemplate({
      title: 'Nouvelle facture',
      preheader: `Facture ${invoiceDetails.invoiceNumber} - ${invoiceDetails.amount.toLocaleString()} ${invoiceDetails.currency}`,
      content: `
<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;">Nouvelle facture</h1>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Bonjour <strong style="color:#111827;">${firstName}</strong>,
</p>
<p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;line-height:1.6;">
Votre facture de renouvellement pour <strong style="color:#111827;">${invoiceDetails.organizationName}</strong> est disponible.
</p>
${this.infoBoxHtml([
  { label: 'Numéro de facture', value: invoiceDetails.invoiceNumber },
  { label: 'Plan', value: invoiceDetails.planName },
  { label: 'Période', value: periodFormatted },
  { label: 'Montant', value: `${invoiceDetails.amount.toLocaleString()} ${invoiceDetails.currency}`, valueColor: '#059669' },
  { label: 'Date d\'échéance', value: dueDateFormatted, valueColor: '#ef4444' },
])}
<p style="margin:0 0 16px 0;font-size:14px;color:#6b7280;line-height:1.6;">
Pour assurer la continuité de votre service, veuillez procéder au paiement avant la date d'échéance.
</p>
${this.buttonHtml('Payer maintenant', billingUrl)}
      `,
    });
  }
}
