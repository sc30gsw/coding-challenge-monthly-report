import { createFileRoute, redirect } from "@tanstack/react-router";

/** 起点は報告書の一覧です。中身はロールごとに変わります（管理者は全件、営業は担当分）。 */
export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    throw redirect({ to: context.user ? "/reports" : "/login" });
  },
});
