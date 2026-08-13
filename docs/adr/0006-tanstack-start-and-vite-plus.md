# フレームワークは TanStack Start、ツールチェーンは Vite+ に一本化する

**決定:** フロントは TanStack Start（React 19 / TanStack Router のファイルベースルーティング）とします。dev / build / lint / format / test / パッケージ管理はすべて Vite+（`vp`）に通します。

## なぜ TanStack Start か

「確定後の不変」と「権限判定」をサーバー側に置くためです。loader で認可済みデータだけを渡せます。CSR のみ（Vite + React Router）だと判定がブラウザに落ち、[0008](./0008-immutability-enforced-in-two-layers.md) の不変が「そう書いた」だけになります。ルートパラメータと search の型は従の利点です。Next.js の情報量より、この課題の権限境界が型で守られることを優先しました。

## なぜ Vite+ か

チームの手順を `vp` 一本にするためです。また、Linter・Formatter についても一元管理が可能となるため選びました。
インストールは [Vite+ Getting Started](https://viteplus.dev/guide/) に従ってください。

## 採らなかった案

- **Next.js（App Router）** — 実績は勝りますが、ルートと search の型、loader での認可済みデータの取り方が、この課題には Start の方が素直だと判断し、見送りました。
- **Vite + React Router のみ（SSR なし）** — 権限判定をクライアントに寄せざるを得ないため見送りました。
- **Vite / Vitest / Oxlint を個別導入** — 採点者の手順が割れるため見送りました。

## 影響

- `pnpm` / `npm` は直接叩きません。CI は `vp check` → `vp test` → `vp build` です。
- `pnpm-workspace.yaml` の `minimumReleaseAge: 1440` は意図したサプライチェーン対策です。
