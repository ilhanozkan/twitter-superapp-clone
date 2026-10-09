import { useState } from "react";

import { pluralize } from "../../lib/format";
import { CATEGORY_LABELS } from "../../lib/superapp/shop";
import { BusinessCategory } from "../../types/Business";
import { IBusinessSummary } from "../../types/Shop";
import EmptyState from "../common/EmptyState";
import BusinessCard from "./BusinessCard";
import CategoryChips from "./CategoryChips";

/** The Food hub's places, filtered by category on the client. */
export default function FoodHub({ items }: { items: IBusinessSummary[] }) {
  const [category, setCategory] = useState<BusinessCategory | null>(null);
  // Filtering doesn't move focus: say what changed.
  const [announcement, setAnnouncement] = useState("");
  const inCategory = (value: BusinessCategory | null) =>
    value ? items.filter((business) => business.category === value) : items;
  const shown = inCategory(category);

  const filter = (value: BusinessCategory | null) => {
    setCategory(value);
    const places = pluralize(inCategory(value).length, "place");
    setAnnouncement(value ? `${places} in ${CATEGORY_LABELS[value]}` : places);
  };

  if (items.length === 0) {
    return <EmptyState title="No places are taking orders right now." />;
  }

  return (
    <>
      <CategoryChips value={category} onChange={filter} />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {shown.length === 0 ? (
        <p className="px-4 py-8 text-[15px] text-muted">
          No places in this category right now.
        </p>
      ) : (
        <ul aria-label="Places" className="flex flex-col gap-3 px-4 pb-4">
          {shown.map((business) => (
            <li key={business.username}>
              <BusinessCard business={business} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
