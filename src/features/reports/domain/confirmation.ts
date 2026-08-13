import { Result } from "better-result";

import {
  LinesNotFullyApproved,
  ReportHasNoLines,
  TransitionNotAllowed,
} from "~/features/reports/domain/errors";
import type { reviewProgress } from "~/features/reports/domain/line-editing";
import type { ReportStatus } from "~/features/reports/schemas/report-schema";

/**
 * 確定。**純粋関数**なので DB も HTTP も知りません。
 *
 * 確定は不可逆です。通してしまうと取り消す手段は修正版を作ることだけになるので、
 * 条件はここに列挙して一箇所で守ります。
 * @see docs/adr/0012-confirm-preconditions.md
 */

type ConfirmError = LinesNotFullyApproved | ReportHasNoLines | TransitionNotAllowed;

type ReportState = {
  progress: ReturnType<typeof reviewProgress>;
  status: ReportStatus;
};

const STATUS_LABELS = {
  confirmed: "確定済み",
  draft: "下書き",
  in_review: "確認中",
  superseded: "旧版",
} as const satisfies Record<ReportStatus, string>;

/**
 * 確定できるのは、確認中で、明細が 1 件以上あり、そのすべてが承認済みのときだけです。
 *
 * 件数を別に見るのは、「すべて承認済み」が明細 0 件のとき自動的に真になるためです。
 * 空のまま確定すると、中身の無い報告書が不可逆に残ります。
 */
export function confirmReport(
  report: ReportState,
): Result<{ confirmedAt: Date; status: "confirmed" }, ConfirmError> {
  if (report.status !== "in_review") {
    return Result.err(
      new TransitionNotAllowed({
        from: report.status,
        message: `${STATUS_LABELS[report.status]}の報告書は確定できません`,
        to: "confirmed",
      }),
    );
  }

  if (report.progress.total === 0) {
    return Result.err(
      new ReportHasNoLines({
        message: "明細が 1 件も無い報告書は確定できません",
        reportId: "",
      }),
    );
  }

  if (!report.progress.isFullyApproved) {
    return Result.err(
      new LinesNotFullyApproved({
        approved: report.progress.approved,
        changesRequested: report.progress.changesRequested,
        message: `未承認 ${report.progress.pending} 件・差し戻し ${report.progress.changesRequested} 件が残っています`,
        pending: report.progress.pending,
      }),
    );
  }

  // confirmed_at は CHECK 制約で status と対応づけられています。片方だけ書ける
  // 余地を残さないよう、遷移の結果として一緒に返します。
  return Result.ok({ confirmedAt: new Date(), status: "confirmed" as const });
}
