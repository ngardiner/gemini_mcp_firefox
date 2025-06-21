@echo off
REM Get the directory where the script itself is located
SET SCRIPT_DIR=%~dp0

REM Path to venv Python interpreter
SET VENV_PYTHON="%SCRIPT_DIR%venv\Scripts\python.exe"

REM Path to the target Python script
SET PYTHON_SCRIPT="%SCRIPT_DIR%mcp_native_host.py"

REM Activate venv (optional if directly calling venv python)
REM CALL "%SCRIPT_DIR%venv\Scripts\activate.bat"

REM Execute the Python script with the venv's interpreter
REM To enable the API, uncomment one of the lines below and comment out the last line
REM %VENV_PYTHON% %PYTHON_SCRIPT% --enable-api
REM %VENV_PYTHON% %PYTHON_SCRIPT% --enable-api --api-port 8765
%VENV_PYTHON% %PYTHON_SCRIPT%
