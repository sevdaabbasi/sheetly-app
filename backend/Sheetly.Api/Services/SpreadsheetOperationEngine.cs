using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Sheetly.Api.Models;

namespace Sheetly.Api.Services;

public interface ISpreadsheetOperationEngine { SpreadsheetDocument Apply(SpreadsheetDocument source, OperationPlan plan); }

public sealed class SpreadsheetOperationEngine : ISpreadsheetOperationEngine
{
    public SpreadsheetDocument Apply(SpreadsheetDocument source, OperationPlan plan)
    {
        var result = source.Clone();
        foreach (var step in plan.Steps) ApplyStep(result, step);
        result.FileName = $"Sheetly_{Path.GetFileNameWithoutExtension(source.FileName)}.xlsx";
        return result;
    }

    private static void ApplyStep(SpreadsheetDocument doc, OperationStep step)
    {
        string Column() => ResolveColumn(doc, step.Column);
        switch (step.Kind)
        {
            case OperationKind.Filter:
                var column = Column();
                ReplaceRows(doc, RowsWithFills(doc).Where(item => Matches(item.Row.GetValueOrDefault(column, ""), step.Operator ?? FilterOperator.Contains, step.Value ?? "")));
                break;
            case OperationKind.DeleteRows:
                column = Column();
                ReplaceRows(doc, RowsWithFills(doc).Where(item => !Matches(item.Row.GetValueOrDefault(column, ""), step.Operator ?? FilterOperator.Contains, step.Value ?? "")));
                break;
            case OperationKind.HighlightRows:
                column = Column(); for (var i = 0; i < doc.Rows.Count; i++) if (Matches(doc.Rows[i].GetValueOrDefault(column, ""), step.Operator ?? FilterOperator.Contains, step.Value ?? "")) doc.RowFills[i] = step.Color ?? "#FFF2A8"; break;
            case OperationKind.Sort:
                column = Column();
                var sortedRows = step.Descending
                    ? RowsWithFills(doc).OrderByDescending(item => SortValue(item.Row.GetValueOrDefault(column, "")))
                    : RowsWithFills(doc).OrderBy(item => SortValue(item.Row.GetValueOrDefault(column, "")));
                ReplaceRows(doc, sortedRows);
                break;
            case OperationKind.RemoveDuplicates:
                var duplicateColumn = string.IsNullOrWhiteSpace(step.Column) ? null : ResolveColumn(doc, step.Column);
                var groupedRows = RowsWithFills(doc).GroupBy(
                    item => duplicateColumn is null
                        ? string.Join('\u001F', doc.Columns.Select(c => item.Row.GetValueOrDefault(c, "")))
                        : item.Row.GetValueOrDefault(duplicateColumn, ""),
                    StringComparer.OrdinalIgnoreCase);
                var uniqueRows = step.Mode?.ToLowerInvariant() switch
                {
                    "last" => groupedRows.Select(group => group.Last()),
                    "highest" when !string.IsNullOrWhiteSpace(step.SecondColumn) =>
                        groupedRows.Select(group => group.OrderByDescending(item => Number(item.Row.GetValueOrDefault(ResolveColumn(doc, step.SecondColumn), ""))).First()),
                    _ => groupedRows.Select(group => group.First())
                };
                ReplaceRows(doc, uniqueRows);
                break;
            case OperationKind.RenameColumn:
                column = Column(); var newName = string.IsNullOrWhiteSpace(step.NewName) ? throw new InvalidOperationException("Yeni kolon adı gerekli.") : step.NewName.Trim(); if (doc.Columns.Contains(newName, StringComparer.OrdinalIgnoreCase)) throw new InvalidOperationException("Yeni kolon adı zaten var."); doc.Columns[doc.Columns.IndexOf(column)] = newName; foreach (var row in doc.Rows) { row[newName] = row[column]; row.Remove(column); } break;
            case OperationKind.DeleteColumn:
                column = Column(); doc.Columns.Remove(column); foreach (var row in doc.Rows) row.Remove(column); break;
            case OperationKind.FillBlanks:
                var targets = string.IsNullOrWhiteSpace(step.Column) ? doc.Columns : [ResolveColumn(doc, step.Column)]; foreach (var target in targets) foreach (var row in doc.Rows.Where(r => string.IsNullOrWhiteSpace(r.GetValueOrDefault(target)))) row[target] = step.Value ?? ""; break;
            case OperationKind.AddCalculatedColumn:
                var first = Column(); var second = ResolveColumn(doc, step.SecondColumn); newName = string.IsNullOrWhiteSpace(step.NewName) ? "Hesaplanan" : step.NewName; if (!doc.Columns.Contains(newName)) doc.Columns.Add(newName); foreach (var row in doc.Rows) row[newName] = Calculate(row.GetValueOrDefault(first, "0"), row.GetValueOrDefault(second, "0"), step.FormulaOperator ?? "+"); break;
            case OperationKind.FindReplace:
                var replaceTargets = string.IsNullOrWhiteSpace(step.Column) ? doc.Columns : [ResolveColumn(doc, step.Column)];
                if (string.IsNullOrEmpty(step.Value)) throw new InvalidOperationException("Aranacak değer gerekli.");
                foreach (var target in replaceTargets)
                    foreach (var row in doc.Rows)
                        row[target] = row.GetValueOrDefault(target, "").Replace(step.Value, step.Replacement ?? "", StringComparison.OrdinalIgnoreCase);
                break;
            case OperationKind.CleanText:
                var cleanTargets = string.IsNullOrWhiteSpace(step.Column) ? doc.Columns : [ResolveColumn(doc, step.Column)];
                foreach (var target in cleanTargets)
                    foreach (var row in doc.Rows)
                        row[target] = Clean(row.GetValueOrDefault(target, ""), step.Mode);
                break;
            case OperationKind.ChangeCase:
                var caseTargets = string.IsNullOrWhiteSpace(step.Column) ? doc.Columns : [ResolveColumn(doc, step.Column)];
                foreach (var target in caseTargets)
                    foreach (var row in doc.Rows)
                        row[target] = ChangeCase(row.GetValueOrDefault(target, ""), step.Mode);
                break;
            case OperationKind.SplitColumn:
                column = Column();
                var firstName = UniqueColumnName(doc, step.NewName ?? $"{column} 1");
                var secondName = UniqueColumnName(doc, step.Replacement ?? $"{column} 2");
                doc.Columns.Add(firstName);
                doc.Columns.Add(secondName);
                foreach (var row in doc.Rows)
                {
                    var parts = row.GetValueOrDefault(column, "").Split([step.Separator ?? " "], 2, StringSplitOptions.None);
                    row[firstName] = parts.ElementAtOrDefault(0) ?? "";
                    row[secondName] = parts.ElementAtOrDefault(1) ?? "";
                }
                break;
            case OperationKind.MergeColumns:
                column = Column();
                second = ResolveColumn(doc, step.SecondColumn);
                newName = UniqueColumnName(doc, step.NewName ?? "Birleştirilen");
                doc.Columns.Add(newName);
                foreach (var row in doc.Rows)
                    row[newName] = string.Join(step.Separator ?? " ", new[] { row.GetValueOrDefault(column, ""), row.GetValueOrDefault(second, "") }.Where(value => !string.IsNullOrWhiteSpace(value)));
                break;
            case OperationKind.AddConstantColumn:
                newName = UniqueColumnName(doc, step.NewName ?? "Yeni Kolon");
                doc.Columns.Add(newName);
                foreach (var row in doc.Rows) row[newName] = step.Value ?? "";
                break;
            case OperationKind.AddRowNumbers:
                newName = UniqueColumnName(doc, step.NewName ?? "Sıra No");
                doc.Columns.Insert(0, newName);
                for (var i = 0; i < doc.Rows.Count; i++) doc.Rows[i][newName] = (i + 1).ToString(CultureInfo.InvariantCulture);
                break;
            case OperationKind.ExtractDatePart:
                column = Column();
                newName = UniqueColumnName(doc, step.NewName ?? $"Tarih {step.Mode ?? "Yıl"}");
                doc.Columns.Add(newName);
                foreach (var row in doc.Rows) row[newName] = DatePart(row.GetValueOrDefault(column, ""), step.Mode);
                break;
            case OperationKind.ExtractText:
                column = Column();
                newName = UniqueColumnName(doc, step.NewName ?? "Çıkarılan Metin");
                doc.Columns.Add(newName);
                foreach (var row in doc.Rows) row[newName] = ExtractText(row.GetValueOrDefault(column, ""), step.Mode, step.Value, step.Length);
                break;
            case OperationKind.GroupSummary:
                column = Column();
                var valueColumn = string.IsNullOrWhiteSpace(step.SecondColumn) ? null : ResolveColumn(doc, step.SecondColumn);
                var aggregate = step.Aggregate?.ToLowerInvariant() ?? "count";
                var summaryName = valueColumn is null || aggregate == "count" ? "Adet" : $"{aggregate} - {valueColumn}";
                var summaryRows = doc.Rows
                    .GroupBy(row => row.GetValueOrDefault(column, ""), StringComparer.OrdinalIgnoreCase)
                    .OrderBy(group => group.Key)
                    .Select(group => new Dictionary<string, string>
                    {
                        [column] = group.Key,
                        [summaryName] = Aggregate(group, valueColumn, aggregate)
                    })
                    .ToList();
                doc.Columns = [column, summaryName];
                doc.Rows = summaryRows;
                doc.RowFills.Clear();
                doc.SheetName = "Özet";
                break;
            case OperationKind.ValidateData:
                column = Column();
                var validationMode = step.Mode ?? "required";
                var invalidRows = RowsWithFills(doc)
                    .Select(item => (item.Row, item.Fill, Error: ValidationError(item.Row.GetValueOrDefault(column, ""), validationMode)))
                    .Where(item => item.Error is not null)
                    .ToList();
                var errorColumn = UniqueColumnName(doc, "Sheetly Hata");
                doc.Columns.Add(errorColumn);
                foreach (var item in invalidRows) item.Row[errorColumn] = item.Error!;
                ReplaceRows(doc, invalidRows.Select(item => (item.Row, item.Fill)));
                doc.SheetName = "Hata Raporu";
                break;
            case OperationKind.AddRow:
                var addedRow = doc.Columns.ToDictionary(
                    item => item,
                    item => step.Values?.FirstOrDefault(pair => pair.Key.Equals(item, StringComparison.OrdinalIgnoreCase)).Value ?? "");
                doc.Rows.Add(addedRow);
                break;
            case OperationKind.UpdateRows:
                column = Column();
                var updateColumn = ResolveColumn(doc, step.SecondColumn);
                var updatedRows = 0;
                foreach (var row in doc.Rows.Where(row => Matches(row.GetValueOrDefault(column, ""), step.Operator ?? FilterOperator.Equals, step.Value ?? "")))
                {
                    row[updateColumn] = step.Replacement ?? "";
                    updatedRows++;
                }
                if (updatedRows == 0) throw new InvalidOperationException("Düzenlenecek eşleşen satır bulunamadı.");
                break;
            case OperationKind.AppendFiles:
            case OperationKind.CompareFiles:
            case OperationKind.JoinFiles:
            case OperationKind.FullJoinFiles:
            case OperationKind.FindMissing:
                throw new InvalidOperationException("Bu işlem en az iki dosya gerektirir.");
        }
    }

