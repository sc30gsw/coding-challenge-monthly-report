/**
 * 金額の表示形式です。**1 箇所だけに置きます。**
 *
 * 明細一覧・報告書一覧・報告書詳細が同じ書式を使う必要があります。別々に
 * `new Intl.NumberFormat` すると、桁区切りや通貨記号の出し方がいつか必ずずれます。
 */
export const yen = new Intl.NumberFormat("ja-JP", { currency: "JPY", style: "currency" });
