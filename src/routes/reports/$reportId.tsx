import { Anchor, Card, Group, Stack, Table, Text, Title } from "@mantine/core";
import { Link, createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { Result } from "better-result";

import { fetchSelectableUsers } from "~/features/auth/api/session";
import { fetchReport } from "~/features/reports/api/reports";
import { AddReportLineForm } from "~/features/reports/components/add-report-line-form";
import { ReportStatusBadge } from "~/features/reports/components/report-status-badge";
import type { ReportLine } from "~/features/reports/schemas/report-schema";
import { orThrow } from "~/lib/api/result";

export const Route = createFileRoute("/reports/$reportId")({
  beforeLoad: ({ context }) => {
    if (!context.user) {
      throw redirect({ to: "/login" });
    }

    if (context.user.role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
  component: ReportDetailPage,
  loader: async ({ params }) => {
    const [report, users] = await Promise.all([
      fetchReport(params.reportId),
      fetchSelectableUsers(),
    ]);

    // 「見つからない」は業務上ありうる結果なので、エラー画面ではなく 404 として扱います。
    if (Result.isError(report)) {
      throw notFound();
    }

    return {
      report: report.value,
      salesUsers: orThrow(users).filter((user) => user.role === "sales"),
    };
  },
});

const yen = new Intl.NumberFormat("ja-JP", { currency: "JPY", style: "currency" });

const LINE_STATUS_LABELS = {
  approved: "承認済み",
  changes_requested: "差し戻し",
  pending: "未確認",
} as const satisfies Record<ReportLine["status"], string>;

function ReportDetailPage() {
  const { report, salesUsers } = Route.useLoaderData();

  return (
    <main className="mx-auto max-w-5xl p-8">
      <Stack gap="lg">
        <div>
          <Anchor component={Link} size="sm" to="/reports">
            ← 一覧へ戻る
          </Anchor>
          <Group align="center" gap="sm" mt="xs">
            <Title order={1} size="h2">
              {report.clientName}
            </Title>
            <ReportStatusBadge status={report.status} />
            {report.version > 1 ? <Text size="sm">第 {report.version} 版</Text> : null}
          </Group>
        </div>

        <Card padding="md" radius="md" withBorder>
          <Group gap="xl">
            <div>
              <Text c="dimmed" size="xs">
                対象月
              </Text>
              <Text>{report.targetMonth}</Text>
            </div>
            <div>
              <Text c="dimmed" size="xs">
                宛先
              </Text>
              <Text>{report.addressee}</Text>
            </div>
            <div>
              <Text c="dimmed" size="xs">
                金額合計（明細から算出）
              </Text>
              <Text className="tabular-nums" fw={600}>
                {yen.format(Number(report.totalAmount))}
              </Text>
            </div>
          </Group>
        </Card>

        <Stack gap="sm">
          <Text fw={600} size="sm">
            明細
          </Text>

          {report.lines.length === 0 ? (
            <Text c="dimmed" size="sm">
              明細がありません。確定するには 1 件以上必要です。
            </Text>
          ) : (
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
                {report.lines.map((line) => (
                  <Table.Tr key={line.id}>
                    <Table.Td>{line.projectName}</Table.Td>
                    <Table.Td>{line.salesOwner.name}</Table.Td>
                    <Table.Td>{LINE_STATUS_LABELS[line.status]}</Table.Td>
                    <Table.Td className="text-right tabular-nums">
                      {yen.format(Number(line.amount))}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Stack>

        <Card padding="md" radius="md" withBorder>
          <Stack gap="sm">
            <Text fw={600} size="sm">
              明細を追加
            </Text>
            <AddReportLineForm reportId={report.id} salesUsers={salesUsers} />
          </Stack>
        </Card>
      </Stack>
    </main>
  );
}
