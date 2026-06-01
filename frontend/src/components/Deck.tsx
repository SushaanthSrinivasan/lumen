import type { Slide } from "../types";

interface DeckProps {
  slides: Slide[];
  activeIndex: number;
}

export function Deck({ slides, activeIndex }: DeckProps) {
  const slide = slides[activeIndex];
  if (!slide) return null;

  return (
    <div className="deck">
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

      <div className="deck-dots" role="tablist" aria-label="Slide progress">
        {slides.map((s, i) => (
          <span
            key={s.id}
            className={"dot" + (i === activeIndex ? " dot-active" : "")}
            title={s.title}
          />
        ))}
      </div>
    </div>
  );
}
