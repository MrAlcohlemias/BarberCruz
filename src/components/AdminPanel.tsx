import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Euro,
  Plus,
  Save,
  Scissors,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import type {
  AppData,
  Appointment,
  AppointmentStatus,
  Block,
  Profile,
  Service,
  Settings,
} from "../lib/types";
import {
  addDays,
  formatDate,
  formatMoney,
  getSlots,
  today,
} from "../lib/domain";
import { avatarSource } from "../lib/avatar";
import "./admin.css";

export interface AdminPanelProps {
  data: AppData;
  onUpdateAppointment: (id: string, status: AppointmentStatus) => Promise<void>;
  onUpdateServices: (services: Service[]) => Promise<void>;
  onUpdateSettings: (settings: Settings) => Promise<void>;
  onUpdateBlocks: (blocks: Block[]) => Promise<void>;
  onReschedule: (
    id: string,
    date: string,
    time: string,
    note?: string,
  ) => Promise<void>;
  onToast: (message: string) => void;
}

type Tab = "agenda" | "services" | "hours";
const statusNames: Record<AppointmentStatus, string> = {
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
};
const weekdays = [
  { day: 1, name: "Lunes" },
  { day: 2, name: "Martes" },
  { day: 3, name: "Miércoles" },
  { day: 4, name: "Jueves" },
  { day: 5, name: "Viernes" },
  { day: 6, name: "Sábado" },
  { day: 0, name: "Domingo" },
];
const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

function AdminAvatar({ profile }: { profile?: Profile }) {
  const imageSource = profile ? avatarSource(profile) || "" : "";
  const [failedSource, setFailedSource] = useState("");
  useEffect(() => setFailedSource(""), [imageSource]);
  const initials = (profile?.name || "Cliente")
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const emoji =
    profile?.avatar &&
    !/^https:\/\//i.test(profile.avatar) &&
    !profile.avatar.startsWith("avatars/") &&
    profile.avatar.length <= 20
      ? profile.avatar
      : "";

  return (
    <div className="admin-avatar" aria-hidden="true">
      {imageSource && failedSource !== imageSource ? (
        <img
          src={imageSource}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSource(imageSource)}
        />
      ) : (
        emoji || initials
      )}
    </div>
  );
}

function canComplete(
  appointment: Appointment,
  service: Service | undefined,
  timezone: string,
) {
  const current = new Date();
  const date = today(timezone);
  if (appointment.date < date) return true;
  if (appointment.date > date) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(current);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
  return (
    hour * 60 + minute >=
    minutes(appointment.time) +
      (appointment.duration ?? service?.duration ?? 30)
  );
}

