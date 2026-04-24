/**
 * @file tst-tab-color - background.js
 * @description
 * Tree Style Tab (TST) の External API を利用し、URLパターンに合致するタブの
 * 背景色・フォント色・フォントを TST サイドバー上で変更するバックグラウンド処理。
 * CSS を register-self で注入し、タブごとに add-tab-state で CSS クラスを付与する。
 *
 * 全タブ適用はバッチ方式（課題1 対応）：
 *   1. タブを評価してルール別にバケット化（同期処理）
 *   2. 全タブへ一括 remove-tab-state で旧クラスを除去（1回の送信）
 *   3. ルールごとにマッチしたタブ ID 配列を add-tab-state でまとめて送信
 *   （= 旧「タブ毎に remove/add を直列 await」から往復数を rules 数＋1 程度へ圧縮）
 * 進捗は runtime.sendMessage で自身のポップアップ／オプションへブロードキャストする。
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
		classCleanupCount: 0,
		/**
		 * @type {object} 直近の進捗情報。ポップアップ／オプションページが開かれた時に
		 * 現在状況を取得できるよう保持する。ApplyRulesToAllTabs の各フェーズで更新される。
		 * stage:
		 *   'idle'        … 処理なし（プログレスバー非表示）
		 *   'classifying' … タブ評価中（current=評価済み件数 / total=タブ総数）
		 *   'clearing'    … 旧クラス一括削除送信中
		 *   'applying'    … ルール別 add-tab-state 送信中（current=完了ルール数 / total=ルール数）
		 *   'completed'   … 完了（elapsedMs に所要時間 ms、total にタブ総数）
		 */
		progress:          { stage: 'idle', current: 0, total: 0, elapsedMs: 0 }
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
		 * TST へ runtime.sendMessage を送るラッパー。TST 未インストール時のエラーは握りつぶす
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
		 *
		 * 通常時のフォント色指定：
		 *   fontColor を `.tab.tm-rule-{n}` に対して CSS 変数 --tab-text で書き換える。
		 *   これにより .label（color）/ .twisty（fill/background）/ .closebox::after（background）
		 *   の三者が fontColor 色で描画される。.label には直接 color も冗長指定する。
		 *
		 * :hover / :active 時の挙動（Phase 8 改訂仕様）：
		 *   backgroundColor 指定時のみオーバーライドを出力する。fontColor の指定有無には依存しない。
		 *     - 背景色：invert(bg) を .background に適用
		 *     - 前景色：反転前の bg 値を「タブ直下」の CSS 変数 --tab-text に設定することで
		 *              .label（color）/ .twisty（fill または background）/ .closebox::after（background）
		 *              の三者へ一括伝播させる。TST の .twisty/.closebox は SVG コンテキストフィルで
		 *              色を描画しているため `color` プロパティでは効かず、--tab-text の書き換えが必要。
		 *              併せて .label には直接 color も指定する（TST 自身の .label スタイルが
		 *              特異度で勝るケースに備える冗長指定）。
		 *   backgroundColor 未指定時はオーバーライドを出力しない（TST 既定のホバー挙動に委ねる）。
		 *
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
				const tabSel    = `.tab.${className}`;

				// 通常時 - 背景色（親 .tab ではなく .background へ。子階層のインデント漏れ防止）
				if (rule.backgroundColor) {
					lines.push(`${tabSel} .background { background-color: ${rule.backgroundColor}; }`);
				}

				// 通常時 - フォント色：--tab-text を書き換えることで
				// .label（color）/ .twisty（fill/background）/ .closebox::after（background）に伝播
				if (rule.fontColor) {
					lines.push(`${tabSel} { --tab-text: ${rule.fontColor}; }`);
				}

				// 通常時 - フォント色（.label 保険）・フォント
				const labelDecls = [];
				if (rule.fontColor) {
					labelDecls.push(`color: ${rule.fontColor};`);
				}
				if (rule.fontFamily) {
					labelDecls.push(`font-family: ${rule.fontFamily};`);
				}
				if (labelDecls.length > 0) {
					lines.push(`${tabSel} .label { ${labelDecls.join(' ')} }`);
				}

				// :hover / :active 時のオーバーライド
				// 仕様書 §7.2: activeBackgroundColor / activeFontColor が指定されていれば優先し、
				// 未指定時は既存の invert(bg) / bg フォールバック挙動を維持する
				const hasBg      = !!rule.backgroundColor;
				const hasActiveBg = !!rule.activeBackgroundColor;
				const hasActiveFg = !!rule.activeFontColor;

				if (hasBg || hasActiveBg || hasActiveFg) {
					const hoverSel  = `${tabSel}:hover`;
					const activeSel = `${tabSel}.active`;

					// 背景色の決定
					const hoverBg = hasActiveBg
						? rule.activeBackgroundColor
						: (hasBg ? invert(rule.backgroundColor) : null);

					if (hoverBg) {
						lines.push(
							`${hoverSel} .background, ${activeSel} .background`
							+ ` { background-color: ${hoverBg}; }`
						);
					}

					// 前景色の決定
					// activeFontColor 指定時はそれを使う。なければ backgroundColor をフォールバック（既存挙動）
					const hoverFg = hasActiveFg
						? rule.activeFontColor
						: (hasBg ? rule.backgroundColor : null);

					if (hoverFg) {
						lines.push(
							`${hoverSel}, ${activeSel}`
							+ ` { --tab-text: ${hoverFg}; }`
						);
						lines.push(
							`${hoverSel} .label, ${activeSel} .label`
							+ ` { color: ${hoverFg}; }`
						);
					}
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
		 * 単一タブ向け（新規タブ生成時・URL 更新時・ウィンドウ移動時の軽量経路用）。
		 * 全タブ一括時は Tst.BatchRemoveAllClasses を使用する。
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
		 * 新規タブ生成・URL 更新・別ウィンドウ移動時の単発経路用。
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
		 * 進捗情報を State に格納し、自身の他コンテキスト（popup/options）へブロードキャストする。
		 * 受信側が存在しない場合に runtime.sendMessage は reject されるため catch で握りつぶす。
		 * @param {object} progress - 進捗情報（stage/current/total/elapsedMs 等）
		 * @returns {Promise<void>}
		 */
		SendProgress: async function (progress) {
			TMS_BACKGROUND.State.progress = progress;
			try {
				await browser.runtime.sendMessage({ type: 'tm-progress', payload: progress });
			} catch {
				// 受信側（ポップアップ／オプションページ）が未オープンの場合、
				// Firefox は「Could not establish connection」で reject するため握りつぶす
			}
		},

		/**
		 * 全タブへのルール適用をバッチで実行する（課題1 パフォーマンス対策）。
		 * 旧実装はタブ毎に remove-tab-state/add-tab-state を直列 await していたため、
		 * 約 2,000 タブで 1 分半を要していた。本実装は往復数をルール数＋1 程度に圧縮する。
		 *   Phase 1: 全タブを同期的に評価し、ルール別にタブ ID をバケット化
		 *   Phase 2: 全タブへ一括 remove-tab-state（旧クラス除去）を 1 回送信
		 *   Phase 3: ルールごとに該当タブ ID 配列を add-tab-state で 1 回ずつ送信
		 * 各フェーズで進捗を SendProgress 経由でブロードキャストする。
		 * @returns {Promise<void>}
		 */
		ApplyRulesToAllTabs: async function () {
			const startTime = performance.now();
			const tabs      = await browser.tabs.query({});
			const total     = tabs.length;
			const rules     = TMS_BACKGROUND.State.rules;
			const ruleCount = rules.length;
			console.log('★★★★★タブ総数：', total, '／ルール数：', ruleCount);

			// Phase 1: 評価バケット化（同期処理。ここは I/O なしで高速）
			await TMS_BACKGROUND.Tst.SendProgress({
				stage:     'classifying',
				current:   0,
				total:     total,
				elapsedMs: 0
			});
			/** @type {Map<number, number[]>} ルール index → マッチしたタブ ID の配列 */
			const buckets = new Map();
			/** @type {number[]} 有効タブ ID の全リスト（remove-tab-state の送信先） */
			const allTabIds = [];
			for (let i = 0; i < tabs.length; i++) {
				const tab = tabs[i];
				if (!tab || typeof tab.id !== 'number') {
					continue;
				}
				allTabIds.push(tab.id);
				const match = TMS_BACKGROUND.Rules.MatchRule(tab.url, rules);
				if (match) {
					if (!buckets.has(match.index)) {
						buckets.set(match.index, []);
					}
					buckets.get(match.index).push(tab.id);
				}
			}
			await TMS_BACKGROUND.Tst.SendProgress({
				stage:     'classifying',
				current:   total,
				total:     total,
				elapsedMs: 0
			});

			// Phase 2: 全タブへ一括 remove-tab-state（旧クラスを全件除去）
			// 現行ルール数と過去最大ルール件数の大きい方まで走査対象に含める。
			await TMS_BACKGROUND.Tst.SendProgress({
				stage:     'clearing',
				current:   0,
				total:     1,
				elapsedMs: 0
			});
			if (allTabIds.length > 0) {
				const cleanupCount = Math.max(ruleCount, TMS_BACKGROUND.State.classCleanupCount);
				if (cleanupCount > 0) {
					const classNames = [];
					for (let i = 0; i < cleanupCount; i++) {
						classNames.push(TMS_BACKGROUND.Rules.MakeClassName(i));
					}
					await TMS_BACKGROUND.Tst.SendMessage({
						type:  'remove-tab-state',
						tabs:  allTabIds,
						state: classNames
					});
				}
			}
			await TMS_BACKGROUND.Tst.SendProgress({
				stage:     'clearing',
				current:   1,
				total:     1,
				elapsedMs: 0
			});

			// Phase 3: ルール毎に add-tab-state を 1 回ずつ送信
			for (let i = 0; i < ruleCount; i++) {
				await TMS_BACKGROUND.Tst.SendProgress({
					stage:     'applying',
					current:   i,
					total:     ruleCount,
					elapsedMs: 0
				});
				const tabIds = buckets.get(i);
				if (tabIds && tabIds.length > 0) {
					await TMS_BACKGROUND.Tst.SendMessage({
						type:  'add-tab-state',
						tabs:  tabIds,
						state: TMS_BACKGROUND.Rules.MakeClassName(i)
					});
				}
			}

			// 完了通知。elapsedMs は整数丸めしてログと UI 表示の両方に使う
			const elapsedMs = Math.round(performance.now() - startTime);
			console.log('★★★★★完了（タブ総数／所要ms）：', total, '/', elapsedMs);
			await TMS_BACKGROUND.Tst.SendProgress({
				stage:     'completed',
				current:   total,
				total:     total,
				elapsedMs: elapsedMs
			});
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
		 * browser.runtime.onMessage ハンドラ（自身の他コンテキスト＝popup/options からのメッセージ）。
		 * type='tm-get-progress' 受信時は State.progress を返す。
		 * ポップアップ／オプションページが後から開かれた場合にも現在の進捗を復元できるよう、
		 * sendResponse ではなく Promise を返すスタイルで実装する（Firefox MV3 推奨形式）。
		 * @param {object} message - メッセージ本体
		 * @returns {Promise<object>|undefined} 応答 Promise（type が未対応なら undefined）
		 */
		OnRuntimeMessage: function (message) {
			if (!message || typeof message !== 'object') {
				return undefined;
			}
			if (message.type === 'tm-get-progress') {
				return Promise.resolve(TMS_BACKGROUND.State.progress);
			}
			return undefined;
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
		browser.runtime.onMessage.addListener(TMS_BACKGROUND.Handlers.OnRuntimeMessage);
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
