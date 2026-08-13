import { Result } from "better-result";

import type { SessionUser } from "~/features/auth/schemas/session-schema";
import { getApi } from "~/lib/api/client";
import { toResult } from "~/lib/api/result";

/**
 * 画面から見たセッションの入出力です。認可の判定はサーバーが行うので、
 * ここは「いま誰か」を取ってくるだけに留めます。
 */

/**
 * 未ログインは失敗ではなく通常の状態です。ここだけは Result を潰して null を返します。
 * 「まだログインしていない」と「API が壊れている」を呼び出し側が区別する必要がないためです。
 */
export async function fetchCurrentUser(): Promise<SessionUser | null> {
  const result = toResult(await getApi().auth.me.get());

  return Result.isError(result) ? null : result.value;
}

export async function fetchSelectableUsers() {
  return toResult(await getApi().auth.users.get());
}

export async function login(userId: string) {
  return toResult(await getApi().auth.login.post({ userId }));
}

export async function logout() {
  return toResult(await getApi().auth.logout.post());
}
