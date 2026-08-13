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

type DatabaseError = {
  code: string;
  constraint?: string;
  message: string;
};

/**
 * データベースが書き込みを拒否したことを確認し、その理由を返します。
 *
 * Drizzle は pg のエラーを `Failed query: ...` で包むため、メッセージだけを見ると
 * 拒否の理由が分かりません。SQLSTATE まで辿って、どの規則が働いたのかを検証できるようにします。
 *
 * - `BR001` — 確定後の不変性トリガ
 * - `23505` — 一意制約（系列に進行中の版は 1 つ、など）
 * - `23514` — CHECK 制約
 */
export async function expectRejection(run: () => Promise<unknown>): Promise<DatabaseError> {
  try {
    await run();
  } catch (thrown) {
    let current: unknown = thrown;

    while (current !== null && current !== undefined) {
      if (typeof current === "object" && "code" in current && typeof current.code === "string") {
        return current as DatabaseError;
      }

      current = (current as { cause?: unknown }).cause;
    }

    throw new Error(`the write was rejected, but no SQLSTATE was found: ${String(thrown)}`);
  }

  throw new Error("expected the database to reject this write, but it was accepted");
}
