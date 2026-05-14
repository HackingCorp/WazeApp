import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAutovacuumTuning1784000000003 implements MigrationInterface {
  name = "AddAutovacuumTuning1784000000003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // agent_messages: vacuum after 5% changes (vs 20% default) — table grows fast with WhatsApp traffic
    await queryRunner.query(`
      ALTER TABLE "agent_messages" SET (
        autovacuum_vacuum_scale_factor = 0.05,
        autovacuum_analyze_scale_factor = 0.02
      )
    `);

    // agent_conversations: same tuning for frequent updates
    await queryRunner.query(`
      ALTER TABLE "agent_conversations" SET (
        autovacuum_vacuum_scale_factor = 0.05,
        autovacuum_analyze_scale_factor = 0.02
      )
    `);

    // Refresh planner statistics after index changes
    await queryRunner.query(`ANALYZE "agent_messages"`);
    await queryRunner.query(`ANALYZE "agent_conversations"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reset to PostgreSQL defaults
    await queryRunner.query(`
      ALTER TABLE "agent_messages" RESET (
        autovacuum_vacuum_scale_factor,
        autovacuum_analyze_scale_factor
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_conversations" RESET (
        autovacuum_vacuum_scale_factor,
        autovacuum_analyze_scale_factor
      )
    `);
  }
}
