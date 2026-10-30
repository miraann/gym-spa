; The offline edition's installer (spec §8, step OF-f): one installer with two modes. electron-builder
; includes this through electron-builder.offline.config.mjs; `pnpm server:bundle` copies it to
; apps/server/dist/offline-installer.nsh with this build's date filled in.
;   - "This PC is the server": the server folder (resources\server) is installed as the Windows
;     service GymSpaServer with its firewall rules (install-server.cmd).
;   - "Connect to the server": only the app; it pairs with the server at its first start.
; An update first asks the server installed now whether this build may run (a perpetual license's
; updates may have ended), backs it up and stops it (prepare-update.cmd). Uninstalling removes
; the service but keeps the data folder.

!define GYM_BUILD_DATE "@GYM_BUILD_DATE@"
!define GYM_REG "Software\Click Group\gym-spa offline"

!include nsDialogs.nsh
!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER
Var GymMode
Var GymServerRadio
Var GymClientRadio
!endif

!macro customInit
  ReadRegStr $0 HKLM "${GYM_REG}" "ServerDir"
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\prepare-update.cmd"
    nsExec::ExecToLog '"$0\prepare-update.cmd" ${GYM_BUILD_DATE}'
    Pop $1
    ${If} $1 == 3
      MessageBox MB_OK|MB_ICONSTOP "ئەم وەشانە دانامەزرێت: نوێکردنەوەکانی مۆڵەتی ئەم جیمە پێش دروستکردنی ئەم وەشانە تەواو بوون. وەشانی ئێستا هەر کار دەکات و هیچ نەگۆڕدرا. بۆ کڕینی نوێکردنەوە، پەیوەندی بە کلیک گرووپ بکە."
      Quit
    ${EndIf}
  ${EndIf}
  ReadRegStr $GymMode HKLM "${GYM_REG}" "Mode"
  ${If} $GymMode == ""
    StrCpy $GymMode "client"
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom GymModePage GymModeLeave
!macroend

; The uninstaller is built from this script too, without the install pages.
!ifndef BUILD_UNINSTALLER
Function GymModePage
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 20u "ئەم کۆمپیوتەرە چۆن بەکاردێت؟"
  Pop $0
  ${NSD_CreateRadioButton} 0 26u 100% 14u "ئەم کۆمپیوتەرە سێرڤەرەکەیە"
  Pop $GymServerRadio
  ${NSD_CreateLabel} 14u 41u 95% 24u "داتای جیمەکە لەسەر ئەم کۆمپیوتەرە دەبێت و کۆمپیوتەرەکانی تری جیم پێیەوە دەبەسترێنەوە. تەنها یەک کۆمپیوتەر لە جیمەکەدا."
  Pop $0
  ${NSD_CreateRadioButton} 0 70u 100% 14u "بەستنەوە بە سێرڤەرەوە"
  Pop $GymClientRadio
  ${NSD_CreateLabel} 14u 85u 95% 24u "ئەم کۆمپیوتەرە (پێشوازی، دەرگا، قاسە) بە سێرڤەری جیمەکەوە دەبەسترێتەوە."
  Pop $0
  ${If} $GymMode == "server"
    ${NSD_Check} $GymServerRadio
  ${Else}
    ${NSD_Check} $GymClientRadio
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function GymModeLeave
  ${NSD_GetState} $GymServerRadio $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $GymMode "server"
  ${Else}
    StrCpy $GymMode "client"
  ${EndIf}
FunctionEnd
!endif

!macro customInstall
  ReadRegStr $1 HKLM "${GYM_REG}" "Mode"
  ${If} $GymMode == "server"
    nsExec::ExecToLog '"$INSTDIR\resources\server\install-server.cmd"'
    Pop $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "سێرڤەرەکە دەستی پێ نەکرد. کۆمپیوتەرەکە دووبارە دەستپێبکەرەوە؛ ئەگەر هەر کار نەکرد، پەیوەندی بە کلیک گرووپ بکە."
    ${EndIf}
    WriteRegStr HKLM "${GYM_REG}" "ServerDir" "$INSTDIR\resources\server"
  ${Else}
    ; From server to a connected PC: the service goes; the data stays where it was.
    ${If} $1 == "server"
      nsExec::ExecToLog '"$INSTDIR\resources\server\uninstall-server.cmd"'
      Pop $0
    ${EndIf}
    DeleteRegValue HKLM "${GYM_REG}" "ServerDir"
  ${EndIf}
  WriteRegStr HKLM "${GYM_REG}" "Mode" $GymMode
!macroend

!macro customUnInstall
  ; An update runs the old uninstaller first: the service stays then, and comes back with the new files.
  ${IfNot} ${isUpdated}
    ReadRegStr $0 HKLM "${GYM_REG}" "ServerDir"
    ${If} $0 != ""
      nsExec::ExecToLog '"$0\uninstall-server.cmd"'
      Pop $1
    ${EndIf}
    DeleteRegKey HKLM "${GYM_REG}"
  ${EndIf}
!macroend
