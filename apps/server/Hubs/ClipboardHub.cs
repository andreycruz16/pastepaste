using Microsoft.AspNetCore.SignalR;
using Pasteroom.Server.Models;
using Pasteroom.Server.Services;

namespace Pasteroom.Server.Hubs;

public sealed class ClipboardHub(RoomService rooms) : Hub
{
    public async Task JoinRoom(string roomCode)
    {
        var room = rooms.GetRoom(roomCode.Trim().ToUpperInvariant())
            ?? throw new HubException("Room not found.");

        rooms.AddConnection(room, Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomCode);

        if (room.LatestClipboard is not null)
        {
            await Clients.Caller.SendAsync("ClipboardSnapshot", room.LatestClipboard);
        }
    }

    public async Task UpdateClipboard(string roomCode, EncryptedClipboard clipboard)
    {
        var room = rooms.GetRoom(roomCode.Trim().ToUpperInvariant())
            ?? throw new HubException("Room not found.");

        rooms.UpdateClipboard(room, clipboard);
        await Clients.Group(room.RoomCode).SendAsync("ClipboardUpdated", clipboard);
    }

    public async Task LeaveRoom(string roomCode)
    {
        var normalizedCode = roomCode.Trim().ToUpperInvariant();
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, normalizedCode);
        rooms.RemoveConnection(Context.ConnectionId);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        rooms.RemoveConnection(Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
}
