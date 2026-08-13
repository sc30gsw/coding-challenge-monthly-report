import type { ReportLine, ReportStatus } from "~/features/reports/schemas/report-schema";

/**
 * 状態の日本語表記です。**1 箇所だけに置きます。**
 *
 * 拒否の理由文（ドメイン層）と画面のバッジ（UI 層）が同じ言葉を使う必要があります。
 * 別々に持つと、状態を増やしたときに片方だけ直り、同じ状態が画面と本文で違う名前で出ます。
 */

export const REPORT_STATUS_LABELS = {
  confirmed: "確定済み",
  draft: "下書き",
  in_review: "確認中",
  superseded: "旧版",
} as const satisfies Record<ReportStatus, string>;

export const REPORT_LINE_STATUS_LABELS = {
  approved: "承認済み",
  changes_requested: "差し戻し",
  pending: "未確認",
} as const satisfies Record<ReportLine["status"], string>;
