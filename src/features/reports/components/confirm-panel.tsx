import { Alert, Button, List, Stack, Text } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";

import { confirmReport } from "~/features/reports/api/reports";
import type { ReportDetail } from "~/features/reports/schemas/report-schema";

/**
 * 確定。押せないときはボタンを消さず、**何が足りないか**を並べます。
 *
 * ボタンを隠すと、管理者は「なぜ確定できないのか」を明細表から自力で探すことになります。
 * この業務でユーザーが知りたいのは「押せるかどうか」ではなく「あと何をすれば前に進めるか」です。
 * なお非活性は表示の都合であって防御ではありません。拒否はサーバーが行います。
 * @see docs/adr/0012-confirm-preconditions.md
 */
export function ConfirmPanel({ report }: Record<"report", ReportDetail>) {
  const router = useRouter();
  const { progress } = report;

  const blockers = [
    progress.total === 0 ? "明細が 1 件もありません（確定には 1 件以上必要です）" : null,
    progress.pending > 0 ? `未承認の明細が ${progress.pending} 件あります` : null,
    progress.changesRequested > 0
      ? `差し戻し中の明細が ${progress.changesRequested} 件あります`
      : null,
  ].filter((blocker) => blocker !== null);

  async function handleConfirm() {
    await confirmReport(report.id);
    await router.invalidate();
  }

  return (
    <Alert color={blockers.length === 0 ? "teal" : "gray"} title="確定する" variant="light">
      <Stack align="flex-start" gap="sm">
        <Text size="sm">
          確定すると取引先へ提出できる状態になります。確定後は内容を変更できません。誤りが見つかった場合は、元の版を残したまま修正版を作り直します。
        </Text>

        {blockers.length > 0 ? (
          <div>
            <Text fw={600} size="sm">
              確定できない理由
            </Text>
            <List size="sm" withPadding>
              {blockers.map((blocker) => (
                <List.Item key={blocker}>{blocker}</List.Item>
              ))}
            </List>
          </div>
        ) : null}

        <Button color="teal" disabled={blockers.length > 0} onClick={handleConfirm} size="xs">
          確定する
        </Button>
      </Stack>
    </Alert>
  );
}
