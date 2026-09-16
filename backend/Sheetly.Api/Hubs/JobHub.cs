using Microsoft.AspNetCore.SignalR;

namespace Sheetly.Api.Hubs;

public sealed class JobHub : Hub
{
    public Task WatchOperation(string operationId) => Groups.AddToGroupAsync(Context.ConnectionId, operationId);
}
