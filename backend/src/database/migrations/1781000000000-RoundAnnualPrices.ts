import { MigrationInterface, QueryRunner } from 'typeorm';

export class RoundAnnualPrices1781000000000 implements MigrationInterface {
  name = 'RoundAnnualPrices1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update annual prices to be divisible by 12 for clean monthly display
    // Standard: $23/mo × 12 = $276/year (~21% off $29/mo)
    await queryRunner.query(`
      UPDATE "plans"
      SET "priceAnnualUSD" = 276,
          "priceAnnualXAF" = 180000
      WHERE "code" = 'standard'
    `);

    // Pro: $39/mo × 12 = $468/year (~20% off $49/mo)
    await queryRunner.query(`
      UPDATE "plans"
      SET "priceAnnualUSD" = 468,
          "priceAnnualXAF" = 300000
      WHERE "code" = 'pro'
    `);

    // Enterprise: $159/mo × 12 = $1908/year (~20% off $199/mo)
    await queryRunner.query(`
      UPDATE "plans"
      SET "priceAnnualUSD" = 1908,
          "priceAnnualXAF" = 1200000
      WHERE "code" = 'enterprise'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "plans"
      SET "priceAnnualUSD" = 290,
          "priceAnnualXAF" = 190000
      WHERE "code" = 'standard'
    `);

    await queryRunner.query(`
      UPDATE "plans"
      SET "priceAnnualUSD" = 490,
          "priceAnnualXAF" = 320000
      WHERE "code" = 'pro'
    `);

    await queryRunner.query(`
      UPDATE "plans"
      SET "priceAnnualUSD" = 1990,
          "priceAnnualXAF" = 1300000
      WHERE "code" = 'enterprise'
    `);
  }
}
