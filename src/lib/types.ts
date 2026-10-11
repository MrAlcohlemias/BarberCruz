export type AppointmentStatus = "confirmed" | "completed" | "cancelled";
export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar: string;
  bio: string;
  preferredStyle: string;
  role: "customer" | "admin";
}
export interface Service {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  icon: "scissors" | "razor" | "combo";
}
export interface Appointment {
  id: string;
  userId: string;
  serviceId: string;
  date: string;
  time: string;
  duration?: number;
  price?: number;
  status: AppointmentStatus;
  redemption: boolean;
  note: string;
  createdAt: string;
}
export interface DayHours {
  open: boolean;
  start: string;
  end: string;
}
export interface Settings {
  shopName: string;
  instagram: string;
  openingHours: Record<number, DayHours>;
  slotStep: number;
  advanceDays: number;
  requiredCuts: number;
  timezone: string;
}
export interface Block {
  id: string;
  date: string;
  start: string;
  end: string;
  note: string;
}
export interface AppData {
  profiles: Profile[];
  appointments: Appointment[];
  services: Service[];
  settings: Settings;
  blocks: Block[];
}
