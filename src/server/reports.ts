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
  RequestChangesInputSchema,
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
    NotLineOwner: () => ({ body, status: 403 as const }),
    ReportHasNoLines: () => ({ body, status: 409 as const }),
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
  .patch(
    "/lines/:lineId",
    async ({ body, params, status }) => {
      const updated = await service.updateReportLine(params.lineId, body);

      if (Result.isError(updated)) {
        const failure = toHttpFailure(updated.error);

        return status(failure.status, failure.body);
      }

      return updated.value;
    },
    {
      admin: true,
      body: CreateReportLineInputSchema,
      detail: {
        description:
          "明細の内容を書き換えます。編集した行の確認状況は未確認に戻ります（承認はレビューした内容に対する意思表示のため）。",
        summary: "明細の編集",
        tags: ["Reports"],
      },
      response: { 200: v.object({ ok: v.literal(true) }), ...failureResponses },
    },
  )
  .delete(
    "/lines/:lineId",
    async ({ params, status }) => {
      const removed = await service.removeReportLine(params.lineId);

      if (Result.isError(removed)) {
        const failure = toHttpFailure(removed.error);

        return status(failure.status, failure.body);
      }

      return removed.value;
    },
    {
      admin: true,
      detail: {
        description:
          "明細を削除します。下書き中だけです。確認依頼後に許すと、差し戻された指摘を消して確定できてしまいます。",
        summary: "明細の削除",
        tags: ["Reports"],
      },
      response: { 200: v.object({ ok: v.literal(true) }), ...failureResponses },
    },
  )
  .post(
    "/lines/:lineId/approve",
    async ({ params, status, user }) => {
      const approved = await service.approveLine(user, params.lineId);

      if (Result.isError(approved)) {
        const failure = toHttpFailure(approved.error);

        return status(failure.status, failure.body);
      }

      return approved.value;
    },
    {
      detail: {
        description: "担当する明細の内容に問題がないことを表明します。",
        summary: "明細の承認",
        tags: ["Reports"],
      },
      response: { 200: v.object({ ok: v.literal(true) }), ...failureResponses },
      session: true,
    },
  )
  .post(
    "/lines/:lineId/changes",
    async ({ body, params, status, user }) => {
      const sent = await service.requestLineChanges(user, params.lineId, body.reason);

      if (Result.isError(sent)) {
        const failure = toHttpFailure(sent.error);

        return status(failure.status, failure.body);
      }

      return sent.value;
    },
    {
      body: RequestChangesInputSchema,
      detail: {
        description:
          "担当する明細を理由つきで差し戻します。報告書の状態は変わりません（明細ごとに承認と差し戻しが混在するため）。",
        summary: "明細の差し戻し",
        tags: ["Reports"],
      },
      response: { 200: v.object({ ok: v.literal(true) }), ...failureResponses },
      session: true,
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
