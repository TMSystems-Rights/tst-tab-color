# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コミュニケーションルール

- **応答言語**: 常に日本語で回答する。技術用語（クラス名・コマンド等）はカタカナまたは英語のまま維持する。

## プロジェクト概要

Firefox ブラウザ拡張機能（"tst-tab-color"）— 現在、ソースファイルのない初期セットアップ段階。

プロジェクト名から、タブをサイドバーのツリー構造で管理する人気の Firefox 拡張機能 [Tree Style Tab (TST)](https://github.com/piroor/treestyletab) との連携が想定される。TST の上にタブの色付け・テーマ機能を追加する拡張機能と思われる。

## ソースファイル追加時の注意

- `manifest.json` でエントリーポイント（バックグラウンドスクリプト、コンテンツスクリプト、パーミッション）を確認する。
- TST 連携は通常、TST の拡張機能 ID（`treestyletab@piro.sakura.ne.jp`）に対して `runtime.sendMessage` / `runtime.onMessageExternal` で TST API を呼び出す。
- Firefox WebExtension API を使用する — MDN ドキュメントが正式な参照先。

