import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRefreshTokenHashToUsers1772000000000 implements MigrationInterface {
    name = 'AddRefreshTokenHashToUsers1772000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasColumn = await queryRunner.hasColumn('users', 'refreshTokenHash');
        if (!hasColumn) {
            await queryRunner.query(`
                ALTER TABLE "users"
                ADD COLUMN "refreshTokenHash" character varying DEFAULT NULL
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const hasColumn = await queryRunner.hasColumn('users', 'refreshTokenHash');
        if (hasColumn) {
            await queryRunner.query(`
                ALTER TABLE "users"
                DROP COLUMN "refreshTokenHash"
            `);
        }
    }
}
