This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コミュニケーションルール

- **応答言語**: 常に日本語で回答する。技術用語（クラス名・コマンド等）はカタカナまたは英語のまま維持する。

## プロジェクト概要

Firefox 拡張機能「TST タブカラー」（tst-tab-color）。[Tree Style Tab (TST)](https://github.com/piroor/treestyletab) のサイドバー上のタブへ、URL パターン（前方一致・正規表現）に基づきフォント・フォント色・背景色を適用する。v1.1.0 以降はアクティブ／ホバー時の色指定・透過度指定にも対応。AMO 公開済み（拡張機能 ID: `{f88d6b5e-0c2d-4edd-b9c6-d433b079fb80}`）。

- TST 拡張機能 ID: `treestyletab@piro.sakura.ne.jp`（`runtime.sendMessage` / `runtime.onMessageExternal` で連携）
- 使用 API: `register-self` / `add-tab-state` / `remove-tab-state`
- Manifest V3 / Vanilla JS（ビルドツール非使用、jQuery は `src/lib/` に同梱）
- i18n 対応（ja / en、`src/_locales/`）

## 主要ドキュメント

設計ドキュメント類は Obsidian 保管庫（リポジトリ外）へ移動済み。バージョン別フォルダで管理。

- 保管庫ルート: `E:\090_Obsidian\TmObsidian02_PublicDocs\0020_設計ドキュメント\0030_Firefoxアドオン_TSTタブカラー\`
- ワークスペース: `E:\090_Obsidian\TmObsidian02_PublicDocs\TmObsidian02_PublicDocs.code-workspace`
- `v1.0.0/010_要件定義書.md` / `v1.0.0/020_機能設計書.md` / `v1.0.0/030_実装計画書.md` — v1.0.0 時点の要件・設計・計画（以降のバージョンでは更新せず、差分仕様書で管理）
- `v1.0.0/090_セッション引継ぎ_課題1_パフォーマンス.md` — v1.0.0 のパフォーマンス課題引継ぎメモ
- `v1.1.0/010_v1.1.0_追加仕様書.md` — v1.1.0 の差分仕様
- `v1.2.0/010_v1.2.0_機能追加要望書.md` — v1.2.0 の機能追加要望
- **以降のバージョンアップ時もバージョン別フォルダ（`vX.Y.Z/`）配下に追加仕様書等を新設する方針**
- 共通コーディング規約: `E:\090_Obsidian\TmObsidian02_PublicDocs\0020_設計ドキュメント\0000_共通ルール\010_フロントエンド\010_コーディング規約（フロントエンド編）.md`（旧 `docs/100_コーディングルール.md` 相当。id / CSS クラス命名規則等）
- リポジトリ内に残るドキュメント: `History.md`（リリース履歴）, `README.md`

## コーディング規約（抜粋）

- **名前空間オブジェクト**で機能を集約: `TMS_COMMON` / `TMS_BACKGROUND` / `TMS_OPTIONS` / `TMS_POPUP`
- **CSS クラス**は `tm-` 接頭辞、**DOM id** は `tm` 接頭辞のキャメルケース（例: `tmTxtPattern`）
- **ルールクラス**は `tm-rule-{index}` 形式（`TMS_COMMON.Const.CSS_CLASS_PREFIX + n`）
- **凍結ポリシー**: `State` は `Object.seal`、メソッド群は `DeepFreeze`、名前空間自体も `Object.freeze`
- 詳細は Obsidian 保管庫の `0000_共通ルール/010_フロントエンド/010_コーディング規約（フロントエンド編）.md` を参照

## ビルド・配布

```bash
npm run build:zip   # → dist/tst-tab-color-<version>.zip
```

`scripts/build-zip.py` が `src/` 配下のみを zip 化（`.gitkeep` / `.DS_Store` / `Thumbs.db` を除外）。AMO 提出前に `src/manifest.json` / `package.json` の `version` を必ずインクリメント（AMO は同一バージョン再提出不可）。

## 作業時の注意

- `src/lib/jquery.min.js` の `innerHTML` 警告 3 件は jQuery 本体のものでブロックしない警告。AMO 審査担当者宛メモで説明済み
- `browser_specific_settings.gecko.data_collection_permissions` は新規拡張で必須。本拡張は `{"required": ["none"]}` を指定（オブジェクト形式、配列は NG）
- UI 変更を加えたら Obsidian 保管庫内の該当バージョン（`vX.Y.Z/`）の差分仕様書・`README.md`・`History.md` の整合性も確認すること
