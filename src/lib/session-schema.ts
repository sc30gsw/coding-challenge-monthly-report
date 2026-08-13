import * as v from "valibot";

/**
 * ログイン中のユーザーの形です。サーバーのルート定義・OpenAPI・フォーム・
 * `reports` と `comments` の両 feature が共有するため、どの feature にも
 * 属さないここに置きます。ログインフォーム専用の入力形は
 * `features/auth/schemas/login-schema.ts` にあります。
 */

const RoleSchema = v.picklist(["admin", "sales"]);

export const SessionUserSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.string(),
  role: RoleSchema,
});

export type Role = v.InferOutput<typeof RoleSchema>;
export type SessionUser = v.InferOutput<typeof SessionUserSchema>;
