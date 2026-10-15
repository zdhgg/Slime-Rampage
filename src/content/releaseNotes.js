// CHANGELOG.md remains the single source of release history. Render as text,
// never HTML; verification notes are for maintainers rather than players.
const CATEGORY_LABELS = {
  Added: '新增内容',
  Changed: '调整优化',
  Fixed: '问题修复',
  'Known Limitations': '已知限制',
}

function plainText(text) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1')
}

export function parseReleaseNotes(markdown) {
  const releases = []
  let release
  let section
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})\s*$/)
    if (heading) {
      release = { version: heading[1], date: heading[2], summary: [], sections: [] }
      releases.push(release)
      section = undefined
      continue
    }
    if (!release || !line.trim()) continue
    if (line.startsWith('### ')) {
      const category = line.slice(4).trim()
      section = { title: CATEGORY_LABELS[category], items: [] }
      if (section.title) release.sections.push(section)
      continue
    }
    const text = plainText(line.trim().replace(/^- /, ''))
    if (!section) release.summary.push(text)
    else if (line.startsWith('- ')) section.items.push(text)
    else if (section.items.length) section.items[section.items.length - 1] += ` ${text}`
  }
  return releases
}
