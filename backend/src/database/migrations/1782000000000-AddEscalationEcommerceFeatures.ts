import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEscalationEcommerceFeatures1782000000000 implements MigrationInterface {
  name = 'AddEscalationEcommerceFeatures1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add featureEscalation and featureEcommerce columns to plans table
    await queryRunner.query(`
      ALTER TABLE "plans"
      ADD COLUMN "featureEscalation" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "plans"
      ADD COLUMN "featureEcommerce" boolean NOT NULL DEFAULT false
    `);

    // Enable escalation and e-commerce for PRO and ENTERPRISE plans
    await queryRunner.query(`
      UPDATE "plans"
      SET "featureEscalation" = true, "featureEcommerce" = true
      WHERE "code" IN ('pro', 'enterprise')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plans" DROP COLUMN "featureEcommerce"
    `);

    await queryRunner.query(`
      ALTER TABLE "plans" DROP COLUMN "featureEscalation"
    `);
  }
}
