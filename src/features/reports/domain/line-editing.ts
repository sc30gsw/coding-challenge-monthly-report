import { Result } from "better-result";

import { ReportHasNoLines, TransitionNotAllowed } from "~/features/reports/domain/errors";
import { REPORT_STATUS_LABELS } from "~/features/reports/domain/status-labels";
import type { ReportLine, ReportStatus } from "~/features/reports/schemas/report-schema";

/**
 * 管理者による明細の編集・追加・削除です。**純粋関数**なので DB も HTTP も知りません。
 *
 * ここが本課題の主張の中心です。承認は行に貼られた永続ラベルではなく、
 * レビューした内容に対する意思表示なので、内容が変われば失われます。
 * @see docs/adr/0007-approval-is-bound-to-content.md
 */

/** 中身を書き換えられるのは、まだ提出していない間だけです。 */
const EDITABLE_REPORT_STATUSES = ["draft", "in_review"] as const;

function refuse(reportStatus: ReportStatus, to: string, what: string) {
  return Result.err(
    new TransitionNotAllowed({
      from: reportStatus,
      message: `${REPORT_STATUS_LABELS[reportStatus]}の報告書では明細を${what}できません`,
      to,
    }),
  );
}

function isEditable(reportStatus: ReportStatus) {
  return EDITABLE_REPORT_STATUSES.some((editable) => editable === reportStatus);
}

/**
 * 明細の編集。**編集した行の確認状況は必ず未確認に戻ります。**
 *
 * これが無いと「営業が承認 → 管理者が金額を書き換える → 全明細が承認済みなので確定できる」
 * が成立し、取引先に出る書類として業務が破綻します。差し戻し対応で編集を重ねるほど
 * 確定は遠のきますが、それは業務として正しい遠のき方です。
 */
export function editLine(
  line: Record<"reportStatus", ReportStatus> & Record<"status", ReportLine["status"]>,
): Result<{ status: "pending" }, TransitionNotAllowed> {
  if (!isEditable(line.reportStatus)) {
    return refuse(line.reportStatus, "pending", "編集");
  }

  return Result.ok({ status: "pending" as const });
}

/** 明細の追加。確認依頼後も足せます（足した行は未確認なので、確定は自動的に遠のきます）。 */
export function addLine(
  report: Record<"reportStatus", ReportStatus>,
): Result<true, TransitionNotAllowed> {
  if (!isEditable(report.reportStatus)) {
    return refuse(report.reportStatus, "pending", "追加");
  }

  return Result.ok(true as const);
}

type RemovalState = {
  /** 削除する前の件数。最後の 1 件かどうかの判定に要ります。 */
  lineCount: number;
  reportStatus: ReportStatus;
  version: number;
};

/**
 * 明細の削除。**下書き中だけ**です。加えて、**修正版は 0 件にできません。**
 *
 * 確認依頼後に削除を許すと「営業が差し戻した明細を管理者が消す → 指摘が対応されないまま
 * 消える → 残りが全部承認済みなので確定できる」という経路ができます。禁止すれば、
 * この穴を塞ぐための追加の機構が一切要りません。
 *
 * 修正版で 0 件を禁じるのは、旧版を `superseded` にした時点で「これはもう最新ではない」と
 * 宣言済みだからです。その後継を空にすると、確認依頼にも進めず（0 件は拒否される）、
 * 旧版へも戻れない（`superseded` からは修正版を作れない）系列が残ります。しかも空の版は
 * 営業の一覧に出ないので、**誰にも見えないまま止まります。**
 * 初版が 0 件でいられるのは、まだ誰にも何も約束していないからです。
 * @see docs/adr/0009-revision-is-a-copied-report.md
 */
export function removeLine(
  report: RemovalState,
): Result<true, ReportHasNoLines | TransitionNotAllowed> {
  if (report.reportStatus !== "draft") {
    return refuse(report.reportStatus, "deleted", "削除");
  }

  if (report.version > 1 && report.lineCount <= 1) {
    return Result.err(
      new ReportHasNoLines({
        message: "修正版の明細を 0 件にはできません。先に差し替える明細を追加してください",
        reportId: "",
      }),
    );
  }

  return Result.ok(true as const);
}

/**
 * 削除できない理由。押せない理由を画面に出すために、拒否そのものから引き出します。
 *
 * UI 側に条件を書き写すと、規則と説明文が別々に育ってずれます。非活性化は表示の都合で
 * あって防御ではなく、拒否の保証は `removeLine` を通るサーバー側にあります。
 * @see docs/adr/0012-confirm-preconditions.md
 */
export function deletionBlocker(report: RemovalState) {
  const removed = removeLine(report);

  return Result.isError(removed) ? removed.error.message : null;
}

/**
 * 確認の進み具合。明細から数えます。report 側には持ちません。
 *
 * `isFullyApproved` が件数も見るのは、「すべて承認済み」が明細 0 件のとき
 * 自動的に真になるためです。
 * @see docs/adr/0012-confirm-preconditions.md
 */
export function reviewProgress(lines: Record<"status", ReportLine["status"]>[]) {
  const approved = lines.filter((line) => line.status === "approved").length;
  const changesRequested = lines.filter((line) => line.status === "changes_requested").length;

  return {
    approved,
    changesRequested,
    isFullyApproved: lines.length > 0 && approved === lines.length,
    pending: lines.filter((line) => line.status === "pending").length,
    total: lines.length,
  };
}
