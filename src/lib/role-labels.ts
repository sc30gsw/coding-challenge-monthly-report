import type { Role } from "~/lib/session-schema";

/**
 * ロールの日本語表記です。**1 箇所だけに置きます。**
 *
 * ログイン画面・セッション表示・コメントの投稿者表示が同じ言葉を使う必要があります。
 * 別々に持つと、ロールを増やしたときに片方だけ直り、画面ごとに違う名前で出ます。
 */
export const ROLE_LABELS = {
  admin: "管理者",
  sales: "営業",
} as const satisfies Record<Role, string>;
