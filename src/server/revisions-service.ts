import { Result } from "better-result";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "~/db/client";
import { reportLines, reports } from "~/db/schema";
import { type ReportError, ReportNotFound } from "~/features/reports/domain/errors";
import {
  createRevision as createRevisionTransition,
  revisionAlreadyInProgress,
} from "~/features/reports/domain/revision";
import type { ReportSummary } from "~/features/reports/schemas/report-schema";
import { findSummary } from "~/server/reports-service";

/**
 * 修正版の書き込みです。宣言した深掘り領域の本体なので、報告書の一般的な読み書きとは
 * 別のファイルに置いています。
 * @see docs/adr/0009-revision-is-a-copied-report.md
 */

/**
 * 「この系列には既に次の版がある」を意味する一意制約です。
 *
 * どちらが先に検出されるかは Postgres 次第なので、両方を同じ結論に写します。
 * 版番号の重複も、進行中の版の重複も、利用者から見れば同じ事実です。
 */
const SERIES_CONFLICT_CONSTRAINTS = [
  "reports_one_open_version_per_series",
  "reports_series_version_unique",
] as const satisfies readonly string[];

/** `cause` の連鎖を辿る深さの上限です。循環した `cause` で無限再帰しないようにします。 */
const MAX_CAUSE_DEPTH = 8;

/**
 * 一意制約の違反かどうかを見ます。Drizzle は元の例外を `cause` に包むので、連鎖を辿ります。
 *
 * 事前の判定をすり抜けるのは、2 人が同時に修正版を作ろうとしたときだけです。
 * そこで 500 を返すと、利用者には「壊れた」としか映りません。
 */
function isSeriesConflict(cause: unknown, depth = 0): boolean {
  if (depth > MAX_CAUSE_DEPTH || typeof cause !== "object" || cause === null) {
    return false;
  }

  if (
    "constraint" in cause &&
    SERIES_CONFLICT_CONSTRAINTS.some((constraint) => constraint === cause.constraint)
  ) {
    return true;
  }

  return "cause" in cause && isSeriesConflict(cause.cause, depth + 1);
}

/**
 * 修正版の作成。確定済みの中身は 1 バイトも書き換えず、新しい版として作り直します。
 *
 * **書き込みの順序に業務ルールが埋まっています。**
 * 新しい版を先に INSERT しないと、旧版を `superseded` にする UPDATE を DB のトリガが
 * 拒みます（後継の版が存在することを条件にしているため）。逆順にすると
 * 「後継を作らずに確定済みを無効化する」経路が空きます。
 *
 * コメントは複製しません。やりとりは版ごとの記録です。
 * @see docs/adr/0009-revision-is-a-copied-report.md
 * @see docs/adr/0011-comments-outlive-confirmation.md
 */
export async function createRevision(
  reportId: string,
): Promise<Result<ReportSummary, ReportError>> {
  const [source] = await db
    .select({
      addressee: reports.addressee,
      clientId: reports.clientId,
      clientName: reports.clientName,
      seriesId: reports.seriesId,
      status: reports.status,
      targetMonth: reports.targetMonth,
      version: reports.version,
    })
    .from(reports)
    .where(eq(reports.id, reportId))
    .limit(1);

  if (!source) {
    return Result.err(new ReportNotFound({ message: "報告書が見つかりません", reportId }));
  }

  const [open] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(eq(reports.seriesId, source.seriesId), inArray(reports.status, ["draft", "in_review"])),
    )
    .limit(1);

  const revision = createRevisionTransition({
    hasOpenVersion: Boolean(open),
    status: source.status,
    version: source.version,
  });

  if (Result.isError(revision)) {
    return revision;
  }

  const id = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(reports).values({
        addressee: source.addressee,
        clientId: source.clientId,
        clientName: source.clientName,
        id,
        seriesId: source.seriesId,
        status: revision.value.status,
        targetMonth: source.targetMonth,
        version: revision.value.version,
      });

      const lines = await tx
        .select({
          amount: reportLines.amount,
          projectName: reportLines.projectName,
          salesOwnerId: reportLines.salesOwnerId,
        })
        .from(reportLines)
        .where(eq(reportLines.reportId, reportId))
        .orderBy(reportLines.position, reportLines.createdAt);

      if (lines.length > 0) {
        // 確認状況と差し戻し理由は引き継ぎません。版ごとに承認を取り直すためです。
        // @see docs/adr/0007-approval-is-bound-to-content.md
        await tx.insert(reportLines).values(
          lines.map((line, index) => ({
            amount: line.amount,
            position: index,
            projectName: line.projectName,
            reportId: id,
            salesOwnerId: line.salesOwnerId,
          })),
        );
      }

      // status と updated_at だけを書きます。トリガはこの 2 列を除いて行が同一であることを
      // 確かめるので、他の列に触れると確定済みの改変として拒否されます。
      await tx
        .update(reports)
        .set({ status: "superseded", updatedAt: new Date() })
        .where(eq(reports.id, reportId));
    });
  } catch (cause) {
    if (isSeriesConflict(cause)) {
      return Result.err(revisionAlreadyInProgress(source.version));
    }

    // 想定外の失敗は握り潰しません。業務ルールではなく不具合だからです。
    // `Result.try` の catch は必ずエラー値を返す必要があり、それでは欠陥を
    // `ReportError` に混ぜることになるので、ここは素の try/catch にしています。
    // @see docs/adr/0005-better-result-for-expected-failures.md
    throw cause;
  }

  const created = await findSummary(id);

  return created
    ? Result.ok(created)
    : Result.err(new ReportNotFound({ message: "作成した修正版を読み出せません", reportId: id }));
}
