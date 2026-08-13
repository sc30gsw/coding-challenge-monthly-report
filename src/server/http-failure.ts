import { matchError } from "better-result";
import * as v from "valibot";

import type { ReportError } from "~/features/reports/domain/errors";

/**
 * 失敗の種類ごとの見せ方です。`matchError` は網羅を要求するので、
 * 状態遷移の拒否が増えたときに、ここで型エラーとして気づけます。
 *
 * - 404: 存在しない
 * - 403: 存在するが、その人には見せない
 * - 409: 存在も権限もあるが、いまの状態ではできない
 */
export function toHttpFailure(error: ReportError) {
  const body = { message: error.message, tag: error._tag };

  return matchError(error, {
    ClientNotFound: () => ({ body, status: 404 as const }),
    LineNotInReport: () => ({ body, status: 404 as const }),
    LinesNotFullyApproved: () => ({ body, status: 409 as const }),
    NotLineOwner: () => ({ body, status: 403 as const }),
    ReportHasNoLines: () => ({ body, status: 409 as const }),
    ReportNotFound: () => ({ body, status: 404 as const }),
    ReportNotVisible: () => ({ body, status: 403 as const }),
    TransitionNotAllowed: () => ({ body, status: 409 as const }),
  });
}

const ErrorBodySchema = v.object({ message: v.string(), tag: v.string() });

/** 失敗しうるルートは、この 3 つのステータスを宣言しておきます。 */
export const failureResponses = {
  403: ErrorBodySchema,
  404: ErrorBodySchema,
  409: ErrorBodySchema,
};
