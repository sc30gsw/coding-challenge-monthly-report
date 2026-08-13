import type {
  CreateReportInput,
  CreateReportLineInput,
  RequestChangesInput,
} from "~/features/reports/schemas/report-schema";
import { getApi } from "~/lib/api/client";
import { toResult } from "~/lib/api/result";

/**
 * 画面から見た報告書の入出力です。
 *
 * 失敗を握り潰しません。空配列や null に潰すと、権限で弾かれたのか本当に無いのかを
 * 呼び出し側が区別できなくなります。判断は呼び出し側（ルートの loader）が行います。
 * @see docs/adr/0005-better-result-for-expected-failures.md
 */

export async function fetchReports() {
  return toResult(await getApi().reports.get());
}

export async function fetchReport(reportId: string) {
  return toResult(await getApi().reports({ reportId }).get());
}

export async function fetchClients() {
  return toResult(await getApi().clients.get());
}

export async function createReport(input: CreateReportInput) {
  return toResult(await getApi().reports.post(input));
}

export async function addReportLine(reportId: string, input: CreateReportLineInput) {
  return toResult(await getApi().reports({ reportId }).lines.post(input));
}

export async function requestReview(reportId: string) {
  return toResult(await getApi().reports({ reportId }).review.post());
}

export async function approveLine(lineId: string) {
  return toResult(await getApi().lines({ lineId }).approve.post());
}

export async function requestLineChanges(lineId: string, input: RequestChangesInput) {
  return toResult(await getApi().lines({ lineId }).changes.post(input));
}

export async function updateReportLine(lineId: string, input: CreateReportLineInput) {
  return toResult(await getApi().lines({ lineId }).patch(input));
}

export async function removeReportLine(lineId: string) {
  return toResult(await getApi().lines({ lineId }).delete());
}

export async function confirmReport(reportId: string) {
  return toResult(await getApi().reports({ reportId }).confirm.post());
}
