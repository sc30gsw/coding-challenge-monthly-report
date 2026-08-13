import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { Comment } from "~/features/comments/schemas/comment-schema";
import type { ReportDetail, ReportSummary } from "~/features/reports/schemas/report-schema";
import { call, signInAs } from "~/test/api";
import { createActors, createSalesUser } from "~/test/fixtures";

/**
 * コメントはやりとりの記録です。報告書の中身ではないので、確定後も投稿できます。
 * 一方で「見えない報告書には触れない」という前提は共有します。
 * @see docs/adr/0011-comments-outlive-confirmation.md
 */

let actors: Awaited<ReturnType<typeof createActors>>;
let admin: string;
let sales: string;

beforeEach(async () => {
  actors = await createActors();
  admin = await signInAs(actors.admin.id);
  sales = await signInAs(actors.sales.id);
});

async function reportInReview() {
  const created = await call("/reports", {
    body: { clientId: actors.client.id, targetMonth: "2026-08" },
    cookie: admin,
    method: "POST",
  });
  const report = created.json<ReportSummary>();

  await call(`/reports/${report.id}/lines`, {
    body: { amount: "1000", projectName: "案件", salesOwnerId: actors.sales.id },
    cookie: admin,
    method: "POST",
  });
  await call(`/reports/${report.id}/review`, { cookie: admin, method: "POST" });

  const detail = await call(`/reports/${report.id}`, { cookie: admin });
  const [line] = detail.json<ReportDetail>().lines;

  return { lineId: line?.id ?? "", reportId: report.id };
}

describe("報告書へのコメント", () => {
  it("管理者と営業が同じ報告書でやりとりできる", async () => {
    const { reportId } = await reportInReview();

    await call(`/reports/${reportId}/comments`, {
      body: { body: "今月分の内容を確認してください" },
      cookie: admin,
      method: "POST",
    });
    await call(`/reports/${reportId}/comments`, {
      body: { body: "金額の根拠を教えてください" },
      cookie: sales,
      method: "POST",
    });

    const res = await call(`/reports/${reportId}/comments`, { cookie: admin });
    const list = res.json<Comment[]>();

    expect(list).toHaveLength(2);
    expect(list.map((comment) => comment.author.name)).toEqual([
      actors.admin.name,
      actors.sales.name,
    ]);
  });

  it("古い順に並ぶ", async () => {
    const { reportId } = await reportInReview();

    for (const body of ["1 番目", "2 番目"]) {
      await call(`/reports/${reportId}/comments`, {
        body: { body },
        cookie: admin,
        method: "POST",
      });
    }

    const res = await call(`/reports/${reportId}/comments`, { cookie: admin });

    expect(res.json<Comment[]>().map((comment) => comment.body)).toEqual(["1 番目", "2 番目"]);
  });

  it("空のコメントは投稿できない", async () => {
    const { reportId } = await reportInReview();

    const res = await call(`/reports/${reportId}/comments`, {
      body: { body: "   " },
      cookie: admin,
      method: "POST",
    });

    expect(res.status).toBe(422);
  });
});

describe("明細へのコメント", () => {
  it("どの明細に対するコメントかが分かる", async () => {
    const { lineId, reportId } = await reportInReview();

    await call(`/reports/${reportId}/comments`, {
      body: { body: "この案件の金額です", lineId },
      cookie: sales,
      method: "POST",
    });

    const res = await call(`/reports/${reportId}/comments`, { cookie: admin });
    const [comment] = res.json<Comment[]>();

    expect(comment?.lineId).toBe(lineId);
    expect(comment?.lineProjectName).toBe("案件");
  });

  it("他の報告書の明細を指したコメントは作れない", async () => {
    const first = await reportInReview();
    const second = await reportInReview();

    const res = await call(`/reports/${second.reportId}/comments`, {
      body: { body: "別の報告書の明細を指す", lineId: first.lineId },
      cookie: admin,
      method: "POST",
    });

    expect(res.status).toBe(404);
    expect(res.json<{ tag: string }>().tag).toBe("LineNotInReport");
  });
});

describe("見える範囲", () => {
  it("担当外の報告書にはコメントできない", async () => {
    // 見えないものには触れない、という前提を共有します。
    const other = await createSalesUser("担当外 営業");
    const otherCookie = await signInAs(other.id);
    const { reportId } = await reportInReview();

    const res = await call(`/reports/${reportId}/comments`, {
      body: { body: "担当外からの投稿" },
      cookie: otherCookie,
      method: "POST",
    });

    expect(res.status).toBe(403);
    expect(res.json<{ tag: string }>().tag).toBe("ReportNotVisible");
  });

  it("担当外の報告書のコメントは読めない", async () => {
    const other = await createSalesUser("担当外 営業");
    const otherCookie = await signInAs(other.id);
    const { reportId } = await reportInReview();

    const res = await call(`/reports/${reportId}/comments`, { cookie: otherCookie });

    expect(res.status).toBe(403);
  });

  it("ログインしていなければ読めない", async () => {
    const { reportId } = await reportInReview();

    const res = await call(`/reports/${reportId}/comments`);

    expect(res.status).toBe(401);
  });
});

describe("確定後のコメント", () => {
  it("確定済みの報告書にもコメントできる", async () => {
    // 不変性は「取引先に提出される中身」に掛かる制約です。確定後に誤りを見つけた人が
    // 経緯を残せないのは運用として成立しません。
    const { lineId, reportId } = await reportInReview();

    await call(`/lines/${lineId}/approve`, { cookie: sales, method: "POST" });
    await call(`/reports/${reportId}/confirm`, { cookie: admin, method: "POST" });

    const res = await call(`/reports/${reportId}/comments`, {
      body: { body: "確定後に誤りを見つけました" },
      cookie: sales,
      method: "POST",
    });

    expect(res.status).toBe(200);

    const listed = await call(`/reports/${reportId}/comments`, { cookie: admin });

    expect(listed.json<Comment[]>()).toHaveLength(1);
  });
});
