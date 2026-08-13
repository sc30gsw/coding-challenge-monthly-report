import { db } from "~/db/client";
import { clients, users } from "~/db/schema";

/**
 * 採点者が clone 直後に業務フローを触れるよう、必要な登場人物を投入します。
 *
 * 何度実行しても同じ結果になるよう、既存を消してから入れ直します。
 * 各状態のサンプル報告書は issue #11 で足します。
 *
 * ログイン情報は README に記載しています。要件が許容するダミーログインであり、
 * 本番運用の認証ではありません。
 * @see docs/adr/0015-signed-cookie-dummy-login.md
 */

export const SEED_USERS = [
  { email: "admin@example.com", name: "管理 太郎", role: "admin" },
  { email: "sales-sato@example.com", name: "佐藤 花子", role: "sales" },
  { email: "sales-suzuki@example.com", name: "鈴木 一郎", role: "sales" },
] as const satisfies Pick<typeof users.$inferSelect, "email" | "name" | "role">[];

const SEED_CLIENTS = [
  { defaultAddressee: "経理部 ご担当者様", name: "株式会社アオイ商事" },
  { defaultAddressee: "管理本部 ご担当者様", name: "ミドリ工業株式会社" },
  { defaultAddressee: "総務部 ご担当者様", name: "株式会社シオカゼ" },
] as const satisfies Pick<typeof clients.$inferSelect, "defaultAddressee" | "name">[];

async function seed() {
  await db.delete(clients);
  await db.delete(users);

  // ユーザーと取引先は互いに依存しないので同時に入れます。
  const [insertedUsers, insertedClients] = await Promise.all([
    db
      .insert(users)
      .values([...SEED_USERS])
      .returning(),
    db
      .insert(clients)
      .values([...SEED_CLIENTS])
      .returning(),
  ]);

  process.stdout.write(
    `seeded ${insertedUsers.length} users and ${insertedClients.length} clients\n`,
  );
}

await seed();
process.exit(0);
