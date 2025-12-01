import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeWhatsAppSessionOrganizationOptional1754735825124
  implements MigrationInterface
{
  name = "MakeWhatsAppSessionOrganizationOptional1754735825124";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" DROP CONSTRAINT "FK_1cfc323dfa1966c64e4fc46f8ed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" ALTER COLUMN "organizationId" DROP NOT NULL`,
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
      `ALTER TABLE "whatsapp_sessions" ALTER COLUMN "organizationId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "FK_1cfc323dfa1966c64e4fc46f8ed" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
