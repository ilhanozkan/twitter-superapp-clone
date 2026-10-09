import { ReactNode, useId } from "react";

import { IMenuSection, IProduct } from "../../types/Shop";

/**
 * One section of a menu ("Coffee", "Bakery") as an h2 and a list. The menu
 * page and the Business page render its products their own way.
 */
export default function MenuSection({
  section,
  renderProduct,
}: {
  section: IMenuSection;
  renderProduct: (product: IProduct) => ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="px-4 pb-1 pt-4 text-xl font-extrabold [overflow-wrap:anywhere]"
      >
        {section.title}
      </h2>
      <ul className="divide-y divide-line">
        {section.products.map((product) => (
          <li key={product.id}>{renderProduct(product)}</li>
        ))}
      </ul>
    </section>
  );
}
