// src/models/Barrier.ts

export interface BarrierStatus {
  step: string;
  completedCount: number;
  totalCount: number;
  released: boolean;
}
