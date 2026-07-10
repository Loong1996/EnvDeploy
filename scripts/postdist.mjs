// dist 后置：把 electron-builder 产出的 release/win-unpacked 重命名为
// EnvDeploy-<YYYYMMDD>-<随机码>，每次构建得到唯一文件夹，避免覆盖历史构建。
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const PRODUCT = 'EnvDeploy'
const releaseDir = path.resolve('release')
const src = path.join(releaseDir, 'win-unpacked')

if (!fs.existsSync(src)) {
  console.error(`[postdist] 未找到 ${src}，请先运行 electron-builder。`)
  process.exit(1)
}

const d = new Date()
const stamp =
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
const rand = randomBytes(3).toString('hex') // 6 位随机码，防重名
const name = `${PRODUCT}-${stamp}-${rand}`
const dest = path.join(releaseDir, name)

fs.renameSync(src, dest)
console.log(`[postdist] 构建产物 -> release/${name}/`)
