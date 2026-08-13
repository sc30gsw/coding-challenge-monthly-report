import { Group, Text } from "@mantine/core";

import type { ReportDetail } from "~/features/reports/schemas/report-schema";

/**
 * 確認の進み具合です。明細から算出しており、report 側には保存していません。
 *
 * 出す理由は、この業務でユーザーが知りたいのが「押せるかどうか」ではなく
 * **あと何をすれば前に進めるか**だからです。
 * @see docs/adr/0012-confirm-preconditions.md
 */
export function ReviewProgressSummary({ progress }: Record<"progress", ReportDetail["progress"]>) {
  if (progress.total === 0) {
    return (
      <Text c="dimmed" size="sm">
        明細がありません。確定するには 1 件以上必要です。
      </Text>
    );
  }

  if (progress.isFullyApproved) {
    return (
      <Text c="teal.7" size="sm">
        全 {progress.total} 件の明細が承認済みです。
      </Text>
    );
  }

  return (
    <Group gap="md">
      <Text size="sm">
        承認済み {progress.approved} / {progress.total} 件
      </Text>
      {progress.pending > 0 ? (
        <Text c="dimmed" size="sm">
          未承認 {progress.pending} 件
        </Text>
      ) : null}
      {progress.changesRequested > 0 ? (
        <Text c="orange.7" size="sm">
          差し戻し {progress.changesRequested} 件
        </Text>
      ) : null}
    </Group>
  );
}
