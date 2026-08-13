import * as v from "valibot";

/**
 * サーバーのルート定義・OpenAPI・フォームが共有する唯一の定義です。
 * 二重に書くと必ずずれ、ずれは業務ルールの穴になります。
 * @see docs/adr/0004-valibot-and-formisch-for-forms.md
 */

const ReportStatusSchema = v.picklist(["draft", "in_review", "confirmed", "superseded"]);

const ReportLineStatusSchema = v.picklist(["pending", "approved", "changes_requested"]);

/** 対象月は月単位です。日は業務上の意味を持たないので受け取りません。 */
const TargetMonthSchema = v.pipe(
  v.string(),
  v.regex(/^\d{4}-(0[1-9]|1[0-2])$/, "対象月は YYYY-MM の形式で指定してください"),
);

/**
 * 金額は文字列で扱います。丸め誤差が出る型で取引先に出す数字を持ちたくないためで、
 * DB 側も numeric(14,2) です。
 */
const AmountSchema = v.pipe(
  v.string(),
  v.regex(/^\d+(\.\d{1,2})?$/, "金額は 0 以上の数値で入力してください"),
);

export const ClientSchema = v.object({
  defaultAddressee: v.string(),
  id: v.string(),
  name: v.string(),
});

export const CreateReportInputSchema = v.object({
  clientId: v.pipe(v.string(), v.uuid("取引先を選択してください")),
  targetMonth: TargetMonthSchema,
});

export const CreateReportLineInputSchema = v.object({
  amount: AmountSchema,
  projectName: v.pipe(v.string(), v.trim(), v.minLength(1, "案件名は必須です")),
  salesOwnerId: v.pipe(v.string(), v.uuid("担当営業を選択してください")),
});

/**
 * `:reportId` / `:lineId` の形です。ルートの `params` に付けて、URL に来た値を
 * DB へ届く前に検証します。UUID でない値は Postgres の `22P02` を引き起こし、
 * 生成 SQL とバインド値がそのまま 500 のボディに出てしまうためです。
 */
export const ReportIdParamsSchema = v.object({
  reportId: v.pipe(v.string(), v.uuid("報告書の ID が不正です")),
});

export const LineIdParamsSchema = v.object({
  lineId: v.pipe(v.string(), v.uuid("明細の ID が不正です")),
});

const ReportLineSchema = v.object({
  amount: v.string(),
  changeRequestReason: v.nullable(v.string()),
  id: v.string(),
  projectName: v.string(),
  /** 直前が承認済みだったかどうか。`status` が `pending` に戻った理由を読み分けます。 */
  previouslyApproved: v.boolean(),
  salesOwner: v.object({ id: v.string(), name: v.string() }),
  status: ReportLineStatusSchema,
});

const reportCoverEntries = {
  addressee: v.string(),
  clientName: v.string(),
  id: v.string(),
  status: ReportStatusSchema,
  targetMonth: v.string(),
  /** 明細から算出します。report 側には保存しません。 */
  totalAmount: v.string(),
  version: v.number(),
};

export const RequestChangesInputSchema = v.object({
  reason: v.pipe(v.string(), v.trim(), v.minLength(1, "差し戻しの理由を入力してください")),
});

export const ReportSummarySchema = v.object({
  ...reportCoverEntries,
  lineCount: v.number(),
});

/** 確認の進み具合。明細から算出します。report 側には保存しません。 */
const ReviewProgressSchema = v.object({
  approved: v.number(),
  changesRequested: v.number(),
  isFullyApproved: v.boolean(),
  pending: v.number(),
  total: v.number(),
});

/**
 * 同じ系列の版。旧版を消さずに残す設計なので、どの版を見ていて、
 * 他にどの版があるのかを画面から辿れる必要があります。
 * @see docs/adr/0009-revision-is-a-copied-report.md
 */
const SeriesVersionSchema = v.object({
  id: v.string(),
  status: ReportStatusSchema,
  version: v.number(),
});

export const ReportDetailSchema = v.object({
  ...reportCoverEntries,
  lines: v.array(ReportLineSchema),
  progress: ReviewProgressSchema,
  /** 版番号の昇順。自分自身も含みます。 */
  versions: v.array(SeriesVersionSchema),
});

export type Client = v.InferOutput<typeof ClientSchema>;
export type CreateReportInput = v.InferOutput<typeof CreateReportInputSchema>;
export type CreateReportLineInput = v.InferOutput<typeof CreateReportLineInputSchema>;
export type RequestChangesInput = v.InferOutput<typeof RequestChangesInputSchema>;
export type ReportDetail = v.InferOutput<typeof ReportDetailSchema>;
export type ReportLine = v.InferOutput<typeof ReportLineSchema>;
export type ReportStatus = v.InferOutput<typeof ReportStatusSchema>;
export type ReportSummary = v.InferOutput<typeof ReportSummarySchema>;
export type SeriesVersion = v.InferOutput<typeof SeriesVersionSchema>;
