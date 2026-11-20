import { existsSync } from 'node:fs'
import path from 'node:path'
import { nativeImage, type NativeImage } from 'electron'

/**
 * 托盘图标优先从 resources 文件加载。部分 Windows / Linux 环境下
 * `nativeImage.createFromDataURL` 会得到空图，托盘看起来就是“没有图标”；
 * data URL 只保留为最后兜底。
 */
function trayIconSize(): number {
  return process.platform === 'darwin' ? 18 : 22
}

function normalizeTrayIcon(image: NativeImage): NativeImage {
  const size = trayIconSize()
  return image.resize({ width: size, height: size, quality: 'best' })
}

export function createTrayIcon(): NativeImage {
  const candidates = [
    path.join(process.resourcesPath, 'resources', 'tray-icon.png'),
    path.join(process.cwd(), 'resources', 'tray-icon.png'),
    path.join(__dirname, '../../resources/tray-icon.png')
  ]

  for (const candidate of [...new Set(candidates)]) {
    if (!existsSync(candidate)) continue
    const image = nativeImage.createFromPath(candidate)
    if (!image.isEmpty()) return normalizeTrayIcon(image)
  }

  const fallback = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
  if (!fallback.isEmpty()) return normalizeTrayIcon(fallback)
  throw new Error('托盘图标资源无法加载')
}

/** 最后兜底用的 32×32 PNG；正常运行时优先使用 resources/tray-icon.png。 */
export const TRAY_ICON_DATA_URL =
  'data:image/png;base64,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'
