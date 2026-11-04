import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstalledApp } from '../src/main/services/AppService'

/**
 * AppService 依赖 electron（图标 / 打开），这里只替换那几个 API，
 * 扫描、解析、排序这些都是纯文件逻辑，用临时目录真实地跑。
 */
const electron = vi.hoisted(() => {
  const emptyImage = () => ({ isEmpty: () => true, resize: () => ({ toDataURL: () => '' }) })
  return {
    emptyImage,
    getFileIcon: vi.fn(async (_file: string) => emptyImage()),
    createFromPath: vi.fn((_file: string) => emptyImage()),
    readShortcutLink: vi.fn((_shortcut: string) => ({ target: '', icon: '' })),
    openPath: vi.fn(async () => '')
  }
})

vi.mock('electron', () => ({
  app: {
    getLocale: () => 'zh-CN',
    getFileIcon: electron.getFileIcon
  },
  nativeImage: { createFromPath: electron.createFromPath },
  shell: { openPath: electron.openPath, readShortcutLink: electron.readShortcutLink }
}))

/** 假的 NativeImage：标记哪张图被取到了，方便断言用的是哪一个来源 */
function fakeImage(tag: string) {
  return {
    isEmpty: () => false,
    resize: () => ({ toDataURL: () => `data:image/png;base64,${tag}` })
  }
}

const {
  localizedValue,
  parseDesktopEntry,
  parseExecLine,
  rankApps,
  readWindowsIcon,
  resolveIconFile,
  scanBundleApps,
  scanDesktopApps,
  scanShortcutApps
} = await import('../src/main/services/AppService')

const DESKTOP = `[Desktop Entry]
Type=Application
Name=Kate
Name[zh_CN]=凯特
Comment=Advanced text editor
Comment[zh_CN]=高级文本编辑器
Exec=/usr/bin/kate -b %U
Icon=kate
Terminal=false
Categories=Utility;TextEditor;

[Desktop Action new]
Name=New Window
Exec=/usr/bin/kate --new
`

function app(overrides: Partial<InstalledApp> & { name: string }): InstalledApp {
  return {
    path: `/tmp/${overrides.name}.desktop`,
    comment: '',
    icon: null,
    keywords: [],
    exec: null,
    ...overrides
  }
}

describe('desktop 文件解析', () => {
  it('只读 [Desktop Entry] 段，同名键以第一个为准', () => {
    const entry = parseDesktopEntry(DESKTOP)

    expect(entry.Type).toBe('Application')
    expect(entry.Name).toBe('Kate')
    expect(entry.Exec).toBe('/usr/bin/kate -b %U')
    // [Desktop Action ...] 段里的 Name= 不覆盖主段
    expect(entry.Name).not.toBe('New Window')
  })

  it('按语言挑本地化字段，没有本地化时退回原字段', () => {
    const entry = parseDesktopEntry(DESKTOP)

    expect(localizedValue(entry, 'Name', 'zh-CN')).toBe('凯特')
    expect(localizedValue(entry, 'Comment', 'zh_CN')).toBe('高级文本编辑器')
    expect(localizedValue(entry, 'Name', 'en-US')).toBe('Kate')
    expect(localizedValue(entry, 'GenericName', 'zh-CN')).toBe('')
  })

  it('拆 Exec：处理引号与反斜杠，丢掉 %U / %f 这类占位符', () => {
    expect(parseExecLine('/usr/bin/kate -b %U')).toEqual({ command: '/usr/bin/kate', args: ['-b'] })
    expect(parseExecLine('"/opt/My App/run" --flag %F')).toEqual({
      command: '/opt/My App/run',
      args: ['--flag']
    })
    expect(parseExecLine('my-app --name=a\\ b %i')).toEqual({ command: 'my-app', args: ['--name=a b'] })
    expect(parseExecLine('my-app --file=%f')).toEqual({ command: 'my-app', args: [] })
    expect(parseExecLine('%U')).toBeNull()
    expect(parseExecLine('   ')).toBeNull()
  })
})

