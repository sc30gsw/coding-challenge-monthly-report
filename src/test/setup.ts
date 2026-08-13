import { beforeEach } from "vite-plus/test";

import { env } from "~/server/env";
import { truncateAll } from "~/test/db";

// 開発用データベースを truncate してしまう事故を、テストが 1 行でも走る前に止めます。
if (!env.DATABASE_URL.endsWith("_test")) {
  throw new Error(
    `Tests must run against a database whose name ends with "_test", got ${env.DATABASE_URL}. ` +
      "Set TEST_DATABASE_URL in .env.",
  );
}

// 各テストは自分が必要とする状態を自分で作ります。seed は再利用しません。
// 前のテストの残骸に依存したテストは、単体で走らせたときに落ちるためです。
beforeEach(async () => {
  await truncateAll();
});
