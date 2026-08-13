// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { RevisionPanel } from "~/features/reports/components/revision-panel";
import type { ReportDetail, ReportSummary } from "~/features/reports/schemas/report-schema";
import { call, signInAs } from "~/test/api";
import { connectFetchToApp, renderWithProviders, signInBrowserAs } from "~/test/browser";
import { createActors } from "~/test/fixtures";

/**
 * 画面から API、DB までを通します。API はモックしません。
 * @see docs/adr/0009-revision-is-a-copied-report.md
 */

let actors: Awaited<ReturnType<typeof createActors>>;
let disconnect: () => void;
let report: ReportDetail;

beforeEach(async () => {
  actors = await createActors();

  const admin = await signInAs(actors.admin.id);
  const created = await call("/reports", {
    body: { clientId: actors.client.id, targetMonth: "2026-08" },
    cookie: admin,
    method: "POST",
  });
  const reportId = created.json<ReportSummary>().id;

  await call(`/reports/${reportId}/lines`, {
    body: { amount: "1000", projectName: "案件A", salesOwnerId: actors.sales.id },
    cookie: admin,
    method: "POST",
  });
  await call(`/reports/${reportId}/review`, { cookie: admin, method: "POST" });

  const sales = await signInAs(actors.sales.id);
  const inReview = await call(`/reports/${reportId}`, { cookie: admin });

  for (const line of inReview.json<ReportDetail>().lines) {
    await call(`/lines/${line.id}/approve`, { cookie: sales, method: "POST" });
  }

  await call(`/reports/${reportId}/confirm`, { cookie: admin, method: "POST" });

  report = (await call(`/reports/${reportId}`, { cookie: admin })).json<ReportDetail>();

  disconnect = connectFetchToApp();
  await signInBrowserAs(actors.admin.id);
});

afterEach(() => {
  disconnect();
});

async function renderPanel() {
  return await renderWithProviders(<RevisionPanel report={report} />, {
    routes: ["/reports/$reportId"],
  });
}

describe("修正版パネル", () => {
  it("押すと修正版が実際に作られる", async () => {
    const { user } = await renderPanel();

    await user.click(screen.getByRole("button", { name: "修正版を作る" }));

    await waitFor(async () => {
      const listed = await call("/reports", { cookie: await signInAs(actors.admin.id) });

      expect(
        listed
          .json<ReportSummary[]>()
          .map((entry) => entry.version)
          .sort(),
      ).toEqual([1, 2]);
    });
  });

  it("作った修正版は下書きで、元の版は旧版になる", async () => {
    const { user } = await renderPanel();

    await user.click(screen.getByRole("button", { name: "修正版を作る" }));

    await waitFor(async () => {
      const admin = await signInAs(actors.admin.id);
      const source = await call(`/reports/${report.id}`, { cookie: admin });
      const versions = source.json<ReportDetail>().versions;

      expect(versions).toEqual([
        { id: report.id, status: "superseded", version: 1 },
        { id: expect.any(String), status: "draft", version: 2 },
      ]);
    });
  });

  it("何が起きるのかを、押す前に読める", async () => {
    // 確定済みは直せない、という制約の裏返しなので、代わりに何が起きるかを書きます。
    await renderPanel();

    expect(screen.getByText(/確定済みの内容は変更できません/)).toBeInTheDocument();
    expect(screen.getByText(/第 2 版/)).toBeInTheDocument();
    expect(screen.getByText(/確認状況は未確認に戻ります/)).toBeInTheDocument();
  });

  it("サーバーが断った理由を、そのまま出す", async () => {
    // 先に別の経路で修正版を作られた状況です。画面にボタンが出ていることは保証になりません。
    // 拒否の文言はドメイン層が持つので、クライアントで訳し直しません。
    await call(`/reports/${report.id}/revisions`, {
      cookie: await signInAs(actors.admin.id),
      method: "POST",
    });

    const { user } = await renderPanel();

    await user.click(screen.getByRole("button", { name: "修正版を作る" }));

    expect(await screen.findByText("旧版の報告書からは修正版を作れません")).toBeInTheDocument();
  });
});
