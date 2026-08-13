import { Badge } from "@mantine/core";

import { REPORT_STATUS_LABELS } from "~/features/reports/domain/status-labels";
import type { ReportStatus } from "~/features/reports/schemas/report-schema";

const STATUS_COLORS = {
  confirmed: "green",
  draft: "gray",
  in_review: "blue",
  superseded: "orange",
} as const satisfies Record<ReportStatus, string>;

export function ReportStatusBadge({ status }: Record<"status", ReportStatus>) {
  return (
    <Badge color={STATUS_COLORS[status]} variant="light">
      {REPORT_STATUS_LABELS[status]}
    </Badge>
  );
}
