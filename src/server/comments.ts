import { Result } from "better-result";
import { Elysia } from "elysia";
import * as v from "valibot";

import {
  CommentSchema,
  CreateCommentInputSchema,
} from "~/features/comments/schemas/comment-schema";
import { auth } from "~/server/auth";
import * as service from "~/server/comments-service";
import { failureResponses, toHttpFailure } from "~/server/http-failure";

/**
 * コメントの HTTP 境界です。報告書のコントローラとは別のインスタンスにしています
 * （1 インスタンス 1 コントローラ）。
 *
 * 見える範囲は報告書と同じ判定を共有します。担当外の報告書にコメントできてしまうと、
 * 「見えないものには触れない」という前提が崩れます。
 */
export const commentRoutes = new Elysia({ name: "comments" })
  .use(auth)
  .get(
    "/reports/:reportId/comments",
    async ({ params, status, user }) => {
      const listed = await service.listComments(user, params.reportId);

      if (Result.isError(listed)) {
        const failure = toHttpFailure(listed.error);

        return status(failure.status, failure.body);
      }

      return listed.value;
    },
    {
      detail: {
        description: "報告書単位・明細単位のコメントを、古い順に返します。",
        summary: "コメントの一覧",
        tags: ["Comments"],
      },
      response: { 200: v.array(CommentSchema), ...failureResponses },
      session: true,
    },
  )
  .post(
    "/reports/:reportId/comments",
    async ({ body, params, status, user }) => {
      const posted = await service.postComment(user, params.reportId, body);

      if (Result.isError(posted)) {
        const failure = toHttpFailure(posted.error);

        return status(failure.status, failure.body);
      }

      return posted.value;
    },
    {
      body: CreateCommentInputSchema,
      detail: {
        description:
          "コメントを投稿します。lineId を渡すと明細へのコメントになります。確定済みの報告書にも投稿できます（コメントは報告書の中身ではないため）。",
        summary: "コメントの投稿",
        tags: ["Comments"],
      },
      response: { 200: v.object({ ok: v.literal(true) }), ...failureResponses },
      session: true,
    },
  );
