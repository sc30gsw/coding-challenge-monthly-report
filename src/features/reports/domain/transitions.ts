import { Result } from "better-result";

import { TransitionNotAllowed } from "~/features/reports/domain/errors";
import type { ReportStatus } from "~/features/reports/schemas/report-schema";

/**
 * 報告書の状態遷移です。**純粋関数**なので、DB も HTTP も知りません。
 *
 * 遷移の可否をここに集めるのは、状態 × 操作の組み合わせを一箇所で網羅するためです。
 * 「その状態ではできない」は想定内の結果なので、throw ではなく Result で返します。
 * @see docs/design.md
 * @see docs/adr/0005-better-result-for-expected-failures.md
 */

type ReportState = Record<"status", ReportStatus>;

const STATUS_LABELS = {
  confirmed: "確定済み",
  draft: "下書き",
  in_review: "確認中",
  superseded: "旧版",
} as const satisfies Record<ReportStatus, string>;

/**
 * 確認依頼。下書きからのみ進めます。
 *
 * 明細が 0 件でも止めません。確定（issue #8）とは違い、確認依頼は不可逆ではなく、
 * `in_review` のまま明細を足せる（issue #7）ので、業務が壊れないためです。
 * 空のまま提出できてしまう確定側だけが、件数を明示的に条件へ足すべき場所です。
 */
export function requestReview(report: ReportState) {
  if (report.status !== "draft") {
    return Result.err(
      new TransitionNotAllowed({
        from: report.status,
        message: `${STATUS_LABELS[report.status]}の報告書は確認依頼できません`,
        to: "in_review",
      }),
    );
  }

  return Result.ok({ status: "in_review" as const });
}
