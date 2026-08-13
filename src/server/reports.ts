import { matchError, Result } from "better-result";
import { Elysia } from "elysia";
import * as v from "valibot";

import type { ReportError } from "~/features/reports/domain/errors";
import {
  ClientSchema,
  CreateReportInputSchema,
  CreateReportLineInputSchema,
  ReportDetailSchema,
  ReportSummarySchema,
} from "~/features/reports/schemas/report-schema";
import { auth } from "~/server/auth";
import * as service from "~/server/reports-service";

/**
 * 表紙と明細の HTTP 境界です。ここに業務ロジックは置きません。
 *
 * サービスは `Result` を返し、この層がタグを HTTP のステータスへ写します。
 * `Result` や `TaggedError` をそのままレスポンスに載せることはしません。
 * クラスインスタンスは境界を越えられないためです。
 * @see docs/adr/0005-better-result-for-expected-failures.md
 */

/**
 * 失敗の種類ごとの見せ方です。`matchError` は網羅を要求するので、
 * 状態遷移の拒否が増えたときに、ここで型エラーとして気づけます。
 *
 * - 404: 存在しない
 * - 403: 存在するが、その人には見せない
 * - 409: 存在も権限もあるが、いまの状態ではできない
 */
function toHttpFailure(error: ReportError) {
  const body = { message: error.message, tag: error._tag };

  return matchError(error, {
    ClientNotFound: () => ({ body, status: 404 as const }),
    ReportNotFound: () => ({ body, status: 404 as const }),
    ReportNotVisible: () => ({ body, status: 403 as const }),
    TransitionNotAllowed: () => ({ body, status: 409 as const }),
  });
}

const ErrorBodySchema = v.object({ message: v.string(), tag: v.string() });

/** 失敗しうるルートは、この 3 つのステータスを宣言しておきます。 */
const failureResponses = {
  403: ErrorBodySchema,
  404: ErrorBodySchema,
  409: ErrorBodySchema,
};

export const reportRoutes = new Elysia({ name: "reports" })
  .use(auth)
  .get("/clients", async () => await service.listClients(), {
    admin: true,
    detail: {
      description: "報告書を作るときの入力補助に使います。",
      summary: "取引先マスタ",
      tags: ["Reports"],
    },
    response: v.array(ClientSchema),
  })
  .get("/reports", async ({ user }) => await service.listReportsFor(user), {
    detail: {
      description:
        "管理者は全ての報告書を、営業は自分が担当する明細を含む報告書だけを一覧できます。",
      summary: "報告書の一覧",
      tags: ["Reports"],
    },
    response: v.array(ReportSummarySchema),
    session: true,
  })
  .post(
    "/reports",
    async ({ body, status }) => {
      const created = await service.createReport(body);

      if (Result.isError(created)) {
        const failure = toHttpFailure(created.error);

        return status(failure.status, failure.body);
      }

      return created.value;
    },
    {
      admin: true,
      body: CreateReportInputSchema,
      detail: {
        description: "取引先と対象月を指定して下書きを作ります。",
        summary: "報告書の作成",
        tags: ["Reports"],
      },
      response: { 200: ReportSummarySchema, ...failureResponses },
    },
  )
  .get(
    "/reports/:reportId",
    async ({ params, status, user }) => {
      const detail = await service.getReportDetailFor(user, params.reportId);

      if (Result.isError(detail)) {
        const failure = toHttpFailure(detail.error);

        return status(failure.status, failure.body);
      }

      return detail.value;
    },
    {
      detail: {
        description: "表紙と明細を返します。営業は担当する明細を含む報告書だけを読めます。",
        summary: "報告書の詳細",
        tags: ["Reports"],
      },
      // ステータスごとに宣言します。単一スキーマだと 200 しか返せません。
      response: { 200: ReportDetailSchema, ...failureResponses },
      session: true,
    },
  )
  .post(
    "/reports/:reportId/lines",
    async ({ body, params, status }) => {
      const added = await service.addReportLine(params.reportId, body);

      if (Result.isError(added)) {
        const failure = toHttpFailure(added.error);

        return status(failure.status, failure.body);
      }

      return added.value;
    },
    {
      admin: true,
      body: CreateReportLineInputSchema,
      detail: {
        description: "下書きに明細を追加します。担当営業をここで割り当てます。",
        summary: "明細の追加",
        tags: ["Reports"],
      },
      response: { 200: v.object({ ok: v.literal(true) }), ...failureResponses },
    },
  )
  .post(
    "/reports/:reportId/review",
    async ({ params, status }) => {
      const moved = await service.requestReview(params.reportId);

      if (Result.isError(moved)) {
        const failure = toHttpFailure(moved.error);

        return status(failure.status, failure.body);
      }

      return moved.value;
    },
    {
      admin: true,
      detail: {
        description:
          "下書きを確認中にします。担当営業が明細を確認できるようになります。下書きへ戻す操作はありません。",
        summary: "確認依頼",
        tags: ["Reports"],
      },
      response: { 200: ReportSummarySchema, ...failureResponses },
    },
  );
