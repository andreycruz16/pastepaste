namespace Pasteroom.Server.Models;

public sealed record EncryptedClipboard(string Ciphertext, string Iv);
