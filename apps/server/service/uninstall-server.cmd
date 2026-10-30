@echo off
rem Removes the Windows service GymSpaServer and its firewall rules (step OF-f). The data folder
rem (database, backups, license, certificate) stays: installing the server again finds it.
setlocal
set "BASE=%~dp0"
set "BASE=%BASE:~0,-1%"
"%BASE%\GymSpaServer.exe" stop >nul 2>&1
"%BASE%\GymSpaServer.exe" uninstall >nul 2>&1
netsh advfirewall firewall delete rule name="Gym and Spa server (HTTPS)" >nul 2>&1
netsh advfirewall firewall delete rule name="Gym and Spa server (discovery)" >nul 2>&1
exit /b 0
