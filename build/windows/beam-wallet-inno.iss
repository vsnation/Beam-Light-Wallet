; BEAM Light Wallet - Inno Setup Script
; Download Inno Setup from: https://jrsoftware.org/isinfo.php
;
; ---------------------------------------------------------------------------
; VERSIONS ARE NOT HARDCODED IN THIS FILE.
;
; ..\..\config\binaries.json is the single source of truth. It is read twice:
;
;   * COMPILE time - the preprocessor block below pulls "app_version" out of
;     the manifest (via PowerShell, ISPP has no JSON parser) so that
;     AppVersion and the setup filename always match the manifest.
;
;   * INSTALL time - the [Code] section parses the manifest that Setup carries
;     as a "dontcopy" file to get the BEAM version, the release asset names and
;     the pinned SHA-256 of each extracted binary. Asset names come straight
;     from the manifest, which is what fixes the old 404: Windows release
;     assets are prefixed "win-", not "windows-".
;
; Requires Inno Setup 6 (TDownloadWizardPage) and PowerShell 5+ on both the
; build machine and the target machine.
; ---------------------------------------------------------------------------

#define MyAppName "BEAM Light Wallet"
#define MyAppPublisher "BEAM Community"
#define MyAppURL "https://beam.mw"
#define MyAppExeName "Start-Wallet.bat"

#define ManifestPath AddBackslash(SourcePath) + "..\..\config\binaries.json"
#define VersionFile AddBackslash(GetEnv("TEMP")) + "beam-lightwallet-app-version.tmp"

#if !FileExists(ManifestPath)
  #error Cannot find config\binaries.json. Compile this script from build\windows.
#endif

; Write app_version to a one-line temp file, then read that line back. The
; temp file is deleted by the same PowerShell call that rewrites it, so a
; stale file from an earlier build can never be picked up silently.
; Note: these are #expr assignments, not #define values - a #define holding
; FileRead(...) would be re-evaluated on every use and read the wrong line.
#define ExecResult
#define VersionHandle
#define MyAppVersion

#expr ExecResult = Exec("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command ""Remove-Item -Force -ErrorAction SilentlyContinue '" + VersionFile + "'; (Get-Content -Raw '" + ManifestPath + "' | ConvertFrom-Json).app_version | Set-Content -NoNewline '" + VersionFile + "'""", SourcePath, 0, 1)

#if ExecResult != 0
  #error Could not run PowerShell to read app_version from config\binaries.json.
#endif

#if !FileExists(VersionFile)
  #error Could not read app_version from config\binaries.json (PowerShell 5+ required).
#endif

#expr VersionHandle = FileOpen(VersionFile)
#expr MyAppVersion = FileRead(VersionHandle)
#expr FileClose(VersionHandle)

#if MyAppVersion == ""
  #error app_version in config\binaries.json is empty.
#endif

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
; No SetupIconFile: the repo has no .ico, and the old value pointed at a macOS
; .icns inside the mac app bundle, which Inno cannot read (it needs a Windows
; .ico) and which was not even at that path. Drop a real .ico in build\windows
; and re-add: SetupIconFile=AppIcon.ico
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
; config\ carries binaries.json, which serve.py reads at runtime - it must always
; be installed. (The old "Check: DirExists(ExpandConstant('..\..\config'))" was
; evaluated on the USER's machine against a relative path, so it was normally
; False and the config directory silently never got installed.)
Source: "..\..\config\*"; DestDir: "{app}\config"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\shaders\*"; DestDir: "{app}\shaders"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

; Version manifest, also embedded uncompiled so [Code] can read it before
; the install step copies anything to {app}.
Source: "..\..\config\binaries.json"; Flags: dontcopy

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
  ManifestText: String;
  ManifestLoaded: Boolean;

// ===========================================================================
// config\binaries.json - read once, parsed with the small helpers below.
// ===========================================================================

function Manifest(): String;
var
  S: AnsiString;
begin
  if not ManifestLoaded then begin
    ManifestLoaded := True;
    ManifestText := '';
    try
      ExtractTemporaryFile('binaries.json');
      if LoadStringFromFile(ExpandConstant('{tmp}\binaries.json'), S) then
        ManifestText := S;
    except
      Log('Could not read binaries.json: ' + GetExceptionMessage);
    end;
  end;
  Result := ManifestText;
end;

// Returns the brace-balanced object starting at or after StartAt. Good enough
// for binaries.json, where no string value contains a brace.
function JsonObjectAt(const S: String; StartAt: Integer): String;
var
  I, Depth: Integer;
  Started: Boolean;
