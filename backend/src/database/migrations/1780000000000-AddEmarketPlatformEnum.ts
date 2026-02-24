import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmarketPlatformEnum1780000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "ecommerce_stores_platform_enum" ADD VALUE IF NOT EXISTS 'emarket'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing values from enums
  }
}
