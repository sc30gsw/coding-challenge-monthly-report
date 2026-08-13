import { Field, Form, setInput, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import { Button, Group, Select } from "@mantine/core";
import { MonthPickerInput } from "@mantine/dates";
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
 *
 * Mantine の Select / MonthPickerInput は DOM のイベントではなく値を直接渡してくるので、
 * `field.props` を展開せず `setInput` で橋渡しします。素の select や month 入力より、
 * 取引先の絞り込みと対象月の選択が扱いやすくなります。
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
            <Select
              className="min-w-64"
              clearable
              data={clients.map((client) => ({ label: client.name, value: client.id }))}
              error={field.errors?.[0]}
              label="取引先"
              onChange={(value) => setInput(form, { input: value ?? "", path: ["clientId"] })}
              placeholder="取引先を選択"
              searchable
              value={field.input || null}
            />
          )}
        </Field>

        <Field of={form} path={["targetMonth"]}>
          {(field) => (
            <MonthPickerInput
              error={field.errors?.[0]}
              label="対象月"
              onChange={(value) =>
                // Mantine は YYYY-MM-DD を返します。対象月は月単位なので日を落とします。
                setInput(form, { input: value ? value.slice(0, 7) : "", path: ["targetMonth"] })
              }
              placeholder="対象月を選択"
              value={field.input ? `${field.input}-01` : null}
              valueFormat="YYYY年 M月"
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
