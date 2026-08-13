import { Field, Form, reset, setInput, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import { Badge, Button, Card, Group, Select, Stack, Text, Textarea } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";

import { postComment } from "~/features/comments/api/comments";
import type { Comment } from "~/features/comments/schemas/comment-schema";
import { CreateCommentInputSchema } from "~/features/comments/schemas/comment-schema";
import type { ReportDetail } from "~/features/reports/schemas/report-schema";

type CommentThreadProps = {
  comments: Comment[];
  lines: ReportDetail["lines"];
  reportId: string;
};

const ROLE_LABELS = {
  admin: "管理者",
  sales: "営業",
} as const satisfies Record<Comment["author"]["role"], string>;

/**
 * タイムゾーンを明示します。省略するとサーバーとブラウザで異なる可能性があり、
 * SSR の出力とハイドレーション後の表示が食い違います。社内向けなので日本時間に固定します。
 */
const timestamp = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

/**
 * 管理者と営業が内容を詰めるためのやりとりです。
 *
 * 確定済みの報告書にも投稿できます。不変性は「取引先に提出される中身」に掛かる制約であり、
 * やりとりの記録はその中身ではないためです。確定後に誤りを見つけた人が経緯を残せないと、
 * 運用として成立しません。
 * @see docs/adr/0011-comments-outlive-confirmation.md
 */
export function CommentThread({ comments, lines, reportId }: CommentThreadProps) {
  const form = useForm({ schema: CreateCommentInputSchema });
  const router = useRouter();

  const handleSubmit: SubmitHandler<typeof CreateCommentInputSchema> = async (input) => {
    await postComment(reportId, input);
    reset(form);
    await router.invalidate();
  };

  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">
        やりとり
      </Text>

      {comments.length === 0 ? (
        <Text c="dimmed" size="sm">
          まだコメントはありません。
        </Text>
      ) : (
        <Stack gap="xs">
          {comments.map((comment) => (
            <Card key={comment.id} padding="sm" radius="md" withBorder>
              <Group gap="xs" mb={4}>
                <Text fw={600} size="sm">
                  {comment.author.name}
                </Text>
                <Badge
                  color={comment.author.role === "admin" ? "grape" : "teal"}
                  size="sm"
                  variant="light"
                >
                  {ROLE_LABELS[comment.author.role]}
                </Badge>
                {comment.lineProjectName ? (
                  <Badge color="gray" size="sm" variant="outline">
                    {comment.lineProjectName}
                  </Badge>
                ) : null}
                <Text c="dimmed" size="xs">
                  {timestamp.format(new Date(comment.createdAt))}
                </Text>
              </Group>
              <Text className="whitespace-pre-wrap" size="sm">
                {comment.body}
              </Text>
            </Card>
          ))}
        </Stack>
      )}

      <Card padding="sm" radius="md" withBorder>
        <Form of={form} onSubmit={handleSubmit}>
          <Stack gap="xs">
            <Field of={form} path={["lineId"]}>
              {(field) => (
                <Select
                  clearable
                  data={lines.map((line) => ({ label: line.projectName, value: line.id }))}
                  label="対象の明細（任意）"
                  onChange={(value) =>
                    setInput(form, { input: value ?? undefined, path: ["lineId"] })
                  }
                  placeholder="報告書全体へのコメント"
                  value={field.input ?? null}
                />
              )}
            </Field>

            <Field of={form} path={["body"]}>
              {(field) => (
                <Textarea
                  {...field.props}
                  autosize
                  error={field.errors?.[0]}
                  label="コメント"
                  minRows={2}
                  placeholder="確認したいこと、直してほしいことを書いてください"
                  value={field.input ?? ""}
                />
              )}
            </Field>

            <Button disabled={form.isSubmitting} size="xs" type="submit">
              投稿する
            </Button>
          </Stack>
        </Form>
      </Card>
    </Stack>
  );
}
