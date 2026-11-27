/**
 * 记一笔（Q6 决策）：底部全屏抽屉形态，从首页悬浮按钮唤起，支持新增/编辑。
 * 字段：金额（自定义键盘）、类型、分类、日期、备注、图片（≤3 张，压缩≤200KB）。
 * 动效：抽屉进入（translateY 100%→0，520ms）与退出（反向滑出，320ms）配对，
 *       关闭动画结束后才 navigateBack，禁止瞬时消失；键盘按压（AmountPad）、分类切换 transform。
 *
 * 形态说明：Q6 的"底部全屏抽屉"用独立页面 + 上滑动画实现（而非内嵌 glass-sheet 组件），
 * 因为记一笔需独立生命周期、编辑态 ?id= 与从多处唤起；视觉与交互等价，且返回栈更稳。
 */

import type { Account, BillRecord, CompatInfo, RecordType } from '../../types';
import { listAccounts, ensurePresetAccounts } from '../../services/category.service';
import { createRecord, getRecord, updateRecord } from '../../services/record.service';
import { todayISO8 } from '../../utils/date';
import { canSaveAmount, formatYuan, parseAmountToCents } from '../../utils/money';
import { EMPTY_KEYPAD, keypadFromString, pressKey } from '../../utils/keypad';
import type { KeypadState } from '../../utils/keypad';
import { getThemeBootstrap } from '../../utils/nav';
import { pickAndCompressImages } from '../../utils/image';
import { showErrorToast, showSuccessToast } from '../../utils/logger';

interface EditorData {
  compat: CompatInfo | null;
  /** 顶部安全偏移（px），注入为 --nav-safe-top（阶段 6） */
  navSafeTop: number;
  /** 日期选择上界：默认不允许未来记账（交互修复第二批） */
  today: string;
  /** 自绘日期滚轮显隐（交互修复第二轮 A） */
  dateWheelShow: boolean;
  /** 「今天」按钮按压态（第二轮 C：显式 pressed） */
  todayPressed: boolean;
  editId: string;
  type: RecordType;
  accounts: Account[];
  selectedAccountId: string;
  keypad: KeypadState;
  amountText: string;
  /** 保存按钮可用性：金额为正且已选分类（交互修复第三阶段，实时置灰） */
  canSave: boolean;
  date: string;
  note: string;
  images: string[];
  /** 退出动画进行中：为 true 时根节点播放下滑退出动画 */
  closing: boolean;
}

/** 退出动画时长，与 theme.wxss --dur-medium(320ms) 配对 */
const EXIT_DURATION = 320;

