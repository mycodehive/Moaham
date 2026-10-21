!macro customInstall
  ; Restore additional language files after an update/reinstallation. Built-in
  ; Korean/English packs always come from the new application version.
  CreateDirectory "$INSTDIR\languages"
  IfFileExists "$APPDATA\Moaham\language-packs\*.json" 0 +2
    CopyFiles /SILENT "$APPDATA\Moaham\language-packs\*.json" "$INSTDIR\languages"
  RMDir /r "$APPDATA\Moaham\language-packs"
  ; Remove obsolete branded shortcuts left by the pre-Moaham installer.
  Delete "$DESKTOP\orgFiles.lnk"
  Delete "$SMPROGRAMS\orgFiles.lnk"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  ; NSIS replaces the whole installation directory during automatic updates.
  ; Preserve only additional JSON packs; never copy executable content.
  Push $R0
  Push $R1
  RMDir /r "$APPDATA\Moaham\language-packs"
  CreateDirectory "$APPDATA\Moaham\language-packs"
  FindFirst $R0 $R1 "$INSTDIR\languages\*.json"
  moaham_language_loop:
    StrCmp $R1 "" moaham_language_done
    StrCmp $R1 "ko.json" moaham_language_next
    StrCmp $R1 "en.json" moaham_language_next
    CopyFiles /SILENT "$INSTDIR\languages\$R1" "$APPDATA\Moaham\language-packs"
  moaham_language_next:
    FindNext $R0 $R1
    Goto moaham_language_loop
  moaham_language_done:
    FindClose $R0
  Pop $R1
  Pop $R0
!macroend
