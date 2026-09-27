/**
 * 设置 GitHub 仓库信息：简介、主页、标签（topics）。
 *
 * 为什么用脚本而不是手点网页：简介与标签都是结构化的，脚本能保证一次设对、以后可重复执行。
 *
 * 需要令牌：私有仓库的元信息只能带权限访问。
 * 首次使用请在 PowerShell 里设置环境变量（只影响当前窗口，不写入任何文件）：
 *
 *   $env:GITHUB_TOKEN = "ghp_你的令牌"
 *   node scripts/github-meta.mjs
 *
 * 令牌需要勾选 `repo` 权限（经典令牌）或给仓库 Administration 权限（细粒度令牌）。
 * 脚本不会保存、不会打印令牌内容。
 *
 * 用法：
 *   node scripts/github-meta.mjs            # 应用下面的设置
 *   node scripts/github-meta.mjs --dry-run  # 只看会改成什么，不实际调用
 */
const OWNER = 'ArrSk'
const REPO = 'jiwei'

/**
 * 简介。
 * 留空 = **不改动你已经在网页上设置好的简介**（避免覆盖你的措辞）。
 * 想用下面的文案覆盖，就在命令后加参数：--set-description
 */
const DESCRIPTION = ''
const DESCRIPTION_IF_REQUESTED =
  '面向大学生的课程表应用（网页 + 手机）。手机优先、离线可用、数据只存本机。React 19 + Vite + TypeScript 单仓多包。'

/** 主页链接：GitHub 仓库右上角那个可点的地址，指向在线 Demo */
const HOMEPAGE = `https://${OWNER.toLowerCase()}.github.io/${REPO}/`

/** 标签：GitHub 上用来分类与搜索的关键词，最多 20 个，只能用字母数字与连字符 */
const TOPICS = [
  'timetable',
  'schedule',
  'course-schedule',
  'student',
  'pwa',
  'react',
  'vite',
  'typescript',
  'indexeddb',
  'mobile-first',
  'offline-first',
  'local-first',
  'zod',
  'dexie',
  'monorepo',
  'college',
  'university',
  'china',
]

const dryRun = process.argv.includes('--dry-run')
/** 是否覆盖简介：默认不动，避免把你已经设好的文案冲掉 */
const wantDescription = process.argv.includes('--set-description')
const token = process.env.GITHUB_TOKEN

async function api(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { ok: res.ok, status: res.status, body }
}

console.log(`\nGitHub 仓库设置：${OWNER}/${REPO}\n`)
console.log('  将设置为：')
console.log(
  `    简介   ${wantDescription ? DESCRIPTION_IF_REQUESTED : '（保持不变，不动你已设置的）'}`,
)
if (HOMEPAGE) console.log(`    主页   ${HOMEPAGE}`)
console.log(`    标签   ${TOPICS.join(', ')}`)
console.log(`    共 ${TOPICS.length} 个标签\n`)

if (dryRun) {
  console.log('（--dry-run：没有实际调用 GitHub）\n')
  process.exit(0)
}

if (!token) {
  console.error(`✘ 没有找到令牌

  请在 PowerShell 里执行（把 ghp_xxx 换成你的令牌）：

    cd E:\\CodeAndProj\\jiwei
    $env:GITHUB_TOKEN = "ghp_xxx"; node scripts/github-meta.mjs

  令牌获取地址：https://github.com/settings/tokens
  选 "Generate new token (classic)"，勾选 \`repo\`，有效期选 7 天即可。
  脚本不会保存令牌 —— 关掉那个窗口就没了。
`)
  process.exit(2)
}

// 1) 简介（可选）与主页
const patchBody = {
  ...(wantDescription ? { description: DESCRIPTION_IF_REQUESTED } : {}),
  ...(HOMEPAGE ? { homepage: HOMEPAGE } : {}),
}
const patch = await api(`/repos/${OWNER}/${REPO}`, {
  method: 'PATCH',
  body: JSON.stringify(patchBody),
})
if (patch.ok) {
  const what = [wantDescription ? '简介' : null, HOMEPAGE ? '主页' : null].filter(Boolean)
  console.log(`  ✔ 已更新：${what.join('、')}`)
} else {
  console.error(`  ✘ 仓库信息更新失败（HTTP ${patch.status}）`)
  console.error(`    ${typeof patch.body === 'string' ? patch.body : patch.body?.message ?? ''}`)
  if (patch.status === 401) console.error('    → 令牌无效或已过期')
  if (patch.status === 403) console.error('    → 令牌权限不足，需要 repo 权限')
  if (patch.status === 404) console.error('    → 找不到仓库，或令牌没有访问权限')
}

// 2) 标签（这个接口要求整体替换）
const topics = await api(`/repos/${OWNER}/${REPO}/topics`, {
  method: 'PUT',
  body: JSON.stringify({ names: TOPICS }),
})
if (topics.ok) {
  console.log(`  ✔ 标签已更新（${topics.body?.names?.length ?? 0} 个）`)
} else {
  console.error(`  ✘ 标签更新失败（HTTP ${topics.status}）`)
  console.error(`    ${typeof topics.body === 'string' ? topics.body : topics.body?.message ?? ''}`)
}

console.log(`\n  查看：https://github.com/${OWNER}/${REPO}\n`)
