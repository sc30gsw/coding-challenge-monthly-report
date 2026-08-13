import { Badge, Button, Group, Text } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";

import { logout } from "~/features/auth/api/session";
import type { SessionUser } from "~/features/auth/schemas/session-schema";

const ROLE_LABELS = {
  admin: "管理者",
  sales: "営業",
} as const satisfies Record<SessionUser["role"], string>;

/**
 * いま誰としてアプリを見ているかを常に出します。
 * 同じ報告書を 2 つの立場で操作する課題なので、立場が画面から消えないようにします。
 */
export function SessionBar({ user }: Record<"user", SessionUser>) {
  const router = useRouter();

  async function handleLogout() {
    await logout();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  return (
    <Group justify="space-between" px="md" py="sm" className="border-b border-gray-200">
      <Group gap="xs">
        <Text fw={600}>{user.name}</Text>
        <Badge color={user.role === "admin" ? "grape" : "teal"} variant="light">
          {ROLE_LABELS[user.role]}
        </Badge>
      </Group>
      <Button onClick={handleLogout} size="xs" variant="subtle">
        ログアウト
      </Button>
    </Group>
  );
}
