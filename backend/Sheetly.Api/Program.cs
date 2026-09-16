using System.IO.Compression;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.SignalR;
using Sheetly.Api.Hubs;
using Sheetly.Api.Models;
using Sheetly.Api.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddSingleton<IAuthService, AuthService>();
builder.Services.AddSingleton<ISpreadsheetService, SpreadsheetService>();
builder.Services.AddSingleton<IWorkspaceStore, WorkspaceStore>();
builder.Services.AddSingleton<ISpreadsheetOperationEngine, SpreadsheetOperationEngine>();
builder.Services.AddSingleton<ISpreadsheetBatchService, SpreadsheetBatchService>();
builder.Services.AddSingleton<IAiPlanService, AiPlanService>();
builder.Services.AddHttpClient("OpenAI", client => { client.BaseAddress = new Uri("https://api.openai.com/v1/"); client.Timeout = TimeSpan.FromSeconds(45); });
builder.Services.AddSignalR();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .SetIsOriginAllowed(_ => true)
    .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();
app.UseCors();
app.Use(async (context, next) => { context.Response.Headers.Append("X-Content-Type-Options", "nosniff"); context.Response.Headers.Append("X-Frame-Options", "DENY"); context.Response.Headers.Append("Referrer-Policy", "no-referrer"); await next(); });

app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", service = "Sheetly API", utc = DateTimeOffset.UtcNow }));
app.MapPost("/api/auth/register", (RegisterRequest request, IAuthService auth) => { try { return Results.Ok(auth.Register(request)); } catch (ArgumentException ex) { return Results.BadRequest(new { error = ex.Message }); } catch (InvalidOperationException ex) { return Results.Conflict(new { error = ex.Message }); } });
app.MapPost("/api/auth/login", (LoginRequest request, IAuthService auth) => auth.Login(request) is { } result ? Results.Ok(result) : Results.Unauthorized());
app.MapGet("/api/auth/me", (HttpRequest request, IAuthService auth) => auth.Resolve(request.Headers.Authorization.ToString().Replace("Bearer ", "", StringComparison.OrdinalIgnoreCase)) is { } user ? Results.Ok(user) : Results.Unauthorized());

app.MapPost("/api/files/upload", async (IFormFile file, ISpreadsheetService spreadsheets, IWorkspaceStore store, CancellationToken ct) =>
{
    if (file.Length == 0) return Results.BadRequest(new { error = "Dosya boş." });
    if (file.Length > 25 * 1024 * 1024) return Results.BadRequest(new { error = "Dosya 25 MB sınırını aşıyor." });
    if (!new[] { ".xlsx", ".csv" }.Contains(Path.GetExtension(file.FileName).ToLowerInvariant())) return Results.BadRequest(new { error = "İkinci hafta motorunda XLSX ve CSV destekleniyor." });
    try { var document = await spreadsheets.ReadAsync(file, ct); var id = store.SaveFile(document); return Results.Ok(new UploadResponse(id, document.Preview(file.Length, int.MaxValue))); }
    catch (Exception ex) when (ex is InvalidDataException or NotSupportedException) { return Results.BadRequest(new { error = ex.Message }); }
}).DisableAntiforgery();

app.MapPost("/api/operations/plan", async (PlanRequest request, IWorkspaceStore store, IAiPlanService ai, ISpreadsheetOperationEngine engine, CancellationToken ct) =>
{
    var source = store.GetFile(request.FileId); if (source is null) return Results.NotFound(new { error = "Dosya bulunamadı." });
    try { var plan = await ai.CreatePlanAsync(request.Prompt, source.Columns, ct); if (plan.Steps.Count == 0) return Results.BadRequest(new { error = plan.Warnings.FirstOrDefault() ?? "İşlem anlaşılamadı." }); var result = engine.Apply(source, plan); var id = store.SaveOperation(request.FileId, plan, result); return Results.Ok(new PlanResponse(id, plan, source.Rows.Count, result.Rows.Count, result.Preview(take: 8).Rows, result.Columns)); }
    catch (Exception ex) when (ex is ArgumentException or InvalidOperationException) { return Results.BadRequest(new { error = ex.Message }); }
});

