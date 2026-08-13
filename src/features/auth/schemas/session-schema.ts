import { createSelectSchema } from "drizzle-valibot";
import * as v from "valibot";

import { users } from "~/db/schema";

/** サーバーのルート定義・OpenAPI・フォームが共有する唯一の定義です。 */

const UserRowSchema = createSelectSchema(users);

export const SessionUserSchema = v.pick(UserRowSchema, ["id", "name", "role"]);

export const LoginInputSchema = v.object({
  userId: v.pipe(v.string(), v.uuid("ユーザーを選択してください")),
});

export type SessionUser = v.InferOutput<typeof SessionUserSchema>;
export type Role = SessionUser["role"];
export type LoginInput = v.InferOutput<typeof LoginInputSchema>;

export const ROLE_LABELS = {
  admin: "管理者",
  sales: "営業",
} as const satisfies Record<Role, string>;
