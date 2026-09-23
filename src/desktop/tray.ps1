param([int]$OwnerPid)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$context = New-Object System.Windows.Forms.ApplicationContext
$tray = New-Object System.Windows.Forms.NotifyIcon
$appIcon = [System.Drawing.Icon]::new((Join-Path $PSScriptRoot 'printer-server.ico'), 32, 32)
$tray.Icon = $appIcon
$tray.Text = 'Printer Server - servicio local activo'
$menu = New-Object System.Windows.Forms.ContextMenuStrip
function Send-Action([string]$action) {
  [Console]::Out.WriteLine($action)
  [Console]::Out.Flush()
}
$openItem = $menu.Items.Add('Abrir centro de impresion')
$openItem.add_Click({ Send-Action 'open' })
$statusItem = $menu.Items.Add('Ver estado del servicio')
$statusItem.add_Click({ Send-Action 'status' })
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$configItem = $menu.Items.Add('Editar configuracion (requiere reiniciar)')
$configItem.add_Click({ Send-Action 'config' })
$logsItem = $menu.Items.Add('Abrir carpeta de registros')
$logsItem.add_Click({ Send-Action 'logs' })
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$exitItem = $menu.Items.Add('Salir de Printer Server')
$exitItem.add_Click({ Send-Action 'quit'; $context.ExitThread() })
$tray.ContextMenuStrip = $menu
$tray.add_DoubleClick({ Send-Action 'open' })
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1500
$timer.add_Tick({
  if (-not (Get-Process -Id $OwnerPid -ErrorAction SilentlyContinue)) { $context.ExitThread() }
})
try {
  $tray.Visible = $true
  $timer.Start()
  Send-Action 'ready'
  [System.Windows.Forms.Application]::Run($context)
} finally {
  $timer.Stop()
  $timer.Dispose()
  $tray.Visible = $false
  $tray.Dispose()
  $appIcon.Dispose()
  $menu.Dispose()
  $context.Dispose()
}
