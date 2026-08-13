import { Result } from "better-result";
import { and, asc, eq } from "drizzle-orm";

import { db } from "~/db/client";
import { comments, reportLines, users } from "~/db/schema";
import type { Comment, CreateCommentInput } from "~/features/comments/schemas/comment-schema";
import { LineNotInReport, type ReportError } from "~/features/reports/domain/errors";
import { ensureVisible } from "~/server/reports-service";

/**
 * コメントの読み書きです。
 *
 * 確定済みの報告書にも投稿できます。確定後の不変性は「取引先に提出される中身」に
 * 掛かる制約であり、やりとりの記録はその中身ではないためです。確定後に誤りを
 * 見つけた人が経緯を残せないのは、運用として成立しません。
 * @see docs/adr/0011-comments-outlive-confirmation.md
 */

type Viewer = {
  id: string;
  role: "admin" | "sales";
};

/**
 * 戻り値の型を明示しています。Ok と Err の合併のままだと `Result.isError` で
 * 絞り込めず、呼び出し側が `.value` を読めません。
 */
export async function listComments(
  viewer: Viewer,
  reportId: string,
): Promise<Result<Comment[], ReportError>> {
  const visible = await ensureVisible(viewer, reportId);

  if (Result.isError(visible)) {
    return visible;
  }

  const rows = await db
    .select({
      author: { id: users.id, name: users.name, role: users.role },
      body: comments.body,
      createdAt: comments.createdAt,
      id: comments.id,
      lineId: comments.lineId,
      lineProjectName: reportLines.projectName,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .leftJoin(reportLines, eq(reportLines.id, comments.lineId))
    .where(eq(comments.reportId, reportId))
    // created_at は now()（トランザクション開始時刻）なので同時刻がありえます。
    // id をタイブレークに入れないと並びが揺れます。
    .orderBy(asc(comments.createdAt), asc(comments.id));

  return Result.ok(rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })));
}

export async function postComment(
  viewer: Viewer,
  reportId: string,
  input: CreateCommentInput,
): Promise<Result<{ ok: true }, ReportError>> {
  const visible = await ensureVisible(viewer, reportId);

  if (Result.isError(visible)) {
    return visible;
  }

  if (input.lineId) {
    // 他の報告書の明細を指したコメントを作れないようにします。
    const [line] = await db
      .select({ id: reportLines.id })
      .from(reportLines)
      .where(and(eq(reportLines.id, input.lineId), eq(reportLines.reportId, reportId)))
      .limit(1);

    if (!line) {
      return Result.err(
        new LineNotInReport({
          lineId: input.lineId,
          message: "その明細はこの報告書のものではありません",
          reportId,
        }),
      );
    }
  }

  await db.insert(comments).values({
    authorId: viewer.id,
    body: input.body,
    lineId: input.lineId ?? null,
    reportId,
  });

  return Result.ok({ ok: true as const });
}
