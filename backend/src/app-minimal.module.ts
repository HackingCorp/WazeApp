import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthMinimalController, AuthMinimalController } from "./health-minimal.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
  ],
  controllers: [HealthMinimalController, AuthMinimalController],
})
export class AppMinimalModule {}
