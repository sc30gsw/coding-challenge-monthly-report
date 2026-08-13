import * as v from "valibot";

/** ログイン画面が送る形です。ユーザーを選ぶだけで、パスワードはありません。 */
export const LoginInputSchema = v.object({
  userId: v.pipe(v.string(), v.uuid("ユーザーを選択してください")),
});
