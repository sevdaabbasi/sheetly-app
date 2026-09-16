using System.Globalization;
using System.Text;
using Sheetly.Api.Models;

namespace Sheetly.Api.Services;

public interface ISpreadsheetBatchService
{
    SpreadsheetDocument Apply(IReadOnlyList<SpreadsheetDocument> documents, PrepareMultiFileOperationRequest request);
}

public sealed class SpreadsheetBatchService : ISpreadsheetBatchService
{
    public SpreadsheetDocument Apply(IReadOnlyList<SpreadsheetDocument> documents, PrepareMultiFileOperationRequest request)
    {
        if (documents.Count < 2) throw new InvalidOperationException("Bu işlem için en az iki Excel dosyası gerekli.");
        return request.Kind switch
        {
            OperationKind.AppendFiles => Append(documents),
            OperationKind.CompareFiles => Compare(documents[0], documents[1], request),
            OperationKind.JoinFiles => Join(documents[0], documents[1], request),
            OperationKind.FullJoinFiles => FullJoin(documents[0], documents[1], request),
            OperationKind.FindMissing => FindMissing(documents[0], documents[1], request),
            _ => throw new InvalidOperationException("Desteklenmeyen çoklu dosya işlemi.")
        };
    }

    private static SpreadsheetDocument Append(IReadOnlyList<SpreadsheetDocument> documents)
    {
        var columns = documents.SelectMany(document => document.Columns).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var sourceColumn = UniqueName(columns, "Kaynak Dosya");
        columns.Insert(0, sourceColumn);
        var rows = new List<Dictionary<string, string>>();
        foreach (var document in documents)
            rows.AddRange(document.Rows.Select(row =>
            {
                var combined = columns.ToDictionary(column => column, _ => "");
                combined[sourceColumn] = document.FileName;
                foreach (var column in document.Columns)
                {
                    var target = columns.First(candidate => candidate.Equals(column, StringComparison.OrdinalIgnoreCase));
                    combined[target] = row.GetValueOrDefault(column, "");
                }
                return combined;
            }));
        return NewDocument(documents[0], "Birleştirilen Dosyalar", columns, rows);
    }

    private static SpreadsheetDocument Compare(SpreadsheetDocument first, SpreadsheetDocument second, PrepareMultiFileOperationRequest request)
    {
        var firstKey = ResolveColumn(first, request.KeyColumn);
        var secondKey = ResolveColumn(second, request.OtherKeyColumn ?? request.KeyColumn);
        var firstRows = first.Rows.GroupBy(row => row.GetValueOrDefault(firstKey, ""), StringComparer.OrdinalIgnoreCase).ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        var secondRows = second.Rows.GroupBy(row => row.GetValueOrDefault(secondKey, ""), StringComparer.OrdinalIgnoreCase).ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        var result = new List<Dictionary<string, string>>();
        foreach (var key in firstRows.Keys.Union(secondRows.Keys, StringComparer.OrdinalIgnoreCase).OrderBy(value => value))
        {
            if (!firstRows.TryGetValue(key, out var left))
            {
                result.Add(Difference("Sadece ikinci dosyada", key, "", "", second.FileName));
                continue;
            }
            if (!secondRows.TryGetValue(key, out var right))
            {
                result.Add(Difference("Sadece ilk dosyada", key, "", first.FileName, ""));
                continue;
            }
            foreach (var column in first.Columns.Where(column => !column.Equals(firstKey, StringComparison.OrdinalIgnoreCase)))
            {
                var otherColumn = second.Columns.FirstOrDefault(candidate => candidate.Equals(column, StringComparison.OrdinalIgnoreCase));
                var leftValue = left.GetValueOrDefault(column, "");
                var rightValue = otherColumn is null ? "" : right.GetValueOrDefault(otherColumn, "");
                if (!leftValue.Equals(rightValue, StringComparison.OrdinalIgnoreCase))
                    result.Add(Difference("Değişti", key, column, leftValue, rightValue));
            }
        }
        return NewDocument(first, "Karşılaştırma", ["Durum", "Anahtar", "Kolon", "İlk Dosya", "İkinci Dosya"], result);
    }

    private static Dictionary<string, string> Difference(string status, string key, string column, string first, string second) => new()
    {
        ["Durum"] = status,
        ["Anahtar"] = key,
        ["Kolon"] = column,
        ["İlk Dosya"] = first,
        ["İkinci Dosya"] = second
    };

    private static SpreadsheetDocument Join(SpreadsheetDocument first, SpreadsheetDocument second, PrepareMultiFileOperationRequest request)
    {
        var firstKey = ResolveColumn(first, request.KeyColumn);
        var secondKey = ResolveColumn(second, request.OtherKeyColumn ?? request.KeyColumn);
        var columns = first.Columns.ToList();
        var secondaryMappings = second.Columns
            .Where(column => !column.Equals(secondKey, StringComparison.OrdinalIgnoreCase))
            .Select(column => (
                Source: column,
                Target: columns.FirstOrDefault(candidate => candidate.Equals(column, StringComparison.OrdinalIgnoreCase)) ?? column))
            .ToList();
        columns.AddRange(secondaryMappings.Select(mapping => mapping.Target).Where(target => !columns.Contains(target, StringComparer.OrdinalIgnoreCase)));
        var rows = first.Rows.Select(left =>
        {
            var result = left.ToDictionary();
            var key = left.GetValueOrDefault(firstKey, "");
            var match = FindMatch(second.Rows, secondKey, key, request.Fuzzy, request.SimilarityThreshold);
            foreach (var mapping in secondaryMappings)
                if (string.IsNullOrWhiteSpace(result.GetValueOrDefault(mapping.Target, "")))
                    result[mapping.Target] = match?.GetValueOrDefault(mapping.Source, "") ?? "";
            foreach (var resultColumn in columns) result.TryAdd(resultColumn, "");
            return result;
        }).ToList();
        return NewDocument(first, "Eşleştirilen Dosyalar", columns, rows);
    }

