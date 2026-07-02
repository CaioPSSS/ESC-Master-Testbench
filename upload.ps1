# PowerShell script to fully automate the build and upload process to the ESP32 (BLE).
# Usage: .\upload.ps1 [COM_PORT] (e.g. .\upload.ps1 COM3)
param (
    [string]$ComPort = ""
)

$ErrorActionPreference = "Stop"
$workspaceDir = $PSScriptRoot

# Paths
$cliDir = Join-Path $workspaceDir ".arduino-cli"
$cliExe = Join-Path $cliDir "arduino-cli.exe"
$configFile = Join-Path $cliDir "arduino-cli.yaml"
$sketchDir = Join-Path $workspaceDir "esp32_lora_bridge"

# 1. Check COM port
if ([string]::IsNullOrEmpty($ComPort)) {
    Write-Host "Buscando portas COM ativas no sistema..." -ForegroundColor Cyan
    $ports = [System.IO.Ports.SerialPort]::GetPortNames()
    if ($ports.Count -eq 0) {
        Write-Host "Nenhuma porta COM encontrada!" -ForegroundColor Red
        Write-Host "Por favor, conecte o ESP32 ao USB do notebook e tente novamente." -ForegroundColor Yellow
        Write-Host "Ou especifique a porta manualmente: .\upload.ps1 COM_PORT" -ForegroundColor Yellow
        Exit 1
    } elseif ($ports.Count -eq 1) {
        $ComPort = $ports[0]
        Write-Host "Usando porta COM detectada: $ComPort" -ForegroundColor Green
    } else {
        Write-Host "Múltiplas portas COM encontradas: $ports" -ForegroundColor Yellow
        $ComPort = Read-Host "Por favor, digite a porta COM do ESP32 (ex: COM3)"
        if ([string]::IsNullOrEmpty($ComPort)) {
            Write-Host "Operação cancelada." -ForegroundColor Red
            Exit 1
        }
    }
}

Write-Host "=== INICIANDO PROCESSO DE COMPILAÇÃO E UPLOAD (ESP32 BLE) ===" -ForegroundColor Green

# 2. Compile ESP32 Sketch
Write-Host "`n[Passo 1/2] Compilando Sketch C++ (ESP32)..." -ForegroundColor Cyan
& $cliExe --config-file $configFile compile --fqbn esp32:esp32:esp32 $sketchDir
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO NA COMPILAÇÃO!" -ForegroundColor Red
    Exit 1
}

# 3. Upload Sketch
Write-Host "`n[Passo 2/2] Fazendo upload do firmware para o ESP32 ($ComPort)..." -ForegroundColor Cyan
& $cliExe --config-file $configFile upload --fqbn esp32:esp32:esp32 -p $ComPort $sketchDir
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO NO UPLOAD!" -ForegroundColor Red
    Exit 1
}

Write-Host "`n=== PROCESSO CONCLUÍDO COM SUCESSO! ===" -ForegroundColor Green
Write-Host "Ligue o ESP32, execute 'npm run dev' para abrir o Dashboard e clique em CONECTAR BLUETOOTH!" -ForegroundColor Yellow
