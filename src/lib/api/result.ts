import { Result, TaggedError } from "better-result";

/**
 * Eden の `{ data, error }` を `Result` に戻します。
 *
 * `Result` は HTTP 境界を越えません。サーバーは業務上の失敗をステータスとタグに写し、
 * クライアントは受け取った形をここで `Result` に組み直します。境界の両側で
 * 同じ扱い方（握り潰さない・理由が型に載る）を保つためです。
 * @see docs/adr/0005-better-result-for-expected-failures.md
 */

export class ApiError extends TaggedError("ApiError")<{
  /** サーバーが返した業務上の理由。ネットワーク障害など、無いこともあります。 */
  detail: string | null;
  message: string;
  status: number;
}> {}

/**
 * Eden の応答を構造で受けます。Eden 側の型に密着させると、
 * ルートごとに少しずつ違う応答型のたびにここが壊れます。
 */
type EdenResponse<T> = {
  data: T | null;
  error: unknown;
  status: number;
};

function readTag(error: unknown) {
  if (typeof error !== "object" || error === null || !("value" in error)) {
    return null;
  }

  const { value } = error;

  return typeof value === "object" && value !== null && "tag" in value ? String(value.tag) : null;
}

function readStatus(error: unknown, fallback: number) {
  if (typeof error === "object" && error !== null && "status" in error) {
    return typeof error.status === "number" ? error.status : fallback;
  }

  return fallback;
}

/**
 * loader の境界で、想定していない失敗を投げ直します。
 *
 * loader が返す値は SSR でシリアライズされるため、`Result` のまま返せません。
 * 業務上ありうる失敗（見つからない等）は呼び出し側が個別に扱い、それ以外——
 * 権限で弾かれた、API が壊れている——はここで例外にしてエラー画面に出します。
 */
export function orThrow<T>(result: Result<T, ApiError>): T {
  if (Result.isError(result)) {
    throw new Error(`${result.error.message} (${result.error.status})`);
  }

  return result.value;
}

export function toResult<T>(response: EdenResponse<T>): Result<T, ApiError> {
  if (response.error) {
    return Result.err(
      new ApiError({
        detail: readTag(response.error),
        message: "API request failed",
        status: readStatus(response.error, response.status),
      }),
    );
  }

  if (response.data === null) {
    return Result.err(
      new ApiError({ detail: null, message: "API returned no data", status: response.status }),
    );
  }

  return Result.ok(response.data);
}
