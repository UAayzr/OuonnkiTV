import { fileURLToPath } from 'node:url'
import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const assetRows = []

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })

  await Promise.all(
    entries.map(async entry => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        await collectFiles(path)
        return
      }

      const fileStat = await stat(path)
      assetRows.push({
        path: relative(distDir, path).replaceAll('\\', '/'),
        size: fileStat.size,
      })
    }),
  )
}

const formatSize = size => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

try {
  await collectFiles(distDir)
} catch (error) {
  console.error('Unable to read dist output. Run a successful build first.')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

assetRows.sort((a, b) => b.size - a.size)

const totalSize = assetRows.reduce((sum, row) => sum + row.size, 0)
const topAssets = assetRows.slice(0, 20)

console.log('\nBundle asset summary')
console.log(`Total assets: ${assetRows.length}`)
console.log(`Total size: ${formatSize(totalSize)}`)
console.log('\nLargest assets:')
for (const row of topAssets) {
  console.log(`${formatSize(row.size).padStart(10)}  ${row.path}`)
}
