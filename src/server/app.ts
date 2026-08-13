import { openapi } from "@elysia/openapi";
import { toJsonSchema } from "@valibot/to-json-schema";
import { sql } from "drizzle-orm";
import { Elysia } from "elysia";
import * as v from "valibot";

import { db } from "~/db/client";
import { auth, SESSION_COOKIE } from "~/server/auth";
import { commentRoutes } from "~/server/comments";
import { env } from "~/server/env";
import { reportRoutes } from "~/server/reports";

/**
 * API 層。TanStack Start のサーバールートにマウントするため `.listen()` は呼びません。
 * @see docs/adr/0001-elysia-mounted-inside-tanstack-start.md
 */

const HealthResponseSchema = v.object({
  database: v.picklist(["up", "down"]),
  status: v.literal("ok"),
});

export const app = new Elysia({
  // セッション Cookie は署名します。検証はここが一手に引き受けるので、
  // ハンドラ側は「読めたかどうか」だけを見ればよくなります。
  cookie: { secrets: env.COOKIE_SECRET, sign: [SESSION_COOKIE] },
  prefix: "/api",
})
  .use(
    openapi({
      documentation: {
        info: {
          description:
            "管理者と営業が月次報告書を共同で作成し、確定させるための API です。用語は CONTEXT.md を参照してください。",
          title: "月次報告書 共同作成アプリケーション API",
          version: "0.1.0",
        },
      },
      // Valibot スキーマを OpenAPI に写します。検証と仕様書の定義箇所を 1 つに保つためです。
      // @see docs/adr/0013-eden-treaty-with-openapi.md
      mapJsonSchema: { valibot: toJsonSchema },
      path: "/openapi",
      provider: "scalar",
    }),
  )
  /**
   * 署名の検証に失敗した Cookie は 400 ではなく 401 で返します。
   * 改竄した要求と、そもそもログインしていない要求を、呼び出し側から区別させないためです。
   *
   * **同時にその Cookie を消します。** Elysia は署名の検証をルーティングより前に行うため、
   * 検証できない Cookie を持っていると、セッションを必要としない `/auth/login` まで
   * 401 になります。消さずに 401 だけ返すと、ログインし直す手段が無いまま締め出され、
   * 復旧手段が「開発者ツールで Cookie を手で消す」しか無くなります。消しておけば、
   * 次の要求は Cookie 無しとして扱われ、ログイン画面から復帰できます。
   *
   * `VALIDATION` / `NOT_FOUND` / `PARSE` は Elysia 既定の応答（422 / 404 / 400）に
   * そのまま委ねます。ここで拾うのは、想定していない失敗（`UNKNOWN` / `INTERNAL_SERVER_ERROR`）
   * だけです。既定のハンドラは `error.message` をそのまま本文に書くため、DB の例外だと
   * 生成 SQL とバインド値が応答に漏れます。ここで拾わなければ、その形状を誰も決めていません。
   */
  .onError(({ code, error, set, status }) => {
    if (code === "INVALID_COOKIE_SIGNATURE") {
      set.headers["set-cookie"] = `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;

      return status(401, "Not signed in");
    }

    if (code === "UNKNOWN" || code === "INTERNAL_SERVER_ERROR") {
      console.error(error);

      return status(500, "Internal server error");
    }
  })
  .use(auth)
  .use(reportRoutes)
  .use(commentRoutes)
  .get(
    "/health",
    async () => {
      const database = await db
        .execute(sql`select 1`)
        .then(() => "up" as const)
        .catch(() => "down" as const);

      return { database, status: "ok" as const };
    },
    {
      detail: {
        description: "アプリと DB の疎通を確認します。",
        summary: "Health check",
        tags: ["System"],
      },
      response: HealthResponseSchema,
    },
  );

export type App = typeof app;
