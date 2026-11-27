/**
 * 分类管理（阶段 2）：预设/自定义分类、新增、编辑、排序、软删除。
 */

import type { Account, CompatInfo, RecordType } from '../../types';
import {
  ensurePresetAccounts,
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  reorderAccounts,
} from '../../services/category.service';
import { getThemeBootstrap } from '../../utils/nav';
import { playPageEnter } from '../../utils/page-transition';
import { showErrorToast, showSuccessToast } from '../../utils/logger';
import { TOKEN_ACCENT } from '../../utils/tokens';

interface CategoryManageData {
  compat: CompatInfo | null;
  /** 顶部安全偏移（px），注入为 --nav-safe-top（阶段 6） */
  navSafeTop: number;
  /** 入场序列：0=idle 隐藏，1/2=a/b 双类交替重播（阶段二） */
  pageEnterSeq: 0 | 1 | 2;
  type: RecordType;
  accounts: Account[];
  showAdd: boolean;
  editId: string;
  formName: string;
  formIcon: string;
  formColor: string;
}

Page({
  data: {
    compat: null,
    navSafeTop: 0,
    pageEnterSeq: 0,
    type: 'expense' as RecordType,
    accounts: [],
    showAdd: false,
    editId: '',
    formName: '',
    formIcon: '◉',
    formColor: TOKEN_ACCENT,
  } as CategoryManageData,

  onLoad(): void {
    ensurePresetAccounts();
    this.setData(getThemeBootstrap());
    this.reload();
    playPageEnter(this); // 入场动画在 onLoad 末尾即触发，不等 onReady（第四轮 2.3）
  },

  reload(): void {
    this.setData({ accounts: listAccounts(this.data.type) });
  },

  onTypeChange(event: { currentTarget: { dataset: { type: RecordType } } }): void {
    this.setData({ type: event.currentTarget.dataset.type }, () => this.reload());
  },

  showAddDialog(): void {
    this.setData({ showAdd: true, editId: '', formName: '', formIcon: '◉', formColor: TOKEN_ACCENT });
  },

  showEditDialog(event: { currentTarget: { dataset: { id: string } } }): void {
    const account = listAccounts().find((a) => a._id === event.currentTarget.dataset.id);
    if (!account) return;
    this.setData({
      showAdd: true,
      editId: account._id,
      formName: account.name,
      formIcon: account.icon,
      formColor: account.color,
    });
  },

  closeDialog(): void {
    this.setData({ showAdd: false });
  },

  onNameInput(event: { detail: { value: string } }): void {
    this.setData({ formName: event.detail.value.slice(0, 12) });
  },

  onIconInput(event: { detail: { value: string } }): void {
    this.setData({ formIcon: event.detail.value.slice(0, 4) });
  },

  onSave(): void {
    const name = this.data.formName.trim();
    if (!name) {
      showErrorToast('请输入分类名称');
      return;
    }
    if (this.data.editId) {
      updateAccount(this.data.editId, {
        name,
        icon: this.data.formIcon,
        color: this.data.formColor,
      });
      showSuccessToast('已更新');
    } else {
      createAccount({
        name,
        type: this.data.type,
        icon: this.data.formIcon,
        color: this.data.formColor,
      });
      showSuccessToast('已添加');
    }
    this.setData({ showAdd: false });
    this.reload();
  },

  onDelete(event: { currentTarget: { dataset: { id: string } } }): void {
    const ok = deleteAccount(event.currentTarget.dataset.id);
    if (!ok) {
      showErrorToast('预设分类不可删除');
      return;
    }
    showSuccessToast('已删除');
    this.reload();
  },

  /** 上移：交换 sortOrder（排序动效由 transform 过渡实现） */
  onMoveUp(event: { currentTarget: { dataset: { index: number } } }): void {
    const index = event.currentTarget.dataset.index;
    if (index <= 0) return;
    const ids = this.data.accounts.map((a) => a._id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    reorderAccounts(ids);
    this.reload();
  },
});
