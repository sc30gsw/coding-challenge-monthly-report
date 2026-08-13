# 型の共有は Eden Treaty、仕様書は OpenAPI、スキーマは Valibot だけ

フロントから API を呼ぶ経路は Eden Treaty（`typeof app` から型を引く）です。あわせて `@elysia/openapi` で OpenAPI 仕様書を出します。入力・出力のスキーマは Valibot のみで書き、TypeBox（`t.*`）は使いません。

**なぜ Eden か:** コード生成のステップを挟まずに、サーバーのルート定義を変えた瞬間にフロント側が型エラーになるためです。生成クライアントだと「生成し忘れたまま壊れたコードがコンパイルを通る」時間帯が生まれます。プロトタイプで速く回すうえで、この時間帯が無いことの価値が大きいと判断しました。

**なぜ OpenAPI も出すか:** Eden はこのリポジトリの中でしか効きません。API 仕様書は課題の提出物として、採点者が Scalar UI で叩いて確認できる形が要ると考えました。Eden が開発中の型安全、OpenAPI が外向けの契約、と役割を分けました。

**なぜ Valibot だけか:** Elysia は標準の TypeBox に加え、`mapJsonSchema: { valibot: toJsonSchema }`（`@valibot/to-json-schema`）で Valibot を OpenAPI に写せます。フォームが Formisch + Valibot（[0004](./0004-valibot-and-formisch-for-forms.md)）である以上、サーバー側だけ TypeBox にすると同じ検証規則を 2 つの記法で書くことになります。1 本に統一しました。

## Drizzle スキーマからの導出

Elysia の公式レシピは Drizzle スキーマを `drizzle-typebox` で検証モデルに変換する流れを推しています。ここでは Valibot 統一の方針に合わせて **`drizzle-valibot`** を使うことにしました。

副次的な利点として、公式レシピが警告している **`@sinclair/typebox` のバージョン固定（Symbol 衝突を避けるための `overrides`）が不要になります**。Elysia 本体が使う TypeBox と、Drizzle 由来の TypeBox が別インスタンスになる問題そのものが発生しません。

## 影響

- `@valibot/to-json-schema` と `drizzle-valibot` が追加の依存になります。
- Valibot スキーマは `src/features/*/schemas/` に置き、サーバーのルート定義とフォームの両方から import します。定義箇所は 1 つです。
- Eden の型は `typeof app` に依存するので、Elysia のルート定義に明示的な戻り値型を書きすぎると型が痩せます。ハンドラの戻り値は推論に任せます。
