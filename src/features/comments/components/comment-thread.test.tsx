// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { SessionUser } from "~/features/auth/schemas/session-schema";
import { CommentThread } from "~/features/comments/components/comment-thread";
import type { Comment } from "~/features/comments/schemas/comment-schema";
import type { ReportDetail } from "~/features/reports/schemas/report-schema";
import { listComments } from "~/server/comments-service";
import { call, signInAs } from "~/test/api";
import { connectFetchToApp, renderWithProviders, signInBrowserAs } from "~/test/browser";
import { createActors } from "~/test/fixtures";

/**
 * 画面から API、DB までを通します。API はモックしません。
 * @see docs/adr/0011-comments-outlive-confirmation.md
 */

let actors: Awaited<ReturnType<typeof createActors>>;
let disconnect: () => void;
let reportId: string;
let lines: ReportDetail["lines"];
let viewer: SessionUser;

beforeEach(async () => {
  actors = await createActors();

  const admin = await signInAs(actors.admin.id);
  const created = await call("/reports", {
    body: { clientId: actors.client.id, targetMonth: "2026-08" },
    cookie: admin,
    method: "POST",
  });

  reportId = created.json<{ id: string }>().id;

  await call(`/reports/${reportId}/lines`, {
    body: { amount: "1000", projectName: "案件", salesOwnerId: actors.sales.id },
    cookie: admin,
    method: "POST",
  });

  const detail = await call(`/reports/${reportId}`, { cookie: admin });

  lines = detail.json<ReportDetail>().lines;

  viewer = { id: actors.admin.id, name: actors.admin.name, role: "admin" };
  disconnect = connectFetchToApp();
  await signInBrowserAs(actors.admin.id);
});

afterEach(() => {
  disconnect();
});

describe("やりとり", () => {
  it("入力したコメントが実際に保存される", async () => {
    const { user } = await renderWithProviders(
      <CommentThread comments={[]} lines={lines} reportId={reportId} viewer={viewer} />,
    );

    await user.type(screen.getByLabelText("コメント"), "金額の根拠を教えてください");
    await user.click(screen.getByRole("button", { name: "投稿する" }));

    await waitFor(async () => {
      const listed = await listComments({ id: actors.admin.id, role: "admin" }, reportId);

      expect(listed.unwrap()).toHaveLength(1);
    });
  });

  it("空のままでは投稿できず、理由が出る", async () => {
    const { user } = await renderWithProviders(
      <CommentThread comments={[]} lines={lines} reportId={reportId} viewer={viewer} />,
    );

    await user.click(screen.getByRole("button", { name: "投稿する" }));

    expect(await screen.findByText("コメントを入力してください")).toBeInTheDocument();
  });

  it("誰がいつ書いたかと、対象の明細が分かる", async () => {
    const comments: Comment[] = [
      {
        author: { id: actors.sales.id, name: actors.sales.name, role: "sales" },
        body: "この案件の金額です",
        createdAt: "2026-08-13T02:00:00.000Z",
        id: "comment-1",
        lineId: lines[0]?.id ?? null,
        lineProjectName: "案件",
      },
    ];

    await renderWithProviders(
      <CommentThread comments={comments} lines={lines} reportId={reportId} viewer={viewer} />,
    );

    const card = screen.getByText("この案件の金額です").closest<HTMLElement>("div");

    if (!card) {
      throw new Error("comment card not rendered");
    }

    // 案件名は投稿先を選ぶ Select にも出るので、コメント本体の中だけを見ます。
    expect(within(card).getByText(actors.sales.name)).toBeInTheDocument();
    expect(within(card).getByText("営業")).toBeInTheDocument();
  });
});

describe("楽観的な表示", () => {
  it("投稿したコメントが、再取得を待たずにその場で出る", async () => {
    // 会話は往復が続くので、1 往復ごとに再取得を待たされると手が止まります。
    const { user } = await renderWithProviders(
      <CommentThread comments={[]} lines={lines} reportId={reportId} viewer={viewer} />,
    );

    await user.type(screen.getByLabelText("コメント"), "すぐ出るはず");
    await user.click(screen.getByRole("button", { name: "投稿する" }));

    expect(await screen.findByText("すぐ出るはず")).toBeInTheDocument();
  });

  it("サーバーに拒否されたら取り消して理由を出す", async () => {
    // 楽観表示を残したままだと、書いたつもりが相手に届いていない状態になります。
    const { user } = await renderWithProviders(
      <CommentThread
        comments={[]}
        lines={lines}
        reportId="00000000-0000-0000-0000-000000000000"
        viewer={viewer}
      />,
    );

    await user.type(screen.getByLabelText("コメント"), "存在しない報告書への投稿");
    await user.click(screen.getByRole("button", { name: "投稿する" }));

    expect(
      await screen.findByText("コメントを投稿できませんでした。時間をおいて試してください。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("存在しない報告書への投稿")).not.toBeInTheDocument();
  });
});
