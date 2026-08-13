import { Card, Group, Stack, Table, Text, Title } from "@mantine/core";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";

import { fetchClients, fetchReports } from "~/features/reports/api/reports";
import { CreateReportForm } from "~/features/reports/components/create-report-form";
import { ReportStatusBadge } from "~/features/reports/components/report-status-badge";
import { orThrow } from "~/lib/api/result";

export const Route = createFileRoute("/reports/")({
  beforeLoad: ({ context }) => {
    if (!context.user) {
      throw redirect({ to: "/login" });
    }

    // 営業向けの一覧は issue #5 で入ります。判定はサーバー側にもあります。
    if (context.user.role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
  component: ReportsPage,
  loader: async () => {
    const [clients, reports] = await Promise.all([fetchClients(), fetchReports()]);

    // どちらも管理者にしか届かない経路です。ここで失敗するのは権限か障害なので、
    // 空配列に潰さずエラー画面へ出します。
    return { clients: orThrow(clients), reports: orThrow(reports) };
  },
});

const yen = new Intl.NumberFormat("ja-JP", { currency: "JPY", style: "currency" });

function ReportsPage() {
  const { clients, reports } = Route.useLoaderData();

  return (
    <main className="mx-auto max-w-5xl p-8">
      <Stack gap="lg">
        <Title order={1} size="h2">
          月次報告書
        </Title>

        <Card padding="md" radius="md" withBorder>
          <Stack gap="sm">
            <Text fw={600} size="sm">
              新しい報告書
            </Text>
            <CreateReportForm clients={clients} />
          </Stack>
        </Card>

        {reports.length === 0 ? (
          <Text c="dimmed">まだ報告書がありません。上のフォームから作成してください。</Text>
        ) : (
          <Table highlightOnHover striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>取引先</Table.Th>
                <Table.Th>対象月</Table.Th>
                <Table.Th>状態</Table.Th>
                <Table.Th>明細</Table.Th>
                <Table.Th className="text-right">金額合計</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {reports.map((report) => (
                <Table.Tr key={report.id}>
                  <Table.Td>
                    {/* Mantine の Anchor に component={Link} を渡すと Link の型が落ち、
                        params が検査されなくなるため、Link をそのまま使います。 */}
                    <Link
                      className="text-blue-700 underline underline-offset-2"
                      params={{ reportId: report.id }}
                      to="/reports/$reportId"
                    >
                      {report.clientName}
                    </Link>
                  </Table.Td>
                  <Table.Td>{report.targetMonth}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ReportStatusBadge status={report.status} />
                      {report.version > 1 ? <Text size="xs">第 {report.version} 版</Text> : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>{report.lineCount} 件</Table.Td>
                  <Table.Td className="text-right tabular-nums">
                    {yen.format(Number(report.totalAmount))}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </main>
  );
}
