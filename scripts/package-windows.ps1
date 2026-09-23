param(
  [ValidateSet('Portable', 'Installer', 'All')]
  [string]$Format = 'All'
)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$package = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'package.json') | ConvertFrom-Json
$releaseVersion = $package.version
if ($releaseVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'La versión debe tener formato numérico X.Y.Z para el instalador.' }
$isccPath = $null
if ($Format -ne 'Portable') {
  $candidates = @()
  if ($env:INNO_SETUP_COMPILER) { $candidates += $env:INNO_SETUP_COMPILER }
  $compilerCommand = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($compilerCommand) { $candidates += $compilerCommand.Source }
  foreach ($base in @(${env:ProgramFiles(x86)}, $env:ProgramFiles, (Join-Path $env:LOCALAPPDATA 'Programs'))) {
    if ($base) {
      foreach ($folder in @('Inno Setup 6', 'Inno Setup 7')) {
        $candidates += Join-Path (Join-Path $base $folder) 'ISCC.exe'
      }
    }
  }
  $isccPath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if (-not $isccPath) { throw 'Instala Inno Setup 6.3 o superior desde https://jrsoftware.org/isdl.php o define INNO_SETUP_COMPILER con la ruta completa a ISCC.exe.' }
}
$pnpmCommand = Get-Command pnpm.cmd -ErrorAction Stop
Push-Location $projectRoot
try {
  # Siempre compilar desde las fuentes actuales, nunca reutilizar el EXE histórico.
  & $pnpmCommand.Source build:exe
  if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación del ejecutable. No se crearon paquetes de esta ejecución.' }
  $exePath = Join-Path $projectRoot 'dist\windows\printer-server.exe'
  if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) { throw 'No se encontró el ejecutable generado.' }
  $releaseDir = Join-Path $projectRoot 'dist\release'
  New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
  $artifacts = @()
  if ($Format -ne 'Installer') {
    # Solo archivos explícitos: nunca incluir configuración ni registros locales.
    $archivePath = Join-Path $releaseDir ('PrinterServer-' + $releaseVersion + '-windows-x64-portable.zip')
    Compress-Archive -LiteralPath $exePath, (Join-Path $projectRoot 'packaging\windows\LEEME.txt') -DestinationPath $archivePath -Force
    $artifacts += $archivePath
  }
  if ($Format -ne 'Portable') {
    & $isccPath "/DAppVersion=$releaseVersion" "/DProjectRoot=$projectRoot" (Join-Path $projectRoot 'packaging\windows\printer-server.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Falló la generación del instalador.' }
    $setupPath = Join-Path $releaseDir ('PrinterServer-' + $releaseVersion + '-windows-x64-setup.exe')
    if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) { throw 'No se encontró el instalador generado.' }
    $artifacts += $setupPath
  }
  # Cada entrega tiene su propia suma; no mezcla resultados de otras ejecuciones.
  foreach ($artifact in $artifacts) {
    # Compatible con Windows PowerShell 5.1 y PowerShell 7 sin autoload de módulos.
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $artifactStream = [System.IO.File]::OpenRead($artifact)
      try {
        $hash = [System.BitConverter]::ToString($sha256.ComputeHash($artifactStream)).Replace('-', '').ToLowerInvariant()
      } finally { $artifactStream.Dispose() }
    } finally { $sha256.Dispose() }
    ($hash + '  ' + [System.IO.Path]::GetFileName($artifact)) | Set-Content -LiteralPath ($artifact + '.sha256') -Encoding ascii
    Write-Output ('Generado: ' + $artifact)
  }
  Write-Output 'Paquetes generados sin ejecutar la aplicación. Pendientes de validación manual y firma.'
} finally { Pop-Location }


