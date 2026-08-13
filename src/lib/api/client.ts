import { treaty } from "@elysia/eden";
import { createIsomorphicFn } from "@tanstack/react-start";

import { type App, app } from "~/server/app";

/**
 * サーバー側では HTTP を経由せずハンドラを直接呼び、クライアント側では HTTP で叩きます。
 * 型はどちらも `typeof app` から引くので、ルート定義を変えた瞬間に呼び出し側が壊れます。
 * @see docs/adr/0013-eden-treaty-with-openapi.md
 */
const resolveApi = createIsomorphicFn()
  .server(() => treaty<App>(app).api)
  .client(() => treaty<App>(window.location.origin).api);

export const api = resolveApi();
