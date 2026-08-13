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

export type ReportError =
  | ClientNotFound
  | NotLineOwner
  | ReportNotFound
  | ReportNotVisible
  | TransitionNotAllowed;
