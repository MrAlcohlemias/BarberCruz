import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";
import { getDemoSessionProfile } from "./auth";
import type {
  AppData,
  Appointment,
  AppointmentStatus,
  Block,
  Profile,
  Service,
  Settings,
} from "./types";
import {
  addDays,
  createDemoData,
  dateKey,
  getSlots,
  loyalty,
  minutesTime,
  timeMinutes,
  today,
} from "./domain";

const env = import.meta.env as Record<string, string | undefined>;
const hasBackend = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
const db = hasBackend
  ? createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!)
  : null;
const STORAGE_KEY = "barbercruz.demo.v1";
const SESSION_KEY = "barbercruz.demo.session";
type BookingInput = {
  serviceId: string;
  date: string;
  time: string;
  redemption: boolean;
  note: string;
};
type Intervals = { time: string; duration: number }[];
interface AppContextValue {
  data: AppData;
  profile: Profile | null;
  loading: boolean;
  error: string;
  isDemo: boolean;
  canExploreAdminDemo: boolean;
  signInGoogle: () => Promise<void>;
  signInAdmin: (email: string, password: string) => Promise<void>;
  changeAdminPassword: (password: string) => Promise<void>;
  signInDemo: (role: "customer" | "admin") => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (profile: Profile) => Promise<void>;
  bookAppointment: (input: BookingInput) => Promise<Appointment>;
  updateAppointment: (id: string, status: AppointmentStatus) => Promise<void>;
  reschedule: (id: string, date: string, time: string) => Promise<void>;
  updateServices: (services: Service[]) => Promise<void>;
  updateSettings: (settings: Settings) => Promise<void>;
  updateBlocks: (blocks: Block[]) => Promise<void>;
  fetchIntervals: (date: string) => Promise<Intervals>;
  refresh: () => Promise<void>;
}
const AppContext = createContext<AppContextValue | null>(null);
const message = (err: unknown) =>
  err instanceof Error
    ? err.message
    : (err as { message?: string })?.message ||
      "No se pudo guardar el cambio. Inténtalo de nuevo.";

export function appointmentIsFuture(
  appointment: Pick<Appointment, "date" | "time">,
  timezone: string,
  now = new Date(),
): boolean {
  const localDate = dateKey(now, timezone);
  if (appointment.date !== localDate) return appointment.date > localDate;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((value) => value.type === type)?.value ?? 0);
  const currentMinutes =
    part("hour") * 60 +
    part("minute") +
    part("second") / 60 +
    now.getMilliseconds() / 60000;
  return timeMinutes(appointment.time) > currentMinutes;
}

export function appointmentHasEnded(
  appointment: Pick<Appointment, "date" | "time" | "duration">,
  timezone: string,
  now = new Date(),
): boolean {
  const endMinutes =
    timeMinutes(appointment.time) + (appointment.duration ?? 45);
  if (!Number.isFinite(endMinutes)) return false;
  const end = {
    date: addDays(appointment.date, Math.floor(endMinutes / 1440)),
    time: minutesTime(endMinutes % 1440),
  };
  return !appointmentIsFuture(end, timezone, now);
}

export function assertAppointmentUpdate(
  previous: Appointment,
  status: AppointmentStatus,
  current: Profile,
  timezone: string,
  now = new Date(),
): void {
  if (previous.status !== "confirmed")
    throw new Error("Solo se pueden cambiar las citas pendientes.");
  const isFuture = appointmentIsFuture(previous, timezone, now);
  if (
    current.role !== "admin" &&
    (previous.userId !== current.id || status !== "cancelled" || !isFuture)
  )
    throw new Error("Solo puedes cancelar tus propias citas futuras.");
  if (status === "completed" && !appointmentHasEnded(previous, timezone, now))
    throw new Error("No puedes completar una cita antes de que termine.");
}

