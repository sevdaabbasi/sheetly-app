namespace Sheetly.Api.Models;

public sealed class SpreadsheetDocument
{
    public required string FileName { get; set; }
    public required string SheetName { get; set; }
    public required List<string> Columns { get; set; }
    public required List<Dictionary<string, string>> Rows { get; set; }
    public Dictionary<int, string> RowFills { get; set; } = [];
    public SpreadsheetDocument Clone() => new() { FileName = FileName, SheetName = SheetName, Columns = [.. Columns], Rows = Rows.Select(r => r.ToDictionary()).ToList(), RowFills = RowFills.ToDictionary() };
    public SheetPreview Preview(long size = 0, int take = 20) => new(
        FileName,
        size,
        SheetName,
        Columns,
        Rows.Take(take).Select(r => (IReadOnlyList<string>)Columns.Select(c => r.GetValueOrDefault(c, "")).ToList()).ToList(),
        Rows.Count,
        RowFills.Where(fill => fill.Key >= 0 && fill.Key < take).ToDictionary());
}
