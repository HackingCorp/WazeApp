import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class EmailService {
  constructor(private configService: ConfigService) {}

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${this.configService.get("APP_URL")}/verify-email?token=${token}`;

    // TODO: Implement actual email sending with nodemailer
    console.log(`Verification email to ${email}: ${verificationUrl}`);
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${this.configService.get("APP_URL")}/reset-password?token=${token}`;

    // TODO: Implement actual email sending
    console.log(`Password reset email to ${email}: ${resetUrl}`);
  }

  async sendInvitationEmail(
    email: string,
    token: string,
    organizationName: string,
  ): Promise<void> {
    const inviteUrl = `${this.configService.get("APP_URL")}/accept-invitation?token=${token}`;

    // TODO: Implement actual email sending
    console.log(
      `Invitation email to ${email} for ${organizationName}: ${inviteUrl}`,
    );
  }
}
