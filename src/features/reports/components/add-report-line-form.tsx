import { Field, Form, reset, setInput, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import { Button, Group, NumberInput, Select, TextInput } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";

import type { SessionUser } from "~/features/auth/schemas/session-schema";
import { addReportLine } from "~/features/reports/api/reports";
import { CreateReportLineInputSchema } from "~/features/reports/schemas/report-schema";

type AddReportLineFormProps = {
  reportId: string;
  salesUsers: SessionUser[];
};

/**
 * 担当営業は明細に紐づきます。「自分に関係する報告書」はここからのみ導出します。
 * @see docs/adr/0010-sales-owner-lives-on-the-line.md
 *
 * 金額は桁区切りつきの数値入力にしています。取引先に出す数字なので、
 * 入力時点で桁を読み違えないことが業務上の意味を持ちます。値は文字列のまま
 * 扱い、浮動小数にはしません。
 */
export function AddReportLineForm({ reportId, salesUsers }: AddReportLineFormProps) {
  const form = useForm({ schema: CreateReportLineInputSchema });
  const router = useRouter();

  const handleSubmit: SubmitHandler<typeof CreateReportLineInputSchema> = async (input) => {
    await addReportLine(reportId, input);
    // 続けて別の明細を足すので入力を空に戻します。前の値が残っていると、
    // 書き換え忘れがそのまま次の行として登録されます。
    reset(form);
    await router.invalidate();
  };

  return (
    <Form of={form} onSubmit={handleSubmit}>
      <Group align="flex-end" gap="sm">
        <Field of={form} path={["projectName"]}>
          {(field) => (
            <TextInput
              {...field.props}
              className="min-w-64"
              error={field.errors?.[0]}
              label="案件名"
              placeholder="案件名を入力"
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
              onChange={(value) => setInput(form, { input: String(value ?? ""), path: ["amount"] })}
              placeholder="0"
              prefix="¥"
              thousandSeparator=","
              value={field.input ?? ""}
            />
          )}
        </Field>

        <Field of={form} path={["salesOwnerId"]}>
          {(field) => (
            <Select
              className="min-w-48"
              clearable
              data={salesUsers.map((user) => ({ label: user.name, value: user.id }))}
              error={field.errors?.[0]}
              label="担当営業"
              onChange={(value) => setInput(form, { input: value ?? "", path: ["salesOwnerId"] })}
              placeholder="担当営業を選択"
              searchable
              value={field.input || null}
            />
          )}
        </Field>

        <Button disabled={form.isSubmitting} type="submit" variant="light">
          明細を追加
        </Button>
      </Group>
    </Form>
  );
}
