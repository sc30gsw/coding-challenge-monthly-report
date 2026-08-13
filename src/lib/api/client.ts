import { treaty } from "@elysia/eden";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { type App, app } from "~/server/app";

/**
 * サーバー側では HTTP を経由せずハンドラを直接呼び、クライアント側では HTTP で叩きます。
 * 型はどちらも `typeof app` から引くので、ルート定義を変えた瞬間に呼び出し側が壊れます。
 * @see docs/adr/0013-eden-treaty-with-openapi.md
 *
 * リクエストごとに呼んでください。SSR では受け取った Cookie を引き継ぐ必要があり、
 * モジュール読み込み時に 1 度だけ組み立てると、最初の 1 リクエスト分の Cookie が
 * 全員に使い回されます。
 */
export const getApi = createIsomorphicFn()
  .server(() => treaty<App>(app, { headers: getRequestHeaders() }).api)
  .client(() => treaty<App>(window.location.origin).api);
