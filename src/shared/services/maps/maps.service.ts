import { Client } from '@googlemaps/google-maps-services-js';
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import {
  Coordinates,
  PlaceSearchResult,
  PlacesSearchResponse,
} from './maps.interface';

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

      const result = response.data.results[0];
      if (!result) {
        throw new NotFoundException('Address not found');
      }

      const { lat, lng } = result.geometry.location;
      return { lat, lng };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      const err = error as Error;
      console.error('Error geocoding address:', err.message);
      throw new InternalServerErrorException('Failed to geocode address');
    }
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

      return this.sortByDistance(
        response.data.places ?? [],
        {
          latitude: lat,
          longitude: lng,
        },
        radius
      );
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Error searching nearby places:', err.message);
      throw new InternalServerErrorException('Failed to search nearby places');
    }
  }

  private sortByDistance(
    places: PlaceSearchResult[],
    origin?: Coordinates,
    maximumDistance?: number
  ): PlaceSearchResult[] {
    if (!origin) {
      return places;
    }

    return places
      .map((place) => ({
        ...place,
        distanceMeters: place.location
          ? Math.round(this.calculateDistance(origin, place.location))
          : undefined,
      }))
      .filter(
        (place) =>
          maximumDistance === undefined ||
          (place.distanceMeters !== undefined &&
            place.distanceMeters <= maximumDistance)
      )
      .sort(
        (first, second) =>
          (first.distanceMeters ?? Number.POSITIVE_INFINITY) -
          (second.distanceMeters ?? Number.POSITIVE_INFINITY)
      );
  }

  private calculateDistance(from: Coordinates, to: Coordinates): number {
    const earthRadiusMeters = 6_371_000;
    const latitudeDelta = this.toRadians(to.latitude - from.latitude);
    const longitudeDelta = this.toRadians(to.longitude - from.longitude);
    const fromLatitude = this.toRadians(from.latitude);
    const toLatitude = this.toRadians(to.latitude);
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(fromLatitude) *
        Math.cos(toLatitude) *
        Math.sin(longitudeDelta / 2) ** 2;

    return (
      2 *
      earthRadiusMeters *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}
