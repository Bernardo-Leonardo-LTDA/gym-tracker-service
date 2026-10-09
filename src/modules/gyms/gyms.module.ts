import { Module } from '@nestjs/common';
import { GymsController } from './gyms.controller';
import { GymsService } from './gyms.service';
import { MapsModule } from '../../shared/services/maps/maps.module';
import { DatabaseModule } from '../../core/database/database.module';
import { SpotifyModule } from '../spotify/spotify.module';
import { GymsEventsService } from './gyms-events.service';
import { GymsEventsController } from './gyms-events.controller';

@Module({
  imports: [MapsModule, DatabaseModule, SpotifyModule],
  controllers: [GymsController, GymsEventsController],
  providers: [GymsService, GymsEventsService],
})
export class GymsModule {}