describe('扫描已安装应用', () => {
  let root: string
  let userDir: string
  let systemDir: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'da-apps-'))
    userDir = path.join(root, 'user', 'applications')
    systemDir = path.join(root, 'system', 'applications')
    await mkdir(userDir, { recursive: true })
    await mkdir(systemDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('只收可见的、能启动的应用，用户目录里的同名文件优先', async () => {
    await writeFile(path.join(userDir, 'kate.desktop'), DESKTOP)
    await writeFile(path.join(systemDir, 'kate.desktop'), DESKTOP.replace('Name=Kate', 'Name=System Kate'))
    await writeFile(
      path.join(systemDir, 'hidden.desktop'),
      '[Desktop Entry]\nType=Application\nName=Hidden\nExec=/usr/bin/hidden\nNoDisplay=true\n'
    )
    await writeFile(
      path.join(systemDir, 'internal.desktop'),
      '[Desktop Entry]\nType=Application\nName=Internal\nExec=/usr/bin/internal\nHidden=true\n'
    )
    await writeFile(
      path.join(systemDir, 'link.desktop'),
      '[Desktop Entry]\nType=Link\nName=Link\nURL=https://example.com\n'
    )
    await writeFile(
      path.join(systemDir, 'broken.desktop'),
      '[Desktop Entry]\nType=Application\nName=No Exec\nExec=\n'
    )
    await writeFile(path.join(systemDir, 'readme.txt'), 'not a desktop file')

    const apps = await scanDesktopApps([userDir, systemDir], 'zh-CN')

    expect(apps.map((item) => item.name)).toEqual(['凯特'])
    expect(apps[0]).toMatchObject({
      path: path.join(userDir, 'kate.desktop'),
      comment: '高级文本编辑器',
      icon: 'kate',
      exec: '/usr/bin/kate -b %U'
    })
    // 关键字带上桌面文件名与命令名，搜 "kate" / 文件名都能命中
    expect(apps[0].keywords).toContain('kate')
  })

  it('Windows 开始菜单：递归收 .lnk，跳过子目录里的重复项', async () => {
    const startMenu = path.join(root, 'start-menu')
    await mkdir(path.join(startMenu, 'Accessories'), { recursive: true })
    await writeFile(path.join(startMenu, 'Notepad.lnk'), '')
    await writeFile(path.join(startMenu, 'Accessories', 'Calculator.lnk'), '')
    await writeFile(path.join(startMenu, 'Accessories', 'notes.txt'), '')

    const apps = await scanShortcutApps([startMenu])

    expect(apps.map((item) => item.name).sort()).toEqual(['Calculator', 'Notepad'])
    expect(apps.find((item) => item.name === 'Calculator')?.path).toBe(
      path.join(startMenu, 'Accessories', 'Calculator.lnk')
    )
  })

  it('macOS：收 /Applications 下的 .app，含 Utilities 这类一层子目录', async () => {
    const applications = path.join(root, 'Applications')
    await mkdir(path.join(applications, 'Safari.app'), { recursive: true })
    await mkdir(path.join(applications, 'Utilities', 'Terminal.app'), { recursive: true })
    await mkdir(path.join(applications, 'not-an-app'), { recursive: true })

    const apps = await scanBundleApps([applications])

    expect(apps.map((item) => item.name).sort()).toEqual(['Safari', 'Terminal'])
    expect(apps.find((item) => item.name === 'Safari')?.path).toBe(path.join(applications, 'Safari.app'))
  })
})

describe('搜索排序', () => {
  const apps = [
    app({ name: 'Code' }),
    app({ name: 'Visual Studio Code', keywords: ['code'] }),
    app({ name: 'Codium', keywords: ['vscode'] }),
    app({ name: 'Files', keywords: ['dolphin'] })
  ]

  it('完全相同 > 前缀 > 包含 > 关键字命中', () => {
    const ranked = rankApps(apps, 'code', 10)

    expect(ranked.map((item) => item.name)).toEqual(['Code', 'Visual Studio Code', 'Codium'])
  })

  it('按关键字也能搜到，并遵守条数上限', () => {
    expect(rankApps(apps, 'dolphin', 10).map((item) => item.name)).toEqual(['Files'])
    expect(rankApps(apps, 'co', 2).map((item) => item.name)).toEqual(['Code', 'Codium'])
    expect(rankApps(apps, 'nothing', 10)).toEqual([])
    expect(rankApps(apps, '   ', 10)).toEqual([])
  })
})

