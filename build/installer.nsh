!macro customInstall
  ; Remove obsolete branded shortcuts left by the pre-Moaham installer.
  Delete "$DESKTOP\orgFiles.lnk"
  Delete "$SMPROGRAMS\orgFiles.lnk"
  ; Notify Explorer after the installer has replaced icons and shortcuts.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
