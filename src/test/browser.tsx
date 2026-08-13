import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import "dayjs/locale/ja";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { app } from "~/server/app";

/**
 * フロントの integration テスト用の土台です。
 *
 * **API はモックしません。** `fetch` をインプロセスの Elysia アプリへ差し向けるだけで、
 * ルーティング・入力検証・認可・DB は本物を通ります。クライアントをスタブすると、
 * サーバーが変わってもテストが緑のままになり、この層を置く意味が無くなります。
 * @see docs/adr/0013-eden-treaty-with-openapi.md
 */

const ORIGIN = "http://localhost";

/**
 * jsdom に無いブラウザ API を補います。Mantine は配色スキームの判定に
 * `matchMedia` を使うため、これが無いと描画の時点で落ちます。
 * 部品側にテスト用の分岐を入れないよう、埋めるのはここだけにします。
 */
if (typeof window !== "undefined" && typeof window.ResizeObserver !== "function") {
  // Select などの浮動要素の位置決めに使われます。測る対象が無いので何もしない実装で足ります。
  window.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
}

if (typeof document !== "undefined" && !document.fonts) {
  // Textarea の autosize が、フォント読み込み後に高さを測り直すために購読します。
  // jsdom は FontFaceSet を持たないので、何も起きないイベントターゲットを置きます。
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
}

if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  // Select が候補までスクロールするのに使います。jsdom には無いので何もしない実装で足ります。
  Element.prototype.scrollIntoView = () => {};
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      addEventListener: () => {},
      addListener: () => {},
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => {},
      removeListener: () => {},
    }) as MediaQueryList;
}

/** ブラウザの代わりに Cookie を保持します。ログイン状態が要求をまたいで続くようにするためです。 */
class CookieJar {
  private jar = new Map<string, string>();

  header() {
    return [...this.jar].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  absorb(response: Response) {
    const setCookie = response.headers.getSetCookie?.() ?? [];

    for (const entry of setCookie) {
      const [pair = ""] = entry.split(";");
      const [name, ...rest] = pair.split("=");

      if (!name) {
        continue;
      }

      const value = rest.join("=");

      if (value === "" || entry.includes("Max-Age=0")) {
        this.jar.delete(name);
      } else {
        this.jar.set(name, value);
      }
    }
  }
}

/**
 * `fetch` をアプリ本体に繋ぎ替えます。ソケットを挟まないだけで、経路は本番と同じです。
 * 返り値でテストごとの後片付けを行います。
 */
export function connectFetchToApp() {
  const jar = new CookieJar();
  const original = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const request = new Request(input as RequestInfo, init);
    const cookie = jar.header();

    if (cookie) {
      request.headers.set("cookie", cookie);
    }

    const response = await app.handle(request);

    jar.absorb(response);

    return response;
  };

  return () => {
    globalThis.fetch = original;
    // Testing Library の自動 cleanup は globals 経由でしか登録されません。
    // 明示的に片付けないと、前のテストの DOM が残って要素が二重に見つかります。
    cleanup();
  };
}

/** ログイン済みの状態から始めたいテストのために、Cookie を仕込みます。 */
export async function signInBrowserAs(userId: string) {
  await fetch(`${ORIGIN}/api/auth/login`, {
    body: JSON.stringify({ userId }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

type RenderOptions = {
  /**
   * `Link` や `navigate` の行き先として解決できるようにするパスです。
   * ルーターは知らないパスを組み立てられず、そのまま例外になります。
   */
  routes?: string[];
};

/**
 * Mantine の provider と、`useRouter` を使う部品のためのルーターを与えて描画します。
 * 部品側にテスト用の分岐を持ち込まないための場所です。
 */
export async function renderWithProviders(ui: ReactNode, { routes = [] }: RenderOptions = {}) {
  const rootRoute = createRootRoute({ component: () => ui });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren(
      routes.map((path) =>
        createRoute({ component: () => null, getParentRoute: () => rootRoute, path }),
      ),
    ),
  });

  // provider の構成はアプリ（`src/routes/__root.tsx`）と揃えます。ずれると、
  // 日付の表記のような「アプリでは正しいのにテストでだけ違う」差が出ます。
  const result = render(
    <MantineProvider>
      <DatesProvider settings={{ firstDayOfWeek: 0, locale: "ja" }}>
        <RouterProvider router={router as never} />
      </DatesProvider>
    </MantineProvider>,
  );

  // ルーターが初回のマッチを解決するまで、中身は空です。ここで待たないと
  // テストが「まだ描画されていない」だけの理由で落ちます。
  await act(async () => {
    await router.load();
  });

  return { user: userEvent.setup(), ...result };
}
