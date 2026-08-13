/// <reference types="vite-plus/client" />
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import "dayjs/locale/ja";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

import { RouteStatus } from "~/components/route-status";
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
  errorComponent: ({ error }: ErrorComponentProps) => <RouteStatus error={error} kind="error" />,
  head: () => ({
    links: [{ href: appCss, rel: "stylesheet" }],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { title: "月次報告書 共同作成アプリケーション" },
    ],
  }),
  notFoundComponent: () => <RouteStatus kind="not-found" />,
  pendingComponent: () => <RouteStatus kind="pending" />,
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
