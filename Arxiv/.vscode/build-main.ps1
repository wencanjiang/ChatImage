param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$LatexBin = 'C:\Users\Rinke\AppData\Local\Programs\MiKTeX\miktex\bin\x64'
$Pdflatex = Join-Path $LatexBin 'pdflatex.exe'
$Bibtex = Join-Path $LatexBin 'bibtex.exe'
$MainName = 'april_aigc'
$Main = Join-Path $ProjectRoot "$MainName.tex"

function Invoke-LatexPass {
    param(
        [string]$Name,
        [string[]]$Arguments
    )

    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $Pdflatex @Arguments > (Join-Path $ProjectRoot "$Name.console.log") 2>&1
    $ErrorActionPreference = $oldPreference
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed"
    }
}

try {
    Push-Location $ProjectRoot
    try {
        $commonArgs = @(
            '-interaction=nonstopmode',
            '-halt-on-error',
            '-synctex=1',
            $Main
        )

        Invoke-LatexPass -Name 'pdflatex-1' -Arguments $commonArgs

        $oldPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & $Bibtex $MainName > (Join-Path $ProjectRoot 'bibtex.console.log') 2>&1
        $ErrorActionPreference = $oldPreference
        if ($LASTEXITCODE -ne 0) {
            throw 'bibtex failed'
        }

        Invoke-LatexPass -Name 'pdflatex-2' -Arguments $commonArgs
        Invoke-LatexPass -Name 'pdflatex-3' -Arguments $commonArgs
    }
    catch {
        Get-ChildItem -LiteralPath $ProjectRoot -Filter '*.console.log' |
            Sort-Object Name |
            ForEach-Object {
                Write-Host "===== $($_.Name) ====="
                Get-Content -LiteralPath $_.FullName
            }
        throw
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item -Force -ErrorAction SilentlyContinue `
        (Join-Path $ProjectRoot 'pdflatex-1.console.log'),
        (Join-Path $ProjectRoot 'pdflatex-2.console.log'),
        (Join-Path $ProjectRoot 'pdflatex-3.console.log'),
        (Join-Path $ProjectRoot 'bibtex.console.log')
}
