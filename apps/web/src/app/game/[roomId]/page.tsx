import { GameRoomClient } from './GameRoomClient';

export default async function GameRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <GameRoomClient roomId={roomId} />;
}
