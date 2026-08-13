import { Field, Form, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import { Button, Group, NativeSelect, TextInput } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";

import { createReport } from "~/features/reports/api/reports";
import type { Client } from "~/features/reports/schemas/report-schema";
import { CreateReportInputSchema } from "~/features/reports/schemas/report-schema";

type CreateReportFormProps = {
  clients: Client[];
};

/**
 * 表紙の入力です。検証はサーバーと同じ Valibot スキーマで、ここでは定義し直しません。
 * @see docs/adr/0004-valibot-and-formisch-for-forms.md
 */
export function CreateReportForm({ clients }: CreateReportFormProps) {
  const form = useForm({ schema: CreateReportInputSchema });
  const router = useRouter();

  const handleSubmit: SubmitHandler<typeof CreateReportInputSchema> = async (input) => {
    await createReport(input);
    await router.invalidate();
  };

  return (
    <Form of={form} onSubmit={handleSubmit}>
      <Group align="flex-end" gap="sm">
        <Field of={form} path={["clientId"]}>
          {(field) => (
            <NativeSelect
              {...field.props}
              className="min-w-64"
              data={[
                { label: "取引先を選択", value: "" },
                ...clients.map((client) => ({ label: client.name, value: client.id })),
              ]}
              error={field.errors?.[0]}
              label="取引先"
              value={field.input ?? ""}
            />
          )}
        </Field>

        <Field of={form} path={["targetMonth"]}>
          {(field) => (
            <TextInput
              {...field.props}
              error={field.errors?.[0]}
              label="対象月"
              type="month"
              value={field.input ?? ""}
            />
          )}
        </Field>

        <Button disabled={form.isSubmitting} type="submit">
          下書きを作成
        </Button>
      </Group>
    </Form>
  );
}
