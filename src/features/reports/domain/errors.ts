import { TaggedError } from "better-result";

/**
 * 業務上の「できない」を型に載せます。
 *
 * これらは想定内の結果であって異常ではありません。throw にすると呼び出し側が
 * 握り潰しても型検査を通ってしまい、UI は「なぜ操作できないのか」を文字列マッチで
 * 判定するはめになります。
 *
 * 状態遷移の拒否（未承認が残っている・確定済みなので編集できない等）は
 * issue #6 以降でここに増えていきます。
 *
 * @see docs/adr/0005-better-result-for-expected-failures.md
 */

export class ClientNotFound extends TaggedError("ClientNotFound")<{
  clientId: string;
  message: string;
}> {}

export class ReportNotFound extends TaggedError("ReportNotFound")<{
  message: string;
  reportId: string;
}> {}

/** その状態からその操作はできない、という業務上の拒否です。 */
export class TransitionNotAllowed extends TaggedError("TransitionNotAllowed")<{
  from: string;
  message: string;
  to: string;
}> {}

/**
 * 見えてはいけない報告書に触ろうとした、という拒否です。
 * 「存在しない」と区別します。営業が担当していない報告書は、存在自体は事実だからです。
 */
export class ReportNotVisible extends TaggedError("ReportNotVisible")<{
  message: string;
  reportId: string;
}> {}

/**
 * その明細の担当ではない、という拒否です。
 *
 * 報告書が見えることと、その行に触れることは別です。営業には報告書を全体として
 * 見せる一方、承認と差し戻しは自分の担当行にだけ許します。
 * @see docs/adr/0010-sales-owner-lives-on-the-line.md
 */
export class NotLineOwner extends TaggedError("NotLineOwner")<{
  lineId: string;
  message: string;
}> {}

/**
 * 明細が 1 件も無い、という拒否です。
 *
 * 確認依頼にも確定にも効きます。空の報告書に対する「確認してください」は
 * 誰にも届かず（営業の一覧は明細から導出するため）、空のまま確定すると
 * 中身の無い書類が不可逆に残ります。
 */
export class ReportHasNoLines extends TaggedError("ReportHasNoLines")<{
  message: string;
  reportId: string;
}> {}

/**
 * 未承認または差し戻しの明細が残っている、という拒否です。
 *
 * UI はこのタグを見て確定ボタンを非活性にし、残り件数を出します。
 * ただし表示は表示であって、拒否そのものはサーバーが行います。
 * @see docs/adr/0012-confirm-preconditions.md
 */
export class LinesNotFullyApproved extends TaggedError("LinesNotFullyApproved")<{
  approved: number;
  changesRequested: number;
  message: string;
  pending: number;
}> {}

/** 指定された明細が、その報告書のものではない、という拒否です。 */
export class LineNotInReport extends TaggedError("LineNotInReport")<{
  lineId: string;
  message: string;
  reportId: string;
}> {}

/**
 * 同じ系列に作成中の修正版が既にある、という拒否です。
 *
 * 修正版が 2 つ並走すると、どちらが正なのかが決まりません。DB の部分ユニークが
 * 最後の砦ですが、制約違反をそのまま返しても利用者には何も伝わらないので、
 * その手前で理由の付いた拒否にします。
 * @see docs/adr/0009-revision-is-a-copied-report.md
 */
export class RevisionAlreadyInProgress extends TaggedError("RevisionAlreadyInProgress")<{
  message: string;
  version: number;
}> {}

/**
 * 担当営業に指定された相手が、営業ではない（または存在しない）という拒否です。
 *
 * 承認できるのは営業だけなので、営業以外を担当に割り当てた明細は誰にも承認されません。
 * その報告書は永久に確定できなくなります。画面の選択肢は営業に絞っていますが、
 * 絞り込みは表示の都合であって防御ではありません。
 * @see docs/adr/0010-sales-owner-lives-on-the-line.md
 */
export class SalesOwnerNotAssignable extends TaggedError("SalesOwnerNotAssignable")<{
  message: string;
  salesOwnerId: string;
}> {}

export type ReportError =
  | ClientNotFound
  | LineNotInReport
  | LinesNotFullyApproved
  | NotLineOwner
  | ReportHasNoLines
  | ReportNotFound
  | ReportNotVisible
  | RevisionAlreadyInProgress
  | SalesOwnerNotAssignable
  | TransitionNotAllowed;
