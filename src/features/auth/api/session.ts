import type { SessionUser } from "~/features/auth/schemas/session-schema";
import { getApi } from "~/lib/api/client";

/**
 * 画面から見たセッションの入出力です。認可の判定はサーバーが行うので、
 * ここは「いま誰か」を取ってくるだけに留めます。
 */

/** 未ログインは失敗ではなく通常の状態なので、null を返します。 */
export async function fetchCurrentUser(): Promise<SessionUser | null> {
  const { data, error } = await getApi().auth.me.get();

  if (error) {
    return null;
  }

  return data;
}

export async function fetchSelectableUsers(): Promise<SessionUser[]> {
  const { data, error } = await getApi().auth.users.get();

  if (error) {
    return [];
  }

  return data;
}

export async function login(userId: string) {
  return await getApi().auth.login.post({ userId });
}

export async function logout() {
  return await getApi().auth.logout.post();
}
