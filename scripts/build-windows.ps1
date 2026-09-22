[CmdletBinding()]
param([switch]$PortableOnly, [string]$IsccPath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) {
    throw 'Ejecuta este proceso en Windows x64, no en macOS ni WSL.'
}
$repo = Split-Path -Parent $PSScriptRoot
$package = Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'La version debe usar el formato X.Y.Z, sin sufijos.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$nodeVersion = (& $node -p 'process.version').Trim()
$arch = (& $node -p 'process.arch').Trim()
if ($nodeVersion -notmatch '^v22\.\d+\.\d+$' -or $arch -ne 'x64') { throw 'Instala Node.js 22 x64 para construir esta version.' }
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw 'No se encontro el compilador de .NET Framework 4.x incluido en Windows.' }
if (-not $PortableOnly) {
    if (-not $IsccPath) {
        $candidates = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe")
        $IsccPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    }
    if (-not $IsccPath -or -not (Test-Path $IsccPath)) { throw 'Instala Inno Setup 6.3 o superior, o indica -IsccPath. Para generar solo el ZIP usa npm run build:windows:portable.' }
}
$temp = Join-Path ([IO.Path]::GetTempPath()) ('printer-build-' + [Guid]::NewGuid().ToString('N'))
$output = Join-Path $repo ('dist\windows\' + $version)
$bundle = Join-Path $temp 'PrinterServer'
$app = Join-Path $bundle 'app'
$runtime = Join-Path $bundle 'runtime'
New-Item -ItemType Directory -Path $app, $runtime, $output -Force | Out-Null
try {
    Push-Location $repo
    try {
        & $npm ci
        if ($LASTEXITCODE -ne 0) { throw 'Fallo npm ci.' }
        & $npm test
        if ($LASTEXITCODE -ne 0) { throw 'Las pruebas fallaron. No se generara la aplicacion.' }
    } finally { Pop-Location }

    # Use the exact Node version tested above. Verify its official Windows archive.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $archiveName = "node-$nodeVersion-win-x64.zip"
    $baseUrl = "https://nodejs.org/dist/$nodeVersion"
    $archive = Join-Path $temp $archiveName
    Invoke-WebRequest "$baseUrl/$archiveName" -OutFile $archive -UseBasicParsing
    $checksums = (Invoke-WebRequest "$baseUrl/SHASUMS256.txt" -UseBasicParsing).Content
    $checksumLine = ($checksums -split "`n" | Where-Object { $_.Trim().EndsWith('  ' + $archiveName) } | Select-Object -First 1)
    if (-not $checksumLine) { throw 'No se encontro el SHA256 oficial de Node.js.' }
    $expected = ($checksumLine.Trim() -split '\s+')[0]
    if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected.ToLowerInvariant()) { throw 'El archivo de Node.js no coincide con su SHA256.' }
    Expand-Archive $archive -DestinationPath $temp
    $nodeFolder = Join-Path $temp "node-$nodeVersion-win-x64"
    Copy-Item (Join-Path $nodeFolder 'node.exe') $runtime
    Copy-Item (Join-Path $nodeFolder 'LICENSE') (Join-Path $runtime 'LICENSE-Node.txt')
    Copy-Item (Join-Path $repo 'src') $app -Recurse
    Copy-Item (Join-Path $repo 'package.json'), (Join-Path $repo 'package-lock.json') $app
    Copy-Item (Join-Path $repo 'docs\WINDOWS.md') (Join-Path $bundle 'LEEME-WINDOWS.md')
    Push-Location $app
    try {
        & $npm ci --omit=dev
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias de Windows.' }
        # Load the real serial binding using the bundled runtime before packaging.
        $smoke = Join-Path $app '.build-smoke.mjs'
        'import { SerialPort } from "serialport"; await SerialPort.list(); console.log("Serial driver OK");' | Set-Content $smoke -Encoding UTF8
        & (Join-Path $runtime 'node.exe') $smoke
        if ($LASTEXITCODE -ne 0) { throw 'El controlador serial no carga en el runtime incluido.' }
        Remove-Item $smoke
    } finally { Pop-Location }
    $assemblyInfo = Join-Path $temp 'AssemblyInfo.cs'
    "[assembly: System.Reflection.AssemblyVersion(`"$version.0`")]`n[assembly: System.Reflection.AssemblyFileVersion(`"$version.0`")]" | Set-Content $assemblyInfo -Encoding UTF8
    & $csc /nologo /target:winexe /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/out:$bundle\PrinterServer.exe" (Join-Path $repo 'windows\Launcher.cs') $assemblyInfo
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar el lanzador Windows.' }
    @{ appVersion = $version; nodeVersion = $nodeVersion; architecture = 'x64'; builtAt = [DateTime]::UtcNow.ToString('o'); lockfileSha256 = (Get-FileHash (Join-Path $app 'package-lock.json')).Hash } | ConvertTo-Json | Set-Content (Join-Path $bundle 'build-info.json') -Encoding UTF8
    Compress-Archive -Path $bundle -DestinationPath (Join-Path $output "PrinterServer-$version-windows-x64-portable.zip") -Force
    if (-not $PortableOnly) {
        & $IsccPath "/DAppVersion=$version" "/DBundleDir=$bundle" "/DArtifactDir=$output" (Join-Path $repo 'windows\installer.iss')
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar el instalador.' }
    }
    Get-ChildItem $output -File | Where-Object { $_.Extension -in '.zip', '.exe' } | ForEach-Object {
        $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $($_.Name)"
    } | Set-Content (Join-Path $output 'SHA256SUMS.txt') -Encoding ASCII
    Write-Host "Generacion terminada. Archivos en: $output"
} finally {
    # Only delete this build's unique temporary directory, never repository/user state.
    if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
}
