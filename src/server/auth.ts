import { asc, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import * as v from "valibot";

import { db } from "~/db/client";
import { users } from "~/db/schema";
import { LoginInputSchema } from "~/features/auth/schemas/login-schema";
import { type SessionUser, SessionUserSchema } from "~/lib/session-schema";

/**
 * 要件が許容するダミーログインです。パスワードは扱わず、seed 済みユーザーから選ぶだけ。
 *
 * ただし Cookie の署名は外しません。生の user_id を入れると、開発者ツールで書き換える
 * だけで他人になれてしまい、この先の権限設計が丸ごと意味を失います。
 *
 * 署名鍵と署名対象は `src/server/app.ts` の Elysia 設定で与えています。
 * @see docs/adr/0015-signed-cookie-dummy-login.md
 */

export const SESSION_COOKIE = "monthly_report_session";

async function findUser(id: string): Promise<SessionUser | null> {
  const [found] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return found ?? null;
}

type CookieJar = Record<string, { value?: unknown } | undefined>;

/** 署名が壊れていると Elysia は値を落とします。読めなかった時点で未ログイン扱いです。 */
async function currentUser(cookie: CookieJar) {
  const signed = cookie[SESSION_COOKIE]?.value;

  if (typeof signed !== "string") {
    return null;
  }

  return await findUser(signed);
}

export const auth = new Elysia({ name: "auth" })
  /**
   * 認可判定が通る唯一の入口です。ルートに `session: true` / `admin: true` を付けると、
   * 署名の検証とユーザーの解決を経た `user` がハンドラに渡ります。
   *
   * 画面にボタンを出さないことは防御ではありません。拒否するのは常にここです。
   */
  .macro({
    admin: {
      async resolve({ cookie, status }) {
        const user = await currentUser(cookie);

        if (!user) {
          return status(401, "Not signed in");
        }

        if (user.role !== "admin") {
          return status(403, "Administrators only");
        }

        return { user };
      },
    },
    session: {
      async resolve({ cookie, status }) {
        const user = await currentUser(cookie);

        if (!user) {
          return status(401, "Not signed in");
        }

        return { user };
      },
    },
  })
  .get(
    "/auth/users",
    async () =>
      await db
        .select({ id: users.id, name: users.name, role: users.role })
        .from(users)
        .orderBy(asc(users.role), asc(users.name)),
    {
      detail: {
        description: "ログイン画面で選べるユーザーの一覧です。",
        summary: "選択可能なユーザー",
        tags: ["Auth"],
      },
      response: v.array(SessionUserSchema),
    },
  )
  .post(
    "/auth/login",
    async ({ body, cookie, status }) => {
      const user = await findUser(body.userId);

      if (!user) {
        return status(401, "Unknown user");
      }

      const session = cookie[SESSION_COOKIE];

      session?.set({
        httpOnly: true,
        maxAge: 60 * 60 * 8,
        path: "/",
        sameSite: "lax",
        value: user.id,
      });

      return user;
    },
    {
      body: LoginInputSchema,
      detail: {
        description: "選んだユーザーとしてログインします。パスワードはありません。",
        summary: "ログイン",
        tags: ["Auth"],
      },
    },
  )
  .post(
    "/auth/logout",
    ({ cookie }) => {
      cookie[SESSION_COOKIE]?.remove();

      return { ok: true as const };
    },
    {
      detail: { summary: "ログアウト", tags: ["Auth"] },
    },
  )
  .get("/auth/me", ({ user }) => user, {
    detail: {
      description: "いま誰としてログインしているかを返します。",
      summary: "現在のユーザー",
      tags: ["Auth"],
    },
    response: SessionUserSchema,
    session: true,
  });
