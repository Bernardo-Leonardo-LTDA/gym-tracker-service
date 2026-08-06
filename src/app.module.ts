import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { MapsService } from './shared/services/maps/maps.service';
import { GymsModule } from './modules/gyms/gyms.module';
import { GymsController } from './modules/gyms/gyms.controller';
import { SpotifyModule } from './modules/spotify/spotify.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // load env variables globally
    ScheduleModule.forRoot(),
    GymsModule,
    SpotifyModule,
  ],
  controllers: [AppController],
  providers: [AppService, MapsService],
})
export class AppModule {}
