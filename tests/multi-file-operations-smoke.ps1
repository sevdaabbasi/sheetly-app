param(
    [string]$BaseUrl = "http://127.0.0.1:5193"
)

$ErrorActionPreference = "Stop"

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "ASSERT FAILED: $Message" }
}

function Upload-Csv {
    param([string]$Path)
    $response = & curl.exe -sS -F "file=@$Path" "$BaseUrl/api/files/upload"
    if ($LASTEXITCODE -ne 0) { throw "Upload failed: $Path" }
    return $response | ConvertFrom-Json
}

function Post-Json {
    param([string]$Path, [object]$Body)
    $json = $Body | ConvertTo-Json -Depth 12
    $utf8Body = [System.Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod `
        -Method Post `
        -Uri "$BaseUrl$Path" `
        -ContentType "application/json" `
        -Body $utf8Body
}

function Get-Cell {
    param([object]$Preview, [string]$KeyColumn, [string]$Key, [string]$ValueColumn)
    $keyIndex = [Array]::IndexOf([object[]]$Preview.columns, $KeyColumn)
    $valueIndex = [Array]::IndexOf([object[]]$Preview.columns, $ValueColumn)
    Assert-True ($keyIndex -ge 0) "Key column '$KeyColumn' was not found."
    Assert-True ($valueIndex -ge 0) "Value column '$ValueColumn' was not found."
    $row = $Preview.rows | Where-Object { $_[$keyIndex] -eq $Key } | Select-Object -First 1
    Assert-True ($null -ne $row) "Row '$Key' was not found."
    return $row[$valueIndex]
}

$personal = Upload-Csv "tests/fixtures/employees-personal.csv"
$work = Upload-Csv "tests/fixtures/employees-work.csv"

$joinPlan = Post-Json "/api/operations/prepare-multiple" @{
    kind = "JoinFiles"
    fileIds = @($personal.fileId, $work.fileId)
    keyColumn = "Employee"
    otherKeyColumn = "Employee"
}
$joinResult = Post-Json "/api/operations/execute" @{ operationId = $joinPlan.operationId }
Assert-True ($joinResult.preview.totalRows -eq 3) "Enrichment must preserve the three primary rows."
Assert-True ($joinResult.preview.columns -contains "Department") "Department column must be added."
Assert-True ((Get-Cell $joinResult.preview "Employee" "Ali Yilmaz" "Department") -eq "Sales") "Ali's department must be filled."
Assert-True ((Get-Cell $joinResult.preview "Employee" "Ayse Kaya" "Phone") -eq "555222") "Primary nonblank phone must win."
Assert-True (-not ($joinResult.preview.rows | Where-Object { $_[0] -eq "Deniz Acar" })) "Secondary-only employee must not be added during enrichment."

$fullPlan = Post-Json "/api/operations/prepare-multiple" @{
    kind = "FullJoinFiles"
    fileIds = @($personal.fileId, $work.fileId)
    keyColumn = "Employee"
    otherKeyColumn = "Employee"
}
$fullResult = Post-Json "/api/operations/execute" @{ operationId = $fullPlan.operationId }
Assert-True ($fullResult.preview.totalRows -eq 4) "Full merge must contain all four employees."
Assert-True ((Get-Cell $fullResult.preview "Employee" "Deniz Acar" "Email") -eq "") "Missing personal data must remain blank."
Assert-True ((Get-Cell $fullResult.preview "Employee" "Deniz Acar" "Department") -eq "Support") "Secondary-only employee data must be retained."
Assert-True ((Get-Cell $fullResult.preview "Employee" "Ayse Kaya" "Phone") -eq "555222") "Primary file value must win on conflicts."

$reversePlan = Post-Json "/api/operations/prepare-multiple" @{
    kind = "FullJoinFiles"
    fileIds = @($work.fileId, $personal.fileId)
    keyColumn = "Employee"
    otherKeyColumn = "Employee"
}
$reverseResult = Post-Json "/api/operations/execute" @{ operationId = $reversePlan.operationId }
Assert-True ($reverseResult.preview.totalRows -eq 4) "Reverse full merge must contain all four employees."
Assert-True ((Get-Cell $reverseResult.preview "Employee" "Ayse Kaya" "Phone") -eq "555999") "The selected primary file must win in reverse mode."

$null = Post-Json "/api/operations/$($fullPlan.operationId)/apply" @{}
$addPlan = Post-Json "/api/operations/prepare" @{
    fileId = $personal.fileId
    summary = "Yeni çalışan satırı"
    step = @{
        kind = "AddRow"
        values = @{
            Employee = "Ece Aras"
            Email = "ece@a.com"
            Phone = "555000"
            Department = "Legal"
            Salary = "52000"
        }
    }
}
$addResult = Post-Json "/api/operations/execute" @{ operationId = $addPlan.operationId }
Assert-True ($addResult.preview.totalRows -eq 5) "A new employee row must be added on top of the merged workbook."
Assert-True ((Get-Cell $addResult.preview "Employee" "Ece Aras" "Department") -eq "Legal") "New row values must be retained."
$null = Post-Json "/api/operations/$($addPlan.operationId)/apply" @{}

$updatePlan = Post-Json "/api/operations/prepare" @{
    fileId = $personal.fileId
    summary = "Çalışan telefonunu düzenle"
    step = @{
        kind = "UpdateRows"
        column = "Employee"
        operator = "Equals"
        value = "Ece Aras"
        secondColumn = "Phone"
        replacement = "555777"
    }
}
$updateResult = Post-Json "/api/operations/execute" @{ operationId = $updatePlan.operationId }
Assert-True ((Get-Cell $updateResult.preview "Employee" "Ece Aras" "Phone") -eq "555777") "The selected existing row must be updated."

[pscustomobject]@{
    enrichmentRows = $joinResult.preview.totalRows
    fullMergeRows = $fullResult.preview.totalRows
    reverseMergeRows = $reverseResult.preview.totalRows
    afterAddRows = $addResult.preview.totalRows
    updatedPhone = Get-Cell $updateResult.preview "Employee" "Ece Aras" "Phone"
} | ConvertTo-Json
