# 月次報告書 共同作成アプリケーション

管理者（バックオフィス）と営業が、取引先ごとの月次報告書を 1 枚ずつやりとりしながら仕上げ、確定させる社内向け業務アプリ課題です。

**深掘り領域: 確定後の修正版フロー（版管理）** — 確定した報告書を不変にしたうえで、元の版を残して修正版を作り直す流れを、状態・権限・DB 制約の三層で崩れないように設計しています。

## 設計ドキュメント

本課題の核である設計判断（状態・権限・データモデル）は、以下にまとめています。
README では技術の選定理由と、設計の要点だけを記載します。

- **[docs/design.md](docs/design.md)** — 状態遷移図・権限マトリクス・ER 図。まずこちらを読むと全体像がつかめます
- **[CONTEXT.md](CONTEXT.md)** — 用語集。「承認（Approve）」と「確定（Confirm）」を別語として厳密に分けています
- **[docs/adr/](docs/adr/)** — 個々の決定と、その理由・却下した代案

## 技術スタック

選定理由の詳細と却下した代案は、各 ADR をご参照ください。

| 領域              | 採用                             | なぜこの技術か                                                                                                                                                                                                     |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| フレームワーク    | TanStack Start + React 19        | 確定後の不変と権限判定をサーバー側（loader）に置きます。CSR だけだと不変がブラウザに落ちます。ルートの型はその従です → [ADR-0006](docs/adr/0006-tanstack-start-and-vite-plus.md)                                   |
| ツールチェーン    | Vite+ (`vp`)                     | 採点者と自分の手順を 1 つの CLI にします。 → [ADR-0006](docs/adr/0006-tanstack-start-and-vite-plus.md)                                                                                                             |
| API               | ElysiaJS                         | 型安全な RPC と API 仕様を出せます。Start の Server Function と切り離し、API とクライアントを分けて管理・調査コストを下げます → [ADR-0001](docs/adr/0001-elysia-mounted-inside-tanstack-start.md)                  |
| 型共有 / 仕様書   | Eden Treaty + `@elysia/openapi`  | Eden は生成忘れのない型です。OpenAPI はリポジトリの外（採点者）向けの契約です → [ADR-0013](docs/adr/0013-eden-treaty-with-openapi.md)                                                                              |
| スキーマ          | Valibot                          | サーバー・フォーム・OpenAPI の定義を 1 箇所にします。二重定義は業務ルールの穴になります → [ADR-0004](docs/adr/0004-valibot-and-formisch-for-forms.md)                                                              |
| フォーム          | Formisch (`@formisch/react`)     | アダプタ無しでスキーマからフォームを作ります。スキーマを見れば UI が分かり、認知コストを下げつつ SSOT を維持できます → [ADR-0004](docs/adr/0004-valibot-and-formisch-for-forms.md)                                 |
| エラー            | better-result                    | 記述と品質を一定のルールで揃えます。遷移拒否を型に載せ、想定内の失敗とバグを分けます。多段チェックの合成と、HTTP 越えでも同じタグを復元できます → [ADR-0005](docs/adr/0005-better-result-for-expected-failures.md) |
| UI コンポーネント | Mantine                          | 業務 UI の幅が最も大きいと判断しています。今のテーブル／モーダル／日付を自作せず、版管理に時間を使います。帳票や通知を足す将来にも足ります → [ADR-0003](docs/adr/0003-mantine-with-tailwind-preset.md)             |
| レイアウト        | Tailwind CSS 4                   | レイアウトを短く当てられます。Mantine の見た目は props に任せ、className で上書きしません → [ADR-0003](docs/adr/0003-mantine-with-tailwind-preset.md)                                                              |
| ORM               | Drizzle                          | `drizzle-valibot` で Valibot 一本にできます。生成 SQL に近く、制約・トリガを隠しません → [ADR-0002](docs/adr/0002-postgres-on-docker-over-sqlite.md)                                                               |
| DB                | PostgreSQL                       | 確定後の書き換え禁止や「進行中の版は系列に 1 つ」を、部分ユニークやトリガで DB に書きます → [ADR-0002](docs/adr/0002-postgres-on-docker-over-sqlite.md)                                                            |
| 実行基盤          | Docker                           | ライブラリではなく、その Postgres を採点者が再現するための手段です。`clone → 動く` の減点軸だと分かったうえで払うコストです → [ADR-0002](docs/adr/0002-postgres-on-docker-over-sqlite.md)                          |
| 認証              | 署名付き Cookie のダミーログイン | 要件が許容する簡略化です。評価軸はサーバー側の権限判定であり、認証基盤を足しても堅牢さは上がりません。署名は外しません → [ADR-0015](docs/adr/0015-signed-cookie-dummy-login.md)                                    |

**Mantine + Tailwind はオーバースペックでは？** デザインシステムを二枚持っているのではなく、役割を分けています。Mantine は今の業務 UI の幅を自作せずに埋めるためで、その時間を版管理の深掘りに使います。Tailwind は Mantine が持たないラッパーのレイアウト専用です。将来の拡張性は、今の幅を自作しないことの次に来る利点です。詳細は [ADR-0003](docs/adr/0003-mantine-with-tailwind-preset.md) をご参照ください。

## 設計の要点（3 行版）

- **承認は行ではなく「その時点の内容」に紐づきます。** 管理者が承認済み明細を編集すると、その承認は無効になります。承認を行に貼ったままにすると「営業が承認 → 管理者が金額を書き換え → 承認済みのまま確定」ができてしまいます（[ADR-0007](docs/adr/0007-approval-is-bound-to-content.md)）
- **確定後の不変性はアプリ層と DB トリガの二重で守ります。** 「そう書いた」ではなく「そうとしか動かない」形にします（[ADR-0008](docs/adr/0008-immutability-enforced-in-two-layers.md)）
- **修正版は Report の複製です。** 明細が版ごとに再編集・再承認される必要があるため、読み取り専用のスナップショットでは導線が書けません（[ADR-0009](docs/adr/0009-revision-is-a-copied-report.md)）

