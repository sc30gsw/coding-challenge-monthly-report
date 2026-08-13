import { Result } from "better-result";

import { RevisionAlreadyInProgress, TransitionNotAllowed } from "~/features/reports/domain/errors";
import { REPORT_STATUS_LABELS } from "~/features/reports/domain/status-labels";
import type { ReportStatus } from "~/features/reports/schemas/report-schema";

/**
 * 修正版。**純粋関数**なので DB も HTTP も知りません。
 *
 * 確定済みの報告書は書き換えません。誤りが見つかったら、元の版を残したまま
 * 新しい版を作り直します。
 * @see docs/adr/0009-revision-is-a-copied-report.md
 */

type RevisionError = RevisionAlreadyInProgress | TransitionNotAllowed;

type ReportState = {
  /** 同じ系列に `draft` / `in_review` の版が既にあるか。 */
  hasOpenVersion: boolean;
  status: ReportStatus;
  version: number;
};

/**
 * 並走の拒否は 2 箇所から作られます。作成前の判定と、DB の一意制約違反を写すときです。
 * 利用者から見れば同じ事実なので、文言も 1 箇所に置きます。
 */
export function revisionAlreadyInProgress(version: number) {
  return new RevisionAlreadyInProgress({
    message: "この報告書には作成中の修正版が既にあります",
    version,
  });
}

/**
 * 修正版を作れるのは、確定済みで、かつ同じ系列に進行中の版が無いときだけです。
 *
 * 判定の順序に意味があります。状態を先に見るのは、下書きに対する「修正版を作る」が
 * そもそも成立しない操作だからです。並走を先に見ると、下書きに対して
 * 「進行中の版があります」という的外れな理由が返ります。
 *
 * 新しい版は `draft` から始まります。明細は版ごとに再編集され承認され直すので、
 * 読み取り専用の複製では差し戻しの導線が書けません。
 */
export function createRevision(
  report: ReportState,
): Result<{ status: "draft"; version: number }, RevisionError> {
  if (report.status !== "confirmed") {
    return Result.err(
      new TransitionNotAllowed({
        from: report.status,
        message: `${REPORT_STATUS_LABELS[report.status]}の報告書からは修正版を作れません`,
        to: "draft",
      }),
    );
  }

  if (report.hasOpenVersion) {
    return Result.err(revisionAlreadyInProgress(report.version));
  }

  return Result.ok({ status: "draft" as const, version: report.version + 1 });
}
