// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithStore } from "../../test/render";
import AcceptingOrders from "./AcceptingOrders";
import AvailabilitySwitch from "./AvailabilitySwitch";
import ProductAvailability from "./ProductAvailability";
import { business, product, status, stubFetch } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AvailabilitySwitch", () => {
  it("is a switch that reports its state and asks for the other one", async () => {
    const onChange = vi.fn();
    render(
      <AvailabilitySwitch checked label="Pistachio latte" onChange={onChange} />
    );
    const toggle = screen.getByRole("switch", { name: "Pistachio latte" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("waits while a change is saved, keeping focus", async () => {
    const onChange = vi.fn();
    render(
      <AvailabilitySwitch
        checked={false}
        busy
        label="Accepting orders"
        onChange={onChange}
      />
    );
    const toggle = screen.getByRole("switch", { name: "Accepting orders" });
    toggle.focus();
    await userEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
    expect(toggle.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(toggle);
  });

  it("can be disabled with a reason", () => {
    render(
      <>
        <p id="why">Changes are turned off on this read-only demo.</p>
        <AvailabilitySwitch
          checked
          disabled
          describedBy="why"
          label="SuperApp mug"
          onChange={() => {}}
        />
      </>
    );
    const toggle = screen.getByRole("switch", { name: "SuperApp mug" });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(toggle.getAttribute("aria-describedby")).toBe("why");
  });
});

describe("ProductAvailability", () => {
  const mug = product({
    id: "seed-p-sa-mug",
    name: "SuperApp mug",
    price: 1_200,
  });

  it("marks the product sold out on the server", async () => {
    const api = stubFetch({
      "/api/products/seed-p-sa-mug/availability": (init) => [
        200,
        { product: { ...mug, ...JSON.parse(String(init?.body)) } },
      ],
    });
    vi.stubGlobal("fetch", vi.fn(api.fetch));
    renderWithStore(<ProductAvailability product={mug} />);

    const toggle = screen.getByRole("switch", { name: "SuperApp mug" });
    expect(screen.getByText(/Available/)).toBeTruthy();
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await waitFor(() => expect(toggle.getAttribute("aria-busy")).toBeNull());
    expect(screen.getByText(/Sold out/)).toBeTruthy();
    expect(api.calls).toEqual([
      {
        path: "/api/products/seed-p-sa-mug/availability",
        init: expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ available: false }),
        }),
      },
    ]);
  });

  it("moves back and says why when saving fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: "not_found", message: "Product not found" },
            }),
            { status: 404 }
          )
      )
    );
    const { store } = renderWithStore(<ProductAvailability product={mug} />);
    const toggle = screen.getByRole("switch", { name: "SuperApp mug" });
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(toggle.getAttribute("aria-checked")).toBe("true")
    );
    expect(store.getState().ui.toasts).toMatchObject([
      { message: "Product not found", tone: "error" },
    ]);
  });
});

describe("AcceptingOrders", () => {
  it("pauses orders, and the status follows", async () => {
    const paused = business({
      acceptingOrders: false,
      status: status.paused,
    });
    const api = stubFetch({
      "/api/businesses/kizilaykahve/settings": () => [
        200,
        { business: paused },
      ],
    });
    vi.stubGlobal("fetch", vi.fn(api.fetch));
    renderWithStore(<AcceptingOrders business={business()} />);

    const toggle = screen.getByRole("switch", { name: "Accepting orders" });
    expect(screen.getByText("Open 24 hours")).toBeTruthy();
    await userEvent.click(toggle);
    expect(await screen.findByText("Not taking orders right now")).toBeTruthy();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(api.calls[0].init?.body).toBe(
      JSON.stringify({ acceptingOrders: false })
    );
  });
});
