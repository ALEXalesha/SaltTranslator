param([switch]$SkipTests)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$py = Join-Path $root ".venv\Scripts\python.exe"
$build = Join-Path $root "build"
$rt = Join-Path $build "runtime"
$appOut = Join-Path $build "app"
$version = (Get-Content (Join-Path $root "electron\package.json") -Raw | ConvertFrom-Json).version

function Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }

if (-not $SkipTests) {
    Step "Python tests"
    & $py -m pytest -q -p no:cacheprovider
    if ($LASTEXITCODE) { throw "pytest failed" }
}

Step "Python runtime $version"
if (Test-Path $build) { Remove-Item $build -Recurse -Force }
$base = (& $py -c "import sys; print(sys.base_prefix)").Trim()
$skipBase = "Lib\site-packages", "Lib\test", "Lib\idlelib", "Lib\tkinter", "Lib\turtledemo", "tcl", "Doc", "include", "libs", "Tools", "Scripts" |
    ForEach-Object { Join-Path $base $_ }
robocopy $base $rt /E /NFL /NDL /NJH /NJS /NP /XD @skipBase __pycache__ /XF *.pyc *.pdb | Out-Null
if ($LASTEXITCODE -ge 8) { throw "copying base Python failed: robocopy $LASTEXITCODE" }
# Dev-only packages stay out of the shipped runtime; so does uv's venv hook.
$devPackages = "pytest*", "_pytest", "hypothesis*", "_hypothesis*", "pluggy*", "iniconfig*", "sortedcontainers*"
robocopy (Join-Path $root ".venv\Lib\site-packages") (Join-Path $rt "Lib\site-packages") /E /NFL /NDL /NJH /NJS /NP /XD __pycache__ @devPackages /XF *.pyc "_virtualenv.*" | Out-Null
if ($LASTEXITCODE -ge 8) { throw "copying site-packages failed: robocopy $LASTEXITCODE" }
foreach ($dll in "msvcp140.dll", "msvcp140_1.dll", "msvcp140_2.dll", "vcruntime140.dll", "vcruntime140_1.dll", "concrt140.dll") {
    $src = Join-Path $env:SystemRoot "System32\$dll"
    if (-not (Test-Path (Join-Path $rt $dll)) -and (Test-Path $src)) { Copy-Item $src $rt }
}
Set-Content (Join-Path $rt "runtime.version") $version -NoNewline -Encoding ascii

Step "Runtime self-check"
& (Join-Path $rt "python.exe") -E -s -c "import sys, ctranslate2, gradio, transformers, sentencepiece; assert ctranslate2.__file__.startswith(sys.prefix), ctranslate2.__file__; print('runtime ok', sys.version.split()[0])"
if ($LASTEXITCODE) { throw "runtime self-check failed" }

Step "runtime.zip"
tar -a -c -f (Join-Path $build "runtime.zip") -C $rt .
if ($LASTEXITCODE) { throw "tar failed" }
New-Item -ItemType Directory -Force $appOut | Out-Null
"app.py", "core.py", "languages.py", "nllb_languages.py" | ForEach-Object { Copy-Item (Join-Path $root $_) $appOut }

Step "Electron"
Push-Location (Join-Path $root "electron")
try {
    if (-not (Test-Path "node_modules\electron\dist\electron.exe")) {
        npm install --prefer-offline --no-audit --no-fund
        if ($LASTEXITCODE) { throw "npm install failed" }
        node node_modules\electron\install.js
        if ($LASTEXITCODE) { throw "electron binary install failed" }
    }
    if (-not $SkipTests) {
        npm test
        if ($LASTEXITCODE) { throw "node tests failed" }
    }
    npx electron-builder --win nsis portable
    if ($LASTEXITCODE) { throw "electron-builder failed" }
} finally {
    Pop-Location
}

Step "Done"
Get-ChildItem (Join-Path $root "dist") -Filter *.exe | Format-Table Name, @{ n = "MB"; e = { [math]::Round($_.Length / 1MB) } }
