; Eigene Ergänzungen zum NSIS-Installer von electron-builder (nsis.include)

; Der Installer selbst ist ein x86-Programm. Beim reinen ARM64-Installer setzt electron-builder
; das Ziel deshalb auf $PROGRAMFILES = „C:\Program Files (x86)“ – richtig ist „C:\Program Files“.
!macro customInit
  ${If} $INSTDIR == "$PROGRAMFILES\${APP_FILENAME}"
    StrCpy $INSTDIR "$PROGRAMFILES64\${APP_FILENAME}"
  ${EndIf}
!macroend
