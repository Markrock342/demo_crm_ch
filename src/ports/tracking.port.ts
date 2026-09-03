export type TrackingEvent = {
  at: string;
  code: string;
  note?: string;
};

export type TrackingSnapshot = {
  containerNo: string;
  status: string;
  eta: string;
  vessel?: string;
  carrier?: string;
  lastFreeDay?: string;
  events: TrackingEvent[];
  provider: string;
};

export type TrackingPort = {
  refresh(input: { containerNo: string; bl?: string; currentEta?: string }): Promise<TrackingSnapshot>;
};
