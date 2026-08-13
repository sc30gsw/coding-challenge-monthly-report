import { Result, TaggedError } from "better-result";

import type { SessionUser } from "~/features/auth/schemas/session-schema";
import { getApi } from "~/lib/api/client";

/**
 * 画面から見たセッションの入出力です。認可の判定はサーバーが行うので、
 * ここは「いま誰か」を取ってくるだけに留めます。
 */

export class AuthRequestFailed extends TaggedError("AuthRequestFailed")<{
  cause?: unknown;
  message: string;
}> {}

type EdenPayload<T> = {
  data: T | null;
  error: unknown;
};

async function postSession<T>(request: () => Promise<EdenPayload<T>>, message: string) {
  const response = await Result.tryPromise({
    catch: (cause) => new AuthRequestFailed({ cause, message }),
    try: request,
  });

  if (Result.isError(response)) {
    return response;
  }

  const { data, error } = response.value;

  if (error || data == null) {
    return Result.err(new AuthRequestFailed({ cause: error, message }));
  }

  return Result.ok(data);
}

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
  return await postSession(
    async () => await getApi().auth.login.post({ userId }),
    "ログインできませんでした",
  );
}

export async function logout() {
  return await postSession(
    async () => await getApi().auth.logout.post(),
    "ログアウトできませんでした",
  );
}
