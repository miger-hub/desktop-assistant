/// <reference types="vite/client" />

import type { DesktopApi } from '../shared/ipc'

declare global {
  interface Window {
    desktop: DesktopApi
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

export {}
