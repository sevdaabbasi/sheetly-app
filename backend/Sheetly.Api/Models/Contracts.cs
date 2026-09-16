namespace Sheetly.Api.Models;

public sealed record RegisterRequest(string Name, string Email, string Password);
public sealed record LoginRequest(string Email, string Password);
public sealed record UserView(Guid Id, string Name, string Email, DateTimeOffset CreatedAt);
public sealed record AuthResponse(string Token, UserView User);
public sealed record SheetPreview(
    string FileName,
    long Size,
    string SheetName,
    IReadOnlyList<string> Columns,
    IReadOnlyList<IReadOnlyList<string>> Rows,
    int TotalRows,
    IReadOnlyDictionary<int, string> RowFills);
public sealed record UploadResponse(Guid FileId, SheetPreview Preview);
public sealed record PlanRequest(Guid FileId, string Prompt);
public sealed record PrepareOperationRequest(Guid FileId, OperationStep Step, string? Summary = null);
public sealed record PrepareWorkflowRequest(Guid FileId, IReadOnlyList<OperationStep> Steps, string? Summary = null);
public sealed record PrepareMultiFileOperationRequest(
    OperationKind Kind,
    IReadOnlyList<Guid> FileIds,
    string? KeyColumn = null,
    string? OtherKeyColumn = null,
    bool Fuzzy = false,
    decimal SimilarityThreshold = 0.8m,
    string? Summary = null);
public sealed record ExecuteRequest(Guid OperationId);

public enum OperationKind
{
    Filter,
    DeleteRows,
    HighlightRows,
    Sort,
    RemoveDuplicates,
    RenameColumn,
    DeleteColumn,
    FillBlanks,
    AddCalculatedColumn,
    FindReplace,
    CleanText,
    ChangeCase,
    SplitColumn,
    MergeColumns,
    AddConstantColumn,
    AddRowNumbers,
    ExtractDatePart,
    ExtractText,
    GroupSummary,
    ValidateData,
    AddRow,
    UpdateRows,
    AppendFiles,
    CompareFiles,
    JoinFiles,
    FullJoinFiles,
    FindMissing
}
public enum FilterOperator
{
    Equals,
    NotEquals,
    Contains,
    NotContains,
    StartsWith,
    EndsWith,
    GreaterThan,
    GreaterThanOrEqual,
    LessThan,
    LessThanOrEqual,
    IsBlank,
    IsNotBlank
}

public sealed record OperationStep(
    OperationKind Kind,
    string? Column = null,
    FilterOperator? Operator = null,
    string? Value = null,
    string? NewName = null,
    bool Descending = false,
    string? SecondColumn = null,
    string? FormulaOperator = null,
    string? Color = null,
    string? Replacement = null,
    string? Mode = null,
    string? Separator = null,
    string? Aggregate = null,
    int? Start = null,
    int? Length = null,
    IReadOnlyDictionary<string, string>? Values = null);

public sealed record OperationPlan(string Summary, IReadOnlyList<OperationStep> Steps, IReadOnlyList<string> Warnings);
public sealed record PlanResponse(Guid OperationId, OperationPlan Plan, int OriginalRows, int EstimatedRows, IReadOnlyList<IReadOnlyList<string>> PreviewRows, IReadOnlyList<string> Columns);
public sealed record ExecuteResponse(Guid OperationId, string Status, SheetPreview Preview, string DownloadUrl);