app.MapPost("/api/operations/prepare", (PrepareOperationRequest request, IWorkspaceStore store, ISpreadsheetOperationEngine engine) =>
{
    var source = store.GetFile(request.FileId); if (source is null) return Results.NotFound(new { error = "Dosya bulunamadı." });
    try
    {
        var plan = new OperationPlan(request.Summary ?? "Hazır işlem oluşturuldu.", [request.Step], []);
        var result = engine.Apply(source, plan); var id = store.SaveOperation(request.FileId, plan, result);
        return Results.Ok(new PlanResponse(id, plan, source.Rows.Count, result.Rows.Count, result.Preview(take: int.MaxValue).Rows, result.Columns));
    }
    catch (Exception ex) when (ex is ArgumentException or InvalidOperationException) { return Results.BadRequest(new { error = ex.Message }); }
});

app.MapPost("/api/operations/prepare-workflow", (PrepareWorkflowRequest request, IWorkspaceStore store, ISpreadsheetOperationEngine engine) =>
{
    if (request.Steps.Count == 0) return Results.BadRequest(new { error = "İşlem şablonunda uygulanacak adım bulunamadı." });
    var source = store.GetFile(request.FileId);
    if (source is null) return Results.NotFound(new { error = "Dosya bulunamadı." });
    try
    {
        var plan = new OperationPlan(request.Summary ?? "Kayıtlı işlem şablonu uygulandı.", request.Steps, []);
        var result = engine.Apply(source, plan);
        var operationId = store.SaveOperation(request.FileId, plan, result);
        return Results.Ok(new PlanResponse(operationId, plan, source.Rows.Count, result.Rows.Count, result.Preview(take: int.MaxValue).Rows, result.Columns));
    }
    catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapPost("/api/operations/prepare-multiple", (PrepareMultiFileOperationRequest request, IWorkspaceStore store, ISpreadsheetBatchService batch) =>
{
    if (request.FileIds.Count < 2) return Results.BadRequest(new { error = "En az iki Excel dosyası seçmelisin." });
    var documents = request.FileIds.Select(store.GetFile).ToList();
    if (documents.Any(document => document is null)) return Results.NotFound(new { error = "Seçilen dosyalardan biri bulunamadı." });
    try
    {
        var sources = documents.Select(document => document!).ToList();
        var result = batch.Apply(sources, request);
        var step = new OperationStep(
            request.Kind,
            request.KeyColumn,
            SecondColumn: request.OtherKeyColumn,
            Mode: request.Fuzzy ? "fuzzy" : "exact");
        var plan = new OperationPlan(request.Summary ?? "Çoklu dosya işlemi hazırlandı.", [step], []);
        var operationId = store.SaveOperation(request.FileIds[0], plan, result);
        return Results.Ok(new PlanResponse(operationId, plan, sources[0].Rows.Count, result.Rows.Count, result.Preview(take: int.MaxValue).Rows, result.Columns));
    }
    catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapPost("/api/operations/execute", async (ExecuteRequest request, IWorkspaceStore store, ISpreadsheetService spreadsheets, IHubContext<JobHub> hub) =>
{
    var operation = store.GetOperation(request.OperationId); if (operation is null) return Results.NotFound(new { error = "İşlem planı bulunamadı." });
    await hub.Clients.Group(request.OperationId.ToString()).SendAsync("progress", new { progress = 25, message = "İşlem planı doğrulanıyor" });
    await Task.Yield();
    await hub.Clients.Group(request.OperationId.ToString()).SendAsync("progress", new { progress = 70, message = "Yeni Excel dosyası oluşturuluyor" });
    var bytes = spreadsheets.WriteXlsx(operation.Result); store.SaveExport(request.OperationId, bytes);
    await hub.Clients.Group(request.OperationId.ToString()).SendAsync("progress", new { progress = 100, message = "Dosya hazır" });
    return Results.Ok(new ExecuteResponse(request.OperationId, "completed", operation.Result.Preview(bytes.Length, int.MaxValue), $"/api/operations/{request.OperationId}/download"));
});

app.MapGet("/api/operations/{operationId:guid}/download", (Guid operationId, IWorkspaceStore store) => store.GetExport(operationId) is { } bytes ? Results.File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"Sheetly_Sonuc_{DateTime.UtcNow:yyyyMMdd_HHmm}.xlsx") : Results.NotFound(new { error = "Sonuç dosyası henüz oluşturulmadı." }));
app.MapGet("/api/files/{fileId:guid}/download", (Guid fileId, IWorkspaceStore store, ISpreadsheetService spreadsheets) =>
{
    var current = store.GetFile(fileId);
    if (current is null) return Results.NotFound(new { error = "İndirilecek çalışma dosyası bulunamadı." });
    var bytes = spreadsheets.WriteXlsx(current);
    return Results.File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"Sheetly_Guncel_{DateTime.UtcNow:yyyyMMdd_HHmm}.xlsx");
});
app.MapGet("/api/files/{fileId:guid}/split", (Guid fileId, string column, IWorkspaceStore store, ISpreadsheetService spreadsheets) =>
{
    var current = store.GetFile(fileId);
    if (current is null) return Results.NotFound(new { error = "Bölünecek çalışma dosyası bulunamadı." });
    var actualColumn = current.Columns.FirstOrDefault(item => item.Equals(column, StringComparison.OrdinalIgnoreCase));
    if (actualColumn is null) return Results.BadRequest(new { error = $"'{column}' kolonu bulunamadı." });

    using var output = new MemoryStream();
    using (var archive = new ZipArchive(output, ZipArchiveMode.Create, true))
    {
        foreach (var group in current.Rows.Select((row, index) => (row, index)).GroupBy(item => item.row.GetValueOrDefault(actualColumn, "")))
        {
            var document = current.Clone();
            var selected = group.ToList();
            document.Rows = selected.Select(item => item.row.ToDictionary()).ToList();
            document.RowFills = selected
                .Select((item, index) => (index, Fill: current.RowFills.GetValueOrDefault(item.index)))
                .Where(item => !string.IsNullOrWhiteSpace(item.Fill))
                .ToDictionary(item => item.index, item => item.Fill!);
            var safeName = string.Concat((string.IsNullOrWhiteSpace(group.Key) ? "Bos" : group.Key).Where(character => !Path.GetInvalidFileNameChars().Contains(character)));
            if (string.IsNullOrWhiteSpace(safeName)) safeName = "Grup";
            var entry = archive.CreateEntry($"{safeName}.xlsx", CompressionLevel.Fastest);
            using var entryStream = entry.Open();
            var bytes = spreadsheets.WriteXlsx(document);
            entryStream.Write(bytes);
        }
    }
    return Results.File(output.ToArray(), "application/zip", $"Sheetly_Bolunen_{DateTime.UtcNow:yyyyMMdd_HHmm}.zip");
});
app.MapPost("/api/operations/{operationId:guid}/apply", (Guid operationId, IWorkspaceStore store) =>
    store.ApplyOperation(operationId) is { } applied
        ? Results.Ok(applied)
        : Results.NotFound(new { error = "Uygulanacak işlem sonucu bulunamadı." }));
app.MapPost("/api/operations/{operationId:guid}/revert", (Guid operationId, IWorkspaceStore store) =>
    store.RevertOperation(operationId) is { } restored
        ? Results.Ok(restored)
        : Results.NotFound(new { error = "Geri alınacak işlem bulunamadı." }));
app.MapHub<JobHub>("/hubs/jobs");

app.Run();

public partial class Program;
