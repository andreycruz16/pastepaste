using Pastepaste.Server.Hubs;
using Pastepaste.Server.Services;

var builder = WebApplication.CreateBuilder(args);

var allowedOrigins = builder.Configuration["AllowedOrigins"]?
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    ?? ["http://localhost:5173"];

builder.Services.AddSingleton<RoomService>();
builder.Services.AddSignalR();
builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy => policy
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});

var app = builder.Build();

app.UseCors("frontend");
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapPost("/api/rooms", (RoomService rooms) => Results.Ok(rooms.CreateRoom()));

app.MapPost("/api/rooms/{roomCode}", (string roomCode, RoomService rooms) =>
{
    var room = rooms.GetRoom(roomCode.Trim().ToUpperInvariant());
    return room is null ? Results.NotFound() : Results.Ok(room.ToResponse());
});

app.MapHub<ClipboardHub>("/hubs/clipboard");
app.Run();
