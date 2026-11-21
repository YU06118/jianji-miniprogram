#!/usr/bin/env node
/**
 * tools/security-audit.js —— 对外开放前的自动体检
 * ---------------------------------------------------------------------------
 * 规范写在文档里没人看，写成脚本才能拦住人。
 * 每次提审前跑一遍：node tools/security-audit.js
 *
 * 检查项：
 *   [FAIL] 零网络请求      —— 任何 http(s) 外链、任何 wx 网络 API
 *   [FAIL] 权限最小化      —— 位置 / 相册 / 手机号 / 用户信息等隐私接口
 *   [FAIL] 无代码执行      —— eval / new Function / 字符串 setTimeout
 *   [FAIL] 无富文本渲染    —— rich-text 渲染用户内容
 *   [FAIL] 金融与诱导文案  —— 只扫「用户看得见的文案」，不扫代码
 *   [WARN] 绝对化用语      —— 广告法风险，交人工判断
 *   [WARN] 剪贴板用法      —— 仅允许在「我的」/「设置」页人工触发
 *   [INFO] 包体与文件清单
 *
 * 设计原则：宁可漏报噪音，不可误报。一个天天报假警的检查等于没有检查。
 *
 * 用法：
 *   node tools/security-audit.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

/* 不参与扫描：文档本身会列出所有禁用词，脚本自己也是 */
const SKIP_DIRS = ['tools', 'node_modules', '.git', '.workbuddy', '_shot']
const SKIP_FILES = ['安全与合规规范.md', '设计规范.md', 'README.md']

/* 扫描的源码类型 */
const CODE_EXT = ['.js', '.wxml', '.wxss', '.json', '.html']
/* 需要做「文案合规」扫描的类型 */
const COPY_EXT = ['.js', '.wxml', '.json', '.html']

