# プライバシーポリシー (Privacy Policy)

## TST タブカラー (TST Tab Color)

**最終更新日 (Last Updated):** 2026-06-10

TMSystems（以下、「開発者」）は、このアドオン「TST タブカラー」（以下、「本ソフトウェア」）におけるプライバシー情報の取り扱いについて、以下の通りプライバシーポリシーを定めます。

### 1. 収集する情報 (Information We Collect)

本ソフトウェアは、ユーザーの個人情報や、閲覧履歴、タブの情報など、いかなるデータも**収集、保存、送信しません**。すべての処理は、ユーザーのコンピュータ内で完結します。

ユーザーが設定したルール（URL パターン・タブ名パターン・色設定）は、Firefox が提供する `storage.sync`（アカウント同期）および `storage.local`（端末内保存）の領域にのみ保存され、開発者や第三者に送信されることはありません。

This software **does not collect, store, or transmit any personal information**, browsing history, tab information, or any other user data. All processing is completed locally on the user's computer.

Rules configured by the user (URL patterns and color settings) are stored only in Firefox's `storage.sync` (account sync) and `storage.local` (local device) areas, and are never transmitted to the developer or any third party.

### 2. 権限 (Permissions)

本ソフトウェアは、その機能を提供するために以下の権限を要求しますが、これらの権限は目的の範囲内でのみ使用され、データの収集には使用されません。

Our add-on requires the following permissions to function. These permissions are used only for the purposes described below and not for data collection.

-   **tabs**: 開いているタブの URL およびタイトル（タブ名）を取得し、ユーザーが設定したルールに一致するかを判定するために必要です。判定結果は Tree Style Tab の External API 経由で「そのタブへ CSS クラスを付与する」形で使用され、これらの情報は外部へ送信されません。
    (Required to read the URLs and titles of open tabs and determine whether they match user-defined rules. The result is used solely to attach a CSS class to the matched tab via the Tree Style Tab External API. This information is never transmitted externally.)
-   **storage**: ユーザーが設定したルール（URL パターン・タブ名パターン・色設定）およびテーマ選択（ライト／ダーク）を保存するために必要です。
    (Required to store user-defined rules (URL patterns, tab title patterns, and color settings) and theme selection (light/dark).)

### 3. 外部通信 (External Communication)

本ソフトウェアは外部サーバと通信しません。ただし、同一ブラウザ内にインストールされた拡張機能 **Tree Style Tab** (`treestyletab@piro.sakura.ne.jp`) に対し、タブへの状態付与／解除をリクエストする目的で `runtime.sendMessage` を利用します。この通信は Firefox 内部で完結し、ネットワークには送出されません。

This software does not communicate with any external server. It only uses `runtime.sendMessage` to request tab state attach/detach operations against the **Tree Style Tab** extension (`treestyletab@piro.sakura.ne.jp`) installed in the same browser. This communication is confined within Firefox and is not sent over the network.

### 4. お問い合わせ (Contact Us)

本ポリシーに関するお問い合わせは、以下の GitHub リポジトリの"Issues"までお願いいたします。

For any questions regarding this policy, please contact us via the "Issues" section of our GitHub repository.

[https://github.com/TMSystems-Rights/tst-tab-color](https://github.com/TMSystems-Rights/tst-tab-color)
