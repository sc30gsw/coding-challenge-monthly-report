import { createFileRoute } from "@tanstack/react-router";

import { app } from "~/server/app";

/**
 * `/api` 配下をまるごと Elysia に渡します。ここにロジックは置きません。
 * @see docs/adr/0001-elysia-mounted-inside-tanstack-start.md
 */
export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      ANY: ({ request }) => app.handle(request),
    },
  },
});
