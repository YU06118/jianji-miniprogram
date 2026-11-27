/**
 * TS 侧业务色值 token（OBS-7 处理）
 *
 * 说明：这些色值是**持久化到数据库的业务数据**（accounts 集合的 color 字段），
 * 不是样式定义，故不违反 §5「页面/组件 wxss 唯一色值来源」。
 * 但为避免 category.service / migration / 页面表单多处重复硬编码导致不一致，
 * 在此集中定义单一来源；值与 theme.wxss 的同名 token 保持一致。
 * 修改时须同步 theme.wxss。
 */

/** 强调紫（对应 --color-accent） */
export const TOKEN_ACCENT = '#8B7BE8';
/** 辅助紫（对应 --color-purple-2） */
export const TOKEN_PURPLE_2 = '#5E4FB5';
/** 深紫（对应 --color-purple-3） */
export const TOKEN_PURPLE_3 = '#2A2145';
/** 品牌紫（对应品牌渐变起点 #6D5BD0） */
export const TOKEN_BRAND = '#6D5BD0';
/** 收入绿（对应 --color-income） */
export const TOKEN_INCOME = '#39D0A5';
/** 支出红（对应 --color-expense） */
export const TOKEN_EXPENSE = '#FF6B81';
/** 主文本色（对应 --color-text-1） */
export const TOKEN_TEXT_1 = '#F2F0FA';
/** 次文本色（对应 --color-text-2） */
export const TOKEN_TEXT_2 = '#A9A3C4';
/** 辅助文本色（对应 --color-text-3） */
export const TOKEN_TEXT_3 = '#8B84A6';
/** 分隔线色（对应 --color-divider） */
export const TOKEN_DIVIDER = 'rgba(255,255,255,0.08)';
