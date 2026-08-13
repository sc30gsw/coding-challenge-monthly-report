import { Result } from "better-result";
import { and, desc, eq, exists, sql } from "drizzle-orm";

import { db } from "~/db/client";
import { clients, reportLines, reports, users } from "~/db/schema";
import {
  ClientNotFound,
  type ReportError,
  ReportNotFound,
  ReportNotVisible,
} from "~/features/reports/domain/errors";
import {
  addLine as addLineTransition,
  editLine as editLineTransition,
  removeLine as removeLineTransition,
  reviewProgress,
} from "~/features/reports/domain/line-editing";
import {
  approveLine as approveLineTransition,
  requestChanges as requestChangesTransition,
} from "~/features/reports/domain/line-transitions";
import { requestReview as requestReviewTransition } from "~/features/reports/domain/transitions";
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

async function getReportDetail(reportId: string): Promise<Result<ReportDetail, ReportError>> {
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

  return Result.ok({ ...cover, lines, progress: reviewProgress(lines) });
}

export async function addReportLine(
  reportId: string,
  input: CreateReportLineInput,
): Promise<Result<{ ok: true }, ReportError>> {
  const summary = await findSummary(reportId);

  if (!summary) {
    return Result.err(new ReportNotFound({ message: "報告書が見つかりません", reportId }));
  }

  const allowed = addLineTransition({ reportStatus: summary.status });

  if (Result.isError(allowed)) {
    return allowed;
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

type Viewer = {
  id: string;
  role: "admin" | "sales";
};

/**
 * 「自分に関係する報告書」は、担当する明細を 1 件以上含むこと、として導出します。
 * report 側に担当者を持たせないので、明細の付け替えと一覧が必ず一致します。
 * @see docs/adr/0010-sales-owner-lives-on-the-line.md
 */
function ownsAnyLine(viewerId: string) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(reportLines)
      .where(and(eq(reportLines.reportId, reports.id), eq(reportLines.salesOwnerId, viewerId))),
  );
}

export async function listReportsFor(viewer: Viewer) {
  const rows = await db
    .select(coverColumns)
    .from(reports)
    .leftJoin(reportLines, eq(reportLines.reportId, reports.id))
    .where(viewer.role === "admin" ? undefined : ownsAnyLine(viewer.id))
    .groupBy(reports.id)
    .orderBy(desc(reports.createdAt));

  return rows.map((row) => ({ ...row, targetMonth: toTargetMonth(row.targetMonth) }));
}

/**
 * 営業には、関係する報告書を**全体として**見せます。自分の明細だけに絞ると、
 * 金額合計や他の明細が見えないまま承認することになり、確認の意味が痩せます。
 * 触れるかどうかは明細単位で別に判定します（issue #6）。
 */
export async function getReportDetailFor(
  viewer: Viewer,
  reportId: string,
): Promise<Result<ReportDetail, ReportError>> {
  if (viewer.role === "sales") {
    const [visible] = await db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.id, reportId), ownsAnyLine(viewer.id)))
      .limit(1);

    if (!visible) {
      return Result.err(new ReportNotVisible({ message: "この報告書は担当外です", reportId }));
    }
  }

  return await getReportDetail(reportId);
}

/** 確認依頼。可否の判断はドメインの純粋関数が持ち、ここは永続化だけを行います。 */
export async function requestReview(reportId: string): Promise<Result<ReportSummary, ReportError>> {
  const summary = await findSummary(reportId);

  if (!summary) {
    return Result.err(new ReportNotFound({ message: "報告書が見つかりません", reportId }));
  }

  const moved = requestReviewTransition({ ...summary, lineCount: summary.lineCount });

  if (Result.isError(moved)) {
    return moved;
  }

  await db.update(reports).set({ status: moved.value.status }).where(eq(reports.id, reportId));

  const updated = await findSummary(reportId);

  return updated
    ? Result.ok(updated)
    : Result.err(new ReportNotFound({ message: "報告書が見つかりません", reportId }));
}

/** 明細と、その明細が属する報告書の状態をまとめて読みます。判定に両方が要るためです。 */
async function findLineWithReportStatus(lineId: string) {
  const [line] = await db
    .select({
      id: reportLines.id,
      reportId: reportLines.reportId,
      reportStatus: reports.status,
      salesOwnerId: reportLines.salesOwnerId,
      status: reportLines.status,
    })
    .from(reportLines)
    .innerJoin(reports, eq(reports.id, reportLines.reportId))
    .where(eq(reportLines.id, lineId))
    .limit(1);

  return line ?? null;
}

export async function approveLine(
  actor: Viewer,
  lineId: string,
): Promise<Result<{ ok: true }, ReportError>> {
  const line = await findLineWithReportStatus(lineId);

  if (!line) {
    return Result.err(new ReportNotFound({ message: "明細が見つかりません", reportId: lineId }));
  }

  const approved = approveLineTransition(line, actor);

  if (Result.isError(approved)) {
    return approved;
  }

  await db
    .update(reportLines)
    .set({ status: approved.value.status, updatedAt: new Date() })
    .where(eq(reportLines.id, lineId));

  return Result.ok({ ok: true as const });
}

export async function requestLineChanges(
  actor: Viewer,
  lineId: string,
  reason: string,
): Promise<Result<{ ok: true }, ReportError>> {
  const line = await findLineWithReportStatus(lineId);

  if (!line) {
    return Result.err(new ReportNotFound({ message: "明細が見つかりません", reportId: lineId }));
  }

  const sent = requestChangesTransition(line, actor, reason);

  if (Result.isError(sent)) {
    return sent;
  }

  await db
    .update(reportLines)
    .set({
      changeRequestReason: sent.value.changeRequestReason,
      status: sent.value.status,
      updatedAt: new Date(),
    })
    .where(eq(reportLines.id, lineId));

  return Result.ok({ ok: true as const });
}

/**
 * 明細の編集。**編集した行の確認状況は未確認に戻ります。**
 * 承認は内容に紐づくので、内容が変われば承認は失われます。
 * @see docs/adr/0007-approval-is-bound-to-content.md
 */
export async function updateReportLine(
  lineId: string,
  input: CreateReportLineInput,
): Promise<Result<{ ok: true }, ReportError>> {
  const line = await findLineWithReportStatus(lineId);

  if (!line) {
    return Result.err(new ReportNotFound({ message: "明細が見つかりません", reportId: lineId }));
  }

  const edited = editLineTransition(line);

  if (Result.isError(edited)) {
    return edited;
  }

  await db
    .update(reportLines)
    .set({
      amount: input.amount,
      projectName: input.projectName,
      salesOwnerId: input.salesOwnerId,
      status: edited.value.status,
      updatedAt: new Date(),
    })
    .where(eq(reportLines.id, lineId));

  return Result.ok({ ok: true as const });
}

/** 明細の削除。下書き中だけです。 */
export async function removeReportLine(lineId: string): Promise<Result<{ ok: true }, ReportError>> {
  const line = await findLineWithReportStatus(lineId);

  if (!line) {
    return Result.err(new ReportNotFound({ message: "明細が見つかりません", reportId: lineId }));
  }

  const removed = removeLineTransition(line);

  if (Result.isError(removed)) {
    return removed;
  }

  await db.delete(reportLines).where(eq(reportLines.id, lineId));

  return Result.ok({ ok: true as const });
}
