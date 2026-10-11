import type { AppData, Profile } from "./types";

/** Keep identity and privileges from the existing record, never from an edit form. */
export function editableCustomer(current: Profile, next: Profile): Profile {
  if (current.role !== "customer")
    throw new Error("Solo puedes gestionar cuentas de clientes.");
  if (!next.name.trim()) throw new Error("Escribe el nombre del cliente.");
  return {
    ...current,
    name: next.name.trim().slice(0, 60),
    bio: next.bio.slice(0, 250),
    preferredStyle: next.preferredStyle.slice(0, 80),
    avatar: next.avatar,
    avatarUrl: next.avatar === current.avatar ? current.avatarUrl : undefined,
  };
}

export function removeCustomer(data: AppData, id: string): AppData {
  const customer = data.profiles.find((person) => person.id === id);
  if (!customer) throw new Error("La cuenta ya no existe.");
  if (customer.role !== "customer")
    throw new Error("Las cuentas de administrador están protegidas.");
  return {
    ...data,
    profiles: data.profiles.filter((person) => person.id !== id),
    appointments: data.appointments.filter(
      (appointment) => appointment.userId !== id,
    ),
  };
}
