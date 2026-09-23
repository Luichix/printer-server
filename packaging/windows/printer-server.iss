; Compilar mediante scripts/package-windows.ps1. AppId debe permanecer estable.
#ifndef AppVersion
  #error AppVersion es obligatorio
#endif
#ifndef ProjectRoot
  #error ProjectRoot es obligatorio
#endif

[Setup]
AppId={{DD76BC54-AD9C-4D5E-9C88-17A67E2AE7EA}
AppName=Printer Server
AppVersion={#AppVersion}
VersionInfoVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\Printer Server
DefaultGroupName=Printer Server
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
MinVersion=10.0
OutputDir={#ProjectRoot}\dist\release
OutputBaseFilename=PrinterServer-{#AppVersion}-windows-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\printer-server.exe
CloseApplications=no
RestartApplications=no
SetupLogging=yes
AllowUNCPath=no
AllowNetworkDrive=no
InfoBeforeFile={#ProjectRoot}\packaging\windows\ANTES-DE-INSTALAR.txt

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el escritorio"; Flags: unchecked
Name: "autostart"; Description: "Iniciar Printer Server al iniciar sesión en Windows"; Flags: unchecked

[Files]
Source: "{#ProjectRoot}\dist\windows\printer-server.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#ProjectRoot}\packaging\windows\LEEME.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\Printer Server"; Filename: "{app}\printer-server.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\Printer Server"; Filename: "{app}\printer-server.exe"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{userstartup}\Printer Server"; Filename: "{app}\printer-server.exe"; Parameters: "--background"; WorkingDir: "{app}"; Tasks: autostart

[InstallDelete]
; Permite retirar estos accesos en una actualización si se desmarca la opción.
Type: files; Name: "{userstartup}\Printer Server.lnk"; Tasks: not autostart
Type: files; Name: "{userdesktop}\Printer Server.lnk"; Tasks: not desktopicon

[Run]
Filename: "{app}\printer-server.exe"; Description: "Abrir Printer Server"; Flags: nowait postinstall skipifsilent

; No borrar %LOCALAPPDATA%\PrinterServer al desinstalar.

