/**
 * 托盘图标（32×32 PNG，内嵌 base64）。
 *
 * 图标很小、只有一个，内嵌进代码比多一个二进制资源文件更好维护：
 * 打包时不用额外配置 buildResources，也不会因为路径问题在打包产物里找不到图标。
 * 图形是一个圆角方块 + 白色文件夹，和应用的定位一致。
 */
export const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAX0lEQVR42u3XuQ0AIAwDwCzGaszJNtDRgCJA+VBsKbWvjImYlNq6xNFNpEqfMNrlLMKqfIuwLl8QuQFe5RMRGnASANQA0gEAAAAAAOA/QIqvCE9pnGESYpqFGKce83wAwoD+zcUSey0AAAAASUVORK5CYII='
