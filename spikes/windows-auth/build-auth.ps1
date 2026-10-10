# Auth spike (throwaway): builds Supabase Auth for Windows from the clone in F:\spikes-tools\src\auth.
# Go and everything it writes (module cache, build cache, settings, telemetry) stay in F:\spikes-tools.
# No ErrorActionPreference = 'Stop': Windows PowerShell 5.1 then treats Go's progress messages on
# stderr ("go: downloading ...") as errors. The exit code is checked instead.
$Tools = 'F:\spikes-tools'

$env:PATH = "$Tools\go\bin;$env:PATH"
$env:GOROOT = "$Tools\go"
$env:GOPATH = "$Tools\gopath"
$env:GOMODCACHE = "$Tools\gopath\pkg\mod"
$env:GOCACHE = "$Tools\gocache"
$env:GOENV = "$Tools\goenv"
$env:GOTOOLCHAIN = 'local'
# Upstream builds only Linux and macOS, all with CGO off (Makefile); same here for Windows.
$env:CGO_ENABLED = '0'
# Go keeps telemetry under the user config folder; point those folders into the tools folder too.
$env:APPDATA = "$Tools\appdata"
$env:LOCALAPPDATA = "$Tools\localappdata"
New-Item -ItemType Directory -Force "$Tools\appdata", "$Tools\localappdata", "$Tools\auth" | Out-Null

Set-Location "$Tools\src\auth"
$version = (git describe --tags)
# v2.197.0 does not compile for Windows: cmd/serve_cmd.go sets SO_REUSEPORT through
# golang.org/x/sys/unix. The patch moves that into listen_unix.go and adds a plain
# listen_windows.go. Applied once; skipped when it is already in the tree.
$patch = Join-Path $PSScriptRoot 'auth-windows.patch'
git apply --reverse --check $patch 2>$null
if ($LASTEXITCODE -ne 0) {
  git apply $patch
  if ($LASTEXITCODE -ne 0) { throw 'auth-windows.patch did not apply' }
}
go build -trimpath -ldflags "-X github.com/supabase/auth/internal/utilities.Version=$version" -o "$Tools\auth\auth.exe" .
if ($LASTEXITCODE -ne 0) { throw "go build failed ($LASTEXITCODE)" }
& "$Tools\auth\auth.exe" version
