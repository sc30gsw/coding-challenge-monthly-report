import { Field, Form, setInput, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import { Button, Group, NumberInput, Popover, Select, Stack, Text, TextInput } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import type { SessionUser } from "~/features/auth/schemas/session-schema";
import { removeReportLine, updateReportLine } from "~/features/reports/api/reports";
import type { ReportDetail } from "~/features/reports/schemas/report-schema";
import { CreateReportLineInputSchema } from "~/features/reports/schemas/report-schema";

type LineAdminActionsProps = {
  /** 削除できるのは下書き中だけです。確認依頼後は差し戻しを消せてしまうため。 */
  canDelete: boolean;
  line: ReportDetail["lines"][number];
  salesUsers: SessionUser[];
};

/**
 * 管理者による明細の編集・削除です。
 *
 * 編集すると確認状況は未確認に戻ります。営業に「もう一度見てほしい」と伝わるように、
 * その旨をフォームにも書いています。
 * @see docs/adr/0007-approval-is-bound-to-content.md
 */
export function LineAdminActions({ canDelete, line, salesUsers }: LineAdminActionsProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const router = useRouter();
  const form = useForm({
    initialInput: {
      amount: line.amount,
      projectName: line.projectName,
      salesOwnerId: line.salesOwner.id,
    },
    schema: CreateReportLineInputSchema,
  });

  const handleSubmit: SubmitHandler<typeof CreateReportLineInputSchema> = async (input) => {
    await updateReportLine(line.id, input);
    setIsEditOpen(false);
    await router.invalidate();
  };

  async function handleDelete() {
    await removeReportLine(line.id);
    await router.invalidate();
  }

  return (
    <Group gap="xs" wrap="nowrap">
      <Popover onChange={setIsEditOpen} opened={isEditOpen} position="bottom-end" withArrow>
        <Popover.Target>
          <Button onClick={() => setIsEditOpen((open) => !open)} size="xs" variant="light">
            編集
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Form of={form} onSubmit={handleSubmit}>
            <Stack gap="xs" w={280}>
              <Field of={form} path={["projectName"]}>
                {(field) => (
                  <TextInput
                    {...field.props}
                    error={field.errors?.[0]}
                    label="案件名"
                    value={field.input ?? ""}
                  />
                )}
              </Field>

              <Field of={form} path={["amount"]}>
                {(field) => (
                  <NumberInput
                    allowNegative={false}
                    decimalScale={2}
                    error={field.errors?.[0]}
                    hideControls
                    label="金額"
                    onChange={(value) =>
                      setInput(form, { input: String(value ?? ""), path: ["amount"] })
                    }
                    prefix="¥"
                    thousandSeparator=","
                    value={field.input ?? ""}
                  />
                )}
              </Field>

              <Field of={form} path={["salesOwnerId"]}>
                {(field) => (
                  <Select
                    data={salesUsers.map((user) => ({ label: user.name, value: user.id }))}
                    error={field.errors?.[0]}
                    label="担当営業"
                    onChange={(value) =>
                      setInput(form, { input: value ?? "", path: ["salesOwnerId"] })
                    }
                    value={field.input || null}
                  />
                )}
              </Field>

              <Text c="dimmed" size="xs">
                保存すると、この明細の確認状況は未確認に戻ります。承認は内容に対するものなので、内容が変われば取り直しになります。
              </Text>

              <Button disabled={form.isSubmitting} size="xs" type="submit">
                保存
              </Button>
            </Stack>
          </Form>
        </Popover.Dropdown>
      </Popover>

      {canDelete ? (
        <Button color="red" onClick={handleDelete} size="xs" variant="subtle">
          削除
        </Button>
      ) : null}
    </Group>
  );
}
