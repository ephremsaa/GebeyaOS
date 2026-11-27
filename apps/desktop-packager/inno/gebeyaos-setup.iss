; GebeyaOS Supermarket Management System - Inno Setup Script
; Produces standalone GebeyaOS-Setup.exe for Windows 10/11 supermarket PCs

#define MyAppName "GebeyaOS Supermarket POS"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "GebeyaOS"
#define MyAppExeName "GebeyaOS.cmd"

[Setup]
AppId={{8F9D4A12-3B61-4D2E-9F51-7E2A91B8C001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName=C:\GebeyaOS
DisableDirPage=no
DefaultGroupName={#MyAppName}
OutputDir=..\..\..\releases
OutputBaseFilename=GebeyaOS-Setup
Compression=lzma2/fast
SolidCompression=yes
PrivilegesRequired=admin
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\..\..\apps\branch-server\dist\*"; DestDir: "{app}\apps\branch-server\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\..\apps\branch-server\package.json"; DestDir: "{app}\apps\branch-server"; Flags: ignoreversion
Source: "..\..\..\apps\pos-web\dist\*"; DestDir: "{app}\apps\pos-web\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\..\packages\*"; DestDir: "{app}\packages"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\..\database\*"; DestDir: "{app}\database"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\..\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\..\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\launcher\start-gebeyaos.ps1"; DestDir: "{app}\apps\desktop-packager\launcher"; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\GebeyaOS POS"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\apps\desktop-packager\launcher\start-gebeyaos.ps1"""; WorkingDir: "{app}"
Name: "{group}\GebeyaOS POS"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\apps\desktop-packager\launcher\start-gebeyaos.ps1"""; WorkingDir: "{app}"

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\windows\install.ps1"" -TargetDir ""{app}"""; StatusMsg: "Configuring local database and GebeyaOS Branch Server..."; Flags: runhidden waituntilterminated
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\apps\desktop-packager\launcher\start-gebeyaos.ps1"""; Description: "Launch GebeyaOS Setup Wizard"; Flags: postinstall nowait skipifsilent
