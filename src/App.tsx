import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Gift,
  Home,
  Instagram,
  LogOut,
  Menu,
  Plus,
  Scissors,
  ShieldCheck,
  Sparkles,
  Ticket,
  UserRound,
  WifiOff,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApp } from "./lib/AppContext";
import { avatarSource, preparePhoto } from "./lib/avatar";
import {
  addDays,
  formatDate,
  formatMoney,
  getSlots,
  loyalty,
  nextAppointment,
  today,
} from "./lib/domain";
import type { Appointment, Profile } from "./lib/types";
import Modal from "./components/Modal";
import AdminPanel from "./components/AdminPanel";

type View = "home" | "appointments" | "club" | "admin";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const failMessage = (e: unknown) =>
  e instanceof Error
    ? e.message
    : (e as { message?: string })?.message ||
      "Algo no ha ido bien. Inténtalo de nuevo.";
function Avatar({
  profile,
  small = false,
}: {
  profile: Profile;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const source = avatarSource(profile);
  useEffect(() => setFailed(false), [source, profile.avatar]);
  return (
    <span className={`avatar ${small ? "avatar-small" : ""}`}>
      {source && !failed ? (
        <img
          src={source}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : profile.avatar && !failed && profile.avatar.length <= 20 ? (
        profile.avatar
      ) : (
        profile.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.8 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.5a4.7 4.7 0 0 1-2 3.1V20h3.3c1.9-1.8 3-4.5 3-7.8Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.8-2.4l-3.3-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.8v2.7A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.2 13.7a6 6 0 0 1 0-3.4V7.6H2.8a10 10 0 0 0 0 8.8l3.4-2.7Z"
      />
      <path
        fill="#EA4335"
        d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9.2 5.6l3.4 2.7C7 7.8 9.3 6 12 6Z"
      />
    </svg>
  );
}
function LoginOptions({ onSuccess }: { onSuccess: () => void }) {
  const { isDemo, canExploreAdminDemo, signInGoogle, signInDemo, signInAdmin } =
    useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adminLogin, setAdminLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function login(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onSuccess();
    } catch (e) {
      setError(failMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-options">
      <button
        type="button"
        className="btn btn-google full"
        disabled={busy || isDemo}
        onClick={() => void login(signInGoogle)}
      >
        <GoogleIcon />
        Continuar con Google
        <ArrowRight size={18} />
      </button>
      {isDemo ? (
        <>
          <p className="demo-explanation">
            Google todavía no está configurado. Mientras tanto puedes probar la
            demo; sus citas solo se guardan en este navegador.
          </p>
          <button
            type="button"
            className="btn btn-dark full"
            disabled={busy}
            onClick={() => void login(() => signInDemo("customer"))}
          >
            Probar como cliente <ArrowRight size={18} />
          </button>
          {canExploreAdminDemo && (
            <button
              type="button"
              className="text-button demo-admin-link"
              disabled={busy}
              onClick={() => void login(() => signInDemo("admin"))}
            >
              <ShieldCheck size={15} /> Explorar el panel de administración
            </button>
          )}
        </>
      ) : (
        <p className="fine-print">
          Solo usaremos tu cuenta para identificarte y gestionar tus citas.
        </p>
      )}
      <button
        type="button"
        className="text-button demo-admin-link"
        aria-expanded={adminLogin}
        onClick={() => {
          setAdminLogin(!adminLogin);
          setError("");
          setPassword("");
        }}
      >
        <ShieldCheck size={15} /> Acceso de administrador
      </button>
      {adminLogin &&
        (isDemo ? (
          <p className="demo-explanation">
            El acceso de administrador está cerrado en esta demo publicada. Para
            activarlo, conecta Supabase y crea la cuenta del barbero con su
            correo y contraseña.
          </p>
        ) : (
          <div className="admin-login-fields">
            <label className="field">
              Correo del administrador
              <input
                type="email"
                autoComplete="username"
                value={email}
                maxLength={254}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              Contraseña
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                maxLength={128}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (email && password && !busy)
                      void login(() => signInAdmin(email, password));
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-dark full"
              disabled={busy || !email.trim() || !password}
              onClick={() =>
                void login(async () => {
                  try {
                    await signInAdmin(email, password);
                  } finally {
                    setPassword("");
                  }
                })
              }
            >
              {busy ? "Entrando…" : "Entrar como administrador"}{" "}
              <ShieldCheck size={17} />
            </button>
          </div>
        ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
function AuthModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Iniciar sesión" onClose={onClose}>
      <span className="modal-emblem">
        <Scissors size={30} />
      </span>
      <p className="eyebrow">BIENVENIDO A LA CASA</p>
      <h2>
        Tu corte.
        <br /> Tu cuenta.
      </h2>
      <p className="muted modal-intro">
        Reserva en un momento, guarda tu estilo y empieza a sumar cortes.
      </p>
      <LoginOptions onSuccess={onClose} />
    </Modal>
  );
}

function Booking({
  initialDate,
  initialTime,
  onClose,
  onBooked,
}: {
  initialDate?: string;
  initialTime?: string;
  onClose: () => void;
  onBooked: (appointment: Appointment) => void;
}) {
  const {
    data,
    profile,
    bookAppointment,
    fetchIntervals,
    isDemo,
    error: backendError,
  } = useApp();
  const [serviceId, setServiceId] = useState(data.services[0]?.id || "cut");
  const [date, setDate] = useState(
    () =>
      initialDate ||
      Array.from({ length: 7 }, (_, i) => addDays(today(), i)).find(
        (d) =>
          data.services[0] && getSlots(d, data.services[0], data).length > 0,
      ) ||
      today(),
  );
  const [time, setTime] = useState(initialTime || "");
  const [offset, setOffset] = useState(0);
  const [step, setStep] = useState(1);
  const [redemption, setRedemption] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [intervals, setIntervals] = useState<
    { time: string; duration: number }[]
  >([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const service =
    data.services.find((s) => s.id === serviceId) || data.services[0];
  const rewards = profile
    ? loyalty(profile.id, data.appointments, data.settings.requiredCuts)
    : null;
  useEffect(() => {
    let active = true;
    setLoadingSlots(true);
    setSlotsError("");
    fetchIntervals(date)
      .then((result) => {
        if (active) setIntervals(result);
      })
      .catch((e) => {
        if (active) setSlotsError(failMessage(e));
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });
    return () => {
      active = false;
    };
    // fetchIntervals uses the live backend client, but its identity changes on refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  const slots =
    service && !slotsError && !backendError
      ? getSlots(date, service, data, { bookedIntervals: intervals })
      : [];
  const dates = Array.from(
    { length: Math.min(7, data.settings.advanceDays + 1 - offset) },
    (_, i) => addDays(today(), offset + i),
  );
  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const booked = await bookAppointment({
        serviceId: service.id,
        date,
        time,
        redemption,
        note: note.trim(),
      });
      onBooked(booked);
    } catch (err) {
      setError(failMessage(err));
      setStep(1);
      setTime("");
      try {
        setIntervals(await fetchIntervals(date));
      } catch {
        setSlotsError("No se pudo actualizar la disponibilidad.");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Reservar cita" onClose={onClose} wide>
      <p className="eyebrow">UN RATO PARA TI</p>
      <h2>
        {step === 1 ? "Vamos a ponerte a punto." : "Todo listo para tu corte."}
      </h2>
      <div className="booking-steps">
        <span className={step === 1 ? "current" : ""}>
          <b>01</b> Día y hora
        </span>
        <span className={step === 2 ? "current" : ""}>
          <b>02</b> Confirmación
        </span>
        <span>
          <b>03</b> Buen corte
        </span>
      </div>
      {step === 1 ? (
        <>
          <div className="service-options">
            {data.services.map((s) => (
              <button
                key={s.id}
                className={`service-option ${serviceId === s.id ? "selected" : ""}`}
                onClick={() => {
                  setServiceId(s.id);
                  setTime("");
                }}
              >
                <Scissors size={22} />
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.duration} minutos · A tu estilo</small>
                </span>
                <b>{formatMoney(s.price)}</b>
                {serviceId === s.id && <Check size={17} />}
              </button>
            ))}
          </div>
          <div className="picker-heading">
            <h3>Elige tu día</h3>
            <div>
              <button
                className="icon-button"
                aria-label="Semana anterior"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 7))}
              >
                <ChevronLeft size={19} />
              </button>
              <span>{formatDate(dates[0], { month: "long" })}</span>
              <button
                className="icon-button"
                aria-label="Semana siguiente"
                disabled={offset + 7 > data.settings.advanceDays}
                onClick={() => setOffset(offset + 7)}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <div className="date-strip">
            {dates.map((d) => (
              <button
                key={d}
                className={`date-choice ${date === d ? "selected" : ""}`}
                disabled={
                  !data.settings.openingHours[
                    new Date(`${d}T12:00:00Z`).getUTCDay()
                  ]?.open
                }
                onClick={() => {
                  setDate(d);
                  setTime("");
                }}
              >
                <span>
                  {formatDate(d, { weekday: "short" }).replace(".", "")}
                </span>
                <b>{Number(d.slice(-2))}</b>
                <small>
                  {d === today()
                    ? "Hoy"
                    : formatDate(d, { month: "short" }).replace(".", "")}
                </small>
              </button>
            ))}
          </div>
          <h3 className="slot-heading">
            Y tu hora{" "}
            <small>
              <Clock3 size={14} /> Hora de Madrid
            </small>
          </h3>
          {loadingSlots ? (
            <p className="muted">Buscando huecos…</p>
          ) : slotsError || backendError ? (
            <p className="form-error" role="alert">
              No podemos consultar la agenda. {slotsError || backendError}
            </p>
          ) : slots.length ? (
            <div className="slot-grid">
              {slots.map((s) => (
                <button
                  key={s}
                  className={`time-choice ${time === s ? "selected" : ""}`}
                  onClick={() => setTime(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-slots">
              <CalendarDays size={24} />
              <p>No quedan huecos para este día. Prueba con otra fecha.</p>
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <span className="muted small">
              {service?.duration} min de buen rollo.
            </span>
            <button
              className="btn btn-dark"
              disabled={!time || loadingSlots || !slots.includes(time)}
              onClick={() => setStep(2)}
            >
              Continuar <ArrowRight size={18} />
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={(e) => void confirm(e)}>
          <div className="booking-summary">
            <span className="summary-icon">
              <Scissors size={25} />
            </span>
            <div>
              <h3>{service.name}</h3>
              <p>
                {formatDate(date, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}{" "}
                · {time} h
              </p>
              <small>{service.duration} minutos · Barber Cruz</small>
            </div>
            <strong>
              {redemption ? "Gratis" : formatMoney(service.price)}
            </strong>
          </div>
          {profile ? (
            <>
              <p className="booking-for">
                <Avatar profile={profile} small />
                <span>
                  La reservamos a nombre de <strong>{profile.name}</strong>
                </span>
              </p>
              <label className="field">
                ¿Algo que deba saber tu barbero?
                <textarea
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Un degradado bajito, repasar el flequillo… (opcional)"
                  rows={3}
                />
              </label>
              {service.id === "cut" &&
                rewards &&
                rewards.rewardsAvailable > 0 && (
                  <label className="reward-check">
                    <input
                      type="checkbox"
                      checked={redemption}
                      onChange={(e) => setRedemption(e.target.checked)}
                    />
                    <Gift size={21} />
                    <span>
                      Usar mi corte gratis
                      <small>Te lo has ganado. Este va por la casa.</small>
                    </span>
                  </label>
                )}
              <p className="fine-print">
                ¿Cambian los planes? Podrás cancelar desde Mis citas antes de
                que empiece el corte.{isDemo && " Esta reserva es de prueba."}
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft size={16} /> Volver
                </button>
                <button
                  className="btn btn-lime"
                  disabled={busy || Boolean(backendError)}
                  type="submit"
                >
                  {busy ? "Reservando…" : "Confirmar mi cita"}{" "}
                  <Check size={19} />
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="modal-intro muted">
                Un último paso: entra en tu cuenta para guardar la cita.
              </p>
              <LoginOptions onSuccess={() => {}} />
              <button
                type="button"
                className="text-button"
                onClick={() => setStep(1)}
              >
                <ArrowLeft size={16} /> Cambiar día y hora
              </button>
            </>
          )}
        </form>
      )}
    </Modal>
  );
}
function downloadCalendar(
  a: Appointment,
  serviceName: string,
  duration: number,
) {
  const [hour, minute] = a.time.split(":").map(Number);
  const endMinutes = hour * 60 + minute + duration;
  const date = a.date.replaceAll("-", "");
  const startTime = `${date}T${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}00`;
  const endTime = `${date}T${String(Math.floor(endMinutes / 60)).padStart(2, "0")}${String(endMinutes % 60).padStart(2, "0")}00`;
  const escape = (s: string) =>
    s
      .replaceAll("\\", "\\\\")
      .replaceAll("\n", "\\n")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;");
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Barber Cruz//Reservas//ES\r\nBEGIN:VTIMEZONE\r\nTZID:Europe/Madrid\r\nBEGIN:DAYLIGHT\r\nDTSTART:19700329T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nDTSTART:19701025T030000\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nUID:${a.id}@barbercruz\r\nDTSTAMP:${stamp}\r\nDTSTART;TZID=Europe/Madrid:${startTime}\r\nDTEND;TZID=Europe/Madrid:${endTime}\r\nSUMMARY:${escape(`${serviceName} — Barber Cruz`)}\r\nDESCRIPTION:${escape("Tu cita con Barber Cruz. Gestiona cambios desde Mis citas en la web.")}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  const url = URL.createObjectURL(
    new Blob([ics], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "barber-cruz-cita.ics";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function BookingSuccess({
  appointment,
  onClose,
  onAppointments,
}: {
  appointment: Appointment;
  onClose: () => void;
  onAppointments: () => void;
}) {
  const { data, isDemo } = useApp();
  const service = data.services.find((s) => s.id === appointment.serviceId);
  return (
    <Modal title="Cita confirmada" onClose={onClose}>
      <div className="success-symbol">
        <CheckCheck size={40} />
      </div>
      <p className="eyebrow">HECHO. NOS VEMOS PRONTO.</p>
      <h2>
        Ya tienes
        <br /> tu hueco.
      </h2>
      <p className="muted modal-intro">
        {isDemo
          ? "Reserva de prueba guardada en este dispositivo."
          : "Tu cita está confirmada. Tu barbero ya puede verla."}
      </p>
      <div className="success-date">
        <CalendarDays size={25} />
        <div>
          <strong>
            {formatDate(appointment.date, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </strong>
          <span>
            {appointment.time} h · {service?.name} ·{" "}
            {appointment.redemption
              ? "Gratis"
              : formatMoney(appointment.price ?? service?.price ?? 0)}
          </span>
        </div>
      </div>
      <button className="btn btn-dark full" onClick={onAppointments}>
        Ver mis citas <ArrowRight size={18} />
      </button>
      <button
        className="text-button calendar-download"
        onClick={() =>
          downloadCalendar(
            appointment,
            service?.name || "Corte de pelo",
            appointment.duration ?? service?.duration ?? 45,
          )
        }
      >
        <Plus size={17} /> Añadir al calendario
      </button>
    </Modal>
  );
}
function ProfileEditor({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (s: string) => void;
}) {
  const { profile, saveProfile, isDemo, changeAdminPassword } = useApp();
  const [draft, setDraft] = useState(profile!);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [photo, setPhoto] = useState<Blob | undefined>();
  const [photoPreview, setPhotoPreview] = useState<string>();
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoVersion = useRef(0);
  useEffect(() => {
    if (!photo) {
      setPhotoPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(
    () => () => {
      photoVersion.current += 1;
    },
    [],
  );
  async function choosePhoto(file?: File) {
    if (!file) return;
    const version = ++photoVersion.current;
    setError("");
    setPreparingPhoto(true);
    try {
      const prepared = await preparePhoto(file);
      if (version === photoVersion.current) setPhoto(prepared);
    } catch (err) {
      if (version === photoVersion.current) setError(failMessage(err));
    } finally {
      if (version === photoVersion.current) setPreparingPhoto(false);
    }
  }
  async function updatePassword() {
    setError("");
    if (newPassword !== repeatPassword) {
      setError("Las dos contraseñas deben coincidir.");
      return;
    }
    setChangingPassword(true);
    try {
      await changeAdminPassword(newPassword);
      setNewPassword("");
      setRepeatPassword("");
      onToast("Contraseña actualizada.");
    } catch (err) {
      setError(failMessage(err));
    } finally {
      setChangingPassword(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveProfile(draft, photo);
      onToast("Perfil actualizado. Muy tú.");
      onClose();
    } catch (err) {
      setError(failMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Editar mi perfil" onClose={onClose}>
      <p className="eyebrow">A TU MANERA</p>
      <h2>Este eres tú.</h2>
      <form onSubmit={(e) => void submit(e)} className="profile-form">
        <div className="profile-avatar-row">
          <Avatar
            profile={
              photoPreview ? { ...draft, avatarUrl: photoPreview } : draft
            }
          />
          <div>
            <strong>Tu foto de perfil</strong>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp"
              aria-label="Elegir foto de perfil"
              onChange={(e) => {
                void choosePhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="btn btn-ghost profile-photo-button"
              disabled={busy || preparingPhoto}
              onClick={() => fileInput.current?.click()}
            >
              <Camera size={17} />
              {preparingPhoto ? "Preparando foto…" : "Elegir de la galería"}
            </button>
            <p className="profile-photo-help">
              JPG, PNG o WebP · hasta 10 MB. Se guardará al guardar el perfil.
            </p>
            <strong className="avatar-options-label">O elige un avatar</strong>
            <div className="avatar-options">
              {["😎", "🔥", "⚡", "💈", "👑", "✂️"].map((a) => (
                <button
                  type="button"
                  key={a}
                  aria-label={`Avatar ${a}`}
                  aria-pressed={!photo && draft.avatar === a}
                  className={!photo && draft.avatar === a ? "selected" : ""}
                  disabled={busy}
                  onClick={() => {
                    photoVersion.current += 1;
                    setError("");
                    setPreparingPhoto(false);
                    setPhoto(undefined);
                    setDraft({ ...draft, avatar: a, avatarUrl: undefined });
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="field">
          Tu nombre
          <input
            required
            maxLength={60}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            autoComplete="name"
          />
        </label>
        <label className="field">
          Tu estilo favorito
          <select
            value={draft.preferredStyle}
            onChange={(e) =>
              setDraft({ ...draft, preferredStyle: e.target.value })
            }
          >
            <option value="">Lo decidimos en la silla</option>
            {[
              "Degradado",
              "Clásico",
              "Taper fade",
              "Buzz cut",
              "Mullet",
              "Otro estilo",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Un poco sobre ti
          <textarea
            maxLength={250}
            value={draft.bio}
            onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
            placeholder="Cómo te gusta el corte, lo que no puede faltar…"
            rows={3}
          />
        </label>
        <div className="profile-email">
          <GoogleIcon />
          <span>
            {draft.email}
            <small>Vinculado a tu cuenta</small>
          </span>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-lime full"
          disabled={busy || preparingPhoto}
        >
          {busy ? "Guardando…" : "Guardar mi perfil"}
          <Check size={18} />
        </button>
      </form>
      {profile?.role === "admin" && !isDemo && (
        <form
          className="password-settings"
          onSubmit={(e) => {
            e.preventDefault();
            void updatePassword();
          }}
        >
          <h3>Contraseña de administrador</h3>
          <p className="fine-print">
            Tu contraseña solo se envía al servicio de autenticación. Usa al
            menos 12 caracteres.
          </p>
          <label className="field">
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              maxLength={128}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <label className="field">
            Repetir contraseña
            <input
              type="password"
              autoComplete="new-password"
              maxLength={128}
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn btn-ghost full"
            disabled={
              changingPassword || newPassword.length < 12 || !repeatPassword
            }
          >
            {changingPassword ? "Actualizando…" : "Cambiar contraseña"}
          </button>
        </form>
      )}
    </Modal>
  );
}
function StampCard({
  compact = false,
  onLogin,
  onBook,
}: {
  compact?: boolean;
  onLogin: () => void;
  onBook: () => void;
}) {
  const { data, profile } = useApp();
  const count = data.settings.requiredCuts;
  const points = profile
    ? loyalty(profile.id, data.appointments, count)
    : { paidCuts: 0, stamps: 0, rewardsAvailable: 0, rewardsUsed: 0 };
  return (
    <div className={`loyalty-card ${compact ? "compact" : ""}`}>
      <div className="loyalty-top">
        <span className="eyebrow">
          <span className="tiny-star">✳</span> CLUB CRUZ
        </span>
        <span className="loyalty-pill">{count} + 1</span>
      </div>
      <h2>
        La lealtad
        <br /> tiene su <span>premio.</span>
      </h2>
      <p>
        {points.rewardsAvailable > 0
          ? "Te has ganado un corte gratis. ¡A disfrutarlo!"
          : `${count} cortes pagados. El siguiente, por la casa.`}
      </p>
      <div className="stamp-row">
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={`stamp ${i < points.stamps ? "earned" : ""}`}
            aria-label={`Sello ${i + 1}: ${i < points.stamps ? "conseguido" : "pendiente"}`}
          >
            {i < points.stamps ? (
              <Scissors size={18} />
            ) : (
              String(i + 1).padStart(2, "0")
            )}
          </span>
        ))}
        <span className="stamp gift-stamp">
          <Gift size={20} />
        </span>
      </div>
      <div className="loyalty-bottom">
        <span>
          {profile ? (
            <>
              <b>
                {points.stamps} de {count}
              </b>{" "}
              cortes{" "}
              {points.rewardsAvailable ? "· Premio disponible" : "completados"}
            </>
          ) : (
            "Tu primer corte es el primer sello."
          )}
        </span>
        <button
          aria-label={
            profile ? "Reservar para sumar cortes" : "Entrar al Club Cruz"
          }
          className="circle-button"
          onClick={profile ? onBook : onLogin}
        >
          <ArrowUpRightIcon />
        </button>
      </div>
    </div>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={22} style={{ transform: "rotate(-45deg)" }} />;
}
function QuickBooking({
  onBook,
}: {
  onBook: (date?: string, time?: string) => void;
}) {
  const { data, fetchIntervals, error: backendError } = useApp();
  const initial = today();
  const [date, setDate] = useState(
    () =>
      Array.from({ length: 7 }, (_, i) => addDays(initial, i)).find(
        (d) =>
          data.services[0] && getSlots(d, data.services[0], data).length > 0,
      ) || initial,
  );
  const [intervals, setIntervals] = useState<
    { time: string; duration: number }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const service = data.services[0];
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetchIntervals(date)
      .then((r) => {
        if (active) setIntervals(r);
      })
      .catch(() => {
        if (active) setError("No podemos consultar la agenda ahora.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date]);
  const slots =
    service && !error && !backendError
      ? getSlots(date, service, data, { bookedIntervals: intervals })
      : [];
  return (
    <section className="quick-booking">
      <div className="card-heading">
        <div>
          <p className="eyebrow">MENOS MENSAJES. MÁS CORTES.</p>
          <h2>Hazte un hueco.</h2>
        </div>
        <span className="mini-icon">
          <CalendarDays size={23} />
        </span>
      </div>
      <div className="quick-date-header">
        <span>{formatDate(date, { month: "long", year: "numeric" })}</span>
        <button className="text-button" onClick={() => onBook(date)}>
          Ver calendario <ChevronRight size={15} />
        </button>
      </div>
      <div className="date-strip">
        {Array.from({ length: 7 }, (_, i) => addDays(initial, i)).map((d) => (
          <button
            key={d}
            className={`date-choice ${date === d ? "selected" : ""}`}
            disabled={
              !data.settings.openingHours[
                new Date(`${d}T12:00:00Z`).getUTCDay()
              ]?.open
            }
            onClick={() => setDate(d)}
          >
            <span>{formatDate(d, { weekday: "short" }).replace(".", "")}</span>
            <b>{Number(d.slice(-2))}</b>
            <small>{d === initial ? "Hoy" : " "}</small>
          </button>
        ))}
      </div>
      <div className="quick-slot-label">
        <span>
          <span className="status-dot" /> Huecos disponibles
        </span>
        <small>Hora de Madrid</small>
      </div>
      {loading ? (
        <p className="muted quick-empty">Buscando tu próximo hueco…</p>
      ) : error || backendError ? (
        <p className="form-error">{error || "La agenda no está disponible."}</p>
      ) : slots.length ? (
        <div className="quick-slots">
          {slots.slice(0, 6).map((s) => (
            <button
              className="time-choice"
              key={s}
              onClick={() => onBook(date, s)}
            >
              {s}
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      ) : (
        <p className="muted quick-empty">
          {data.settings.openingHours[new Date(`${date}T12:00:00Z`).getUTCDay()]
            ?.open
            ? "Este día ya está completo. Elige otro y te guardamos un hueco."
            : "Hoy toca recargar. Elige otro día para tu corte."}
        </p>
      )}
      <div className="quick-book-footer">
        <span>
          <Scissors size={15} /> {service?.name || "Corte de pelo"}{" "}
          <b>{formatMoney(service?.price ?? 7)}</b>
          <i>·</i> {service?.duration || 45} min
        </span>
        <button className="text-button" onClick={() => onBook(date)}>
          Todos los horarios <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}
function Appointments({
  onBook,
  onLogin,
  onToast,
}: {
  onBook: () => void;
  onLogin: () => void;
  onToast: (s: string) => void;
}) {
  const { data, profile, updateAppointment, isDemo } = useApp();
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const [cancel, setCancel] = useState<Appointment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upcoming = data.appointments
    .filter((a) => a.userId === profile?.id && a.status === "confirmed")
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const history = data.appointments
    .filter((a) => a.userId === profile?.id && a.status !== "confirmed")
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  const list = tab === "upcoming" ? upcoming : history;
  async function confirmCancellation() {
    if (!cancel) return;
    setBusy(true);
    setError("");
    try {
      await updateAppointment(cancel.id, "cancelled");
      setCancel(null);
      onToast("Cita cancelada. Nos vemos en la próxima.");
    } catch (e) {
      setError(failMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TU AGENDA, CON BUEN LOOK</p>
          <h1>
            Mis citas<span className="heading-dot">.</span>
          </h1>
          <p className="muted">Ese ratito para ti, siempre a mano.</p>
        </div>
        <button className="btn btn-dark" onClick={onBook}>
          <Plus size={18} /> Nueva cita
        </button>
      </div>
      {profile ? (
        <>
          <div className="page-tabs">
            <button
              className={tab === "upcoming" ? "active" : ""}
              onClick={() => setTab("upcoming")}
            >
              Próximas citas <span>{upcoming.length}</span>
            </button>
            <button
              className={tab === "history" ? "active" : ""}
              onClick={() => setTab("history")}
            >
              Historial <span>{history.length}</span>
            </button>
          </div>
          {list.length ? (
            <div className="appointments-list">
              {list.map((a) => {
                const s = data.services.find(
                  (service) => service.id === a.serviceId,
                );
                const cancellable = Boolean(nextAppointment(profile.id, [a]));
                return (
                  <article className="appointment-card" key={a.id}>
                    <div className="appointment-day">
                      <small>
                        {formatDate(a.date, { month: "short" }).replace(
                          ".",
                          "",
                        )}
                      </small>
                      <b>{Number(a.date.slice(-2))}</b>
                      <span>
                        {formatDate(a.date, { weekday: "short" }).replace(
                          ".",
                          "",
                        )}
                      </span>
                    </div>
                    <div className="appointment-details">
                      <div className="appointment-title">
                        <h3>{s?.name || "Corte de pelo"}</h3>
                        <span className={`appointment-status ${a.status}`}>
                          {a.status === "confirmed"
                            ? "Confirmada"
                            : a.status === "completed"
                              ? "Realizada"
                              : "Cancelada"}
                        </span>
                      </div>
                      <p>
                        <Clock3 size={15} />
                        {a.time} h <i>·</i>
                        {a.duration ?? s?.duration ?? 45} minutos <i>·</i>
                        {a.redemption
                          ? "Corte gratis"
                          : formatMoney(a.price ?? s?.price ?? 7)}
                      </p>
                      {a.note && (
                        <small className="appointment-note">“{a.note}”</small>
                      )}
                      {isDemo && (
                        <small className="appointment-demo">
                          Reserva de demostración
                        </small>
                      )}
                    </div>
                    <div className="appointment-actions">
                      {a.status === "confirmed" && (
                        <button
                          className="text-button"
                          onClick={() =>
                            downloadCalendar(
                              a,
                              s?.name || "Corte de pelo",
                              a.duration ?? s?.duration ?? 45,
                            )
                          }
                        >
                          <Plus size={14} /> Calendario
                        </button>
                      )}
                      {cancellable && (
                        <button
                          className="text-button text-danger"
                          onClick={() => {
                            setCancel(a);
                            setError("");
                          }}
                        >
                          Cancelar cita
                        </button>
                      )}
                      {a.status === "completed" &&
                        !a.redemption &&
                        (a.serviceId === "cut" || a.serviceId === "combo") && (
                          <span className="points-added">
                            <Sparkles size={16} /> +1 sello
                          </span>
                        )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <CalendarDays size={38} />
              <h2>
                {tab === "upcoming"
                  ? "Tu próximo corte te espera."
                  : "Aquí empieza tu historia."}
              </h2>
              <p className="muted">
                {tab === "upcoming"
                  ? "Elige el día que te venga bien. Del resto nos encargamos nosotros."
                  : "Cuando vengas a tu primer corte, lo verás aquí."}
              </p>
              <button className="btn btn-lime" onClick={onBook}>
                Reservar mi corte <ArrowRight size={18} />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <UserRound size={38} />
          <h2>Entra y te guardamos sitio.</h2>
          <p className="muted">
            Tus reservas y tus cortes anteriores, juntos en tu cuenta.
          </p>
          <button className="btn btn-dark" onClick={onLogin}>
            Iniciar sesión <ArrowRight size={18} />
          </button>
        </div>
      )}
      {cancel && (
        <Modal
          title="Cancelar cita"
          onClose={() => {
            if (!busy) setCancel(null);
          }}
        >
          <span className="modal-emblem">
            <CalendarDays size={28} />
          </span>
          <h2>¿Cambian los planes?</h2>
          <p className="muted modal-intro">
            Vas a cancelar tu cita del{" "}
            {formatDate(cancel.date, { day: "numeric", month: "long" })} a las{" "}
            {cancel.time}. El hueco quedará libre para otra persona.
          </p>
          {cancel.redemption && (
            <p className="reward-notice">
              <Gift size={19} /> Tu corte gratis volverá a estar disponible.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setCancel(null)}
            >
              Me quedo la cita
            </button>
            <button
              className="btn btn-dark"
              disabled={busy}
              onClick={() => void confirmCancellation()}
            >
              {busy ? "Cancelando…" : "Sí, cancelar"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Club({
  onLogin,
  onBook,
}: {
  onLogin: () => void;
  onBook: () => void;
}) {
  const { data, profile } = useApp();
  const points = profile
    ? loyalty(profile.id, data.appointments, data.settings.requiredCuts)
    : null;
  const items: { icon: LucideIcon; title: string; text: string }[] = [
    {
      icon: CalendarDays,
      title: "Reserva y ven.",
      text: "Elige tu hueco y déjate hacer. Aquí cada corte cuenta.",
    },
    {
      icon: Scissors,
      title: "Suma un sello.",
      text: "Cuando tu barbero complete un corte pagado, sumas un sello.",
    },
    {
      icon: Gift,
      title: "El siguiente, gratis.",
      text: `Después de ${data.settings.requiredCuts} cortes pagados, canjea un corte de pelo por la casa.`,
    },
  ];
  return (
    <div className="page-content club-page">
      <p className="eyebrow">PARA LOS QUE SIEMPRE VUELVEN</p>
      <h1>
        Buen pelo.
        <br /> Mejores recompensas<span className="heading-dot">.</span>
      </h1>
      <p className="muted club-intro">
        Tú pones la confianza. Nosotros ponemos el siguiente corte.
      </p>
      <div className="club-layout">
        <StampCard onLogin={onLogin} onBook={onBook} />
        <div className="club-statistics">
          <h3>
            {profile
              ? `Tu club, ${profile.name.split(" ")[0]}.`
              : "Tu silla te está esperando."}
          </h3>
          <div>
            <span>
              <b>{points?.paidCuts || 0}</b> cortes pagados
            </span>
            <span>
              <b>{points?.rewardsUsed || 0}</b> premios disfrutados
            </span>
          </div>
          <p className="muted">
            Los cortes gratuitos no suman sellos. Si cancelas una cita gratuita,
            recuperas el premio. El arreglo de barba por sí solo no suma sellos.
          </p>
          {points && points.rewardsAvailable > 0 && (
            <button className="btn btn-dark" onClick={onBook}>
              Canjear mi corte gratis <Gift size={18} />
            </button>
          )}
        </div>
      </div>
      <div className="club-how">
        {items.map(({ icon: Icon, title, text }, i) => (
          <article key={title}>
            <span className="how-number">0{i + 1}</span>
            <Icon size={29} />
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
function InstallModal({
  installEvent,
  onClose,
  onInstalled,
}: {
  installEvent: InstallEvent | null;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const [error, setError] = useState("");
  async function install() {
    try {
      await installEvent!.prompt();
      const choice = await installEvent!.userChoice;
      if (choice.outcome === "accepted") onInstalled();
      onClose();
    } catch {
      setError(
        "Abre el menú del navegador y elige Instalar aplicación o Añadir a pantalla de inicio.",
      );
    }
  }
  return (
    <Modal title="Instalar Barber Cruz" onClose={onClose}>
      <span className="modal-emblem">
        <ArrowDownToLine size={29} />
      </span>
      <p className="eyebrow">TU BARBERO, EN EL BOLSILLO</p>
      <h2>
        A un toque
        <br /> de buen pelo.
      </h2>
      <p className="muted modal-intro">
        Añade Barber Cruz a la pantalla de inicio para abrirla como una app.
      </p>
      {installEvent ? (
        <button className="btn btn-lime full" onClick={() => void install()}>
          Instalar Barber Cruz <ArrowDownToLine size={18} />
        </button>
      ) : (
        <ol className="install-steps">
          {isIOS ? (
            <>
              <li>
                Abre esta web en <strong>Safari</strong>.
              </li>
              <li>
                Pulsa <strong>Compartir</strong> en la barra del navegador.
              </li>
              <li>
                Elige <strong>Añadir a pantalla de inicio</strong> y confirma.
              </li>
            </>
          ) : (
            <>
              <li>
                Abre esta web en <strong>Chrome</strong> o un navegador
                compatible.
              </li>
              <li>
                Pulsa el menú de <strong>tres puntos</strong>.
              </li>
              <li>
                Elige <strong>Instalar aplicación</strong> o{" "}
                <strong>Añadir a pantalla de inicio</strong>.
              </li>
            </>
          )}
        </ol>
      )}
      <p className="fine-print">
        Para instalarla desde el móvil, la web tiene que estar publicada con
        HTTPS. Las reservas necesitan conexión a internet.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
export default function App() {
  const app = useApp();
  const { data, profile, isDemo, loading, error } = app;
  const [view, setView] = useState<View>("home");
  const [authOpen, setAuthOpen] = useState(false);
  const [booking, setBooking] = useState<{
    date?: string;
    time?: string;
  } | null>(null);
  const [success, setSuccess] = useState<Appointment | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches,
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState("");
  const [info, setInfo] = useState<"privacy" | "about" | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  function notify(s: string) {
    setToast(s);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }
  function navigate(next: View) {
    setView(next);
    setMobileMenu(false);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  useEffect(() => {
    const before = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", done);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", done);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node))
        setMenuOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setMobileMenu(false);
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (view === "admin" && profile?.role !== "admin") setView("home");
  }, [profile, view]);
  const next = profile ? nextAppointment(profile.id, data.appointments) : null;
  const book = (date?: string, time?: string) => {
    setBooking({ date, time });
    setMobileMenu(false);
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <header className="site-header">
        <div className="header-inner">
          <button
            className="brand"
            aria-label="Barber Cruz, inicio"
            onClick={() => navigate("home")}
          >
            <span className="brand-mark">
              <Scissors size={25} strokeWidth={1.8} />
            </span>
            <span>
              BARBER
              <span>
                CRUZ<span className="brand-dot">.</span>
              </span>
            </span>
          </button>
          <nav className="desktop-nav" aria-label="Navegación principal">
            {(
              [
                { id: "home", label: "Inicio" },
                { id: "appointments", label: "Mis citas" },
                { id: "club", label: "Club Cruz" },
              ] as { id: View; label: string }[]
            ).map((n) => (
              <button
                key={n.id}
                className={view === n.id ? "active" : ""}
                onClick={() => navigate(n.id)}
              >
                {n.label}
                {n.id === "club" && (
                  <span className="nav-new">
                    {data.settings.requiredCuts}+1
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <button className="btn btn-dark header-book" onClick={() => book()}>
              Reservar cita <ArrowUpRightIcon />
            </button>
            {profile ? (
              <div className="profile-menu" ref={menuRef}>
                <button
                  className="profile-trigger"
                  aria-label="Menú de mi cuenta"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  <Avatar profile={profile} small />
                  <ChevronDown size={14} />
                </button>
                {menuOpen && (
                  <div className="account-dropdown">
                    <strong>
                      {profile.name}
                      <small>
                        {profile.role === "admin"
                          ? "Administrador"
                          : "Miembro de Club Cruz"}
                      </small>
                    </strong>
                    <button
                      onClick={() => {
                        setProfileOpen(true);
                        setMenuOpen(false);
                      }}
                    >
                      <UserRound size={17} /> Mi perfil
                    </button>
                    {profile.role === "admin" && (
                      <button onClick={() => navigate("admin")}>
                        <ShieldCheck size={17} /> Administrar barbería
                      </button>
                    )}
                    <button
                      onClick={() => {
                        void app
                          .signOut()
                          .then(() => {
                            setMenuOpen(false);
                            navigate("home");
                            notify("Sesión cerrada.");
                          })
                          .catch((e) => notify(failMessage(e)));
                      }}
                    >
                      <LogOut size={17} /> Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                className="login-trigger"
                onClick={() => setAuthOpen(true)}
              >
                <UserRound size={19} />
                <span>Entrar</span>
              </button>
            )}
            <button
              className="icon-button mobile-menu-button"
              aria-label={mobileMenu ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileMenu}
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              {mobileMenu ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <nav className="mobile-menu" aria-label="Menú móvil">
            <button onClick={() => navigate("home")}>Inicio</button>
            <button onClick={() => navigate("appointments")}>Mis citas</button>
            <button onClick={() => navigate("club")}>Club Cruz</button>
            {profile?.role === "admin" && (
              <button onClick={() => navigate("admin")}>
                Panel de administración
              </button>
            )}
            <button onClick={() => book()}>
              Reservar cita <ArrowRight size={17} />
            </button>
          </nav>
        )}
      </header>
      {isDemo && (
        <div className="demo-banner">
          <span className="status-dot" />
          <b>Demo local</b>
          <span>
            {app.canExploreAdminDemo
              ? "Pruebas locales de cliente y administrador."
              : "Vista de prueba para clientes; administración cerrada."}{" "}
            Las citas de prueba se guardan en este dispositivo.
          </span>
        </div>
      )}
      {!online && (
        <div className="offline-banner" role="status">
          <WifiOff size={17} /> Sin conexión.{" "}
          {isDemo
            ? "Puedes seguir probando la demo local."
            : "Conéctate a internet para consultar y gestionar tus citas."}
        </div>
      )}
      {error && (
        <div className="backend-error" role="alert">
          <span>{error}</span>
          <button className="text-button" onClick={() => void app.refresh()}>
            Reintentar
          </button>
        </div>
      )}
      <main id="main">
        {loading ? (
          <div className="loading-state">
            <Scissors size={32} />
            <p>Preparando tu silla…</p>
          </div>
        ) : view === "home" ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow hero-eyebrow">
                  <span className="status-dot" /> TU BARRIO. TU BARBERO.
                </p>
                <h1>
                  Tu próximo
                  <br />{" "}
                  <span className="hero-highlight">
                    buen corte
                    <svg
                      viewBox="0 0 410 12"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path d="M3 9 C110 0 285 0 405 7" />
                    </svg>
                  </span>
                  <span className="heading-dot">.</span>
                </h1>
                <p className="hero-description">
                  Un corte fresco. Un rato entre colegas.
                  <br /> Reserva tu hueco y ven como eres.
                </p>
                <div className="hero-buttons">
                  <button className="btn btn-lime" onClick={() => book()}>
                    Pilla tu cita <ArrowUpRightIcon />
                  </button>
                  <button
                    className="hero-club-button"
                    onClick={() => navigate("club")}
                  >
                    <span>
                      <Gift size={19} />
                    </span>
                    Ser de la casa tiene premio
                  </button>
                </div>
                <div className="hero-bottom">
                  <div className="hero-scissor">
                    <Scissors size={20} />
                  </div>
                  <span>
                    Tu estilo, sin complicaciones.
                    <br />{" "}
                    <strong>
                      {formatMoney(data.services[0]?.price ?? 7)} por corte{" "}
                      <i>·</i> {data.services[0]?.duration || 45} minutos para
                      ti
                    </strong>
                  </span>
                  <span className="handwritten">
                    Nos vemos
                    <br /> en la silla ↗
                  </span>
                </div>
              </div>
              <div className="hero-photo">
                <img
                  src="/barber-hero.png"
                  alt="Detalle de un degradado durante un corte de pelo, imagen de ambiente"
                  fetchPriority="high"
                />
                <div className="photo-shade" />
                <div className="hero-photo-top">
                  <span>
                    FRESH CUTS.
                    <br /> GOOD VIBES.
                  </span>
                  <span className="photo-count">BC / 01</span>
                </div>
                <div className="hero-sticker">
                  <Scissors size={23} />
                  <span>
                    HECHO A<br /> TU ESTILO
                  </span>
                </div>
                <div className="hero-photo-bottom">
                  <div>
                    <span className="photo-eyebrow">BARBER CRUZ</span>
                    <strong>
                      Más que un corte.
                      <br /> Tu sitio de siempre.
                    </strong>
                  </div>
                  <a
                    className="photo-instagram"
                    href="https://www.instagram.com/_barbercruz_/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Ver Instagram de Barber Cruz"
                  >
                    <Instagram size={22} />
                  </a>
                </div>
              </div>
            </section>
            <div className="values-strip">
              <span>
                <Scissors size={15} /> CORTES A TU ESTILO
              </span>
              <span className="strip-star">✳</span>
              <span>
                <CalendarDays size={15} /> RESERVAS SIN VUELTAS
              </span>
              <span className="strip-star">✳</span>
              <span>
                <Gift size={15} /> VUELVE Y GANA
              </span>
              <span className="strip-star">✳</span>
              <span>
                <Sparkles size={15} /> BUEN ROLLO SIEMPRE
              </span>
            </div>
            {next && (
              <section className="next-appointment">
                <CalendarDays size={22} />
                <span>
                  Tu próximo corte:{" "}
                  <strong>
                    {formatDate(next.date, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                    , {next.time} h
                  </strong>
                </span>
                <button
                  className="text-button"
                  onClick={() => navigate("appointments")}
                >
                  Ver mi cita <ArrowRight size={17} />
                </button>
              </section>
            )}
            <div className="home-cards">
              <QuickBooking onBook={book} />
              <StampCard
                compact
                onLogin={() => setAuthOpen(true)}
                onBook={() => book()}
              />
            </div>
            <section className="app-promo">
              <div className="app-promo-icon">
                <Scissors size={29} />
                <span>BC.</span>
              </div>
              <div>
                <p className="eyebrow">SIEMPRE A MANO</p>
                <h2>Tu barbero en el bolsillo.</h2>
                <p>
                  Sin buscar el enlace. Sin mandar otro “¿tienes hueco?”.
                  Añádenos a tu pantalla de inicio.
                </p>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setInstallOpen(true)}
              >
                {installed ? "App instalada" : "Instalar la app"}
                {installed ? (
                  <Check size={18} />
                ) : (
                  <ArrowDownToLine size={18} />
                )}
              </button>
            </section>
          </>
        ) : view === "appointments" ? (
          <Appointments
            onBook={() => book()}
            onLogin={() => setAuthOpen(true)}
            onToast={notify}
          />
        ) : view === "club" ? (
          <Club onLogin={() => setAuthOpen(true)} onBook={() => book()} />
        ) : profile?.role === "admin" ? (
          <div className="page-content">
            <div className="page-heading">
              <div>
                <p className="eyebrow">TODO BAJO CONTROL</p>
                <h1>
                  Al mando<span className="heading-dot">.</span>
                </h1>
                <p className="muted">
                  Tu agenda, tus horarios, tu manera de cortar.
                </p>
              </div>
              <span className="admin-badge">
                <ShieldCheck size={16} />{" "}
                {isDemo ? "Panel de demostración" : "Administrador"}
              </span>
            </div>
            <AdminPanel
              data={data}
              onUpdateAppointment={app.updateAppointment}
              onUpdateServices={app.updateServices}
              onUpdateSettings={app.updateSettings}
              onUpdateBlocks={app.updateBlocks}
              onReschedule={app.reschedule}
              onToast={notify}
            />
          </div>
        ) : null}
      </main>
      <footer className="site-footer">
        <div>
          <button className="footer-brand" onClick={() => navigate("home")}>
            BARBER CRUZ<span>.</span>
          </button>
          <span>Buen pelo. Mejor compañía.</span>
        </div>
        <div className="footer-links">
          <button onClick={() => setInfo("about")}>La casa</button>
          <button onClick={() => setInfo("privacy")}>Privacidad</button>
          <a
            href="https://www.instagram.com/_barbercruz_/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Instagram size={16} /> @_barbercruz_ <ArrowUpRightIcon />
          </a>
        </div>
        <span className="footer-love">
          Hecho para los de siempre <span>✳</span>
        </span>
      </footer>
      <nav className="mobile-bottom-nav" aria-label="Accesos rápidos">
        <button
          className={view === "home" ? "active" : ""}
          onClick={() => navigate("home")}
        >
          <Home size={20} />
          Inicio
        </button>
        <button
          className={view === "appointments" ? "active" : ""}
          onClick={() => navigate("appointments")}
        >
          <CalendarDays size={20} />
          Mis citas
        </button>
        <button className="mobile-book-action" onClick={() => book()}>
          <Scissors size={23} />
          <span>Reservar</span>
        </button>
        <button
          className={view === "club" ? "active" : ""}
          onClick={() => navigate("club")}
        >
          <Ticket size={20} />
          Club Cruz
        </button>
        <button
          onClick={() => (profile ? setProfileOpen(true) : setAuthOpen(true))}
        >
          <UserRound size={20} />
          {profile ? "Mi perfil" : "Entrar"}
        </button>
      </nav>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {booking && (
        <Booking
          initialDate={booking.date}
          initialTime={booking.time}
          onClose={() => setBooking(null)}
          onBooked={(a) => {
            setBooking(null);
            setSuccess(a);
          }}
        />
      )}
      {success && (
        <BookingSuccess
          appointment={success}
          onClose={() => setSuccess(null)}
          onAppointments={() => {
            setSuccess(null);
            navigate("appointments");
          }}
        />
      )}
      {profileOpen && profile && (
        <ProfileEditor onClose={() => setProfileOpen(false)} onToast={notify} />
      )}
      {installOpen && (
        <InstallModal
          installEvent={installEvent}
          onClose={() => setInstallOpen(false)}
          onInstalled={() => {
            setInstalled(true);
            setInstallEvent(null);
          }}
        />
      )}
      {info && (
        <Modal
          title={info === "about" ? "La casa" : "Privacidad"}
          onClose={() => setInfo(null)}
        >
          {info === "about" ? (
            <>
              <p className="eyebrow">BIENVENIDO A BARBER CRUZ</p>
              <h2>
                Tu barrio.
                <br /> Tu barbero.
              </h2>
              <p className="muted modal-intro">
                Una silla, unas tijeras y buen rollo. Barber Cruz nace para que
                reservar con tu barbero de confianza sea tan fácil como pasar a
                saludar.
              </p>
              <p className="muted">
                El corte cuesta 7 € y dura aproximadamente 45 minutos. Consulta
                los horarios disponibles en la agenda y sigue a Cruz para
                conocer sus últimos cortes.
              </p>
              <a
                className="btn btn-dark full"
                href="https://www.instagram.com/_barbercruz_/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Instagram size={19} /> Ver @_barbercruz_ <ArrowUpRightIcon />
              </a>
            </>
          ) : (
            <>
              <p className="eyebrow">TUS DATOS, CON CUIDADO</p>
              <h2>Privacidad.</h2>
              <div className="privacy-copy">
                <p>
                  {isDemo
                    ? "Esta versión es una demostración: los perfiles y citas de prueba se guardan solo en el almacenamiento de este navegador. No hay acceso real con Google ni reservas compartidas."
                    : "Usamos tu nombre, correo, avatar y datos de tus citas para identificarte, gestionar las reservas y llevar tu tarjeta de fidelidad. La autenticación y los datos se almacenan en el proyecto Supabase conectado."}
                </p>
                <p>
                  Tu barbero puede consultar tus citas y tu perfil para
                  atenderte. Otros clientes no pueden consultar tu perfil ni los
                  datos de tus reservas. Google gestiona el inicio de sesión en
                  la versión conectada.
                </p>
                <p>
                  La foto que elijas de la galería se guarda al confirmar tu
                  perfil. En la versión conectada, solo tú y el barbero podéis
                  verla; puedes sustituirla por otra foto o un avatar.
                </p>
                <p>
                  No incluyas datos sensibles en tu biografía ni en las notas de
                  las citas. Para solicitar la eliminación de tu cuenta y tus
                  datos, contacta con @_barbercruz_.
                </p>
                {isDemo && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      if (
                        window.confirm(
                          "¿Borrar todos los datos de prueba guardados en este navegador?",
                        )
                      ) {
                        localStorage.removeItem("barbercruz.demo.v1");
                        localStorage.removeItem("barbercruz.demo.session");
                        window.location.reload();
                      }
                    }}
                  >
                    Borrar datos de esta demo
                  </button>
                )}
              </div>
            </>
          )}
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          {toast}
          <button aria-label="Cerrar aviso" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
