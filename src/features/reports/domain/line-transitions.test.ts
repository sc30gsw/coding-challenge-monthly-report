import { Result } from "better-result";
import { describe, expect, it } from "vite-plus/test";

import { approveLine, requestChanges } from "~/features/reports/domain/line-transitions";
import type { ReportStatus } from "~/features/reports/schemas/report-schema";

/**
 * 明細の確認は、営業が「自分の担当行に対して」「確認中の報告書で」だけ行えます。
 * 組み合わせの網羅はこの層で済ませ、DB や HTTP は関与させません。
 */

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function lineIn(reportStatus: ReportStatus) {
  return { reportStatus, salesOwnerId: OWNER, status: "pending" as const };
}

describe("承認", () => {
  it("担当者が確認中の明細を承認できる", () => {
    const approved = approveLine(lineIn("in_review"), { id: OWNER, role: "sales" });

    expect(Result.isOk(approved)).toBe(true);
    expect(Result.isOk(approved) ? approved.value.status : null).toBe("approved");
  });

  it("担当でない営業は承認できない", () => {
    const approved = approveLine(lineIn("in_review"), { id: OTHER, role: "sales" });

    expect(Result.isError(approved)).toBe(true);
    expect(Result.isError(approved) ? approved.error._tag : null).toBe("NotLineOwner");
  });

  it("管理者は承認できない", () => {
    // 作る側と確認する側を分けることが、この業務の骨格です。
    const approved = approveLine(lineIn("in_review"), { id: OWNER, role: "admin" });

    expect(Result.isError(approved)).toBe(true);
  });

  it.each(["draft", "confirmed", "superseded"] as const satisfies ReportStatus[])(
    "報告書が %s のときは承認できない",
    (reportStatus) => {
      const approved = approveLine(lineIn(reportStatus), { id: OWNER, role: "sales" });

      expect(Result.isError(approved)).toBe(true);
      expect(Result.isError(approved) ? approved.error._tag : null).toBe("TransitionNotAllowed");
    },
  );

  it("すでに承認済みでも、もう一度承認しても壊れない", () => {
    const approved = approveLine(
      { reportStatus: "in_review", salesOwnerId: OWNER, status: "approved" },
      { id: OWNER, role: "sales" },
    );

    expect(Result.isOk(approved)).toBe(true);
  });
});

describe("差し戻し", () => {
  it("担当者が理由をつけて差し戻せる", () => {
    const sent = requestChanges(
      lineIn("in_review"),
      { id: OWNER, role: "sales" },
      "金額が違います",
    );

    expect(Result.isOk(sent)).toBe(true);
    expect(Result.isOk(sent) ? sent.value.changeRequestReason : null).toBe("金額が違います");
  });

  it("差し戻しても報告書の状態は変わらない", () => {
    // 明細ごとに承認と差し戻しが混在するので、報告書の単一のステータスでは表せません。
    // @see docs/adr/0007-approval-is-bound-to-content.md
    const sent = requestChanges(
      lineIn("in_review"),
      { id: OWNER, role: "sales" },
      "金額が違います",
    );

    expect(Result.isOk(sent) ? "reportStatus" in sent.value : true).toBe(false);
  });

  it("担当でない営業は差し戻せない", () => {
    const sent = requestChanges(lineIn("in_review"), { id: OTHER, role: "sales" }, "気になります");

    expect(Result.isError(sent)).toBe(true);
    expect(Result.isError(sent) ? sent.error._tag : null).toBe("NotLineOwner");
  });

  it("下書きの報告書には差し戻せない", () => {
    const sent = requestChanges(lineIn("draft"), { id: OWNER, role: "sales" }, "金額が違います");

    expect(Result.isError(sent)).toBe(true);
  });
});
