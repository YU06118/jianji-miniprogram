/**
 * sync 云函数（阶段 4）：服务端执行后写为准 + 墓碑合并，按 openid 隔离。
 * 集合：accounts / records / budgets；权限「仅创建者可读写」。
 *
 * 两个 action：
 * - probe：返回远端轻量游标（_id + 更新时间），供客户端算真实增量；
 * - sync：接收客户端增量，与云端合并后写回，返回合并后的全量。
 *
 * 策略与客户端 sync-merge.service.ts 一致：
 * - 按 _id 合并，取 updatedAt 较大者（优先 updatedAtMs）；
 * - 墓碑（isDeleted=true）同样参与，较新者胜出，防止已删记录复活；
 * - 时间相同以「上传方（客户端）优先」，保证离线写入不被覆盖；
 * - 同 _id 唯一，不产生重复记录。
 *
 * 数据安全（RISK-01 修复）：
 * - 写入改为按 _id upsert（doc.set，记录不存在则创建），不再「先删后写」，
 *   从根本上消除 add 中途失败导致的数据丢失风险；
 * - 不再对集合做 where().remove() 批量删除——墓碑需保留，物理删除反而错误；
 * - 分批写入（BATCH=20）规避单次批量限制与云函数时长。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTIONS = ['accounts', 'records', 'budgets'];
const BATCH = 20;

function updatedMs(item) {
  if (typeof item.updatedAtMs === 'number' && Number.isFinite(item.updatedAtMs)) return item.updatedAtMs;
  if (typeof item.updatedAt === 'string') {
    const parsed = Date.parse(item.updatedAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function mergeCollection(remote, incoming) {
  const map = new Map();
  remote.forEach((r) => map.set(r._id, r));
  incoming.forEach((item) => {
    const existing = map.get(item._id);
    if (!existing || updatedMs(item) >= updatedMs(existing)) {
      // 同 _id：传入方时间更新或相等 → 覆盖（时间相等以客户端为准）
      map.set(item._id, item);
    }
  });
  return Array.from(map.values());
}

async function fetchAll(collection, openid, fields) {
  const MAX = 1000;
  let skip = 0;
  const all = [];
  for (;;) {
    let query = db.collection(collection).where({ _openid: openid }).skip(skip).limit(MAX);
    if (fields) query = query.field(fields);
    const res = await query.get();
    all.push(...res.data);
    if (res.data.length < MAX) break;
    skip += MAX;
  }
  return all;
}

/** 按 _id upsert：存在则替换，不存在则创建。分批并行写入。 */
async function upsertAll(collection, openid, items) {
  const col = db.collection(collection);
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    await Promise.all(
      batch.map((item) => {
        const doc = { ...item, _openid: openid };
        const id = doc._id;
        delete doc._id;
        // doc(id).set() 为 upsert 语义：不存在则新建，存在则替换
        return col.doc(id).set({ data: doc });
      }),
    );
  }
  return items.length;
}

/** probe：返回远端轻量游标，供客户端算真实增量 */
async function probe(openid) {
  const cursor = {};
  for (const name of COLLECTIONS) {
    const docs = await fetchAll(name, openid, { _id: true, updatedAt: true, updatedAtMs: true });
    cursor[name] = docs.map((d) => ({
      _id: d._id,
      updatedAt: d.updatedAt || '',
      updatedAtMs: d.updatedAtMs || 0,
    }));
  }
  return { success: true, cursor };
}

/** sync：接收增量 → 与云端全量合并 → upsert 写回 → 返回合并全量 */
async function sync(openid, incomingPayload) {
  const result = {};
  for (const name of COLLECTIONS) {
    const incoming = Array.isArray(incomingPayload[name]) ? incomingPayload[name] : [];
    const remote = await fetchAll(name, openid);
    const merged = mergeCollection(remote, incoming);
    await upsertAll(name, openid, merged);
    result[name] = merged;
  }
  return { success: true, payload: result };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: 'unauthorized' };
  try {
    if (event.action === 'probe') return await probe(OPENID);
    if (event.action === 'sync') return await sync(OPENID, event.payload || {});
    return { success: false, error: 'unknown action' };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
};
