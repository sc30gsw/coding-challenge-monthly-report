// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { ReportLineTable } from "~/features/reports/components/report-line-table";
import type { ReportDetail } from "~/features/reports/schemas/report-schema";
import { connectFetchToApp, renderWithProviders } from "~/test/browser";

/**
 * 営業が自分の担当行を読み取れることを守ります。
 * 見えるが触れない、という関係を画面で表現できていないと、
 * 「どれを確認すればいいのか」が分からなくなります。
 * @see docs/adr/0010-sales-owner-lives-on-the-line.md
 */

const MINE = "11111111-1111-1111-1111-111111111111";
const THEIRS = "22222222-2222-2222-2222-222222222222";

const lines: ReportDetail["lines"] = [
  {
    amount: "1000.00",
    changeRequestReason: null,
    id: "line-mine",
    projectName: "自分の案件",
    salesOwner: { id: MINE, name: "佐藤 花子" },
    status: "pending",
  },
  {
    amount: "2000.00",
    changeRequestReason: null,
    id: "line-theirs",
    projectName: "同僚の案件",
    salesOwner: { id: THEIRS, name: "鈴木 一郎" },
    status: "approved",
  },
];

let disconnect: () => void;

beforeEach(() => {
  disconnect = connectFetchToApp();
});

afterEach(() => {
  disconnect();
});

describe("明細一覧", () => {
  it("自分の担当行だけに印がつく", async () => {
    await renderWithProviders(<ReportLineTable lines={lines} viewerId={MINE} />);

    const mine = screen.getByRole("row", { name: /自分の案件/ });
    const theirs = screen.getByRole("row", { name: /同僚の案件/ });

    expect(within(mine).getByText("自分の担当")).toBeInTheDocument();
    expect(within(theirs).queryByText("自分の担当")).not.toBeInTheDocument();
  });

  it("担当外の明細も読める", async () => {
    // 自分の行だけに絞ると、金額合計が何を指すのか分からないまま承認することになります。
    await renderWithProviders(<ReportLineTable lines={lines} viewerId={MINE} />);

    expect(screen.getByText("同僚の案件")).toBeInTheDocument();
    expect(screen.getByText("鈴木 一郎")).toBeInTheDocument();
  });
});
