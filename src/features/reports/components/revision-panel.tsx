import { Alert, Button, Stack, Text } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { Result } from "better-result";
import { useState, useTransition } from "react";

import { createRevision } from "~/features/reports/api/reports";
import type { ReportDetail } from "~/features/reports/schemas/report-schema";

/**
 * 修正版の作成。確定済みの報告書に誤りが見つかったときの唯一の前進手段です。
 *
 * 確定済みは書き換えられないので、ここには「直す」ボタンがありません。作れるのは
 * 表紙と明細を引き継いだ**新しい版**で、元の版は旧版として残り、そのまま読めます。
 * @see docs/adr/0009-revision-is-a-copied-report.md
 */
export function RevisionPanel({ report }: Record<"report", ReportDetail>) {
  const [failure, setFailure] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCreate() {
    setFailure(null);

    startTransition(async () => {
      const created = await createRevision(report.id);

      if (Result.isError(created)) {
        // 拒否の文言はドメイン層が持っています。ここで訳し直すと必ずずれるので、
        // サーバーが返した理由をそのまま出します。
        // @see docs/adr/0005-better-result-for-expected-failures.md
        setFailure(
          created.error.reason ?? "修正版を作成できませんでした。時間をおいて試してください。",
        );
        // 他の誰かが先に作っている場合が主なので、いまの状態を読み直させます。
        await router.invalidate();

        return;
      }

      await router.navigate({
        params: { reportId: created.value.id },
        to: "/reports/$reportId",
      });
    });
  }

  return (
    <Alert color="orange" title="修正版を作る" variant="light">
      <Stack align="flex-start" gap="sm">
        <Text size="sm">
          確定済みの内容は変更できません。誤りが見つかった場合は、この版を残したまま第{" "}
          {report.version + 1} 版を作り、もう一度確認と確定を通します。明細はそのまま引き継がれ、
          確認状況は未確認に戻ります。やりとりは引き継ぎません。
        </Text>

        {failure ? (
          <Text c="red.7" size="sm">
            {failure}
          </Text>
        ) : null}

        <Button color="orange" disabled={isPending} onClick={handleCreate} size="xs">
          修正版を作る
        </Button>
      </Stack>
    </Alert>
  );
}
