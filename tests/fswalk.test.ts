import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectFiles, collectPreserved } from '../electron/core/fswalk'
import { packagesDir, resolvePackagePath } from '../electron/core/paths'

let tmp: string

function write(rel: string, content = 'x'): void {
  const p = path.join(tmp, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jz-fswalk-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('collectFiles', () => {
  it('递归收集并跳过排除项(目录不下钻)', () => {
    write('a.txt')
    write('sub/b.txt')
    write('node_modules/c.txt')
    write('.dot/d.txt')
    const rels = collectFiles(tmp, ['node_modules']).map(f => f.rel.replace(/\\/g, '/')).sort()
    expect(rels).toEqual(['.dot/d.txt', 'a.txt', 'sub/b.txt'])
  })
  it('空模式收集全部', () => {
    write('a.txt')
    write('sub/b.txt')
    expect(collectFiles(tmp, []).length).toBe(2)
  })
  it('./ 锚定只排根层文件，子目录同名保留', () => {
    write('foo.log')
    write('sub/foo.log')
    const rels = collectFiles(tmp, ['./foo.log']).map(f => f.rel.replace(/\\/g, '/')).sort()
    expect(rels).toEqual(['sub/foo.log'])
  })
  it('裸名字排除所有层级同名（对比 ./ 锚定）', () => {
    write('foo.log')
    write('sub/foo.log')
    write('keep.txt')
    const rels = collectFiles(tmp, ['foo.log']).map(f => f.rel.replace(/\\/g, '/')).sort()
    expect(rels).toEqual(['keep.txt'])
  })
})

describe('collectPreserved', () => {
  it('收集匹配的文件与目录(目录整体保留、不下钻)', () => {
    write('config.json')
    write('other.txt')
    write('keepdir/inner.txt')
    const rels = collectPreserved(tmp, ['config.json', 'keepdir']).map(f => f.rel.replace(/\\/g, '/')).sort()
    expect(rels).toEqual(['config.json', 'keepdir'])
  })
  it('空模式返回空', () => {
    write('a.txt')
    expect(collectPreserved(tmp, [])).toEqual([])
  })
})

describe('paths', () => {
  it('packagesDir 创建并返回 packages 子目录', () => {
    const dir = packagesDir(tmp)
    expect(dir).toBe(path.join(tmp, 'packages'))
    expect(fs.existsSync(dir)).toBe(true)
  })
  it('resolvePackagePath 相对路径挂到 packages,绝对路径原样', () => {
    expect(resolvePackagePath(tmp, 'a.zip')).toBe(path.join(tmp, 'packages', 'a.zip'))
    expect(resolvePackagePath(tmp, 'C:\\abs\\b.zip')).toBe(path.normalize('C:\\abs\\b.zip'))
  })
})
