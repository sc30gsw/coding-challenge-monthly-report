import { Field, Form, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import { Button, Group, NativeSelect, TextInput } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";

import type { SessionUser } from "~/features/auth/schemas/session-schema";
import { addReportLine } from "~/features/reports/api/reports";
import { CreateReportLineInputSchema } from "~/features/reports/schemas/report-schema";

type AddReportLineFormProps = {
  reportId: string;
  salesUsers: SessionUser[];
};

/** 担当営業は明細に紐づきます。「自分に関係する報告書」はここからのみ導出します。 */
export function AddReportLineForm({ reportId, salesUsers }: AddReportLineFormProps) {
  const form = useForm({ schema: CreateReportLineInputSchema });
  const router = useRouter();

  const handleSubmit: SubmitHandler<typeof CreateReportLineInputSchema> = async (input) => {
    await addReportLine(reportId, input);
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
              value={field.input ?? ""}
            />
          )}
        </Field>

        <Field of={form} path={["amount"]}>
          {(field) => (
            <TextInput
              {...field.props}
              error={field.errors?.[0]}
              inputMode="decimal"
              label="金額"
              value={field.input ?? ""}
            />
          )}
        </Field>

        <Field of={form} path={["salesOwnerId"]}>
          {(field) => (
            <NativeSelect
              {...field.props}
              className="min-w-48"
              data={[
                { label: "担当営業を選択", value: "" },
                ...salesUsers.map((user) => ({ label: user.name, value: user.id })),
              ]}
              error={field.errors?.[0]}
              label="担当営業"
              value={field.input ?? ""}
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
