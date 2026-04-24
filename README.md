# TST タブカラー (TST Tab Color)

**Tree Style Tab (TST) のタブに、URL パターンで色付けできる Firefox 拡張機能です。**
URL パターン（前方一致・正規表現）に合致したタブへ、指定したフォント・フォント色・背景色（アクティブ／ホバー時の色も個別指定可、透過度指定にも対応）を TST サイドバー上でリアルタイム適用します。

**A Firefox add-on that colorizes tabs in the Tree Style Tab (TST) sidebar based on URL patterns.**
Apply your chosen font, font color, and background color (with optional active/hover overrides and alpha transparency) to any tab whose URL matches a rule (prefix or regular expression) — updated live in the TST sidebar.

### ＝＝＝ ルール設定画面（ダーク） ＝＝＝
追加モード：
<img width="2496" height="1439" alt="image" src="https://github.com/user-attachments/assets/c1a7acee-c0ce-4032-a4f4-90de9fcb136b" />

編集モード：
<img width="2496" height="1439" alt="image" src="https://github.com/user-attachments/assets/c2ebc285-5a05-4e0c-8b24-ee51a3eab8de" />

### ＝＝＝ ルール設定画面（ライト） ＝＝＝
編集モード：
<img width="2496" height="1439" alt="image" src="https://github.com/user-attachments/assets/32895281-8cb8-40f3-9611-134cc26987bd" />

### ＝＝＝ ポップアップ（進捗表示） ＝＝＝
<img width="576" height="297" alt="image" src="https://github.com/user-attachments/assets/57353b87-6025-4bc1-9007-4e79a59a6418" />

---

## 当拡張機能が色付けする対象

