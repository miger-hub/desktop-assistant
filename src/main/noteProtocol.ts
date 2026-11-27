import { promises as fs } from 'node:fs'
import { protocol } from 'electron'
import type { NoteDocumentService } from './services/NoteDocumentService'

export const NOTE_ASSET_SCHEME = 'workmeta-note'

// 必须在 app ready 之前注册，窗口里的 <img> 才能把本地附件当作安全资源加载。
protocol.registerSchemesAsPrivileged([
  {
    scheme: NOTE_ASSET_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
])

export function registerNoteAssetProtocol(notes: NoteDocumentService): void {
  protocol.handle(NOTE_ASSET_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'asset') return new Response('Not found', { status: 404 })

    const notePath = url.searchParams.get('note')
    const source = url.searchParams.get('src')
    if (!notePath || !source) return new Response('Bad request', { status: 400 })

    const asset = await notes.resolveAsset(notePath, source)
    if (!asset) return new Response('Not found', { status: 404 })

    try {
      const data = await fs.readFile(asset.path)
      return new Response(new Uint8Array(data), {
        headers: {
          'Content-Type': asset.mime,
          'Cache-Control': 'private, max-age=60'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
