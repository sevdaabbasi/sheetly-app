using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Sheetly.Api.Models;

namespace Sheetly.Api.Services;

public interface IAiPlanService { Task<OperationPlan> CreatePlanAsync(string prompt, IReadOnlyList<string> columns, CancellationToken ct); }

public sealed partial class AiPlanService(IHttpClientFactory clients, IConfiguration configuration, ILogger<AiPlanService> logger) : IAiPlanService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    public async Task<OperationPlan> CreatePlanAsync(string prompt, IReadOnlyList<string> columns, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(prompt)) throw new ArgumentException("İşlem komutu boş olamaz.");
        if (!configuration.GetValue("OpenAI:Enabled", false)) return CreateLocalPlan(prompt, columns);
        var apiKey = configuration["OpenAI:ApiKey"] ?? Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey)) return CreateLocalPlan(prompt, columns);
        try { return await CreateOpenAiPlan(prompt, columns, apiKey, ct); }
        catch (Exception ex) { logger.LogWarning(ex, "AI planı üretilemedi; yerel yorumlayıcı kullanılacak."); return CreateLocalPlan(prompt, columns); }
    }

    private async Task<OperationPlan> CreateOpenAiPlan(string prompt, IReadOnlyList<string> columns, string apiKey, CancellationToken ct)
    {
        var client = clients.CreateClient("OpenAI");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        var instructions = """
        Role: You convert Turkish spreadsheet requests into a safe deterministic operation plan.
        Goal: Return only operations allowed by the JSON schema. Preserve the user's column names exactly from the supplied list.
        Success: Every step is executable; never invent a column; summarize affected work in Turkish.
        Constraints: Do not output code, formulas, file paths, SQL, or destructive file operations. If intent is ambiguous, return no steps and explain it in warnings.
        """;
        var schema = new { type = "object", additionalProperties = false, required = new[] { "summary", "steps", "warnings" }, properties = new { summary = new { type = "string" }, warnings = new { type = "array", items = new { type = "string" } }, steps = new { type = "array", items = new { type = "object", additionalProperties = false, required = new[] { "kind", "column", "operator", "value", "newName", "descending", "secondColumn", "formulaOperator", "color" }, properties = new { kind = new { type = "string", @enum = Enum.GetNames<OperationKind>() }, column = new { type = new[] { "string", "null" } }, @operator = new { type = new[] { "string", "null" }, @enum = Enum.GetNames<FilterOperator>().Cast<string?>().Append(null) }, value = new { type = new[] { "string", "null" } }, newName = new { type = new[] { "string", "null" } }, descending = new { type = "boolean" }, secondColumn = new { type = new[] { "string", "null" } }, formulaOperator = new { type = new[] { "string", "null" } }, color = new { type = new[] { "string", "null" } } } } } } };
        var payload = new { model = "gpt-5.6-sol", reasoning = new { effort = "low" }, instructions, input = $"Kolonlar: {JsonSerializer.Serialize(columns)}\nKullanıcı isteği: {prompt}", text = new { format = new { type = "json_schema", name = "spreadsheet_operation_plan", strict = true, schema } } };
        using var response = await client.PostAsync("responses", new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"), ct);
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var outputText = doc.RootElement.TryGetProperty("output_text", out var direct) ? direct.GetString() : doc.RootElement.GetProperty("output").EnumerateArray().SelectMany(o => o.TryGetProperty("content", out var content) ? content.EnumerateArray() : []).FirstOrDefault(c => c.TryGetProperty("text", out _)).GetProperty("text").GetString();
        return JsonSerializer.Deserialize<OperationPlan>(outputText ?? "", JsonOptions) ?? throw new InvalidDataException("AI planı okunamadı.");
    }

    private static OperationPlan CreateLocalPlan(string prompt, IReadOnlyList<string> columns)
    {
        var text = prompt.Trim(); var lower = text.ToLowerInvariant(); var column = FindColumn(text, columns); var steps = new List<OperationStep>();
        if (lower.Contains("satır") && (lower.Contains("boya") || lower.Contains("renklendir"))) steps.Add(new(OperationKind.HighlightRows, column, FilterOperator.Contains, ExtractConditionValue(text), Color: ResolveColor(lower)));
        else if (lower.Contains("satır") && (lower.Contains("sil") || lower.Contains("kaldır"))) steps.Add(new(OperationKind.DeleteRows, column, FilterOperator.Contains, ExtractConditionValue(text)));
        else if (lower.Contains("mükerrer") || lower.Contains("tekrar") || lower.Contains("duplicate")) steps.Add(new(OperationKind.RemoveDuplicates, column));
        else if ((lower.Contains("boş") || lower.Contains("eksik")) && (lower.Contains("doldur") || lower.Contains("yerine"))) steps.Add(new(OperationKind.FillBlanks, column, Value: QuotedValue(text) ?? "0"));
        else if (lower.Contains("kolon") && (lower.Contains("sil") || lower.Contains("kaldır"))) steps.Add(new(OperationKind.DeleteColumn, column));
        else if ((lower.Contains("adını") || lower.Contains("yeniden adlandır")) && column is not null) steps.Add(new(OperationKind.RenameColumn, column, NewName: QuotedValues(text).Skip(1).FirstOrDefault() ?? QuotedValue(text)));
        else if (lower.Contains("sırala")) steps.Add(new(OperationKind.Sort, column ?? columns.FirstOrDefault(), Descending: lower.Contains("azalan") || lower.Contains("yüksekten") || lower.Contains("büyükten")));
        else if (lower.Contains("topla") || lower.Contains("çıkar") || lower.Contains("çarp") || lower.Contains("böl")) { var matched = columns.Where(c => lower.Contains(c.ToLowerInvariant())).Take(2).ToList(); if (matched.Count == 2) steps.Add(new(OperationKind.AddCalculatedColumn, matched[0], NewName: "Hesaplanan", SecondColumn: matched[1], FormulaOperator: lower.Contains("çıkar") ? "-" : lower.Contains("çarp") ? "*" : lower.Contains("böl") ? "/" : "+")); }
        else
        {
            var number = NumberRegex().Match(text).Value;
            var op = lower.Contains("yüksek") || lower.Contains("büyük") || lower.Contains("fazla") ? FilterOperator.GreaterThan : lower.Contains("düşük") || lower.Contains("küçük") || lower.Contains("az") ? FilterOperator.LessThan : lower.Contains("eşit") ? FilterOperator.Equals : FilterOperator.Contains;
            steps.Add(new(OperationKind.Filter, column ?? columns.FirstOrDefault(), op, string.IsNullOrEmpty(number) ? QuotedValue(text) ?? LastMeaningfulWord(text) : number));
        }
        var warnings = steps.Any(s => string.IsNullOrWhiteSpace(s.Column) && s.Kind is not OperationKind.RemoveDuplicates and not OperationKind.FillBlanks) ? new[] { "İşlem yapılacak kolon belirlenemedi." } : Array.Empty<string>();
        return new($"{steps.Count} adımlı işlem planı hazırlandı. Orijinal dosya korunacak.", steps, warnings);
    }

    private static string? FindColumn(string prompt, IReadOnlyList<string> columns) => columns.OrderByDescending(c => c.Length).FirstOrDefault(c => prompt.Contains(c, StringComparison.OrdinalIgnoreCase));
    private static string? QuotedValue(string text) => QuotedValues(text).FirstOrDefault();
    private static IEnumerable<string> QuotedValues(string text) => QuoteRegex().Matches(text).Select(m => m.Groups[1].Value);
    private static string ExtractConditionValue(string text)
    {
        if (QuotedValue(text) is { Length: > 0 } quoted) return quoted;
        var match = ConditionValueRegex().Match(text);
        return match.Success ? match.Groups[1].Value.Trim() : LastMeaningfulWord(text);
    }
    private static string LastMeaningfulWord(string text) => text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Last().Trim('.', ',', '!', '?');
    private static string ResolveColor(string text) => text.Contains("kırmızı") ? "#FECACA" : text.Contains("yeşil") ? "#BBF7D0" : text.Contains("mavi") ? "#BFDBFE" : text.Contains("turuncu") ? "#FED7AA" : "#FEF08A";
    [GeneratedRegex(@"[-+]?\d[\d.,]*")] private static partial Regex NumberRegex();
    [GeneratedRegex("[\"']([^\"']+)[\"']")] private static partial Regex QuoteRegex();
    [GeneratedRegex(@"(?:kolonunda|sütununda)\s+(.+?)\s+(?:değerini\s+)?(?:içeren|olan|yazan|bulunan)\b", RegexOptions.IgnoreCase)] private static partial Regex ConditionValueRegex();
}
