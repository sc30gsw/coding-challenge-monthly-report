import { Badge, Button, Group, Text } from "@mantine/core";
import { useRouter } from "@tanstack/react-router";
import { Result } from "better-result";
import { useState } from "react";

import { logout } from "~/features/auth/api/session";
import { ROLE_LABELS, type SessionUser } from "~/features/auth/schemas/session-schema";

type LogoutStatus =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string };

/**
 * いま誰としてアプリを見ているかを常に出します。
 * 同じ報告書を 2 つの立場で操作する課題なので、立場が画面から消えないようにします。
 */
export function SessionBar({ user }: Record<"user", SessionUser>) {
  const router = useRouter();
  const [logoutStatus, setLogoutStatus] = useState<LogoutStatus>({ status: "idle" });
  const isPending = logoutStatus.status === "pending";

  async function handleLogout() {
    if (isPending) {
      return;
    }

    setLogoutStatus({ status: "pending" });

    const result = await logout();

    if (Result.isError(result)) {
      setLogoutStatus({ message: result.error.message, status: "error" });
      return;
    }

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
      <Group gap="xs">
        {logoutStatus.status === "error" ? (
          <Text aria-live="polite" c="red" size="xs">
            {logoutStatus.message}
          </Text>
        ) : null}
        <Button loading={isPending} onClick={handleLogout} size="xs" variant="subtle">
          ログアウト
        </Button>
      </Group>
    </Group>
  );
}
