// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { VersionHistory } from "~/features/reports/components/version-history";
import type { SeriesVersion } from "~/features/reports/schemas/report-schema";
import { connectFetchToApp, renderWithProviders } from "~/test/browser";

/**
 * 旧版を消さずに残す設計なので、辿れなければ残した意味がありません。
 * @see docs/adr/0009-revision-is-a-copied-report.md
 */

const VERSIONS: SeriesVersion[] = [
  { id: "11111111-1111-1111-1111-111111111111", status: "superseded", version: 1 },
  { id: "22222222-2222-2222-2222-222222222222", status: "confirmed", version: 2 },
  { id: "33333333-3333-3333-3333-333333333333", status: "draft", version: 3 },
];

let disconnect: () => void;

beforeEach(() => {
  disconnect = connectFetchToApp();
});

afterEach(() => {
  disconnect();
});

async function renderHistory(currentId: string, versions = VERSIONS) {
  return await renderWithProviders(<VersionHistory currentId={currentId} versions={versions} />, {
    routes: ["/reports/$reportId"],
  });
}

describe("版の履歴", () => {
  it("いま見ている版が分かる", async () => {
    await renderHistory(VERSIONS[1]?.id ?? "");

    expect(screen.getByText("第 2 版（表示中）")).toBeInTheDocument();
  });

  it("他の版へ辿れる", async () => {
    await renderHistory(VERSIONS[1]?.id ?? "");

    expect(screen.getByRole("link", { name: "第 1 版" })).toHaveAttribute(
      "href",
      `/reports/${VERSIONS[0]?.id}`,
    );
    expect(screen.getByRole("link", { name: "第 3 版" })).toHaveAttribute(
      "href",
      `/reports/${VERSIONS[2]?.id}`,
    );
  });

  it("表示中の版はリンクにしない", async () => {
    await renderHistory(VERSIONS[1]?.id ?? "");

    expect(screen.queryByRole("link", { name: /第 2 版/ })).not.toBeInTheDocument();
  });

  it("それぞれの版の状態が分かる", async () => {
    await renderHistory(VERSIONS[1]?.id ?? "");

    expect(screen.getByText("旧版")).toBeInTheDocument();
    expect(screen.getByText("確定済み")).toBeInTheDocument();
    expect(screen.getByText("下書き")).toBeInTheDocument();
  });

  it("初版しか無いときは何も出さない", async () => {
    // 版が 1 つしか無い報告書に「版の履歴」を出しても、読む人の負担が増えるだけです。
    const { container } = await renderHistory(VERSIONS[0]?.id ?? "", [
      VERSIONS[0] as SeriesVersion,
    ]);

    expect(container).not.toHaveTextContent("版の履歴");
  });
});