const RULES = {
  network: {
    title: '零网络请求',
    why: '数据不出本机是这个产品唯一的信任凭据，一旦联网整条安全边界就没了',
    patterns: [
      [/\bwx\s*\.\s*(request|uploadFile|downloadFile|connectSocket|sendSocketMessage|createUDPSocket)\b/g, '调用了微信网络接口'],
      [/(?:src|href|url|action)\s*[=:]\s*['"]https?:\/\//g, '引用了外部资源/地址'],
      [/['"]https?:\/\/(?!localhost|127\.0\.0\.1)/g, '代码里出现外部链接']
    ]
  },
  privApi: {
    title: '权限最小化',
    why: '这个产品不需要任何隐私权限，多加一个都是多一个攻击面与审核风险',
    patterns: [
      [/\bwx\s*\.\s*(getLocation|chooseLocation|onLocationChange|startLocationUpdate)\b/g, '位置权限'],
      [/\bwx\s*\.\s*(chooseImage|chooseMedia|chooseVideo|saveImageToPhotosAlbum|saveVideoToPhotosAlbum)\b/g, '相册/相机权限'],
      [/\bwx\s*\.\s*(getPhoneNumber|getUserProfile|getUserInfo|getWeRunData)\b/g, '用户身份信息'],
      [/\bwx\s*\.\s*(chooseAddress|addCard|openCard|requestPayment|requestSubscribeMessage)\b/g, '交易/订阅权限'],
      [/\bwx\s*\.\s*(startRecord|getRecorderManager|getBluetoothAdapterState)\b/g, '录音/蓝牙权限']
    ]
  },
  codeExec: {
    title: '无动态代码执行',
    why: 'eval 类接口让「不可信输入」有机会变成代码',
    patterns: [
      [/\beval\s*\(/g, 'eval'],
      [/new\s+Function\s*\(/g, 'new Function'],
      [/set(Timeout|Interval)\s*\(\s*['"]/g, '字符串形式的定时器']
    ]
  },
  richText: {
    title: '无富文本渲染',
    why: 'rich-text 会把用户备注当 HTML 解析，是记账类小程序最典型的注入点',
    patterns: [
      [/<rich-text/g, '使用了 rich-text 组件']
    ]
  }
}

/* 高精度禁用词：在面向用户的文案里几乎不可能无辜出现 */
const BANNED_FAIL = [
  ['理财', '金融类'], ['投资', '金融类'], ['收益', '金融类'], ['年化', '金融类'],
  ['分红', '金融类'], ['返利', '金融类'], ['返现', '金融类'], ['借贷', '金融类'],
  ['贷款', '金融类'], ['套现', '金融类'], ['基金', '金融类'], ['股票', '金融类'],
  ['稳赚', '诱导'], ['躺赚', '诱导'], ['博彩', '违法'], ['赌博', '违法'],
  ['分享得', '诱导分享'], ['邀请返', '诱导分享'], ['助力', '诱导分享']
]

/* 低置信度：广告法相关，可能是正常用词，交人工判断 */
const BANNED_WARN = [
  ['最好', '绝对化用语'], ['最强', '绝对化用语'], ['最佳', '绝对化用语'],
  ['第一名', '绝对化用语'], ['全国第一', '绝对化用语'], ['唯一', '绝对化用语'],
  ['100%', '绝对化用语'], ['国家级', '绝对化用语'], ['世界级', '绝对化用语'],
  ['保证收益', '承诺性表述'], ['包赚', '承诺性表述']
]

/* 白名单：这些词只出现在「识别用户输入」的关键词表里，不作为开发者文案展示。
   用户自己打「理财赎回」是 UGC，不归我们管；我们只保证自己不这么说。 */
const DICT_ALLOW = ['理财', '基金', '股票', '分红', '理财赎回', '赎回', '存款', '国债', '利息']

const problems = []
const warnings = []
let filesScanned = 0
const fileList = []

/* ---------- 文案抽取：只取「用户看得见」的部分 ---------- */

function extractCopy(raw, ext) {
  if (ext === '.json') {
    return (raw.match(/"[^"]*"/g) || []).join('\n')
  }
  if (ext === '.js') {
    /* 只取字符串字面量，代码结构本身不参与文案检查 */
    return (raw.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) || []).join('\n')
  }
  /* wxml / html：先剥掉 style、script、注释，再取标签之间的文字 + 文案类属性 */
  let s = raw
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<[^>]*>/g, function (tag) {
    const attrs = tag.match(/(?:placeholder|title|content|confirmText|cancelText|aria-label|label)\s*=\s*"([^"]*)"/gi) || []
    return '\n' + attrs.join('\n') + '\n'
  })
  return s
}

/* ---------- 输出 ---------- */

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const rel = path.relative(ROOT, p).replace(/\\/g, '/')
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (SKIP_DIRS.indexOf(name) >= 0) continue
      walk(p)
      continue
    }
    if (SKIP_FILES.indexOf(name) >= 0) continue
    const ext = path.extname(name).toLowerCase()
    if (CODE_EXT.indexOf(ext) < 0) continue

    filesScanned++
    fileList.push({ rel, size: st.size })
    const raw = fs.readFileSync(p, 'utf8')

    /* --- 1. 硬性安全规则（扫全部代码，含注释里的示例也要拦） --- */
    Object.keys(RULES).forEach(function (k) {
      const rule = RULES[k]
      rule.patterns.forEach(function (pair) {
        const re = pair[0]
        re.lastIndex = 0
        let m
        while ((m = re.exec(raw)) !== null) {
          const at = raw.slice(0, m.index).split('\n').length
          problems.push({
            rule: rule.title, why: rule.why,
            file: rel + ':' + at, hit: pair[1], sample: m[0].trim().slice(0, 60)
          })
        }
      })
    })

    /* --- 2. 剪贴板（允许，但必须集中在人工触发入口） --- */
    if (/wx\s*\.\s*(setClipboardData|getClipboardData)/.test(raw)) {
      const CLIPBOARD_ENTRY = ['pages/me/me.js', 'pages/settings/settings.js']
      if (CLIPBOARD_ENTRY.indexOf(rel) < 0) {
        warnings.push({ file: rel, hit: '剪贴板 API 出现在非备份入口页', why: '剪贴板读写必须集中在用户主动点击的入口里' })
      } else {
        warnings.push({
          file: rel, hit: '使用了剪贴板（备份 / 恢复）',
          why: '上线前确认 mp 后台隐私协议已勾选「剪贴板」，否则这两个功能在正式版会调用失败'
        })
      }
    }

    /* --- 3. 文案合规 --- */
    if (COPY_EXT.indexOf(ext) < 0) continue
    const copy = extractCopy(raw, ext)

    BANNED_FAIL.forEach(function (b) {
      const word = b[0]
      if (copy.indexOf(word) < 0) return
      if (DICT_ALLOW.indexOf(word) >= 0 && skippedByDict(copy, word)) return
      problems.push({
        rule: '合规文案', why: '「' + word + '」属于' + b[1] + '，会被审核拦下',
        file: rel, hit: '出现禁用词「' + word + '」', sample: contextOf(copy, word)
      })
    })

    BANNED_WARN.forEach(function (b) {
      const word = b[0]
      if (copy.indexOf(word) < 0) return
      warnings.push({
        file: rel, hit: '疑似' + b[1] + '「' + word + '」',
        why: '广告法风险，请人工确认这句是不是在描述我们的产品：' + contextOf(copy, word)
      })
    })
  }
}

/** 该词在文件里是否只出现在关键词词典里（词典里出现的都算豁免） */
function skippedByDict(copy, word) {
  const re = new RegExp("['\"][^'\"]*" + word + "[^'\"]*['\"]", 'g')
  const hits = copy.match(re) || []
  if (!hits.length) return false
  /* 若每处命中都是词典里的纯关键词串，则豁免 */
  return hits.every(function (h) {
    const inner = h.slice(1, -1)
    return DICT_ALLOW.indexOf(inner) >= 0 || (inner.length <= 6 && DICT_ALLOW.some(function (d) { return inner.indexOf(d) >= 0 }))
  })
}

function contextOf(text, word) {
  const i = text.indexOf(word)
  if (i < 0) return ''
  return text.slice(Math.max(0, i - 22), i + word.length + 22).replace(/\s+/g, ' ').trim()
}

/* ---------------- 运行 ---------------- */

walk(ROOT)

const kb = function (n) { return (n / 1024).toFixed(1) + ' KB' }
const codeBytes = fileList.filter(function (f) { return !/\.html$/.test(f.rel) })
  .reduce(function (s, f) { return s + f.size }, 0)
const line = '─'.repeat(62)

console.log('')
console.log('简记 · 安全与合规体检')
console.log(line)
console.log('扫描文件 ' + filesScanned + ' 个 ｜ 小程序代码包 ' + kb(codeBytes) + '（不含预览版.html）')
console.log('微信包体上限 2 MB，当前占 ' + (codeBytes / 2097152 * 100).toFixed(1) + '%')
console.log('')

if (problems.length) {
  console.log('【必须修复】' + problems.length + ' 项')
  problems.forEach(function (p) {
    console.log('  ✗ [' + p.rule + '] ' + p.hit)
    console.log('      ' + p.file + (p.sample ? '  →  ' + p.sample : ''))
    console.log('      原因：' + p.why)
  })
  console.log('')
} else {
  console.log('【必须修复】无 —— 零外链、零越权接口、零动态执行、文案无金融与诱导类词')
  console.log('')
}

if (warnings.length) {
  console.log('【需人工确认】' + warnings.length + ' 项')
  warnings.forEach(function (w) {
    console.log('  ! ' + w.file + '  →  ' + w.hit)
    console.log('      ' + w.why)
  })
  console.log('')
}

if (process.argv.indexOf('--list') >= 0) {
  console.log('【文件清单】')
  fileList.sort(function (a, b) { return b.size - a.size }).forEach(function (f) {
    console.log('  ' + f.rel.padEnd(42) + kb(f.size).padStart(10))
  })
  console.log('')
}

console.log(line)
console.log(problems.length
  ? '结论：未通过。先修掉上面 ' + problems.length + ' 项再提审。'
  : '结论：通过。可以进入提审流程（别忘了 mp 后台的隐私协议与剪贴板勾选）。')
console.log(line)
console.log('')

process.exit(problems.length ? 1 : 0)
