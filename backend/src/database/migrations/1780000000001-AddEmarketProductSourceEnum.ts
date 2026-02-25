import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmarketProductSourceEnum1780000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "products_source_enum" ADD VALUE IF NOT EXISTS 'emarket'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing values from enums
  }
}
