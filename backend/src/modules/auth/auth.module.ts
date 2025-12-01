import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { LocalStrategy } from "./strategies/local.strategy";
import { GoogleStrategy } from "./strategies/google.strategy";
import { MicrosoftStrategy } from "./strategies/microsoft.strategy";
import { FacebookStrategy } from "./strategies/facebook.strategy";
import {
  User,
  Organization,
  OrganizationMember,
  Subscription,
  AuditLog,
} from "@/common/entities";
import { EmailService } from "../email/email.service";
import { AuditService } from "../audit/audit.service";

// Dynamically load OAuth strategies only if configured
const providers: any[] = [
  AuthService,
  JwtStrategy,
  LocalStrategy,
  EmailService,
  AuditService,
];

// Only add OAuth strategies if environment variables are properly configured
const isValidOAuthConfig = (value: string | undefined) => {
  return value && 
         value !== 'disabled' && 
         !value.includes('dummy') && 
         !value.includes('your-') &&
         !value.includes('placeholder') &&
         !value.includes('1234567890') &&
         value.length > 20;
};

if (isValidOAuthConfig(process.env.GOOGLE_CLIENT_ID)) {
  providers.push(GoogleStrategy);
}
if (isValidOAuthConfig(process.env.MICROSOFT_CLIENT_ID)) {
  providers.push(MicrosoftStrategy);
}
if (isValidOAuthConfig(process.env.FACEBOOK_APP_ID)) {
  providers.push(FacebookStrategy);
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Organization,
      OrganizationMember,
      Subscription,
      AuditLog,
    ]),
    PassportModule,
    JwtModule.register({}),
    ConfigModule,
  ],
  controllers: [AuthController],
  providers,
  exports: [AuthService, JwtStrategy],
})
export class AuthModule {}
