import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSwipes1786560905595 implements MigrationInterface {
  name = 'AddSwipes1786560905595';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "swipe" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "mediaType" varchar NOT NULL, "direction" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" integer, CONSTRAINT "UNIQUE_USER_SWIPE" UNIQUE ("tmdbId", "mediaType", "userId"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_swipe_tmdbId" ON "swipe" ("tmdbId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_swipe_userId" ON "swipe" ("userId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_swipe_user_direction_createdAt" ON "swipe" ("userId", "direction", "createdAt")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_swipe_user_direction_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_swipe_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_swipe_tmdbId"`);
    await queryRunner.query(`DROP TABLE "swipe"`);
  }
}
