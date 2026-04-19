/**
 * @file tst-tab-color - background.js
 * @description
 * Tree Style Tab (TST) の External API を利用し、URLパターンに合致するタブの
 * 背景色・フォント色・フォントを TST サイドバー上で変更するバックグラウンド処理。
 * CSS を register-self で注入し、タブごとに add-tab-state で CSS クラスを付与する。
 */

const TMS_BACKGROUND = {

	// ===================================================
	// グローバルな状態管理
	// ===================================================
	State: {
		/** @type {Array} 現在有効なルール一覧（TcRule[]） */
		rules:             [],
		/** @type {boolean} TST への register-self が成功しているかどうか */
		isTstReady:        false,
		/**
		 * @type {number} 本セッションで覚えている「過去の最大ルール件数」。
		 * ルール削除で件数が減った際、以前付与されたまま残存する tm-rule-{n} クラス
		 * （インデックス n が現行配列長以上）を確実に除去するための走査上限として用いる。
		 * 機能設計書 §6.3「旧クラスをすべて除去」の要件を満たすためのゴースト防止用。
		 * 単調非減少（max で更新）で、本セッション内でのみ有効。
		 */
		classCleanupCount: 0
	},

	// ===================================================
	// ルール関連のロジック
	// ===================================================
	Rules: {
		/**
		 * storage.sync からルール一覧を読み込み、State.rules に格納する
		 * @returns {Promise<void>}
		 */
		Load: async function () {
			try {
				const result               = await browser.storage.sync.get('rules');
				TMS_BACKGROUND.State.rules = Array.isArray(result.rules) ? result.rules : [];
			} catch (e) {
				console.error('ルール読み込みに失敗しました:', e);
				TMS_BACKGROUND.State.rules = [];
			}
			// 過去に存在したルール数と現在のルール数のうち大きい方を記録。
			// 件数が減った場合に以前のインデックスのクラスを確実に除去するために使用する。
			TMS_BACKGROUND.State.classCleanupCount = Math.max(
				TMS_BACKGROUND.State.classCleanupCount,
				TMS_BACKGROUND.State.rules.length
			);
		},

		/**
		 * URL にマッチする最初のルールを返す。マッチしなければ null を返す。
		 * マッチ判定：配列インデックス昇順（0 が最高優先）。
		 * @param {string} url - 評価対象の URL
		 * @param {Array} rules - ルール配列（TcRule[]）
		 * @returns {{ rule: object, index: number }|null} マッチしたルールとインデックス、なければ null
		 */
		MatchRule: function (url, rules) {
			if (!url) {
				return null;
			}
			for (let i = 0; i < rules.length; i++) {
				const rule = rules[i];
				if (rule.patternType === 'prefix') {
					if (url.startsWith(rule.pattern)) {
						return { rule: rule, index: i };
					}
				} else if (rule.patternType === 'regexp') {
					try {
						if (new RegExp(rule.pattern).test(url)) {
							return { rule: rule, index: i };
						}
					} catch {
						// 不正な正規表現は無視してスキップ（バリデーションは options.js 側で実施）
					}
				}
			}
			return null;
		},

		/**
		 * インデックスから CSS クラス名を生成する（例: "tm-rule-0"）
		 * @param {number} index - ルールのインデックス
		 * @returns {string} CSS クラス名
		 */
		MakeClassName: function (index) {
			return TMS_COMMON.Const.CSS_CLASS_PREFIX + index;
		}
	},

	// ===================================================
	// TST 連携処理
	// ===================================================
	Tst: {
		/**
		 * TST へ runtime.sendMessage を送るラッパー。TST 未インストール等のエラーは握りつぶす
		 * @param {object} payload - TST に送るメッセージ本体
		 * @returns {Promise<*>} TST の応答（失敗時は null）
		 */
		SendMessage: async function (payload) {
			try {
				return await browser.runtime.sendMessage(TMS_COMMON.Const.TST_ID, payload);
			} catch {
				// TST 未インストール/未有効時には毎回エラーになるため、ログは出さず握りつぶす
				return null;
			}
		},

		/**
		 * ルール配列から、TST に注入する CSS 文字列を生成する。
		 * ブランク項目は出力しない（未指定時はブラウザの既定値に従わせる）。
		 * 子タブのインデントをはみ出して背景が描画されないよう、背景色は
		 * タブ本体（.tab）ではなく内側の .background 要素に対して適用する。
		 * また :hover / :active 時は、fontColor / backgroundColor が指定されている
		 * 項目のみ反転色でオーバーライドする（機能設計書 §6.2 Case C）。
		 * @param {Array} rules - ルール配列（TcRule[]）
		 * @returns {string} 注入する CSS 文字列（複数ルールを改行で結合）
		 */
		BuildCss: function (rules) {
			const prefix = TMS_COMMON.Const.CSS_CLASS_PREFIX;
			const invert = TMS_COMMON.Funcs.InvertColor;
			const lines  = [];
			for (let i = 0; i < rules.length; i++) {
				const rule      = rules[i];
				const className = prefix + i;

				// 背景要素（.tab.tm-rule-{n} .background）… 背景色
				// 親 .tab ではなく内側の .background に当てることで、子階層のインデント
				// 領域（左側の余白）にまで背景色が漏れるのを防ぐ。
				if (rule.backgroundColor) {
					lines.push(`.tab.${className} .background { background-color: ${rule.backgroundColor}; }`);
				}

				// ラベル要素（.tab.tm-rule-{n} .label）… フォント色・フォント
				const labelDecls = [];
				if (rule.fontColor) {
					labelDecls.push(`color: ${rule.fontColor};`);
				}
				if (rule.fontFamily) {
					labelDecls.push(`font-family: ${rule.fontFamily};`);
				}
				if (labelDecls.length > 0) {
					lines.push(`.tab.${className} .label { ${labelDecls.join(' ')} }`);
				}

				// :hover / :active 時の反転色オーバーライド（Case C）
				// fontColor / backgroundColor それぞれが指定されているときのみ反転色を出力する。
				// 未指定のプロパティは反転対象にならず、TST 側の既定挙動がそのまま有効になる。
				if (rule.backgroundColor) {
					const invBg = invert(rule.backgroundColor);
					lines.push(`.tab.${className}:hover .background,`
						+ ` .tab.${className}.active .background { background-color: ${invBg}; }`);
				}
				if (rule.fontColor) {
					const invFc = invert(rule.fontColor);
					lines.push(`.tab.${className}:hover .label,`
						+ ` .tab.${className}.active .label { color: ${invFc}; }`);
				}
			}
			return lines.join('\n');
		},

		/**
		 * TST に register-self を送信する（CSS 注入を含む）。成功有無で State.isTstReady を更新する
		 * @returns {Promise<void>}
		 */
		Register: async function () {
			const manifest                  = browser.runtime.getManifest();
			const result                    = await TMS_BACKGROUND.Tst.SendMessage({
				type:           'register-self',
				name:           manifest.name,
				icons:          manifest.icons,
				listeningTypes: ['ready'],
				style:          TMS_BACKGROUND.Tst.BuildCss(TMS_BACKGROUND.State.rules)
			});
			TMS_BACKGROUND.State.isTstReady = (result !== null);
		},

		/**
		 * タブに付与されている tm-rule-* クラスを TST から除去する。
		 * 現状のルール数分のクラス名を remove-tab-state でまとめて削除する。
		 * @param {number} tabId - 対象タブの ID
		 * @returns {Promise<void>}
		 */
		ClearTabState: async function (tabId) {
			// 現行ルール数と「過去の最大ルール件数」の大きい方まで走査し、
			// ルール削除後に残存する古いインデックスのクラスも確実に除去する。
			const count = Math.max(
				TMS_BACKGROUND.State.rules.length,
				TMS_BACKGROUND.State.classCleanupCount
			);
			if (count === 0) {
				// 一度もルールが登録されていない場合は除去対象がないため何もしない
				return;
			}
			const classNames = [];
			for (let i = 0; i < count; i++) {
				classNames.push(TMS_BACKGROUND.Rules.MakeClassName(i));
			}
			await TMS_BACKGROUND.Tst.SendMessage({
				type:  'remove-tab-state',
				tabs:  [tabId],
				state: classNames
			});
		},

		/**
		 * 1タブに対してルール評価と CSS クラス適用を行う。
		 * まず旧クラスを除去し、マッチするルールがあれば新クラスを付与する。
		 * @param {browser.tabs.Tab} tab - 対象タブ
		 * @returns {Promise<void>}
		 */
		ApplyRuleToTab: async function (tab) {
			if (!tab || typeof tab.id !== 'number') {
				return;
			}
			await TMS_BACKGROUND.Tst.ClearTabState(tab.id);

			const match = TMS_BACKGROUND.Rules.MatchRule(tab.url, TMS_BACKGROUND.State.rules);
			if (!match) {
				return;
			}
			await TMS_BACKGROUND.Tst.SendMessage({
				type:  'add-tab-state',
				tabs:  [tab.id],
				state: TMS_BACKGROUND.Rules.MakeClassName(match.index)
			});
		},

		/**
		 * 全タブに対してルール適用を行う
		 * @returns {Promise<void>}
		 */
		ApplyRulesToAllTabs: async function () {
			const tabs = await browser.tabs.query({});

			const total = tabs.length;
			console.log('★★★★★タブ総数：', total);
			let count = 0;

			for (const tab of tabs) {
				await TMS_BACKGROUND.Tst.ApplyRuleToTab(tab);
				count++;
				if (count % 100 === 0) {
					console.log('★★★★★進捗（完了タブ数/総数）：', count, '/', total);
				}
			}
			console.log('★★★★★完了（完了タブ数/総数）：', count, '/', total);
		}
	},

	// ===================================================
	// イベントハンドラ
	// ===================================================
	Handlers: {
		/**
		 * browser.tabs.onCreated ハンドラ。新規タブに即座にルール適用
		 * @param {browser.tabs.Tab} tab - 新規作成されたタブ
		 */
		OnTabCreated: function (tab) {
			TMS_BACKGROUND.Tst.ApplyRuleToTab(tab);
		},

		/**
		 * browser.tabs.onUpdated ハンドラ。URL 変更時のみ再評価
		 * @param {number} tabId - タブ ID
		 * @param {object} changeInfo - 変更情報
		 * @param {browser.tabs.Tab} tab - 更新後のタブ
		 */
		OnTabUpdated: function (tabId, changeInfo, tab) {
			if (!changeInfo.url) {
				return;
			}
			TMS_BACKGROUND.Tst.ApplyRuleToTab(tab);
		},

		/**
		 * browser.tabs.onAttached ハンドラ。
		 * 別ウィンドウへタブが移動した際に TST 側のタブ状態（tm-rule-* クラス）が
		 * リセットされるため、移動後のタブに対してルールを再評価・再適用する。
		 * 第2引数の attachInfo（newWindowId / newPosition）は本処理では不要なため受け取らない。
		 * @param {number} tabId - 移動したタブの ID
		 * @returns {Promise<void>}
		 */
		OnTabAttached: async function (tabId) {
			try {
				const tab = await browser.tabs.get(tabId);
				await TMS_BACKGROUND.Tst.ApplyRuleToTab(tab);
			} catch {
				// タブが即座に閉じられた等で取得失敗した場合は何もしない
			}
		},

		/**
		 * browser.runtime.onMessageExternal ハンドラ（TST からのメッセージ）。
		 * type=`ready` 受信時（TST 再起動時）に再初期化する
		 * @param {object} message - メッセージ本体
		 * @param {object} sender - 送信元情報
		 */
		OnTstMessage: function (message, sender) {
			if (sender.id !== TMS_COMMON.Const.TST_ID) {
				return;
			}
			if (message.type === 'ready') {
				// TST が再起動／再ロードされた場合は再初期化（CSS 再注入＋全タブ再適用）
				TMS_BACKGROUND.Init();
			}
		},

		/**
		 * browser.action.onClicked ハンドラ（ツールバーアイコンクリック）。
		 * ポップアップではなくオプションページを開く
		 */
		OnActionClicked: function () {
			browser.runtime.openOptionsPage();
		},

		/**
		 * browser.storage.onChanged ハンドラ。rules の変更を検知したら再適用
		 * @param {object} changes - 変更内容
		 * @param {string} areaName - ストレージ領域名（'sync' / 'local' 等）
		 * @returns {Promise<void>}
		 */
		OnStorageChanged: async function (changes, areaName) {
			if (areaName !== 'sync') {
				return;
			}
			if (!changes.rules) {
				return;
			}
			await TMS_BACKGROUND.Rules.Load();
			await TMS_BACKGROUND.Tst.Register();
			await TMS_BACKGROUND.Tst.ApplyRulesToAllTabs();
		}
	},

	/**
	 * バックグラウンドスクリプトのエントリーポイント。
	 * 各種イベントリスナー登録 → ルール読み込み → TST 登録 → 全タブ適用 の順で実行。
	 * TST ready イベント受信時にも再実行される。
	 * @returns {Promise<void>}
	 */
	Init: async function () {
		// イベントリスナー登録（addListener は同一関数参照なら冪等なので、再 Init 時に重複登録されない）
		browser.tabs.onCreated.addListener(TMS_BACKGROUND.Handlers.OnTabCreated);
		browser.tabs.onUpdated.addListener(TMS_BACKGROUND.Handlers.OnTabUpdated);
		browser.tabs.onAttached.addListener(TMS_BACKGROUND.Handlers.OnTabAttached);
		browser.runtime.onMessageExternal.addListener(TMS_BACKGROUND.Handlers.OnTstMessage);
		browser.action.onClicked.addListener(TMS_BACKGROUND.Handlers.OnActionClicked);
		browser.storage.onChanged.addListener(TMS_BACKGROUND.Handlers.OnStorageChanged);

		// ルール読み込み → TST 登録 → 全タブ適用
		await TMS_BACKGROUND.Rules.Load();
		await TMS_BACKGROUND.Tst.Register();
		await TMS_BACKGROUND.Tst.ApplyRulesToAllTabs();
	}
};

// 意図しない変更を防ぐためにメソッド群を凍結
DeepFreeze(TMS_BACKGROUND.Rules);
DeepFreeze(TMS_BACKGROUND.Tst);
DeepFreeze(TMS_BACKGROUND.Handlers);

// State は値の変更を許可するため、シールする（プロパティ追加は NG だが、値の変更は可）
Object.seal(TMS_BACKGROUND.State);

// トップレベルの名前空間を凍結し、新たなプロパティの追加などを防ぐ
Object.freeze(TMS_BACKGROUND);

// バックグラウンド初期化を開始
TMS_BACKGROUND.Init();
