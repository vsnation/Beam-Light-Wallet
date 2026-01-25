; BEAM Light Wallet - Inno Setup Script
; Download Inno Setup from: https://jrsoftware.org/isinfo.php

#define MyAppName "BEAM Light Wallet"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "BEAM Community"
#define MyAppURL "https://beam.mw"
#define MyAppExeName "Start-Wallet.bat"
#define BeamVersion "7.5.13882"

[Setup]
AppId={{B3A4F5E6-7D8C-4E9F-A0B1-2C3D4E5F6A7B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=..\..\LICENSE
OutputDir=output
OutputBaseFilename=BEAM-LightWallet-Setup-{#MyAppVersion}
SetupIconFile=..\..\build\BEAM Light Wallet.app\Contents\Resources\AppIcon.icns
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Core files
Source: "..\..\serve.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\src\*"; DestDir: "{app}\src"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\config\*"; DestDir: "{app}\config"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: DirExists(ExpandConstant('..\..\config'))
Source: "..\..\shaders\*"; DestDir: "{app}\shaders"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: DirExists(ExpandConstant('..\..\shaders'))

; Launcher scripts
Source: "Start-Wallet.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "Stop-Wallet.bat"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\binaries\windows"
Name: "{app}\wallets"
Name: "{app}\logs"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
var
  DownloadPage: TDownloadWizardPage;

function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
begin
  if Progress = ProgressMax then
    Log(Format('Successfully downloaded file to {tmp}: %s', [FileName]));
  Result := True;
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), SetupMessage(msgPreparingDesc), @OnDownloadProgress);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  BeamVersion: String;
  GithubBase: String;
begin
  Result := True;

  if CurPageID = wpReady then begin
    BeamVersion := '{#BeamVersion}';
    GithubBase := 'https://github.com/BeamMW/beam/releases/download/beam-' + BeamVersion;

    DownloadPage.Clear;

    // Check if binaries already exist
    if not FileExists(ExpandConstant('{app}\binaries\windows\wallet-api.exe')) then
      DownloadPage.Add(GithubBase + '/windows-wallet-api-' + BeamVersion + '.zip', 'wallet-api.zip', '');

    if not FileExists(ExpandConstant('{app}\binaries\windows\beam-wallet.exe')) then
      DownloadPage.Add(GithubBase + '/windows-beam-wallet-cli-' + BeamVersion + '.zip', 'beam-wallet.zip', '');

    if DownloadPage.FilesCount > 0 then begin
      DownloadPage.Show;
      try
        try
          DownloadPage.Download;
          Result := True;
        except
          if DownloadPage.AbortedByUser then
            Log('Download aborted by user.')
          else
            SuppressibleMsgBox(AddPeriod(GetExceptionMessage), mbCriticalError, MB_OK, IDOK);
          Result := False;
        end;
      finally
        DownloadPage.Hide;
      end;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ZipPath, ExtractPath: String;
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then begin
    ExtractPath := ExpandConstant('{app}\binaries\windows');

    // Extract wallet-api
    ZipPath := ExpandConstant('{tmp}\wallet-api.zip');
    if FileExists(ZipPath) then begin
      Exec('powershell', '-Command "Expand-Archive -Path ''' + ZipPath + ''' -DestinationPath ''' + ExtractPath + ''' -Force"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      // Handle nested tar
      if FileExists(ExtractPath + '\wallet-api.tar') then begin
        Exec('tar', '-xf "' + ExtractPath + '\wallet-api.tar" -C "' + ExtractPath + '"', ExtractPath, SW_HIDE, ewWaitUntilTerminated, ResultCode);
        DeleteFile(ExtractPath + '\wallet-api.tar');
      end;
    end;

    // Extract beam-wallet
    ZipPath := ExpandConstant('{tmp}\beam-wallet.zip');
    if FileExists(ZipPath) then begin
      Exec('powershell', '-Command "Expand-Archive -Path ''' + ZipPath + ''' -DestinationPath ''' + ExtractPath + ''' -Force"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      if FileExists(ExtractPath + '\beam-wallet.tar') then begin
        Exec('tar', '-xf "' + ExtractPath + '\beam-wallet.tar" -C "' + ExtractPath + '"', ExtractPath, SW_HIDE, ewWaitUntilTerminated, ResultCode);
        DeleteFile(ExtractPath + '\beam-wallet.tar');
      end;
    end;
  end;
end;

function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  // Check for Python
  if not Exec('python', '--version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then begin
    if MsgBox('Python 3 is required but not installed.' + #13#10 + #13#10 +
              'Would you like to open the Python download page?', mbConfirmation, MB_YESNO) = IDYES then begin
      ShellExec('open', 'https://www.python.org/downloads/', '', '', SW_SHOWNORMAL, ewNoWait, ResultCode);
    end;
    Result := False;
    Exit;
  end;
  Result := True;
end;
