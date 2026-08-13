import * as v from "valibot";

/**
 * サーバーのルート定義・OpenAPI・フォームが共有する唯一の定義です。
 * 二重に書くと必ずずれ、ずれは業務ルールの穴になります。
 * @see docs/adr/0004-valibot-and-formisch-for-forms.md
 */

export const ReportStatusSchema = v.picklist(["draft", "in_review", "confirmed", "superseded"]);

export const ReportLineStatusSchema = v.picklist(["pending", "approved", "changes_requested"]);

/** 対象月は月単位です。日は業務上の意味を持たないので受け取りません。 */
export const TargetMonthSchema = v.pipe(
  v.string(),
  v.regex(/^\d{4}-(0[1-9]|1[0-2])$/, "対象月は YYYY-MM の形式で指定してください"),
);

/**
 * 金額は文字列で扱います。丸め誤差が出る型で取引先に出す数字を持ちたくないためで、
 * DB 側も numeric(14,2) です。
 */
export const AmountSchema = v.pipe(
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

export const ReportLineSchema = v.object({
  amount: v.string(),
  changeRequestReason: v.nullable(v.string()),
  id: v.string(),
  projectName: v.string(),
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

export const ReportSummarySchema = v.object({
  ...reportCoverEntries,
  lineCount: v.number(),
});

export const ReportDetailSchema = v.object({
  ...reportCoverEntries,
  lines: v.array(ReportLineSchema),
});

export type Client = v.InferOutput<typeof ClientSchema>;
export type CreateReportInput = v.InferOutput<typeof CreateReportInputSchema>;
export type CreateReportLineInput = v.InferOutput<typeof CreateReportLineInputSchema>;
export type ReportDetail = v.InferOutput<typeof ReportDetailSchema>;
export type ReportLine = v.InferOutput<typeof ReportLineSchema>;
export type ReportStatus = v.InferOutput<typeof ReportStatusSchema>;
export type ReportSummary = v.InferOutput<typeof ReportSummarySchema>;
