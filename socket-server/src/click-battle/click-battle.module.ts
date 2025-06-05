import { Module } from '@nestjs/common';
import { ClickBattleService } from './click-battle.service';
import { ClickBattleGateway } from './click-battle.gateway';

@Module({
  providers: [ClickBattleService, ClickBattleGateway],
})
export class ClickBattleModule {}
