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
 */
function toErrorBody(error: ReportError) {
  return matchError(error, {
    ClientNotFound: (found) => ({ message: found.message, tag: found._tag }),
    ReportNotFound: (found) => ({ message: found.message, tag: found._tag }),
  });
}

const ErrorBodySchema = v.object({ message: v.string(), tag: v.string() });

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
  .get("/reports", async () => await service.listReports(), {
    admin: true,
    detail: {
      description: "管理者は全ての報告書を一覧できます。",
      summary: "報告書の一覧",
      tags: ["Reports"],
    },
    response: v.array(ReportSummarySchema),
  })
  .post(
    "/reports",
    async ({ body, status }) => {
      const created = await service.createReport(body);

      if (Result.isError(created)) {
        return status(404, toErrorBody(created.error));
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
      response: { 200: ReportSummarySchema, 404: ErrorBodySchema },
    },
  )
  .get(
    "/reports/:reportId",
    async ({ params, status }) => {
      const detail = await service.getReportDetail(params.reportId);

      if (Result.isError(detail)) {
        return status(404, toErrorBody(detail.error));
      }

      return detail.value;
    },
    {
      admin: true,
      detail: {
        description: "表紙と明細を返します。",
        summary: "報告書の詳細",
        tags: ["Reports"],
      },
      // ステータスごとに宣言します。単一スキーマだと 200 しか返せません。
      response: { 200: ReportDetailSchema, 404: ErrorBodySchema },
    },
  )
  .post(
    "/reports/:reportId/lines",
    async ({ body, params, status }) => {
      const added = await service.addReportLine(params.reportId, body);

      if (Result.isError(added)) {
        return status(404, toErrorBody(added.error));
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
      response: { 200: v.object({ ok: v.literal(true) }), 404: ErrorBodySchema },
    },
  );
