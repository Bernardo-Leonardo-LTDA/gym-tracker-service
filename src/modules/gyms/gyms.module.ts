import { Module } from '@nestjs/common';
import { GymsController } from './gyms.controller';
import { GymsService } from './gyms.service';
import { MapsModule } from '../../shared/services/maps/maps.module';
import { DatabaseModule } from '../../core/database/database.module';

@Module({
  imports: [MapsModule, DatabaseModule], // import the MapsModule and DatabaseModule to use their services
  controllers: [GymsController],
  providers: [GymsService],
})
export class GymsModule {}
