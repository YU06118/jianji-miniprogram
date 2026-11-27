/**
 * 静态走查脚本（阶段 5）：把前几阶段手工执行的静态检查固化为一键可跑。
 * 覆盖：wxss 硬编码色值、生产 TS 色值硬编码、TS any、JSON 合法性、
 * 组件/页面四件套、云函数语法、cloudfunctionRoot 配置。
 * 不依赖第三方库，Node >=18。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MINI = path.join(ROOT, 'miniprogram');
let failures = 0;

function report(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ' - ' + detail : ''}`);
  if (!ok) failures += 1;
}

function walk(dir, suffix) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'miniprogram_npm') continue;
      out.push(...walk(full, suffix));
    } else if (entry.name.endsWith(suffix)) {
      out.push(full);
    }
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

// 1. wxss 硬编码色值（theme.wxss 是唯一色值来源）
const wxss = walk(MINI, '.wxss').filter((f) => !f.endsWith('theme.wxss'));
const wxssBad = [];
for (const f of wxss) {
  const text = fs.readFileSync(f, 'utf8');
  const m = text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g);
  if (m) wxssBad.push(`${rel(f)}: ${m.join(', ')}`);
}
report('wxss 零硬编码色值', wxssBad.length === 0, wxssBad.join(' | '));

// 2. 生产 TS 色值硬编码（排除 tokens.ts / 测试）
const ts = walk(MINI, '.ts').filter(
  (f) => !f.endsWith('tokens.ts') && !f.includes(`${path.sep}__tests__${path.sep}`),
);
const tsBad = [];
for (const f of ts) {
  const m = fs.readFileSync(f, 'utf8').match(/#[0-9a-fA-F]{6}\b/g);
  if (m) tsBad.push(`${rel(f)}: ${m.join(', ')}`);
}
report('生产 TS 零色值硬编码', tsBad.length === 0, tsBad.join(' | '));

// 3. TS 零 any（BUG-01 修复：改用 ESLint no-explicit-any，避免正则误判注释/乘法同行）
let anyOk = true;
let anyDetail = '';
try {
  execFileSync(
    process.execPath,
    [
      path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js'),
      'miniprogram/**/*.ts',
      '--rule',
      JSON.stringify({ '@typescript-eslint/no-explicit-any': 'error' }),
      '--quiet',
    ],
    { cwd: ROOT, stdio: 'pipe' },
  );
} catch (e) {
  anyOk = false;
  anyDetail = String(e.stdout || e.stderr || e.message).trim().split('\n').slice(0, 5).join(' | ');
}
report('TS 零 any', anyOk, anyDetail);

// 4. JSON 合法性
const jsonBad = [];
for (const f of [...walk(MINI, '.json'), ...walk(path.join(ROOT, 'cloudfunctions'), '.json'), path.join(ROOT, 'project.config.json')]) {
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    jsonBad.push(`${rel(f)}: ${e.message}`);
  }
}
report('所有 JSON 合法', jsonBad.length === 0, jsonBad.join(' | '));

// 5. 组件/页面四件套
const incomplete = [];
for (const base of [path.join(MINI, 'components'), path.join(MINI, 'pages'), path.join(MINI, 'subpackages')]) {
  for (const dir of walk(base, '.ts')) {
    const stem = dir.slice(0, -3);
    for (const ext of ['.json', '.wxml', '.wxss']) {
      if (!fs.existsSync(stem + ext)) incomplete.push(`${rel(stem)}${ext}`);
    }
  }
}
report('组件/页面四件套完整', incomplete.length === 0, incomplete.join(', '));

// 6. 云函数语法
const cfEntry = path.join(ROOT, 'cloudfunctions', 'sync', 'index.js');
let cfOk = true;
let cfDetail = '';
try {
  execFileSync(process.execPath, ['--check', cfEntry], { stdio: 'pipe' });
} catch (e) {
  cfOk = false;
  cfDetail = String(e.stderr || e.message);
}
report('云函数语法', cfOk, cfDetail);

// 7. cloudfunctionRoot 配置
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
report('cloudfunctionRoot 已配置', cfg.cloudfunctionRoot === 'cloudfunctions/', String(cfg.cloudfunctionRoot));

console.log(`\n静态走查：${failures === 0 ? '全部通过' : failures + ' 项失败'}`);
process.exit(failures === 0 ? 0 : 1);
