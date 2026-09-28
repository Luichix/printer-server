$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $printers = @(Get-CimInstance Win32_Printer | Where-Object { $_.PortName -match '^USB\d{3,}$' })
  if ($request.action -eq 'list') {
    $items = @($printers | Group-Object PortName | ForEach-Object {
      @{ path = $_.Name.ToUpperInvariant(); name = ($_.Group.Name -join ', '); type = 'usb'; manufacturer = 'Cola de Windows' }
    })
    ConvertTo-Json -InputObject $items -Compress
    exit 0
  }
  $matches = @($printers | Where-Object { $_.PortName -eq $request.path })
  if ($matches.Count -ne 1) { throw 'El puerto USB debe tener exactamente una impresora instalada en Windows. Revisa las impresoras y sus puertos.' }
  $printer = $matches[0]
  if ($request.action -eq 'print' -and $printer.Name -ne $request.name) { throw 'La impresora del puerto USB cambio. Vuelve a seleccionarla.' }
  Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class UsbRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Doc { public string name; public string output; public string type; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern uint StartDocPrinter(IntPtr handle, uint level, ref Doc doc);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr handle, byte[] data, uint size, out uint written);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool AbortPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr handle);
  static void Check(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  public static void Execute(string name, byte[] data) {
    IntPtr handle;
    Check(OpenPrinter(name, out handle, IntPtr.Zero));
    bool started = false;
    try {
      if (data == null) return;
      Doc doc = new Doc { name = "Printer Server", type = "RAW" };
      Check(StartDocPrinter(handle, 1, ref doc) != 0);
      started = true;
      Check(StartPagePrinter(handle));
      uint written;
      Check(WritePrinter(handle, data, (uint)data.Length, out written));
      if (written != data.Length) throw new Exception("Envio incompleto a la cola de Windows");
      Check(EndPagePrinter(handle));
      Check(EndDocPrinter(handle));
      started = false;
    } finally {
      if (started) AbortPrinter(handle);
      ClosePrinter(handle);
    }
  }
}
"@
  if ($request.action -eq 'open') { [UsbRawPrinter]::Execute($printer.Name, $null) }
  elseif ($request.action -eq 'print') { [UsbRawPrinter]::Execute($printer.Name, [Convert]::FromBase64String($request.data)) }
  else { throw 'Operacion USB desconocida' }
  @{ name = $printer.Name } | ConvertTo-Json -Compress
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
