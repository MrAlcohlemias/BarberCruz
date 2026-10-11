import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Pencil, Save, Search, Trash2, Users } from "lucide-react";
import type { AppData, Profile } from "../lib/types";
import { avatarSource } from "../lib/avatar";
import { loyalty } from "../lib/domain";
import Modal from "./Modal";

const avatars = ["😎", "🔥", "⚡", "💈", "👑", "✂️"];
const styles = [
  "Degradado",
  "Clásico",
  "Taper fade",
  "Buzz cut",
  "Mullet",
  "Otro estilo",
];

function ClientAvatar({ profile }: { profile: Profile }) {
  const source = avatarSource(profile);
  const [failedSource, setFailedSource] = useState<string>();
  const initials = profile.name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="admin-client-avatar" aria-hidden="true">
      {source && source !== failedSource ? (
        <img
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSource(source)}
        />
      ) : (
        (avatars.includes(profile.avatar) && profile.avatar) || initials
      )}
    </div>
  );
}

export default function ClientsPanel({
  data,
  onUpdateCustomer,
  onDeleteCustomer,
  onToast,
}: {
  data: AppData;
  onUpdateCustomer: (next: Profile) => Promise<void>;
  onDeleteCustomer: (id: string) => Promise<void>;
  onToast: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{
    action: "edit" | "delete";
    profile: Profile;
  } | null>(null);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const customers = data.profiles
    .filter((profile) => profile.role === "customer")
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const normalQuery = query.trim().toLocaleLowerCase("es");
  const results = customers.filter((profile) =>
    `${profile.name} ${profile.email}`
      .toLocaleLowerCase("es")
      .includes(normalQuery),
  );

  function open(profile: Profile, action: "edit" | "delete") {
    setSelected({ action, profile });
    setDraft({ ...profile });
    setConfirmation("");
    setError("");
  }

  function close() {
    if (busyRef.current) return;
    setSelected(null);
    setDraft(null);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !draft || busyRef.current) return;
    if (selected.action === "delete" && confirmation !== "ELIMINAR") return;
    if (selected.action === "edit" && !draft.name.trim()) {
      setError("Escribe el nombre del cliente.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (selected.action === "edit") {
        await onUpdateCustomer({
          ...draft,
          name: draft.name.trim(),
          bio: draft.bio.trim(),
          preferredStyle: draft.preferredStyle.trim(),
        });
        onToast("Perfil del cliente actualizado.");
      } else {
        await onDeleteCustomer(selected.profile.id);
        onToast("Cuenta del cliente eliminada.");
      }
      setSelected(null);
      setDraft(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se ha podido guardar el cambio.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div className="admin-toolbar">
        <div>
          <h2>Tus clientes</h2>
          <p>
            Consulta sus citas, actualiza sus perfiles y gestiona sus cuentas.
          </p>
        </div>
        <span className="admin-client-total">
          {customers.length} {customers.length === 1 ? "cliente" : "clientes"}
        </span>
      </div>
      <label className="admin-client-search">
        <Search size={17} aria-hidden="true" />
        <span className="admin-sr-only">
          Buscar clientes por nombre o correo
        </span>
        <input
          type="search"
          placeholder="Buscar por nombre o correo"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="admin-agenda-card admin-clients-list">
        {results.length ? (
          results.map((profile) => {
            const appointments = data.appointments.filter(
              (appointment) => appointment.userId === profile.id,
            );
            const completed = appointments.filter(
              (appointment) => appointment.status === "completed",
            ).length;
            const reward = loyalty(
              profile.id,
              data.appointments,
              data.settings.requiredCuts,
            );
            return (
              <article className="admin-client" key={profile.id}>
                <ClientAvatar profile={profile} />
                <div className="admin-client-details">
                  <h3>{profile.name}</h3>
                  <p>{profile.email}</p>
                  {profile.preferredStyle && (
                    <p className="admin-client-style">
                      {profile.preferredStyle}
                    </p>
                  )}
                  <div className="admin-client-stats">
                    <span>
                      {appointments.length}{" "}
                      {appointments.length === 1 ? "cita" : "citas"}
                    </span>
                    <span>{completed} completadas</span>
                    <span>
                      {reward.stamps}/{data.settings.requiredCuts} sellos
                    </span>
                    {reward.rewardsAvailable > 0 && (
                      <span className="admin-client-reward">
                        {reward.rewardsAvailable}{" "}
                        {reward.rewardsAvailable === 1
                          ? "premio disponible"
                          : "premios disponibles"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="admin-client-actions">
                  <button
                    type="button"
                    className="admin-btn admin-btn-outline"
                    aria-label={`Editar perfil de ${profile.name}`}
                    onClick={() => open(profile, "edit")}
                  >
                    <Pencil size={14} /> Editar perfil
                  </button>
                  <button
                    type="button"
                    className="admin-icon-btn admin-cancel"
                    aria-label={`Eliminar cuenta de ${profile.name}`}
                    onClick={() => open(profile, "delete")}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="admin-empty">
            <Users size={30} />
            <h3>
              {query ? "No encontramos ese cliente" : "Tu lista empieza aquí"}
            </h3>
            <p>
              {query
                ? "Prueba con otro nombre o correo."
                : "Los clientes aparecerán cuando creen su cuenta en la web."}
            </p>
          </div>
        )}
      </div>
      {selected && draft && (
        <Modal
          title={
            selected.action === "edit" ? "Editar cliente" : "Eliminar cliente"
          }
          onClose={close}
        >
          <p className="eyebrow">GESTIÓN DE CLIENTES</p>
          <h2>
            {selected.action === "edit" ? "Editar perfil" : "Eliminar cuenta"}
          </h2>
          <form
            className="admin-client-form"
            onSubmit={(event) => void submit(event)}
          >
            {selected.action === "edit" ? (
              <>
                <div className="admin-client-edit-avatar">
                  <ClientAvatar profile={draft} />
                  <div>
                    <span>Avatar del cliente</span>
                    <div className="avatar-options">
                      {avatars.map((avatar) => (
                        <button
                          key={avatar}
                          type="button"
                          aria-label={`Avatar ${avatar}`}
                          aria-pressed={draft.avatar === avatar}
                          className={draft.avatar === avatar ? "selected" : ""}
                          disabled={busy}
                          onClick={() =>
                            setDraft({ ...draft, avatar, avatarUrl: undefined })
                          }
                        >
                          {avatar}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <label className="field">
                  Nombre del cliente
                  <input
                    required
                    maxLength={60}
                    disabled={busy}
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Estilo favorito
                  <select
                    value={draft.preferredStyle}
                    disabled={busy}
                    onChange={(event) =>
                      setDraft({ ...draft, preferredStyle: event.target.value })
                    }
                  >
                    <option value="">Lo decidimos en la silla</option>
                    {draft.preferredStyle &&
                      !styles.includes(draft.preferredStyle) && (
                        <option>{draft.preferredStyle}</option>
                      )}
                    {styles.map((style) => (
                      <option key={style}>{style}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Sobre el cliente
                  <textarea
                    rows={3}
                    maxLength={250}
                    disabled={busy}
                    value={draft.bio}
                    onChange={(event) =>
                      setDraft({ ...draft, bio: event.target.value })
                    }
                  />
                </label>
                <p className="admin-client-email">
                  {draft.email}
                  <small>Correo vinculado al acceso con Google.</small>
                </p>
              </>
            ) : (
              <>
                <p className="admin-client-delete-warning">
                  Vas a eliminar la cuenta de{" "}
                  <strong>{selected.profile.name}</strong> (
                  {selected.profile.email}). Se borrarán su perfil, la foto
                  guardada en Barber Cruz, todas sus citas y sus puntos. Esta
                  acción no se puede deshacer. Su cuenta de Google seguirá
                  existiendo.
                </p>
                <label className="field">
                  Escribe ELIMINAR para confirmar
                  <input
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
              </>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="admin-client-form-actions">
              <button
                type="button"
                className="admin-btn admin-btn-outline"
                disabled={busy}
                onClick={close}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={`admin-btn ${selected.action === "edit" ? "admin-btn-lime" : "admin-btn-danger"}`}
                disabled={
                  busy ||
                  (selected.action === "delete" && confirmation !== "ELIMINAR")
                }
              >
                {selected.action === "edit" ? (
                  <Save size={15} />
                ) : (
                  <Trash2 size={15} />
                )}
                {busy
                  ? selected.action === "edit"
                    ? "Guardando…"
                    : "Eliminando…"
                  : selected.action === "edit"
                    ? "Guardar perfil"
                    : "Eliminar cuenta definitivamente"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
