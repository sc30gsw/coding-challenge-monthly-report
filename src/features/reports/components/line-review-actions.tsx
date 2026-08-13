import { Field, Form, reset, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import { Button, Group, Popover, Stack, Textarea } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { approveLine, requestLineChanges } from "~/features/reports/api/reports";
import { RequestChangesInputSchema } from "~/features/reports/schemas/report-schema";

/**
 * 営業が自分の担当明細に対して行う確認です。
 *
 * 差し戻しには理由を必ず添えます。理由のない差し戻しは、管理者にとって
 * 「何を直せばよいか分からない指摘」でしかないためです。
 * 表示するかどうかは呼び出し側が決め、**拒否そのものはサーバーが行います**。
 */
export function LineReviewActions({ lineId }: Record<"lineId", string>) {
  const [isReasonOpen, setIsReasonOpen] = useState(false);
  const form = useForm({ schema: RequestChangesInputSchema });
  const router = useRouter();

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
      <Button color="teal" onClick={handleApprove} size="xs" variant="light">
        承認
      </Button>

      <Popover onChange={setIsReasonOpen} opened={isReasonOpen} position="bottom-end" withArrow>
        <Popover.Target>
          <Button
            color="orange"
            onClick={() => setIsReasonOpen((open) => !open)}
            size="xs"
            variant="light"
          >
            差し戻し
          </Button>
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
