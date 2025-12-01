import { DataSource } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { config } from "dotenv";
import * as path from "path";

// Load environment variables
config();

const configService = new ConfigService();

const AppDataSource = new DataSource({
  type: "postgres",
  host: configService.get("DATABASE_HOST", "localhost"),
  port: +configService.get("DATABASE_PORT", 5432),
  username: configService.get("DATABASE_USERNAME", "wizeapp"),
  password: configService.get("DATABASE_PASSWORD", "wizeapp123"),
  database: configService.get("DATABASE_NAME", "wizeapp"),
  synchronize: configService.get("DATABASE_SYNCHRONIZE", "false") === "true",
  logging: configService.get("NODE_ENV") === "development",
  ssl:
    configService.get("DATABASE_SSL_ENABLED") === "true"
      ? {
          rejectUnauthorized:
            configService.get("DATABASE_REJECT_UNAUTHORIZED") !== "false",
        }
      : false,
  entities: [path.join(__dirname, "../**/*.entity{.ts,.js}")],
  migrations: [path.join(__dirname, "./migrations/*{.ts,.js}")],
  subscribers: [path.join(__dirname, "./subscribers/*{.ts,.js}")],
});

export default AppDataSource;
