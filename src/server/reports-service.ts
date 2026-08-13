import { Result } from "better-result";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "~/db/client";
import { clients, reportLines, reports, users } from "~/db/schema";
import { ClientNotFound, type ReportError, ReportNotFound } from "~/features/reports/domain/errors";
import type {
  CreateReportInput,
  CreateReportLineInput,
  ReportDetail,
  ReportSummary,
} from "~/features/reports/schemas/report-schema";

/**
 * 報告書の読み書きです。**「できない」は Result で返し、throw しません。**
 * ルート側はタグを見て HTTP のステータスに写すだけになります。
 * @see docs/adr/0005-better-result-for-expected-failures.md
 */

/** DB は月初日で持ち、外向きには月だけを見せます。日には業務上の意味がありません。 */
function toTargetMonth(stored: string) {
  return stored.slice(0, 7);
}

/**
 * 金額合計は明細から算出します。report 側には保存しません。
 * 保存すると「明細を直したのに合計の更新を忘れる」経路が増えるだけだからです。
 * 明細が無いときの 0 も含め、常に小数 2 桁で返します。桁の揺れは表示側のバグになります。
 */
const totalAmount = sql<string>`coalesce(sum(${reportLines.amount}), 0)::numeric(14,2)::text`;
const lineCount = sql<number>`count(${reportLines.id})::int`;

const coverColumns = {
  addressee: reports.addressee,
  clientName: reports.clientName,
  id: reports.id,
  lineCount,
  status: reports.status,
  targetMonth: reports.targetMonth,
  totalAmount,
  version: reports.version,
};

async function findSummary(reportId: string) {
  const [summary] = await db
    .select(coverColumns)
    .from(reports)
    .leftJoin(reportLines, eq(reportLines.reportId, reports.id))
    .where(eq(reports.id, reportId))
    .groupBy(reports.id);

  return summary ? { ...summary, targetMonth: toTargetMonth(summary.targetMonth) } : null;
}

export async function listReports() {
  const rows = await db
    .select(coverColumns)
    .from(reports)
    .leftJoin(reportLines, eq(reportLines.reportId, reports.id))
    .groupBy(reports.id)
    .orderBy(desc(reports.createdAt));

  return rows.map((row) => ({ ...row, targetMonth: toTargetMonth(row.targetMonth) }));
}

export async function listClients() {
  return await db
    .select({ defaultAddressee: clients.defaultAddressee, id: clients.id, name: clients.name })
    .from(clients)
    .orderBy(clients.name);
}

/**
 * 戻り値の型を明示しています。Ok と Err の合併のままだと `Result.isError` で
 * 絞り込めず、呼び出し側が `.value` を読めません。
 */
export async function createReport(
  input: CreateReportInput,
): Promise<Result<ReportSummary, ReportError>> {
  const [client] = await db
    .select({ defaultAddressee: clients.defaultAddressee, name: clients.name })
    .from(clients)
    .where(eq(clients.id, input.clientId))
    .limit(1);

  if (!client) {
    return Result.err(
      new ClientNotFound({ clientId: input.clientId, message: "取引先が見つかりません" }),
    );
  }

  const id = crypto.randomUUID();

  await db.insert(reports).values({
    // 取引先名と宛先はここでコピーします。マスタの改名で確定済み報告書の
    // 表示が変わらないようにするためです。
    // @see docs/adr/0014-client-master-with-copied-cover-fields.md
    addressee: client.defaultAddressee,
    clientId: input.clientId,
    clientName: client.name,
    id,
    seriesId: id,
    targetMonth: `${input.targetMonth}-01`,
  });

  const summary = await findSummary(id);

  return summary
    ? Result.ok(summary)
    : Result.err(new ReportNotFound({ message: "作成した報告書を読み出せません", reportId: id }));
}

export async function getReportDetail(
  reportId: string,
): Promise<Result<ReportDetail, ReportError>> {
  const summary = await findSummary(reportId);

  if (!summary) {
    return Result.err(new ReportNotFound({ message: "報告書が見つかりません", reportId }));
  }

  const lines = await db
    .select({
      amount: reportLines.amount,
      changeRequestReason: reportLines.changeRequestReason,
      id: reportLines.id,
      projectName: reportLines.projectName,
      salesOwner: { id: users.id, name: users.name },
      status: reportLines.status,
    })
    .from(reportLines)
    .innerJoin(users, eq(users.id, reportLines.salesOwnerId))
    .where(eq(reportLines.reportId, reportId))
    .orderBy(reportLines.position, reportLines.createdAt);

  const { lineCount: _lineCount, ...cover } = summary;

  return Result.ok({ ...cover, lines });
}

export async function addReportLine(
  reportId: string,
  input: CreateReportLineInput,
): Promise<Result<{ ok: true }, ReportError>> {
  const summary = await findSummary(reportId);

  if (!summary) {
    return Result.err(new ReportNotFound({ message: "報告書が見つかりません", reportId }));
  }

  await db.insert(reportLines).values({
    amount: input.amount,
    position: summary.lineCount,
    projectName: input.projectName,
    reportId,
    salesOwnerId: input.salesOwnerId,
  });

  return Result.ok({ ok: true as const });
}
