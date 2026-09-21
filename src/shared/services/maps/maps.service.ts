import { Client, GeocodeResponse } from '@googlemaps/google-maps-services-js';
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { PlaceSearchResult, PlacesSearchResponse } from './maps.interface';

@Injectable()
export class MapsService {
  private apiKey: string;
  private client: Client;

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    this.client = new Client({});
  }

  async geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
    let response: GeocodeResponse;
    try {
      response = await this.client.geocode({
        params: {
          address,
          key: this.apiKey,
        },
      });
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Error geocoding address:', err.message);
      throw new InternalServerErrorException('Failed to geocode address');
    }

    const result = response.data.results[0];
    if (!result) {
      throw new NotFoundException('Address not found');
    }

    const { lat, lng } = result.geometry.location;
    return { lat, lng };
  }

  async nearbySearch(
    lat: number,
    lng: number,
    radius: number,
    type: string
  ): Promise<PlaceSearchResult[]> {
    try {
      const response = await axios.post<PlacesSearchResponse>(
        'https://places.googleapis.com/v1/places:searchNearby',
        {
          includedTypes: [type],
          maxResultCount: 10,
          rankPreference: 'DISTANCE',
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
              'places.id,places.displayName,places.formattedAddress,places.rating,places.location',
          },
        }
      );

      return response.data.places ?? [];
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Error searching nearby places:', err.message);
      throw new InternalServerErrorException('Failed to search nearby places');
    }
  }
}
