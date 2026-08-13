import { asc, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { db } from "~/db/client";
import { clients, comments, reportLines, reports, users } from "~/db/schema";
import { SEED_CLIENTS, SEED_USERS, seed } from "~/db/seed";
import type { ReportSummary } from "~/features/reports/schemas/report-schema";
import { call, signInAs } from "~/test/api";
import { confirmReport, createActors, createLine, createReport } from "~/test/fixtures";

/**
 * seed は環境再現性そのものです。採点者が clone した直後に、業務フローを
 * 作るところからではなく**触るところから**始められる必要があります。
 */

describe("やり直せること", () => {
  it("確定済みの報告書が残っていてもやり直せる", async () => {
    // 確定済み行への UPDATE / DELETE はトリガが拒みます。片付けは TRUNCATE で行います。
    // @see docs/adr/0008-immutability-enforced-in-two-layers.md
    const actors = await createActors();
    const report = await createReport({ clientId: actors.client.id });
    await createLine({ reportId: report.id, salesOwnerId: actors.sales.id });
    await confirmReport(report.id);

    await seed();

    expect((await db.select().from(users)).map((row) => row.email)).toEqual(
      SEED_USERS.map((row) => row.email),
    );
    expect((await db.select().from(clients)).map((row) => row.name)).toEqual(
      SEED_CLIENTS.map((row) => row.name),
    );
  });

  it("2 回続けて流しても、同じ並びで同じ内容になる", async () => {
    // 採点者が最初に開く画面が実行のたびに変わらないよう、`created_at` を明示しています。
    const listed = async () =>
      await db
        .select({ clientName: reports.clientName, status: reports.status })
        .from(reports)
        .orderBy(desc(reports.createdAt), asc(reports.version));

    await seed();
    const first = await listed();

    await seed();

    expect(await listed()).toEqual(first);
  });
});

describe("各状態のサンプル", () => {
  beforeEach(async () => {
    await seed();
  });

  it("全ての状態が最初から揃っている", async () => {
    const rows = await db
      .select({ status: reports.status, version: reports.version })
      .from(reports)
      .orderBy(asc(reports.createdAt));

    expect(rows.map((row) => row.status).sort()).toEqual([
      "confirmed",
      "draft",
      "draft",
      "in_review",
      "in_review",
      "superseded",
    ]);
  });

  it("確認中のうち 1 件は差し戻しを含む", async () => {
    // 確定ボタンが非活性で理由が出ている状態を、作らずに見られるようにします。
    const requested = await db
      .select({ reason: reportLines.changeRequestReason })
      .from(reportLines)
      .where(eq(reportLines.status, "changes_requested"));

    expect(requested).toHaveLength(1);
    expect(requested[0]?.reason).toBeTruthy();
  });

  it("修正版の系列があり、旧版と下書きが対になっている", async () => {
    const [superseded] = await db
      .select({ seriesId: reports.seriesId })
      .from(reports)
      .where(eq(reports.status, "superseded"));

    if (!superseded) {
      throw new Error("superseded report not seeded");
    }

    const series = await db
      .select({ status: reports.status, version: reports.version })
      .from(reports)
      .where(eq(reports.seriesId, superseded.seriesId))
      .orderBy(asc(reports.version));

    expect(series).toEqual([
      { status: "superseded", version: 1 },
      { status: "draft", version: 2 },
    ]);
  });

  it("報告書へのコメントと明細へのコメントが両方入っている", async () => {
    const rows = await db.select({ lineId: comments.lineId }).from(comments);

    expect(rows.some((row) => row.lineId === null)).toBe(true);
    expect(rows.some((row) => row.lineId !== null)).toBe(true);
  });

  it("修正版にはコメントが引き継がれていない", async () => {
    const [revision] = await db
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.version, 2));

    if (!revision) {
      throw new Error("revision not seeded");
    }

    expect(await db.select().from(comments).where(eq(comments.reportId, revision.id))).toEqual([]);
  });
});

describe("営業ごとに見えるものが違う", () => {
  beforeEach(async () => {
    await seed();
  });

  it("営業 2 人の一覧が、同じでも空でもない", async () => {
    // 「2 つのロールが同じ報告書を別の立場で操作する」を、ログインし直すだけで試せる状態にします。
    const [, sato, suzuki] = await db.select().from(users).orderBy(asc(users.createdAt));

    if (!sato || !suzuki) {
      throw new Error("sales users not seeded");
    }

    const forSato = await call("/reports", { cookie: await signInAs(sato.id) });
    const forSuzuki = await call("/reports", { cookie: await signInAs(suzuki.id) });

    const satoIds = forSato.json<ReportSummary[]>().map((row) => row.id);
    const suzukiIds = forSuzuki.json<ReportSummary[]>().map((row) => row.id);

    expect(satoIds.length).toBeGreaterThan(0);
    expect(suzukiIds.length).toBeGreaterThan(0);
    expect(satoIds).not.toEqual(suzukiIds);
  });

  it("管理者は全ての報告書を見られる", async () => {
    const [admin] = await db.select().from(users).where(eq(users.role, "admin"));

    if (!admin) {
      throw new Error("admin not seeded");
    }

    const listed = await call("/reports", { cookie: await signInAs(admin.id) });

    expect(listed.json<ReportSummary[]>()).toHaveLength(6);
  });
});
