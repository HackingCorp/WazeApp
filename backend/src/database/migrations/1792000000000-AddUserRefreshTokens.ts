import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserRefreshTokens1792000000000 implements MigrationInterface {
  name = "AddUserRefreshTokens1792000000000";

  /**
   * Users held a single refreshTokenHash, rotated on every login and on every
   * token refresh. Any second session — another tab, a phone — overwrote it,
   * so the first session died at its next refresh. With a 15 minute access
   * token that produced a re-login loop every quarter of an hour.
   *
   * The existing hash is carried into the new array so the deploy does not
   * sign anyone out.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn("users", "refreshTokens");
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD COLUMN "refreshTokens" jsonb NOT NULL DEFAULT '[]'::jsonb
      `);
    }

    await queryRunner.query(`
      UPDATE "users"
      SET "refreshTokens" = jsonb_build_array(
        jsonb_build_object(
          'hash', "refreshTokenHash",
          'createdAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
      )
      WHERE "refreshTokenHash" IS NOT NULL
        AND ("refreshTokens" IS NULL OR "refreshTokens" = '[]'::jsonb)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn("users", "refreshTokens");
    if (hasColumn) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "refreshTokens"`);
    }
  }
}
