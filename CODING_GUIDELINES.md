# コーディング規約

このドキュメントは `coding-challenge-monthly-report` のコーディング規約の正本です。エージェント向けの短い抜粋は `.claude/rules/` にあります。コマンドと Vite+ の落とし穴は [AGENTS.md](./AGENTS.md) が正です。アーキテクチャ判断は [docs/adr/](./docs/adr/) を参照してください。

## 目次

1. [プロジェクト構造](#プロジェクト構造)
2. [型定義規約](#型定義規約)
3. [テストを念頭に入れたコーディング](#テストを念頭に入れたコーディング)
4. [コードスタイル](#コードスタイル)
5. [React/TypeScript規約](#reacttypescript規約)
6. [UI（Mantine と Tailwind）](#uimantine-と-tailwind)
7. [フォームと検証（Valibot / Formisch）](#フォームと検証valibot--formisch)
8. [エラーハンドリング（better-result）](#エラーハンドリングbetter-result)
9. [追加推奨事項](#追加推奨事項)
10. [ツール設定](#ツール設定)

---

## プロジェクト構造

[Bulletproof React](https://github.com/alan2207/bulletproof-react) の Feature-based 構造を目標にします。今日の `src/` はルートと `lib/theme.ts` が中心です。feature 用ディレクトリは機能が乗ったときに作り、空フォルダを先に並べません。

```
src/
├── features/            # 機能別モジュール（メイン）
│   └── [feature]/
│       ├── components/  # feature 固有のコンポーネント
│       ├── hooks/       # feature 固有のカスタムフック
│       ├── schemas/     # Valibot スキーマ
│       └── types/       # 型定義（スキーマから派生）
├── routes/              # TanStack Router の file-based ルート（ロジックは最小限）
├── lib/                 # 横断設定（theme など）
│   └── theme.ts
└── styles.css
```

`src/components/`・`src/hooks/`・`src/utils/` は、複数 feature で本当に共有するものが出てから作ります。

ElysiaJS は [ADR 0001](./docs/adr/0001-elysia-mounted-inside-tanstack-start.md) で採用済みですが、まだ依存に入っていません。`features/*/api/` は Elysia を入れてから作ります。生成クライアント（`src/lib/api/generated/`）は使いません。

### ディレクトリの役割

| ディレクトリ  | 説明                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------- |
| `features/`   | ビジネスロジックの中心。機能ごとに独立したモジュール                                        |
| `components/` | 複数 feature で共有する UI（必要になったら作成）                                            |
| `routes/`     | TanStack Router の file-based ルート。`createFileRoute` で配線し、ロジックは feature に置く |
| `lib/`        | Mantine テーマなど、ライブラリの設定                                                        |

### インポートパス（必須）

**`~` エイリアスの使用は必須です。** 相対パスでのインポートは、同一ディレクトリ内でも禁止します。`~/*` → `src/*` は `tsconfig.json` の `compilerOptions.paths` で宣言し、Vite は `resolve.tsconfigPaths: true` で拾います。新しいマッピングは tsconfig にだけ足します。

```typescript
// ✅ Good: ~ エイリアスを使用
import { useReports } from "~/features/reports/hooks/use-reports";
import type { Report } from "~/features/reports/types/report";
import { theme } from "~/lib/theme";

// ❌ Bad: 相対パスは禁止
import { useReports } from "../../../features/reports/hooks/use-reports";
import { helper } from "./helper";
```

### Feature 間の依存

Feature 間の直接依存は避けます。共通で必要なものは `src/components/` など上位へ抽出します。

```typescript
// ❌ Bad: feature 間の直接依存
import { UserSelect } from "~/features/users/components/user-select";

// ✅ Good: 共有コンポーネントとして抽出
import { UserSelect } from "~/components/user-select";
```

---

## 型定義規約

### const assertion + satisfies パターン

オブジェクト定数には `as const satisfies` を使い、リテラル型を保ったまま型チェックします。

```typescript
const statusLabels = {
  draft: "下書き",
  confirmed: "確定",
} as const satisfies Record<ReportStatus, string>;
```

```typescript
// ❌ Bad: 型推論が string に広がる
const statusLabels: Record<ReportStatus, string> = {
  draft: "下書き",
  confirmed: "確定",
};
```

### Single Source of Truth

型は一箇所で定義し、派生型は親から作ります。フォームと入力検証では Valibot スキーマを正とし、`v.InferOutput` で型を導きます。手書きの同一形状を並べません。

```typescript
export const CreateReportSchema = v.object({
  title: v.pipe(v.string(), v.minLength(1, "タイトルは必須です")),
});

export type CreateReportInput = v.InferOutput<typeof CreateReportSchema>;
```

### type vs interface

基本的に `type` を使います。`interface` は使いません。

```typescript
type Report = {
  id: string;
  title: string;
};
```

### 型推論を優先する

TypeScript が正しく推論できる場合は、戻り値の型を書きません。注釈を書くのは、推論が `unknown` / `any` になる場合か、外部から呼ばれる公開境界で意図を明示する必要がある場合だけです。

### TypeScript Utility 型の活用（必須）

Props などでは Utility 型を優先します。

1. **1〜2 個のプロパティ** → 専用型を定義せず `Pick` / `Omit` / `Record` をインラインで使う
2. **3 個以上** → コンポーネントの近くに `type` を定義してよい
3. **既存の型から派生できる** → 必ず `Pick` / `Omit` などで派生させる

```typescript
import type { ReactNode } from "react";

export function Container({ children }: Record<"children", ReactNode>) {
  return <div className="container">{children}</div>;
}

export function ReportTitle({ title }: Pick<Report, "title">) {
  return <span>{title}</span>;
}
```

---

## テストを念頭に入れたコーディング

テストは `src/**/*.test.ts(x)` だけが収集されます。ユーティリティは `vite-plus/test` から import し、`vitest` から直接 import しません。実行は `vp test` です。

### クエリの優先順位

ユーザーが操作・確認する要素は **role** と **テキスト** で取得します。

1. `getByRole`
2. `getByText`
3. `getByLabelText` / `getByPlaceholderText`
4. `getByAltText`

```typescript
const submitButton = screen.getByRole("button", { name: "送信" });
expect(screen.getByRole("heading", { name: "月次レポート" })).toBeInTheDocument();
```

```typescript
// ❌ Bad: testId やクラス名
const submitButton = screen.getByTestId("submit-button");
```

### testId は使用しない

`data-testid` は禁止です。名前が無い要素には `aria-label` を付けます。

---

## コードスタイル

実際の整形は **oxfmt**（`vp check` / `vp run fix`）が担当します。クォート、セミコロン、import 順、行長はフォーマッタに任せ、この文書では繰り返しません。

### 命名規則

| 対象           | 規則             | 例                                   |
| -------------- | ---------------- | ------------------------------------ |
| 変数・関数     | lowerCamelCase   | `reportTitle`, `getReports`          |
| コンポーネント | UpperCamelCase   | `ReportTable`, `ConfirmButton`       |
| 型             | UpperCamelCase   | `Report`, `CreateReportInput`        |
| 定数           | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `API_BASE_URL`    |
| ファイル名     | kebab-case       | `use-reports.ts`, `report-table.tsx` |

### 不変性

オブジェクトや配列は破壊的に変更せず、新しい値を返します。

```typescript
const updated = { ...report, title: "新しいタイトル" };
```

### コメント

「何をしているか」ではなく「なぜそうしているか」を書きます。複雑な業務ルールには理由を残します。

```typescript
// ページネーション API は 1 始まり
const page = currentPage + 1;
```

コミットするコードに `console.log` を残しません。

---

## React/TypeScript規約

### Named Export を使用

default export は `src/router.tsx` と `*.config.ts`（oxlint の `no-default-export` override）を除き使いません。ルートファイルは `export const Route = createFileRoute(...)` で完結するため、default export は不要です。`src/routes/**` の override は `react-doctor/no-multi-comp` と `react-doctor/only-export-components` だけで、`no-default-export` はオンのままです。

```typescript
export function ReportTable({ reports }: ReportTableProps) {
  return <Table>{/* ... */}</Table>;
}
```

### 関数スタイル

コンポーネントとカスタムフックは **関数宣言** を使います。アロー関数でコンポーネントを定義しません。

```typescript
export function ReportTable({ reports }: ReportTableProps) {
  return <Table>{/* ... */}</Table>;
}

export function useReports() {
  // ...
}
```

### Props 型の定義

3 個以上の props はコンポーネントの近くで `type` を定義します。1〜2 個は Utility 型をインラインで使います。

### react-compiler

このプロジェクトは React Compiler（babel plugin）を使います。プロファイラでボトルネックを測るまでは `useMemo` / `useCallback` を足しません。

---

## UI（Mantine と Tailwind）

根拠は [ADR 0003](./docs/adr/0003-mantine-with-tailwind-preset.md) です。

- **複合コンポーネント**（テーブル、モーダル、フォーム、通知、日付）は Mantine
- **ラッパーのレイアウト**（flex / grid / 余白の微調整）は Tailwind
- 同じ関心を両方で書かない。Mantine が持つ props を Tailwind で上書きしない

```tsx
<Button color="blue" mt="md" size="sm">
  送信
</Button>
```

```tsx
// ❌ Bad: Mantine が既に持つ見た目を className で上書き
<Button className="mt-4 text-blue-600 text-sm">送信</Button>
```

クラス名の結合は `cn`（`cnfast`）だけです。`clsx` / `tailwind-merge` は入れません。oxfmt の Tailwind 整列も `cn` 向けです。

```tsx
import type { ReactNode } from "react";
import { cn } from "cnfast";

export function FormSection({ children }: Record<"children", ReactNode>) {
  return <section className="flex flex-col gap-4">{children}</section>;
}

<section className={cn("flex flex-col gap-4", isWide && "max-w-5xl")} />;
```

Mantine 内部を `[&_.mantine-Button-label]` のようなセレクタで殴りません。

テーマの正は `src/lib/theme.ts`（`createTheme`）で、`src/routes/__root.tsx` の `MantineProvider` に渡します。`src/styles.css` は `tailwind-preset-mantine` を import します。素の `@import "tailwindcss"` は足しません。

`createTheme` に足したカスタム色は Mantine props では使えますが、生成スタイルシートを配線するまで Tailwind クラス（`bg-brand-6` など）にはなりません。

---

## フォームと検証（Valibot / Formisch）

根拠は [ADR 0004](./docs/adr/0004-valibot-and-formisch-for-forms.md) です。スキーマは `features/[feature]/schemas/` に置き、Formisch の `useForm({ schema })` にそのまま渡します。TanStack Form も Zod もアダプタも使いません。

検証は境界（ユーザー入力・外部データ）にだけ置きます。純内部の変換に Valibot を挟みません。

Mantine の入力はネイティブ要素を晒さないことが多いので、`field.props` を spread せず `value` / `onChange` / `onBlur` を繋ぎます。

```tsx
import { Field, Form, useForm } from "@formisch/react";
import type { SubmitHandler } from "@formisch/react";
import { Button, TextInput } from "@mantine/core";
import { CreateReportSchema } from "~/features/reports/schemas/create-report-schema";

export function ReportForm({ onSuccess }: Record<"onSuccess", () => void>) {
  const form = useForm({ schema: CreateReportSchema });

  const handleSubmit: SubmitHandler<typeof CreateReportSchema> = async (output) => {
    await createReport(output);
    onSuccess();
  };

  return (
    <Form of={form} onSubmit={handleSubmit}>
      <Field of={form} path={["title"]}>
        {(field) => (
          <TextInput
            error={field.errors?.[0]}
            label="タイトル"
            onBlur={field.props.onBlur}
            onChange={(event) => field.onChange(event.currentTarget.value)}
            value={field.input}
          />
        )}
      </Field>
      <Button disabled={form.isSubmitting} type="submit">
        作成
      </Button>
    </Form>
  );
}
```

検証メッセージはスキーマに書きます。詳細 API（配列フィールドなど）は `formisch` スキルを参照します。

---

## エラーハンドリング（better-result）

根拠は [ADR 0005](./docs/adr/0005-better-result-for-expected-failures.md) と公式ドキュメント（[llms.txt](https://better-result.dev/llms.txt)、[Mental model](https://better-result.dev/getting-started/mental-model)、[Extracting values](https://better-result.dev/core/extracting-values)、[Result codecs](https://better-result.dev/serialization/result-codecs)）です。

### いつ Result を使うか

業務上の想定失敗（検証失敗、未找到、確定済みなので編集できない、など）は `Result` + `TaggedError` で表します。プログラマの欠陥（不変条件違反）は `Panic` / throw のままにし、Result のエラー型に混ぜません。

投げる第三者 API は境界で `Result.try` / `Result.tryPromise` に包み、`catch` は throw せずエラー値を返します。`map` / `catch` / `finally` の中で throw すると `Panic` になります。

```typescript
class ReportNotFound extends TaggedError("ReportNotFound")<{
  cause?: unknown;
  id: string;
  message: string;
}>() {}

const result = await Result.tryPromise({
  try: () => loadReport(id),
  catch: (cause) => new ReportNotFound({ cause, id, message: "レポートが見つかりません" }),
});
```

### 合成と取り出し

途中で Result を剥がさず、`Result.gen` + `yield*` + `Result.await` で合成します。分岐は `.match({ ok, err })` でも `Result.isOk` / `Result.isError` でも構いません。エラーユニオンの網羅には `matchError` を使います。

- `.unwrap()` は「ここで失敗したらバグ」という不変条件だけ（失敗時は `Panic`）
- 通常のフォールバックは `unwrapOr`
- `Result<T, any>` は禁止

```typescript
const result = await Result.gen(async function* () {
  const report = yield* Result.await(loadReport(id));
  const lines = yield* Result.await(loadLines(report.id));
  return Result.ok({ lines, report });
});

result.match({
  err: (error) => showFailure(error),
  ok: (data) => renderReport(data),
});
```

### シリアライズ境界

同一プロセス内では `Result` インスタンスのまま扱います。プロセスを跨ぐ境界（将来の Elysia ハンドラ、サーバー関数、RPC）ではクラスをそのまま返さず、`Result.serialize` / `Result.deserialize` を使います。手製の `{ error: true, data }` は使いません。

`deserialize` が保証するのは Result の封筒だけです。中身の型は Valibot で検証します。

```typescript
return Result.serialize(result);

const decoded = Result.deserialize<Report, ReportNotFound>(payload);
if (Result.isError(decoded)) {
  return;
}
const parsed = v.safeParse(ReportSchema, decoded.value);
```

---

## 追加推奨事項

### AHA Programming

[AHA Programming](https://kentcdodds.com/blog/aha-programming) に従います。間違った抽象化より重複を選び、3 回目の重複で抽出を検討します。

### ルートは薄く保つ

```typescript
export const Route = createFileRoute("/reports")({
  component: ReportsPage,
  loader: () => loadReports(),
});
```

認可やデータ取得の中身は feature 側に置きます。TanStack Query は使いません。

---

## ツール設定

詳細と落とし穴は [AGENTS.md](./AGENTS.md) が正です。日常的に使うコマンドだけここに置きます。

| コマンド     | 用途                                    |
| ------------ | --------------------------------------- |
| `vp check`   | format + lint + typecheck（警告も失敗） |
| `vp run fix` | 自動修正（`vp check --fix`）            |
| `vp test`    | テスト                                  |
| `vp build`   | 本番ビルド                              |
| `vp lint`    | lint のみ                               |

`pnpm` / `npm` / `yarn` は直接使いません。`vite` / `vitest` からの import は禁止で、`vite-plus` / `vite-plus/test` を使います。作業完了前に `vp check` と `vp test` を実行します。

---

## 参考リンク

- [AGENTS.md](./AGENTS.md)
- [Bulletproof React](https://github.com/alan2207/bulletproof-react)
- [TanStack Start](https://tanstack.com/start)
- [TanStack Router](https://tanstack.com/router)
- [Mantine](https://mantine.dev/)
- [Valibot](https://valibot.dev/)
- [Formisch](https://formisch.dev/)
- [better-result](https://better-result.dev/llms.txt)
- [AHA Programming](https://kentcdodds.com/blog/aha-programming)
- [Testing Library - Queries](https://testing-library.com/docs/queries/about)
