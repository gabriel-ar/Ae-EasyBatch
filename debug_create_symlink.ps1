# Define the target directory for the symbolic link
$target_dir = "dist"

# Resolve the relative path to an absolute path
$script_dir = Split-Path -Path $PSCommandPath -Parent
$target_dir = Join-Path -Path $script_dir -ChildPath $target_dir

# Define the path to the 'EasyBatch' directory
$ext_dir = Join-Path -Path $env:APPDATA -ChildPath "Adobe\CEP\extensions"

# Check if the directory exists, and create it if it doesn't
if (!(Test-Path -Path $ext_dir)) {
    New-Item -ItemType Directory -Path $ext_dir | Out-Null
}

$eb_dir = Join-Path -Path $ext_dir -ChildPath "EasyBatch"

# Check if the script is running with elevated privileges
if (-Not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    # Relaunch the script with elevated privileges and set the working directory
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -WorkingDirectory $script_dir -Verb RunAs
    exit
}

# Create the symbolic link
New-Item -ItemType SymbolicLink -Path $eb_dir -Value $target_dir

pause