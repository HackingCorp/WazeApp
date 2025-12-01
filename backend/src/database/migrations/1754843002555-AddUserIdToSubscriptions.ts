import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserIdToSubscriptions1754843002555
  implements MigrationInterface
{
  name = "AddUserIdToSubscriptions1754843002555";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" DROP CONSTRAINT "FK_whatsapp_sessions_organizationId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD "userId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP CONSTRAINT "FK_a7a84c705f3e8e4fbd497cfb119"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ALTER COLUMN "organizationId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_a7a84c705f3e8e4fbd497cfb119" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "FK_1cfc323dfa1966c64e4fc46f8ed" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" DROP CONSTRAINT "FK_1cfc323dfa1966c64e4fc46f8ed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP CONSTRAINT "FK_a7a84c705f3e8e4fbd497cfb119"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ALTER COLUMN "organizationId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_a7a84c705f3e8e4fbd497cfb119" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "userId"`);
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "FK_whatsapp_sessions_organizationId" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
