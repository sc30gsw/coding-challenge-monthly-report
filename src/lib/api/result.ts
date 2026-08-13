import { Result, TaggedError } from "better-result";

/**
 * Eden の `{ data, error }` を `Result` に戻します。
 *
 * `Result` は HTTP 境界を越えません。サーバーは業務上の失敗をステータスとタグに写し、
 * クライアントは受け取った形をここで `Result` に組み直します。境界の両側で
 * 同じ扱い方（握り潰さない・理由が型に載る）を保つためです。
 * @see docs/adr/0005-better-result-for-expected-failures.md
 */

class ApiError extends TaggedError("ApiError")<{
  /** サーバーが返した業務上の理由のタグ。ネットワーク障害など、無いこともあります。 */
  detail: string | null;
  message: string;
  /**
   * サーバーが返した人間可読の理由。**そのまま画面に出せます。**
   * 拒否の文言はドメイン層が持っており、クライアントで訳し直すと必ずずれます。
   */
  reason: string | null;
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

/** 失敗の本体（`{ message, tag }`）から 1 項目を読みます。 */
function readFailure(error: unknown, key: "message" | "tag") {
  if (typeof error !== "object" || error === null || !("value" in error)) {
    return null;
  }

  const { value } = error;

  return typeof value === "object" && value !== null && key in value
    ? String(value[key as keyof typeof value])
    : null;
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
        detail: readFailure(response.error, "tag"),
        message: "API request failed",
        reason: readFailure(response.error, "message"),
        status: readStatus(response.error, response.status),
      }),
    );
  }

  if (response.data === null) {
    return Result.err(
      new ApiError({
        detail: null,
        message: "API returned no data",
        reason: null,
        status: response.status,
      }),
    );
  }

  return Result.ok(response.data);
}