- Firefox ブラウザ上で、[Tree Style Tab](https://addons.mozilla.org/firefox/addon/tree-style-tab/) のサイドバーに表示されるタブのうち、
    - 通常のタブ／ピン止めタブ／コンテナタブ

※ Firefox 標準のグループ機能で作成した「仮想グループタブ」は CSS 的な仮想要素のため対象外です。

---

## 主な機能 (Features)

- **URL パターンによるタブ色付け (URL-based coloring)**
    - タブの URL が設定済みパターンに一致した際、TST サイドバー上のそのタブへフォント・フォント色・背景色を適用します。
    - パターン種別は **前方一致** と **正規表現** の 2 種類をサポート。
    - 複数ルールが一致する場合はルール一覧上位（優先度が高い）のものが適用されます。
- **アクティブ／ホバー時の色を個別指定 (Active / hover color overrides) — v1.1.0**
    - 通常時とは別に、マウスホバー時・アクティブタブ時のフォント色と背景色を個別に指定できます。
    - 未指定時は従来通りの自動反転（invert）挙動にフォールバックします。
- **透過度（α）対応 (Alpha transparency) — v1.1.0**
    - カラーコードに透過度指定が可能。`#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` の 4 形式を受理。
    - オプション画面にα スライダーを備え、テキスト欄・カラーピッカーと双方向連動します。
    - TST 既定のタブ色と馴染ませたい場合に有効です。
- **フォントプレビュー (Font preview) — v1.1.0**
    - ルール追加／更新フォームでフォントを入力すると、指定フォントによるサンプル文をリアルタイム表示。
    - ルール保存前に見た目を確認できます。
- **リアルタイム反映 (Live update)**
    - タブ新規作成時、URL 変更（ナビゲーション）時に即座に再評価・再色付けします。
    - Firefox 起動時や TST 再ロード時も、既存の全タブに対して自動で色付けを再適用します。
- **ルール設定画面 (Rule management)**
    - オプションページからルールを追加・編集・削除・並び替え可能。
    - 入力値はフォームでバリデーションされます（URL パターン未入力／正規表現構文エラー／カラーコード形式エラー／全スタイル未指定など）。
    - ルール一覧はフォント色／背景色セルが 2 段構成で、通常色／アクティブ色をひと目で把握可能。透過色はチェッカー背景で視覚化されます。
    - ルール一覧の「URL パターン」「フォント」列は省略表示時にホバーで全文をツールチップ表示。
    - ライト／ダークのテーマ切替を搭載。
- **高速な一括適用 (Fast batch apply)**
    - タブを内部でバケット化し、`remove-tab-state` を 1 回 + ルールごとに `add-tab-state` 1 回というバッチ送信方式を採用。2,000 タブ規模でも 1 秒以内に完了します。
- **進捗表示 (Progress indicator)**
    - ツールバーアイコンをクリックするとポップアップが開き、現在の適用進捗（分類中／クラス除去中／ルール適用中／完了）を進捗バーと共に表示します。オプションページでも同様に確認できます。
- **多言語対応 (Localization)**
    - 日本語と英語の UI に対応しています。

---

## 使い方 (Usage)

1.  Firefox のツールバーにある本拡張機能のアイコンをクリックします。
2.  ポップアップから **[オプションを開く]** を選択し、ルール設定画面を開きます。
3.  **「ルール追加」** セクションで下記を入力し **[新規登録]** を押すとルールが追加されます。
    - **URL パターン**（前方一致または正規表現）
    - **種別**（前方一致 / 正規表現）
    - **フォント**（任意。例: `"Meiryo", sans-serif`）— 入力すると直下にプレビューが表示されます
    - **フォント色**（任意。例: `#ffffff` / `#ffffff80`）
    - **背景色**（任意。例: `#1e3a8a` / `#1e3a8a80`）
    - **アクティブ／ホバー時フォント色**（任意。未指定時は自動反転挙動）
    - **アクティブ／ホバー時背景色**（任意。未指定時は自動反転挙動）
    - ※ カラーコードは `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` の 4 形式に対応。各色入力欄には α スライダーが付属しています。
    - ※ フォント・フォント色・背景色・アクティブ時各色のいずれか1つ以上の指定が必須です。
4.  登録したルールは **「ルール一覧」** に表示され、以下が可能です。
    - **[編集]** ボタンで内容を修正
    - **[削除]** ボタンで削除
    - **ドラッグ操作** で優先順位（上位優先）を並び替え
5.  ルールの追加・更新・削除・並び替えは即座に TST サイドバーへ反映されます。

### テーマ切替

- ルール設定画面の右上の **Light / Dark トグル** で画面配色を切り替えできます。選択はブラウザローカルに保存されます。

---

## インストール (Installation)

[製品ページ（こちらのリンクからアドオンをインストールできます）](https://addons.mozilla.org/ja/firefox/addon/tst-tab-color/)

---

## ライセンス (License)

このプロジェクトの主要なソースコードは、[MIT License](src/LICENSE) の下で公開されています。

The primary source code of this project is released under the [MIT License](src/LICENSE).

### サードパーティのコンポーネント (Third Party Components)

この拡張機能は、以下のサードパーティのソフトウェアおよびリソースを含んでいます。これらのコンポーネントは、それぞれのライセンスに従います。

This extension includes the following third-party software and resources. These components are subject to their respective licenses.

- **Tree Style Tab 連携 (Integration with Tree Style Tab)**
    - 本ソフトウェアは、Piro 氏によって開発された [Tree Style Tab](https://github.com/piroor/treestyletab/) の External API（`register-self` / `add-tab-state` / `remove-tab-state` など）を利用しています。
    - **ライセンス (License):** [Mozilla Public License 2.0](https://www.mozilla.org/en-US/MPL/2.0/)

---

## プライバシーポリシー (Privacy Policy)

[プライバシーポリシーはこちらをご覧ください。](src/PRIVACY.md)

[Please see our Privacy Policy here.](src/PRIVACY.md)

---

## 作者 (Author)

**TMSystems**

Copyright (c) 2026 TMSystems. All Rights Reserved.

