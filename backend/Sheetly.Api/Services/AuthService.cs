using System.Collections.Concurrent;
using System.Security.Cryptography;
using Sheetly.Api.Models;

namespace Sheetly.Api.Services;

public interface IAuthService
{
    AuthResponse Register(RegisterRequest request);
    AuthResponse? Login(LoginRequest request);
    UserView? Resolve(string token);
}

public sealed class AuthService : IAuthService
{
    private sealed record User(Guid Id, string Name, string Email, byte[] Hash, byte[] Salt, DateTimeOffset CreatedAt);
    private readonly ConcurrentDictionary<string, User> _users = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, Guid> _sessions = new();

    public AuthResponse Register(RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (request.Password.Length < 8) throw new ArgumentException("Şifre en az 8 karakter olmalı.");
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(request.Password, salt, 100_000, HashAlgorithmName.SHA256, 32);
        var user = new User(Guid.NewGuid(), request.Name.Trim(), email, hash, salt, DateTimeOffset.UtcNow);
        if (!_users.TryAdd(email, user)) throw new InvalidOperationException("Bu e-posta zaten kayıtlı.");
        return CreateSession(user);
    }

    public AuthResponse? Login(LoginRequest request)
    {
        if (!_users.TryGetValue(request.Email.Trim(), out var user)) return null;
        var hash = Rfc2898DeriveBytes.Pbkdf2(request.Password, user.Salt, 100_000, HashAlgorithmName.SHA256, 32);
        return CryptographicOperations.FixedTimeEquals(hash, user.Hash) ? CreateSession(user) : null;
    }

    public UserView? Resolve(string token)
    {
        if (!_sessions.TryGetValue(token, out var id)) return null;
        var user = _users.Values.FirstOrDefault(x => x.Id == id);
        return user is null ? null : View(user);
    }

    private AuthResponse CreateSession(User user)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        _sessions[token] = user.Id;
        return new AuthResponse(token, View(user));
    }
    private static UserView View(User user) => new(user.Id, user.Name, user.Email, user.CreatedAt);
}
