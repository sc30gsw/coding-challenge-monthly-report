import { Result } from "better-result";

import type { Role } from "~/features/auth/schemas/session-schema";
import { NotLineOwner, TransitionNotAllowed } from "~/features/reports/domain/errors";
import type { ReportLine, ReportStatus } from "~/features/reports/schemas/report-schema";

/**
 * 明細の確認（承認・差し戻し）です。**純粋関数**なので DB も HTTP も知りません。
 *
 * 守っているのは 2 つ。確認できるのは報告書が確認中のときだけで、触れるのは
 * 自分が担当する明細だけ、という点です。
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

const STATUS_LABELS = {
  confirmed: "確定済み",
  draft: "下書き",
  in_review: "確認中",
  superseded: "旧版",
} as const satisfies Record<ReportStatus, string>;

/**
 * 確認できる状況かを判定します。
 *
 * 順番に意味があります。担当かどうかを先に見るのは、担当外の人に
 * 「いまは確認中ではない」と報告書の状態まで教える必要がないためです。
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
        message: `${STATUS_LABELS[line.reportStatus]}の報告書の明細は確認できません`,
        to,
      }),
    );
  }

  return Result.ok(true as const);
}

/** 承認。すでに承認済みの行をもう一度承認しても、結果は同じです。 */
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
