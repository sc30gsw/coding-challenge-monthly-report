import { Card, Group, Text } from "@mantine/core";

import { ReportLink } from "~/components/report-link";
import { ReportStatusBadge } from "~/features/reports/components/report-status-badge";
import type { SeriesVersion } from "~/features/reports/schemas/report-schema";

type VersionHistoryProps = {
  currentId: string;
  versions: SeriesVersion[];
};

/**
 * 同じ系列の版を並べて、いま何版を見ているかと、他の版への導線を出します。
 *
 * 旧版を消さずに残す設計なので、辿れなければ残した意味がありません。取引先に出した
 * 版の中身を後から確認するのは、修正版フローで最も起きる操作です。
 * @see docs/adr/0009-revision-is-a-copied-report.md
 */
export function VersionHistory({ currentId, versions }: VersionHistoryProps) {
  // 初版しか無いなら、版という概念を画面に持ち込みません。
  if (versions.length < 2) {
    return null;
  }

  return (
    <Card padding="sm" radius="md" withBorder>
      <Group gap="md">
        <Text c="dimmed" size="xs">
          版の履歴
        </Text>
        {versions.map((entry) => (
          <Group gap={6} key={entry.id}>
            {entry.id === currentId ? (
              <Text fw={600} size="sm">
                第 {entry.version} 版（表示中）
              </Text>
            ) : (
              <ReportLink className="text-sm" reportId={entry.id}>
                第 {entry.version} 版
              </ReportLink>
            )}
            <ReportStatusBadge status={entry.status} />
          </Group>
        ))}
      </Group>
    </Card>
  );
}
