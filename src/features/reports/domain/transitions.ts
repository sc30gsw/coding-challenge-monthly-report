import { Result } from "better-result";

import { ReportHasNoLines, TransitionNotAllowed } from "~/features/reports/domain/errors";
import type { ReportStatus } from "~/features/reports/schemas/report-schema";

/**
 * 報告書の状態遷移です。**純粋関数**なので、DB も HTTP も知りません。
 *
 * 遷移の可否をここに集めるのは、状態 × 操作の組み合わせを一箇所で網羅するためです。
 * 「その状態ではできない」は想定内の結果なので、throw ではなく Result で返します。
 * @see docs/design.md
 * @see docs/adr/0005-better-result-for-expected-failures.md
 */

type ReportState = {
  id?: string;
  lineCount: number;
  status: ReportStatus;
};

const STATUS_LABELS = {
  confirmed: "確定済み",
  draft: "下書き",
  in_review: "確認中",
  superseded: "旧版",
} as const satisfies Record<ReportStatus, string>;

/**
 * 確認依頼。下書きから、明細が 1 件以上あるときだけ進めます。
 *
 * 件数を条件に入れるのは、営業の一覧を「担当する明細を含む報告書」として
 * 導出しているためです。明細が無い報告書は誰の一覧にも出ないので、
 * 空のまま確認依頼を出すと、誰にも届かない依頼が確認中として残ります。
 * @see docs/adr/0010-sales-owner-lives-on-the-line.md
 */
export function requestReview(
  report: ReportState,
): Result<{ status: "in_review" }, ReportHasNoLines | TransitionNotAllowed> {
  if (report.status !== "draft") {
    return Result.err(
      new TransitionNotAllowed({
        from: report.status,
        message: `${STATUS_LABELS[report.status]}の報告書は確認依頼できません`,
        to: "in_review",
      }),
    );
  }

  if (report.lineCount === 0) {
    return Result.err(
      new ReportHasNoLines({
        message: "明細が 1 件も無い報告書は確認依頼できません",
        reportId: report.id ?? "",
      }),
    );
  }

  return Result.ok({ status: "in_review" as const });
}
