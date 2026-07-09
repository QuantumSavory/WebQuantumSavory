@echo off
setlocal
set "APP_ROOT=%~dp0.."

call npm --prefix "%APP_ROOT%\gui" ci --include=dev
if errorlevel 1 exit /b %errorlevel%

call npm --prefix "%APP_ROOT%\gui" run build
if errorlevel 1 exit /b %errorlevel%

julia --color=yes --depwarn=no --project="%APP_ROOT%" -q -i -- "%APP_ROOT%\bootstrap.jl" -s=true %*
