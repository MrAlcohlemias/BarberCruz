import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { useApp } from "../lib/AppContext";
import "./delete-account.css";

export default function DeleteAccountSection({
  onDeleted,
  onBusyChange,
  disabled = false,
}: {
  onDeleted: () => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const { profile, isDemo, deleteMyAccount } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirmationInput = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  const headingId = useId();

  useEffect(() => {
    if (confirming) confirmationInput.current?.focus();
  }, [confirming]);

  if (!profile || profile.role === "admin") return null;

  function cancel() {
    if (busy) return;
    setConfirming(false);
    setConfirmation("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== "ELIMINAR" || busy || disabled) return;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    let deleted = false;
    try {
      await deleteMyAccount();
      deleted = true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar tu cuenta. Inténtalo de nuevo.",
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
    if (deleted) onDeleted();
  }

  return (
    <section className="delete-account-section" aria-labelledby={headingId}>
      <h3 id={headingId}>Eliminar mi cuenta</h3>
      <p id={descriptionId}>
        Se eliminarán tu perfil, las fotos que has subido, todas tus reservas e
        historial de citas y los puntos de Club Cruz. Esta acción es permanente.
        Tu cuenta de Google no se eliminará.
      </p>
      {isDemo && (
        <p className="delete-account-demo">
          Estás en la demo: se borrarán tus datos de Barber Cruz guardados en
          este navegador.
        </p>
      )}
      {!confirming ? (
        <button
          type="button"
          className="btn delete-account-start"
          disabled={disabled}
          onClick={() => {
            setConfirmation("");
            setError("");
            setConfirming(true);
          }}
        >
          <Trash2 size={17} /> Eliminar mi cuenta
        </button>
      ) : (
        <form
          className="delete-account-confirmation"
          onSubmit={(event) => void submit(event)}
          aria-label="Confirmar eliminación de mi cuenta"
          aria-busy={busy}
        >
          <label className="field">
            Escribe ELIMINAR para confirmar
            <input
              ref={confirmationInput}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              aria-describedby={descriptionId}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy || disabled}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="delete-account-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || disabled}
              onClick={cancel}
            >
              Conservar mi cuenta
            </button>
            <button
              type="submit"
              className="btn delete-account-final"
              disabled={confirmation !== "ELIMINAR" || busy || disabled}
            >
              {busy ? "Eliminando cuenta…" : "Eliminar definitivamente"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
