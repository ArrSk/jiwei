/**
 * 检查文件是否被"编码写坏"或"行被并在一起"。
 *
 * 背景：本项目多次因用 PowerShell 的 Set-Content 改写 UTF-8 文件而产生乱码，
 * 严重时注释与代码会被并成一行，直接造成语法错误。这个脚本用于快速体检。
 *
 * 用法： node scripts/check-encoding.mjs [文件...]
 */
import { readFileSync } from 'node:fs'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('用法: node scripts/check-encoding.mjs <文件...>')
  process.exit(2)
}

/**
 * UTF-8 被按 GBK 解读后产生的**特征字符**。
 *
 * 这里刻意只放正常中文里极罕见的码位 —— 早先的集合里混进了「锦」「镇」这类
 * 常用字，导致文档里的正常中文（如"锦上添花"）被误报为乱码。
 * 宁可少报，也不要把好文件标成坏的。
 */
const MOJIBAKE_CHARS = /[\u9518\u9428\u9540\u9522\u93b5\u93c4\u951b\u9429\u93a9\u93f4]/g

let bad = 0
for (const file of files) {
  let buf
  try {
    buf = readFileSync(file)
  } catch (err) {
    console.log(`MISS ${file}: ${err.message}`)
    bad += 1
    continue
  }

  // BOM 会让工具链把首行当乱码（GitHub/编辑器/grep 都可能误判），必须查
  const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
  const text = buf.toString('utf8')

  const replacement = [...text].filter((c) => c === '\uFFFD').length
  const mojibake = (text.match(MOJIBAKE_CHARS) ?? []).length
  // 注释与标签被并到同一行（代码被写坏的典型特征）。
  // 两条注意：
  //   1. 排除 URL 里的 `https://`，否则文档里的链接会误报
  //   2. 只认真正的 JSX/HTML 标签名 —— 不能用 `<[A-Za-z]`，
  //      否则注释里的文件占位符（如 data/notes/<id>.md）会被误判
  const JSX_TAG = /<(span|div|p|a|button|input|select|label|table|tr|td|ul|li|svg|img|form|h[1-6])\b/i
  const mergedLines = text
    .split(/\r?\n/)
    .filter((line) => {
      const withoutUrls = line.replace(/https?:\/\/\S+/g, '')
      const idx = withoutUrls.indexOf('//')
      return idx >= 0 && JSX_TAG.test(withoutUrls.slice(idx))
    }).length

  const problems = []
  if (hasBom) problems.push('含 BOM')
  if (replacement > 0) problems.push(`替换字符=${replacement}`)
  if (mojibake > 0) problems.push(`乱码字符=${mojibake}`)
  if (mergedLines > 0) problems.push(`注释与标签同行=${mergedLines}`)

  if (problems.length > 0) {
    bad += 1
    console.log(`BAD  ${file}  ${problems.join(' ')}`)
  } else {
    console.log(`ok   ${file}`)
  }
}

console.log(bad === 0 ? '\n全部正常' : `\n有 ${bad} 个文件存在问题`)
process.exit(bad === 0 ? 0 : 1)
