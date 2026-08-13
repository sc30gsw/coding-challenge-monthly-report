-- Postgres コンテナの初回起動時にのみ実行されます（データボリュームが空のとき）。
-- テスト用データベースを作ります。接続先は .env の TEST_DATABASE_URL です。
CREATE DATABASE monthly_report_test;
