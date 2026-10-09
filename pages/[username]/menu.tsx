import Head from "next/head";
import { useRouter } from "next/router";
import { useId, useRef } from "react";

import EmptyState from "../../components/common/EmptyState";
import PageHeader from "../../components/layout/PageHeader";
import ProfileHeader from "../../components/profile/ProfileHeader";
import CartBar from "../../components/shop/CartBar";
import { READ_ONLY_ORDERING } from "../../components/shop/format";
import MenuSection from "../../components/shop/MenuSection";
import { menuPath } from "../../components/shop/paths";
import ProductCard from "../../components/shop/ProductCard";
import ProductDialog from "../../components/shop/ProductDialog";
import Notice from "../../components/superapp/Notice";
import { pluralize } from "../../lib/format";
import { withPageState } from "../../lib/server/pageState";
import { findProfile } from "../../lib/server/profile";
import { profileState, selectTweetCount } from "../../slices/profilesSlice";
import { useAppSelector } from "../../store";
import { IBusiness } from "../../types/Business";
import { PageShell } from "../../types/PageShell";
import { IMenuSection } from "../../types/Shop";
import { IUserProfile } from "../../types/User";

interface MenuPageProps {
  user: IUserProfile;
  business: IBusiness;
  menu: IMenuSection[];
}

/**
 * A business's Menu tab: its sections, each product with Add (once orders
 * are on) and its details in a dialog addressable as `?product=<id>`.
 */
export default function BusinessMenu({ user, business, menu }: MenuPageProps) {
  const router = useRouter();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const ordersOn = useAppSelector((state) => state.session.features.orders);
  const tweetCount = useAppSelector((state) => selectTweetCount(state, user));
  const reasonId = useId();
  // Whether this page pushed the open dialog's URL: closing goes Back then.
  const openedHere = useRef(false);

  const productId =
    typeof router.query.product === "string" ? router.query.product : null;
  const selected =
    menu
      .flatMap((section) => section.products)
      .find((product) => product.id === productId) ?? null;
  const cartBusiness = {
    username: business.username,
    fullname: business.fullname,
  };

  const reason = readOnly
    ? `${READ_ONLY_ORDERING}.`
    : business.status.orderable
      ? null
      : business.status.label;

  const closeDetails = () => {
    // The dialog also reports closing once the URL has already moved on.
    if (!selected) return;
    if (openedHere.current) {
      openedHere.current = false;
      router.back();
    } else {
      router.replace(menuPath(user.username), undefined, {
        shallow: true,
        scroll: false,
      });
    }
  };

  return (
    <>
      <Head>
        <title>{`Menu · ${user.fullname} (@${user.username}) / Twitter SuperApp`}</title>
      </Head>
      <PageHeader
        title={user.fullname}
        subtitle={pluralize(tweetCount, "Tweet")}
        back
      />
      <ProfileHeader user={user} business={business} tab="menu" />

      {ordersOn && reason && (
        <div id={reasonId}>
          <Notice tone="info">{reason}</Notice>
        </div>
      )}

      {menu.length === 0 ? (
        <EmptyState title="This business hasn’t added a menu yet." />
      ) : (
        menu.map((section) => (
          <MenuSection
            key={section.title}
            section={section}
            renderProduct={(product) => (
              <ProductCard
                product={product}
                business={cartBusiness}
                detailsHref={menuPath(user.username, product.id)}
                onOpenDetails={() => {
                  openedHere.current = true;
                }}
                orderingDisabled={!!reason}
                reasonId={reasonId}
              />
            )}
          />
        ))
      )}

      <CartBar />
      <ProductDialog
        product={selected}
        business={business}
        onClose={closeDetails}
        orderingDisabled={!!reason}
        reasonId={reasonId}
      />
    </>
  );
}

// The cart bar takes the phone's floating compose button's place.
BusinessMenu.shell = { hideComposeButton: true } satisfies PageShell;

export const getServerSideProps = withPageState<MenuPageProps>(
  async ({ ctx, repo }) => {
    const product = ctx.query.product;
    const profile = await findProfile(
      repo,
      ctx.params?.username,
      typeof product === "string"
        ? `/menu?product=${encodeURIComponent(product)}`
        : "/menu"
    );
    if (!("found" in profile)) return profile;
    const { user, business } = profile.found;
    // Only businesses have a menu.
    if (!business) return { notFound: true };

    return {
      props: { user, business, menu: await repo.shop.getMenu(user.username) },
      state: { profiles: profileState(user) },
    };
  },
  { feature: "shop" }
);
