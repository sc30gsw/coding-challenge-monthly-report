import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "~/db/client";
import { clients, reportLines, reports, users } from "~/db/schema";

type ReportStatus = "draft" | "in_review" | "confirmed" | "superseded";
type LineStatus = "pending" | "approved" | "changes_requested";

/** テストが自分の状態を組み立てるための最小の道具立てです。seed は再利用しません。 */
export async function createActors() {
  const [admin] = await db
    .insert(users)
    .values({ email: `admin-${randomUUID()}@example.com`, name: "管理 太郎", role: "admin" })
    .returning();
  const [sales] = await db
    .insert(users)
    .values({ email: `sales-${randomUUID()}@example.com`, name: "営業 花子", role: "sales" })
    .returning();
  const [client] = await db
    .insert(clients)
    .values({ defaultAddressee: "経理部 御中", name: "株式会社サンプル" })
    .returning();

  if (!admin || !sales || !client) {
    throw new Error("fixture insert returned no row");
  }

  return { admin, client, sales };
}

type CreateReportOptions = {
  clientId: string;
  seriesId?: string;
  status?: ReportStatus;
  targetMonth?: string;
  version?: number;
};

/**
 * Report を 1 件作ります。
 *
 * `confirmed` / `superseded` は直接 INSERT します。トリガが拒むのは UPDATE と DELETE なので、
 * 確定済みの状態を用意すること自体は妨げられません。
 */
export async function createReport({
  clientId,
  seriesId,
  status = "draft",
  targetMonth = "2026-08-01",
  version = 1,
}: CreateReportOptions) {
  const id = randomUUID();
  const [report] = await db
    .insert(reports)
    .values({
      addressee: "経理部 御中",
      clientId,
      clientName: "株式会社サンプル",
      confirmedAt: status === "confirmed" || status === "superseded" ? new Date() : null,
      id,
      seriesId: seriesId ?? id,
      status,
      targetMonth,
      version,
    })
    .returning();

  if (!report) {
    throw new Error("fixture insert returned no row");
  }

  return report;
}

/**
 * 明細を入れ終えた Report を確定します。
 *
 * 確定済みの Report には明細を足せない（トリガが拒む）ので、テストも業務と同じ順序
 * ——下書きで明細を揃えてから確定する——で組み立てる必要があります。
 */
export async function confirmReport(reportId: string) {
  await db
    .update(reports)
    .set({ confirmedAt: new Date(), status: "confirmed" })
    .where(eq(reports.id, reportId));
}

type CreateLineOptions = {
  amount?: string;
  changeRequestReason?: string | null;
  projectName?: string;
  reportId: string;
  salesOwnerId: string;
  status?: LineStatus;
};

export async function createLine({
  amount = "100000.00",
  changeRequestReason = null,
  projectName = "案件A",
  reportId,
  salesOwnerId,
  status = "pending",
}: CreateLineOptions) {
  const [line] = await db
    .insert(reportLines)
    .values({ amount, changeRequestReason, projectName, reportId, salesOwnerId, status })
    .returning();

  if (!line) {
    throw new Error("fixture insert returned no row");
  }

  return line;
}
