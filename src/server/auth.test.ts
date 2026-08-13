import { beforeEach, describe, expect, it } from "vite-plus/test";

import { app } from "~/server/app";
import { createActors } from "~/test/fixtures";

/**
 * 認証は要件が許容するダミーログインですが、**サーバーが毎リクエストで検証する**ことは
 * 譲りません。Cookie を書き換えるだけで他人になれるなら、この先の権限設計は全部無意味です。
 *
 * @see docs/adr/0015-signed-cookie-dummy-login.md
 */

let actors: Awaited<ReturnType<typeof createActors>>;

beforeEach(async () => {
  actors = await createActors();
});

function request(path: string, init?: RequestInit) {
  return app.handle(new Request(`http://localhost/api${path}`, init));
}

async function login(userId: string) {
  const res = await request("/auth/login", {
    body: JSON.stringify({ userId }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  const setCookie = res.headers.get("set-cookie") ?? "";
  const session = setCookie.split(";")[0] ?? "";

  return { cookie: session, res };
}

describe("ログイン", () => {
  it("選んだユーザーとしてログインでき、以後の要求で本人だと分かる", async () => {
    const { cookie, res } = await login(actors.admin.id);

    expect(res.status).toBe(200);

    const me = await request("/auth/me", { headers: { cookie } });

    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toEqual({
      id: actors.admin.id,
      name: actors.admin.name,
      role: "admin",
    });
  });

  it("Cookie は httpOnly で、値に署名が付く", async () => {
    const { res } = await login(actors.sales.id);
    const setCookie = res.headers.get("set-cookie") ?? "";
    const value = setCookie.split(";")[0]?.split("=")[1] ?? "";

    expect(setCookie.toLowerCase()).toContain("httponly");
    // 署名は完全性のための仕組みで、値を隠すものではありません。
    // 守りたいのは「書き換えたら弾かれる」ことなので、署名が付いていることを確認します。
    expect(value.startsWith(`${actors.sales.id}.`)).toBe(true);
  });

  it("存在しないユーザーではログインできない", async () => {
    const { res } = await login("00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(401);
  });
});

describe("セッションの検証", () => {
  it("Cookie が無ければ拒否される", async () => {
    const res = await request("/auth/me");

    expect(res.status).toBe(401);
  });

  it("Cookie を改竄した要求は拒否される", async () => {
    // ここが署名を残した理由そのものです。生の user_id を入れていれば、
    // 開発者ツールで書き換えるだけで他人になれます。
    const { cookie } = await login(actors.sales.id);
    const tampered = `${cookie.slice(0, -4)}beef`;

    const res = await request("/auth/me", { headers: { cookie: tampered } });

    expect(res.status).toBe(401);
  });

  it("他人の署名済み Cookie を組み立て直しても通らない", async () => {
    const { cookie } = await login(actors.sales.id);
    const [name = ""] = cookie.split("=");
    const forged = `${name}=${actors.admin.id}`;

    const res = await request("/auth/me", { headers: { cookie: forged } });

    expect(res.status).toBe(401);
  });

  it("検証できない Cookie を持っていてもログインし直せる", async () => {
    // 署名の検証はルーティングより前に起きるので、壊れた Cookie を持っていると
    // セッションを必要としない /auth/login まで 401 になります。拒否と同時に
    // その Cookie を消さないと、ログインする手段が無いまま締め出されます。
    const { cookie } = await login(actors.admin.id);
    const tampered = `${cookie.slice(0, -4)}beef`;

    const refused = await request("/auth/me", { headers: { cookie: tampered } });

    expect(refused.status).toBe(401);
    // 「消す」= Max-Age=0 を返すこと。次の要求は Cookie 無しとして扱われます。
    expect(refused.headers.get("set-cookie")).toContain("Max-Age=0");

    const retried = await request("/auth/login", {
      body: JSON.stringify({ userId: actors.admin.id }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(retried.status).toBe(200);
  });
});

describe("ログアウト", () => {
  it("ログアウトすると以後の要求は拒否される", async () => {
    const { cookie } = await login(actors.admin.id);

    const out = await request("/auth/logout", { headers: { cookie }, method: "POST" });

    expect(out.status).toBe(200);

    const cleared = out.headers.get("set-cookie")?.split(";")[0] ?? "";
    const me = await request("/auth/me", { headers: { cookie: cleared } });

    expect(me.status).toBe(401);
  });
});

describe("ログイン画面のユーザー一覧", () => {
  it("選べるユーザーが役割つきで並ぶ", async () => {
    const res = await request("/auth/users");
    const users = (await res.json()) as { id: string; name: string; role: string }[];

    expect(res.status).toBe(200);
    expect(users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: actors.admin.id, role: "admin" }),
        expect.objectContaining({ id: actors.sales.id, role: "sales" }),
      ]),
    );
  });
});
