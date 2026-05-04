
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
		 * カラーコードの RGB チャンネルを反転（255 − n）して返す。α チャンネルは維持する。
		 * #rgb / #rgba / #rrggbb / #rrggbbaa の 4 形式に対応。
		 * :hover / :active 時の反転色生成に使用する（機能設計書 §6.2）。
		 * @param {string} hex - カラーコード文字列（4 形式いずれか）
		 * @returns {string} 反転後のカラーコード。α なし → #rrggbb、α あり → #rrggbbaa。不正時は入力値をそのまま返す
		 */
		InvertColor: function (hex) {
			const s   = String(hex);
			const inv = cs => cs.map(c => (255 - parseInt(c, 16)).toString(16).padStart(2, '0')).join('');

			// #rgb
			const m3 = s.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
			if (m3) {
				return '#' + inv([m3[1]+m3[1], m3[2]+m3[2], m3[3]+m3[3]]);
			}
			// #rgba
			const m4 = s.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
			if (m4) {
				return '#' + inv([m4[1]+m4[1], m4[2]+m4[2], m4[3]+m4[3]]) + m4[4]+m4[4];
			}
			// #rrggbb
			const m6 = s.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
			if (m6) {
				return '#' + inv([m6[1], m6[2], m6[3]]);
			}
			// #rrggbbaa
			const m8 = s.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
			if (m8) {
				return '#' + inv([m8[1], m8[2], m8[3]]) + m8[4];
			}
			return hex;
		},

		/**
		 * 文字列の前後から半角空白（\s）と全角空白（U+3000）を除去する。
		 * 既存の String.prototype.trim() は半角空白系のみ除去するため、全角空白を残す不整合を解消する目的で追加した。
		 * @param {string} s - 対象文字列（null/undefined は空文字扱い）
		 * @returns {string} trim 後の文字列
		 */
		TrimAll: function (s) {
			return String(s ?? '').replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
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
