using System.Collections.Concurrent;
using System.Security.Cryptography;
using Pasteroom.Server.Models;

namespace Pasteroom.Server.Services;

public sealed class RoomService
{
    private const string Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private readonly ConcurrentDictionary<string, RoomState> _rooms = new();
    private readonly ConcurrentDictionary<string, string> _connectionRooms = new();

    public RoomResponse CreateRoom()
    {
        while (true)
        {
            var code = string.Concat(Enumerable.Range(0, 5)
                .Select(_ => Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)]));
            var room = new RoomState
            {
                RoomCode = code,
                Salt = Convert.ToBase64String(RandomNumberGenerator.GetBytes(16)),
            };

            if (_rooms.TryAdd(code, room)) return room.ToResponse();
        }
    }

    public RoomState? GetRoom(string roomCode) =>
        roomCode.Length == 5 && roomCode.All(character => Alphabet.Contains(character))
            ? _rooms.GetValueOrDefault(roomCode)
            : null;

    public void AddConnection(RoomState room, string connectionId)
    {
        if (_connectionRooms.TryGetValue(connectionId, out var previousCode) && previousCode != room.RoomCode)
        {
            RemoveConnection(previousCode, connectionId);
        }

        room.AddConnection(connectionId);
        _connectionRooms[connectionId] = room.RoomCode;
    }

    public void UpdateClipboard(RoomState room, EncryptedClipboard clipboard) => room.UpdateClipboard(clipboard);

    public void RemoveConnection(string connectionId)
    {
        if (_connectionRooms.TryRemove(connectionId, out var roomCode)) RemoveConnection(roomCode, connectionId);
    }

    public void RemoveConnection(string roomCode, string connectionId)
    {
        if (_rooms.TryGetValue(roomCode, out var room) && room.RemoveConnection(connectionId))
        {
            _rooms.TryRemove(roomCode, out _);
        }

        _connectionRooms.TryRemove(connectionId, out _);
    }
}
