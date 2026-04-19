/**
 * @file tst-tab-color - options.js
 * @description
 * オプションページ（ルール設定画面）のロジック。
 * ルールの登録・更新・削除・D&D 並び替え・カラーピッカー連動を担う。
 * Phase 7 仕様：登録／更新／削除／並び替えは即時 storage.sync へ反映する
 * （従来の独立「保存」ボタンは廃止）。バックグラウンド側が onChanged を検知して再適用する。
 */

const TMS_OPTIONS = {

	// ===================================================
	// グローバルな状態管理
	// ===================================================
	State: {
		/** @type {Array} 編集中のルール一覧（TcRule[]）。更新時に即 storage.sync へ反映 */
		rules:           [],
		/** @type {number} D&D 中のドラッグ元行インデックス。未ドラッグ時は -1 */
		dragSrcIndex:    -1,
		/** @type {'add'|'edit'} フォームの現在モード。'add'=新規登録、'edit'=既存ルール更新 */
		mode:            'add',
		/**
		 * @type {number} 更新モード時の対象ルールのインデックス。add モード時は -1。
		 * 削除・D&D で対象ルールの位置が変わった場合は追従して更新する。
		 */
		editingIndex:    -1,
		/**
		 * @type {object|null} 更新モード開始時のルール値のコピー。
		 * キャンセル時に入力欄を「変更前の値」へ復元するために使用する。
		 * 更新モード中に対象ルール自体が削除された場合は null に戻す。
		 */
		editingSnapshot: null,
		/**
		 * @type {'dark'|'light'} 現在のテーマ設定。既定は 'dark'（初回読込時の
		 * 描画フラッシュ抑止のため）。storage.local の 'theme' キーで永続化する。
		 */
		theme:           'dark'
	},

	// ===================================================
	// DOM要素の参照（Init 実行時に一括取得）
	// ===================================================
	Elements: {
		/** @type {HTMLInputElement|null} URLパターンのテキストボックス */
		txtPattern:        null,
		/** @type {HTMLInputElement|null} 前方一致ラジオボタン */
		radPrefix:         null,
		/** @type {HTMLInputElement|null} 正規表現ラジオボタン */
		radRegexp:         null,
		/** @type {HTMLInputElement|null} フォント名テキストボックス */
		txtFont:           null,
		/** @type {HTMLInputElement|null} フォント色テキストボックス */
		txtFontColor:      null,
		/** @type {HTMLInputElement|null} フォント色カラーピッカー */
		colorFont:         null,
		/** @type {HTMLInputElement|null} 背景色テキストボックス */
		txtBgColor:        null,
		/** @type {HTMLInputElement|null} 背景色カラーピッカー */
		colorBg:           null,
		/** @type {HTMLButtonElement|null} 主ボタン（追加モード=「新規登録」／更新モード=「更新」） */
		btnAdd:            null,
		/** @type {HTMLButtonElement|null} キャンセルボタン */
		btnCancel:         null,
		/** @type {HTMLElement|null} エラー・成功メッセージ表示エリア */
		msgError:          null,
		/** @type {HTMLElement|null} ルール一覧 tbody */
		ruleList:          null,
		/** @type {HTMLElement|null} フォームセクションの <h2>（モードに応じて「ルール追加／更新」表示を切替） */
		sectionFormHeader: null,
		/** @type {HTMLInputElement|null} テーマ切替スイッチ（checked=ダーク、unchecked=ライト） */
		chkTheme:          null,

		/**
		 * DOM要素の参照を一括取得して各プロパティに格納する
		 * @returns {void}
		 */
		Init: function () {
			this.txtPattern        = document.getElementById('tmTxtPattern');
			this.radPrefix         = document.getElementById('tmRadPrefix');
			this.radRegexp         = document.getElementById('tmRadRegexp');
			this.txtFont           = document.getElementById('tmTxtFont');
			this.txtFontColor      = document.getElementById('tmTxtFontColor');
			this.colorFont         = document.getElementById('tmColorFont');
			this.txtBgColor        = document.getElementById('tmTxtBgColor');
			this.colorBg           = document.getElementById('tmColorBg');
			this.btnAdd            = document.getElementById('tmBtnAdd');
			this.btnCancel         = document.getElementById('tmBtnCancel');
			this.msgError          = document.getElementById('tmMsgError');
			this.ruleList          = document.getElementById('tmRuleList');
			this.sectionFormHeader = document.getElementById('tmSectionFormHeader');
			this.chkTheme          = document.getElementById('tmChkTheme');
		}
	},

	// ===================================================
	// バリデーション
	// ===================================================
	Validation: {
		/**
		 * URLパターンのバリデーション。必須チェックと正規表現構文チェックを行う
		 * @param {string} pattern - URLパターン文字列
		 * @param {string} type - パターン種別（'prefix' | 'regexp'）
		 * @returns {{valid: boolean, message: string}} 検証結果（invalid 時はエラーメッセージ付き）
		 */
		ValidatePattern: function (pattern, type) {
			if (!pattern || pattern.trim().length === 0) {
				return { valid: false, message: TMS_COMMON.Funcs.GetMsg('errorPatternEmpty') };
			}
			if (type === 'regexp') {
				try {
					// 正規表現として構文解釈できるか検証（結果自体は破棄）
					void new RegExp(pattern);
				} catch {
					return { valid: false, message: TMS_COMMON.Funcs.GetMsg('errorInvalidRegexp') };
				}
			}
			return { valid: true, message: '' };
		},

		/**
		 * カラーコードの形式チェック。#rgb / #rrggbb のみ許容。ブランクは有効として扱う
		 * @param {string} value - カラーコード文字列（空文字可）
		 * @returns {boolean} true: 有効 / false: 不正
		 */
		ValidateColor: function (value) {
			if (value === '' || value === null || value === undefined) {
				return true;
			}
			return /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(value);
		},

		/**
		 * #rgb 形式を #rrggbb 形式へ正規化する（カラーピッカーが #rgb を受理しないため）。
		 * 既に #rrggbb または不正値の場合は元の値をそのまま返す。
		 * @param {string} value - カラーコード文字列
		 * @returns {string} 正規化後のカラーコード
		 */
		NormalizeColorToHex6: function (value) {
			const m = String(value).match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
			return m ? ('#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3]) : value;
		}
	},

	// ===================================================
	// UI 描画
	// ===================================================
	UI: {
		/**
		 * State.rules の内容から #tmRuleList のルール行を再描画する
		 * @returns {void}
		 */
		RenderRuleList: function () {
			const $list = $(TMS_OPTIONS.Elements.ruleList);
			$list.empty();
			const rules = TMS_OPTIONS.State.rules;
			for (let i = 0; i < rules.length; i++) {
				$list.append(TMS_OPTIONS.UI.BuildRuleRow(rules[i], i));
			}
		},

		/**
		 * ルール1件分の <tr> を jQuery で構築して返す。
		 * draggable 属性・data-index 属性を付与し、D&D のターゲットとする。
		 * ユーザー入力テキストは .text() を経由して XSS 対策する。
		 * 更新モード中の対象行には tm-rule-row-editing クラスを付与してハイライトする。
		 * @param {object} rule - ルールオブジェクト（TcRule）
		 * @param {number} index - ルールのインデックス（配列順）
		 * @returns {JQuery} 構築した <tr> の jQuery オブジェクト
		 */
		BuildRuleRow: function (rule, index) {
			const $tr = $('<tr>')
				.addClass('tm-rule-row')
				.attr('draggable', 'true')
				.attr('data-index', index);

			// 編集中の行をハイライト
			if (TMS_OPTIONS.State.mode === 'edit' && TMS_OPTIONS.State.editingIndex === index) {
				$tr.addClass('tm-rule-row-editing');
			}

			// ドラッグハンドル列
			$tr.append($('<td>').addClass('tm-drag-handle').text('≡'));

			// URLパターン列
			$tr.append($('<td>').text(rule.pattern || ''));

			// 種別列（i18n 経由で localized 文字列を取得）
			const typeKey   = (rule.patternType === 'prefix') ? 'optionsLabelPrefix' : 'optionsLabelRegexp';
			const typeLabel = TMS_COMMON.Funcs.GetMsg(typeKey);
			$tr.append($('<td>').text(typeLabel));

			// フォント列
			$tr.append($('<td>').text(rule.fontFamily || ''));

			// フォント色列（スウォッチ＋コード）
			const $fontColorCell = $('<td>');
			if (rule.fontColor) {
				$fontColorCell.append(
					$('<span>').addClass('tm-rule-color-swatch').css('background-color', rule.fontColor)
				);
				$fontColorCell.append(document.createTextNode(rule.fontColor));
			}
			$tr.append($fontColorCell);

			// 背景色列（スウォッチ＋コード）
			const $bgColorCell = $('<td>');
			if (rule.backgroundColor) {
				$bgColorCell.append(
					$('<span>').addClass('tm-rule-color-swatch').css('background-color', rule.backgroundColor)
				);
				$bgColorCell.append(document.createTextNode(rule.backgroundColor));
			}
			$tr.append($bgColorCell);

			// 編集ボタン列
			$tr.append(
				$('<td>').append(
					$('<button>')
						.attr('type', 'button')
						.attr('data-index', index)
						.addClass('tm-btn-edit')
						.text(TMS_COMMON.Funcs.GetMsg('optionsButtonEdit'))
				)
			);

			// 削除ボタン列
			$tr.append(
				$('<td>').append(
					$('<button>')
						.attr('type', 'button')
						.attr('data-index', index)
						.addClass('tm-btn-delete')
						.text(TMS_COMMON.Funcs.GetMsg('optionsButtonDelete'))
				)
			);

			return $tr;
		},

		/**
		 * エラーメッセージを表示する（メッセージ領域を赤色で表示）
		 * @param {string} message - 表示メッセージ
		 * @returns {void}
		 */
		ShowError: function (message) {
			const $msg = $(TMS_OPTIONS.Elements.msgError);
			$msg.removeClass('tm-msg-success').text(message);
		},

		/**
		 * 成功メッセージを表示する（メッセージ領域を緑色で表示）
		 * @param {string} message - 表示メッセージ
		 * @returns {void}
		 */
		ShowSuccess: function (message) {
			const $msg = $(TMS_OPTIONS.Elements.msgError);
			$msg.addClass('tm-msg-success').text(message);
		},

		/**
		 * メッセージ領域をクリアする
		 * @returns {void}
		 */
		ClearError: function () {
			const $msg = $(TMS_OPTIONS.Elements.msgError);
			$msg.removeClass('tm-msg-success').text('');
		},

		/**
		 * フォーム入力欄を初期状態（追加モードの既定値）に戻す
		 * @returns {void}
		 */
		ClearForm: function () {
			const elems              = TMS_OPTIONS.Elements;
			elems.txtPattern.value   = '';
			elems.radPrefix.checked  = true;
			elems.radRegexp.checked  = false;
			elems.txtFont.value      = '';
			elems.txtFontColor.value = '';
			elems.colorFont.value    = '#ffffff';
			elems.txtBgColor.value   = '';
			elems.colorBg.value      = '#ffffff';

			// 不正表示用の赤枠もまとめて解除
			$(elems.txtPattern).removeClass('tm-invalid');
			$(elems.txtFontColor).removeClass('tm-invalid');
			$(elems.txtBgColor).removeClass('tm-invalid');
		},

		/**
		 * 指定ルール（または編集スナップショット）の値をフォームへ反映する。
		 * カラーピッカーは #rgb 記法を受理しないため #rrggbb に正規化した値を設定する。
		 * @param {object} rule - フォームに反映するルールオブジェクト（TcRule 相当）
		 * @returns {void}
		 */
		PopulateFormFromRule: function (rule) {
			const elems              = TMS_OPTIONS.Elements;
			const normalize          = TMS_OPTIONS.Validation.NormalizeColorToHex6;
			elems.txtPattern.value   = rule.pattern || '';
			elems.radPrefix.checked  = (rule.patternType === 'prefix');
			elems.radRegexp.checked  = (rule.patternType === 'regexp');
			elems.txtFont.value      = rule.fontFamily || '';
			elems.txtFontColor.value = rule.fontColor || '';
			elems.colorFont.value    = rule.fontColor ? normalize(rule.fontColor) : '#ffffff';
			elems.txtBgColor.value   = rule.backgroundColor || '';
			elems.colorBg.value      = rule.backgroundColor ? normalize(rule.backgroundColor) : '#ffffff';

			// 赤枠を解除（過去の不正入力履歴を持ち越さない）
			$(elems.txtPattern).removeClass('tm-invalid');
			$(elems.txtFontColor).removeClass('tm-invalid');
			$(elems.txtBgColor).removeClass('tm-invalid');
		},

		/**
		 * 現在の State.mode に合わせてフォームセクション見出しと主ボタンの表示名を更新する。
		 * 追加モード：「ルール追加」「新規登録」／更新モード：「ルール更新」「更新」
		 * @returns {void}
		 */
		ApplyModeLabels: function () {
			const elems = TMS_OPTIONS.Elements;
			if (TMS_OPTIONS.State.mode === 'edit') {
				elems.sectionFormHeader.textContent = TMS_COMMON.Funcs.GetMsg('optionsEditRuleHeader');
				elems.btnAdd.textContent            = TMS_COMMON.Funcs.GetMsg('optionsButtonUpdate');
			} else {
				elems.sectionFormHeader.textContent = TMS_COMMON.Funcs.GetMsg('optionsAddRuleHeader');
				elems.btnAdd.textContent            = TMS_COMMON.Funcs.GetMsg('optionsButtonRegister');
			}
		},

		/**
		 * 現在の State.theme を body クラスおよびトグルスイッチに反映する。
		 * ライトテーマの時のみ body に tm-theme-light を付与し、ダークテーマは
		 * :root のデフォルト値を使用する（既定＝ダークなので body クラス不要）。
		 * @returns {void}
		 */
		ApplyTheme: function () {
			const theme    = TMS_OPTIONS.State.theme;
			const chkTheme = TMS_OPTIONS.Elements.chkTheme;
			if (theme === 'light') {
				document.body.classList.add('tm-theme-light');
			} else {
				document.body.classList.remove('tm-theme-light');
			}
			// トグルスイッチの状態を同期（チェック ON = ダーク）
			if (chkTheme) {
				chkTheme.checked = (theme === 'dark');
			}
		}
	},

	// ===================================================
	// イベントハンドラ
	// ===================================================
	Handlers: {
		/**
		 * State.rules を storage.sync に即時書き込みするヘルパー。
		 * 登録・更新・削除・並び替えの各ハンドラから呼び出され、
		 * バックグラウンドが onChanged を契機に再適用を行う。
		 * @returns {Promise<void>}
		 */
		PersistRules: async function () {
			try {
				await browser.storage.sync.set({ rules: TMS_OPTIONS.State.rules });
				TMS_OPTIONS.UI.ShowSuccess(TMS_COMMON.Funcs.GetMsg('optionsSaveSuccess'));
			} catch (e) {
				console.error('ルール保存に失敗しました:', e);
				TMS_OPTIONS.UI.ShowError(TMS_COMMON.Funcs.GetMsg('errorSaveFailed'));
			}
		},

		/**
		 * 主ボタン（追加モード：新規登録／更新モード：更新）のクリックハンドラ。
		 * バリデーション通過後、モードに応じて追加または既存ルールの差し替えを行い、
		 * 即時 storage.sync へ反映する。
		 * @returns {Promise<void>}
		 */
		OnAddRule: async function () {
			TMS_OPTIONS.UI.ClearError();

			const elems   = TMS_OPTIONS.Elements;
			const pattern = elems.txtPattern.value.trim();
			const type    = elems.radRegexp.checked ? 'regexp' : 'prefix';

			// URLパターンのバリデーション（必須＋正規表現構文）
			const patternResult = TMS_OPTIONS.Validation.ValidatePattern(pattern, type);
			if (!patternResult.valid) {
				$(elems.txtPattern).addClass('tm-invalid');
				TMS_OPTIONS.UI.ShowError(patternResult.message);
				return;
			}
			$(elems.txtPattern).removeClass('tm-invalid');

			// フォント色・背景色のバリデーション（ブランクは有効）
			const fontColor = elems.txtFontColor.value.trim();
			const bgColor   = elems.txtBgColor.value.trim();
			if (!TMS_OPTIONS.Validation.ValidateColor(fontColor)) {
				$(elems.txtFontColor).addClass('tm-invalid');
				TMS_OPTIONS.UI.ShowError(TMS_COMMON.Funcs.GetMsg('errorInvalidColor'));
				return;
			}
			if (!TMS_OPTIONS.Validation.ValidateColor(bgColor)) {
				$(elems.txtBgColor).addClass('tm-invalid');
				TMS_OPTIONS.UI.ShowError(TMS_COMMON.Funcs.GetMsg('errorInvalidColor'));
				return;
			}

			const fontFamily = elems.txtFont.value.trim();
			// 全スタイル項目が空の場合はブロック（機能設計書 §8.4 Phase 7：登録／更新不可）
			if (fontFamily === '' && fontColor === '' && bgColor === '') {
				TMS_OPTIONS.UI.ShowError(TMS_COMMON.Funcs.GetMsg('errorNoStyle'));
				return;
			}

			if (TMS_OPTIONS.State.mode === 'edit') {
				// 更新モード：対象ルールを差し替え（id は保持）
				const idx   = TMS_OPTIONS.State.editingIndex;
				const rules = TMS_OPTIONS.State.rules;
				if (idx < 0 || idx >= rules.length) {
					// 対象が既に削除済み等で不整合：追加モードへフォールバック
					TMS_OPTIONS.State.mode            = 'add';
					TMS_OPTIONS.State.editingIndex    = -1;
					TMS_OPTIONS.State.editingSnapshot = null;
					TMS_OPTIONS.UI.ApplyModeLabels();
					TMS_OPTIONS.UI.ClearForm();
					return;
				}
				rules[idx] = {
					id:              rules[idx].id,
					pattern:         pattern,
					patternType:     type,
					fontFamily:      fontFamily,
					fontColor:       fontColor,
					backgroundColor: bgColor
				};
				// 更新完了で追加モードへ戻す
				TMS_OPTIONS.State.mode            = 'add';
				TMS_OPTIONS.State.editingIndex    = -1;
				TMS_OPTIONS.State.editingSnapshot = null;
				TMS_OPTIONS.UI.ApplyModeLabels();
				TMS_OPTIONS.UI.ClearForm();
			} else {
				// 追加モード：新規ルールを末尾に追加（id は UUID を採番）
				const newRule = {
					id:              TMS_COMMON.Funcs.GenerateUUID(),
					pattern:         pattern,
					patternType:     type,
					fontFamily:      fontFamily,
					fontColor:       fontColor,
					backgroundColor: bgColor
				};
				TMS_OPTIONS.State.rules.push(newRule);
				TMS_OPTIONS.UI.ClearForm();
			}

			TMS_OPTIONS.UI.RenderRuleList();
			await TMS_OPTIONS.Handlers.PersistRules();
		},

		/**
		 * 編集ボタンのクリックハンドラ。
		 * 対象ルールを更新モードで編集開始する（値をフォームへ反映、行をハイライト、ラベル切替）。
		 * @param {number} index - 編集対象のインデックス
		 * @returns {void}
		 */
		OnEditRule: function (index) {
			const rules = TMS_OPTIONS.State.rules;
			if (index < 0 || index >= rules.length) {
				return;
			}
			const rule = rules[index];

			TMS_OPTIONS.State.mode         = 'edit';
			TMS_OPTIONS.State.editingIndex = index;
			// 変更前の値を深さ 1 のコピーとして保持（プリミティブのみのため shallow で十分）
			TMS_OPTIONS.State.editingSnapshot = {
				id:              rule.id,
				pattern:         rule.pattern,
				patternType:     rule.patternType,
				fontFamily:      rule.fontFamily,
				fontColor:       rule.fontColor,
				backgroundColor: rule.backgroundColor
			};

			TMS_OPTIONS.UI.PopulateFormFromRule(rule);
			TMS_OPTIONS.UI.ApplyModeLabels();
			TMS_OPTIONS.UI.RenderRuleList();
			TMS_OPTIONS.UI.ClearError();
		},

		/**
		 * キャンセルボタンのクリックハンドラ。
		 * 追加モード：フォームをクリアする。
		 * 更新モード：入力値を「変更前の値」（editingSnapshot）へ復元する（モードは維持）。
		 * @returns {void}
		 */
		OnCancel: function () {
			TMS_OPTIONS.UI.ClearError();
			if (TMS_OPTIONS.State.mode === 'edit' && TMS_OPTIONS.State.editingSnapshot) {
				TMS_OPTIONS.UI.PopulateFormFromRule(TMS_OPTIONS.State.editingSnapshot);
				return;
			}
			TMS_OPTIONS.UI.ClearForm();
		},

		/**
		 * 削除ボタンのクリックハンドラ。
		 * 対象ルールを State.rules から除去して即時 storage.sync へ反映する。
		 * 更新モード中に対象ルール自体が削除された場合は追加モードへ戻す。
		 * 更新中ルールより前の行を削除した場合は editingIndex をシフトする。
		 * @param {number} index - 削除対象のインデックス
		 * @returns {Promise<void>}
		 */
		OnDeleteRule: async function (index) {
			if (index < 0 || index >= TMS_OPTIONS.State.rules.length) {
				return;
			}
			TMS_OPTIONS.State.rules.splice(index, 1);
			TMS_OPTIONS.UI.ClearError();

			// 更新モード中の場合は editingIndex の位置を調整
			if (TMS_OPTIONS.State.mode === 'edit') {
				const eIdx = TMS_OPTIONS.State.editingIndex;
				if (index === eIdx) {
					// 更新対象行そのものを削除 → 追加モードへ戻す
					TMS_OPTIONS.State.mode            = 'add';
					TMS_OPTIONS.State.editingIndex    = -1;
					TMS_OPTIONS.State.editingSnapshot = null;
					TMS_OPTIONS.UI.ApplyModeLabels();
					TMS_OPTIONS.UI.ClearForm();
				} else if (index < eIdx) {
					// 更新対象より前の行を削除 → 更新対象のインデックスを 1 つ前にシフト
					TMS_OPTIONS.State.editingIndex = eIdx - 1;
				}
			}

			TMS_OPTIONS.UI.RenderRuleList();
			await TMS_OPTIONS.Handlers.PersistRules();
		},

		/**
		 * D&D 開始ハンドラ。ドラッグ元のインデックスを保持する
		 * @param {JQuery.TriggeredEvent} e - jQuery ドラッグイベント
		 * @param {number} index - ドラッグ対象行のインデックス
		 * @returns {void}
		 */
		OnDragStart: function (e, index) {
			TMS_OPTIONS.State.dragSrcIndex = index;
			const native                   = e.originalEvent;
			if (native && native.dataTransfer) {
				native.dataTransfer.effectAllowed = 'move';
				// Firefox は setData を呼ばないと dragstart が成立しないため形式的に設定
				native.dataTransfer.setData('text/plain', String(index));
			}
			$(e.currentTarget).addClass('tm-dragging');
		},

		/**
		 * D&D 通過中ハンドラ。デフォルト動作を抑止してドロップを許可しつつ、
		 * 通過行のハイライト表示を切り替える
		 * @param {JQuery.TriggeredEvent} e - jQuery ドラッグイベント
		 * @returns {void}
		 */
		OnDragOver: function (e) {
			e.preventDefault();
			const native = e.originalEvent;
			if (native && native.dataTransfer) {
				native.dataTransfer.dropEffect = 'move';
			}
			$('.tm-rule-row').removeClass('tm-drag-over');
			$(e.currentTarget).addClass('tm-drag-over');
		},

		/**
		 * D&D ドロップハンドラ。
		 * 機能設計書 §8.5「インデックスを交換」に従い、ドラッグ元とドロップ先の位置を swap し、
		 * Phase 7 仕様に従って即時 storage.sync へ反映する。
		 * 更新モード中に編集対象行が swap に関与した場合は editingIndex を追従する。
		 * @param {JQuery.TriggeredEvent} e - jQuery ドラッグイベント
		 * @param {number} index - ドロップ先行のインデックス
		 * @returns {Promise<void>}
		 */
		OnDrop: async function (e, index) {
			e.preventDefault();
			const src                      = TMS_OPTIONS.State.dragSrcIndex;
			TMS_OPTIONS.State.dragSrcIndex = -1;
			$('.tm-rule-row').removeClass('tm-dragging tm-drag-over');

			const rules = TMS_OPTIONS.State.rules;
			if (src < 0 || src === index || src >= rules.length || index >= rules.length) {
				return;
			}

			// ドラッグ元とドロップ先のルールを入れ替え
			const tmp    = rules[src];
			rules[src]   = rules[index];
			rules[index] = tmp;

			// 編集中インデックスの追従（swap に関与した場合のみ入れ替え）
			if (TMS_OPTIONS.State.mode === 'edit') {
				const eIdx = TMS_OPTIONS.State.editingIndex;
				if (eIdx === src) {
					TMS_OPTIONS.State.editingIndex = index;
				} else if (eIdx === index) {
					TMS_OPTIONS.State.editingIndex = src;
				}
			}

			TMS_OPTIONS.UI.RenderRuleList();
			await TMS_OPTIONS.Handlers.PersistRules();
		},

		/**
		 * D&D 終了ハンドラ。ドロップ未成立時のクリーンアップに使用する
		 * @returns {void}
		 */
		OnDragEnd: function () {
			TMS_OPTIONS.State.dragSrcIndex = -1;
			$('.tm-rule-row').removeClass('tm-dragging tm-drag-over');
		},

		/**
		 * カラーピッカーの変更ハンドラ（機能設計書 §8.2）。
		 * ピッカーで選ばれた色をテキストボックスに反映する
		 * @param {JQuery.TriggeredEvent} e - input イベント
		 * @returns {void}
		 */
		OnColorPickerChange: function (e) {
			// ピッカー id → 対応するテキストボックス id のマッピング
			const pairMap  = {
				'tmColorFont': 'tmTxtFontColor',
				'tmColorBg':   'tmTxtBgColor'
			};
			const pickerId = e.target.id;
			const txtId    = pairMap[pickerId];
			if (!txtId) {
				return;
			}
			const $txt = $('#' + txtId);
			$txt.val(e.target.value);
			$txt.removeClass('tm-invalid');
		},

		/**
		 * テーマ切替スイッチの change ハンドラ。
		 * チェック状態に応じて State.theme を更新し、body クラスへ反映、
		 * 最後に storage.local へ永続化する。
		 * @param {JQuery.TriggeredEvent} e - change イベント
		 * @returns {Promise<void>}
		 */
		OnThemeChange: async function (e) {
			const newTheme          = e.target.checked ? 'dark' : 'light';
			TMS_OPTIONS.State.theme = newTheme;
			TMS_OPTIONS.UI.ApplyTheme();
			try {
				await browser.storage.local.set({ theme: newTheme });
			} catch (err) {
				console.error('テーマ設定の保存に失敗しました:', err);
			}
		},

		/**
		 * カラーコードテキストの入力ハンドラ（機能設計書 §8.2）。
		 * - ブランク：ピッカーを #ffffff で初期化（保存値はブランクのまま）
		 * - 妥当値：ピッカーを6桁ヘックスに変換して反映
		 * - 不正値：テキストに赤枠を付与しピッカーは更新しない
		 * @param {JQuery.TriggeredEvent} e - input イベント
		 * @returns {void}
		 */
		OnTextColorInput: function (e) {
			const pairMap  = {
				'tmTxtFontColor': 'tmColorFont',
				'tmTxtBgColor':   'tmColorBg'
			};
			const txtId    = e.target.id;
			const pickerId = pairMap[txtId];
			if (!pickerId) {
				return;
			}
			const $txt    = $(e.target);
			const $picker = $('#' + pickerId);
			const val     = String($txt.val()).trim();

			if (val === '') {
				// ブランク時は表示専用のデフォルト色を適用（保存値はブランクのまま）
				$picker.val('#ffffff');
				$txt.removeClass('tm-invalid');
				return;
			}
			if (TMS_OPTIONS.Validation.ValidateColor(val)) {
				$picker.val(TMS_OPTIONS.Validation.NormalizeColorToHex6(val));
				$txt.removeClass('tm-invalid');
			} else {
				$txt.addClass('tm-invalid');
			}
		}
	},

	/**
	 * オプションページのエントリーポイント。
	 * DOM 参照取得 → i18n 適用 → storage からルール読込 → 一覧描画 → 各イベントバインドの順で実行する。
	 * @returns {Promise<void>}
	 */
	Init: async function () {
		// DOM 参照の一括取得
		TMS_OPTIONS.Elements.Init();

		// テーマ設定を storage.local から先行読込し、他の UI 構築前に反映する
		// （既定はダーク。ライト設定時のみ body にクラスを付与する）
		try {
			const themeResult = await browser.storage.local.get('theme');
			if (themeResult.theme === 'light' || themeResult.theme === 'dark') {
				TMS_OPTIONS.State.theme = themeResult.theme;
			}
		} catch (e) {
			console.error('テーマ設定の読込に失敗しました:', e);
		}
		TMS_OPTIONS.UI.ApplyTheme();

		// HTML の data-i18n 属性にブラウザ言語のメッセージを適用
		TMS_COMMON.Funcs.SetDocumentLocale();

		// 初期状態（追加モード）のラベルを明示的に適用（data-i18n と同値になるが冪等化のため実行）
		TMS_OPTIONS.UI.ApplyModeLabels();

		// storage.sync からルール読込（未保存なら空配列）
		try {
			const result            = await browser.storage.sync.get('rules');
			TMS_OPTIONS.State.rules = Array.isArray(result.rules) ? result.rules : [];
		} catch (e) {
			console.error('ルール読み込みに失敗しました:', e);
			TMS_OPTIONS.State.rules = [];
		}

		// 初期描画
		TMS_OPTIONS.UI.RenderRuleList();

		// ===== イベントバインド =====
		const H     = TMS_OPTIONS.Handlers;
		const elems = TMS_OPTIONS.Elements;

		// フォーム操作（主ボタン・キャンセル）
		$(elems.btnAdd).on('click', H.OnAddRule);
		$(elems.btnCancel).on('click', H.OnCancel);

		// テーマ切替トグル（change で即永続化＋反映）
		$(elems.chkTheme).on('change', H.OnThemeChange);

		// カラーピッカー双方向連動（input イベントでリアルタイム同期）
		$(elems.txtFontColor).on('input', H.OnTextColorInput);
		$(elems.colorFont).on('input', H.OnColorPickerChange);
		$(elems.txtBgColor).on('input', H.OnTextColorInput);
		$(elems.colorBg).on('input', H.OnColorPickerChange);

		// ルール一覧（動的行）: jQuery イベント委譲で編集・削除ボタン・D&D をハンドル
		const $list = $(elems.ruleList);

		$list.on('click', '.tm-btn-edit', function () {
			const idx = parseInt($(this).attr('data-index'), 10);
			H.OnEditRule(idx);
		});

		$list.on('click', '.tm-btn-delete', function () {
			const idx = parseInt($(this).attr('data-index'), 10);
			H.OnDeleteRule(idx);
		});

		$list.on('dragstart', '.tm-rule-row', function (e) {
			const idx = parseInt($(this).attr('data-index'), 10);
			H.OnDragStart(e, idx);
		});

		$list.on('dragover', '.tm-rule-row', function (e) {
			H.OnDragOver(e);
		});

		$list.on('drop', '.tm-rule-row', function (e) {
			const idx = parseInt($(this).attr('data-index'), 10);
			H.OnDrop(e, idx);
		});

		$list.on('dragend', '.tm-rule-row', H.OnDragEnd);
	}
};

// メソッド群を凍結（意図しない変更防止）
DeepFreeze(TMS_OPTIONS.Validation);
DeepFreeze(TMS_OPTIONS.UI);
DeepFreeze(TMS_OPTIONS.Handlers);

// State / Elements は値の変更を許可する必要があるためシール（プロパティ追加は禁止）
Object.seal(TMS_OPTIONS.State);
Object.seal(TMS_OPTIONS.Elements);

// トップレベル名前空間を凍結
Object.freeze(TMS_OPTIONS);

// DOMContentLoaded 後にエントリーポイント実行
document.addEventListener('DOMContentLoaded', TMS_OPTIONS.Init);
