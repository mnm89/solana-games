import { Module } from '@nestjs/common';
import { ClickBattleModule } from './click-battle/click-battle.module';

@Module({
  imports: [ClickBattleModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
