const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function showError(message) {
  const script = "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($env:PRINTER_SERVER_MESSAGE, 'Printer Server')";
  const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    windowsHide: true, stdio: 'ignore', env: { ...process.env, PRINTER_SERVER_MESSAGE: message },
  });
  child.on('error', () => {});
  return child;
}
function startTray(directory, onAction, onExit) {
  const scriptPath = path.join(directory, 'tray.ps1');
  fs.writeFileSync(path.join(directory, 'printer-server.ico'), fs.readFileSync(path.join(__dirname, '../../assets/printer-server.ico')));
  fs.writeFileSync(scriptPath, fs.readFileSync(path.join(__dirname, 'tray.ps1')));
  return new Promise((resolve, reject) => {
    const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-OwnerPid', String(process.pid)], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let ready = false;
    const timeout = setTimeout(() => { child.kill(); reject(new Error('No se pudo iniciar la bandeja del sistema')); }, 15000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.stderr.on('data', data => console.error('Bandeja:', data.toString().trim()));
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => {
      if (line === 'ready') { ready = true; clearTimeout(timeout); resolve(child); }
      else onAction(line);
    });
    child.on('close', () => {
      clearTimeout(timeout);
      lines.close();
      if (!ready) reject(new Error('La bandeja terminó antes de iniciar'));
      else onExit();
    });
  });
}
module.exports = { startTray, showError };

