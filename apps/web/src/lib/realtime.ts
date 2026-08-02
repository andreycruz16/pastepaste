import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from '@microsoft/signalr'
import type { EncryptedText } from './crypto'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:5080'

export function createConnection() {
  return new HubConnectionBuilder()
    .withUrl(`${apiUrl}/hubs/clipboard`)
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()
}

export async function connectToRoom(connection: HubConnection, roomCode: string) {
  if (connection.state === HubConnectionState.Disconnected) {
    await connection.start()
  }

  await connection.invoke('JoinRoom', roomCode)
}

export async function sendClipboard(
  connection: HubConnection,
  roomCode: string,
  encryptedText: EncryptedText,
) {
  await connection.invoke('UpdateClipboard', roomCode, encryptedText)
}

export async function disconnectFromRoom(connection: HubConnection, roomCode: string) {
  if (connection.state !== HubConnectionState.Disconnected) {
    await connection.invoke('LeaveRoom', roomCode).catch(() => undefined)
    await connection.stop()
  }
}
