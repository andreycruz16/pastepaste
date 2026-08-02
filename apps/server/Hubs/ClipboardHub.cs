using Microsoft.AspNetCore.SignalR;
using Pastepaste.Server.Models;
using Pastepaste.Server.Services;

namespace Pastepaste.Server.Hubs;

public sealed class ClipboardHub(RoomService rooms) : Hub
{
    public async Task JoinRoom(string roomCode, string preferredName)
    {
        var room = rooms.GetRoom(roomCode.Trim().ToUpperInvariant())
            ?? throw new HubException("Room not found.");

        rooms.AddConnection(room, Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomCode);

        var name = rooms.AssignName(room, Context.ConnectionId, preferredName);
        await Clients.Caller.SendAsync("NameAssigned", name);
        await BroadcastParticipants(room.RoomCode);

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
        await BroadcastParticipants(normalizedCode);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var roomCode = rooms.GetRoomCodeForConnection(Context.ConnectionId);
        rooms.RemoveConnection(Context.ConnectionId);
        if (roomCode is not null) await BroadcastParticipants(roomCode);
        await base.OnDisconnectedAsync(exception);
    }

    private async Task BroadcastParticipants(string roomCode)
    {
        var room = rooms.GetRoom(roomCode);
        if (room is not null)
        {
            await Clients.Group(room.RoomCode).SendAsync("ParticipantsUpdated", rooms.GetRoomNames(room));
        }
    }
}
