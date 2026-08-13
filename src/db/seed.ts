import { eq } from "drizzle-orm";

import { db } from "~/db/client";
import { clients, comments, reportLines, reports, users } from "~/db/schema";
import { truncateAll } from "~/db/truncate";

/**
 * 採点者が clone 直後に業務フローを**作るところからではなく触るところから**
 * 始められるよう、各状態のサンプルを投入します。
 *
 * 何度実行しても同じ結果になるよう、既存を消してから入れ直します。
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

export const SEED_CLIENTS = [
  { defaultAddressee: "経理部 ご担当者様", name: "株式会社アオイ商事" },
  { defaultAddressee: "管理本部 ご担当者様", name: "ミドリ工業株式会社" },
  { defaultAddressee: "総務部 ご担当者様", name: "株式会社シオカゼ" },
] as const satisfies Pick<typeof clients.$inferSelect, "defaultAddressee" | "name">[];

type Owner = "佐藤" | "鈴木";

type SeedLine = {
  amount: string;
  owner: Owner;
  projectName: string;
  /** 差し戻しには理由が要ります（CHECK 制約）。 */
  reason?: string;
  status?: (typeof reportLines.$inferInsert)["status"];
};

type Cast = {
  admin: string;
  byOwner: Record<Owner, string>;
  clientsByName: Record<string, { addressee: string; id: string }>;
  /** 並びを実行のたびに変えないための基準時刻。 */
  seededAt: Date;
};

/**
 * 下書きの報告書を 1 件、明細つきで作ります。
 *
 * 状態は必ず下書きから始めて後から進めます。確定済みの報告書には明細を足せない
 * （トリガが拒む）ので、seed も業務と同じ順序を通る必要があります。
 * @see docs/adr/0008-immutability-enforced-in-two-layers.md
 */
async function seedDraft(
  cast: Cast,
  {
    clientName,
    createdAt,
    lines,
    seriesId,
    targetMonth,
    version = 1,
  }: {
    clientName: string;
    createdAt: Date;
    lines: SeedLine[];
    seriesId?: string;
    targetMonth: string;
    version?: number;
  },
) {
  const client = cast.clientsByName[clientName];

  if (!client) {
    throw new Error(`seed client not found: ${clientName}`);
  }

  const id = crypto.randomUUID();

  await db.insert(reports).values({
    addressee: client.addressee,
    clientId: client.id,
    clientName,
    createdAt,
    id,
    seriesId: seriesId ?? id,
    targetMonth: `${targetMonth}-01`,
    updatedAt: createdAt,
    version,
  });

  const inserted = await db
    .insert(reportLines)
    .values(
      lines.map((line, index) => ({
        amount: line.amount,
        changeRequestReason: line.reason ?? null,
        position: index,
        projectName: line.projectName,
        reportId: id,
        salesOwnerId: cast.byOwner[line.owner],
        status: line.status ?? "pending",
      })),
    )
    .returning({ id: reportLines.id, projectName: reportLines.projectName });

  return {
    id,
    lineIdOf: (projectName: string) =>
      inserted.find((line) => line.projectName === projectName)?.id ?? null,
  };
}

/** 明細を入れ終えてから状態を進めます。 */
async function advance(reportId: string, status: "confirmed" | "in_review") {
  await db
    .update(reports)
    .set({ confirmedAt: status === "confirmed" ? new Date() : null, status })
    .where(eq(reports.id, reportId));
}

type Author = "管理" | Owner;

type SeedComment = {
  author: Author;
  body: string;
  /** 明細へのコメントなら案件名。省略すると報告書全体へのコメントになります。 */
  line?: string;
};

type SeedSeries = {
  clientName: string;
  comments?: SeedComment[];
  lines: SeedLine[];
  /** 確定済みの系列にこれを付けると、旧版 + その修正版（下書き）になります。 */
  revision?: Record<"lines", SeedLine[]>;
  status: "confirmed" | "draft" | "in_review";
  targetMonth: string;
};

/**
 * 各状態のサンプルを 5 系列。README の「触りどころ」と対応させています。
 *
 * 担当営業は 2 人に割り振り、**片方にしか見えない系列を両側に置きます。**
 * ログインし直すと一覧の中身が変わることを、何も作らずに確かめられるようにするためです。
 */
