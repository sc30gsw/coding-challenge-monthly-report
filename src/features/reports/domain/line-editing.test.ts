import { Result } from "better-result";
import { describe, expect, it } from "vite-plus/test";

import {
  addLine,
  editLine,
  removeLine,
  reviewProgress,
} from "~/features/reports/domain/line-editing";
import type { ReportLine, ReportStatus } from "~/features/reports/schemas/report-schema";

/**
 * 管理者側の編集です。ここで守っているのがこの課題の一番の主張です。
 *
 * 承認は行に貼られた永続ラベルではなく、**レビューした内容に対する意思表示**です。
 * 内容が変われば承認は失われます。
 * @see docs/adr/0007-approval-is-bound-to-content.md
 */

function lineIn(reportStatus: ReportStatus, status: ReportLine["status"] = "pending") {
  return { reportStatus, status };
}

describe("明細の編集", () => {
  it.each(["approved", "changes_requested", "pending"] as const satisfies ReportLine["status"][])(
    "%s の明細を編集すると未確認に戻る",
    (status) => {
      const edited = editLine(lineIn("in_review", status));

      expect(Result.isOk(edited)).toBe(true);
      expect(Result.isOk(edited) ? edited.value.status : null).toBe("pending");
    },
  );

  it("下書き中も編集できる", () => {
    expect(Result.isOk(editLine(lineIn("draft")))).toBe(true);
  });

  it.each(["confirmed", "superseded"] as const satisfies ReportStatus[])(
    "%s の報告書の明細は編集できない",
    (reportStatus) => {
      const edited = editLine(lineIn(reportStatus, "approved"));

      expect(Result.isError(edited)).toBe(true);
      expect(Result.isError(edited) ? edited.error._tag : null).toBe("TransitionNotAllowed");
    },
  );
});

describe("明細の追加", () => {
  it.each(["draft", "in_review"] as const satisfies ReportStatus[])(
    "%s の報告書には明細を足せる",
    (reportStatus) => {
      expect(Result.isOk(addLine({ reportStatus }))).toBe(true);
    },
  );

  it.each(["confirmed", "superseded"] as const satisfies ReportStatus[])(
    "%s の報告書には明細を足せない",
    (reportStatus) => {
      expect(Result.isError(addLine({ reportStatus }))).toBe(true);
    },
  );
});

describe("明細の削除", () => {
  it("下書き中は削除できる", () => {
    expect(Result.isOk(removeLine(lineIn("draft")))).toBe(true);
  });

  it("確認依頼後は削除できない", () => {
    // 差し戻された明細を消せると、指摘が対応されないまま消えて確定できてしまいます。
    // 削除を禁じれば、この穴を塞ぐための追加の機構が要りません。
    const removed = removeLine(lineIn("in_review", "changes_requested"));

    expect(Result.isError(removed)).toBe(true);
    expect(Result.isError(removed) ? removed.error._tag : null).toBe("TransitionNotAllowed");
  });
});

describe("確認の進み具合", () => {
  it("未承認と差し戻しの件数を明細から数える", () => {
    const progress = reviewProgress([
      { status: "approved" },
      { status: "pending" },
      { status: "pending" },
      { status: "changes_requested" },
    ]);

    expect(progress).toEqual({
      approved: 1,
      changesRequested: 1,
      isFullyApproved: false,
      pending: 2,
      total: 4,
    });
  });

  it("全て承認済みなら確定の条件を満たす", () => {
    const progress = reviewProgress([{ status: "approved" }, { status: "approved" }]);

    expect(progress.isFullyApproved).toBe(true);
  });

  it("明細が 0 件のときは条件を満たさない", () => {
    // 「すべて承認済み」は空集合で自動的に真になります。件数を別に見ないと、
    // 中身の無い報告書が確定を通ります。
    // @see docs/adr/0012-confirm-preconditions.md
    expect(reviewProgress([]).isFullyApproved).toBe(false);
  });
});
