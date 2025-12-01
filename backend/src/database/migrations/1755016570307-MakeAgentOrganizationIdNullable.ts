import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeAgentOrganizationIdNullable1755016570307
  implements MigrationInterface
{
  name = "MakeAgentOrganizationIdNullable1755016570307";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_agents" DROP CONSTRAINT "FK_fba14f644eb4763c4542deb7931"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_AGENT_NAME"`);
    await queryRunner.query(
      `ALTER TABLE "ai_agents" ALTER COLUMN "organizationId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_NAME" ON "ai_agents" ("name", "organizationId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_agents" ADD CONSTRAINT "FK_fba14f644eb4763c4542deb7931" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_agents" DROP CONSTRAINT "FK_fba14f644eb4763c4542deb7931"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_AGENT_NAME"`);
    await queryRunner.query(
      `ALTER TABLE "ai_agents" ALTER COLUMN "organizationId" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_NAME" ON "ai_agents" ("name", "organizationId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_agents" ADD CONSTRAINT "FK_fba14f644eb4763c4542deb7931" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
