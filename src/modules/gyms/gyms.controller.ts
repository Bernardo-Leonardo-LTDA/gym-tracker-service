import { Controller, Get, Query } from '@nestjs/common';
import { GymsService } from './gyms.service';
import { PlaceData } from '@googlemaps/google-maps-services-js';

@Controller('gyms')
export class GymsController {
  constructor(private gymsService: GymsService) {}

  @Get('search')
  async searchGymsNearby(
    @Query('address') address: string,
    @Query('radius') radius?: number
  ): Promise<Partial<PlaceData>[]> {
    const response = await this.gymsService.searchGymsNearby(address, radius);
    return response;
  }
}