begin
  Result := '';
  Depth := 0;
  Started := False;
  for I := StartAt to Length(S) do begin
    if S[I] = '{' then begin
      Depth := Depth + 1;
      Started := True;
    end else if S[I] = '}' then
      Depth := Depth - 1;
    if Started then
      Result := Result + S[I];
    if Started and (Depth = 0) then
      Exit;
  end;
end;

// The object stored under "Name" inside S.
function JsonSection(const S, Name: String): String;
var
  P: Integer;
begin
  Result := '';
  P := Pos('"' + Name + '"', S);
  if P > 0 then
    Result := JsonObjectAt(S, P);
end;

// The value of "Key" inside S: the text between the quotes for a string value,
// or the bare token (null / true / false / a number) when it is not quoted.
function JsonValue(const S, Key: String): String;
var
  I: Integer;
begin
  Result := '';
  I := Pos('"' + Key + '"', S);
  if I = 0 then
    Exit;
  I := I + Length(Key) + 2;
  while (I <= Length(S)) and (S[I] <> ':') do
    I := I + 1;
  I := I + 1;
  while (I <= Length(S)) and ((S[I] = ' ') or (S[I] = #9) or (S[I] = #13) or (S[I] = #10)) do
    I := I + 1;
  if I > Length(S) then
    Exit;
  if S[I] = '"' then begin
    I := I + 1;
    while (I <= Length(S)) and (S[I] <> '"') do begin
      Result := Result + S[I];
      I := I + 1;
    end;
  end else begin
    while (I <= Length(S)) and (S[I] <> ',') and (S[I] <> '}') and (S[I] <> #13) and (S[I] <> #10) do begin
      Result := Result + S[I];
      I := I + 1;
    end;
    Result := Trim(Result);
  end;
end;

function PlatformSection(): String;
begin
  Result := JsonSection(Manifest(), 'windows');
end;

function BinarySection(const Name: String): String;
begin
  Result := JsonSection(JsonSection(PlatformSection(), 'binaries'), Name);
end;

function BinaryFileName(const Name: String): String;
begin
  Result := JsonValue(BinarySection(Name), 'file');
  if Result = '' then
    Result := Name + '.exe';
end;

// release_base plus the tag, which every BEAM installer builds as beam-<version>.
function ReleaseUrlBase(): String;
begin
  Result := JsonValue(Manifest(), 'release_base') + '/beam-' +
            JsonValue(PlatformSection(), 'beam_version');
end;

// ===========================================================================
// Hard fork compatibility + download verification
// ===========================================================================

procedure WarnIfNotHardForkCompatible();
var
  Plat, Fork: String;
begin
  Plat := PlatformSection();
  if Plat = '' then
    Exit;
  if Lowercase(JsonValue(Plat, 'hf6_compatible')) <> 'false' then
    Exit;

  Fork := JsonSection(Manifest(), 'hardfork');
  MsgBox('WARNING: these BEAM binaries cannot follow mainnet.' + #13#10 + #13#10 +
         'Version ' + JsonValue(Plat, 'beam_version') + ' predates the ' +
         JsonValue(Fork, 'name') + ' hard fork at block ' + JsonValue(Fork, 'height') + '.' + #13#10 +
         'The node stalls one block before the fork height and never recovers, so any ' +
         'balance or transaction history this wallet shows will be STALE, and ' +
         'transactions you create may be rejected by the network.' + #13#10 + #13#10 +
         JsonValue(Plat, 'unsupported_reason'),
         mbError, MB_OK);
end;

function FileSha256(const FileName: String): String;
var
  OutFile, Hash: String;
  ResultCode: Integer;
  S: AnsiString;
begin
  Result := '';
  OutFile := ExpandConstant('{tmp}\sha256.txt');
  DeleteFile(OutFile);
  if not Exec('powershell',
       '-NoProfile -ExecutionPolicy Bypass -Command "(Get-FileHash -Algorithm SHA256 -LiteralPath ''' +
       FileName + ''').Hash | Set-Content -LiteralPath ''' + OutFile + '''"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Exit;
  if LoadStringFromFile(OutFile, S) then begin
    Hash := S;
    Result := Lowercase(Trim(Hash));
  end;
  DeleteFile(OutFile);
end;

// The manifest pins the hash of the EXTRACTED binary, so this runs after the
// archive has been unpacked. Fails closed: a pinned hash that cannot be
// checked, or that does not match, aborts the installation.
procedure VerifyBinary(const BinDir, Name: String);
var
  Expected, FileName, Path, Actual: String;
begin
  FileName := BinaryFileName(Name);
  Path := AddBackslash(BinDir) + FileName;
  Expected := Lowercase(JsonValue(BinarySection(Name), 'sha256'));

  if not FileExists(Path) then begin
    MsgBox('Setup could not find ' + FileName + ' after unpacking the download.' + #13#10 +
           'BEAM Light Wallet will not start until this binary is installed.', mbError, MB_OK);
    Exit;
  end;

  if (Expected = '') or (Expected = 'null') then begin
    Log('No pinned sha256 for ' + FileName + ' in binaries.json - skipping verification');
    Exit;
  end;

  Actual := FileSha256(Path);
  if Actual = '' then begin
    DeleteFile(Path);
    RaiseException('Setup could not compute the SHA-256 of ' + FileName + ', so it ' +
      'cannot verify the download against config\binaries.json.' + #13#10 +
      'PowerShell 5 or later is required. Installation aborted.');
  end;

  if Actual <> Expected then begin
    DeleteFile(Path);
    RaiseException('SHA-256 mismatch for ' + FileName + '.' + #13#10 +
      'expected: ' + Expected + #13#10 +
      'actual:   ' + Actual + #13#10 +
      'The downloaded binary does not match config\binaries.json. It has been ' +
      'deleted and the installation aborted.');
  end;

  Log('sha256 verified: ' + FileName);
end;

// ===========================================================================
// Wizard
// ===========================================================================

function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
begin
  if Progress = ProgressMax then
    Log(Format('Successfully downloaded file to {tmp}: %s', [FileName]));
  Result := True;
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), SetupMessage(msgPreparingDesc), @OnDownloadProgress);
  WarnIfNotHardForkCompatible();
end;

// Counted here rather than via DownloadPage.FilesCount: that property does not
// exist in every Inno Setup 6.x, and a missing property is a compile error.
procedure QueueDownload(const UrlBase, BinDir, Name: String; var Queued: Integer);
var
  Asset: String;
begin
  // Already installed?
  if FileExists(AddBackslash(BinDir) + BinaryFileName(Name)) then
    Exit;

  Asset := JsonValue(BinarySection(Name), 'asset');
  if Asset = '' then begin
    Log('binaries.json has no asset name for ' + Name + ' - skipping download');
    Exit;
  end;

  // The third argument stays empty: the manifest pins the hash of the extracted
  // binary, not of the .zip, so verification happens after extraction instead.
  DownloadPage.Add(UrlBase + '/' + Asset, Name + '.zip', '');
  Queued := Queued + 1;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  UrlBase, BinDir: String;
  Queued: Integer;
begin
  Result := True;

  if CurPageID = wpReady then begin
    if Manifest() = '' then begin
      MsgBox('Setup could not read config\binaries.json and does not know which ' +
             'BEAM binaries to download.', mbCriticalError, MB_OK);
      Result := False;
      Exit;
    end;

    UrlBase := ReleaseUrlBase();
    BinDir := ExpandConstant('{app}\binaries\windows');

    DownloadPage.Clear;
    Queued := 0;

    // Asset names come from the manifest. They are prefixed "win-"; the
    // "windows-" names this script used to build always returned 404.
    QueueDownload(UrlBase, BinDir, 'wallet-api', Queued);
    QueueDownload(UrlBase, BinDir, 'beam-wallet', Queued);

    if Queued > 0 then begin
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

procedure ExtractDownloaded(const ExtractPath, Name: String);
var
  ZipPath, TarPath: String;
  ResultCode: Integer;
begin
  ZipPath := AddBackslash(ExpandConstant('{tmp}')) + Name + '.zip';
  if not FileExists(ZipPath) then
    Exit;

  Exec('powershell', '-NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path ''' + ZipPath + ''' -DestinationPath ''' + ExtractPath + ''' -Force"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // Handle nested tar
  TarPath := AddBackslash(ExtractPath) + Name + '.tar';
  if FileExists(TarPath) then begin
    Exec('tar', '-xf "' + TarPath + '" -C "' + ExtractPath + '"', ExtractPath, SW_HIDE, ewWaitUntilTerminated, ResultCode);
    DeleteFile(TarPath);
  end;

  VerifyBinary(ExtractPath, Name);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ExtractPath: String;
begin
  if CurStep = ssPostInstall then begin
    ExtractPath := ExpandConstant('{app}\binaries\windows');
    ExtractDownloaded(ExtractPath, 'wallet-api');
    ExtractDownloaded(ExtractPath, 'beam-wallet');
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
