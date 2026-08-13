import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { db } from "~/db/client";
import { clients } from "~/db/schema";
import type { ReportDetail, ReportSummary } from "~/features/reports/schemas/report-schema";
import { call, signInAs } from "~/test/api";
import { createActors, createSalesUser } from "~/test/fixtures";

let actors: Awaited<ReturnType<typeof createActors>>;
let admin: string;
let sales: string;

beforeEach(async () => {
  actors = await createActors();
  admin = await signInAs(actors.admin.id);
  sales = await signInAs(actors.sales.id);
});

async function createDraft() {
  const res = await call("/reports", {
    body: { clientId: actors.client.id, targetMonth: "2026-08" },
    cookie: admin,
    method: "POST",
  });

  return res.json<ReportSummary>();
}

describe("Report の作成", () => {
  it("管理者が取引先と対象月を選んで下書きを作れる", async () => {
    const res = await call("/reports", {
      body: { clientId: actors.client.id, targetMonth: "2026-08" },
      cookie: admin,
      method: "POST",
    });

    expect(res.status).toBe(200);

    const report = res.json<ReportSummary>();

    expect(report.status).toBe("draft");
    expect(report.clientName).toBe(actors.client.name);
    expect(report.version).toBe(1);
    expect(report.totalAmount).toBe("0.00");
  });

  it("取引先の社名変更が、作成済みの報告書の表示を書き換えない", async () => {
    // 表紙をマスタ参照のままにすると、社名変更だけで提出済み報告書の中身が変わります。
    // 不変性の一番わかりにくい違反経路なので、作成時にコピーしています。
    const report = await createDraft();

    await db
      .update(clients)
      .set({ name: "新社名ホールディングス" })
      .where(eq(clients.id, actors.client.id));

    const after = await call(`/reports/${report.id}`, { cookie: admin });

    expect(after.json<ReportDetail>().clientName).toBe(actors.client.name);
  });

  it("宛先も取引先マスタからコピーされる", async () => {
    const report = await createDraft();

    expect(report.addressee).toBe(actors.client.defaultAddressee);
  });

  it("営業は報告書を作れない", async () => {
    const res = await call("/reports", {
      body: { clientId: actors.client.id, targetMonth: "2026-08" },
      cookie: sales,
      method: "POST",
    });

    expect(res.status).toBe(403);
  });

  it("ログインしていなければ作れない", async () => {
    const res = await call("/reports", {
      body: { clientId: actors.client.id, targetMonth: "2026-08" },
      method: "POST",
    });

    expect(res.status).toBe(401);
  });

  it("対象月の形式が不正なら受け付けない", async () => {
    const res = await call("/reports", {
      body: { clientId: actors.client.id, targetMonth: "2026/08" },
      cookie: admin,
      method: "POST",
    });

    expect(res.status).toBe(422);
  });
});

