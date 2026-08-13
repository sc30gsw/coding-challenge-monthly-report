import { Result } from "better-result";
import { describe, expect, it } from "vite-plus/test";

import { createRevision } from "~/features/reports/domain/revision";
import type { ReportStatus } from "~/features/reports/schemas/report-schema";

/**
 * 修正版。深掘り領域の本体です。
 *
 * 確定済みの報告書は書き換えず、誤りは新しい版として作り直します。元の版は
 * `superseded` として残り、内容は不変のまま読めます。
 * @see docs/adr/0009-revision-is-a-copied-report.md
 */

describe("修正版の作成", () => {
  it("確定済みからのみ作れる", () => {
    const revision = createRevision({ hasOpenVersion: false, status: "confirmed", version: 1 });

    expect(Result.isOk(revision)).toBe(true);
  });

  it("版番号は 1 つ進む", () => {
    const revision = createRevision({ hasOpenVersion: false, status: "confirmed", version: 3 });

    expect(Result.isOk(revision) ? revision.value.version : null).toBe(4);
  });

  it("新しい版は下書きから始まる", () => {
    // 明細は版ごとに再編集され、承認され直します。読み取り専用の複製ではありません。
    const revision = createRevision({ hasOpenVersion: false, status: "confirmed", version: 1 });

    expect(Result.isOk(revision) ? revision.value.status : null).toBe("draft");
  });

  it.each(["draft", "in_review", "superseded"] as const satisfies ReportStatus[])(
    "%s からは作れない",
    (status) => {
      const revision = createRevision({ hasOpenVersion: false, status, version: 1 });

      expect(Result.isError(revision)).toBe(true);
      expect(Result.isError(revision) ? revision.error._tag : null).toBe("TransitionNotAllowed");
    },
  );

  it("同じ系列に進行中の版があると作れない", () => {
    // 同じ報告書の修正版が 2 つ並走すると、どちらが正なのかが決まりません。
    // DB の部分ユニークが最後の砦ですが、その手前で理由を返せるようにします。
    const revision = createRevision({ hasOpenVersion: true, status: "confirmed", version: 1 });

    expect(Result.isError(revision)).toBe(true);
    expect(Result.isError(revision) ? revision.error._tag : null).toBe("RevisionAlreadyInProgress");
  });

  it("状態の判定が、並走の判定より先に来る", () => {
    const revision = createRevision({ hasOpenVersion: true, status: "draft", version: 1 });

    expect(Result.isError(revision) ? revision.error._tag : null).toBe("TransitionNotAllowed");
  });
});
