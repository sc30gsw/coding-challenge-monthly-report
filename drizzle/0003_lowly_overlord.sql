-- drizzle-kit generate も出力した DROP/ADD CONSTRAINT report_lines_reason_only_when_changes_requested
-- は削除しました。0002 が生 SQL で同じ制約を新しい名前へ改名済みで、スナップショット側だけが
-- 古い名前を覚えているための誤検知です。そのまま流すと、その名前の制約が既に無い DB で失敗します。
ALTER TABLE "report_lines" ADD COLUMN "previously_approved" boolean DEFAULT false NOT NULL;
