import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Scissors } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { GalleryPhoto } from "../lib/types";
import "./gallery.css";

export default function GalleryCarousel({
  photos,
}: {
  photos: GalleryPhoto[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({
    index: 0,
    previous: false,
    next: false,
  });
  const photoIds = photos.map((photo) => photo.id).join(",");
  const canScroll = position.previous || position.next;

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const update = () => {
      const items = Array.from(track.children) as HTMLElement[];
      const first = items[0];
      if (!first) return;
      let index = 0;
      let distance = Infinity;
      items.forEach((item, current) => {
        const delta = Math.abs(
          item.offsetLeft - first.offsetLeft - track.scrollLeft,
        );
        if (delta < distance) {
          distance = delta;
          index = current;
        }
      });
      setPosition({
        index,
        previous: track.scrollLeft > 2,
        next: track.scrollLeft + track.clientWidth < track.scrollWidth - 2,
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    track.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(track);
    return () => {
      track.removeEventListener("scroll", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [photoIds]);

  function move(direction: -1 | 1, edge?: "start" | "end") {
    const track = trackRef.current;
    if (!track) return;
    const first = track.children[0] as HTMLElement | undefined;
    const second = track.children[1] as HTMLElement | undefined;
    const step =
      first && second
        ? second.offsetLeft - first.offsetLeft
        : track.clientWidth;
    const left =
      edge === "start"
        ? 0
        : edge === "end"
          ? track.scrollWidth
          : track.scrollLeft + step * direction;
    track.scrollTo({
      left,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      move(1, event.key === "Home" ? "start" : "end");
    }
  }

  if (!photos.length) return null;

  return (
    <section
      className="gallery-carousel"
      aria-label="Galería de cortes"
      aria-roledescription="carrusel"
    >
      <div className="gallery-heading">
        <div>
          <p className="eyebrow">
            <Scissors size={14} aria-hidden="true" /> BARBER CRUZ
          </p>
          <h2>Nuestros cortes</h2>
          <p>Cortes reales. Estilo propio.</p>
        </div>
        {photos.length > 1 && canScroll && (
          <div className="gallery-controls">
            <button
              type="button"
              aria-label="Ver foto anterior"
              onClick={() => move(-1)}
              disabled={!position.previous}
            >
              <ArrowLeft size={19} />
            </button>
            <button
              type="button"
              aria-label="Ver foto siguiente"
              onClick={() => move(1)}
              disabled={!position.next}
            >
              <ArrowRight size={19} />
            </button>
          </div>
        )}
      </div>
      <div
        className="gallery-track"
        ref={trackRef}
        tabIndex={photos.length > 1 && canScroll ? 0 : undefined}
        aria-label="Fotos de cortes. Desliza o utiliza las flechas del teclado para ver más."
        onKeyDown={onKeyDown}
      >
        {photos.map((photo, index) => (
          <figure
            className="gallery-slide"
            key={photo.id}
            role="group"
            aria-roledescription="foto"
            aria-label={`${index + 1} de ${photos.length}`}
          >
            <div className="gallery-slide-image">
              <img
                src={photo.url}
                alt={photo.caption || "Corte realizado en Barber Cruz"}
                loading="lazy"
                decoding="async"
              />
            </div>
            {photo.caption && <figcaption>{photo.caption}</figcaption>}
          </figure>
        ))}
      </div>
      {photos.length > 1 && canScroll && (
        <div className="gallery-footnote">
          <span>Desliza para ver más cortes</span>
          <span aria-live="polite" aria-atomic="true">
            Foto {position.index + 1} de {photos.length}
          </span>
        </div>
      )}
    </section>
  );
}
