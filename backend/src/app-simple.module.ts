import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";

// Core modules
import { DatabaseModule } from "./database/database.module";

// Feature modules
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { HealthModule } from "./modules/health/health.module";

// Guards
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),

    // Database
    DatabaseModule,

    // Feature modules
    AuthModule,
    UsersModule,
    OrganizationsModule,
    HealthModule,
  ],
  providers: [
    // Global guards
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppSimpleModule {}
