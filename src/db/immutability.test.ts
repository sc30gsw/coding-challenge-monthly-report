import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { db } from "~/db/client";
import { reportLines, reports } from "~/db/schema";
import { expectRejection } from "~/test/db";
import { confirmReport, createActors, createLine, createReport } from "~/test/fixtures";

/**
 * ここで試すのは、アプリ層が決して発行しない書き込みです。
 *
 * 「確定後は変更できない」をドメイン層のガードだけで守ると、保証はコードレビューの
 * 注意力に依存します。アプリを迂回しても崩れないことを示せて初めて、宣言した業務ルールが
 * 守られていると言えます。
 *
 * @see docs/adr/0008-immutability-enforced-in-two-layers.md
 */

/** 確定後の不変性トリガが使う SQLSTATE。 */
const BUSINESS_RULE = "BR001";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

let actors: Awaited<ReturnType<typeof createActors>>;

beforeEach(async () => {
  actors = await createActors();
});

describe("確定済み Report の不変性", () => {
  it("表紙を書き換えられない", async () => {
    const report = await createReport({ clientId: actors.client.id, status: "confirmed" });

    const error = await expectRejection(() =>
      db.update(reports).set({ clientName: "書き換え" }).where(eq(reports.id, report.id)),
    );

    expect(error.code).toBe(BUSINESS_RULE);
    expect(error.message).toMatch(/cannot be modified/);
  });

  it("削除できない", async () => {
    const report = await createReport({ clientId: actors.client.id, status: "confirmed" });

    const error = await expectRejection(() => db.delete(reports).where(eq(reports.id, report.id)));

    expect(error.code).toBe(BUSINESS_RULE);
    expect(error.message).toMatch(/cannot be deleted/);
  });

  it("明細の金額を書き換えられない", async () => {
    const report = await createReport({ clientId: actors.client.id });
    const line = await createLine({
      reportId: report.id,
      salesOwnerId: actors.sales.id,
      status: "approved",
    });
    await confirmReport(report.id);

    const error = await expectRejection(() =>
      db.update(reportLines).set({ amount: "999999.00" }).where(eq(reportLines.id, line.id)),
    );

    expect(error.code).toBe(BUSINESS_RULE);
    expect(error.message).toMatch(/its lines cannot be modified/);
  });

  it("明細を足せない", async () => {
    const report = await createReport({ clientId: actors.client.id, status: "confirmed" });

    const error = await expectRejection(() =>
      createLine({ projectName: "後から追加", reportId: report.id, salesOwnerId: actors.sales.id }),
    );

    expect(error.code).toBe(BUSINESS_RULE);
  });

  it("明細を削除できない", async () => {
    const report = await createReport({ clientId: actors.client.id });
    const line = await createLine({ reportId: report.id, salesOwnerId: actors.sales.id });
    await confirmReport(report.id);

    const error = await expectRejection(() =>
      db.delete(reportLines).where(eq(reportLines.id, line.id)),
    );

    expect(error.code).toBe(BUSINESS_RULE);
  });

  it("明細を下書きへ付け替えて中身を抜けない", async () => {
    // 移動先だけを検査していると、確定済み報告書から明細を持ち出せてしまいます。
    const confirmed = await createReport({ clientId: actors.client.id });
    const draft = await createReport({ clientId: actors.client.id, targetMonth: "2026-09-01" });
    const line = await createLine({ reportId: confirmed.id, salesOwnerId: actors.sales.id });
    await confirmReport(confirmed.id);

    const error = await expectRejection(() =>
      db.update(reportLines).set({ reportId: draft.id }).where(eq(reportLines.id, line.id)),
    );

    expect(error.code).toBe(BUSINESS_RULE);
    expect(error.message).toMatch(/its lines cannot be modified/);
  });
});

describe("修正版への遷移", () => {
  it("後継の版が無ければ superseded にできない", async () => {
    const report = await createReport({ clientId: actors.client.id, status: "confirmed" });

    const error = await expectRejection(() =>
      db.update(reports).set({ status: "superseded" }).where(eq(reports.id, report.id)),
    );

    expect(error.code).toBe(BUSINESS_RULE);
    expect(error.message).toMatch(/without a successor version/);
  });

  it("後継の版を作ってからなら superseded にできる", async () => {
    const first = await createReport({ clientId: actors.client.id, status: "confirmed" });
    await createReport({ clientId: actors.client.id, seriesId: first.seriesId, version: 2 });

    await db.update(reports).set({ status: "superseded" }).where(eq(reports.id, first.id));

    const [updated] = await db.select().from(reports).where(eq(reports.id, first.id));

    expect(updated?.status).toBe("superseded");
  });

  it("同じ系列に進行中の版を 2 つ作れない", async () => {
    const first = await createReport({ clientId: actors.client.id, status: "confirmed" });
    await createReport({ clientId: actors.client.id, seriesId: first.seriesId, version: 2 });

    const error = await expectRejection(() =>
      createReport({ clientId: actors.client.id, seriesId: first.seriesId, version: 3 }),
    );

    expect(error.code).toBe(UNIQUE_VIOLATION);
    expect(error.constraint).toBe("reports_one_open_version_per_series");
  });
});

describe("下書き中は自由に編集できる", () => {
  it("明細を削除できる", async () => {
    const report = await createReport({ clientId: actors.client.id });
    const line = await createLine({ reportId: report.id, salesOwnerId: actors.sales.id });

    await db.delete(reportLines).where(eq(reportLines.id, line.id));

    const remaining = await db
      .select()
      .from(reportLines)
      .where(eq(reportLines.reportId, report.id));

    expect(remaining).toHaveLength(0);
  });
});

describe("差し戻し理由", () => {
  it("理由なしに差し戻せない", async () => {
    const report = await createReport({ clientId: actors.client.id, status: "in_review" });

    const error = await expectRejection(() =>
      createLine({
        reportId: report.id,
        salesOwnerId: actors.sales.id,
        status: "changes_requested",
      }),
    );

    expect(error.code).toBe(CHECK_VIOLATION);
    expect(error.constraint).toBe("report_lines_reason_required_when_changes_requested");
  });

  it("編集で未確認に戻っても理由が残る", async () => {
    // 理由が消えると、管理者は何を直すべきか読めなくなります。
    const report = await createReport({ clientId: actors.client.id, status: "in_review" });
    const line = await createLine({
      changeRequestReason: "金額が違います",
      reportId: report.id,
      salesOwnerId: actors.sales.id,
      status: "changes_requested",
    });

    await db.update(reportLines).set({ status: "pending" }).where(eq(reportLines.id, line.id));

    const [updated] = await db.select().from(reportLines).where(eq(reportLines.id, line.id));

    expect(updated?.changeRequestReason).toBe("金額が違います");
  });
});
