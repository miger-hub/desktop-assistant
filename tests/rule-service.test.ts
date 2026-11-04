import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTempDir, createTestContext, removeTempDir, type TestContext } from './helpers'

let context: TestContext
let root: string

beforeEach(async () => {
  context = createTestContext()
  root = await createTempDir()
})

afterEach(async () => {
  context.close()
  await removeTempDir(root)
})

/** 准备一个「源目录 + 目标目录」，源目录里放图片、文本、同名扩展名目录和隐藏文件 */
async function seed(): Promise<{ source: string; target: string }> {
  const source = path.join(root, 'source')
  const target = path.join(root, 'target')
  await mkdir(source, { recursive: true })
  await mkdir(target, { recursive: true })
  await writeFile(path.join(source, 'a.png'), 'x')
  await writeFile(path.join(source, 'b.JPG'), 'x')
  await writeFile(path.join(source, 'note.txt'), 'x')
  await writeFile(path.join(source, '.hidden.png'), 'x')
  await mkdir(path.join(source, 'folder.png'))
  return { source, target }
}

describe('RuleService', () => {
  it('新建的规则排在最前面（列表按 sort_order 升序）', async () => {
    const { source, target } = await seed()
    const create = (name: string) =>
      context.rules.create({ name, sourcePath: source, targetPath: target, matchType: 'extension', pattern: 'png' })

    create('第一条')
    create('第二条')
    create('第三条')

    expect(context.rules.list().map((rule) => rule.name)).toEqual(['第三条', '第二条', '第一条'])
  })

  it('按扩展名匹配：大小写不敏感，只挑普通文件', async () => {
    const { source, target } = await seed()
    const rule = context.rules.create({
      name: '图片',
      sourcePath: source,
      targetPath: target,
      matchType: 'extension',
      pattern: 'png, .jpg'
    })

    const [preview] = await context.rules.preview([rule.id])
    expect(preview.errors).toEqual([])
    expect(preview.matches.map((match) => match.name).sort()).toEqual(['a.png', 'b.JPG'])
    expect(preview.matches.every((match) => match.conflict === false)).toBe(true)
  })

  it('按名称关键字匹配（逗号分隔，任一命中）', async () => {
    const { source, target } = await seed()
    await writeFile(path.join(source, '截图 2026-09-22.png'), 'x')
    const rule = context.rules.create({
      name: '截图',
      sourcePath: source,
      targetPath: target,
      matchType: 'name',
      pattern: '截图, screenshot'
    })

    const [preview] = await context.rules.preview([rule.id])
    expect(preview.matches.map((match) => match.name)).toEqual(['截图 2026-09-22.png'])
  })

  it('执行后文件落到目标目录，并记录一次可撤销的批次', async () => {
    const { source, target } = await seed()
    const rule = context.rules.create({
      name: '图片',
      sourcePath: source,
      targetPath: target,
      matchType: 'extension',
      pattern: 'png,jpg'
    })

    const result = await context.rules.apply([rule.id])
    expect(result.succeeded.sort()).toEqual([
      path.join(target, 'a.png'),
      path.join(target, 'b.JPG')
    ])
    expect(result.failed).toEqual([])
    expect(result.batchId).not.toBeNull()
    expect(result.ruleNames).toEqual(['图片'])

    // 非命中的文件保持原样
    expect(await context.files.exists(path.join(source, 'note.txt'))).toBe(true)
    expect(await context.files.exists(path.join(source, 'folder.png'))).toBe(true)
    expect(await context.files.exists(path.join(source, '.hidden.png'))).toBe(true)

    // 历史里记下了这批移动，撤销后回到原位
    const batches = await context.operations.listBatches(10)
    expect(batches[0].origin).toBe('rule')
    expect(batches[0].count).toBe(2)

    const undone = await context.operations.undoLast()
    expect(undone?.result.succeeded).toHaveLength(2)
    expect(await context.files.exists(path.join(source, 'a.png'))).toBe(true)
    expect(await context.files.exists(path.join(target, 'a.png'))).toBe(false)
  })

  it('目标目录已有同名文件：预览标出冲突，执行时不覆盖、计为失败', async () => {
    const { source, target } = await seed()
    await writeFile(path.join(target, 'a.png'), 'existing')

    const rule = context.rules.create({
      name: '图片',
      sourcePath: source,
      targetPath: target,
      matchType: 'extension',
      pattern: 'png'
    })

    const [preview] = await context.rules.preview([rule.id])
    expect(preview.matches.find((match) => match.name === 'a.png')?.conflict).toBe(true)

    const result = await context.rules.apply([rule.id])
    expect(result.failed.map((item) => path.basename(item.path))).toEqual(['a.png'])
    // 目标目录里的原文件没有被覆盖，源文件也还在
    expect(await context.files.exists(path.join(source, 'a.png'))).toBe(true)
  })

  it('目录不存在时不执行，并给出可读原因', async () => {
    const { source } = await seed()
    const rule = context.rules.create({
      name: '坏规则',
      sourcePath: source,
      targetPath: path.join(root, 'missing'),
      matchType: 'extension',
      pattern: 'png'
    })

    const [preview] = await context.rules.preview([rule.id])
    expect(preview.matches).toEqual([])
    expect(preview.errors[0]).toContain('目标目录不存在')

    const result = await context.rules.apply([rule.id])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0].message).toContain('目标目录不存在')
    expect(result.batchId).toBeNull()
    expect(await context.files.exists(path.join(source, 'a.png'))).toBe(true)
  })

  it('源目录与目标目录相同、名称为空、匹配串非法都会被拒绝', async () => {
    const { source } = await seed()

    expect(() =>
      context.rules.create({
        name: '空转',
        sourcePath: source,
        targetPath: source,
        matchType: 'extension',
        pattern: 'png'
      })
    ).toThrow(/源目录与目标目录不能相同/)

    expect(() =>
      context.rules.create({
        name: '   ',
        sourcePath: source,
        targetPath: path.join(root, 'target'),
        matchType: 'extension',
        pattern: 'png'
      })
    ).toThrow(/规则名称不能为空/)

    expect(() =>
      context.rules.create({
        name: '空匹配',
        sourcePath: source,
        targetPath: path.join(root, 'target'),
        matchType: 'extension',
        pattern: '  '
      })
    ).toThrow(/匹配内容不能为空/)
  })

  it('不传 ids 时执行全部启用规则，忽略停用的规则', async () => {
    const { source, target } = await seed()
    const disabled = path.join(root, 'target2')
    await mkdir(disabled, { recursive: true })

    const on = context.rules.create({
      name: 'png',
      sourcePath: source,
      targetPath: target,
      matchType: 'extension',
      pattern: 'png'
    })
    context.rules.create({
      name: 'jpg',
      enabled: false,
      sourcePath: source,
      targetPath: disabled,
      matchType: 'extension',
      pattern: 'jpg'
    })

    const result = await context.rules.apply()
    expect(result.ruleNames).toEqual(['png'])
    expect(await context.files.exists(path.join(target, 'a.png'))).toBe(true)
    expect((await readdir(disabled)).length).toBe(0)
    expect(on.enabled).toBe(true)
  })
})
