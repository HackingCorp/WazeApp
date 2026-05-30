import { MigrationInterface, QueryRunner } from "typeorm";

export class AddApiToolsToAgent1786000000001 implements MigrationInterface {
  name = "AddApiToolsToAgent1786000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_agents" ADD COLUMN IF NOT EXISTS "apiTools" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_agents" DROP COLUMN IF EXISTS "apiTools"`,
    );
  }
}
