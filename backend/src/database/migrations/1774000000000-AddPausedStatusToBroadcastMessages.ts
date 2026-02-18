import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPausedStatusToBroadcastMessages1774000000000 implements MigrationInterface {
  name = "AddPausedStatusToBroadcastMessages1774000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add 'paused' value to the broadcast_message_status_enum
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "broadcast_message_status_enum" ADD VALUE IF NOT EXISTS 'paused';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values directly.
    // To revert, you would need to recreate the enum without 'paused'
    // and update all affected columns, which is a destructive operation.
    // Leaving as no-op for safety.
  }
}
