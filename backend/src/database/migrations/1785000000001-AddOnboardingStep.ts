import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOnboardingStep1785000000001 implements MigrationInterface {
  name = "AddOnboardingStep1785000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "onboardingStep" smallint DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "onboardingStep"`,
    );
  }
}
