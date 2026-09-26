# 直接调用各包的本地二进制，绕开 `pnpm -r` / `pnpm run`。
#
# 为什么：受限沙箱下 pnpm 用「管道 stdio」启动子进程会得到 spawn EPERM，
# 因此 `pnpm typecheck`、`pnpm test` 这类转发命令无法运行。直接执行 .bin 即可。
#
# 用法： pwsh -File scripts/verify.ps1

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$results = @()

function Invoke-Step {
  param([string]$Name, [string]$Exe, [string[]]$Args, [string]$WorkDir)
  Write-Output ""
  Write-Output "===== $Name ====="
  Push-Location $WorkDir
  & $Exe @Args
  $code = $LASTEXITCODE
  Pop-Location
  $script:results += [pscustomobject]@{ Step = $Name; Exit = $code }
  Write-Output "----- $Name exit=$code -----"
}

# 1) 各包类型检查（tsc 不做子进程派生，受限模式下也能跑）
foreach ($pkg in @('core', 'ui', 'platform', 'data')) {
  Invoke-Step "typecheck:$pkg" "$root\packages\$pkg\node_modules\.bin\tsc.CMD" @('--noEmit') "$root\packages\$pkg"
}
Invoke-Step "typecheck:web" "$root\apps\web\node_modules\.bin\tsc.CMD" @('--noEmit') "$root\apps\web"

# 2) 单元测试（需 esbuild 服务子进程 → 需要不受限环境）
foreach ($pkg in @('core', 'data')) {
  Invoke-Step "test:$pkg" "$root\packages\$pkg\node_modules\.bin\vitest.CMD" @('run', '--reporter=default') "$root\packages\$pkg"
}

# 3) 生产构建（Vite + PWA）
Invoke-Step "build:web" "$root\apps\web\node_modules\.bin\vite.CMD" @('build') "$root\apps\web"

Write-Output ""
Write-Output "================ 汇总 ================"
$results | Format-Table -AutoSize
$failed = ($results | Where-Object { $_.Exit -ne 0 }).Count
if ($failed -gt 0) {
  Write-Output "失败 $failed 项"
  exit 1
}
Write-Output "全部通过"
