@echo off
rem Installs or updates the Windows service GymSpaServer (the offline edition's server, step OF-f).
rem The installer runs it as an administrator in "This PC is the server" mode; it can be run again
rem by hand from this folder. Exit code 0: the service runs.
setlocal
set "BASE=%~dp0"
set "BASE=%BASE:~0,-1%"
set "DATA=%ProgramData%\gym-spa\server"
set "LOGS=%ProgramData%\gym-spa\service-logs"

sc.exe query GymSpaServer >nul 2>&1
if %errorlevel%==0 (
  "%BASE%\GymSpaServer.exe" stop >nul 2>&1
  "%BASE%\GymSpaServer.exe" refresh || exit /b 1
) else (
  "%BASE%\GymSpaServer.exe" install || exit /b 1
)
rem Its own virtual account: Postgres refuses to run as an administrator, and nothing else
rem needs the database's files.
sc.exe config GymSpaServer obj= "NT SERVICE\GymSpaServer" >nul || exit /b 1

rem The data folder: only SYSTEM, Administrators and the service (groups by SID, so a Kurdish or
rem Arabic Windows works too). What is in it already inherits only that.
if not exist "%DATA%" mkdir "%DATA%"
if not exist "%LOGS%" mkdir "%LOGS%"
icacls "%DATA%" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F "NT SERVICE\GymSpaServer:(OI)(CI)F" /Q >nul || exit /b 1
icacls "%DATA%\*" /reset /T /C /Q >nul 2>&1
icacls "%LOGS%" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F "NT SERVICE\GymSpaServer:(OI)(CI)M" /Q >nul || exit /b 1

rem The other PCs reach HTTPS 47200 and discovery 47201, on private networks only.
netsh advfirewall firewall delete rule name="Gym and Spa server (HTTPS)" >nul 2>&1
netsh advfirewall firewall delete rule name="Gym and Spa server (discovery)" >nul 2>&1
netsh advfirewall firewall add rule name="Gym and Spa server (HTTPS)" dir=in action=allow protocol=TCP localport=47200 profile=private program="%BASE%\node.exe" >nul || exit /b 1
netsh advfirewall firewall add rule name="Gym and Spa server (discovery)" dir=in action=allow protocol=UDP localport=47201 profile=private program="%BASE%\node.exe" >nul || exit /b 1

"%BASE%\GymSpaServer.exe" start || exit /b 1
exit /b 0