describe("明細の追加", () => {
  it("案件名・金額・担当営業で明細を足せる", async () => {
    const report = await createDraft();

    const res = await call(`/reports/${report.id}/lines`, {
      body: { amount: "120000", projectName: "サイト改修", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    expect(res.status).toBe(200);

    const detail = await call(`/reports/${report.id}`, { cookie: admin });
    const [line] = detail.json<ReportDetail>().lines;

    expect(line?.projectName).toBe("サイト改修");
    expect(line?.status).toBe("pending");
    expect(line?.salesOwner.name).toBe(actors.sales.name);
  });

  it("営業は明細を足せない", async () => {
    const report = await createDraft();

    const res = await call(`/reports/${report.id}/lines`, {
      body: { amount: "1", projectName: "勝手に追加", salesOwnerId: actors.sales.id },
      cookie: sales,
      method: "POST",
    });

    expect(res.status).toBe(403);
  });

  it("金額が数値として読めなければ受け付けない", async () => {
    const report = await createDraft();

    const res = await call(`/reports/${report.id}/lines`, {
      body: { amount: "たくさん", projectName: "案件", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    expect(res.status).toBe(422);
  });
});

describe("金額合計", () => {
  it("明細から算出される", async () => {
    const report = await createDraft();

    for (const amount of ["100000.50", "23000.25"]) {
      await call(`/reports/${report.id}/lines`, {
        body: { amount, projectName: `案件 ${amount}`, salesOwnerId: actors.sales.id },
        cookie: admin,
        method: "POST",
      });
    }

    const list = await call("/reports", { cookie: admin });
    const [summary] = list.json<ReportSummary[]>();

    expect(summary?.totalAmount).toBe("123000.75");
    expect(summary?.lineCount).toBe(2);
  });
});

describe("一覧と詳細", () => {
  it("管理者の一覧には全ての報告書が並ぶ", async () => {
    await createDraft();
    await call("/reports", {
      body: { clientId: actors.client.id, targetMonth: "2026-09" },
      cookie: admin,
      method: "POST",
    });

    const res = await call("/reports", { cookie: admin });
    const list = res.json<ReportSummary[]>();

    expect(list).toHaveLength(2);
    expect(list.map((report) => report.targetMonth)).toEqual(
      expect.arrayContaining(["2026-08", "2026-09"]),
    );
  });

  it("詳細に表紙と明細が揃う", async () => {
    const report = await createDraft();
    await call(`/reports/${report.id}/lines`, {
      body: { amount: "500", projectName: "保守", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    const res = await call(`/reports/${report.id}`, { cookie: admin });
    const detail = res.json<ReportDetail>();

    expect(detail.clientName).toBe(actors.client.name);
    expect(detail.targetMonth).toBe("2026-08");
    expect(detail.totalAmount).toBe("500.00");
    expect(detail.lines).toHaveLength(1);
  });

  it("存在しない報告書は 404", async () => {
    const res = await call("/reports/00000000-0000-0000-0000-000000000000", { cookie: admin });

    expect(res.status).toBe(404);
  });
});

describe("拒否の理由", () => {
  // 理由をタグで返すのは、UI が文字列マッチで分岐しないようにするためです。
  // 状態遷移の拒否が増えても、この形のまま扱えます。
  it("報告書が無いとき ReportNotFound を返す", async () => {
    const res = await call("/reports/00000000-0000-0000-0000-000000000000", { cookie: admin });

    expect(res.json<{ tag: string }>().tag).toBe("ReportNotFound");
  });

  it("取引先が無いとき ClientNotFound を返す", async () => {
    const res = await call("/reports", {
      body: { clientId: "00000000-0000-0000-0000-000000000000", targetMonth: "2026-08" },
      cookie: admin,
      method: "POST",
    });

    expect(res.status).toBe(404);
    expect(res.json<{ tag: string }>().tag).toBe("ClientNotFound");
  });
});

describe("確認依頼", () => {
  it("管理者が下書きを確認中にできる", async () => {
    const report = await createDraft();

    const res = await call(`/reports/${report.id}/review`, { cookie: admin, method: "POST" });

    expect(res.status).toBe(200);
    expect(res.json<ReportSummary>().status).toBe("in_review");
  });

  it("確認中の報告書をもう一度確認依頼できない", async () => {
    const report = await createDraft();
    await call(`/reports/${report.id}/review`, { cookie: admin, method: "POST" });

    const res = await call(`/reports/${report.id}/review`, { cookie: admin, method: "POST" });

    // 「いまの状態ではできない」は 404 でも 403 でもなく 409 です。
    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("TransitionNotAllowed");
  });

  it("営業は確認依頼できない", async () => {
    const report = await createDraft();

    const res = await call(`/reports/${report.id}/review`, { cookie: sales, method: "POST" });

    expect(res.status).toBe(403);
  });

  it("下書きへ戻す操作は無い", async () => {
    const report = await createDraft();
    await call(`/reports/${report.id}/review`, { cookie: admin, method: "POST" });

    const res = await call(`/reports/${report.id}/draft`, { cookie: admin, method: "POST" });

    expect(res.status).toBe(404);
  });
});

describe("営業から見える範囲", () => {
  it("自分が担当する明細を含む報告書だけが一覧に出る", async () => {
    const other = await createSalesUser("担当外 営業");

    const mine = await createDraft();
    await call(`/reports/${mine.id}/lines`, {
      body: { amount: "1000", projectName: "自分の案件", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    const theirs = await createDraft();
    await call(`/reports/${theirs.id}/lines`, {
      body: { amount: "2000", projectName: "他人の案件", salesOwnerId: other.id },
      cookie: admin,
      method: "POST",
    });

    const res = await call("/reports", { cookie: sales });
    const list = res.json<ReportSummary[]>();

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(mine.id);
  });

  it("担当外の報告書は API を直接叩いても読めない", async () => {
    // 画面に出さないことは防御ではありません。拒否するのはサーバーです。
    const other = await createSalesUser("担当外 営業");
    const theirs = await createDraft();
    await call(`/reports/${theirs.id}/lines`, {
      body: { amount: "2000", projectName: "他人の案件", salesOwnerId: other.id },
      cookie: admin,
      method: "POST",
    });

    const res = await call(`/reports/${theirs.id}`, { cookie: sales });

    expect(res.status).toBe(403);
    expect(res.json<{ tag: string }>().tag).toBe("ReportNotVisible");
  });

  it("関係する報告書は、他人の明細も含めて全体を読める", async () => {
    // 自分の行だけに絞ると、金額合計が何を指すのか分からないまま承認することになります。
    const other = await createSalesUser("同僚 営業");
    const report = await createDraft();

    for (const [projectName, ownerId] of [
      ["自分の案件", actors.sales.id],
      ["同僚の案件", other.id],
    ] as const) {
      await call(`/reports/${report.id}/lines`, {
        body: { amount: "5000", projectName, salesOwnerId: ownerId },
        cookie: admin,
        method: "POST",
      });
    }

    const res = await call(`/reports/${report.id}`, { cookie: sales });
    const detail = res.json<ReportDetail>();

    expect(res.status).toBe(200);
    expect(detail.lines).toHaveLength(2);
    expect(detail.totalAmount).toBe("10000.00");
  });

  it("管理者の一覧は担当に関わらず全件", async () => {
    const other = await createSalesUser("担当外 営業");
    const report = await createDraft();
    await call(`/reports/${report.id}/lines`, {
      body: { amount: "2000", projectName: "他人の案件", salesOwnerId: other.id },
      cookie: admin,
      method: "POST",
    });

    const res = await call("/reports", { cookie: admin });

    expect(res.json<ReportSummary[]>()).toHaveLength(1);
  });
});
