import { Module } from '@nestjs/common';
import { MapsService } from './maps.service';

@Module({
  providers: [MapsService],
  exports: [MapsService], // export the service to be used in other modules
})
export class MapsModule {}
