import { MigrationInterface, QueryRunner } from 'typeorm';

export class FollowUps1791168505270 implements MigrationInterface {
  name = 'FollowUps1791168505270';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."follow_ups_type_enum" AS ENUM('call', 'meeting', 'email', 'other')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."follow_ups_status_enum" AS ENUM('pending', 'overdue', 'completed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "follow_ups" ("id" SERIAL NOT NULL, "lead_id" integer NOT NULL, "employee_id" integer, "type" "public"."follow_ups_type_enum" NOT NULL DEFAULT 'call', "title" character varying NOT NULL, "notes" text, "due_at" TIMESTAMP WITH TIME ZONE NOT NULL, "status" "public"."follow_ups_status_enum" NOT NULL DEFAULT 'pending', "overdue_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "outcome_note" text, "created_by_user_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_c96cd596707b4ec208beedc174" CHECK ("status" <> 'cancelled' OR "cancelled_at" IS NOT NULL), CONSTRAINT "CHK_1edb4d18e7506d979e62700778" CHECK ("status" <> 'completed' OR "completed_at" IS NOT NULL), CONSTRAINT "PK_d510aabdff2ec7fdc67a1092157" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_follow_ups_status_due" ON "follow_ups" ("status", "due_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_follow_ups_employee_status" ON "follow_ups" ("employee_id", "status") `,
    );
    await queryRunner.query(`CREATE INDEX "idx_follow_ups_lead" ON "follow_ups" ("lead_id") `);
    await queryRunner.query(
      `ALTER TYPE "public"."lead_activities_type_enum" RENAME TO "lead_activities_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."lead_activities_type_enum" AS ENUM('lead_created', 'lead_updated', 'status_changed', 'note_added', 'assigned', 'reassigned', 'unassigned', 'assignment_failed', 'follow_up_created', 'follow_up_completed', 'follow_up_overdue', 'follow_up_cancelled', 'follow_up_rescheduled', 'follow_up_reassigned', 'sla_breached', 'escalated')`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_activities" ALTER COLUMN "type" TYPE "public"."lead_activities_type_enum" USING "type"::"text"::"public"."lead_activities_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."lead_activities_type_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "follow_ups" ADD CONSTRAINT "FK_2dde8f78f85193994c0f3f6ce68" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "follow_ups" ADD CONSTRAINT "FK_6d2ba8a2922150d8102290d43d7" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "follow_ups" ADD CONSTRAINT "FK_1c7396b0911b5dd90fdbae86f30" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "follow_ups" DROP CONSTRAINT "FK_1c7396b0911b5dd90fdbae86f30"`,
    );
    await queryRunner.query(
      `ALTER TABLE "follow_ups" DROP CONSTRAINT "FK_6d2ba8a2922150d8102290d43d7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "follow_ups" DROP CONSTRAINT "FK_2dde8f78f85193994c0f3f6ce68"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."lead_activities_type_enum_old" AS ENUM('lead_created', 'lead_updated', 'status_changed', 'note_added', 'assigned', 'reassigned', 'unassigned', 'assignment_failed', 'follow_up_created', 'follow_up_completed', 'follow_up_overdue', 'sla_breached', 'escalated')`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_activities" ALTER COLUMN "type" TYPE "public"."lead_activities_type_enum_old" USING "type"::"text"::"public"."lead_activities_type_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."lead_activities_type_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."lead_activities_type_enum_old" RENAME TO "lead_activities_type_enum"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_follow_ups_lead"`);
    await queryRunner.query(`DROP INDEX "public"."idx_follow_ups_employee_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_follow_ups_status_due"`);
    await queryRunner.query(`DROP TABLE "follow_ups"`);
    await queryRunner.query(`DROP TYPE "public"."follow_ups_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."follow_ups_type_enum"`);
  }
}
