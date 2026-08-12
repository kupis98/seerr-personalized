import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSwipes1786560905595 implements MigrationInterface {
  name = 'AddSwipes1786560905595';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "swipe" ("id" SERIAL NOT NULL, "tmdbId" integer NOT NULL, "mediaType" character varying NOT NULL, "direction" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer, CONSTRAINT "UNIQUE_USER_SWIPE" UNIQUE ("tmdbId", "mediaType", "userId"), CONSTRAINT "PK_swipe_id" PRIMARY KEY ("id"))`
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
    await queryRunner.query(
      `ALTER TABLE "swipe" ADD CONSTRAINT "FK_swipe_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "swipe" DROP CONSTRAINT "FK_swipe_userId"`
    );
    await queryRunner.query(`DROP INDEX "IDX_swipe_user_direction_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_swipe_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_swipe_tmdbId"`);
    await queryRunner.query(`DROP TABLE "swipe"`);
  }
}
