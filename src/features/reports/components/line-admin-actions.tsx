import { Field, Form, setInput, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
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
      <Button onClick={() => setIsEditOpen(true)} size="xs" variant="light">
        編集
      </Button>

      {/* 3 項目のフォームなので Modal にしています。Popover だと、選択肢の
          クリックが「外側のクリック」と判定されて入力途中で閉じる事故が起きます。 */}
      <Modal onClose={() => setIsEditOpen(false)} opened={isEditOpen} title="明細を編集">
        <Form of={form} onSubmit={handleSubmit}>
          <Stack gap="sm">
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

            <Button disabled={form.isSubmitting} type="submit">
              保存
            </Button>
          </Stack>
        </Form>
      </Modal>

      {/* 押せないときもボタンは消しません。なぜできないかが分からない画面にしないためです。
          @see docs/adr/0012-confirm-preconditions.md */}
      <Tooltip
        disabled={canDelete}
        label="確認依頼後は削除できません。差し戻された指摘ごと消えてしまうためです"
        multiline
        w={240}
      >
        <Button
          color="red"
          data-disabled={canDelete ? undefined : true}
          onClick={canDelete ? handleDelete : (event) => event.preventDefault()}
          size="xs"
          variant="subtle"
        >
          削除
        </Button>
      </Tooltip>
    </Group>
  );
}
