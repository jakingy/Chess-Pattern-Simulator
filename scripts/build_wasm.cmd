@echo off
setlocal

set "PROJECT_ROOT=%~dp0.."

for /f "usebackq delims=" %%i in (`wsl wslpath -a "%PROJECT_ROOT%"`) do set "WSL_PROJECT_ROOT=%%i"

wsl bash -lc "cd '%WSL_PROJECT_ROOT%/wasm_sim' && rustup target add wasm32-unknown-unknown && cargo build --release --target wasm32-unknown-unknown"
if errorlevel 1 exit /b %errorlevel%

copy /Y "%PROJECT_ROOT%\wasm_sim\target\wasm32-unknown-unknown\release\wasm_sim.wasm" "%PROJECT_ROOT%\wasm_sim.wasm"
if errorlevel 1 exit /b %errorlevel%

echo Built %PROJECT_ROOT%\wasm_sim.wasm
