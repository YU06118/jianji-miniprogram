// utils/categories.js —— 分类体系 + 关键词自动分类

/** 支出分类（12 个，记账页 4 列 3 行铺满一屏）
 *  color = 主色（图标、图表），soft = 同色系淡底（卡片背景）
 *  配色原则：全部降饱和一档，色相分散但明度接近，保证同屏不打架（详见 设计规范.md） */
const EXPENSE_CATS = [
  { key: 'food',      name: '餐饮', emoji: '🍜', color: '#E8836A', soft: '#FCEDE8' },
  { key: 'grocery',   name: '买菜', emoji: '🥬', color: '#6FAE5F', soft: '#EDF6E9' },
  { key: 'kid',       name: '孩子', emoji: '🧸', color: '#E9A23B', soft: '#FEF4E4' },
  { key: 'daily',     name: '日用', emoji: '🧴', color: '#4FB3A5', soft: '#E7F6F3' },
  { key: 'clothing',  name: '服饰', emoji: '👗', color: '#E5759B', soft: '#FCEBF1' },
  { key: 'home',      name: '家庭', emoji: '🏠', color: '#8E7CD1', soft: '#F1EDFB' },
  { key: 'social',    name: '人情', emoji: '🧧', color: '#D9736E', soft: '#FBECEB' },
  { key: 'transport', name: '交通', emoji: '🚗', color: '#5B9FE0', soft: '#EAF3FC' },
  { key: 'medical',   name: '医疗', emoji: '💊', color: '#3FB0C4', soft: '#E6F6F9' },
  { key: 'fun',       name: '娱乐', emoji: '🎬', color: '#A96FC4', soft: '#F6ECFA' },
  { key: 'study',     name: '学习', emoji: '📚', color: '#6C7CC9', soft: '#EDF0FB' },
  { key: 'other',     name: '其他', emoji: '📦', color: '#A79DA2', soft: '#F3EFEF' }
]

/** 收入分类
 *  合规提示：`invest` 显示名不用「理财」——金融类词汇会进审核词库，
 *  记账工具必须让位。用户想记"理财赎回"直接写在备注里即可（备注是用户内容，不参与审核）。 */
const INCOME_CATS = [
  { key: 'salary',   name: '工资', emoji: '💰', color: '#4CBFA3', soft: '#E8F7F2' },
  { key: 'bonus',    name: '奖金', emoji: '🎁', color: '#E9A23B', soft: '#FEF4E4' },
  { key: 'redpack',  name: '红包', emoji: '🧧', color: '#D9736E', soft: '#FBECEB' },
  { key: 'invest',   name: '利息', emoji: '📈', color: '#5B9FE0', soft: '#EAF3FC' },
  { key: 'other_in', name: '其他', emoji: '📥', color: '#A79DA2', soft: '#F3EFEF' }
]

const ALL_CATS = EXPENSE_CATS.concat(INCOME_CATS)

const CAT_MAP = (function () {
  const m = {}
  for (let i = 0; i < ALL_CATS.length; i++) m[ALL_CATS[i].key] = ALL_CATS[i]
  return m
})()

/** 关键词表：用户敲备注时自动落到分类。
 *  匹配规则为「最长关键词优先」，因此「水果茶」不会被误判成「买菜」。 */