## 開発ツール（ランタイムではありません）

業務フローの表現とは層が違うため、上の選定テーブルには混ぜていません。品質ゲートとして入れています。

| ツール       | 用途                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| fallow       | 未使用ファイル・依存・エクスポートの検出（`vp run fallow`）               |
| react-doctor | React 向けの健全性チェック（`vp run doctor`）。編集時のフックでも動きます |

## AI ツールの利用

要件・機能の整理と、技術選定は、先に自分で下書きをしました。その下書きを Matt Pocock の Grill-driven development（[`/grill-with-docs`](https://www.aihero.dev/skills-grill-with-docs)）で問い詰めています。

使ったツールは Claude Code です。作業ごとの分担は次のとおりです。

### 要件・設計・技術選定

- **どのツール:** Claude Code
- **どの作業:** 状態・権限・データモデルの解釈と、技術選定の壁打ち
- **どの程度:** 下書きと更新されたドキュメントのレビューは私です。AI は質問と推奨を出します。採るのは、業務が破綻しないか、深掘りは版管理か、といった自分の評価軸に合うときだけで、最終の意思決定は私です。

### ADR・用語集（`CONTEXT.md`）

- **どのツール:** Claude Code
- **どの作業:** grilling で固まった判断の文書化と、文言の修正
- **どの程度:** 残す内容の判断は私が行いました。文章の下書きは AI です。ドキュメントのレビューは私が実施しました。

### 実装

- **どのツール:** Claude Code
- **どの作業:** 機能の実装（TDD）
- **どの程度:** テスト先行でコードを書くのは Claude Code です。私は[チケット](https://github.com/sc30gsw/coding-challenge-monthly-report/issues)の確認と指示のみ実施しました。通す・戻すの判断は自分です

### レビュー

- **どのツール:** Claude Code
- **どの作業:** 実装後のコードレビュー
- **どの程度:** 一次レビューは Claude Code の review / code-review です。私は動作確認と、指摘を採るか否かの判断、AIレビュー後のレビューを実施しました

## セットアップ

> seed（各状態のサンプルデータ）はまだ入っていません。`vp run setup` は警告を出して seed だけを飛ばします。

### Vite+（`vp`）のインストール

手順は [Getting Started](https://viteplus.dev/guide/) に従ってください。

macOS / Linux:

```bash
curl -fsSL https://vite.plus | bash
```

Windows (PowerShell):

```powershell
irm https://vite.plus/ps1 | iex
```

インストール後、新しいシェルで `vp help` を実行して確認してください。

### 必要なもの

- **Node.js** — [`.node-version`](.node-version) をご参照ください
- **Vite+** — 上の手順で `vp` が PATH にあること
- **Docker** — PostgreSQL の起動に使います。デーモンを起動しておいてください

```bash
git clone https://github.com/sc30gsw/coding-challenge-monthly-report.git
cd coding-challenge-monthly-report
vp run setup
vp dev
```

`vp run setup` が行うのは次の 4 つです。何度実行しても壊れません。

1. `.env.example` から `.env` を作り、`COOKIE_SECRET` を `openssl` で生成して埋める
2. `vp install`
3. `docker compose` で PostgreSQL を起動し、healthcheck が通るまで待つ
4. アプリ用とテスト用の両方のデータベースにマイグレーションを適用し、seed を流す

Docker を使わず外部の PostgreSQL に繋ぐ場合は、`.env` の `DATABASE_URL` と `TEST_DATABASE_URL`
を書き換えてから `vp run setup` を実行してください。Docker には触らずマイグレーションだけを当てます。

### ログイン

`/login` で立場を選ぶだけです。パスワードはありません。

| 名前      | 役割   |
| --------- | ------ |
| 管理 太郎 | 管理者 |
| 佐藤 花子 | 営業   |
| 鈴木 一郎 | 営業   |

同じ報告書を 2 つの立場で見るには、ログアウトして別のユーザーを選び直してください。

要件が「ロールの切り替え方法は自由（ダミーログインも可）」としているため、認証基盤は入れていません。
ただし選んだ `user_id` は署名付き httpOnly Cookie に入れ、**サーバーが毎リクエストで検証します**。
署名を外すと開発者ツールで書き換えるだけで他人になれ、以降の権限設計が意味を失うためです
（[ADR-0015](docs/adr/0015-signed-cookie-dummy-login.md)）。

## コマンド

| コマンド             | 用途                                              |
| -------------------- | ------------------------------------------------- |
| `vp run setup`       | clone 直後の一括セットアップ（上記の 4 つ）       |
| `vp dev`             | 開発サーバー（HMR）                               |
| `vp build`           | プロダクションビルド                              |
| `vp check`           | format + lint + typecheck（`--fix` で自動修正）   |
| `vp test`            | テスト（Docker の PostgreSQL が起動している前提） |
| `vp run db:reset`    | DB 起動 → マイグレーション → seed をやり直す      |
| `vp run db:up`       | PostgreSQL の起動のみ                             |
| `vp run db:down`     | PostgreSQL の停止                                 |
| `vp run db:generate` | スキーマ定義からマイグレーションを生成            |
| `vp run db:migrate`  | マイグレーションの適用のみ                        |
| `vp run fallow`      | 未使用ファイル・依存・エクスポートの検出          |
| `vp run doctor`      | React 向けの健全性チェック                        |

`pnpm` / `npm` は直接使いません。依存の追加も `vp add` を通してください（[AGENTS.md](AGENTS.md)）。
