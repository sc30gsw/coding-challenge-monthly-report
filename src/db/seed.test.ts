import { expect, it } from "vite-plus/test";

import { db } from "~/db/client";
import { clients, reports, users } from "~/db/schema";
import { SEED_CLIENTS, SEED_USERS, seed } from "~/db/seed";
import { confirmReport, createActors, createLine, createReport } from "~/test/fixtures";

it("確定済みの報告書が残っていてもやり直せる", async () => {
  const actors = await createActors();
  const report = await createReport({ clientId: actors.client.id });
  await createLine({ reportId: report.id, salesOwnerId: actors.sales.id });
  await confirmReport(report.id);

  await seed();

  expect((await db.select().from(users)).map((row) => row.email)).toEqual(
    SEED_USERS.map((row) => row.email),
  );
  expect((await db.select().from(clients)).map((row) => row.name)).toEqual(
    SEED_CLIENTS.map((row) => row.name),
  );
  expect(await db.select().from(reports)).toEqual([]);
});
