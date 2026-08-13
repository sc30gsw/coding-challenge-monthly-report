import * as v from "valibot";

/** サーバーのルート定義・OpenAPI・フォームが共有する唯一の定義です。 */

const RoleSchema = v.picklist(["admin", "sales"]);

export const SessionUserSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.string(),
  role: RoleSchema,
});

export const LoginInputSchema = v.object({
  userId: v.pipe(v.string(), v.uuid("ユーザーを選択してください")),
});

export type Role = v.InferOutput<typeof RoleSchema>;
export type SessionUser = v.InferOutput<typeof SessionUserSchema>;