const KEYWORDS = {
  kid: ['奶粉', '尿不湿', '纸尿裤', '尿裤', '玩具', '童装', '童鞋', '绘本', '幼儿园', '学费', '疫苗',
    '儿科', '宝宝', '娃', '乐高', '积木', '辅导班', '兴趣班', '亲子', '儿童', '补习', '奶瓶', '辅食',
    '婴儿', '幼小衔接', '托管', '夏令营', '游乐场', '儿童医院', '校服'],
  grocery: ['菜市场', '菜场', '超市', '生鲜', '蔬菜', '水果', '排骨', '鸡蛋', '粮油', '大米',
    '食用油', '海鲜', '猪肉', '牛肉', '鸡肉', '豆制品', '早点', '速冻', '蔬菜店', '菜店', '干货'],
  food: ['早餐', '早餐店', '午餐', '晚餐', '外卖', '吃饭', '餐厅', '饭店', '快餐', '食堂', '奶茶',
    '咖啡', '烧烤', '火锅', '麦当劳', '肯德基', '星巴克', '汉堡', '面馆', '小吃', '夜宵',
    '下午茶', '米线', '卤味', '水果茶', '奶茶店', '聚餐', '请客吃饭'],
  home: ['房租', '水费', '电费', '燃气', '煤气', '物业', '宽带', '话费', '手机费', '家电', '冰箱',
    '洗衣机', '空调', '家具', '维修', '装修', '有线电视', '取暖', '热水器', '油烟机', '床垫', '窗帘'],
  social: ['红包', '礼金', '随礼', '份子', '送礼', '满月', '结婚', '生日礼', '探病', '白事', '红事',
    '人情', '伴手礼', '孝敬', '压岁钱', '礼盒', '看望'],
  transport: ['打车', '公交', '地铁', '加油', '油费', '停车', '高铁', '火车', '机票', '滴滴', '出租车',
    '共享单车', '过路费', '洗车', '车险', '违章', '网约车', '电瓶车', '充电桩', '油卡'],
  medical: ['医院', '挂号', '药店', '体检', '看病', '门诊', '住院', '化验', '药费', '牙科', '口腔',
    '推拿', '理疗', '中医', '疫苗', '拍片', '复诊', '买药'],
  daily: ['纸巾', '洗衣液', '洗洁精', '牙膏', '洗发', '沐浴', '沐浴露', '清洁', '日用品', '垃圾袋',
    '拖把', '抹布', '收纳', '电池', '雨伞', '拖鞋', '五金', '灯泡', '卫生巾', '湿巾', '洗面奶'],
  clothing: ['衣服', '服装', '裤子', '外套', '鞋', '包包', '化妆品', '护肤', '美妆', '香水', '面膜',
    '口红', '内衣', '袜', '羽绒服', '卫衣', '连衣裙', '首饰'],
  fun: ['电影', '旅游', '门票', '游乐', 'KTV', '健身', '美容', '按摩', '游戏', '骑行', '露营',
    '摄影', '演出', '足浴', '美甲', '宠物', '花'],
  study: ['课程', '培训', '网课', '资料', '考试', '报名费', '考证', '教材', '订阅', '会员', '书籍',
    '买个书', '书店', '学习', '知识付费'],
  // 注意：下面是「识别用户输入」用的词典，仅用于把用户打的字归到分类，
  // 不会作为任何开发者文案展示，因此不受上架禁用词约束（见 安全与合规规范.md §1.2）。
  invest: ['利息', '存款', '国债', '理财赎回', '理财', '基金', '股票', '分红', '赎回'],
  other: []
}

/** 根据备注文字猜测分类，返回分类 key 或 null */
function guess(text) {
  const s = String(text || '').trim()
  if (!s) return null
  let best = null
  const keys = Object.keys(KEYWORDS)
  for (let i = 0; i < keys.length; i++) {
    const catKey = keys[i]
    const words = KEYWORDS[catKey]
    for (let j = 0; j < words.length; j++) {
      const w = words[j]
      if (s.indexOf(w) >= 0) {
        if (!best || w.length > best.len) best = { cat: catKey, len: w.length }
      }
    }
  }
  return best ? best.cat : null
}

function getCat(key) {
  return CAT_MAP[key] || { key: key || 'other', name: '其他', emoji: '📦', color: '#B0A0A4' }
}

function catName(key) {
  return getCat(key).name
}

function catEmoji(key) {
  return getCat(key).emoji
}

function catColor(key) {
  return getCat(key).color
}

function catsOf(type) {
  return type === 'income' ? INCOME_CATS : EXPENSE_CATS
}

/** 记账页的默认快捷标签（数据量不足时兜底使用） */
const DEFAULT_QUICK = [
  { type: 'expense', cat: 'food',      note: '早餐',     amount: 15 },
  { type: 'expense', cat: 'grocery',   note: '买菜',     amount: 80 },
  { type: 'expense', cat: 'grocery',   note: '水果',     amount: 45 },
  { type: 'expense', cat: 'kid',       note: '奶粉尿裤', amount: 200 },
  { type: 'expense', cat: 'daily',     note: '日用',     amount: 50 },
  { type: 'expense', cat: 'transport', note: '打车',     amount: 25 },
  { type: 'expense', cat: 'food',      note: '奶茶',     amount: 18 },
  { type: 'expense', cat: 'home',      note: '水电燃气', amount: 150 }
]

/** 预算分项顺序（设置页按此顺序展示） */
const BUDGET_CATS = EXPENSE_CATS.filter(function (c) { return c.key !== 'other' })

module.exports = {
  EXPENSE_CATS,
  INCOME_CATS,
  ALL_CATS,
  CAT_MAP,
  KEYWORDS,
  DEFAULT_QUICK,
  BUDGET_CATS,
  guess,
  getCat,
  catName,
  catEmoji,
  catColor,
  catsOf
}
