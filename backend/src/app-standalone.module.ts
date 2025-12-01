import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

// Controllers seulement (sans base de données)
import { HealthStandaloneController } from "./health-standalone.controller";
import { AuthStandaloneController } from "./auth-standalone.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
    PassportModule,
    JwtModule.register({
      secret: "test-secret-key",
      signOptions: { expiresIn: "1h" },
    }),
  ],
  controllers: [HealthStandaloneController, AuthStandaloneController],
})
export class AppStandaloneModule {}
