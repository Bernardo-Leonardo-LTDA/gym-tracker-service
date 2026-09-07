export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PlaceSearchResult {
  id: string;
  displayName?: {
    text: string;
    languageCode?: string;
  };
  formattedAddress?: string;
  rating?: number;
  location?: Coordinates;
  distanceMeters?: number;
}

export interface PlacesSearchResponse {
  places?: PlaceSearchResult[];
}
