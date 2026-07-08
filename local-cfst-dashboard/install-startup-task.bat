@echo off
set "DIR=%~dp0"
schtasks /Create /F /TN "ShyVPN Local CFST Dashboard" /SC ONLOGON /TR "cmd /c cd /d \"%DIR%\" && start \"\" /min node server.mjs"
echo Installed startup task: ShyVPN Local CFST Dashboard
