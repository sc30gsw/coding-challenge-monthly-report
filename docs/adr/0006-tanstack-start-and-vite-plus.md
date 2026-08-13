# フレームワークは TanStack Start、ツールチェーンは Vite+ に一本化する

**決定:** フロントは TanStack Start（React 19 / TanStack Router のファイルベースルーティング）とします。dev / build / lint / format / test / パッケージ管理はすべて Vite+（`vp`）に通します。

## なぜ TanStack Start か

「確定後の不変」と「権限判定」をサーバー側に置くためです。loader で認可済みデータだけを渡せます。CSR のみ（Vite + React Router）だと判定がブラウザに落ち、[0008](./0008-immutability-enforced-in-two-layers.md) の不変が「そう書いた」だけになります。ルートパラメータと search および loader など Route に関する型安全性も大きな利点です。Next.js の情報量より、情報を Route に集約し権限境界が型で守られることを優先しました。

## なぜ Vite+ か

チームの手順を `vp` 一本にするためです。また、Linter・Formatter についても一元管理が可能となるため選びました。
インストールは [Vite+ Getting Started](https://viteplus.dev/guide/) に従ってください。

## 採らなかった案

- **Next.js（App Router）** — 実績は勝りますが、ルートと search の型、loader での認可済みデータの扱いと型安全性において、この課題には TanStack Start の方がマッチしていると判断しました。また、Next.js の利点であるきめ細かなキャッシュ設定、レンダリング戦略（SSR 以外の SSG・ISG・PPR）という大きな利点の採用を多くできそうにないため、見送りました。
- **Vite + React Router のみ（SSR なし）** — 権限判定をクライアントに寄せざるを得ないため見送りました。
- **Vite / Vitest / Oxlint を個別導入** — 採点者の手順が割れるため見送りました。

## 影響

- `pnpm` / `npm` は直接叩きません。CI は `vp check` → `vp test` → `vp build` です。
- `pnpm-workspace.yaml` の `minimumReleaseAge: 1440` は意図したサプライチェーン対策です。
