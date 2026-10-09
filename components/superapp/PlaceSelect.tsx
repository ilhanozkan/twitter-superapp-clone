import { useId } from "react";

import { PLACES } from "../../lib/superapp/places";
import { PlaceId } from "../../types/Superapp";

interface PlaceSelectProps {
  label: string;
  value: PlaceId;
  onChange: (place: PlaceId) => void;
  /** Places not offered, e.g. the pickup when choosing a destination. */
  exclude?: PlaceId[];
}

/** One of the fixed Ankara places, as a native select. */
export default function PlaceSelect({
  label,
  value,
  onChange,
  exclude = [],
}: PlaceSelectProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[15px] font-bold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as PlaceId)}
        className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[15px] focus:border-primary focus:outline-none"
      >
        {PLACES.filter(
          (place) => place.id === value || !exclude.includes(place.id)
        ).map((place) => (
          <option key={place.id} value={place.id}>
            {place.name} · {place.area}
          </option>
        ))}
      </select>
    </div>
  );
}
