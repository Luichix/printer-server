#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef BundleDir
  #error BundleDir is required
#endif
#ifndef ArtifactDir
  #error ArtifactDir is required
#endif

[Setup]
AppId={{6A775981-3726-4517-9AAD-95A5CFB8ABCF}
AppName=Printer Server
AppVersion={#AppVersion}
AppPublisher=Printer Server
DefaultDirName={localappdata}\Programs\PrinterServer
DefaultGroupName=Printer Server
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
AppMutex=Local\PrinterServer.Desktop
CloseApplications=no
OutputDir={#ArtifactDir}
OutputBaseFilename=PrinterServer-{#AppVersion}-windows-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\PrinterServer.exe
SetupLogging=yes

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el escritorio"; Flags: unchecked
Name: "autostart"; Description: "Iniciar al entrar en Windows"; Flags: unchecked

[InstallDelete]
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\runtime"

[Files]
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Printer Server"; Filename: "{app}\PrinterServer.exe"
Name: "{userdesktop}\Printer Server"; Filename: "{app}\PrinterServer.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PrinterServer"; ValueData: """{app}\PrinterServer.exe"" --background"; Tasks: autostart; Flags: uninsdeletevalue

[Run]
Filename: "{app}\PrinterServer.exe"; Description: "Abrir Printer Server"; Flags: nowait postinstall skipifsilent

; Only application files are removed. User state in LocalAppData\PrinterServer is preserved.
