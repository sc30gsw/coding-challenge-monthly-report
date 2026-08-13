import { Alert, Anchor, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { Link, createFileRoute, notFound, redirect, useRouter } from "@tanstack/react-router";
import { Result } from "better-result";

import { fetchSelectableUsers } from "~/features/auth/api/session";
import { fetchComments } from "~/features/comments/api/comments";
import { CommentThread } from "~/features/comments/components/comment-thread";
import { fetchReport, requestReview } from "~/features/reports/api/reports";
import { AddReportLineForm } from "~/features/reports/components/add-report-line-form";
import { ConfirmPanel } from "~/features/reports/components/confirm-panel";
import { ReportLineTable } from "~/features/reports/components/report-line-table";
import { ReportStatusBadge } from "~/features/reports/components/report-status-badge";
import { ReviewProgressSummary } from "~/features/reports/components/review-progress-summary";
import type { ReportDetail } from "~/features/reports/schemas/report-schema";
import { orThrow } from "~/lib/api/result";

export const Route = createFileRoute("/reports/$reportId")({
  beforeLoad: ({ context }) => {
    if (!context.user) {
      throw redirect({ to: "/login" });
    }

    return { user: context.user };
  },
  component: ReportDetailPage,
  loader: async ({ context, params }) => {
    const [report, comments] = await Promise.all([
      fetchReport(params.reportId),
      fetchComments(params.reportId),
    ]);

    // 担当営業の選択肢は明細を足すときにしか要らないので、管理者のときだけ読みます。
    const users = context.user?.role === "admin" ? await fetchSelectableUsers() : null;

    // 「見つからない」は業務上ありうる結果なので、エラー画面ではなく 404 として扱います。
    if (Result.isError(report)) {
      throw notFound();
    }

    return {
      comments: orThrow(comments),
      report: report.value,
      salesUsers: users ? orThrow(users).filter((user) => user.role === "sales") : [],
    };
  },
});

const yen = new Intl.NumberFormat("ja-JP", { currency: "JPY", style: "currency" });

function ReportDetailPage() {
  const { comments, report, salesUsers } = Route.useLoaderData();
  const { user } = Route.useRouteContext();
  const isAdmin = user.role === "admin";

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

          <ReviewProgressSummary progress={report.progress} />

          <ReportLineTable
            canDelete={isAdmin && report.status === "draft"}
            canEdit={isAdmin && (report.status === "draft" || report.status === "in_review")}
            canReview={!isAdmin && report.status === "in_review"}
            lines={report.lines}
            salesUsers={salesUsers}
            viewerId={user.id}
          />
        </Stack>

        {isAdmin && (report.status === "draft" || report.status === "in_review") ? (
          <Card padding="md" radius="md" withBorder>
            <Stack gap="sm">
              <Text fw={600} size="sm">
                明細を追加
              </Text>
              <AddReportLineForm reportId={report.id} salesUsers={salesUsers} />
            </Stack>
          </Card>
        ) : null}

        {isAdmin && report.status === "draft" ? <RequestReviewPanel report={report} /> : null}

        {isAdmin && report.status === "in_review" ? <ConfirmPanel report={report} /> : null}

        <CommentThread comments={comments} lines={report.lines} reportId={report.id} />
      </Stack>
    </main>
  );
}

/**
 * 確認依頼。押すと営業が明細を確認できるようになります。
 * 下書きへ戻す操作はありません。差し戻し対応の編集は確認中のまま行えるためです。
 */
function RequestReviewPanel({ report }: Record<"report", ReportDetail>) {
  const router = useRouter();
  const hasLines = report.progress.total > 0;

  async function handleRequestReview() {
    await requestReview(report.id);
    await router.invalidate();
  }

  return (
    <Alert color="blue" title="担当営業に確認してもらう" variant="light">
      <Stack align="flex-start" gap="sm">
        <Text size="sm">
          確認依頼を出すと、明細の担当営業がこの報告書を開けるようになります。下書きへ戻す操作はありません。
        </Text>

        {/* 押せない理由を出します。ボタンを消すと、何が足りないのかを
            明細表から自力で探すことになります。
            @see docs/adr/0012-confirm-preconditions.md */}
        {hasLines ? null : (
          <Text c="dimmed" size="sm">
            明細が 1
            件も無いと確認依頼を出せません。担当営業は「自分が担当する明細を含む報告書」として一覧に出るため、明細が無い報告書は誰にも届きません。
          </Text>
        )}

        <Button disabled={!hasLines} onClick={handleRequestReview} size="xs">
          確認依頼を出す
        </Button>
      </Stack>
    </Alert>
  );
}
