# Build stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY ["backend/Sheetly.Api/Sheetly.Api.csproj", "backend/Sheetly.Api/"]
RUN dotnet restore "backend/Sheetly.Api/Sheetly.Api.csproj"

COPY backend/ backend/
WORKDIR "/src/backend/Sheetly.Api"
RUN dotnet publish "Sheetly.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "Sheetly.Api.dll"]
