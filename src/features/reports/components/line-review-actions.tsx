import { Field, Form, reset, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import { Button, Group, Popover, Stack, Textarea, Tooltip } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { approveLine, requestLineChanges } from "~/features/reports/api/reports";
import { REPORT_LINE_STATUS_LABELS } from "~/features/reports/domain/status-labels";
import type { ReportLine } from "~/features/reports/schemas/report-schema";
import { RequestChangesInputSchema } from "~/features/reports/schemas/report-schema";

type LineReviewActionsProps = {
  lineId: string;
  /** 未確認の行にだけ操作を許します。すでに確認済みの理由はここから文言にします。 */
  status: ReportLine["status"];
};

/**
 * 営業が自分の担当明細に対して行う確認です。
 *
 * 差し戻しには理由を必ず添えます。理由のない差し戻しは、管理者にとって
 * 「何を直せばよいか分からない指摘」でしかないためです。
 * 表示するかどうかは呼び出し側が決め、**拒否そのものはサーバーが行います**。
 *
 * 未確認の行にしか操作できません。押せないときもボタンは消さず、理由を添えて
 * 非活性にします。確定ボタンや削除ボタンと同じ考え方です。
 * @see docs/adr/0007-approval-is-bound-to-content.md
 */
export function LineReviewActions({ lineId, status }: LineReviewActionsProps) {
  const [isReasonOpen, setIsReasonOpen] = useState(false);
  const form = useForm({ schema: RequestChangesInputSchema });
  const router = useRouter();
  const canReviewNow = status === "pending";
  const alreadyReviewedReason = canReviewNow
    ? null
    : `既に${REPORT_LINE_STATUS_LABELS[status]}です。管理者が内容を編集すると、もう一度確認できるようになります。`;

  async function handleApprove() {
    await approveLine(lineId);
    await router.invalidate();
  }

  const handleRequestChanges: SubmitHandler<typeof RequestChangesInputSchema> = async (input) => {
    await requestLineChanges(lineId, input);
    setIsReasonOpen(false);
    // 次に差し戻すときに前回の理由が残っていると、書き換え忘れがそのまま送られます。
    reset(form);
    await router.invalidate();
  };

  return (
    <Group gap="xs" wrap="nowrap">
      <Tooltip disabled={canReviewNow} label={alreadyReviewedReason ?? ""} multiline w={240}>
        <Button
          color="teal"
          data-disabled={canReviewNow ? undefined : true}
          onClick={canReviewNow ? handleApprove : (event) => event.preventDefault()}
          size="xs"
          variant="light"
        >
          承認
        </Button>
      </Tooltip>

      <Popover
        onChange={setIsReasonOpen}
        opened={isReasonOpen && canReviewNow}
        position="bottom-end"
        withArrow
      >
        <Popover.Target>
          <Tooltip disabled={canReviewNow} label={alreadyReviewedReason ?? ""} multiline w={240}>
            <Button
              color="orange"
              data-disabled={canReviewNow ? undefined : true}
              onClick={
                canReviewNow
                  ? () => setIsReasonOpen((open) => !open)
                  : (event) => event.preventDefault()
              }
              size="xs"
              variant="light"
            >
              差し戻し
            </Button>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown>
          <Form of={form} onSubmit={handleRequestChanges}>
            <Stack gap="xs">
              <Field of={form} path={["reason"]}>
                {(field) => (
                  <Textarea
                    {...field.props}
                    autosize
                    error={field.errors?.[0]}
                    label="差し戻しの理由"
                    minRows={2}
                    placeholder="どこを直してほしいかを書いてください"
                    value={field.input ?? ""}
                    w={280}
                  />
                )}
              </Field>
              <Button disabled={form.isSubmitting} size="xs" type="submit">
                差し戻す
              </Button>
            </Stack>
          </Form>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}
