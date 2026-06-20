import { Logger as TypeOrmLogger, QueryRunner } from "typeorm";
import { Logger as NestLogger } from "@nestjs/common";

/**
 * TypeORM logger that NEVER prints query parameters.
 *
 * TypeORM's default logger dumps the full parameter array for slow-query and
 * error logs. Some columns (notably whatsapp_sessions.authData, which holds the
 * entire Baileys credential/pre-key store) are multi-megabyte blobs containing
 * private keys. The default behaviour therefore (a) leaked WhatsApp secrets into
 * plaintext stdout logs and (b) produced ~30 MB log lines that bloated the log
 * pipeline. This logger keeps the useful signal (query text + duration) while
 * stripping parameters entirely.
 */
const MAX_QUERY_LEN = 300;

export class SafeQueryLogger implements TypeOrmLogger {
  private readonly logger = new NestLogger("Database");

  private truncate(query: string): string {
    const q = (query || "").replace(/\s+/g, " ").trim();
    return q.length > MAX_QUERY_LEN
      ? `${q.slice(0, MAX_QUERY_LEN)}… [truncated]`
      : q;
  }

  // Per-query verbose logging is left to development only and intentionally
  // silent here — it would be far too noisy in production and could include
  // parameter values via the query string.
  logQuery(_query: string, _parameters?: any[], _queryRunner?: QueryRunner) {}

  logQueryError(
    error: string | Error,
    query: string,
    _parameters?: any[],
    _queryRunner?: QueryRunner,
  ) {
    const msg = typeof error === "string" ? error : error?.message || String(error);
    // Parameters are intentionally omitted — they may contain secrets.
    this.logger.error(`Query failed: ${this.truncate(query)} — ${msg}`);
  }

  logQuerySlow(
    time: number,
    query: string,
    _parameters?: any[],
    _queryRunner?: QueryRunner,
  ) {
    // Log duration + query without parameters (avoids leaking authData blobs).
    this.logger.warn(`Slow query (${time}ms): ${this.truncate(query)}`);
  }

  logSchemaBuild(message: string) {
    this.logger.log(message);
  }

  logMigration(message: string) {
    this.logger.log(message);
  }

  log(level: "log" | "info" | "warn", message: any) {
    if (level === "warn") {
      this.logger.warn(message);
    } else {
      this.logger.log(message);
    }
  }
}
