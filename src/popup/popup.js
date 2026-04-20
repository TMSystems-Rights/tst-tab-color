/**
 * @file tst-tab-color - popup.js
 * @description
 * ツールバーアイコン押下で表示されるポップアップのロジック。
 * バックグラウンド（background.js）からの進捗通知（tm-progress メッセージ）を受け取り、
 * 進捗バー＋テキストを更新する。ポップアップが閉じると本スクリプトは破棄されるため、
 * 開く度に background へ最新の進捗状態を問い合わせ（tm-get-progress）、表示を復元する。
 */

const TMS_POPUP = {

	// ===================================================
	// DOM要素の参照
	// ===================================================
	Elements: {
		/** @type {HTMLElement|null} 進捗表示エリア（stage=idle 時は display:none） */
		progressContainer: null,
		/** @type {HTMLElement|null} 進捗テキスト（ステージ別の説明文） */
		progressText:      null,
		/** @type {HTMLElement|null} 進捗バーの伸縮要素（width を % で制御） */
		progressBar:       null,
		/** @type {HTMLElement|null} アイドル時メッセージ（進捗表示中は非表示） */
		idleMsg:           null,
		/** @type {HTMLButtonElement|null} オプションページを開くボタン */
		btnOpenOptions:    null,

		/**
		 * DOM 要素の参照を一括取得する
		 * @returns {void}
		 */
		Init: function () {
			this.progressContainer = document.getElementById('tmProgressContainer');
			this.progressText      = document.getElementById('tmProgressText');
			this.progressBar       = document.getElementById('tmProgressBar');
			this.idleMsg           = document.getElementById('tmPopupIdleMsg');
			this.btnOpenOptions    = document.getElementById('tmBtnOpenOptions');
		}
	},

	// ===================================================
	// UI 更新
	// ===================================================
	UI: {
		/**
		 * 進捗情報を受けて進捗バー／テキストを更新する。
		 * stage に応じてバー全体に対する割合（%）を以下のように割り当てる：
		 *   classifying   …  0〜 10%（同期的に進むため瞬時）
		 *   clearing      … 10〜 20%（remove-tab-state 1 回）
		 *   applying      … 20〜100%（ルール数に比例）
		 *   completed     … 100%（3 秒後に自動で idle へフェードアウト）
		 * @param {object} progress - { stage, current, total, elapsedMs }
		 * @returns {void}
		 */
		UpdateProgress: function (progress) {
			const E      = TMS_POPUP.Elements;
			const getMsg = TMS_COMMON.Funcs.GetMsg;

			if (!progress || progress.stage === 'idle') {
				// アイドル状態：進捗エリアを隠し、「処理中はありません」を表示
				E.progressContainer.style.display = 'none';
				E.progressBar.style.width         = '0%';
				E.idleMsg.style.display           = 'block';
				return;
			}

			// 何らかの進捗あり：アイドルメッセージを隠し、進捗エリアを表示
			E.idleMsg.style.display           = 'none';
			E.progressContainer.style.display = 'block';

			const current = typeof progress.current === 'number' ? progress.current : 0;
			const total   = typeof progress.total   === 'number' ? progress.total   : 0;
			let   ratio   = 0;
			let   text    = '';

			if (progress.stage === 'classifying') {
				ratio = total > 0 ? (current / total) * 10 : 0;
				text  = getMsg('progressClassifying', [String(current), String(total)]);
			} else if (progress.stage === 'clearing') {
				// clearing は current=0 → 開始(10%)、current=1 → 完了(20%)
				ratio = 10 + (total > 0 ? (current / total) * 10 : 0);
				text  = getMsg('progressClearing');
			} else if (progress.stage === 'applying') {
				// 20%〜100% の区間をルール進捗で埋める
				ratio = 20 + (total > 0 ? (current / total) * 80 : 0);
				text  = getMsg('progressApplying', [String(current), String(total)]);
			} else if (progress.stage === 'completed') {
				ratio           = 100;
				const elapsedMs = typeof progress.elapsedMs === 'number' ? progress.elapsedMs : 0;
				text            = getMsg('progressCompleted', [String(total), String(elapsedMs)]);
			}

			E.progressBar.style.width  = ratio + '%';
			E.progressText.textContent = text;
		}
	},

	// ===================================================
	// イベントハンドラ
	// ===================================================
	Handlers: {
		/**
		 * バックグラウンドから送られてくる runtime メッセージのハンドラ。
		 * type='tm-progress' のみ処理し、UI.UpdateProgress へ委譲する。
		 * @param {object} message - { type, payload }
		 * @returns {void}
		 */
		OnRuntimeMessage: function (message) {
			if (!message || message.type !== 'tm-progress') {
				return;
			}
			TMS_POPUP.UI.UpdateProgress(message.payload);
		},

		/**
		 * 「オプションを開く」ボタンのクリックハンドラ。
		 * 既定のオプションページを新規タブで開き、ポップアップを閉じる。
		 * @returns {void}
		 */
		OnOpenOptions: function () {
			browser.runtime.openOptionsPage();
			window.close();
		}
	},

	/**
	 * ポップアップのエントリーポイント。
	 * DOM 取得 → i18n 適用 → 現在進捗の取得 → イベントバインドの順で実行する。
	 * @returns {Promise<void>}
	 */
	Init: async function () {
		TMS_POPUP.Elements.Init();
		TMS_COMMON.Funcs.SetDocumentLocale();

		// 初期表示：idle を前提に描画しておき、直後にバックグラウンドから現在値を取得して上書きする。
		// アイドル時はプログレスコンテナを隠し、idleMsg を表示する（HTML 既定がその状態）。
		try {
			const current = await browser.runtime.sendMessage({ type: 'tm-get-progress' });
			TMS_POPUP.UI.UpdateProgress(current);
		} catch {
			// バックグラウンドが応答しない（未起動／エラー）場合は idle 表示のままで問題なし
		}

		// バックグラウンドからの継続通知を受信
		browser.runtime.onMessage.addListener(TMS_POPUP.Handlers.OnRuntimeMessage);

		// ボタンクリック：オプションページを開く
		TMS_POPUP.Elements.btnOpenOptions.addEventListener('click', TMS_POPUP.Handlers.OnOpenOptions);
	}
};

// メソッド群を凍結
DeepFreeze(TMS_POPUP.UI);
DeepFreeze(TMS_POPUP.Handlers);

// Elements は値変更を許可するためシール
Object.seal(TMS_POPUP.Elements);

// トップレベル凍結
Object.freeze(TMS_POPUP);

// DOMContentLoaded 後にエントリーポイント実行
document.addEventListener('DOMContentLoaded', TMS_POPUP.Init);
