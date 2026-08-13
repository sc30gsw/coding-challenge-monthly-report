import { Badge, Group, Table, Text } from "@mantine/core";

import type { ReportDetail, ReportLine } from "~/features/reports/schemas/report-schema";

type ReportLineTableProps = {
  lines: ReportDetail["lines"];
  /** いま見ている人。自分の担当行に印をつけるために使います。 */
  viewerId: string;
};

const LINE_STATUS_LABELS = {
  approved: "承認済み",
  changes_requested: "差し戻し",
  pending: "未確認",
} as const satisfies Record<ReportLine["status"], string>;

const yen = new Intl.NumberFormat("ja-JP", { currency: "JPY", style: "currency" });

/**
 * 明細の一覧です。
 *
 * 営業には報告書を**全体として**見せ、自分の担当行だけに印をつけます。
 * 自分の行に絞ると金額合計が何を指すのか分からないまま承認することになり、
 * 印が無いとどれを確認すべきかが読み取れません。
 * @see docs/adr/0010-sales-owner-lives-on-the-line.md
 */
export function ReportLineTable({ lines, viewerId }: ReportLineTableProps) {
  if (lines.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        明細がありません。確定するには 1 件以上必要です。
      </Text>
    );
  }

  return (
    <Table highlightOnHover striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>案件名</Table.Th>
          <Table.Th>担当営業</Table.Th>
          <Table.Th>確認状況</Table.Th>
          <Table.Th className="text-right">金額</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {lines.map((line) => (
          <Table.Tr key={line.id}>
            <Table.Td>{line.projectName}</Table.Td>
            <Table.Td>
              <Group gap="xs">
                {line.salesOwner.name}
                {line.salesOwner.id === viewerId ? (
                  <Badge color="teal" size="sm" variant="light">
                    自分の担当
                  </Badge>
                ) : null}
              </Group>
            </Table.Td>
            <Table.Td>{LINE_STATUS_LABELS[line.status]}</Table.Td>
            <Table.Td className="text-right tabular-nums">
              {yen.format(Number(line.amount))}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
