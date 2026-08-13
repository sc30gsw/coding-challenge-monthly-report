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

  it("承認済みの明細を編集すると、直前が承認済みだったと分かる", () => {
    // status だけでは「一度も見られていない未確認」と「承認後に編集された未確認」を
    // 読み分けられません。営業がもう一度確認を求められる理由がこの区別です。
    // @see docs/adr/0007-approval-is-bound-to-content.md
    const edited = editLine(lineIn("in_review", "approved"));

    expect(Result.isOk(edited) ? edited.value.wasApproved : null).toBe(true);
  });

  it.each(["changes_requested", "pending"] as const satisfies ReportLine["status"][])(
    "%s の明細を編集しても、承認済みだったことにはならない",
    (status) => {
      const edited = editLine(lineIn("in_review", status));

      expect(Result.isOk(edited) ? edited.value.wasApproved : null).toBe(false);
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

/** 削除は報告書全体の状況（残り件数・版番号）を見ます。 */
function removalOf(reportStatus: ReportStatus, { lineCount = 3, version = 1 } = {}) {
  return { lineCount, reportStatus, version };
}

describe("明細の削除", () => {
  it("下書き中は削除できる", () => {
    expect(Result.isOk(removeLine(removalOf("draft")))).toBe(true);
  });

  it("確認依頼後は削除できない", () => {
    // 差し戻された明細を消せると、指摘が対応されないまま消えて確定できてしまいます。
    // 削除を禁じれば、この穴を塞ぐための追加の機構が要りません。
    const removed = removeLine(removalOf("in_review"));

    expect(Result.isError(removed)).toBe(true);
    expect(Result.isError(removed) ? removed.error._tag : null).toBe("TransitionNotAllowed");
  });

  it("初版は最後の 1 件も消せる", () => {
    // 作りかけの報告書はまだ誰にも約束していないので、空に戻れます。
    expect(Result.isOk(removeLine(removalOf("draft", { lineCount: 1 })))).toBe(true);
  });

  it("修正版は最後の 1 件を消せない", () => {
    // 修正版を作った時点で旧版は「もう最新ではない」と宣言済みです。その後継を空にすると、
    // 前へも戻れもしない系列が、誰にも見えないまま残ります。
    const removed = removeLine(removalOf("draft", { lineCount: 1, version: 2 }));

    expect(Result.isError(removed)).toBe(true);
    expect(Result.isError(removed) ? removed.error._tag : null).toBe("ReportHasNoLines");
  });

  it("修正版でも、残りがあるうちは消せる", () => {
    expect(Result.isOk(removeLine(removalOf("draft", { lineCount: 2, version: 2 })))).toBe(true);
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
