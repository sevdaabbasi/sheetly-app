using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using Sheetly.Api.Models;

namespace Sheetly.Api.Services;

public interface ISpreadsheetService
{
    Task<SpreadsheetDocument> ReadAsync(IFormFile file, CancellationToken ct);
    byte[] WriteXlsx(SpreadsheetDocument document);
}

public sealed class SpreadsheetService : ISpreadsheetService
{
    public async Task<SpreadsheetDocument> ReadAsync(IFormFile file, CancellationToken ct)
    {
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        return extension switch
        {
            ".csv" => await ReadCsv(file, ct),
            ".xlsx" => ReadXlsx(file),
            _ => throw new NotSupportedException("Önizleme için XLSX ve CSV destekleniyor.")
        };
    }

    public byte[] WriteXlsx(SpreadsheetDocument document)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add(SafeSheetName(document.SheetName));
        for (var c = 0; c < document.Columns.Count; c++) sheet.Cell(1, c + 1).Value = document.Columns[c];
        for (var r = 0; r < document.Rows.Count; r++)
            for (var c = 0; c < document.Columns.Count; c++)
                sheet.Cell(r + 2, c + 1).Value = document.Rows[r].GetValueOrDefault(document.Columns[c], "");
        foreach (var fill in document.RowFills)
            if (fill.Key >= 0 && fill.Key < document.Rows.Count)
                sheet.Range(fill.Key + 2, 1, fill.Key + 2, document.Columns.Count).Style.Fill.BackgroundColor = XLColor.FromHtml(fill.Value);
        var header = sheet.Range(1, 1, 1, Math.Max(1, document.Columns.Count));
        header.Style.Font.Bold = true; header.Style.Fill.BackgroundColor = XLColor.FromHtml("#1BD88F"); header.SetAutoFilter();
        sheet.SheetView.FreezeRows(1);
        for (var c = 0; c < document.Columns.Count; c++)
        {
            var longest = document.Rows.Select(r => r.GetValueOrDefault(document.Columns[c], "").Length).Append(document.Columns[c].Length).Max();
            sheet.Column(c + 1).Width = Math.Clamp(longest + 3, 12, 42);
        }
        using var output = new MemoryStream(); workbook.SaveAs(output); return output.ToArray();
    }

    private static SpreadsheetDocument ReadXlsx(IFormFile file)
    {
        using var workbook = new XLWorkbook(file.OpenReadStream());
        var sheet = workbook.Worksheets.First();
        var range = sheet.RangeUsed() ?? throw new InvalidDataException("Çalışma sayfası boş.");
        var headerRow = range.FirstRow();
        var columns = headerRow.Cells().Select((cell, i) => UniqueHeader(cell.GetString(), i)).ToList();
        columns = MakeUnique(columns);
        var rows = range.RowsUsed().Skip(1).Select(row => columns.Select((column, i) => (column, value: row.Cell(i + 1).GetFormattedString())).ToDictionary(x => x.column, x => x.value)).ToList();
        return new() { FileName = file.FileName, SheetName = sheet.Name, Columns = columns, Rows = rows };
    }

    private static async Task<SpreadsheetDocument> ReadCsv(IFormFile file, CancellationToken ct)
    {
        using var reader = new StreamReader(file.OpenReadStream(), Encoding.UTF8, true);
        var first = await reader.ReadLineAsync(ct) ?? throw new InvalidDataException("CSV dosyası boş.");
        var delimiter = first.Count(c => c == ';') > first.Count(c => c == ',') ? ';' : ',';
        var columns = MakeUnique(ParseCsvLine(first, delimiter).Select((x, i) => UniqueHeader(x, i)).ToList());
        var rows = new List<Dictionary<string, string>>();
        while (!reader.EndOfStream)
        {
            var values = ParseCsvLine(await reader.ReadLineAsync(ct) ?? "", delimiter);
            rows.Add(columns.Select((column, i) => (column, value: i < values.Count ? values[i] : "")).ToDictionary(x => x.column, x => x.value));
        }
        return new() { FileName = file.FileName, SheetName = "Veriler", Columns = columns, Rows = rows };
    }

    private static string UniqueHeader(string value, int index) => string.IsNullOrWhiteSpace(value) ? $"Kolon {index + 1}" : value.Trim();
    private static List<string> MakeUnique(List<string> columns) { var seen = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase); return columns.Select(c => { seen[c] = seen.GetValueOrDefault(c) + 1; return seen[c] == 1 ? c : $"{c} ({seen[c]})"; }).ToList(); }
    private static string SafeSheetName(string name) => string.Concat(name.Where(c => !"[]:*?/\\".Contains(c))).Trim() is { Length: > 0 } safe ? safe[..Math.Min(31, safe.Length)] : "Sonuç";
    private static List<string> ParseCsvLine(string line, char delimiter) { var cells = new List<string>(); var current = new StringBuilder(); var quoted = false; for (var i = 0; i < line.Length; i++) { var c = line[i]; if (c == '"' && quoted && i + 1 < line.Length && line[i + 1] == '"') { current.Append('"'); i++; } else if (c == '"') quoted = !quoted; else if (c == delimiter && !quoted) { cells.Add(current.ToString()); current.Clear(); } else current.Append(c); } cells.Add(current.ToString()); return cells; }
}
