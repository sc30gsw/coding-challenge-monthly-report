import { existsSync } from "node:fs";

import * as v from "valibot";

// Vite はアプリ用の環境変数しか process.env に載せないため、サーバー側で使う値は
// ここで .env を読み込みます。Node 24 の組み込み機能を使い、dotenv を増やしません。
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const EnvSchema = v.object({
  DATABASE_URL: v.pipe(v.string(), v.minLength(1, "DATABASE_URL is required")),
  // ダミーログインの Cookie 署名鍵。署名を外すと権限設計が丸ごと無意味になるため必須です。
  // @see docs/adr/0015-signed-cookie-dummy-login.md
  COOKIE_SECRET: v.pipe(v.string(), v.minLength(32, "COOKIE_SECRET must be at least 32 chars")),
});

// テスト中は必ずテスト用データベースへ向けます。ここで切り替えないと、テストの
// truncate が開発用データベースを消してしまいます。
const databaseUrl =
  process.env.VITEST === "true"
    ? (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL)
    : process.env.DATABASE_URL;

const parsed = v.safeParse(EnvSchema, {
  COOKIE_SECRET: process.env.COOKIE_SECRET,
  DATABASE_URL: databaseUrl,
});

if (!parsed.success) {
  const issues = parsed.issues.map((issue) => `  - ${issue.message}`).join("\n");

  throw new Error(
    `Environment is not configured:\n${issues}\n\nCopy .env.example to .env, or run \`vp run setup\`.`,
  );
}

export const env = parsed.output;
