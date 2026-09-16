using System.Collections.Concurrent;
using Sheetly.Api.Models;

namespace Sheetly.Api.Services;

public sealed record PendingOperation(
    Guid Id,
    Guid FileId,
    OperationPlan Plan,
    SpreadsheetDocument Original,
    SpreadsheetDocument Result);

public interface IWorkspaceStore
{
    Guid SaveFile(SpreadsheetDocument document);
    SpreadsheetDocument? GetFile(Guid id);
    Guid SaveOperation(Guid fileId, OperationPlan plan, SpreadsheetDocument result);
    PendingOperation? GetOperation(Guid id);
    UploadResponse? ApplyOperation(Guid operationId);
    UploadResponse? RevertOperation(Guid operationId);
    void SaveExport(Guid operationId, byte[] bytes);
    byte[]? GetExport(Guid operationId);
}

public sealed class WorkspaceStore : IWorkspaceStore
{
    private readonly ConcurrentDictionary<Guid, SpreadsheetDocument> _originalFiles = new();
    private readonly ConcurrentDictionary<Guid, SpreadsheetDocument> _files = new();
    private readonly ConcurrentDictionary<Guid, PendingOperation> _operations = new();
    private readonly ConcurrentDictionary<Guid, byte[]> _exports = new();
    public Guid SaveFile(SpreadsheetDocument document)
    {
        var id = Guid.NewGuid();
        _originalFiles[id] = document.Clone();
        _files[id] = document.Clone();
        return id;
    }
    public SpreadsheetDocument? GetFile(Guid id) => _files.GetValueOrDefault(id);
    public Guid SaveOperation(Guid fileId, OperationPlan plan, SpreadsheetDocument result)
    {
        if (!_files.TryGetValue(fileId, out var current)) throw new InvalidOperationException("Kaynak dosya bulunamadı.");
        var id = Guid.NewGuid();
        _operations[id] = new(id, fileId, plan, current.Clone(), result);
        return id;
    }
    public PendingOperation? GetOperation(Guid id) => _operations.GetValueOrDefault(id);
    public UploadResponse? ApplyOperation(Guid operationId)
    {
        if (!_operations.TryGetValue(operationId, out var operation)) return null;
        var updated = operation.Result.Clone();
        updated.FileName = operation.Original.FileName;
        _files[operation.FileId] = updated;
        return new UploadResponse(operation.FileId, updated.Preview(take: int.MaxValue));
    }
    public UploadResponse? RevertOperation(Guid operationId)
    {
        if (!_operations.TryGetValue(operationId, out var operation)) return null;
        var restored = operation.Original.Clone();
        _files[operation.FileId] = restored;
        return new UploadResponse(operation.FileId, restored.Preview(take: int.MaxValue));
    }
    public void SaveExport(Guid operationId, byte[] bytes) => _exports[operationId] = bytes;
    public byte[]? GetExport(Guid operationId) => _exports.GetValueOrDefault(operationId);
}
