' Starts Long Light in its own full-screen window. Double-click to play. Press Esc in the game for the menu.
Option Explicit

Dim shell, fso, here, page, url, profile, candidates, browser, candidate, flags

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
page = here & "\dist\index.html"

If Not fso.FileExists(page) Then
    MsgBox "The game file is missing:" & vbCrLf & page, vbExclamation, "Long Light"
    WScript.Quit 1
End If

url = "file:///" & Replace(Replace(page, "\", "/"), " ", "%20")
profile = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\LongLight\profile"

candidates = Array( _
    shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", _
    shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", _
    shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Google\Chrome\Application\chrome.exe", _
    shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe", _
    shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe")

browser = ""
For Each candidate In candidates
    If fso.FileExists(candidate) Then
        browser = candidate
        Exit For
    End If
Next

If browser = "" Then
    MsgBox "Long Light needs Google Chrome or Microsoft Edge to run.", vbExclamation, "Long Light"
    WScript.Quit 1
End If

' Its own profile keeps the window separate from normal browsing, and keeps the journal safe.
flags = "--app=""" & url & """ --start-fullscreen --user-data-dir=""" & profile & """" & _
        " --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required" & _
        " --disable-features=Translate,CalculateNativeWinOcclusion --disable-background-timer-throttling"

shell.Run """" & browser & """ " & flags, 1, False
