using Microsoft.AspNetCore.SignalR;
using Sheetly.Api.Hubs;
using Sheetly.Api.Models;
using Sheetly.Api.Services;

namespace Sheetly.Api.Endpoints;

public static class OperationEndpoints
{
    public static IEndpointRouteBuilder MapOperationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/operations");

        group.MapPost("/plan", async (
            PlanRequest request,
            IWorkspaceStore store,
            IAiPlanService ai,
            ISpreadsheetOperationEngine engine,
            CancellationToken ct) =>
        {
            var source = store.GetFile(request.FileId);
            if (source is null)
                return Results.NotFound(new { error = "Dosya bulunamadı." });

            try
            {
                var plan = await ai.CreatePlanAsync(request.Prompt, source.Columns, ct);
                if (plan.Steps.Count == 0)
                    return Results.BadRequest(new { error = plan.Warnings.FirstOrDefault() ?? "İşlem anlaşılamadı." });

                var result = engine.Apply(source, plan);
                var id = store.SaveOperation(request.FileId, plan, result);

                return Results.Ok(new PlanResponse(
                    id,
                    plan,
                    source.Rows.Count,
                    result.Rows.Count,
                    result.Preview(take: 8).Rows,
                    result.Columns));
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });

        group.MapPost("/prepare", (
            PrepareOperationRequest request,
            IWorkspaceStore store,
            ISpreadsheetOperationEngine engine) =>
        {
            var source = store.GetFile(request.FileId);
            if (source is null)
                return Results.NotFound(new { error = "Dosya bulunamadı." });

            try
            {
                var plan = new OperationPlan(request.Summary ?? "Hazır işlem oluşturuldu.", [request.Step], []);
                var result = engine.Apply(source, plan);
                var id = store.SaveOperation(request.FileId, plan, result);

                return Results.Ok(new PlanResponse(
                    id,
                    plan,
                    source.Rows.Count,
                    result.Rows.Count,
                    result.Preview(take: int.MaxValue).Rows,
                    result.Columns));
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });

        group.MapPost("/prepare-workflow", (
            PrepareWorkflowRequest request,
            IWorkspaceStore store,
            ISpreadsheetOperationEngine engine) =>
        {
            if (request.Steps.Count == 0)
                return Results.BadRequest(new { error = "İşlem şablonunda uygulanacak adım bulunamadı." });

            var source = store.GetFile(request.FileId);
            if (source is null)
                return Results.NotFound(new { error = "Dosya bulunamadı." });

            try
            {
                var plan = new OperationPlan(request.Summary ?? "Kayıtlı işlem şablonu uygulandı.", request.Steps, []);
                var result = engine.Apply(source, plan);
                var operationId = store.SaveOperation(request.FileId, plan, result);

                return Results.Ok(new PlanResponse(
                    operationId,
                    plan,
                    source.Rows.Count,
                    result.Rows.Count,
                    result.Preview(take: int.MaxValue).Rows,
                    result.Columns));
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });

        group.MapPost("/prepare-multiple", (
            PrepareMultiFileOperationRequest request,
            IWorkspaceStore store,
            ISpreadsheetBatchService batch) =>
        {
            if (request.FileIds.Count < 2)
                return Results.BadRequest(new { error = "En az iki Excel dosyası seçmelisin." });

            var documents = request.FileIds.Select(store.GetFile).ToList();
            if (documents.Any(document => document is null))
                return Results.NotFound(new { error = "Seçilen dosyalardan biri bulunamadı." });

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

                return Results.Ok(new PlanResponse(
                    operationId,
                    plan,
                    sources[0].Rows.Count,
                    result.Rows.Count,
                    result.Preview(take: int.MaxValue).Rows,
                    result.Columns));
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });

        group.MapPost("/execute", async (
            ExecuteRequest request,
            IWorkspaceStore store,
            ISpreadsheetService spreadsheets,
            IHubContext<JobHub> hub) =>
        {
            var operation = store.GetOperation(request.OperationId);
            if (operation is null)
                return Results.NotFound(new { error = "İşlem planı bulunamadı." });

            var groupId = request.OperationId.ToString();
            await hub.Clients.Group(groupId).SendAsync("progress", new { progress = 25, message = "İşlem planı doğrulanıyor" });
            await Task.Yield();
            await hub.Clients.Group(groupId).SendAsync("progress", new { progress = 70, message = "Yeni Excel dosyası oluşturuluyor" });

            var bytes = spreadsheets.WriteXlsx(operation.Result);
            store.SaveExport(request.OperationId, bytes);

            await hub.Clients.Group(groupId).SendAsync("progress", new { progress = 100, message = "Dosya hazır" });

            return Results.Ok(new ExecuteResponse(
                request.OperationId,
                "completed",
                operation.Result.Preview(bytes.Length, int.MaxValue),
                $"/api/operations/{request.OperationId}/download"));
        });

        group.MapGet("/{operationId:guid}/download", (
            Guid operationId,
            IWorkspaceStore store) =>
        {
            var bytes = store.GetExport(operationId);
            return bytes is not null
                ? Results.File(
                    bytes,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    $"Sheetly_Sonuc_{DateTime.UtcNow:yyyyMMdd_HHmm}.xlsx")
                : Results.NotFound(new { error = "Sonuç dosyası henüz oluşturulmadı." });
        });

        group.MapPost("/{operationId:guid}/apply", (
            Guid operationId,
            IWorkspaceStore store) =>
        {
            var applied = store.ApplyOperation(operationId);
            return applied is not null
                ? Results.Ok(applied)
                : Results.NotFound(new { error = "Uygulanacak işlem sonucu bulunamadı." });
        });

        group.MapPost("/{operationId:guid}/revert", (
            Guid operationId,
            IWorkspaceStore store) =>
        {
            var restored = store.RevertOperation(operationId);
            return restored is not null
                ? Results.Ok(restored)
                : Results.NotFound(new { error = "Geri alınacak işlem bulunamadı." });
        });

        return app;
    }
}
