using System.Text.Json.Serialization;
using Sheetly.Api.Endpoints;
using Sheetly.Api.Hubs;
using Sheetly.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// JSON Options
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Dependency Injection
builder.Services.AddSingleton<IAuthService, AuthService>();
builder.Services.AddSingleton<ISpreadsheetService, SpreadsheetService>();
builder.Services.AddSingleton<IWorkspaceStore, WorkspaceStore>();
builder.Services.AddSingleton<ISpreadsheetOperationEngine, SpreadsheetOperationEngine>();
builder.Services.AddSingleton<ISpreadsheetBatchService, SpreadsheetBatchService>();
builder.Services.AddSingleton<IAiPlanService, AiPlanService>();

// External services
builder.Services.AddHttpClient("OpenAI", client =>
{
    client.BaseAddress = new Uri("https://api.openai.com/v1/");
    client.Timeout = TimeSpan.FromSeconds(45);
});

// Realtime & CORS
builder.Services.AddSignalR();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .SetIsOriginAllowed(_ => true)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));

var app = builder.Build();

// Security Headers & Middleware
app.UseCors();
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "DENY");
    context.Response.Headers.Append("Referrer-Policy", "no-referrer");
    await next();
});

// Health check
app.MapGet("/api/health", () => Results.Ok(new
{
    status = "healthy",
    service = "Sheetly API",
    utc = DateTimeOffset.UtcNow
}));

// Route modules
app.MapAuthEndpoints();
app.MapFileEndpoints();
app.MapOperationEndpoints();

// SignalR Hubs
app.MapHub<JobHub>("/hubs/jobs");

app.Run();

public partial class Program;
