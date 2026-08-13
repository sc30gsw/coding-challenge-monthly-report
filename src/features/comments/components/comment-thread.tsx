import { Field, Form, reset, setInput, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import { Badge, Button, Card, Group, Select, Stack, Text, Textarea } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { Result } from "better-result";
import { useOptimistic, useState, useTransition } from "react";

import type { SessionUser } from "~/features/auth/schemas/session-schema";
import { postComment } from "~/features/comments/api/comments";
import type { Comment } from "~/features/comments/schemas/comment-schema";
import { CreateCommentInputSchema } from "~/features/comments/schemas/comment-schema";
import type { ReportDetail } from "~/features/reports/schemas/report-schema";

type CommentThreadProps = {
  comments: Comment[];
  lines: ReportDetail["lines"];
  reportId: string;
  /** 楽観的に描く 1 件の投稿者。サーバーの応答を待たずに名前とロールを出すために要ります。 */
  viewer: SessionUser;
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
 *
 * 投稿は**楽観的に描きます**。会話は往復が続く操作なので、1 往復ごとに再取得を待たされると
 * 手が止まります。サーバーが受理したら loader の値に置き換わり、拒否されたら取り消して
 * 理由を出します。楽観表示はあくまで表示で、保存されたかどうかはサーバーの応答が決めます。
 */
export function CommentThread({ comments, lines, reportId, viewer }: CommentThreadProps) {
  const [failure, setFailure] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [visible, addOptimistic] = useOptimistic(comments, (current: Comment[], next: Comment) => [
    ...current,
    next,
  ]);
  const form = useForm({ schema: CreateCommentInputSchema });
  const router = useRouter();

  const handleSubmit: SubmitHandler<typeof CreateCommentInputSchema> = (input) => {
    const optimistic: Comment = {
      author: { id: viewer.id, name: viewer.name, role: viewer.role },
      body: input.body,
      createdAt: new Date().toISOString(),
      id: `pending-${crypto.randomUUID()}`,
      lineId: input.lineId ?? null,
      lineProjectName: lines.find((line) => line.id === input.lineId)?.projectName ?? null,
    };

    setFailure(null);
    reset(form);

    startTransition(async () => {
      addOptimistic(optimistic);

      const posted = await postComment(reportId, input);

      if (Result.isError(posted)) {
        // transition が終わると仮の行は消えます。残したままだと、書いたつもりが
        // 相手に届いていない状態になります。
        setFailure("コメントを投稿できませんでした。時間をおいて試してください。");

        return;
      }

      await router.invalidate();
    });
  };

  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">
        やりとり
      </Text>

      {visible.length === 0 ? (
        <Text c="dimmed" size="sm">
          まだコメントはありません。
        </Text>
      ) : (
        <Stack gap="xs">
          {visible.map((comment) => (
            <Card
              key={comment.id}
              opacity={comment.id.startsWith("pending-") ? 0.6 : 1}
              padding="sm"
              radius="md"
              withBorder
            >
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

            {failure ? (
              <Text c="red.7" size="sm">
                {failure}
              </Text>
            ) : null}

            <Button disabled={form.isSubmitting || isPending} size="xs" type="submit">
              投稿する
            </Button>
          </Stack>
        </Form>
      </Card>
    </Stack>
  );
}
