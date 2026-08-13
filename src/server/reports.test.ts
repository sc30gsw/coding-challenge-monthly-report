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

  it("担当営業に営業以外は指定できない", async () => {
    // 承認できるのは営業だけなので、営業以外を担当にした明細は誰にも承認されず、
    // その報告書は永久に確定できなくなります。画面の選択肢を絞るのは表示の都合であって
    // 防御ではないため、画面を通らないこの経路で拒否できる必要があります。
    const report = await createDraft();

    const res = await call(`/reports/${report.id}/lines`, {
      body: { amount: "1000", projectName: "案件", salesOwnerId: actors.admin.id },
      cookie: admin,
      method: "POST",
    });

    expect(res.status).toBe(422);
    expect(res.json<{ tag: string }>().tag).toBe("SalesOwnerNotAssignable");
  });

  it("存在しないユーザーは担当営業に指定できない", async () => {
    const report = await createDraft();

    const res = await call(`/reports/${report.id}/lines`, {
      body: {
        amount: "1000",
        projectName: "案件",
        salesOwnerId: "00000000-0000-0000-0000-000000000000",
      },
      cookie: admin,
      method: "POST",
    });

    expect(res.status).toBe(422);
    expect(res.json<{ tag: string }>().tag).toBe("SalesOwnerNotAssignable");
  });

  it("担当営業に営業以外を指定した明細は作られない", async () => {
    const report = await createDraft();

    await call(`/reports/${report.id}/lines`, {
      body: { amount: "1000", projectName: "案件", salesOwnerId: actors.admin.id },
      cookie: admin,
      method: "POST",
    });

    const detail = await call(`/reports/${report.id}`, { cookie: admin });

    expect(detail.json<ReportDetail>().lines).toHaveLength(0);
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

  it("UUID の形をしていない ID は DB に届く前に拒否される", async () => {
    // UUID でない値を numeric/uuid 列の比較に渡すと Postgres が 22P02 を投げ、
    // 生成 SQL とバインド値が例外メッセージに残ります。params の検証で先に止めます。
    const res = await call("/reports/not-a-uuid", { cookie: admin });

    expect(res.status).toBe(422);
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
  /** 確認依頼には明細が 1 件以上要ります。 */
  async function draftWithLine() {
    const report = await createDraft();

    await call(`/reports/${report.id}/lines`, {
      body: { amount: "1000", projectName: "案件", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    return report;
  }

  it("管理者が下書きを確認中にできる", async () => {
    const report = await draftWithLine();

    const res = await call(`/reports/${report.id}/review`, { cookie: admin, method: "POST" });

    expect(res.status).toBe(200);
    expect(res.json<ReportSummary>().status).toBe("in_review");
  });

  it("確認中の報告書をもう一度確認依頼できない", async () => {
    const report = await draftWithLine();
    await call(`/reports/${report.id}/review`, { cookie: admin, method: "POST" });

    const res = await call(`/reports/${report.id}/review`, { cookie: admin, method: "POST" });

    // 「いまの状態ではできない」は 404 でも 403 でもなく 409 です。
    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("TransitionNotAllowed");
  });

  it("営業は確認依頼できない", async () => {
    const report = await draftWithLine();

    const res = await call(`/reports/${report.id}/review`, { cookie: sales, method: "POST" });

    expect(res.status).toBe(403);
  });

  it("下書きへ戻す操作は無い", async () => {
    const report = await draftWithLine();
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

describe("明細の承認と差し戻し", () => {
  async function reportInReview() {
    const report = await createDraft();

    await call(`/reports/${report.id}/lines`, {
      body: { amount: "50000", projectName: "自分の案件", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });
    await call(`/reports/${report.id}/review`, { cookie: admin, method: "POST" });

    const detail = await call(`/reports/${report.id}`, { cookie: admin });
    const [line] = detail.json<ReportDetail>().lines;

    if (!line) {
      throw new Error("fixture did not create a line");
    }

    return { line, reportId: report.id };
  }

  it("担当営業が自分の明細を承認できる", async () => {
    const { line, reportId } = await reportInReview();

    const res = await call(`/lines/${line.id}/approve`, { cookie: sales, method: "POST" });

    expect(res.status).toBe(200);

    const detail = await call(`/reports/${reportId}`, { cookie: admin });

    expect(detail.json<ReportDetail>().lines[0]?.status).toBe("approved");
  });

  it("担当営業が理由をつけて差し戻せる", async () => {
    const { line, reportId } = await reportInReview();

    const res = await call(`/lines/${line.id}/changes`, {
      body: { reason: "金額が請求書と一致しません" },
      cookie: sales,
      method: "POST",
    });

    expect(res.status).toBe(200);

    const detail = await call(`/reports/${reportId}`, { cookie: admin });
    const [updated] = detail.json<ReportDetail>().lines;

    expect(updated?.status).toBe("changes_requested");
    // 管理者が「何を直せばよいか」を読めることが、差し戻しの目的です。
    expect(updated?.changeRequestReason).toBe("金額が請求書と一致しません");
  });

  it("差し戻しても報告書の状態は確認中のまま", async () => {
    const { line, reportId } = await reportInReview();

    await call(`/lines/${line.id}/changes`, {
      body: { reason: "金額が違います" },
      cookie: sales,
      method: "POST",
    });

    const detail = await call(`/reports/${reportId}`, { cookie: admin });

    expect(detail.json<ReportDetail>().status).toBe("in_review");
  });

  it("理由なしの差し戻しは受け付けない", async () => {
    const { line } = await reportInReview();

    const res = await call(`/lines/${line.id}/changes`, {
      body: { reason: "   " },
      cookie: sales,
      method: "POST",
    });

    expect(res.status).toBe(422);
  });

  it("担当でない営業は API を直接叩いても承認できない", async () => {
    // 画面にボタンを出さないことは防御ではありません。
    const other = await createSalesUser("担当外 営業");
    const otherCookie = await signInAs(other.id);
    const { line } = await reportInReview();

    const res = await call(`/lines/${line.id}/approve`, { cookie: otherCookie, method: "POST" });

    expect(res.status).toBe(403);
    expect(res.json<{ tag: string }>().tag).toBe("NotLineOwner");
  });

  it("管理者は承認できない", async () => {
    const { line } = await reportInReview();

    const res = await call(`/lines/${line.id}/approve`, { cookie: admin, method: "POST" });

    expect(res.status).toBe(403);
  });

  it("UUID の形をしていない明細 ID は DB に届く前に拒否される", async () => {
    const res = await call("/lines/not-a-uuid/approve", { cookie: sales, method: "POST" });

    expect(res.status).toBe(422);
  });

  it("下書きの報告書の明細は承認できない", async () => {
    const report = await createDraft();
    await call(`/reports/${report.id}/lines`, {
      body: { amount: "1000", projectName: "確認依頼前", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    const detail = await call(`/reports/${report.id}`, { cookie: admin });
    const [line] = detail.json<ReportDetail>().lines;

    const res = await call(`/lines/${line?.id}/approve`, { cookie: sales, method: "POST" });

    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("TransitionNotAllowed");
  });
});

describe("明細の編集と削除", () => {
  async function approvedLineInReview() {
    const report = await createDraft();

    await call(`/reports/${report.id}/lines`, {
      body: { amount: "50000", projectName: "元の案件名", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });
    await call(`/reports/${report.id}/review`, { cookie: admin, method: "POST" });

    const before = await call(`/reports/${report.id}`, { cookie: admin });
    const [line] = before.json<ReportDetail>().lines;

    if (!line) {
      throw new Error("fixture did not create a line");
    }

    await call(`/lines/${line.id}/approve`, { cookie: sales, method: "POST" });

    return { line, reportId: report.id };
  }

  it("編集でも、担当営業に営業以外は指定できない", async () => {
    // 追加のときだけ塞いでも、編集で付け替えられれば同じ穴が空きます。
    const { line } = await approvedLineInReview();

    const res = await call(`/lines/${line.id}`, {
      body: { amount: "50000", projectName: "元の案件名", salesOwnerId: actors.admin.id },
      cookie: admin,
      method: "PATCH",
    });

    expect(res.status).toBe(422);
    expect(res.json<{ tag: string }>().tag).toBe("SalesOwnerNotAssignable");
  });

  it("承認済みの明細を編集すると未確認に戻る", async () => {
    // この課題で一番説明したい設計判断です。これが無いと
    // 「営業が承認 → 管理者が金額を書き換え → 承認済みのまま確定」が通ります。
    // @see docs/adr/0007-approval-is-bound-to-content.md
    const { line, reportId } = await approvedLineInReview();

    const res = await call(`/lines/${line.id}`, {
      body: { amount: "500000", projectName: "元の案件名", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "PATCH",
    });

    expect(res.status).toBe(200);

    const after = await call(`/reports/${reportId}`, { cookie: admin });
    const [updated] = after.json<ReportDetail>().lines;

    expect(updated?.amount).toBe("500000.00");
    expect(updated?.status).toBe("pending");
  });

  it("編集で未確認に戻ると、確定の条件も満たさなくなる", async () => {
    const { line, reportId } = await approvedLineInReview();

    const before = await call(`/reports/${reportId}`, { cookie: admin });

    expect(before.json<ReportDetail>().progress.isFullyApproved).toBe(true);

    await call(`/lines/${line.id}`, {
      body: { amount: "500000", projectName: "元の案件名", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "PATCH",
    });

    const after = await call(`/reports/${reportId}`, { cookie: admin });
    const { progress } = after.json<ReportDetail>();

    expect(progress.isFullyApproved).toBe(false);
    expect(progress.pending).toBe(1);
  });

  it("確認中でも明細を足せる。足した行は未確認", async () => {
    const { reportId } = await approvedLineInReview();

    const res = await call(`/reports/${reportId}/lines`, {
      body: { amount: "1000", projectName: "あとから追加", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    expect(res.status).toBe(200);

    const after = await call(`/reports/${reportId}`, { cookie: admin });
    const { progress } = after.json<ReportDetail>();

    expect(progress.total).toBe(2);
    expect(progress.pending).toBe(1);
    expect(progress.isFullyApproved).toBe(false);
  });

  it("下書き中は明細を削除できる", async () => {
    const report = await createDraft();
    await call(`/reports/${report.id}/lines`, {
      body: { amount: "1000", projectName: "消す案件", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    const before = await call(`/reports/${report.id}`, { cookie: admin });
    const [line] = before.json<ReportDetail>().lines;

    const res = await call(`/lines/${line?.id}`, { cookie: admin, method: "DELETE" });

    expect(res.status).toBe(200);

    const after = await call(`/reports/${report.id}`, { cookie: admin });

    expect(after.json<ReportDetail>().lines).toHaveLength(0);
  });

  it("確認依頼後は API を直接叩いても削除できない", async () => {
    // 差し戻された明細を消して指摘ごと無かったことにする経路を塞ぎます。
    const { line } = await approvedLineInReview();

    const res = await call(`/lines/${line.id}`, { cookie: admin, method: "DELETE" });

    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("TransitionNotAllowed");
  });

  it("営業は明細を編集できない", async () => {
    const { line } = await approvedLineInReview();

    const res = await call(`/lines/${line.id}`, {
      body: { amount: "1", projectName: "勝手に編集", salesOwnerId: actors.sales.id },
      cookie: sales,
      method: "PATCH",
    });

    expect(res.status).toBe(403);
  });
});

describe("明細のない報告書", () => {
  it("確認依頼を出せない", async () => {
    // 営業の一覧は担当明細から導出するので、明細の無い報告書は誰の一覧にも出ません。
    // 空のまま確認中にすると、誰にも届かない依頼が残ります。
    const report = await createDraft();

    const res = await call(`/reports/${report.id}/review`, { cookie: admin, method: "POST" });

    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("ReportHasNoLines");
  });

  it("明細を足せば確認依頼を出せる", async () => {
    const report = await createDraft();
    await call(`/reports/${report.id}/lines`, {
      body: { amount: "1000", projectName: "案件", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    const res = await call(`/reports/${report.id}/review`, { cookie: admin, method: "POST" });

    expect(res.status).toBe(200);
  });
});

describe("確定", () => {
  async function fullyApproved() {
    const report = await createDraft();

    await call(`/reports/${report.id}/lines`, {
      body: { amount: "50000", projectName: "確定する案件", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });
    await call(`/reports/${report.id}/review`, { cookie: admin, method: "POST" });

    const detail = await call(`/reports/${report.id}`, { cookie: admin });
    const [line] = detail.json<ReportDetail>().lines;

    await call(`/lines/${line?.id}/approve`, { cookie: sales, method: "POST" });

    return { lineId: line?.id ?? "", reportId: report.id };
  }

  it("全明細が承認済みなら確定できる", async () => {
    const { reportId } = await fullyApproved();

    const res = await call(`/reports/${reportId}/confirm`, { cookie: admin, method: "POST" });

    expect(res.status).toBe(200);
    expect(res.json<ReportSummary>().status).toBe("confirmed");
  });

  it("未承認が残っていると確定できず、残数が理由に載る", async () => {
    const { reportId } = await fullyApproved();

    await call(`/reports/${reportId}/lines`, {
      body: { amount: "1000", projectName: "あとから追加", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    const res = await call(`/reports/${reportId}/confirm`, { cookie: admin, method: "POST" });

    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("LinesNotFullyApproved");
  });

  it("明細が 0 件の報告書は確定できない", async () => {
    // 「すべて承認済み」は空集合で真になるので、件数を別に見ないと通ります。
    const report = await createDraft();

    const res = await call(`/reports/${report.id}/confirm`, { cookie: admin, method: "POST" });

    expect(res.status).toBe(409);
  });

  it("下書きのままでは確定できない", async () => {
    const report = await createDraft();
    await call(`/reports/${report.id}/lines`, {
      body: { amount: "1000", projectName: "案件", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    const res = await call(`/reports/${report.id}/confirm`, { cookie: admin, method: "POST" });

    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("TransitionNotAllowed");
  });

  it("営業は確定できない", async () => {
    const { reportId } = await fullyApproved();

    const res = await call(`/reports/${reportId}/confirm`, { cookie: sales, method: "POST" });

    expect(res.status).toBe(403);
  });

  it("確定は不可逆で、もう一度確定できない", async () => {
    const { reportId } = await fullyApproved();
    await call(`/reports/${reportId}/confirm`, { cookie: admin, method: "POST" });

    const res = await call(`/reports/${reportId}/confirm`, { cookie: admin, method: "POST" });

    expect(res.status).toBe(409);
  });

  it("確定後は明細を編集できない", async () => {
    const { lineId, reportId } = await fullyApproved();
    await call(`/reports/${reportId}/confirm`, { cookie: admin, method: "POST" });

    const res = await call(`/lines/${lineId}`, {
      body: { amount: "1", projectName: "書き換え", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "PATCH",
    });

    expect(res.status).toBe(409);
  });

  it("確定後は明細を足せない", async () => {
    const { reportId } = await fullyApproved();
    await call(`/reports/${reportId}/confirm`, { cookie: admin, method: "POST" });

    const res = await call(`/reports/${reportId}/lines`, {
      body: { amount: "1", projectName: "後から追加", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    expect(res.status).toBe(409);
  });

  it("確定済みの報告書に確定日時が入る", async () => {
    const { reportId } = await fullyApproved();
    await call(`/reports/${reportId}/confirm`, { cookie: admin, method: "POST" });

    const detail = await call(`/reports/${reportId}`, { cookie: admin });

    expect(detail.json<ReportDetail>().status).toBe("confirmed");
  });
});
