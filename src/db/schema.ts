import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * 業務ルールの一部は、このファイルからは見えない生 SQL のマイグレーションで守られています。
 *
 * - `confirmed` / `superseded` な report / report_line への UPDATE・DELETE を拒否するトリガ
 *   （唯一の例外は `confirmed → superseded` の status 更新のみ）
 *
 * 詳細は docs/adr/0008-immutability-enforced-in-two-layers.md と
 * drizzle/ 配下のカスタムマイグレーションを参照してください。
 */

export const userRole = pgEnum("user_role", ["admin", "sales"]);

export const reportStatus = pgEnum("report_status", [
  "draft",
  "in_review",
  "confirmed",
  "superseded",
]);

export const reportLineStatus = pgEnum("report_line_status", [
  "pending",
  "approved",
  "changes_requested",
]);

/**
 * 業務側のユーザー。認証基盤を入れないため、session / account 等の付随テーブルはありません。
 * @see docs/adr/0015-signed-cookie-dummy-login.md
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: userRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 取引先マスタ。表示の正は report 側のコピーです。 */
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  defaultAddressee: text("default_addressee").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 版の系列。初版では自身の id と同じ値が入ります。 */
    seriesId: uuid("series_id").notNull(),
    version: integer("version").notNull().default(1),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    /**
     * 作成時に clients からコピーします。マスタの改名で確定済み報告書の表示が
     * 変わらないようにするためです。
     * @see docs/adr/0014-client-master-with-copied-cover-fields.md
     */
    clientName: text("client_name").notNull(),
    addressee: text("addressee").notNull(),
    /** 対象月。月初日で表現します。 */
    targetMonth: date("target_month").notNull(),
    status: reportStatus("status").notNull().default("draft"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("reports_series_version_unique").on(table.seriesId, table.version),
    /**
     * 1 つの系列で進行中（draft / in_review）の版は最大 1 つ。
     * 同じ報告書の修正版が 2 つ並走する事故を DB で止めます。
     * @see docs/adr/0009-revision-is-a-copied-report.md
     */
    uniqueIndex("reports_one_open_version_per_series")
      .on(table.seriesId)
      .where(sql`${table.status} in ('draft', 'in_review')`),
    /** 確定済みには確定日時が要り、未確定には入っていてはいけません。 */
    check(
      "reports_confirmed_at_matches_status",
      sql`(${table.status} in ('confirmed', 'superseded')) = (${table.confirmedAt} is not null)`,
    ),
    index("reports_series_idx").on(table.seriesId),
    index("reports_client_idx").on(table.clientId),
  ],
);

export const reportLines = pgTable(
  "report_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    projectName: text("project_name").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    status: reportLineStatus("status").notNull().default("pending"),
    /**
     * 担当営業。「自分に関係する報告書」はこの列からのみ導出します。
     * @see docs/adr/0010-sales-owner-lives-on-the-line.md
     */
    salesOwnerId: uuid("sales_owner_id")
      .notNull()
      .references(() => users.id),
    /**
     * 直近の差し戻し理由。管理者が編集して status が pending に戻ったあとも残します。
     * 対応すべき指摘の文言が編集の瞬間に消えると、業務として成立しないためです。
     * @see docs/adr/0007-approval-is-bound-to-content.md
     */
    changeRequestReason: text("change_request_reason"),
    /** 表示順。 */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * 差し戻しには必ず理由が要ります。逆は課しません（理由は履歴として残るため）。
     * 双方向にすると、編集で pending に戻った瞬間に理由が消えます。
     */
    check(
      "report_lines_reason_required_when_changes_requested",
      sql`${table.status} <> 'changes_requested' or ${table.changeRequestReason} is not null`,
    ),
    check("report_lines_amount_non_negative", sql`${table.amount} >= 0`),
    index("report_lines_report_idx").on(table.reportId),
    index("report_lines_owner_idx").on(table.salesOwnerId),
  ],
);

/**
 * report 単位・report_line 単位のコメントを 1 テーブルで持ちます。
 * line_id が null なら報告書全体へのコメントです。
 *
 * 確定後の不変性トリガはこのテーブルには掛けません。コメントは
 * 「取引先に提出される中身」ではないためです。
 * @see docs/adr/0011-comments-outlive-confirmation.md
 */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    lineId: uuid("line_id").references(() => reportLines.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("comments_report_idx").on(table.reportId),
    index("comments_line_idx").on(table.lineId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  ownedLines: many(reportLines),
  comments: many(comments),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  reports: many(reports),
}));

export const reportsRelations = relations(reports, ({ many, one }) => ({
  client: one(clients, { fields: [reports.clientId], references: [clients.id] }),
  lines: many(reportLines),
  comments: many(comments),
}));

export const reportLinesRelations = relations(reportLines, ({ many, one }) => ({
  report: one(reports, { fields: [reportLines.reportId], references: [reports.id] }),
  salesOwner: one(users, { fields: [reportLines.salesOwnerId], references: [users.id] }),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  report: one(reports, { fields: [comments.reportId], references: [reports.id] }),
  line: one(reportLines, { fields: [comments.lineId], references: [reportLines.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));
