import { Client, PlaceData } from '@googlemaps/google-maps-services-js';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class MapsService {
  private apiKey: string;
  private client: Client;

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    this.client = new Client({});
  }

  async geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
    try {
      const response = await this.client.geocode({
        params: {
          address,
          key: this.apiKey,
        },
      });

      const { lat, lng } = response.data.results[0].geometry.location;
      return { lat, lng };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Error geocoding address:', err.message);
      throw new InternalServerErrorException('Failed to geocode address');
    }
  }

  async nearbySearch(
    lat: number,
    lng: number,
    radius: number,
    type: string,
  ): Promise<Partial<PlaceData>[]> {
    try {
      const response: { data: Partial<PlaceData>[] } = await axios.post(
        'https://places.googleapis.com/v1/places:searchNearby',
        {
          includedTypes: [type],
          maxResultCount: 10,
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: radius,
            },
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.rating',
          },
        },
      );

      return response.data;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Error searching nearby places:', err.message);
      throw new InternalServerErrorException('Failed to search nearby places');
    }
  }
}