describe('主题图标解析', () => {
  let root: string
  let dataDir: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'da-icons-'))
    dataDir = path.join(root, 'share')
    await mkdir(path.join(dataDir, 'icons', 'hicolor', '48x48', 'apps'), { recursive: true })
    await mkdir(path.join(dataDir, 'icons', 'Tela', 'scalable', 'apps'), { recursive: true })
    await mkdir(path.join(dataDir, 'pixmaps'), { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('按尺寸找主题图标，也支持 scalable 目录', async () => {
    await writeFile(path.join(dataDir, 'icons', 'hicolor', '48x48', 'apps', 'kate.png'), '')

    expect(await resolveIconFile('kate', [dataDir])).toBe(
      path.join(dataDir, 'icons', 'hicolor', '48x48', 'apps', 'kate.png')
    )

    await writeFile(path.join(dataDir, 'icons', 'Tela', 'scalable', 'apps', 'dolphin.svg'), '')
    expect(await resolveIconFile('dolphin', [dataDir])).toBe(
      path.join(dataDir, 'icons', 'Tela', 'scalable', 'apps', 'dolphin.svg')
    )
  })

  it('pixmaps 兜底，找不到返回 null', async () => {
    await writeFile(path.join(dataDir, 'pixmaps', 'legacy.png'), '')

    expect(await resolveIconFile('legacy', [dataDir])).toBe(path.join(dataDir, 'pixmaps', 'legacy.png'))
    expect(await resolveIconFile('missing', [dataDir])).toBeNull()
  })

  it('Icon= 是绝对路径时直接用它（补 .png / .svg 后缀）', async () => {
    const icon = path.join(root, 'my-icon.png')
    await writeFile(icon, '')

    expect(await resolveIconFile(icon, [dataDir])).toBe(icon)
    expect(await resolveIconFile(icon.replace('.png', ''), [dataDir])).toBe(icon)
    expect(await resolveIconFile(path.join(root, 'nope'), [dataDir])).toBeNull()
  })
})

/**
 * Windows 的图标只能靠 mock 验证（本机跑不了 Win32）：这里断言的是「取图标的顺序」，
 * 顺序错了就会出现「所有应用都是带小箭头的快捷方式图标」或者干脆没有图标。
 */
describe('Windows 快捷方式图标', () => {
  const shortcut = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Demo App.lnk'
  const target = 'C:\\Program Files\\Demo\\demo.exe'
  const iconFile = 'C:\\Program Files\\Demo\\demo.ico'

  beforeEach(() => {
    electron.getFileIcon.mockReset()
    electron.createFromPath.mockReset()
    electron.readShortcutLink.mockReset()
    electron.getFileIcon.mockImplementation(async () => electron.emptyImage())
    electron.createFromPath.mockImplementation(() => electron.emptyImage())
    electron.readShortcutLink.mockImplementation(() => ({ target: '', icon: '' }))
  })

  it('优先用目标程序自己的图标（不带快捷方式小箭头）', async () => {
    electron.readShortcutLink.mockImplementation(() => ({ target, icon: '' }))
    electron.getFileIcon.mockImplementation(async (file: string) =>
      file === target ? fakeImage('exe') : fakeImage('lnk')
    )

    expect(await readWindowsIcon(shortcut)).toBe('data:image/png;base64,exe')
  })

  it('快捷方式自带能直接读的图标文件时，用它而不是目标程序', async () => {
    electron.readShortcutLink.mockImplementation(() => ({ target, icon: iconFile }))
    electron.createFromPath.mockImplementation((file: string) =>
      file === iconFile ? fakeImage('ico') : electron.emptyImage()
    )

    expect(await readWindowsIcon(shortcut)).toBe('data:image/png;base64,ico')
  })

  it('目标程序取不到图标时退回 .lnk 自己的图标', async () => {
    electron.readShortcutLink.mockImplementation(() => ({ target, icon: '' }))
    electron.getFileIcon.mockImplementation(async (file: string) =>
      file === target ? electron.emptyImage() : fakeImage('lnk')
    )

    expect(await readWindowsIcon(shortcut)).toBe('data:image/png;base64,lnk')
  })

  it('读不出快捷方式（非 .lnk / 权限不足）时直接按文件取图标', async () => {
    electron.readShortcutLink.mockImplementation(() => {
      throw new Error('not a shortcut')
    })
    electron.getFileIcon.mockImplementation(async () => fakeImage('file'))

    expect(await readWindowsIcon(shortcut)).toBe('data:image/png;base64,file')
  })

  it('三条路都取不到时返回 null，交给渲染进程用内置图标', async () => {
    electron.readShortcutLink.mockImplementation(() => ({ target, icon: iconFile }))

    expect(await readWindowsIcon(shortcut)).toBeNull()
  })
})
