namespace Pasteroom.Server.Models;

public sealed class RoomState
{
    private readonly HashSet<string> _connections = [];

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
}
