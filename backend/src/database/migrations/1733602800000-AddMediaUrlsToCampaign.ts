import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaUrlsToCampaign1733602800000 implements MigrationInterface {
  name = 'AddMediaUrlsToCampaign1733602800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "broadcast_campaigns"
      ADD COLUMN IF NOT EXISTS "media_urls" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "broadcast_campaigns"
      DROP COLUMN IF EXISTS "media_urls"
    `);
  }
}
