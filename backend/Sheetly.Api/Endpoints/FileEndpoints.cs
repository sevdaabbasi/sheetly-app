using System.IO.Compression;
using Sheetly.Api.Models;
using Sheetly.Api.Services;

namespace Sheetly.Api.Endpoints;

public static class FileEndpoints
{
    private static readonly string[] AllowedExtensions = [".xlsx", ".csv"];
    private const long MaxFileSizeBytes = 25 * 1024 * 1024; // 25 MB

    public static IEndpointRouteBuilder MapFileEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/files");

        group.MapPost("/upload", async (
            IFormFile file,
            ISpreadsheetService spreadsheets,
            IWorkspaceStore store,
            CancellationToken ct) =>
        {
            if (file.Length == 0)
                return Results.BadRequest(new { error = "Dosya boş." });

            if (file.Length > MaxFileSizeBytes)
                return Results.BadRequest(new { error = "Dosya 25 MB sınırını aşıyor." });

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedExtensions.Contains(extension))
                return Results.BadRequest(new { error = "İkinci hafta motorunda XLSX ve CSV destekleniyor." });

            try
            {
                var document = await spreadsheets.ReadAsync(file, ct);
                var id = store.SaveFile(document);
                return Results.Ok(new UploadResponse(id, document.Preview(file.Length, int.MaxValue)));
            }
            catch (Exception ex) when (ex is InvalidDataException or NotSupportedException)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        }).DisableAntiforgery();

        group.MapGet("/{fileId:guid}/download", (
            Guid fileId,
            IWorkspaceStore store,
            ISpreadsheetService spreadsheets) =>
        {
            var current = store.GetFile(fileId);
            if (current is null)
                return Results.NotFound(new { error = "İndirilecek çalışma dosyası bulunamadı." });

            var bytes = spreadsheets.WriteXlsx(current);
            return Results.File(
                bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                $"Sheetly_Guncel_{DateTime.UtcNow:yyyyMMdd_HHmm}.xlsx");
        });

        group.MapGet("/{fileId:guid}/split", (
            Guid fileId,
            string column,
            IWorkspaceStore store,
            ISpreadsheetService spreadsheets) =>
        {
            var current = store.GetFile(fileId);
            if (current is null)
                return Results.NotFound(new { error = "Bölünecek çalışma dosyası bulunamadı." });

            var actualColumn = current.Columns.FirstOrDefault(item => item.Equals(column, StringComparison.OrdinalIgnoreCase));
            if (actualColumn is null)
                return Results.BadRequest(new { error = $"'{column}' kolonu bulunamadı." });

            using var output = new MemoryStream();
            using (var archive = new ZipArchive(output, ZipArchiveMode.Create, true))
            {
                var groups = current.Rows
                    .Select((row, index) => (row, index))
                    .GroupBy(item => item.row.GetValueOrDefault(actualColumn, ""));

                foreach (var group in groups)
                {
                    var document = current.Clone();
                    var selected = group.ToList();
                    document.Rows = selected.Select(item => item.row.ToDictionary()).ToList();
                    document.RowFills = selected
                        .Select((item, index) => (index, Fill: current.RowFills.GetValueOrDefault(item.index)))
                        .Where(item => !string.IsNullOrWhiteSpace(item.Fill))
                        .ToDictionary(item => item.index, item => item.Fill!);

                    var baseName = string.IsNullOrWhiteSpace(group.Key) ? "Bos" : group.Key;
                    var safeName = string.Concat(baseName.Where(character => !Path.GetInvalidFileNameChars().Contains(character)));
                    if (string.IsNullOrWhiteSpace(safeName)) safeName = "Grup";

                    var entry = archive.CreateEntry($"{safeName}.xlsx", CompressionLevel.Fastest);
                    using var entryStream = entry.Open();
                    var bytes = spreadsheets.WriteXlsx(document);
                    entryStream.Write(bytes);
                }
            }

            return Results.File(
                output.ToArray(),
                "application/zip",
                $"Sheetly_Bolunen_{DateTime.UtcNow:yyyyMMdd_HHmm}.zip");
        });

        return app;
    }
}
