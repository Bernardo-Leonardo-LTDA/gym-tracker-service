import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { MapsService } from './shared/services/maps/maps.service';
import { GymsService } from './modules/gyms/gyms.service';
import { GymsModule } from './modules/gyms/gyms.module';
import { GymsController } from './modules/gyms/gyms.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // load env variables globally
    GymsModule,
  ],
  controllers: [AppController, GymsController],
  providers: [AppService, MapsService, GymsService],
})
export class AppModule {}
