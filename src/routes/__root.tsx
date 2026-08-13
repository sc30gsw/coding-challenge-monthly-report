/// <reference types="vite-plus/client" />
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import "dayjs/locale/ja";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

import { fetchCurrentUser } from "~/features/auth/api/session";
import { SessionBar } from "~/features/auth/components/session-bar";
import { theme } from "~/lib/theme";

import appCss from "~/styles.css?url";

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(async () => {
      const { TanStackRouterDevtools } = await import("~/router-devtools");
      return { default: TanStackRouterDevtools };
    })
  : null;

export const Route = createRootRoute({
  /**
   * セッションはここで一度だけ解決し、以降のルートは `context.user` を読むだけにします。
   * 画面側で判定を散らかさないためで、**認可そのものはサーバーが毎リクエストで行います**。
   */
  beforeLoad: async () => ({ user: await fetchCurrentUser() }),
  component: RootComponent,
  errorComponent: ErrorComponent,
  head: () => ({
    links: [{ href: appCss, rel: "stylesheet" }],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { title: "月次報告書 共同作成アプリケーション" },
    ],
  }),
  notFoundComponent: NotFoundComponent,
  pendingComponent: PendingComponent,
});

function RootComponent() {
  const { user } = Route.useRouteContext();

  return (
    <html lang="ja" {...mantineHtmlProps}>
      <head>
        <HeadContent />
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider theme={theme}>
          {/* 日付の表示と週の始まりは日本向けに一括で設定します。
              個々の入力に locale を書くと、足すたびに揃え忘れが出ます。 */}
          <DatesProvider settings={{ firstDayOfWeek: 0, locale: "ja" }}>
            {user ? <SessionBar user={user} /> : null}
            <Outlet />
            {TanStackRouterDevtools ? (
              <Suspense fallback={null}>
                <TanStackRouterDevtools position="bottom-right" />
              </Suspense>
            ) : null}
          </DatesProvider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundComponent() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold">404</h1>
      <p>ページが見つかりませんでした。</p>
    </div>
  );
}

function ErrorComponent({ error }: ErrorComponentProps) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold text-red-600">エラー</h1>
      <p>{error.message}</p>
    </div>
  );
}

function PendingComponent() {
  return (
    <div className="p-4">
      <p>読み込み中...</p>
    </div>
  );
}
