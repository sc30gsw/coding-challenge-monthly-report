import { Badge, Group, Stack, Table, Text } from "@mantine/core";

import type { SessionUser } from "~/features/auth/schemas/session-schema";
import { LineAdminActions } from "~/features/reports/components/line-admin-actions";
import { LineReviewActions } from "~/features/reports/components/line-review-actions";
import type { ReportDetail, ReportLine } from "~/features/reports/schemas/report-schema";

type ReportLineTableProps = {
  /** 明細を消せるかどうか。下書き中だけです。 */
  canDelete?: boolean;
  /** 明細を書き換えられるかどうか。管理者で、報告書が下書きか確認中のときだけです。 */
  canEdit?: boolean;
  /** 自分の担当行に確認の操作を出すかどうか。報告書が確認中で、見ている人が営業のときだけです。 */
  canReview: boolean;
  lines: ReportDetail["lines"];
  /** 編集フォームの担当営業の選択肢。管理者のときだけ渡します。 */
  salesUsers?: SessionUser[];
  /** いま見ている人。自分の担当行に印をつけるために使います。 */
  viewerId: string;
};

/** 既定値をレンダーのたびに作らないよう、モジュール定数にします。 */
const NO_SALES_USERS: SessionUser[] = [];

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
export function ReportLineTable({
  canDelete = false,
  canEdit = false,
  canReview,
  lines,
  salesUsers = NO_SALES_USERS,
  viewerId,
}: ReportLineTableProps) {
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
          <Table.Th />
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
            <Table.Td>
              <Stack gap={2}>
                <Text size="sm">{LINE_STATUS_LABELS[line.status]}</Text>
                {/* 差し戻しの理由は、管理者が何を直すべきかを知るための情報です。
                    編集で未確認に戻ったあとも履歴として残ります。 */}
                {line.changeRequestReason ? (
                  <Text c="orange.7" size="xs">
                    {line.status === "changes_requested" ? "" : "直近の差し戻し: "}
                    {line.changeRequestReason}
                  </Text>
                ) : null}
              </Stack>
            </Table.Td>
            <Table.Td className="text-right tabular-nums">
              {yen.format(Number(line.amount))}
            </Table.Td>
            <Table.Td>
              {canReview && line.salesOwner.id === viewerId ? (
                <LineReviewActions lineId={line.id} />
              ) : null}
              {canEdit ? (
                <LineAdminActions canDelete={canDelete} line={line} salesUsers={salesUsers} />
              ) : null}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