export default function AdminPanel({
  data,
  onUpdateAppointment,
  onUpdateServices,
  onUpdateSettings,
  onUpdateBlocks,
  onReschedule,
  onToast,
}: AdminPanelProps) {
  const currentDate = today(data.settings.timezone);
  const [tab, setTab] = useState<Tab>("agenda");
  const [date, setDate] = useState(currentDate);
  const [scope, setScope] = useState<"day" | "upcoming" | "all">("day");
  const [status, setStatus] = useState<"all" | AppointmentStatus>("all");
  const [services, setServices] = useState<Service[]>(data.services);
  const [settings, setSettings] = useState<Settings>(data.settings);
  const [block, setBlock] = useState({
    date: currentDate,
    start: "13:00",
    end: "14:00",
    note: "",
  });
  const [, setClockTick] = useState(0);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState<{
    appointment: Appointment;
    action: "reschedule" | "cancel";
  } | null>(null);
  const [newDate, setNewDate] = useState(currentDate);
  const [newTime, setNewTime] = useState("");
  const [newNote, setNewNote] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(
      () => setClockTick((value) => value + 1),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setServices(data.services), [data.services]);
  useEffect(() => setSettings(data.settings), [data.settings]);
  useEffect(() => {
    if (!modal) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusTarget = modalRef.current?.querySelector<HTMLElement>(
      "button, input, select",
    );
    focusTarget?.focus();
    return () => previousFocus?.focus();
  }, [modal]);

  const selectedAppointments = useMemo(
    () =>
      data.appointments
        .filter(
          (appointment) =>
            (scope === "all" ||
              (scope === "day"
                ? appointment.date === date
                : appointment.date >= currentDate)) &&
            (status === "all" || appointment.status === status),
        )
        .sort((a, b) =>
          `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
        ),
    [data.appointments, scope, date, currentDate, status],
  );
  const dayAppointments = data.appointments.filter(
    (appointment) => appointment.date === date,
  );
  const completed = dayAppointments.filter(
    (appointment) => appointment.status === "completed",
  );
  const earned = completed.reduce(
    (sum, appointment) =>
      sum +
      (appointment.redemption
        ? 0
        : (appointment.price ??
          data.services.find((service) => service.id === appointment.serviceId)
            ?.price ??
          0)),
    0,
  );
  const modalService =
    modal &&
    data.services.find((service) => service.id === modal.appointment.serviceId);
  const slots = modalService
    ? getSlots(
        newDate,
        {
          ...modalService,
          duration: modal?.appointment.duration ?? modalService.duration,
        },
        data,
        { excludeId: modal?.appointment.id },
      )
    : [];

  async function run(
    key: string,
    action: () => Promise<void>,
    message: string,
  ) {
    if (pending) return;
    setPending(key);
    setError("");
    try {
      await action();
      onToast(message);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se ha podido guardar. Inténtalo de nuevo.",
      );
      return false;
    } finally {
      setPending("");
    }
  }

  function openModal(
    appointment: Appointment,
    action: "reschedule" | "cancel",
  ) {
    setError("");
    setNewDate(appointment.date);
    setNewTime(appointment.time);
    setNewNote(appointment.note);
    setModal({ appointment, action });
  }

  async function saveServices(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      services.some(
        (service) =>
          !service.name.trim() ||
          !Number.isFinite(service.price) ||
          service.price < 0 ||
          !Number.isInteger(service.duration) ||
          service.duration < 5 ||
          service.duration > 240,
      )
    ) {
      setError(
        "Revisa los servicios: nombre, precio positivo y duración entre 5 y 240 minutos.",
      );
      return;
    }
    await run(
      "services",
      () =>
        onUpdateServices(
          services.map((service) => ({
            ...service,
            name: service.name.trim(),
            description: service.description.trim(),
          })),
        ),
      "Servicios actualizados.",
    );
  }

  async function saveHours(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalidHours = Object.values(settings.openingHours).some(
      (hours) =>
        hours.open && (!hours.start || !hours.end || hours.start >= hours.end),
    );
    if (
      invalidHours ||
      !Number.isInteger(settings.slotStep) ||
      settings.slotStep < 5 ||
      settings.slotStep > 120 ||
      !Number.isInteger(settings.advanceDays) ||
      settings.advanceDays < 1 ||
      settings.advanceDays > 365 ||
      !Number.isInteger(settings.requiredCuts) ||
      settings.requiredCuts < 1 ||
      settings.requiredCuts > 50
    ) {
      setError(
        "Revisa los horarios y los límites de reserva. La hora de cierre debe ser posterior a la apertura.",
      );
      return;
    }
    await run(
      "hours",
      () => onUpdateSettings(settings),
      "Horarios y preferencias guardados.",
    );
  }

  async function saveBlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      block.date < currentDate ||
      !block.start ||
      !block.end ||
      block.start >= block.end
    ) {
      setError(
        "Elige una fecha actual o futura y una hora de fin posterior al inicio.",
      );
      return;
    }
    const overlapsAppointment = data.appointments.some((appointment) => {
      const service = data.services.find(
        (item) => item.id === appointment.serviceId,
      );
      return (
        appointment.date === block.date &&
        appointment.status !== "cancelled" &&
        minutes(appointment.time) < minutes(block.end) &&
        minutes(appointment.time) +
          (appointment.duration ?? service?.duration ?? 30) >
          minutes(block.start)
      );
    });
    if (overlapsAppointment) {
      setError(
        "Hay una cita en ese intervalo. Elige otro horario o reprograma la cita pendiente antes de bloquearlo.",
      );
      return;
    }
    if (
      await run(
        "block",
        () =>
          onUpdateBlocks([
            ...data.blocks,
            { ...block, note: block.note.trim(), id: crypto.randomUUID() },
          ]),
        "Tiempo bloqueado. No se podrán reservar citas en ese intervalo.",
      )
    ) {
      setBlock((previous) => ({ ...previous, note: "" }));
    }
  }

  async function submitModal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    if (modal.action === "reschedule") {
      const sameSlot =
        newDate === modal.appointment.date &&
        newTime === modal.appointment.time;
      if (!sameSlot && (newDate < currentDate || !slots.includes(newTime))) {
        setError("Elige una fecha y una hora disponibles.");
        return;
      }
      if (
        await run(
          "reschedule",
          () =>
            onReschedule(
              modal.appointment.id,
              newDate,
              newTime,
              newNote.trim(),
            ),
          "Cita actualizada.",
        )
      )
        setModal(null);
    } else if (
      await run(
        "cancel",
        () => onUpdateAppointment(modal.appointment.id, "cancelled"),
        "Cita cancelada.",
      )
    )
      setModal(null);
  }

  function updateService(id: string, update: Partial<Service>) {
    setServices((previous) =>
      previous.map((service) =>
        service.id === id ? { ...service, ...update } : service,
      ),
    );
  }

  return (
    <section className="admin-panel" aria-label="Panel de administración">
      <div
        className="admin-tabs"
        role="tablist"
        aria-label="Secciones de administración"
      >
        {(
          [
            { id: "agenda", name: "Agenda", icon: CalendarDays },
            { id: "services", name: "Servicios", icon: Scissors },
            { id: "hours", name: "Horarios", icon: Clock3 },
          ] as const
        ).map(({ id, name, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`admin-${id}`}
            id={`admin-tab-${id}`}
            onClick={() => {
              setTab(id);
              setError("");
            }}
            className={tab === id ? "active" : ""}
          >
            <Icon size={17} />
            {name}
          </button>
        ))}
      </div>
      {error && !modal && (
        <div className="admin-error" role="alert">
          {error}
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Cerrar aviso"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {tab === "agenda" && (
        <div
          id="admin-agenda"
          role="tabpanel"
          aria-labelledby="admin-tab-agenda"
        >
          <div className="admin-toolbar">
            <div>
              <h2>Tu agenda</h2>
              <p>
                {scope === "day"
                  ? formatDate(date, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })
                  : scope === "upcoming"
                    ? "Todas las próximas citas"
                    : "Historial de todas las citas"}
              </p>
            </div>
            <div className="admin-date-picker">
              <button
                type="button"
                onClick={() => {
                  setDate(addDays(date, -1));
                  setScope("day");
                }}
                aria-label="Día anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <label className="admin-sr-only" htmlFor="admin-date">
                Fecha de agenda
              </label>
              <input
                id="admin-date"
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value || currentDate);
                  setScope("day");
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setDate(addDays(date, 1));
                  setScope("day");
                }}
                aria-label="Día siguiente"
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                className="admin-today"
                onClick={() => {
                  setDate(currentDate);
                  setScope("day");
                }}
              >
                Hoy
              </button>
            </div>
          </div>
          <div className="admin-stats">
            <div>
              <span className="admin-stat-icon">
                <CalendarDays size={20} />
              </span>
              <span>
                <small>Citas del día</small>
                <strong>
                  {
                    dayAppointments.filter(
                      (appointment) => appointment.status !== "cancelled",
                    ).length
                  }
                </strong>
              </span>
            </div>
            <div>
              <span className="admin-stat-icon">
                <Check size={20} />
              </span>
              <span>
                <small>Cortes completados</small>
                <strong>{completed.length}</strong>
              </span>
            </div>
            <div>
              <span className="admin-stat-icon">
                <Euro size={20} />
              </span>
              <span>
                <small>Ingresos estimados del día</small>
                <strong>{formatMoney(earned)}</strong>
              </span>
            </div>
          </div>
          <div className="admin-agenda-card">
            <div className="admin-list-heading">
              <span>
                {selectedAppointments.length}{" "}
                {selectedAppointments.length === 1 ? "cita" : "citas"}
              </span>
              <div className="admin-filters">
                <label>
                  <span className="admin-sr-only">Mostrar fechas</span>
                  <select
                    value={scope}
                    onChange={(event) =>
                      setScope(event.target.value as typeof scope)
                    }
                  >
                    <option value="day">Día seleccionado</option>
                    <option value="upcoming">Próximas citas</option>
                    <option value="all">Todas las citas</option>
                  </select>
                </label>
                <label>
                  <span className="admin-sr-only">Filtrar por estado</span>
                  <select
                    value={status}
                    onChange={(event) =>
                      setStatus(event.target.value as typeof status)
                    }
                  >
                    <option value="all">Todos los estados</option>
                    <option value="confirmed">Confirmadas</option>
                    <option value="completed">Completadas</option>
                    <option value="cancelled">Canceladas</option>
                  </select>
                </label>
              </div>
            </div>
            {selectedAppointments.length ? (
              <div className="admin-appointments">
                {selectedAppointments.map((appointment) => {
                  const profile = data.profiles.find(
                    (person) => person.id === appointment.userId,
                  );
                  const service = data.services.find(
                    (item) => item.id === appointment.serviceId,
                  );
                  const completable = canComplete(
                    appointment,
                    service,
                    data.settings.timezone,
                  );
                  return (
                    <article className="admin-appointment" key={appointment.id}>
                      <div className="admin-appt-time">
                        <strong>{appointment.time}</strong>
                        <span>
                          {scope !== "day"
                            ? formatDate(appointment.date, {
                                weekday: undefined,
                                day: "numeric",
                                month: "short",
                              })
                            : `${appointment.duration ?? service?.duration ?? 30} min`}
                        </span>
                      </div>
                      <AdminAvatar profile={profile} />
                      <div className="admin-appt-details">
                        <h3>
                          {profile?.name || "Cliente"}
                          {appointment.redemption && (
                            <span className="admin-free">Corte gratis</span>
                          )}
                        </h3>
                        <p>
                          {service?.name || "Servicio"} ·{" "}
                          {appointment.redemption
                            ? "Canje de recompensa"
                            : formatMoney(
                                appointment.price ?? service?.price ?? 0,
                              )}
                        </p>
                        {appointment.note && (
                          <p className="admin-appt-note">{appointment.note}</p>
                        )}
                      </div>
                      <span className={`admin-status ${appointment.status}`}>
                        {statusNames[appointment.status]}
                      </span>
                      {appointment.status === "confirmed" && (
                        <div className="admin-appt-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn-lime admin-complete"
                            disabled={!!pending || !completable}
                            title={
                              completable
                                ? "Marcar como completada"
                                : "Podrás completarla cuando termine la cita"
                            }
                            onClick={() =>
                              void run(
                                appointment.id,
                                () =>
                                  onUpdateAppointment(
                                    appointment.id,
                                    "completed",
                                  ),
                                "Cita completada.",
                              )
                            }
                          >
                            <Check size={15} />
                            {pending === appointment.id
                              ? "Guardando…"
                              : "Completar"}
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-outline"
                            disabled={!!pending}
                            onClick={() => openModal(appointment, "reschedule")}
                          >
                            Editar cita
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn admin-cancel"
                            disabled={!!pending}
                            onClick={() => openModal(appointment, "cancel")}
                            aria-label={`Cancelar cita de ${profile?.name || "cliente"}`}
                          >
                            <X size={17} />
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="admin-empty">
                <CalendarDays size={32} />
                <h3>Un poco de tiempo libre</h3>
                <p>
                  No hay citas con estos filtros. Las nuevas reservas aparecerán
                  aquí.
                </p>
              </div>
            )}
          </div>
          <p className="admin-helper">
            Las citas se completan cuando ha terminado su horario. Los puntos se
            asignan automáticamente a los cortes de pago.
          </p>
        </div>
      )}

      {tab === "services" && (
        <form
          id="admin-services"
          role="tabpanel"
          aria-labelledby="admin-tab-services"
          onSubmit={(event) => void saveServices(event)}
        >
          <div className="admin-toolbar">
            <div>
              <h2>Tu carta de servicios</h2>
              <p>Buenos cortes, precios claros y tiempo para cada cliente.</p>
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn-dark"
              disabled={!!pending}
            >
              <Save size={16} />
              {pending === "services" ? "Guardando…" : "Guardar servicios"}
            </button>
          </div>
          <div className="admin-services-grid">
            {services.map((service) => (
              <article key={service.id} className="admin-service-card">
                <span className="admin-service-icon">
                  <Scissors size={25} />
                </span>
                <label>
                  Nombre del servicio
                  <input
                    required
                    maxLength={70}
                    value={service.name}
                    onChange={(event) =>
                      updateService(service.id, { name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Descripción
                  <textarea
                    maxLength={250}
                    rows={3}
                    value={service.description}
                    onChange={(event) =>
                      updateService(service.id, {
                        description: event.target.value,
                      })
                    }
                  />
                </label>
                <div className="admin-two-fields">
                  <label>
                    Precio (€)
                    <input
                      type="number"
                      required
                      min="0"
                      max="9999"
                      step="0.01"
                      value={Number.isNaN(service.price) ? "" : service.price}
                      onChange={(event) =>
                        updateService(service.id, {
                          price: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Duración (min)
                    <input
                      type="number"
                      required
                      min="5"
                      max="240"
                      step="5"
                      value={
                        Number.isNaN(service.duration) ? "" : service.duration
                      }
                      onChange={(event) =>
                        updateService(service.id, {
                          duration: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
          <p className="admin-helper">
            Los cambios se aplican a las nuevas reservas. La duración de las
            citas existentes se conserva.
          </p>
        </form>
      )}

      {tab === "hours" && (
        <div id="admin-hours" role="tabpanel" aria-labelledby="admin-tab-hours">
          <form onSubmit={(event) => void saveHours(event)}>
            <div className="admin-toolbar">
              <div>
                <h2>Haz sitio en tu semana</h2>
                <p>
                  Decide cuándo abrir. Tus clientes verán las horas disponibles.
                </p>
              </div>
              <button
                type="submit"
                className="admin-btn admin-btn-dark"
                disabled={!!pending}
              >
                <Save size={16} />
                {pending === "hours" ? "Guardando…" : "Guardar horarios"}
              </button>
            </div>
            <div className="admin-hours-layout">
              <div className="admin-card">
                <h3>
                  <Clock3 size={18} /> Horario semanal
                </h3>
                <p className="admin-card-subtitle">
                  Hora de la barbería · {settings.timezone}
                </p>
                <div
                  className="admin-presets"
                  aria-label="Ajustes rápidos del horario"
                >
                  {[
                    { name: "Mañanas", start: "10:00", end: "14:00" },
                    { name: "Tardes", start: "16:00", end: "20:00" },
                    { name: "Todo el día", start: "10:00", end: "20:00" },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      disabled={!!pending}
                      onClick={() =>
                        setSettings((previous) => ({
                          ...previous,
                          openingHours: Object.fromEntries(
                            weekdays.map(({ day }) => [
                              day,
                              {
                                ...(previous.openingHours[day] ?? {
                                  open: false,
                                }),
                                start: preset.start,
                                end: preset.end,
                              },
                            ]),
                          ),
                        }))
                      }
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                <p className="admin-helper">
                  Aplica un turno a los días abiertos y guarda. Para un cambio
                  puntual, bloquea una fecha abajo.
                </p>
                <div className="admin-week">
                  {weekdays.map(({ day, name }) => {
                    const hours = settings.openingHours[day] ?? {
                      open: false,
                      start: "10:00",
                      end: "20:00",
                    };
                    const update = (changes: Partial<typeof hours>) =>
                      setSettings((previous) => ({
                        ...previous,
                        openingHours: {
                          ...previous.openingHours,
                          [day]: { ...hours, ...changes },
                        },
                      }));
                    return (
                      <div
                        className={`admin-hour-row ${hours.open ? "" : "closed"}`}
                        key={day}
                      >
                        <label className="admin-toggle-label">
                          <input
                            type="checkbox"
                            checked={hours.open}
                            onChange={(event) =>
                              update({ open: event.target.checked })
                            }
                          />
                          <span className="admin-toggle" />
                          <strong>{name}</strong>
                        </label>
                        {hours.open ? (
                          <div className="admin-time-range">
                            <label>
                              <span className="admin-sr-only">
                                Apertura del {name.toLowerCase()}
                              </span>
                              <input
                                type="time"
                                required
                                value={hours.start}
                                onChange={(event) =>
                                  update({ start: event.target.value })
                                }
                              />
                            </label>
                            <span>—</span>
                            <label>
                              <span className="admin-sr-only">
                                Cierre del {name.toLowerCase()}
                              </span>
                              <input
                                type="time"
                                required
                                value={hours.end}
                                onChange={(event) =>
                                  update({ end: event.target.value })
                                }
                              />
                            </label>
                          </div>
                        ) : (
                          <span className="admin-closed-label">Cerrado</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="admin-card">
                <h3>
                  <Settings2 size={18} /> Preferencias de reserva
                </h3>
                <p className="admin-card-subtitle">
                  Ajusta los pequeños detalles de tu agenda.
                </p>
                <div className="admin-preferences">
                  <label>
                    Intervalo entre horas disponibles (min)
                    <input
                      type="number"
                      required
                      min="5"
                      max="120"
                      step="5"
                      value={settings.slotStep}
                      onChange={(event) =>
                        setSettings((previous) => ({
                          ...previous,
                          slotStep: Number(event.target.value),
                        }))
                      }
                    />
                    <small>
                      Por ejemplo, 15 ofrece citas a las 10:00, 10:15…
                    </small>
                  </label>
                  <label>
                    Días de antelación para reservar
                    <input
                      type="number"
                      required
                      min="1"
                      max="365"
                      value={settings.advanceDays}
                      onChange={(event) =>
                        setSettings((previous) => ({
                          ...previous,
                          advanceDays: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Cortes para ganar una recompensa
                    <input
                      type="number"
                      required
                      min="1"
                      max="50"
                      value={settings.requiredCuts}
                      onChange={(event) =>
                        setSettings((previous) => ({
                          ...previous,
                          requiredCuts: Number(event.target.value),
                        }))
                      }
                    />
                    <small>
                      Cortes de pago completados. La recompensa es un corte
                      clásico gratis.
                    </small>
                  </label>
                </div>
              </div>
            </div>
          </form>
          <div className="admin-card admin-block-card">
            <div>
              <h3>
                <CalendarDays size={18} /> Reserva tiempo para ti
              </h3>
              <p className="admin-card-subtitle">
                Bloquea un descanso o un día libre sin cambiar tu horario
                semanal.
              </p>
            </div>
            <form
              className="admin-block-form"
              onSubmit={(event) => void saveBlock(event)}
            >
              <label>
                Fecha
                <input
                  type="date"
                  required
                  min={currentDate}
                  value={block.date}
                  onChange={(event) =>
                    setBlock((previous) => ({
                      ...previous,
                      date: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Desde
                <input
                  type="time"
                  required
                  value={block.start}
                  onChange={(event) =>
                    setBlock((previous) => ({
                      ...previous,
                      start: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Hasta
                <input
                  type="time"
                  required
                  value={block.end}
                  onChange={(event) =>
                    setBlock((previous) => ({
                      ...previous,
                      end: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="admin-block-note">
                Motivo (opcional)
                <input
                  maxLength={120}
                  placeholder="Un descanso, vacaciones…"
                  value={block.note}
                  onChange={(event) =>
                    setBlock((previous) => ({
                      ...previous,
                      note: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                type="submit"
                className="admin-btn admin-btn-dark"
                disabled={!!pending}
              >
                <Plus size={16} />
                {pending === "block" ? "Guardando…" : "Bloquear"}
              </button>
            </form>
            {data.blocks.filter((item) => item.date >= currentDate).length >
              0 && (
              <div className="admin-block-list">
                {data.blocks
                  .filter((item) => item.date >= currentDate)
                  .sort((a, b) =>
                    `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`),
                  )
                  .map((item) => (
                    <div key={item.id}>
                      <div>
                        <strong>
                          {formatDate(item.date, {
                            weekday: undefined,
                            day: "numeric",
                            month: "long",
                          })}{" "}
                          · {item.start}–{item.end}
                        </strong>
                        <span>{item.note || "Tiempo bloqueado"}</span>
                      </div>
                      <button
                        type="button"
                        className="admin-icon-btn"
                        disabled={!!pending}
                        aria-label={`Eliminar bloqueo del ${item.date} a las ${item.start}`}
                        onClick={() =>
                          void run(
                            item.id,
                            () =>
                              onUpdateBlocks(
                                data.blocks.filter(
                                  (existing) => existing.id !== item.id,
                                ),
                              ),
                            "Bloqueo eliminado.",
                          )
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {modal && (
        <div
          className="admin-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !pending)
              setModal(null);
          }}
        >
          <div
            className="admin-modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-modal-title"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !pending) setModal(null);
              if (event.key === "Tab") {
                const focusable =
                  modalRef.current?.querySelectorAll<HTMLElement>(
                    "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
                  );
                if (!focusable?.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <button
              type="button"
              className="admin-modal-close admin-icon-btn"
              onClick={() => setModal(null)}
              disabled={!!pending}
              aria-label="Cerrar ventana"
            >
              <X size={20} />
            </button>
            <span className="admin-service-icon">
              <CalendarDays size={25} />
            </span>
            <h2 id="admin-modal-title">
              {modal.action === "reschedule"
                ? "Editar cita"
                : "¿Cancelar esta cita?"}
            </h2>
            <p>
              {data.profiles.find(
                (profile) => profile.id === modal.appointment.userId,
              )?.name || "Cliente"}{" "}
              · {modalService?.name || "Servicio"}
              <br />
              {formatDate(modal.appointment.date, {
                weekday: undefined,
                day: "numeric",
                month: "long",
              })}{" "}
              a las {modal.appointment.time}
            </p>
            {error && (
              <div className="admin-error" role="alert">
                {error}
              </div>
            )}
            <form onSubmit={(event) => void submitModal(event)}>
              {modal.action === "reschedule" ? (
                <>
                  <label>
                    Nueva fecha
                    <input
                      type="date"
                      required
                      min={
                        modal.appointment.date < currentDate
                          ? modal.appointment.date
                          : currentDate
                      }
                      max={
                        modal.appointment.date >
                        addDays(currentDate, data.settings.advanceDays)
                          ? modal.appointment.date
                          : addDays(currentDate, data.settings.advanceDays)
                      }
                      value={newDate}
                      onChange={(event) => {
                        setNewDate(event.target.value);
                        setNewTime("");
                      }}
                    />
                  </label>
                  <label>
                    Hora disponible
                    <select
                      required
                      value={newTime}
                      onChange={(event) => setNewTime(event.target.value)}
                    >
                      <option value="">
                        {slots.length
                          ? "Elige una hora"
                          : "No hay horas disponibles"}
                      </option>
                      {newDate === modal.appointment.date &&
                        !slots.includes(modal.appointment.time) && (
                          <option value={modal.appointment.time}>
                            {modal.appointment.time} (hora actual)
                          </option>
                        )}
                      {slots.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="admin-helper">
                    Elige una nueva hora libre o conserva la actual para editar
                    las notas.
                  </p>
                  <label>
                    Notas de la cita (opcional)
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={newNote}
                      placeholder="Por ejemplo: el cliente ha llamado para cambiar la hora."
                      onChange={(event) => setNewNote(event.target.value)}
                    />
                  </label>
                </>
              ) : (
                <p className="admin-cancel-copy">
                  La hora volverá a estar disponible para otros clientes. Esta
                  cita no sumará puntos.
                </p>
              )}
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn-outline"
                  disabled={!!pending}
                  onClick={() => setModal(null)}
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className={`admin-btn ${modal.action === "cancel" ? "admin-btn-danger" : "admin-btn-dark"}`}
                  disabled={
                    !!pending || (modal.action === "reschedule" && !newTime)
                  }
                >
                  {pending
                    ? "Guardando…"
                    : modal.action === "reschedule"
                      ? "Guardar cambios"
                      : "Sí, cancelar cita"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
