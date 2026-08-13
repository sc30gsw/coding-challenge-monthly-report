import { Alert, Stack, Text, Title } from "@mantine/core";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (!context.user) {
      throw redirect({ to: "/login" });
    }

    return { user: context.user };
  },
  component: Home,
});

function Home() {
  const { user } = Route.useRouteContext();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Stack gap="md">
        <Title order={1} size="h2">
          月次報告書
        </Title>
        <Text>
          {user.name} さん（{user.role === "admin" ? "管理者" : "営業"}）としてログインしています。
        </Text>
        <Alert color="gray" title="ここから先は未実装です" variant="light">
          <Text size="sm">
            報告書の一覧と詳細は issue #4 以降で入ります。いまはログインとロール解決までです。
          </Text>
        </Alert>
      </Stack>
    </main>
  );
}
