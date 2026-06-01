import { useEffect } from "react";
import type { Slide } from "../types";

interface DeckProps {
  slides: Slide[];
  activeIndex: number;
  /** Manual browse. Voice (goto_slide) remains the primary navigator; this is a
   *  courtesy so the deck can be read without starting a call. */
  onNavigate: (index: number) => void;
}

export function Deck({ slides, activeIndex, onNavigate }: DeckProps) {
  const atStart = activeIndex === 0;
  const atEnd = activeIndex === slides.length - 1;

  // Left/right arrows browse the deck. No text inputs exist in this app, so a
  // global listener is safe.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't hijack modifier chords (e.g. Alt+Left = browser back) or IME composition.
      if (e.altKey || e.metaKey || e.ctrlKey || e.isComposing) return;
      if (e.key === "ArrowRight" && !atEnd) onNavigate(activeIndex + 1);
      else if (e.key === "ArrowLeft" && !atStart) onNavigate(activeIndex - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, atStart, atEnd, onNavigate]);

  const slide = slides[activeIndex];
  if (!slide) return null;

  return (
    <div className="deck">
      <div className="deck-stage">
        <button
          type="button"
          className="deck-arrow"
          aria-label="Previous slide"
          disabled={atStart}
          onClick={() => onNavigate(activeIndex - 1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="slide" key={slide.id}>
          <div className="slide-eyebrow">
            Slide {slide.id} of {slides.length}
          </div>
          <h1 className="slide-title">{slide.title}</h1>
          <ul className="slide-bullets">
            {slide.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          className="deck-arrow"
          aria-label="Next slide"
          disabled={atEnd}
          onClick={() => onNavigate(activeIndex + 1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="deck-dots" role="group" aria-label="Go to slide">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-current={i === activeIndex ? "true" : undefined}
            aria-label={`Slide ${s.id}: ${s.title}`}
            title={s.title}
            className={"dot" + (i === activeIndex ? " dot-active" : "")}
            onClick={() => onNavigate(i)}
          />
        ))}
      </div>
    </div>
  );
}
