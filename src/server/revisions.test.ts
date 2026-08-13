import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { db } from "~/db/client";
import { reports } from "~/db/schema";
import type { Comment } from "~/features/comments/schemas/comment-schema";
import type { ReportDetail, ReportSummary } from "~/features/reports/schemas/report-schema";
import { call, signInAs } from "~/test/api";
import { createActors, createReport, createSalesUser } from "~/test/fixtures";

/**
 * 修正版。宣言した深掘り領域の本体です。
 *
 * 確定済みの報告書は書き換えません。誤りが見つかったら、元の版を残したまま
 * 新しい版を作り直します。
 * @see docs/adr/0009-revision-is-a-copied-report.md
 */

let actors: Awaited<ReturnType<typeof createActors>>;
let admin: string;
let sales: string;

beforeEach(async () => {
  actors = await createActors();
  admin = await signInAs(actors.admin.id);
  sales = await signInAs(actors.sales.id);
});

/** 業務と同じ順序で組み立てます。確定済みに明細は足せないためです。 */
async function confirmed({ lines = ["案件A"] }: { lines?: string[] } = {}) {
  const created = await call("/reports", {
    body: { clientId: actors.client.id, targetMonth: "2026-08" },
    cookie: admin,
    method: "POST",
  });
  const reportId = created.json<ReportSummary>().id;

  for (const projectName of lines) {
    await call(`/reports/${reportId}/lines`, {
      body: { amount: "1000", projectName, salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });
  }

  await call(`/reports/${reportId}/review`, { cookie: admin, method: "POST" });

  const detail = await call(`/reports/${reportId}`, { cookie: admin });

  for (const line of detail.json<ReportDetail>().lines) {
    await call(`/lines/${line.id}/approve`, { cookie: sales, method: "POST" });
  }

  await call(`/reports/${reportId}/confirm`, { cookie: admin, method: "POST" });

  return reportId;
}

async function createRevision(reportId: string) {
  return await call(`/reports/${reportId}/revisions`, { cookie: admin, method: "POST" });
}

/**
 * 修正版の INSERT が一意インデックスの解決待ちに入るまで待ちます。
 *
 * 時間で待つとテストが不安定になるので、DB が実際にロック待ちに入ったことを条件にします。
 */
async function waitForBlockedInsert() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const blocked = await db.execute<{ count: number }>(sql`
      select count(*)::int as count from pg_stat_activity
      where wait_event_type = 'Lock' and query ilike 'insert into "reports"%'
    `);

    if ((blocked.rows[0]?.count ?? 0) > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("insert never blocked on the unique index");
}

describe("修正版の作成", () => {
  it("確定済みの報告書から作れる", async () => {
    const reportId = await confirmed();

    const res = await createRevision(reportId);

    expect(res.status).toBe(200);
    expect(res.json<ReportSummary>().version).toBe(2);
    expect(res.json<ReportSummary>().status).toBe("draft");
  });

  it("元の版とは別の報告書として作られる", async () => {
    const reportId = await confirmed();

    const revision = await createRevision(reportId);

    expect(revision.json<ReportSummary>().id).not.toBe(reportId);
  });

  it("表紙は引き継がれる", async () => {
    // 取引先名と宛先は版ごとにコピーされます。マスタ参照にすると旧版の表示まで変わります。
    const reportId = await confirmed();
    const before = await call(`/reports/${reportId}`, { cookie: admin });

    const revision = await createRevision(reportId);
    const after = await call(`/reports/${revision.json<ReportSummary>().id}`, { cookie: admin });

    expect(after.json<ReportDetail>().clientName).toBe(before.json<ReportDetail>().clientName);
    expect(after.json<ReportDetail>().addressee).toBe(before.json<ReportDetail>().addressee);
    expect(after.json<ReportDetail>().targetMonth).toBe(before.json<ReportDetail>().targetMonth);
  });

  it("明細が複製され、未確認から始まる", async () => {
    // 版ごとに承認を取り直します。前の版の承認を引き継ぐと、
    // 直した内容を誰も見ないまま確定できてしまいます。
    const reportId = await confirmed({ lines: ["案件A", "案件B"] });

    const revision = await createRevision(reportId);
    const detail = await call(`/reports/${revision.json<ReportSummary>().id}`, { cookie: admin });

    expect(detail.json<ReportDetail>().lines.map((line) => line.projectName)).toEqual([
      "案件A",
      "案件B",
    ]);
    expect(detail.json<ReportDetail>().lines.every((line) => line.status === "pending")).toBe(true);
  });

  it("担当営業も引き継がれる", async () => {
    const reportId = await confirmed();

    const revision = await createRevision(reportId);
    const detail = await call(`/reports/${revision.json<ReportSummary>().id}`, { cookie: admin });

    expect(detail.json<ReportDetail>().lines[0]?.salesOwner.id).toBe(actors.sales.id);
  });

  it("コメントは複製されない", async () => {
    // やりとりは版ごとの記録です。前の版の指摘を新しい版へ持ち込むと、
    // どの版に対する指摘なのかが読めなくなります。
    const reportId = await confirmed();
    await call(`/reports/${reportId}/comments`, {
      body: { body: "前の版への指摘" },
      cookie: admin,
      method: "POST",
    });

    const revision = await createRevision(reportId);
    const comments = await call(`/reports/${revision.json<ReportSummary>().id}/comments`, {
      cookie: admin,
    });

    expect(comments.json<Comment[]>()).toHaveLength(0);
  });
});

describe("元の版", () => {
  it("旧版になる", async () => {
    const reportId = await confirmed();

    await createRevision(reportId);
    const detail = await call(`/reports/${reportId}`, { cookie: admin });

    expect(detail.json<ReportDetail>().status).toBe("superseded");
  });

  it("旧版になっても中身はそのまま読める", async () => {
    const reportId = await confirmed({ lines: ["案件A"] });

    await createRevision(reportId);
    const detail = await call(`/reports/${reportId}`, { cookie: admin });

    expect(detail.json<ReportDetail>().lines.map((line) => line.projectName)).toEqual(["案件A"]);
    expect(detail.json<ReportDetail>().lines.every((line) => line.status === "approved")).toBe(
      true,
    );
  });

  it("旧版の明細は編集できない", async () => {
    const reportId = await confirmed();
    const before = await call(`/reports/${reportId}`, { cookie: admin });
    const lineId = before.json<ReportDetail>().lines[0]?.id ?? "";

    await createRevision(reportId);
    const res = await call(`/lines/${lineId}`, {
      body: { amount: "9999", projectName: "書き換え", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "PATCH",
    });

    expect(res.status).toBe(409);
  });

  it("旧版に明細を足せない", async () => {
    const reportId = await confirmed();

    await createRevision(reportId);
    const res = await call(`/reports/${reportId}/lines`, {
      body: { amount: "1", projectName: "後から追加", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    expect(res.status).toBe(409);
  });

  it("旧版の報告書そのものも書き換えられない", async () => {
    // 明細だけでなく、表紙の行にもトリガが効き続けることを確かめます。
    const reportId = await confirmed();
    await createRevision(reportId);

    const rewrite = async () =>
      await db.update(reports).set({ clientName: "書き換え" }).where(eq(reports.id, reportId));

    await expect(rewrite()).rejects.toMatchObject({
      cause: { message: expect.stringContaining("cannot be modified") },
    });
  });

  it("旧版は削除できない", async () => {
    const reportId = await confirmed();
    await createRevision(reportId);

    const remove = async () => await db.delete(reports).where(eq(reports.id, reportId));

    await expect(remove()).rejects.toMatchObject({
      cause: { message: expect.stringContaining("cannot be deleted") },
    });
  });

  it("旧版からは修正版を作れない", async () => {
    const reportId = await confirmed();
    await createRevision(reportId);

    const res = await createRevision(reportId);

    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("TransitionNotAllowed");
  });
});

describe("作れない場合", () => {
  it("下書きからは作れない", async () => {
    const created = await call("/reports", {
      body: { clientId: actors.client.id, targetMonth: "2026-08" },
      cookie: admin,
      method: "POST",
    });

    const res = await createRevision(created.json<ReportSummary>().id);

    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("TransitionNotAllowed");
  });

  it("営業は作れない", async () => {
    const reportId = await confirmed();

    const res = await call(`/reports/${reportId}/revisions`, { cookie: sales, method: "POST" });

    expect(res.status).toBe(403);
  });

  it("存在しない報告書には作れない", async () => {
    const res = await createRevision("00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(404);
  });
});

describe("同じ系列で 2 つの版は並走しない", () => {
  it("進行中の版があるうちは、次の修正版を作れない", async () => {
    // 修正版が 2 つ並走すると、どちらが正なのかが決まりません。
    const reportId = await confirmed();
    const revision = await createRevision(reportId);
    const revisionId = revision.json<ReportSummary>().id;

    // 旧版はもう作れないので、進行中の版そのものから作ろうとします。
    const res = await createRevision(revisionId);

    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("TransitionNotAllowed");
  });

  it("DB の部分ユニークが、アプリを迂回した並走も拒否する", async () => {
    // アプリ層の判定は最後の砦ではありません。直接 INSERT でも止まることを示します。
    const reportId = await confirmed();
    const revision = await createRevision(reportId);
    const [source] = await db.select().from(reports).where(eq(reports.id, reportId));

    if (!source) {
      throw new Error("report not found");
    }

    const insertSecondOpenVersion = async () =>
      await db.insert(reports).values({
        addressee: source.addressee,
        clientId: source.clientId,
        clientName: source.clientName,
        id: randomUUID(),
        seriesId: source.seriesId,
        status: "draft",
        targetMonth: source.targetMonth,
        version: revision.json<ReportSummary>().version + 1,
      });

    // どのインデックスが拒否したのかまで見ます。ただ落ちたことではなく、
    // 「進行中の版は系列に 1 つ」という制約が効いたことを示したいためです。
    await expect(insertSecondOpenVersion()).rejects.toMatchObject({
      cause: { constraint: "reports_one_open_version_per_series" },
    });
  });

  it("2 人が同時に押しても、片方だけが成功する", async () => {
    const reportId = await confirmed();

    const [first, second] = await Promise.all([createRevision(reportId), createRevision(reportId)]);

    // どちらが勝つかも、負けた側に付く理由も、タイミング次第で変わります。
    // 保証するのは「修正版は 1 つだけ作られ、もう片方は理由つきで断られる」ことです。
    expect([first?.status, second?.status].sort()).toEqual([200, 409]);
  });

  it("DB が並走を止めたとき、500 ではなく理由の付いた拒否になる", async () => {
    // 事前の判定と INSERT の間に他の版が割り込む窓は、実運用では開きます。
    // その窓を、コミットしない版を握ったまま再現します。
    const reportId = await confirmed();
    const [source] = await db.select().from(reports).where(eq(reports.id, reportId));

    if (!source) {
      throw new Error("report not found");
    }

    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const holder = db.transaction(async (tx) => {
      await tx.insert(reports).values({
        addressee: source.addressee,
        clientId: source.clientId,
        clientName: source.clientName,
        id: randomUUID(),
        seriesId: source.seriesId,
        status: "draft",
        targetMonth: source.targetMonth,
        version: 2,
      });

      await held;
    });

    // 未コミットなので、この時点の事前判定には引っ掛かりません。
    const racing = createRevision(reportId);

    await waitForBlockedInsert();
    release();
    await holder;

    const res = await racing;

    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("RevisionAlreadyInProgress");
  });

  it("確定済みと進行中の版が同じ系列に居たら、理由の付いた拒否になる", async () => {
    // アプリを通る限り起きない組み合わせですが、同時に 2 人が修正版を作ろうとすれば
    // 起こりえます。制約違反をそのまま返しても利用者には何も伝わりません。
    const first = await createReport({ clientId: actors.client.id, status: "confirmed" });
    await createReport({
      clientId: actors.client.id,
      seriesId: first.seriesId,
      status: "draft",
      version: 2,
    });

    const res = await createRevision(first.id);

    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("RevisionAlreadyInProgress");
  });
});

describe("版のたどり方", () => {
  it("詳細から系列の全ての版が分かる", async () => {
    const reportId = await confirmed();
    const revision = await createRevision(reportId);

    const detail = await call(`/reports/${revision.json<ReportSummary>().id}`, { cookie: admin });

    expect(detail.json<ReportDetail>().versions).toEqual([
      { id: reportId, status: "superseded", version: 1 },
      { id: revision.json<ReportSummary>().id, status: "draft", version: 2 },
    ]);
  });

  it("旧版からも新しい版へ辿れる", async () => {
    const reportId = await confirmed();
    const revision = await createRevision(reportId);

    const detail = await call(`/reports/${reportId}`, { cookie: admin });

    expect(detail.json<ReportDetail>().versions.map((entry) => entry.id)).toContain(
      revision.json<ReportSummary>().id,
    );
  });
});

describe("修正版を空にできない", () => {
  it("修正版の最後の 1 件は削除できない", async () => {
    // 空にすると、確認依頼にも進めず（0 件は拒否）、旧版へも戻れない（superseded からは
    // 修正版を作れない）系列が残ります。しかも営業の一覧には出ないので、誰にも見えないまま止まります。
    const reportId = await confirmed();
    const revision = await createRevision(reportId);
    const detail = await call(`/reports/${revision.json<ReportSummary>().id}`, { cookie: admin });
    const lineId = detail.json<ReportDetail>().lines[0]?.id ?? "";

    const res = await call(`/lines/${lineId}`, { cookie: admin, method: "DELETE" });

    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("ReportHasNoLines");
  });

  it("残りがあるうちは削除できる", async () => {
    const reportId = await confirmed({ lines: ["案件A", "案件B"] });
    const revision = await createRevision(reportId);
    const detail = await call(`/reports/${revision.json<ReportSummary>().id}`, { cookie: admin });
    const lineId = detail.json<ReportDetail>().lines[0]?.id ?? "";

    const res = await call(`/lines/${lineId}`, { cookie: admin, method: "DELETE" });

    expect(res.status).toBe(200);
  });

  it("初版は最後の 1 件も削除できる", async () => {
    // 作りかけの報告書はまだ誰にも約束していないので、空に戻れます。
    const created = await call("/reports", {
      body: { clientId: actors.client.id, targetMonth: "2026-08" },
      cookie: admin,
      method: "POST",
    });
    const reportId = created.json<ReportSummary>().id;

    await call(`/reports/${reportId}/lines`, {
      body: { amount: "1000", projectName: "案件", salesOwnerId: actors.sales.id },
      cookie: admin,
      method: "POST",
    });

    const detail = await call(`/reports/${reportId}`, { cookie: admin });
    const lineId = detail.json<ReportDetail>().lines[0]?.id ?? "";

    const res = await call(`/lines/${lineId}`, { cookie: admin, method: "DELETE" });

    expect(res.status).toBe(200);
  });
});

describe("営業から見た版", () => {
  it("担当を外れた版も、同じ系列なら読める", async () => {
    // 版の履歴からリンクが出ている以上、踏めなければなりません。担当を外れたのか、
    // まだ明細が入っていないのかを、営業自身が確かめられる必要があります。
    const other = await createSalesUser("引き継ぎ先 営業");
    const otherCookie = await signInAs(other.id);
    const reportId = await confirmed();
    const revision = await createRevision(reportId);
    const revisionId = revision.json<ReportSummary>().id;
    const detail = await call(`/reports/${revisionId}`, { cookie: admin });
    const lineId = detail.json<ReportDetail>().lines[0]?.id ?? "";

    // 修正版で担当を付け替えます。元の担当は修正版に明細を持ちません。
    await call(`/lines/${lineId}`, {
      body: { amount: "1000", projectName: "案件A", salesOwnerId: other.id },
      cookie: admin,
      method: "PATCH",
    });

    expect((await call(`/reports/${revisionId}`, { cookie: sales })).status).toBe(200);
    // 逆向きも同じです。引き継ぎ先は旧版を読めます。
    expect((await call(`/reports/${reportId}`, { cookie: otherCookie })).status).toBe(200);
  });

  it("関係の無い系列は読めないまま", async () => {
    const other = await createSalesUser("担当外 営業");
    const otherCookie = await signInAs(other.id);
    const reportId = await confirmed();
    await createRevision(reportId);

    const res = await call(`/reports/${reportId}`, { cookie: otherCookie });

    expect(res.status).toBe(403);
    expect(res.json<{ tag: string }>().tag).toBe("ReportNotVisible");
  });

  it("一覧は自分の担当明細を含む版だけに絞る", async () => {
    // 詳細を系列で開けるようにしても、一覧まで版で膨らませません。
    // 一覧は「いま自分が確認すべきもの」を出す場所です。
    const other = await createSalesUser("引き継ぎ先 営業");
    const otherCookie = await signInAs(other.id);
    const reportId = await confirmed();
    const revision = await createRevision(reportId);
    const revisionId = revision.json<ReportSummary>().id;
    const detail = await call(`/reports/${revisionId}`, { cookie: admin });
    const lineId = detail.json<ReportDetail>().lines[0]?.id ?? "";

    await call(`/lines/${lineId}`, {
      body: { amount: "1000", projectName: "案件A", salesOwnerId: other.id },
      cookie: admin,
      method: "PATCH",
    });

    const listed = await call("/reports", { cookie: otherCookie });

    expect(listed.json<ReportSummary[]>().map((entry) => entry.id)).toEqual([revisionId]);
  });
});

describe("修正版のその後", () => {
  it("同じフローをもう一度通して確定できる", async () => {
    const reportId = await confirmed();
    const revision = await createRevision(reportId);
    const revisionId = revision.json<ReportSummary>().id;

    await call(`/reports/${revisionId}/review`, { cookie: admin, method: "POST" });

    const detail = await call(`/reports/${revisionId}`, { cookie: admin });

    for (const line of detail.json<ReportDetail>().lines) {
      await call(`/lines/${line.id}/approve`, { cookie: sales, method: "POST" });
    }

    const res = await call(`/reports/${revisionId}/confirm`, { cookie: admin, method: "POST" });

    expect(res.status).toBe(200);
    expect(res.json<ReportSummary>().status).toBe("confirmed");
  });

  it("承認を取り直すまでは確定できない", async () => {
    // 複製された明細は未確認から始まります。前の版の承認が効いてしまうと、
    // 直した内容を誰も見ないまま確定できます。
    const reportId = await confirmed();
    const revision = await createRevision(reportId);
    const revisionId = revision.json<ReportSummary>().id;

    await call(`/reports/${revisionId}/review`, { cookie: admin, method: "POST" });

    const res = await call(`/reports/${revisionId}/confirm`, { cookie: admin, method: "POST" });

    expect(res.status).toBe(409);
    expect(res.json<{ tag: string }>().tag).toBe("LinesNotFullyApproved");
  });

  it("確定すれば、次の修正版を作れる", async () => {
    const reportId = await confirmed();
    const revision = await createRevision(reportId);
    const revisionId = revision.json<ReportSummary>().id;

    await call(`/reports/${revisionId}/review`, { cookie: admin, method: "POST" });

    const detail = await call(`/reports/${revisionId}`, { cookie: admin });

    for (const line of detail.json<ReportDetail>().lines) {
      await call(`/lines/${line.id}/approve`, { cookie: sales, method: "POST" });
    }

    await call(`/reports/${revisionId}/confirm`, { cookie: admin, method: "POST" });

    const third = await createRevision(revisionId);

    expect(third.status).toBe(200);
    expect(third.json<ReportSummary>().version).toBe(3);
  });

  it("営業の一覧にも新しい版が出る", async () => {
    // 明細ごと複製されるので、担当営業は複製先でも自分の明細を持ちます。
    const reportId = await confirmed();
    const revision = await createRevision(reportId);

    const listed = await call("/reports", { cookie: sales });

    expect(listed.json<ReportSummary[]>().map((report) => report.id)).toContain(
      revision.json<ReportSummary>().id,
    );
  });
});
