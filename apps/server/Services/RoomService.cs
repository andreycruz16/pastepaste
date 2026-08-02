using System.Collections.Concurrent;
using System.Security.Cryptography;
using Pastepaste.Server.Models;

namespace Pastepaste.Server.Services;

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

            var response = CreateRoom(code);
            if (response is not null) return response;
        }
    }

    public RoomResponse? CreateRoom(string roomCode)
    {
        var code = roomCode.Trim().ToUpperInvariant();
        if (code.Length != 5 || !code.All(character => Alphabet.Contains(character))) return null;

        var room = new RoomState
        {
            RoomCode = code,
            Salt = Convert.ToBase64String(RandomNumberGenerator.GetBytes(16)),
        };

        return _rooms.TryAdd(code, room) ? room.ToResponse() : null;
    }

    public RoomResponse? GetOrCreateRoom(string roomCode)
    {
        var code = roomCode.Trim().ToUpperInvariant();
        if (code.Length != 5 || !code.All(character => Alphabet.Contains(character))) return null;

        if (_rooms.TryGetValue(code, out var existingRoom)) return existingRoom.ToResponse();
        return CreateRoom(code) ?? _rooms.GetValueOrDefault(code)?.ToResponse();
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
