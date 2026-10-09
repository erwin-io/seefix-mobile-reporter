export interface BuildingDto {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
  description?: string | null;
}

export interface FacilityLocationDto {
  id: string;
  buildingId: string;
  buildingCode?: string;
  buildingName?: string;
  floor: string | null;
  roomOrArea: string | null;
  locationType?: string | null;
  code?: string | null;
  notes?: string | null;
}

export interface ItemsResponse<T> {
  items: T[];
}
