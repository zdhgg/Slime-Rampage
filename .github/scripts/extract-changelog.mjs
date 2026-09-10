/**
 * CI 专用：从 CHANGELOG.md 提取指定版本的发布说明。
 *
 * 用法：node .github/scripts/extract-changelog.mjs v0.4.0 > release-notes.md
 * 退出码非 0 时（找不到条目 / 条目为空）由工作流中断，避免发出没有说明的 Release。
 */
import { readFileSync } from 'node:fs'

const version = (process.argv[2] || '').trim().replace(/^v/, '')
if (!version) {
  console.error('用法：node .github/scripts/extract-changelog.mjs <版本号，如 v0.4.0>')
  process.exit(1)
}

const changelog = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8')
const lines = changelog.split(/\r?\n/)

// 版本小节标题形如「## [0.4.0] - 2026-09-10」；标题内可能带空格，故用前缀匹配
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`))
if (start === -1) {
  console.error(`CHANGELOG.md 中找不到版本 ${version} 的条目（需要一节「## [${version}]」）`)
  process.exit(1)
}

let end = lines.length
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i].startsWith('## [')) {
    end = i
    break
  }
}

const body = lines.slice(start + 1, end).join('\n').trim()
if (!body) {
  console.error(`CHANGELOG.md 中 ${version} 的条目为空`)
  process.exit(1)
}

// 小节标题提升一级（### → ##）：CHANGELOG 为了在大文档里分层用三级，
// Release 说明是独立文档，沿用历史 Release 的二级标题样式
process.stdout.write(`${body.replace(/^### /gm, '## ')}\n`)
