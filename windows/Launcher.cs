using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class Program
{
    internal const string MutexName = @"Local\PrinterServer.Desktop";
    internal const string Panel = "http://127.0.0.1:4000";

    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        bool created;
        using (var mutex = new Mutex(true, MutexName, out created))
        {
            if (!created) { Open(Panel); return; }
            try { using (var context = new AgentContext(Array.IndexOf(args, "--background") < 0)) Application.Run(context); }
            catch (Exception error) { MessageBox.Show(error.Message, "Printer Server", MessageBoxButtons.OK, MessageBoxIcon.Error); }
            finally { mutex.ReleaseMutex(); }
        }
    }

    internal static void Open(string target)
    {
        try { Process.Start(new ProcessStartInfo(target) { UseShellExecute = true }); }
        catch (Exception error) { MessageBox.Show("No se pudo abrir: " + target + "\n" + error.Message, "Printer Server"); }
    }
}

internal sealed class AgentContext : ApplicationContext
{
    private readonly NotifyIcon tray;
    private readonly Control dispatcher = new Control();
    private readonly Process server;
    private readonly string dataDirectory;
    private readonly string logFile;
    private readonly object logLock = new object();
    private bool closing;
    private bool ready;
    private bool browserOpened;

    internal AgentContext(bool openBrowser)
    {
        // A handle created on the UI thread marshals process callbacks safely.
        var handle = dispatcher.Handle;
        dataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PrinterServer");
        Directory.CreateDirectory(dataDirectory);
        logFile = Path.Combine(dataDirectory, "agent.log");
        if (File.Exists(logFile) && new FileInfo(logFile).Length > 2 * 1024 * 1024)
        {
            if (File.Exists(logFile + ".previous")) File.Delete(logFile + ".previous");
            File.Move(logFile, logFile + ".previous");
        }
        var menu = new ContextMenuStrip();
        menu.Items.Add("Abrir configuracion", null, delegate { Program.Open(Program.Panel); });
        menu.Items.Add("Abrir carpeta de datos y registro", null, delegate { Program.Open(dataDirectory); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Salir", null, delegate { Stop(); });
        tray = new NotifyIcon { Icon = SystemIcons.Application, Text = "Printer Server - Iniciando", ContextMenuStrip = menu, Visible = true };
        tray.DoubleClick += delegate { Program.Open(Program.Panel); };
        var root = AppDomain.CurrentDomain.BaseDirectory;
        server = new Process();
        server.StartInfo = new ProcessStartInfo(Path.Combine(root, "runtime", "node.exe"), "\"" + Path.Combine(root, "app", "src", "server.js") + "\" --desktop")
        {
            WorkingDirectory = Path.Combine(root, "app"), UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
        };
        server.StartInfo.EnvironmentVariables["PORT"] = "4000";
        server.StartInfo.EnvironmentVariables["PRINTER_DATA_DIR"] = dataDirectory;
        // A desktop installation does not inherit unrelated Node debugging/preload flags.
        server.StartInfo.EnvironmentVariables.Remove("NODE_OPTIONS");
        server.StartInfo.EnvironmentVariables.Remove("NODE_PATH");
        server.EnableRaisingEvents = true;
        server.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data == null) return;
            Log(e.Data);
            if (e.Data == "PRINTER_SERVER_READY") Dispatch(delegate {
                ready = true; tray.Text = "Printer Server - Activo";
                if (openBrowser && !browserOpened) { browserOpened = true; Program.Open(Program.Panel); }
            });
        };
        server.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) Log(e.Data); };
        server.Exited += delegate { Dispatch(delegate {
            if (closing) return;
            MessageBox.Show((ready ? "El agente se detuvo." : "No se pudo iniciar el agente.") + "\nConsulta agent.log en:\n" + dataDirectory + "\nComprueba que el puerto 4000 no este ocupado.", "Printer Server", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Stop();
        }); };
        try { server.Start(); server.BeginOutputReadLine(); server.BeginErrorReadLine(); }
        catch { tray.Dispose(); dispatcher.Dispose(); server.Dispose(); throw; }
    }

    private void Dispatch(Action action)
    {
        try { if (!dispatcher.IsDisposed) dispatcher.BeginInvoke(action); }
        catch (InvalidOperationException) { }
    }

    private void Log(string message)
    {
        lock (logLock)
        {
            try { File.AppendAllText(logFile, DateTime.Now.ToString("s") + " " + message + Environment.NewLine, Encoding.UTF8); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    private void Stop()
    {
        if (closing) return;
        closing = true;
        tray.Text = "Printer Server - Cerrando";
        tray.ContextMenuStrip.Enabled = false;
        ThreadPool.QueueUserWorkItem(delegate {
            try
            {
                if (!server.HasExited)
                {
                    try
                    {
                        server.StandardInput.WriteLine("shutdown");
                        server.StandardInput.Flush();
                        server.StandardInput.Close();
                    }
                    catch (IOException error) { Log("Canal de cierre: " + error.Message); }
                    if (!server.WaitForExit(60000))
                    {
                        Log("Cierre forzado tras 60 segundos. Revisar impresiones inciertas al reiniciar.");
                        server.Kill(); server.WaitForExit();
                    }
                }
            }
            catch (Exception error) { Log("Error al cerrar: " + error.Message); }
            Dispatch(delegate { tray.Visible = false; ExitThread(); });
        });
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { tray.Dispose(); dispatcher.Dispose(); server.Dispose(); }
        base.Dispose(disposing);
    }
}
