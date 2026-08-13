import { Alert, Badge, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { Result } from "better-result";
import { useState } from "react";

import { fetchSelectableUsers, login } from "~/features/auth/api/session";
import { ROLE_LABELS } from "~/features/auth/schemas/session-schema";

type LoginStatus =
  | { status: "idle" }
  | { status: "pending"; userId: string }
  | { status: "error"; message: string };

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context }) => {
    if (context.user) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
  loader: async () => ({ users: await fetchSelectableUsers() }),
});

function LoginPage() {
  const { users } = Route.useLoaderData();
  const router = useRouter();
  const [loginStatus, setLoginStatus] = useState<LoginStatus>({ status: "idle" });
  const isPending = loginStatus.status === "pending";

  async function handleSelect(userId: string) {
    if (isPending) {
      return;
    }

    setLoginStatus({ status: "pending", userId });

    try {
      const result = await login(userId);

      if (Result.isError(result)) {
        setLoginStatus({ message: result.error.message, status: "error" });
        return;
      }

      await router.invalidate();
      await router.navigate({ to: "/" });
    } catch {
      setLoginStatus({ message: "ログインできませんでした", status: "error" });
    }
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <Stack gap="lg">
        <div>
          <Title order={1} size="h2">
            ログイン
          </Title>
          <Text c="dimmed" size="sm" mt="xs">
            操作する立場を選んでください。パスワードはありません。要件が許容するダミーログインであり、本番運用の認証ではありません。
          </Text>
        </div>

        {loginStatus.status === "error" ? (
          <Alert color="red" title="ログインに失敗しました" variant="light">
            {loginStatus.message}
          </Alert>
        ) : null}

        <Stack gap="xs">
          {users.map((user) => (
            <Card key={user.id} padding="md" radius="md" withBorder>
              <Group justify="space-between">
                <Group gap="xs">
                  <Text fw={600}>{user.name}</Text>
                  <Badge color={user.role === "admin" ? "grape" : "teal"} variant="light">
                    {ROLE_LABELS[user.role]}
                  </Badge>
                </Group>
                <Button
                  disabled={isPending}
                  loading={loginStatus.status === "pending" && loginStatus.userId === user.id}
                  onClick={() => handleSelect(user.id)}
                  size="xs"
                >
                  この立場でログイン
                </Button>
              </Group>
            </Card>
          ))}
        </Stack>
      </Stack>
    </main>
  );
}
