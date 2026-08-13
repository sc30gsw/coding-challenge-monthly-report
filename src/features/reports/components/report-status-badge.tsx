import { Badge } from "@mantine/core";

import type { ReportStatus } from "~/features/reports/schemas/report-schema";

const STATUS_LABELS = {
  confirmed: "確定済み",
  draft: "下書き",
  in_review: "確認中",
  superseded: "旧版",
} as const satisfies Record<ReportStatus, string>;

const STATUS_COLORS = {
  confirmed: "green",
  draft: "gray",
  in_review: "blue",
  superseded: "orange",
} as const satisfies Record<ReportStatus, string>;

export function ReportStatusBadge({ status }: Record<"status", ReportStatus>) {
  return (
    <Badge color={STATUS_COLORS[status]} variant="light">
      {STATUS_LABELS[status]}
    </Badge>
  );
}
