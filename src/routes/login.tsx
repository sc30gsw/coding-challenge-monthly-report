import { Badge, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";

import { fetchSelectableUsers, login } from "~/features/auth/api/session";
import { orThrow } from "~/lib/api/result";
import { ROLE_LABELS } from "~/lib/role-labels";

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context }) => {
    if (context.user) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
  loader: async () => ({ users: orThrow(await fetchSelectableUsers()) }),
});

function LoginPage() {
  const { users } = Route.useLoaderData();
  const router = useRouter();

  async function handleSelect(userId: string) {
    await login(userId);
    await router.invalidate();
    await router.navigate({ to: "/" });
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
                <Button onClick={() => handleSelect(user.id)} size="xs">
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
