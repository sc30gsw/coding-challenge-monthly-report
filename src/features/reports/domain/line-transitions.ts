import { Result } from "better-result";

import { NotLineOwner, TransitionNotAllowed } from "~/features/reports/domain/errors";
import {
  REPORT_LINE_STATUS_LABELS,
  REPORT_STATUS_LABELS,
} from "~/features/reports/domain/status-labels";
import type { ReportLine, ReportStatus } from "~/features/reports/schemas/report-schema";
import type { Role } from "~/lib/session-schema";

/**
 * 明細の確認（承認・差し戻し）です。**純粋関数**なので DB も HTTP も知りません。
 *
 * 守っているのは 3 つ。確認できるのは報告書が確認中のときだけで、触れるのは
 * 自分が担当する明細だけ、しかもその明細がまだ未確認のときだけ、という点です。
 * @see docs/adr/0010-sales-owner-lives-on-the-line.md
 */

type LineState = {
  id?: string;
  reportStatus: ReportStatus;
  salesOwnerId: string;
  status: ReportLine["status"];
};

/**
 * 戻り値の型を明示しています。Ok と Err の合併のままだと `Result.isError` で
 * 絞り込めず、呼び出し側が `.value` を読めません。
 */
type LineTransitionError = NotLineOwner | TransitionNotAllowed;

type Actor = {
  id: string;
  role: Role;
};

/**
 * 確認できる状況かを判定します。
 *
 * 順番に意味があります。担当かどうかを先に見るのは、担当外の人に
 * 「いまは確認中ではない」と報告書の状態まで教える必要がないためです。同じ理由で、
 * 自分の行がすでに承認済みか差し戻し済みかは、担当者本人にしか教えません。
 *
 * 未確認の行にしか手を出せません。承認済みの行への差し戻しや、差し戻し済みの行への
 * 承認を許すと、管理者が一度も編集していない内容の確認状況を営業自身が動かせてしまい、
 * 「承認は内容に対する意思表示」（ADR-0007）が崩れます。もう一度確認し直すには、
 * 管理者の編集で `pending` に戻るのを待ちます。
 * @see docs/adr/0007-approval-is-bound-to-content.md
 */
function ensureReviewable(
  line: LineState,
  actor: Actor,
  to: string,
): Result<true, LineTransitionError> {
  const isOwner = actor.role === "sales" && actor.id === line.salesOwnerId;

  if (!isOwner) {
    return Result.err(
      new NotLineOwner({
        lineId: line.id ?? "",
        message: "自分が担当する明細だけを確認できます",
      }),
    );
  }

  if (line.reportStatus !== "in_review") {
    return Result.err(
      new TransitionNotAllowed({
        from: line.reportStatus,
        message: `${REPORT_STATUS_LABELS[line.reportStatus]}の報告書の明細は確認できません`,
        to,
      }),
    );
  }

  if (line.status !== "pending") {
    return Result.err(
      new TransitionNotAllowed({
        from: line.status,
        message: `既に${REPORT_LINE_STATUS_LABELS[line.status]}の明細です。管理者が編集して未確認に戻すまで、確認し直せません`,
        to,
      }),
    );
  }

  return Result.ok(true as const);
}

/** 承認。未確認の行にだけ行えます。 */
export function approveLine(
  line: LineState,
  actor: Actor,
): Result<{ status: "approved" }, LineTransitionError> {
  const allowed = ensureReviewable(line, actor, "approved");

  if (Result.isError(allowed)) {
    return allowed;
  }

  return Result.ok({ status: "approved" as const });
}

/**
 * 差し戻し。理由は必須です（入力の検証は境界の Valibot スキーマが行います）。
 *
 * 返すのは明細の変化だけで、報告書の状態には触れません。明細ごとに承認と差し戻しが
 * 混在するため、報告書側の単一のステータスでは表すと嘘になります。
 * @see docs/adr/0007-approval-is-bound-to-content.md
 */
export function requestChanges(
  line: LineState,
  actor: Actor,
  reason: string,
): Result<{ changeRequestReason: string; status: "changes_requested" }, LineTransitionError> {
  const allowed = ensureReviewable(line, actor, "changes_requested");

  if (Result.isError(allowed)) {
    return allowed;
  }

  return Result.ok({ changeRequestReason: reason, status: "changes_requested" as const });
}
