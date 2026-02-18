import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdatePlanPricesToProduction1770000000000
  implements MigrationInterface
{
  name = 'UpdatePlanPricesToProduction1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update Standard plan prices
    await queryRunner.query(`
      UPDATE "plans"
      SET "priceMonthlyXAF" = 19000,
          "priceAnnualXAF" = 190000,
          "priceMonthlyUSD" = 29,
          "priceAnnualUSD" = 290
      WHERE "code" = 'standard'
    `);

    // Update Pro plan prices
    await queryRunner.query(`
      UPDATE "plans"
      SET "priceMonthlyXAF" = 32000,
          "priceAnnualXAF" = 320000,
          "priceMonthlyUSD" = 49,
          "priceAnnualUSD" = 490
      WHERE "code" = 'pro'
    `);

    // Update Enterprise plan prices
    await queryRunner.query(`
      UPDATE "plans"
      SET "priceMonthlyXAF" = 130000,
          "priceAnnualXAF" = 1300000,
          "priceMonthlyUSD" = 199,
          "priceAnnualUSD" = 1990
      WHERE "code" = 'enterprise'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to previous test prices (if needed)
    await queryRunner.query(`
      UPDATE "plans"
      SET "priceMonthlyXAF" = 2000,
          "priceAnnualXAF" = 20000,
          "priceMonthlyUSD" = 2,
          "priceAnnualUSD" = 20
      WHERE "code" = 'standard'
    `);

    await queryRunner.query(`
      UPDATE "plans"
      SET "priceMonthlyXAF" = 3000,
          "priceAnnualXAF" = 30000,
          "priceMonthlyUSD" = 3,
          "priceAnnualUSD" = 30
      WHERE "code" = 'pro'
    `);

    await queryRunner.query(`
      UPDATE "plans"
      SET "priceMonthlyXAF" = 5000,
          "priceAnnualXAF" = 50000,
          "priceMonthlyUSD" = 5,
          "priceAnnualUSD" = 50
      WHERE "code" = 'enterprise'
    `);
  }
}
