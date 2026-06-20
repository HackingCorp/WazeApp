import { DataSource } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { config } from "dotenv";
import * as path from "path";
import { SafeQueryLogger } from "./safe-query.logger";

// Load environment variables
config();

const configService = new ConfigService();

const isProduction = configService.get("NODE_ENV") === "production";

// Migrations use the direct PostgreSQL connection (bypassing PgBouncer)
// because CREATE INDEX CONCURRENTLY and advisory locks require session-level
// connection semantics that PgBouncer's transaction pooling doesn't support.
const AppDataSource = new DataSource({
  type: "postgres",
  host: configService.get("DATABASE_DIRECT_HOST") || configService.get("DATABASE_HOST", "localhost"),
  port: +(configService.get("DATABASE_DIRECT_PORT") || configService.get("DATABASE_PORT", 5432)),
  username: configService.get("DATABASE_USERNAME", "wazeapp"),
  password: configService.get("DATABASE_PASSWORD", "wazeapp123"),
  database: configService.get("DATABASE_NAME", "wazeapp"),
  synchronize: configService.get("DATABASE_SYNCHRONIZE", "false") === "true",
  logging: isProduction ? ["error", "warn", "migration", "schema"] : true,
  // Strip query parameters from slow/error logs to avoid leaking secrets.
  logger: new SafeQueryLogger(),
  maxQueryExecutionTime: 1000,
  ssl:
    configService.get("DATABASE_SSL_ENABLED") === "true"
      ? {
          rejectUnauthorized:
            configService.get("DATABASE_REJECT_UNAUTHORIZED") !== "false",
        }
      : false,
  extra: {
    max: 50,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
  entities: [path.join(__dirname, "../**/*.entity{.ts,.js}")],
  migrations: [path.join(__dirname, "./migrations/*{.ts,.js}")],
  subscribers: [path.join(__dirname, "./subscribers/*{.ts,.js}")],
});

export default AppDataSource;
