/// <reference types="vite-plus/client" />
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

import { NotFound } from "~/components/not-found";
import { Pending } from "~/components/pending";
import { RouteError } from "~/components/route-error";
import { theme } from "~/lib/theme";

import appCss from "~/styles.css?url";

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(async () => {
      const { TanStackRouterDevtools } = await import("~/router-devtools");
      return { default: TanStackRouterDevtools };
    })
  : null;

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RouteError,
  head: () => ({
    links: [{ href: appCss, rel: "stylesheet" }],
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { title: "TanStack Start Template" },
    ],
  }),
  notFoundComponent: NotFound,
  pendingComponent: Pending,
});

function RootComponent() {
  return (
    <html lang="ja" {...mantineHtmlProps}>
      <head>
        <HeadContent />
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider theme={theme}>
          <Outlet />
          {TanStackRouterDevtools ? (
            <Suspense fallback={null}>
              <TanStackRouterDevtools position="bottom-right" />
            </Suspense>
          ) : null}
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  );
}
