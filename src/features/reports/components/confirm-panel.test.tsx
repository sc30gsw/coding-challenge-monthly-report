// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { ConfirmPanel } from "~/features/reports/components/confirm-panel";
import type { ReportDetail } from "~/features/reports/schemas/report-schema";
import { connectFetchToApp, renderWithProviders } from "~/test/browser";

/**
 * 確定は不可逆なので、押せないときに「なぜ押せないか」が読み取れることを守ります。
 * ボタンを消すと、管理者は足りないものを明細表から自力で探すことになります。
 * @see docs/adr/0012-confirm-preconditions.md
 */

function reportWith(progress: ReportDetail["progress"]): ReportDetail {
  return {
    addressee: "経理部 ご担当者様",
    clientName: "株式会社サンプル",
    id: "11111111-1111-1111-1111-111111111111",
    lines: [],
    progress,
    status: "in_review",
    targetMonth: "2026-08",
    totalAmount: "1000.00",
    version: 1,
  };
}

let disconnect: () => void;

beforeEach(() => {
  disconnect = connectFetchToApp();
});

afterEach(() => {
  disconnect();
});

describe("確定パネル", () => {
  it("全明細が承認済みなら押せる", async () => {
    await renderWithProviders(
      <ConfirmPanel
        report={reportWith({
          approved: 2,
          changesRequested: 0,
          isFullyApproved: true,
          pending: 0,
          total: 2,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "確定する" })).toBeEnabled();
    expect(screen.queryByText("確定できない理由")).not.toBeInTheDocument();
  });

  it("未承認と差し戻しが残っていると、件数を挙げて押せなくする", async () => {
    await renderWithProviders(
      <ConfirmPanel
        report={reportWith({
          approved: 1,
          changesRequested: 1,
          isFullyApproved: false,
          pending: 2,
          total: 4,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "確定する" })).toBeDisabled();
    expect(screen.getByText("未承認の明細が 2 件あります")).toBeInTheDocument();
    expect(screen.getByText("差し戻し中の明細が 1 件あります")).toBeInTheDocument();
  });

  it("明細が 0 件のときも理由を挙げて押せなくする", async () => {
    // 「すべて承認済み」は空集合で真になるため、件数を別に挙げます。
    await renderWithProviders(
      <ConfirmPanel
        report={reportWith({
          approved: 0,
          changesRequested: 0,
          isFullyApproved: false,
          pending: 0,
          total: 0,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "確定する" })).toBeDisabled();
    expect(
      screen.getByText("明細が 1 件もありません（確定には 1 件以上必要です）"),
    ).toBeInTheDocument();
  });

  it("確定が不可逆であることを画面に書く", async () => {
    await renderWithProviders(
      <ConfirmPanel
        report={reportWith({
          approved: 1,
          changesRequested: 0,
          isFullyApproved: true,
          pending: 0,
          total: 1,
        })}
      />,
    );

    expect(screen.getByText(/確定後は内容を変更できません/)).toBeInTheDocument();
  });
});
