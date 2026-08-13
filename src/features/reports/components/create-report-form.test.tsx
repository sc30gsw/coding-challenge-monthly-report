// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { CreateReportForm } from "~/features/reports/components/create-report-form";
import { listReports } from "~/server/reports-service";
import { connectFetchToApp, renderWithProviders, signInBrowserAs } from "~/test/browser";
import { createActors } from "~/test/fixtures";

/**
 * トロフィー型の本体です。画面から API、DB までを一続きに通します。
 * ここで守りたいのは「画面が API の契約どおりに呼べているか」であって、
 * 部品の内部構造ではありません。
 */

let actors: Awaited<ReturnType<typeof createActors>>;
let disconnect: () => void;

beforeEach(async () => {
  actors = await createActors();
  disconnect = connectFetchToApp();
  await signInBrowserAs(actors.admin.id);
});

afterEach(() => {
  disconnect();
});

describe("報告書の作成フォーム", () => {
  it("入力した内容で報告書が実際に作られる", async () => {
    const { user } = await renderWithProviders(
      <CreateReportForm
        clients={[
          {
            defaultAddressee: actors.client.defaultAddressee,
            id: actors.client.id,
            name: actors.client.name,
          },
        ]}
      />,
    );

    // Mantine の Select と MonthPickerInput は、素の select や month 入力と違って
    // 「開いてから選ぶ」操作になります。ユーザーの手順どおりに触ります。
    await user.click(screen.getByLabelText("取引先", { selector: "input:not([type=hidden])" }));
    await user.click(await screen.findByText(actors.client.name));

    await user.click(
      screen.getByLabelText("対象月", { selector: "button, input:not([type=hidden])" }),
    );
    await user.click(await screen.findByRole("button", { name: "8月" }));

    await user.click(screen.getByRole("button", { name: "下書きを作成" }));

    await waitFor(async () => {
      const reports = await listReports();

      expect(reports).toHaveLength(1);
      expect(reports[0]?.clientName).toBe(actors.client.name);
      expect(reports[0]?.targetMonth?.endsWith("-08")).toBe(true);
    });
  });

  it("取引先を選ばないと、理由が画面に出て送信されない", async () => {
    const { user } = await renderWithProviders(<CreateReportForm clients={[]} />);

    await user.click(screen.getByRole("button", { name: "下書きを作成" }));

    // 検証はサーバーと同じ Valibot スキーマから来ます。画面側で書き直していません。
    expect(await screen.findByText("取引先を選択してください")).toBeInTheDocument();
    await expect(listReports()).resolves.toHaveLength(0);
  });
});
