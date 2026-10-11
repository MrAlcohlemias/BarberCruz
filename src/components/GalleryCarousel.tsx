import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { GalleryPhoto } from "../lib/types";
import "./gallery.css";

const PIXELS_PER_SECOND = 20;
const INTERACTION_DELAY = 1600;

function trackMeasurements(track: HTMLDivElement, count: number) {
  const first = track.children[0] as HTMLElement | undefined;
  const second = track.children[1] as HTMLElement | undefined;
  const original = track.querySelector<HTMLElement>("[data-gallery-original]");
  if (!first || !second || !original) return null;
  const step = second.offsetLeft - first.offsetLeft;
  if (step <= 0) return null;
  return {
    step,
    start: original.offsetLeft - first.offsetLeft,
    width: step * count,
  };
}

export default function GalleryCarousel({
  photos,
}: {
  photos: GalleryPhoto[];
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const measurementsRef = useRef<ReturnType<typeof trackMeasurements>>(null);
  const indexRef = useRef(0);
  const interactionUntilRef = useRef(0);
  const pointerDownRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [bufferCycles, setBufferCycles] = useState(1);
  const [paused, setPaused] = useState(false);
  const [motionRequested, setMotionRequested] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(
    document.visibilityState === "visible",
  );
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const photoIds = photos.map((photo) => photo.id).join(",");
  const hasMultiple = photos.length > 1;
  const hasPhotos = photos.length > 0;
  const copies = hasPhotos ? bufferCycles : 0;
  const motionStopped = paused || (reducedMotion && !motionRequested);
  const automaticallyPlaying = hasPhotos && !motionStopped && !focused;

  function interact() {
    interactionUntilRef.current = Date.now() + INTERACTION_DELAY;
  }

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    let settled: ReturnType<typeof setTimeout> | undefined;

    const update = () => {
      const measurements = trackMeasurements(track, photos.length);
      if (!measurements) {
        indexRef.current = 0;
        setIndex(0);
        return;
      }
      const offset =
        (((track.scrollLeft - measurements.start) % measurements.width) +
          measurements.width) %
        measurements.width;
      const next = Math.round(offset / measurements.step) % photos.length;
      indexRef.current = next;
      setIndex(next);
    };

    const normalize = () => {
      if (pointerDownRef.current) return;
      const measurements = trackMeasurements(track, photos.length);
      if (!measurements) return;
      const offset = track.scrollLeft - measurements.start;
      if (offset < -1 || offset >= measurements.width - 1) {
        const wrapped =
          ((offset % measurements.width) + measurements.width) %
          measurements.width;
        // Identical neighbouring copies make this reset invisible, instead of
        // animating backwards through the entire collection after its end.
        track.scrollTo({
          left: measurements.start + wrapped,
          behavior: "instant",
        });
      }
      update();
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
      clearTimeout(settled);
      settled = setTimeout(normalize, 160);
    };

    const resize = () => {
      const measurements = trackMeasurements(track, photos.length);
      measurementsRef.current = measurements;
      if (!measurements) return;
      const needed = Math.max(
        1,
        Math.ceil(track.clientWidth / measurements.width) + 1,
      );
      if (needed !== bufferCycles) {
        setBufferCycles(needed);
        return;
      }
      const current = Math.min(indexRef.current, photos.length - 1);
      track.scrollTo({
        left: measurements.start + current * measurements.step,
        behavior: "instant",
      });
      update();
    };

    resize();
    track.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(resize);
    observer.observe(track);
    return () => {
      track.removeEventListener("scroll", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(settled);
    };
  }, [photoIds, photos.length, bufferCycles]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.25 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [photoIds]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionChange = () => {
      setReducedMotion(preference.matches);
      setMotionRequested(false);
    };
    const visibilityChange = () =>
      setDocumentVisible(document.visibilityState === "visible");
    const releasePointer = () => {
      pointerDownRef.current = false;
    };
    preference.addEventListener("change", motionChange);
    document.addEventListener("visibilitychange", visibilityChange);
    window.addEventListener("pointerup", releasePointer);
    window.addEventListener("pointercancel", releasePointer);
    return () => {
      preference.removeEventListener("change", motionChange);
      document.removeEventListener("visibilitychange", visibilityChange);
      window.removeEventListener("pointerup", releasePointer);
      window.removeEventListener("pointercancel", releasePointer);
    };
  }, []);

  const move = useCallback(
    (direction: -1 | 1, edge?: "start" | "end") => {
      const track = trackRef.current;
      if (!track || !hasMultiple) return;
      interactionUntilRef.current = Date.now() + INTERACTION_DELAY;
      const measurements = trackMeasurements(track, photos.length);
      if (!measurements) return;
      const left =
        edge === "start"
          ? measurements.start
          : edge === "end"
            ? measurements.start + (photos.length - 1) * measurements.step
            : track.scrollLeft + measurements.step * direction;
      track.scrollTo({
        left,
        behavior: reducedMotion ? "instant" : "smooth",
      });
    },
    [hasMultiple, photos.length, reducedMotion],
  );

  useEffect(() => {
    if (!automaticallyPlaying || !visible || !documentVisible) return;
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    let previousTime = 0;
    let position = track.scrollLeft;
    let appliedPosition = track.scrollLeft;
    const animate = (timestamp: number) => {
      const elapsed = previousTime ? Math.min(timestamp - previousTime, 64) : 0;
      previousTime = timestamp;
      const measurements = measurementsRef.current;
      if (
        !measurements ||
        pointerDownRef.current ||
        Date.now() < interactionUntilRef.current
      ) {
        position = track.scrollLeft;
      } else {
        // Keep fractional pixels locally. Reading the browser's rounded
        // scrollLeft on every frame would discard these slow movements.
        if (Math.abs(track.scrollLeft - appliedPosition) > 2)
          position = track.scrollLeft;
        position += (elapsed * PIXELS_PER_SECOND) / 1000;
        const offset =
          (((position - measurements.start) % measurements.width) +
            measurements.width) %
          measurements.width;
        position = measurements.start + offset;
        track.scrollLeft = position;
      }
      appliedPosition = track.scrollLeft;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [automaticallyPlaying, visible, documentVisible, photoIds, bufferCycles]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setFocused(true);
      move(event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setFocused(true);
      move(1, event.key === "Home" ? "start" : "end");
    }
  }

  if (!photos.length) return null;

  return (
    <section
      ref={sectionRef}
      className="gallery-carousel"
      aria-label="Galería de cortes"
      aria-roledescription="carrusel"
      onPointerDownCapture={() => {
        pointerDownRef.current = true;
        interact();
      }}
      onWheelCapture={interact}
      onFocusCapture={(event) =>
        setFocused(event.target.matches(":focus-visible"))
      }
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <div className="gallery-heading">
        <h2>Nuestros cortes</h2>
        {hasPhotos && (
          <div className="gallery-controls">
            {hasMultiple && (
              <button
                type="button"
                aria-label="Ver foto anterior"
                onClick={() => move(-1)}
              >
                <ArrowLeft size={17} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              aria-label={
                motionStopped ? "Reanudar carrusel" : "Pausar carrusel"
              }
              onClick={() => {
                if (motionStopped) {
                  interactionUntilRef.current = 0;
                  setFocused(false);
                  setMotionRequested(true);
                  setPaused(false);
                } else setPaused(true);
              }}
            >
              {motionStopped ? (
                <Play size={15} aria-hidden="true" />
              ) : (
                <Pause size={15} aria-hidden="true" />
              )}
            </button>
            {hasMultiple && (
              <button
                type="button"
                aria-label="Ver foto siguiente"
                onClick={() => move(1)}
              >
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
      <div
        className="gallery-track"
        ref={trackRef}
        tabIndex={hasMultiple ? 0 : undefined}
        aria-label="Fotos de cortes. Desliza o utiliza las flechas del teclado para ver más."
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: copies * 2 + 1 }, (_, cycle) =>
          photos.map((photo, photoIndex) => {
            const original = cycle === copies;
            return (
              <figure
                className="gallery-slide"
                key={`${cycle}-${photo.id}`}
                data-gallery-original={original ? "" : undefined}
                aria-hidden={original ? undefined : true}
                role={original ? "group" : "presentation"}
                aria-roledescription={original ? "foto" : undefined}
                aria-label={
                  original ? `${photoIndex + 1} de ${photos.length}` : undefined
                }
              >
                <div className="gallery-slide-image">
                  <img
                    src={photo.url}
                    alt={
                      original
                        ? photo.caption || "Corte realizado en Barber Cruz"
                        : ""
                    }
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                {photo.caption && <figcaption>{photo.caption}</figcaption>}
              </figure>
            );
          }),
        )}
      </div>
      {hasMultiple && (
        <div className="gallery-footnote">
          <span>Desliza para ver más</span>
          <span
            aria-live={automaticallyPlaying ? "off" : "polite"}
            aria-atomic="true"
          >
            Foto {index + 1} de {photos.length}
          </span>
        </div>
      )}
    </section>
  );
}
