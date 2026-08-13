import { openapi } from "@elysia/openapi";
import { toJsonSchema } from "@valibot/to-json-schema";
import { sql } from "drizzle-orm";
import { Elysia } from "elysia";
import * as v from "valibot";

import { db } from "~/db/client";

/**
 * API 層。TanStack Start のサーバールートにマウントするため `.listen()` は呼びません。
 * @see docs/adr/0001-elysia-mounted-inside-tanstack-start.md
 */

const HealthResponseSchema = v.object({
  database: v.picklist(["up", "down"]),
  status: v.literal("ok"),
});

export const app = new Elysia({ prefix: "/api" })
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
