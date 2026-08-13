import { app } from "~/server/app";

/**
 * API を「外から」叩くための道具です。
 *
 * 画面を経由しないので、UI に操作ボタンが出ていないことが防御になっていないかを
 * そのまま試せます。権限のテストはこの経路でしか意味を持ちません。
 */

function url(path: string) {
  return `http://localhost/api${path}`;
}

/** 指定したユーザーとしてログインし、以後の要求に使う Cookie を返します。 */
export async function signInAs(userId: string) {
  const res = await app.handle(
    new Request(url("/auth/login"), {
      body: JSON.stringify({ userId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

  return cookie;
}

type CallOptions = {
  body?: unknown;
  cookie?: string;
  method?: string;
};

export async function call(path: string, { body, cookie, method = "GET" }: CallOptions = {}) {
  const headers: Record<string, string> = {};

  if (cookie) {
    headers["cookie"] = cookie;
  }

  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const res = await app.handle(
    new Request(url(path), {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers,
      method,
    }),
  );

  const text = await res.text();

  return {
    json: <T>() => JSON.parse(text) as T,
    status: res.status,
    text,
  };
}
