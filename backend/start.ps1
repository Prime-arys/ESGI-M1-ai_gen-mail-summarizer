## Start the uvicorn server for the FastAPI backend from venv
$env:VENV_DIR = ".venv"

## Activate the virtual environment
if (Test-Path "$env:VENV_DIR/Scripts/Activate.ps1") {
    . "$env:VENV_DIR/Scripts/Activate.ps1"
} else {
    Write-Error "Virtual environment not found. Please run 'uv sync"
    exit 1
}

## Start the server
uvicorn src.main:app --reload --port 8000