namespace Pastepaste.Server.Models;

public sealed class RoomState
{
    private readonly HashSet<string> _connections = [];
    private readonly HashSet<string> _names = [];

    public required string RoomCode { get; init; }
    public required string Salt { get; init; }
    public EncryptedClipboard? LatestClipboard { get; private set; }

    public RoomResponse ToResponse() => new(RoomCode, Salt);

    public void AddConnection(string connectionId)
    {
        lock (_connections) _connections.Add(connectionId);
    }

    public bool RemoveConnection(string connectionId)
    {
        lock (_connections)
        {
            _connections.Remove(connectionId);
            return _connections.Count == 0;
        }
    }

    public void UpdateClipboard(EncryptedClipboard clipboard) => LatestClipboard = clipboard;

    public bool TryReserveName(string name)
    {
        lock (_names) return _names.Add(name);
    }

    public void ReleaseName(string name)
    {
        lock (_names) _names.Remove(name);
    }

    public IReadOnlyList<string> GetNames()
    {
        lock (_names) return [.. _names];
    }
}
