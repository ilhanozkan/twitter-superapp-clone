import Head from "next/head";
import Link from "next/link";
import { useId } from "react";

import Avatar from "../../components/common/Avatar";
import { ButtonLink } from "../../components/common/Button";
import EmptyState from "../../components/common/EmptyState";
import PageHeader from "../../components/layout/PageHeader";
import AcceptingOrders from "../../components/shop/AcceptingOrders";
import BusinessSettings from "../../components/shop/BusinessSettings";
import BusinessSwitcher from "../../components/shop/BusinessSwitcher";
import MenuSection from "../../components/shop/MenuSection";
import {
  BusinessTab,
  businessPath,
  menuPath,
} from "../../components/shop/paths";
import ProductAvailability from "../../components/shop/ProductAvailability";
import Notice from "../../components/superapp/Notice";
import { withPageState } from "../../lib/server/pageState";
import { useAppSelector } from "../../store";
import { IBusiness } from "../../types/Business";
import { PageShell } from "../../types/PageShell";
import { IMenuSection } from "../../types/Shop";

type ManagedBusiness = Pick<IBusiness, "username" | "fullname" | "image">;

interface BusinessPageProps {
  business: IBusiness;
  menu: IMenuSection[];
  /** Every business the viewer runs, their own account first. */
  businesses: ManagedBusiness[];
  tab: BusinessTab;
}

const TABS: { id: BusinessTab; label: string }[] = [
  { id: "menu", label: "Menu" },
  { id: "settings", label: "Settings" },
];

/**
 * Business tools, for the people who run a business (404 for everyone
 * else): "Accepting orders", each product's availability (Menu) and the
 * profile (Settings, edited in Studio).
 */
export default function Business({
  business,
  menu,
  businesses,
  tab,
}: BusinessPageProps) {
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const reasonId = useId();
  const first = businesses[0]?.username;

  return (
    <>
      <Head>
        <title>{`Business · ${business.fullname} / Twitter SuperApp`}</title>
      </Head>
      <PageHeader
        title="Business"
        subtitle={`${business.fullname} · @${business.username}`}
      />
      {readOnly && (
        <div id={reasonId}>
          <Notice tone="info">
            Changes are turned off on this read-only demo.
          </Notice>
        </div>
      )}
      <BusinessSwitcher
        businesses={businesses}
        current={business.username}
        tab={tab}
      />

      <div className="flex flex-col gap-4 border-b border-line px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar user={business} size={48} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-extrabold leading-6">
              {business.fullname}
            </h2>
            <Link
              href={`/${business.username}`}
              className="text-[15px] text-muted hover:underline"
            >
              @{business.username}
            </Link>
          </div>
          <ButtonLink
            variant="outline"
            size="sm"
            href={menuPath(business.username)}
            className="shrink-0"
          >
            View menu
          </ButtonLink>
        </div>
        {/* Keyed by what the server said, so new page data resets it. */}
        <AcceptingOrders
          key={`${business.username}-${business.acceptingOrders}`}
          business={business}
          disabled={readOnly}
          reasonId={reasonId}
        />
      </div>

      <nav aria-label="Business tools" className="flex border-b border-line">
        {TABS.map((item) => {
          const active = item.id === tab;
          return (
            <Link
              key={item.id}
              href={businessPath({
                business: business.username,
                tab: item.id,
                defaultBusiness: first,
              })}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 justify-center transition-colors hover:bg-fg/10"
            >
              <span
                className={`py-4 text-[15px] ${
                  active
                    ? "border-b-4 border-primary pb-3 font-bold"
                    : "font-medium text-muted"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {tab === "settings" ? (
        <BusinessSettings business={business} />
      ) : menu.length === 0 ? (
        <EmptyState title="This business hasn’t added a menu yet.">
          Products are added in Studio, under Food → Products.
        </EmptyState>
      ) : (
        <div className="pb-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-4">
          {menu.map((section) => (
            <MenuSection
              key={section.title}
              section={section}
              renderProduct={(product) => (
                <ProductAvailability
                  key={`${product.id}-${product.available}`}
                  product={product}
                  disabled={readOnly}
                  reasonId={reasonId}
                />
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}

Business.shell = {
  layout: "wide",
  hideComposeButton: true,
} satisfies PageShell;

export const getServerSideProps = withPageState<BusinessPageProps>(
  async ({ ctx, repo, viewer }) => {
    const managed = await repo.business.listManagedBusinesses(viewer.username);
    const requested = ctx.query.business;
    const username =
      typeof requested === "string"
        ? managed.find((item) => item.toLowerCase() === requested.toLowerCase())
        : managed[0];
    // Not yours (or nothing to run): as if the page weren't there.
    if (!username) return { notFound: true };

    const [all, menu] = await Promise.all([
      repo.business.listBusinesses(),
      repo.shop.getMenu(username),
    ]);
    const byKey = new Map(
      all.map((item) => [item.username.toLowerCase(), item])
    );
    const business = byKey.get(username.toLowerCase());
    if (!business) return { notFound: true };

    const businesses = managed.flatMap((item): ManagedBusiness[] => {
      const found = byKey.get(item.toLowerCase());
      return found
        ? [
            {
              username: found.username,
              fullname: found.fullname,
              image: found.image,
            },
          ]
        : [];
    });
    const tab: BusinessTab = ctx.query.tab === "settings" ? "settings" : "menu";

    return { props: { business, menu, businesses, tab } };
  },
  { feature: "shop" }
);