    private static IEnumerable<(Dictionary<string, string> Row, string? Fill)> RowsWithFills(SpreadsheetDocument doc) =>
        doc.Rows.Select((row, index) => (row, doc.RowFills.GetValueOrDefault(index)));

    private static void ReplaceRows(SpreadsheetDocument doc, IEnumerable<(Dictionary<string, string> Row, string? Fill)> rows)
    {
        var prepared = rows.ToList();
        doc.Rows = prepared.Select(item => item.Row).ToList();
        doc.RowFills = prepared
            .Select((item, index) => (index, item.Fill))
            .Where(item => !string.IsNullOrWhiteSpace(item.Fill))
            .ToDictionary(item => item.index, item => item.Fill!);
    }

    private static string ResolveColumn(SpreadsheetDocument doc, string? requested)
    {
        if (string.IsNullOrWhiteSpace(requested)) throw new InvalidOperationException("Kolon adı gerekli.");
        return doc.Columns.FirstOrDefault(c => c.Equals(requested, StringComparison.OrdinalIgnoreCase)) ?? doc.Columns.FirstOrDefault(c => c.Contains(requested, StringComparison.OrdinalIgnoreCase)) ?? throw new InvalidOperationException($"'{requested}' kolonu bulunamadı.");
    }
    private static string UniqueColumnName(SpreadsheetDocument doc, string requested)
    {
        var clean = string.IsNullOrWhiteSpace(requested) ? "Yeni Kolon" : requested.Trim();
        if (!doc.Columns.Contains(clean, StringComparer.OrdinalIgnoreCase)) return clean;
        var index = 2;
        while (doc.Columns.Contains($"{clean} ({index})", StringComparer.OrdinalIgnoreCase)) index++;
        return $"{clean} ({index})";
    }
    private static bool Matches(string cell, FilterOperator op, string value) => op switch
    {
        FilterOperator.Equals => cell.Equals(value, StringComparison.OrdinalIgnoreCase),
        FilterOperator.NotEquals => !cell.Equals(value, StringComparison.OrdinalIgnoreCase),
        FilterOperator.Contains => cell.Contains(value, StringComparison.OrdinalIgnoreCase),
        FilterOperator.NotContains => !cell.Contains(value, StringComparison.OrdinalIgnoreCase),
        FilterOperator.StartsWith => cell.StartsWith(value, StringComparison.OrdinalIgnoreCase),
        FilterOperator.EndsWith => cell.EndsWith(value, StringComparison.OrdinalIgnoreCase),
        FilterOperator.GreaterThan => Number(cell) > Number(value),
        FilterOperator.GreaterThanOrEqual => Number(cell) >= Number(value),
        FilterOperator.LessThan => Number(cell) < Number(value),
        FilterOperator.LessThanOrEqual => Number(cell) <= Number(value),
        FilterOperator.IsBlank => string.IsNullOrWhiteSpace(cell),
        FilterOperator.IsNotBlank => !string.IsNullOrWhiteSpace(cell),
        _ => false
    };
    private static (int Kind, decimal Number, string Text) SortValue(string value) => decimal.TryParse(NormalizeNumber(value), NumberStyles.Any, CultureInfo.InvariantCulture, out var number) ? (0, number, "") : (1, 0, value.ToLowerInvariant());
    private static decimal Number(string value) => decimal.TryParse(NormalizeNumber(value), NumberStyles.Any, CultureInfo.InvariantCulture, out var number) ? number : 0;
    private static string NormalizeNumber(string value) { var clean = new string(value.Where(c => char.IsDigit(c) || c is '-' or '.' or ',').ToArray()); if (clean.Contains('.') && clean.Contains(',')) clean = clean.LastIndexOf(',') > clean.LastIndexOf('.') ? clean.Replace(".", "").Replace(',', '.') : clean.Replace(",", ""); else if (clean.Count(c => c == ',') == 1) clean = clean.Replace(',', '.'); return clean; }
    private static string Calculate(string left, string right, string op) { var a = Number(left); var b = Number(right); var result = op switch { "-" => a - b, "*" => a * b, "/" => b == 0 ? 0 : a / b, _ => a + b }; return result.ToString("0.##", CultureInfo.InvariantCulture); }
    private static string Clean(string value, string? mode) => mode?.ToLowerInvariant() switch
    {
        "nonprinting" => new string(value.Where(character => !char.IsControl(character)).ToArray()),
        "ascii" => new string(value.Normalize(NormalizationForm.FormD).Where(character => CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark).ToArray()).Normalize(NormalizationForm.FormC),
        "number" => Number(value).ToString("0.##", CultureInfo.InvariantCulture),
        _ => Regex.Replace(value.Trim(), @"\s+", " ")
    };
    private static string ChangeCase(string value, string? mode) => mode?.ToLowerInvariant() switch
    {
        "lower" => value.ToLower(new CultureInfo("tr-TR")),
        "title" => new CultureInfo("tr-TR").TextInfo.ToTitleCase(value.ToLower(new CultureInfo("tr-TR"))),
        _ => value.ToUpper(new CultureInfo("tr-TR"))
    };
    private static string DatePart(string value, string? mode)
    {
        if (!DateTime.TryParse(value, new CultureInfo("tr-TR"), DateTimeStyles.None, out var date) &&
            !DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out date)) return "";
        return mode?.ToLowerInvariant() switch
        {
            "month" => date.Month.ToString(CultureInfo.InvariantCulture),
            "monthname" => date.ToString("MMMM", new CultureInfo("tr-TR")),
            "day" => date.Day.ToString(CultureInfo.InvariantCulture),
            "weekday" => date.ToString("dddd", new CultureInfo("tr-TR")),
            "quarter" => $"Q{((date.Month - 1) / 3) + 1}",
            _ => date.Year.ToString(CultureInfo.InvariantCulture)
        };
    }
    private static string ExtractText(string value, string? mode, string? marker, int? length)
    {
        var count = Math.Max(0, length ?? (int.TryParse(marker, out var parsed) ? parsed : 0));
        return mode?.ToLowerInvariant() switch
        {
            "right" => value[^Math.Min(count, value.Length)..],
            "before" when !string.IsNullOrEmpty(marker) => value.Split(marker, 2, StringSplitOptions.None)[0],
            "after" when !string.IsNullOrEmpty(marker) => value.Contains(marker, StringComparison.Ordinal) ? value.Split(marker, 2, StringSplitOptions.None).ElementAtOrDefault(1) ?? "" : "",
            _ => value[..Math.Min(count, value.Length)]
        };
    }
    private static string Aggregate(IEnumerable<Dictionary<string, string>> rows, string? valueColumn, string aggregate)
    {
        var list = rows.ToList();
        if (aggregate == "count" || valueColumn is null) return list.Count.ToString(CultureInfo.InvariantCulture);
        var values = list.Select(row => Number(row.GetValueOrDefault(valueColumn, ""))).ToList();
        var result = aggregate switch
        {
            "average" => values.Count == 0 ? 0 : values.Average(),
            "min" => values.Count == 0 ? 0 : values.Min(),
            "max" => values.Count == 0 ? 0 : values.Max(),
            _ => values.Sum()
        };
        return result.ToString("0.##", CultureInfo.InvariantCulture);
    }
    private static string? ValidationError(string value, string mode) => mode.ToLowerInvariant() switch
    {
        "email" => Regex.IsMatch(value, @"^[^@\s]+@[^@\s]+\.[^@\s]+$") ? null : "Geçersiz e-posta",
        "phone" => Regex.IsMatch(new string(value.Where(char.IsDigit).ToArray()), @"^\d{10,15}$") ? null : "Geçersiz telefon",
        "number" => decimal.TryParse(NormalizeNumber(value), NumberStyles.Any, CultureInfo.InvariantCulture, out _) ? null : "Sayı değil",
        "date" => DateTime.TryParse(value, new CultureInfo("tr-TR"), DateTimeStyles.None, out _) ? null : "Geçersiz tarih",
        _ => string.IsNullOrWhiteSpace(value) ? "Zorunlu alan boş" : null
    };
}
