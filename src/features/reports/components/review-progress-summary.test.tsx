// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { ReviewProgressSummary } from "~/features/reports/components/review-progress-summary";
import { connectFetchToApp, renderWithProviders } from "~/test/browser";

/**
 * 「あと何をすれば前に進めるか」が読み取れることを守ります。
 * 押せない理由が分からない画面は、この業務では使えません。
 * @see docs/adr/0012-confirm-preconditions.md
 */

let disconnect: () => void;

beforeEach(() => {
  disconnect = connectFetchToApp();
});

afterEach(() => {
  disconnect();
});

describe("確認の進み具合", () => {
  it("残っている未承認と差し戻しの件数が出る", async () => {
    await renderWithProviders(
      <ReviewProgressSummary
        progress={{
          approved: 1,
          changesRequested: 1,
          isFullyApproved: false,
          pending: 2,
          total: 4,
        }}
      />,
    );

    expect(screen.getByText("承認済み 1 / 4 件")).toBeInTheDocument();
    expect(screen.getByText("未承認 2 件")).toBeInTheDocument();
    expect(screen.getByText("差し戻し 1 件")).toBeInTheDocument();
  });

  it("全て承認済みなら、その旨だけを出す", async () => {
    await renderWithProviders(
      <ReviewProgressSummary
        progress={{
          approved: 2,
          changesRequested: 0,
          isFullyApproved: true,
          pending: 0,
          total: 2,
        }}
      />,
    );

    expect(screen.getByText("全 2 件の明細が承認済みです。")).toBeInTheDocument();
  });

  it("明細が無いときは、確定に 1 件以上要ることを伝える", async () => {
    // 空の報告書が確定を通ると不可逆なので、その手前で気づけるようにします。
    await renderWithProviders(
      <ReviewProgressSummary
        progress={{
          approved: 0,
          changesRequested: 0,
          isFullyApproved: false,
          pending: 0,
          total: 0,
        }}
      />,
    );

    expect(
      screen.getByText("明細がありません。確定するには 1 件以上必要です。"),
    ).toBeInTheDocument();
  });
});