    private static SpreadsheetDocument FullJoin(SpreadsheetDocument first, SpreadsheetDocument second, PrepareMultiFileOperationRequest request)
    {
        var firstKey = ResolveColumn(first, request.KeyColumn);
        var secondKey = ResolveColumn(second, request.OtherKeyColumn ?? request.KeyColumn);
        var columns = first.Columns
            .Concat(second.Columns)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var matchedSecondRows = new HashSet<Dictionary<string, string>>();
        var rows = new List<Dictionary<string, string>>();

        foreach (var firstRow in first.Rows)
        {
            var combined = MapToColumns(firstRow, columns);
            var match = FindMatch(second.Rows, secondKey, firstRow.GetValueOrDefault(firstKey, ""), request.Fuzzy, request.SimilarityThreshold);
            if (match is not null)
            {
                matchedSecondRows.Add(match);
                MergeMissingValues(combined, match, columns);
            }
            rows.Add(combined);
        }

        foreach (var secondRow in second.Rows.Where(row => !matchedSecondRows.Contains(row)))
            rows.Add(MapToColumns(secondRow, columns));

        return NewDocument(first, "Tam Birleştirme", columns, rows);
    }

    private static SpreadsheetDocument FindMissing(SpreadsheetDocument first, SpreadsheetDocument second, PrepareMultiFileOperationRequest request)
    {
        var firstKey = ResolveColumn(first, request.KeyColumn);
        var secondKey = ResolveColumn(second, request.OtherKeyColumn ?? request.KeyColumn);
        var rows = first.Rows
            .Where(row => FindMatch(second.Rows, secondKey, row.GetValueOrDefault(firstKey, ""), request.Fuzzy, request.SimilarityThreshold) is null)
            .Select(row => row.ToDictionary())
            .ToList();
        return NewDocument(first, "Eksik Kayıtlar", first.Columns.ToList(), rows);
    }

    private static Dictionary<string, string>? FindMatch(IEnumerable<Dictionary<string, string>> rows, string column, string key, bool fuzzy, decimal threshold)
    {
        if (!fuzzy) return rows.FirstOrDefault(row => row.GetValueOrDefault(column, "").Equals(key, StringComparison.OrdinalIgnoreCase));
        return rows
            .Select(row => (Row: row, Score: Similarity(row.GetValueOrDefault(column, ""), key)))
            .Where(item => item.Score >= (double)threshold)
            .OrderByDescending(item => item.Score)
            .Select(item => item.Row)
            .FirstOrDefault();
    }

    private static Dictionary<string, string> MapToColumns(Dictionary<string, string> source, IReadOnlyList<string> columns)
    {
        var result = columns.ToDictionary(column => column, _ => "");
        MergeMissingValues(result, source, columns);
        return result;
    }

    private static void MergeMissingValues(Dictionary<string, string> target, Dictionary<string, string> source, IReadOnlyList<string> columns)
    {
        foreach (var sourceValue in source)
        {
            var targetColumn = columns.First(column => column.Equals(sourceValue.Key, StringComparison.OrdinalIgnoreCase));
            if (string.IsNullOrWhiteSpace(target.GetValueOrDefault(targetColumn, ""))) target[targetColumn] = sourceValue.Value;
        }
    }

    private static double Similarity(string left, string right)
    {
        var a = Normalize(left);
        var b = Normalize(right);
        if (a == b) return 1;
        if (a.Length == 0 || b.Length == 0) return 0;
        var distance = new int[a.Length + 1, b.Length + 1];
        for (var i = 0; i <= a.Length; i++) distance[i, 0] = i;
        for (var j = 0; j <= b.Length; j++) distance[0, j] = j;
        for (var i = 1; i <= a.Length; i++)
            for (var j = 1; j <= b.Length; j++)
                distance[i, j] = Math.Min(
                    Math.Min(distance[i - 1, j] + 1, distance[i, j - 1] + 1),
                    distance[i - 1, j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1));
        return 1d - (double)distance[a.Length, b.Length] / Math.Max(a.Length, b.Length);
    }

    private static string Normalize(string value)
    {
        var decomposed = value.Trim().ToLower(new CultureInfo("tr-TR")).Normalize(NormalizationForm.FormD);
        return new string(decomposed.Where(character => CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark && char.IsLetterOrDigit(character)).ToArray());
    }

    private static SpreadsheetDocument NewDocument(SpreadsheetDocument source, string sheetName, List<string> columns, List<Dictionary<string, string>> rows) => new()
    {
        FileName = $"Sheetly_{Path.GetFileNameWithoutExtension(source.FileName)}.xlsx",
        SheetName = sheetName,
        Columns = columns,
        Rows = rows
    };

    private static string ResolveColumn(SpreadsheetDocument document, string? requested)
    {
        if (string.IsNullOrWhiteSpace(requested)) throw new InvalidOperationException("Eşleştirme kolonu gerekli.");
        return document.Columns.FirstOrDefault(column => column.Equals(requested, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException($"'{requested}' kolonu bulunamadı.");
    }

    private static string UniqueName(IReadOnlyCollection<string> columns, string requested)
    {
        if (!columns.Contains(requested, StringComparer.OrdinalIgnoreCase)) return requested;
        var index = 2;
        while (columns.Contains($"{requested} ({index})", StringComparer.OrdinalIgnoreCase)) index++;
        return $"{requested} ({index})";
    }
}
