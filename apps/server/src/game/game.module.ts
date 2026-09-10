import { Module } from '@nestjs/common';
import { LobbyModule } from '../lobby/lobby.module';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';

@Module({
  imports: [LobbyModule],
  providers: [GameService, GameGateway],
})
export class GameModule {}
