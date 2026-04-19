
const TMS_COMMON = {

	// 共通定数を定義する場所
	Const: {
		/** Tree Style TabのアプリケーションID */
		TST_ID:           'treestyletab@piro.sakura.ne.jp',
		/** タブに付与する CSS クラスの接頭辞（実際は tm-rule-0, tm-rule-1 ... の形式で付与される） */
		CSS_CLASS_PREFIX: 'tm-rule-'
	},

	// 共通関数を定義する場所
	Funcs: {
		/**
		 * 国際化メッセージを取得するショートカット関数
		 * @param {string} key - messages.jsonに定義されたキー
		 * @param {string|string[]} [substitutions] - メッセージ内のプレースホルダを置き換える文字列
		 * @returns {string} 取得したメッセージ（失敗時は key 文字列をそのまま返す）
		 */
		GetMsg: function (key, substitutions) {
			try {
				// substitutionsが未定義なら空配列、文字列なら配列化、配列ならそのまま使う
				const subs = !substitutions ? [] : (Array.isArray(substitutions) ? substitutions : [substitutions]);
				return browser.i18n.getMessage(key, subs);
			} catch (e) {
				console.error(`i18nキー "${key}" の取得に失敗しました。`, e);
				return key;
			}
		},

		/**
		 * HTMLドキュメント内の国際化テキストを動的に設定する
		 */
		SetDocumentLocale: function () {
			const getMsg = this.GetMsg; // this経由で同じオブジェクト内の関数を呼び出す

			// data-i18n属性を持つすべての要素にテキストを設定
			document.querySelectorAll('[data-i18n]').forEach(elem => {
				const key  = elem.getAttribute('data-i18n');
				const text = getMsg(key);

				// プレースホルダーとして機能させることも可能
				if (elem.hasAttribute('data-i18n-placeholder')) {
					elem.placeholder = text;
				} else if (elem.hasAttribute('value')) {
					elem.value = text;
				} else {
					elem.textContent = text;
				}
			});

			// ページタイトルを設定
			const titleElem = document.querySelector('title[data-i18n]');
			if (titleElem) {
				const key      = titleElem.getAttribute('data-i18n');
				document.title = getMsg(key);
			}
		},

		/**
		 * UUID（v4）を生成して返す。ルール ID の採番等に使用する
		 * @returns {string} ハイフン区切りの UUID 文字列（例: "b1c2d3e4-...-..."）
		 */
		GenerateUUID: function () {
			return crypto.randomUUID();
		},

		/**
		 * カラーコードの各チャンネル値を反転（255 − n）して返す。
		 * #rgb 形式は #rrggbb 形式へ正規化してから反転する。
		 * :hover / :active 時の反転色生成に使用する（機能設計書 §6.2）。
		 * @param {string} hex - カラーコード文字列（#rgb または #rrggbb）
		 * @returns {string} 反転後のカラーコード（#rrggbb 形式）。不正入力時は入力値をそのまま返す
		 */
		InvertColor: function (hex) {
			const m3         = String(hex).match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
			const normalized = m3 ? ('#' + m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3]) : hex;
			const m6         = String(normalized).match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
			if (!m6) {
				return hex;
			}
			const inv = [1, 2, 3].map(i => (255 - parseInt(m6[i], 16)).toString(16).padStart(2, '0')).join('');
			return '#' + inv;
		}
	}
};

/**
 * オブジェクトを再帰的に（深く）凍結する関数 (ESLint no-prototype-builtins 対応版)
 * @param {object} object 凍結したいオブジェクト
 * @returns {object} 凍結されたオブジェクト
 */
function DeepFreeze(object) {
	if (object === null || typeof object !== 'object' || Object.isFrozen(object)) {
		return object;
	}

	// for...in の代わりに、自身のプロパティのみを列挙する Object.keys を使うとより安全
	for (const key of Object.keys(object)) {
		// プロパティの値がオブジェクトなら再帰的に凍結
		DeepFreeze(object[key]);
	}

	return Object.freeze(object);
}

// 自作「DeepFreeze」関数をつかって、深い凍結を行う
// この場合、下記記載のオブジェクト含め、配下（最下層までのすべて）を「凍結」する（プロパティの追加・削除・値の変更がすべて禁止）
DeepFreeze(TMS_COMMON.Funcs);
DeepFreeze(TMS_COMMON.Const);

// (推奨)TMS_COMMONのトップレベル自体も保護する
// これにより、TMS_COMMON.NewNamespace = {} のような意図しない名前空間の追加や、
// プロパティの上書きを防ぐことが可能。
// ここではfreezeを使い、トップレベルの構造を完全に固定する。
// （いまの構造なら上記でfreezeしてるので大丈夫なはずだけど、保険の意味とあくまでコードサンプルとして記述しておく）
Object.freeze(TMS_COMMON);
