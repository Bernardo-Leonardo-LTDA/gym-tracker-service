import { PlaceData } from '@googlemaps/google-maps-services-js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { MapsService } from 'src/shared/services/maps/maps.service';

@Injectable()
export class GymsService {
  constructor(private mapsService: MapsService) {}

  async searchGymsNearby(
    address: string,
    radius = 1500
  ): Promise<Partial<PlaceData>[]> {
    const { lat, lng } = await this.mapsService.geocodeAddress(address);
    if (!lat || !lng) {
      throw new NotFoundException('Failed to geocode address');
    }

    const gyms = await this.mapsService.nearbySearch(lat, lng, radius, 'gym');
    return gyms;
  }
}
