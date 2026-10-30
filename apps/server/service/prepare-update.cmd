@echo off
rem Run by the NEXT version's installer, from the server folder now installed, before any file is
rem replaced (step OF-f): %1 is the new build's date (YYYY-MM-DD).
rem Exit 3: a perpetual license's updates ended before that build; nothing is changed. Exit 0: a
rem backup was made (when the server runs) and the service is stopped, ready for the new files.
setlocal
set "BASE=%~dp0"
set "BASE=%BASE:~0,-1%"
"%BASE%\node.exe" "%BASE%\gym-server-admin.mjs" check-update --build-date %1
if %errorlevel%==3 exit /b 3
"%BASE%\node.exe" "%BASE%\gym-server-admin.mjs" backup --kind before-update >nul 2>&1
"%BASE%\GymSpaServer.exe" stop >nul 2>&1
exit /b 0