Page({
  data: {
    compat: null,
    navSafeTop: 0,
    today: '',
    dateWheelShow: false,
    todayPressed: false,
    editId: '',
    type: 'expense' as RecordType,
    accounts: [] as Account[],
    selectedAccountId: '',
    keypad: EMPTY_KEYPAD,
    amountText: '0',
    canSave: false,
    date: '',
    note: '',
    images: [] as string[],
    closing: false,
  } as EditorData,

  onLoad(options: { id?: string }): void {
    const accounts = ensurePresetAccounts();
    const editId = options.id ?? '';
    let record: BillRecord | null = null;
    if (editId) {
      record = getRecord(editId);
      if (!record) {
        showErrorToast('记录不存在');
        return;
      }
    }
    const type: RecordType = record?.type ?? 'expense';
    const selectedAccountId = record?.accountId ?? accounts.find((a) => a.type === type)?._id ?? '';
    // 纯整数路径：分 → 元字符串（formatYuan 用整除/取余，不引入浮点）
    const keypad = record ? keypadFromString(formatYuan(record.amountInCents)) : EMPTY_KEYPAD;
    this.setData({
      ...getThemeBootstrap(),
      today: todayISO8(),
      editId,
      type,
      accounts: accounts.filter((a) => a.type === type),
      selectedAccountId,
      keypad,
      amountText: keypad.display,
      canSave: canSaveAmount(keypad.display, !!selectedAccountId),
      date: record?.date ?? todayISO8(),
      note: record?.note ?? '',
      images: record?.images ?? [],
    });
  },

  /** 同步保存按钮可用性：金额与分类任一变化都重算（第三阶段） */
  syncCanSave(): void {
    this.setData({
      canSave: canSaveAmount(this.data.amountText, !!this.data.selectedAccountId),
    });
  },

  onTypeChange(event: { currentTarget: { dataset: { type: RecordType } } }): void {
    const type = event.currentTarget.dataset.type;
    const accounts = listAccounts(type);
    this.setData({
      type,
      accounts,
      selectedAccountId: accounts.find((a) => a.type === type)?._id ?? '',
    });
    this.syncCanSave();
  },

  onSelectAccount(event: { currentTarget: { dataset: { id: string } } }): void {
    this.setData({ selectedAccountId: event.currentTarget.dataset.id });
    this.syncCanSave();
  },

  onKey(event: { detail: { key: string } }): void {
    const keypad = pressKey(this.data.keypad, event.detail.key);
    this.setData({ keypad, amountText: keypad.display });
    this.syncCanSave();
  },

  onNoteInput(event: { detail: { value: string } }): void {
    this.setData({ note: event.detail.value.slice(0, 100) });
  },

  /** 整行可点：唤起自绘日期滚轮（交互修复第二轮 A；第三轮加 [JJ] 日志供验收取证） */
  onOpenDate(): void {
    console.error('[JJ] open date');
    this.setData({ dateWheelShow: true });
  },

  /** 滚轮确定：回写所选日期并关闭 */
  onDateWheelChange(event: { detail: { value: string } }): void {
    this.setData({ date: event.detail.value, dateWheelShow: false });
  },

  /** 滚轮取消 / 遮罩：仅关闭，不写值 */
  onDateWheelClose(): void {
    this.setData({ dateWheelShow: false });
  },

  /** 「今天」快捷入口：日期立即回显为今天 */
  onToday(): void {
    this.setData({ date: todayISO8() });
  },

  /** 「今天」按钮按压态（显式 pressed，catch 防止冒泡唤起日期弹层） */
  onTodayTouchStart(): void {
    this.setData({ todayPressed: true });
  },

  onTodayTouchEnd(): void {
    (this as { _todayTimer?: ReturnType<typeof setTimeout> })._todayTimer = setTimeout(() => {
      (this as { _todayTimer?: ReturnType<typeof setTimeout> })._todayTimer = undefined;
      this.setData({ todayPressed: false });
    }, 120);
  },

  async onAddImages(): Promise<void> {
    const remaining = Math.max(0, 3 - this.data.images.length);
    if (remaining === 0) {
      showErrorToast('最多 3 张凭证');
      return;
    }
    const picked = await pickAndCompressImages(remaining);
    this.setData({ images: [...this.data.images, ...picked].slice(0, 3) });
  },

  onRemoveImage(event: { currentTarget: { dataset: { index: number } } }): void {
    const images = [...this.data.images];
    images.splice(event.currentTarget.dataset.index, 1);
    this.setData({ images });
  },

  onSave(): void {
    const cents = parseAmountToCents(this.data.amountText);
    if (cents === null || cents <= 0) {
      showErrorToast('请输入有效金额');
      return;
    }
    if (!this.data.selectedAccountId) {
      showErrorToast('请选择分类');
      return;
    }
    const payload = {
      accountId: this.data.selectedAccountId,
      type: this.data.type,
      amountInCents: cents,
      note: this.data.note.trim(),
      date: this.data.date,
      images: this.data.images,
    };
    try {
      if (this.data.editId) {
        updateRecord(this.data.editId, payload);
      } else {
        createRecord(payload);
      }
      showSuccessToast(this.data.editId ? '已更新' : '已记录');
      this.closeWithAnimation();
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '保存失败');
    }
  },

  onClose(): void {
    this.closeWithAnimation();
  },

  /** Q6 抽屉退出：先播下滑动画，动画结束后才 navigateBack，禁止瞬时消失 */
  closeWithAnimation(): void {
    if (this.data.closing) return; // 防重复触发
    this.setData({ closing: true });
    // BUG-Q6-01：保存 timer id，页面卸载（如物理返回/左滑返回）时清理，
    // 避免 320ms 动画窗口内系统已弹栈后 timer 再次 navigateBack 多退一层
    (this as { _exitTimer?: ReturnType<typeof setTimeout> })._exitTimer = setTimeout(() => {
      wx.navigateBack();
    }, EXIT_DURATION);
  },

  /** 页面卸载时清理定时器：退出动画 timer（BUG-Q6-01）与「今天」按压回弹 timer */
  onUnload(): void {
    const self = this as { _exitTimer?: ReturnType<typeof setTimeout>; _todayTimer?: ReturnType<typeof setTimeout> };
    if (self._exitTimer !== undefined) {
      clearTimeout(self._exitTimer);
      self._exitTimer = undefined;
    }
    if (self._todayTimer !== undefined) {
      clearTimeout(self._todayTimer);
      self._todayTimer = undefined;
    }
  },
});
