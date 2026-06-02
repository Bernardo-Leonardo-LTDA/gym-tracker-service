import { Module } from '@nestjs/common';
import { GymsController } from './gyms.controller';
import { GymsService } from './gyms.service';
import { MapsModule } from 'src/shared/services/maps/maps.module';

@Module({
  imports: [MapsModule], // import the MapsModule to use MapsService
  controllers: [GymsController],
  providers: [GymsService],
})
export class GymsModule {}
