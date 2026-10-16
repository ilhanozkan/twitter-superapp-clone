import { HiOutlinePencilSquare } from "react-icons/hi2";

import { formatCredits } from "../../lib/superapp/money";
import { PLACES } from "../../lib/superapp/places";
import { CATEGORY_LABELS } from "../../lib/superapp/shop";
import { IBusiness } from "../../types/Business";
import { etaText } from "./format";

const hoursText = ({ opens, closes, timeZone }: IBusiness["hours"]) =>
  opens === closes
    ? `Open 24 hours (${timeZone})`
    : `${opens}–${closes} (${timeZone})`;

/**
 * The Business page's Settings tab: the profile as customers see it, read
 * only. Profiles are edited in Studio; the app's only setting is the
 * "Accepting orders" switch above.
 */
export default function BusinessSettings({
  business,
}: {
  business: IBusiness;
}) {
  const place = PLACES.find((item) => item.id === business.placeId);
  const rows: [string, string][] = [
    ["Category", CATEGORY_LABELS[business.category]],
    ["About", business.description ?? "—"],
    [
      "Address",
      place ? `${business.address} (${place.name})` : business.address,
    ],
    ["Hours", hoursText(business.hours)],
    [
      "Delivery estimate",
      `${etaText(business.etaMinutes)} (${business.prepMinutes} min to prepare, ${business.deliveryMinutes} min to deliver)`,
    ],
    ["Delivery fee", formatCredits(business.deliveryFee)],
    [
      "Minimum order",
      business.minimumOrder > 0 ? formatCredits(business.minimumOrder) : "None",
    ],
    ["Automatic greeting", business.greeting ?? "None"],
    [
      "Managers",
      [business.username, ...business.managers]
        .map((username) => `@${username}`)
        .join(", "),
    ],
  ];

  return (
    <section aria-labelledby="business-settings" className="px-4 py-4">
      <h2 id="business-settings" className="text-xl font-extrabold">
        Profile
      </h2>
      <dl className="mt-3 divide-y divide-line text-[15px] leading-5">
        {rows.map(([term, value]) => (
          <div key={term} className="flex flex-col gap-1 py-3 sm:flex-row">
            <dt className="shrink-0 text-muted sm:w-44">{term}</dt>
            <dd className="min-w-0 [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 flex gap-2 rounded-2xl bg-subtle p-4 text-[15px]">
        <HiOutlinePencilSquare
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-xl text-primary"
        />
        <span>
          Edit in Studio: these details, the menu and its pictures are edited in
          Sanity Studio, under Food → Businesses and Food → Products. Changes
          show here as soon as they are published.
        </span>
      </p>
    </section>
  );
}