function demoData(): AppData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as AppData;
      if (
        Array.isArray(parsed.services) &&
        parsed.settings &&
        Array.isArray(parsed.appointments) &&
        Array.isArray(parsed.profiles) &&
        Array.isArray(parsed.blocks)
      )
        return parsed;
    }
  } catch {
    /* A fresh local demo remains available if storage is unavailable. */
  }
  const initial = createDemoData();
  initial.profiles = [
    {
      id: "demo-customer",
      name: "Alex",
      email: "alex@demo.local",
      avatar: "😎",
      bio: "",
      preferredStyle: "Degradado",
      role: "customer",
    },
    {
      id: "demo-admin",
      name: "Cruz",
      email: "cruz@demo.local",
      avatar: "✂️",
      bio: "",
      preferredStyle: "",
      role: "admin",
    },
    {
      id: "demo-dani",
      name: "Dani",
      email: "dani@demo.local",
      avatar: "🔥",
      bio: "",
      preferredStyle: "Clásico",
      role: "customer",
    },
  ];
  initial.appointments = [1, 2, 3].map((n) => ({
    id: `demo-past-${n}`,
    userId: "demo-customer",
    serviceId: "cut",
    date: addDays(today(), -n * 14),
    time: "12:00",
    duration: 45,
    price: 7,
    status: "completed",
    redemption: false,
    note: "",
    createdAt: new Date().toISOString(),
  }));
  return initial;
}
function profileFromRow(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    email: String(row.email || ""),
    avatar: String(row.avatar || ""),
    bio: String(row.bio || ""),
    preferredStyle: String(row.preferred_style || ""),
    role: row.role === "admin" ? "admin" : "customer",
  };
}
function appointmentFromRow(row: Record<string, unknown>): Appointment {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    serviceId: String(row.service_id),
    date: String(row.date),
    time: String(row.time).slice(0, 5),
    duration: Number(row.duration),
    price: row.price == null ? undefined : Number(row.price),
    status: row.status as AppointmentStatus,
    redemption: Boolean(row.redemption),
    note: String(row.note || ""),
    createdAt: String(row.created_at),
  };
}
export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() =>
    db ? createDemoData() : demoData(),
  );
  const dataRef = useRef(data);
  dataRef.current = data;
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (db) return null;
    try {
      return getDemoSessionProfile(
        data.profiles,
        localStorage.getItem(SESSION_KEY),
        import.meta.env.DEV,
      );
    } catch {
      return null;
    }
  });
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [loading, setLoading] = useState(Boolean(db));
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!db) {
      const fresh = demoData();
      let current: Profile | null = null;
      try {
        current = getDemoSessionProfile(
          fresh.profiles,
          localStorage.getItem(SESSION_KEY),
          import.meta.env.DEV,
        );
      } catch {
        /* Browsing without a demo session remains possible. */
      }
      dataRef.current = fresh;
      profileRef.current = current;
      setData(fresh);
      setProfile(current);
      setError("");
      return;
    }
    try {
      const session = await db.auth.getSession();
      if (session.error) throw session.error;
      const userId = session.data.session?.user.id;
      let current: Profile | null = null;
      if (userId) {
        const result = await db
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();
        if (result.error) throw result.error;
        current = profileFromRow(result.data);
      }
      const results = await Promise.all([
        db.from("services").select("*").order("price"),
        db.from("settings").select("payload").eq("id", "singleton").single(),
        current
          ? db.from("appointments").select("*").order("date")
          : Promise.resolve({ data: [], error: null }),
        current?.role === "admin"
          ? db.from("profiles").select("*")
          : Promise.resolve({ data: current ? [current] : [], error: null }),
        current?.role === "admin"
          ? db.from("blocks").select("*")
          : Promise.resolve({ data: [], error: null }),
      ]);
      for (const result of results) if (result.error) throw result.error;
      const [services, settings, appointments, profiles, blocks] = results;
      const fresh: AppData = {
        services: services.data as Service[],
        settings: (settings.data as { payload: Settings }).payload,
        appointments: (appointments.data || []).map(appointmentFromRow),
        profiles:
          current?.role === "admin"
            ? (profiles.data || []).map((p) =>
                profileFromRow(p as Record<string, unknown>),
              )
            : current
              ? [current]
              : [],
        blocks: (blocks.data || []).map((b: Record<string, unknown>) => ({
          id: String(b.id),
          date: String(b.date),
          start: String(b.starts_at).slice(0, 5),
          end: String(b.ends_at).slice(0, 5),
          note: String(b.note || ""),
        })),
      };
      dataRef.current = fresh;
      profileRef.current = current;
      setData(fresh);
      setProfile(current);
      setError("");
    } catch (err) {
      setError(`No podemos conectar con Barber Cruz: ${message(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    if (!db) return;
    const { data: subscription } = db.auth.onAuthStateChange(() => {
      window.setTimeout(() => {
        void refresh();
      }, 0);
    });
    const channel = db
      .channel("barbercruz-changes")
      .on("postgres_changes", { event: "*", schema: "public" }, () => {
        void refresh();
      })
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOnline = () => {
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      subscription.subscription.unsubscribe();
      void db!.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);
  useEffect(() => {
    if (db) return;
    const changed = (event: StorageEvent) => {
      if (
        event.key === STORAGE_KEY ||
        event.key === SESSION_KEY ||
        event.key === null
      ) {
        const fresh = demoData();
        let current: Profile | null = null;
        try {
          current = getDemoSessionProfile(
            fresh.profiles,
            localStorage.getItem(SESSION_KEY),
            import.meta.env.DEV,
          );
        } catch {
          /* Keep the signed-out view when storage is unavailable. */
        }
        dataRef.current = fresh;
        profileRef.current = current;
        setData(fresh);
        setProfile(current);
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  function persist(next: AppData) {
    // Persist first so quota/privacy failures cannot be presented as a successful booking.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      throw new Error(
        "El navegador no permite guardar datos. Activa el almacenamiento para probar la demo.",
      );
    }
    dataRef.current = next;
    setData(next);
  }
  async function mutateDemo(change: (fresh: AppData) => AppData) {
    const apply = () => persist(change(demoData()));
    // A shared browser lock keeps simultaneous demo reservations in separate tabs atomic.
    if (navigator.locks) await navigator.locks.request(STORAGE_KEY, apply);
    else apply();
  }
  function requireProfile() {
    const current = profileRef.current;
    if (!current) throw new Error("Inicia sesión para continuar.");
    return current;
  }
  function requireAdmin() {
    if (!db && !import.meta.env.DEV)
      throw new Error(
        "La administración requiere una cuenta real. Conecta Supabase para activarla.",
      );
    if (requireProfile().role !== "admin")
      throw new Error("Solo el administrador puede realizar esta acción.");
  }
  async function signInGoogle() {
    if (!db)
      throw new Error(
        "Google estará disponible al conectar Supabase. Puedes explorar la demo mientras tanto.",
      );
    const result = await db.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (result.error) throw result.error;
  }
  async function signInDemo(role: "customer" | "admin") {
    if (db) throw new Error("La demo está desactivada en la web conectada.");
    if (role === "admin" && !import.meta.env.DEV)
      throw new Error(
        "El acceso de administrador de prueba está desactivado en la web publicada.",
      );
    await mutateDemo((fresh) => fresh);
    const current = dataRef.current.profiles.find(
      (p) => p.id === (role === "admin" ? "demo-admin" : "demo-customer"),
    );
    if (!current)
      throw new Error(
        "No se encontró el perfil de demostración. Borra los datos de la demo en este navegador para empezar de nuevo.",
      );
    try {
      localStorage.setItem(SESSION_KEY, current.id);
    } catch {
      throw new Error(
        "El navegador no permite guardar la sesión de demostración.",
      );
    }
    profileRef.current = current;
    setProfile(current);
  }
  async function signInAdmin(email: string, password: string) {
    if (!db)
      throw new Error(
        "El acceso de administrador se activará al conectar Supabase y crear tu cuenta.",
      );
    const result = await db.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (result.error)
      throw new Error(
        "No se ha podido iniciar sesión. Comprueba el correo y la contraseña.",
      );
    const identity = await db
      .from("profiles")
      .select("role")
      .eq("id", result.data.user.id)
      .single();
    if (identity.error || identity.data.role !== "admin") {
      await db.auth.signOut();
      await refresh();
      throw new Error("Esta cuenta no tiene acceso de administrador.");
    }
    await refresh();
  }
  async function changeAdminPassword(password: string) {
    requireAdmin();
    if (!db)
      throw new Error(
        "La demo no tiene contraseña. Conecta una cuenta real para cambiarla.",
      );
    if (password.length < 12 || password.length > 128)
      throw new Error("Usa una contraseña de entre 12 y 128 caracteres.");
    const result = await db.auth.updateUser({ password });
    if (result.error)
      throw new Error(
        "No se ha podido cambiar la contraseña. Vuelve a iniciar sesión y comprueba la configuración de seguridad de tu cuenta.",
      );
  }
  async function signOut() {
    if (db) {
      const result = await db.auth.signOut();
      if (result.error) throw result.error;
      setData(createDemoData());
      await refresh();
    } else localStorage.removeItem(SESSION_KEY);
    profileRef.current = null;
    setProfile(null);
  }
  async function saveProfile(next: Profile) {
    const current = requireProfile();
    if (!next.name.trim()) throw new Error("Escribe tu nombre.");
    const safe = {
      ...current,
      name: next.name.trim().slice(0, 60),
      bio: next.bio.slice(0, 250),
      preferredStyle: next.preferredStyle.slice(0, 80),
      avatar: next.avatar.slice(0, 2048),
    };
    if (db) {
      const result = await db
        .from("profiles")
        .update({
          name: safe.name,
          bio: safe.bio,
          preferred_style: safe.preferredStyle,
          avatar: safe.avatar,
        })
        .eq("id", current.id);
      if (result.error) throw result.error;
      await refresh();
    } else {
      await mutateDemo((fresh) => ({
        ...fresh,
        profiles: fresh.profiles.map((p) => (p.id === current.id ? safe : p)),
      }));
      profileRef.current = safe;
      setProfile(safe);
    }
  }
  async function bookAppointment(input: BookingInput) {
    const current = requireProfile();
    if (db) {
      const result = await db.rpc("book_appointment", {
        p_service_id: input.serviceId,
        p_date: input.date,
        p_time: input.time,
        p_redemption: input.redemption,
        p_note: input.note,
      });
      if (result.error) throw new Error(message(result.error));
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row) throw new Error("No se recibió la confirmación de la reserva.");
      await refresh();
      return appointmentFromRow(row);
    }
    let booked!: Appointment;
    await mutateDemo((fresh) => {
      const service = fresh.services.find((s) => s.id === input.serviceId);
      if (
        !service ||
        !getSlots(input.date, service, fresh).includes(input.time)
      )
        throw new Error("Esa hora ya no está disponible. Elige otra.");
      if (
        input.redemption &&
        (service.id !== "cut" ||
          loyalty(current.id, fresh.appointments, fresh.settings.requiredCuts)
            .rewardsAvailable < 1)
      )
        throw new Error("Todavía no tienes un corte gratis disponible.");
      booked = {
        ...input,
        note: input.note.slice(0, 500),
        id: crypto.randomUUID(),
        userId: current.id,
        duration: service.duration,
        price: input.redemption ? 0 : service.price,
        status: "confirmed",
        createdAt: new Date().toISOString(),
      };
      return { ...fresh, appointments: [...fresh.appointments, booked] };
    });
    return booked;
  }
  async function updateAppointment(id: string, status: AppointmentStatus) {
    const current = requireProfile();
    const previous = dataRef.current.appointments.find((a) => a.id === id);
    if (!previous) throw new Error("La cita ya no existe.");
    assertAppointmentUpdate(
      previous,
      status,
      current,
      dataRef.current.settings.timezone,
    );
    if (db) {
      const result = await db
        .from("appointments")
        .update({ status })
        .eq("id", id)
        .select("id")
        .single();
      if (result.error) throw result.error;
      await refresh();
    } else {
      await mutateDemo((fresh) => {
        const latest = fresh.appointments.find((a) => a.id === id);
        if (!latest) throw new Error("La cita ya no existe.");
        assertAppointmentUpdate(
          latest,
          status,
          current,
          fresh.settings.timezone,
        );
        return {
          ...fresh,
          appointments: fresh.appointments.map((a) =>
            a.id === id ? { ...a, status } : a,
          ),
        };
      });
    }
  }
  async function reschedule(id: string, date: string, time: string) {
    requireAdmin();
    if (db) {
      const current = dataRef.current.appointments.find((a) => a.id === id);
      if (!current || current.status !== "confirmed")
        throw new Error("Solo puedes mover citas pendientes.");
      const service = dataRef.current.services.find(
        (s) => s.id === current.serviceId,
      );
      if (
        !service ||
        !getSlots(
          date,
          { ...service, duration: current.duration ?? service.duration },
          dataRef.current,
          { excludeId: id },
        ).includes(time)
      )
        throw new Error("Ese hueco no está disponible.");
      const result = await db
        .from("appointments")
        .update({ date, time })
        .eq("id", id)
        .select("id")
        .single();
      if (result.error) throw result.error;
      await refresh();
    } else
      await mutateDemo((fresh) => {
        const latest = fresh.appointments.find((a) => a.id === id);
        if (!latest || latest.status !== "confirmed")
          throw new Error("Solo puedes mover citas pendientes.");
        const latestService = fresh.services.find(
          (s) => s.id === latest.serviceId,
        );
        if (
          !latestService ||
          !getSlots(
            date,
            {
              ...latestService,
              duration: latest.duration ?? latestService.duration,
            },
            fresh,
            { excludeId: id },
          ).includes(time)
        )
          throw new Error("Ese hueco no está disponible.");
        return {
          ...fresh,
          appointments: fresh.appointments.map((a) =>
            a.id === id ? { ...a, date, time } : a,
          ),
        };
      });
  }
  async function updateServices(services: Service[]) {
    requireAdmin();
    if (
      !services.length ||
      services.some(
        (s) =>
          !s.name.trim() ||
          s.name.length > 100 ||
          s.description.length > 500 ||
          s.price < 0 ||
          s.price > 10000 ||
          !Number.isFinite(s.price) ||
          s.duration < 5 ||
          s.duration > 240 ||
          !Number.isInteger(s.duration),
      )
    )
      throw new Error(
        "Revisa los nombres, precios y duraciones de los servicios.",
      );
    if (db) {
      const result = await db.from("services").upsert(services);
      if (result.error) throw result.error;
      await refresh();
    } else await mutateDemo((fresh) => ({ ...fresh, services }));
  }
  async function updateSettings(settings: Settings) {
    requireAdmin();
    if (
      settings.timezone !== "Europe/Madrid" ||
      !settings.shopName.trim() ||
      settings.shopName.length > 100 ||
      settings.instagram.length > 2000 ||
      !Number.isInteger(settings.slotStep) ||
      settings.slotStep < 5 ||
      settings.slotStep > 120 ||
      !Number.isInteger(settings.advanceDays) ||
      settings.advanceDays < 1 ||
      settings.advanceDays > 365 ||
      !Number.isInteger(settings.requiredCuts) ||
      settings.requiredCuts < 1 ||
      settings.requiredCuts > 50
    )
      throw new Error(
        "Revisa los intervalos, días de antelación y cortes para la recompensa.",
      );
    for (let day = 0; day <= 6; day++) {
      const hours = settings.openingHours[day];
      if (
        !hours ||
        typeof hours.open !== "boolean" ||
        !Number.isFinite(timeMinutes(hours.start)) ||
        !Number.isFinite(timeMinutes(hours.end)) ||
        (hours.open && hours.start >= hours.end)
      )
        throw new Error(
          "Revisa el horario de cada día. La hora de cierre debe ser posterior a la de apertura.",
        );
    }
    if (db) {
      const result = await db
        .from("settings")
        .update({ payload: settings })
        .eq("id", "singleton");
      if (result.error) throw result.error;
      await refresh();
    } else await mutateDemo((fresh) => ({ ...fresh, settings }));
  }
  async function updateBlocks(blocks: Block[]) {
    requireAdmin();
    if (
      blocks.some(
        (b) =>
          !addDays(b.date, 0) ||
          !Number.isFinite(timeMinutes(b.start)) ||
          !Number.isFinite(timeMinutes(b.end)) ||
          b.start >= b.end ||
          b.note.length > 500,
      )
    )
      throw new Error("Revisa la fecha, el inicio y el final del bloqueo.");
    if (db) {
      const oldIds = new Set(dataRef.current.blocks.map((b) => b.id));
      const newIds = new Set(blocks.map((b) => b.id));
      const removals = [...oldIds].filter((id) => !newIds.has(id));
      if (removals.length) {
        const result = await db.from("blocks").delete().in("id", removals);
        if (result.error) throw result.error;
      }
      const changedBlocks = blocks
        .filter((b) => {
          const previous = dataRef.current.blocks.find(
            (old) => old.id === b.id,
          );
          return (
            !previous ||
            previous.date !== b.date ||
            previous.start !== b.start ||
            previous.end !== b.end ||
            previous.note !== b.note
          );
        })
        .map((b) => ({
          id: b.id,
          date: b.date,
          starts_at: b.start,
          ends_at: b.end,
          note: b.note,
        }));
      if (changedBlocks.length) {
        const result = await db.from("blocks").upsert(changedBlocks);
        if (result.error) throw result.error;
      }
      await refresh();
    } else
      await mutateDemo((fresh) => {
        for (const block of blocks) {
          if (
            fresh.appointments.some((appointment) => {
              const duration =
                appointment.duration ??
                fresh.services.find(
                  (service) => service.id === appointment.serviceId,
                )?.duration ??
                45;
              return (
                appointment.date === block.date &&
                appointment.status !== "cancelled" &&
                timeMinutes(appointment.time) < timeMinutes(block.end) &&
                timeMinutes(appointment.time) + duration >
                  timeMinutes(block.start)
              );
            })
          )
            throw new Error(
              "Hay una cita en ese intervalo. Cancélala o muévela antes de bloquearlo.",
            );
        }
        return { ...fresh, blocks };
      });
  }
  async function fetchIntervals(date: string): Promise<Intervals> {
    if (!db) return [];
    const result = await db.rpc("booked_intervals", { p_date: date });
    if (result.error) throw result.error;
    return (result.data || []).map((r: { time: string; duration: number }) => ({
      time: r.time.slice(0, 5),
      duration: r.duration,
    }));
  }
  return (
    <AppContext.Provider
      value={{
        data,
        profile,
        loading,
        error,
        isDemo: !hasBackend,
        canExploreAdminDemo: !hasBackend && import.meta.env.DEV,
        signInGoogle,
        signInAdmin,
        changeAdminPassword,
        signInDemo,
        signOut,
        saveProfile,
        bookAppointment,
        updateAppointment,
        reschedule,
        updateServices,
        updateSettings,
        updateBlocks,
        fetchIntervals,
        refresh,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("AppProvider is required");
  return context;
}
