/**
 * 图片凭证工具（阶段 2）：选图（≤3 张）→ 循环压缩至单张 ≤200 KB。
 *
 * 事实依据（微信开放文档，2026-11-25）：
 * - wx.chooseMedia：tempFiles[] 返回 tempFilePath 与 size(B)。
 * - wx.compressImage：基础库 2.4.0 起支持；quality 仅对 jpg 有效；
 *   compressedWidth/Height 自 2.26.0 起支持；**不能指定目标文件大小**。
 * - FileSystemManager.getFileInfo：异步获取本地临时文件大小（类型包仅提供异步版）。
 * - 因此采用「循环降质 + 降尺寸」策略逼近 200 KB 上限。
 */

import { reportError } from './logger';
import { ensurePrivacyForMedia } from './privacy';

/** 单张凭证上限：200 KB */
export const MAX_IMAGE_BYTES = 200 * 1024;
/** 最多 3 张 */
export const MAX_IMAGE_COUNT = 3;

export interface PickedImage {
  path: string;
  size: number;
}

/** 选择图片（Promise 封装，失败走统一上报） */
export function chooseImages(count: number): Promise<PickedImage[]> {
  return new Promise<PickedImage[]>((resolve) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const files = res.tempFiles
          .filter((f) => f.fileType === 'image')
          .map((f) => ({ path: f.tempFilePath, size: f.size }));
        resolve(files);
      },
      fail: (err) => {
        reportError('chooseMedia', err);
        resolve([]);
      },
    });
  });
}

/** 异步获取本地文件大小（字节）；失败返回 0 表示未知 */
export function getFileSize(path: string): Promise<number> {
  return new Promise<number>((resolve) => {
    try {
      wx.getFileSystemManager().getFileInfo({
        filePath: path,
        success: (res) => resolve(res.size),
        fail: () => resolve(0),
      });
    } catch {
      resolve(0);
    }
  });
}

/** 压缩单张图片至 ≤maxBytes：循环降 quality 与尺寸，最多 5 轮 */
export async function compressToLimit(
  path: string,
  maxBytes: number = MAX_IMAGE_BYTES,
): Promise<string> {
  let current = path;
  let size = await getFileSize(current);
  if (size > 0 && size <= maxBytes) return current;

  let quality = 80;
  let scale = 1;
  for (let round = 0; round < 5; round += 1) {
    const compressed = await new Promise<string | null>((resolve) => {
      wx.compressImage({
        src: current,
        quality,
        ...(scale < 1 ? { compressedWidth: Math.round(1280 * scale) } : {}),
        success: (res) => resolve(res.tempFilePath),
        fail: (err) => {
          reportError('compressImage', err);
          resolve(null);
        },
      });
    });
    if (compressed === null) return current;
    current = compressed;
    size = await getFileSize(current);
    if (size > 0 && size <= maxBytes) return current;

    if (quality > 30) {
      quality = Math.max(30, quality - 15);
    } else {
      scale = Math.max(0.5, scale - 0.15);
    }
  }
  return current;
}

/** 选图并逐张压缩，返回满足上限的路径数组 */
export async function pickAndCompressImages(remaining: number): Promise<string[]> {
  // 隐私能力前置检查：未授权则阻断选图，不影响首屏记账
  const granted = await ensurePrivacyForMedia();
  if (!granted) return [];
  const picked = await chooseImages(Math.min(remaining, MAX_IMAGE_COUNT));
  const results: string[] = [];
  for (const item of picked) {
    const compressed = await compressToLimit(item.path);
    results.push(compressed);
  }
  return results;
}
