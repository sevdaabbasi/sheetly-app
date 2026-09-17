using Sheetly.Api.Models;
using Sheetly.Api.Services;

namespace Sheetly.Api.Endpoints;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth");

        group.MapPost("/register", (RegisterRequest request, IAuthService auth) =>
        {
            try
            {
                var result = auth.Register(request);
                return Results.Ok(result);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return Results.Conflict(new { error = ex.Message });
            }
        });

        group.MapPost("/login", (LoginRequest request, IAuthService auth) =>
        {
            var result = auth.Login(request);
            return result is not null
                ? Results.Ok(result)
                : Results.Unauthorized();
        });

        group.MapGet("/me", (HttpRequest request, IAuthService auth) =>
        {
            var header = request.Headers.Authorization.ToString();
            var token = header.Replace("Bearer ", "", StringComparison.OrdinalIgnoreCase).Trim();
            var user = auth.Resolve(token);

            return user is not null
                ? Results.Ok(user)
                : Results.Unauthorized();
        });

        return app;
    }
}
