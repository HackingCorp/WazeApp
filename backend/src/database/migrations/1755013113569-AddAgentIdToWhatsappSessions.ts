import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAgentIdToWhatsappSessions1755013113569
  implements MigrationInterface
{
  name = "AddAgentIdToWhatsappSessions1755013113569";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" ADD "agentId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "FK_c6a777b2c6f0dbad1d6fec1e14f" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" DROP CONSTRAINT "FK_c6a777b2c6f0dbad1d6fec1e14f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" DROP COLUMN "agentId"`,
    );
  }
}
