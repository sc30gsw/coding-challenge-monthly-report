import { sql } from "drizzle-orm";

import { db } from "~/db/client";

/**
 * テーブルの中身を消します。
 *
 * TRUNCATE は行トリガを発火させないため、確定済み行への UPDATE / DELETE を拒否する
 * トリガ（drizzle/0001）に阻まれずに片付けられます。DELETE だとテストが作った
 * `confirmed` な Report を消せず、後片付けが失敗します。
 * @see docs/adr/0008-immutability-enforced-in-two-layers.md
 */
export async function truncateAll() {
  await db.execute(
    sql`truncate table comments, report_lines, reports, clients, users restart identity cascade`,
  );
}