const SEED_SERIES = [
  {
    // 作りかけ。明細の追加・編集・削除を試せます。鈴木には見えません。
    clientName: "株式会社アオイ商事",
    lines: [
      { amount: "480000.00", owner: "佐藤", projectName: "基幹システム保守 8 月分" },
      { amount: "120000.00", owner: "佐藤", projectName: "ヘルプデスク 8 月分" },
    ],
    status: "draft",
    targetMonth: "2026-08",
  },
  {
    // 確認中・全明細が未確認。営業でログインして承認を試せます。
    clientName: "ミドリ工業株式会社",
    comments: [
      { author: "管理", body: "8 月分をまとめました。金額と案件名の確認をお願いします。" },
    ],
    lines: [
      { amount: "750000.00", owner: "佐藤", projectName: "生産管理システム改修" },
      { amount: "200000.00", owner: "佐藤", projectName: "帳票レイアウト変更" },
      { amount: "95000.00", owner: "鈴木", projectName: "定例レポート作成" },
    ],
    status: "in_review",
    targetMonth: "2026-08",
  },
  {
    // 差し戻しを 1 件含む確認中。確定ボタンが非活性で理由が出ている状態を即見られます。
    // 佐藤には見えません。
    clientName: "株式会社シオカゼ",
    comments: [
      {
        author: "鈴木",
        body: "この案件は 9 月着手です。来月分に回してください。",
        line: "キャンペーンLP制作",
      },
    ],
    lines: [
      {
        amount: "330000.00",
        owner: "鈴木",
        projectName: "ECサイト運用 8 月分",
        status: "approved",
      },
      {
        amount: "150000.00",
        owner: "鈴木",
        projectName: "キャンペーンLP制作",
        reason: "着手が 9 月なので、今月の報告には含めないでください",
        status: "changes_requested",
      },
      { amount: "88000.00", owner: "鈴木", projectName: "SNS運用代行" },
    ],
    status: "in_review",
    targetMonth: "2026-08",
  },
  {
    // 確定済み。編集できないことを確認できます。確定後もコメントは残せます。
    // @see docs/adr/0011-comments-outlive-confirmation.md
    clientName: "株式会社アオイ商事",
    comments: [{ author: "鈴木", body: "提出済みの内容で相違ありません。" }],
    lines: [
      {
        amount: "480000.00",
        owner: "佐藤",
        projectName: "基幹システム保守 7 月分",
        status: "approved",
      },
      {
        amount: "110000.00",
        owner: "鈴木",
        projectName: "問い合わせ対応 7 月分",
        status: "approved",
      },
    ],
    status: "confirmed",
    targetMonth: "2026-07",
  },
  {
    // 旧版 + その修正版が下書き。版管理の結果を確認できます。
    clientName: "ミドリ工業株式会社",
    comments: [
      {
        author: "管理",
        body: "提出後に、改修の金額が契約と合っていないことが分かりました。修正版を作ります。",
      },
    ],
    lines: [
      {
        amount: "700000.00",
        owner: "佐藤",
        projectName: "生産管理システム改修",
        status: "approved",
      },
      { amount: "90000.00", owner: "鈴木", projectName: "定例レポート作成", status: "approved" },
    ],
    revision: {
      // 複製ですが確認状況は引き継ぎません。版ごとに承認を取り直します。
      // @see docs/adr/0007-approval-is-bound-to-content.md
      lines: [
        { amount: "680000.00", owner: "佐藤", projectName: "生産管理システム改修" },
        { amount: "90000.00", owner: "鈴木", projectName: "定例レポート作成" },
      ],
    },
    status: "confirmed",
    targetMonth: "2026-07",
  },
] as const satisfies SeedSeries[];

/**
 * 系列を 1 つ投入します。
 *
 * **中の順序は業務ルールそのもの**です。明細を入れ終えてから状態を進めるのは、確定済みに
 * 明細を足せないため。修正版を入れてから旧版にするのは、トリガが後継の版の存在を
 * 条件にしているためです。
 * @see docs/adr/0008-immutability-enforced-in-two-layers.md
 * @see docs/adr/0009-revision-is-a-copied-report.md
 */
async function seedSeries(cast: Cast, series: SeedSeries, position: number) {
  // 一覧は `created_at` の降順なので、時刻を明示して並びを固定します。既定値に任せると、
  // 系列を並べて投入したときに採点者が最初に見る順序が実行のたびに変わります。
  const createdAt = new Date(cast.seededAt.getTime() + position * 60_000);
  const report = await seedDraft(cast, { ...series, createdAt });

  if (series.status !== "draft") {
    await advance(report.id, series.status);
  }

  const thread = series.comments ?? [];

  if (thread.length > 0) {
    await db.insert(comments).values(
      thread.map((entry, index) => ({
        authorId: entry.author === "管理" ? cast.admin : cast.byOwner[entry.author],
        body: entry.body,
        // やりとりは古い順に並ぶので、こちらも時刻を明示します。
        createdAt: new Date(createdAt.getTime() + index * 1_000),
        lineId: entry.line ? report.lineIdOf(entry.line) : null,
        reportId: report.id,
      })),
    );
  }

  if (!series.revision) {
    return 1;
  }

  await seedDraft(cast, {
    ...series,
    createdAt: new Date(createdAt.getTime() + 1_000),
    lines: series.revision.lines,
    seriesId: report.id,
    version: 2,
  });

  // 後継の版が既にあることがトリガの条件なので、旧版にするのは修正版を入れた後です。
  // @see docs/adr/0009-revision-is-a-copied-report.md
  await db.update(reports).set({ status: "superseded" }).where(eq(reports.id, report.id));

  return 2;
}

export async function seed() {
  await truncateAll();

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

  const admin = insertedUsers.find((user) => user.role === "admin");
  const sato = insertedUsers.find((user) => user.email === "sales-sato@example.com");
  const suzuki = insertedUsers.find((user) => user.email === "sales-suzuki@example.com");

  if (!admin || !sato || !suzuki) {
    throw new Error("seed users were not inserted");
  }

  const cast: Cast = {
    admin: admin.id,
    byOwner: { 佐藤: sato.id, 鈴木: suzuki.id },
    clientsByName: Object.fromEntries(
      insertedClients.map((client) => [
        client.name,
        { addressee: client.defaultAddressee, id: client.id },
      ]),
    ),
    seededAt: new Date(),
  };

  // 系列どうしは独立なので同時に入れます。並び順は `createdAt` を明示して固定しているので、
  // 投入の順序には依存しません。系列の中の順序は seedSeries が守ります。
  const counts = await Promise.all(
    SEED_SERIES.map((series, position) => seedSeries(cast, series, position)),
  );
  const reportCount = counts.reduce((total, count) => total + count, 0);

  process.stdout.write(
    `seeded ${insertedUsers.length} users, ${insertedClients.length} clients, ${reportCount} reports\n`,
  );
}
