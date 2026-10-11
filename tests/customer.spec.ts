import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function login(page: Page) {
  await page
    .getByRole("button", { name: "Entrar", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Probar como cliente" }).click();
  await expect(
    page.getByRole("button", { name: "Menú de mi cuenta" }),
  ).toBeVisible();
}
async function selectBooking(page: Page) {
  await page
    .getByRole("button", { name: "Reservar cita", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Reservar cita" });
  await expect(dialog.locator(".slot-grid .time-choice").first()).toBeVisible();
  await dialog.locator(".slot-grid .time-choice").first().click();
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  return dialog;
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Demo local", { exact: true })).toBeVisible();
});
test("reserva, conserva la cita al recargar, descarga calendario y cancela", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  const booking = await selectBooking(page);
  await booking
    .getByLabel("¿Algo que deba saber tu barbero?")
    .fill("Un degradado bajito, gracias");
  await booking.getByRole("button", { name: "Confirmar mi cita" }).click();
  await expect(
    page.getByRole("dialog", { name: "Cita confirmada" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Añadir al calendario" }).click();
  expect((await download).suggestedFilename()).toBe("barber-cruz-cita.ics");
  await page.getByRole("button", { name: "Ver mis citas" }).click();
  await expect(page.locator(".appointment-status.confirmed")).toHaveCount(1);
  await expect(
    page.getByText("Un degradado bajito, gracias", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Mis citas", exact: true })
    .first()
    .click();
  await expect(page.locator(".appointment-status.confirmed")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Cancelar cita", exact: true })
    .click();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(
    page.getByText("Tu próximo corte te espera.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Historial/ }).click();
  await expect(page.locator(".appointment-status.cancelled")).toHaveCount(1);
  expect(errors).toEqual([]);
});
test("permite personalizar y conservar perfil y avatar", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
  await page.getByRole("button", { name: "Mi perfil", exact: true }).click();
  await page.getByLabel("Tu nombre", { exact: true }).fill("Álex Cruz");
  await page.getByLabel("Tu estilo favorito").selectOption("Taper fade");
  await page.getByLabel("Un poco sobre ti").fill("Me gusta el degradado bajo.");
  await page.getByRole("button", { name: "Avatar ⚡" }).click();
  await page.getByRole("button", { name: "Guardar mi perfil" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
  await expect(page.locator(".account-dropdown>strong")).toContainText(
    "Álex Cruz",
  );
  await page.getByRole("button", { name: "Mi perfil", exact: true }).click();
  await expect(page.getByLabel("Tu estilo favorito")).toHaveValue("Taper fade");
  await expect(page.getByLabel("Un poco sobre ti")).toHaveValue(
    "Me gusta el degradado bajo.",
  );
  await expect(page.getByRole("button", { name: "Avatar ⚡" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
test("el premio tras 7 cortes se reserva, no se duplica y se recupera al cancelar", async ({
  page,
}) => {
  await login(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("barbercruz.demo.v1")!);
    const past = data.appointments[0];
    for (let i = 3; i < 7; i++)
      data.appointments.push({ ...past, id: `reward-test-${i}` });
    localStorage.setItem("barbercruz.demo.v1", JSON.stringify(data));
  });
  await page.reload();
  let booking = await selectBooking(page);
  await booking.getByRole("checkbox").check();
  await booking.getByRole("button", { name: "Confirmar mi cita" }).click();
  await page.getByRole("button", { name: "Ver mis citas" }).click();
  await expect(page.locator(".appointment-card").first()).toContainText(
    "Corte gratis",
  );
  booking = await selectBooking(page);
  await expect(booking.getByRole("checkbox")).toHaveCount(0);
  await booking.getByRole("button", { name: "Cerrar ventana" }).click();
  await page
    .getByRole("button", { name: "Cancelar cita", exact: true })
    .click();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();
  booking = await selectBooking(page);
  await expect(booking.getByRole("checkbox")).toBeVisible();
});
test("dos pestañas no pueden reservar el mismo hueco de la demo", async ({
  page,
  context,
}) => {
  await login(page);
  const other = await context.newPage();
  await other.goto("/");
  const first = await selectBooking(page);
  const second = await selectBooking(other);
  await Promise.all([
    first.getByRole("button", { name: "Confirmar mi cita" }).click(),
    second.getByRole("button", { name: "Confirmar mi cita" }).click(),
  ]);
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("barbercruz.demo.v1")!,
          ).appointments.filter(
            (a: { status: string }) => a.status === "confirmed",
          ).length,
      ),
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await page.getByRole("dialog", { name: "Cita confirmada" }).count()) +
        (await other.getByRole("dialog", { name: "Cita confirmada" }).count()),
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await page
          .getByText("Esa hora ya no está disponible. Elige otra.")
          .count()) +
        (await other
          .getByText("Esa hora ya no está disponible. Elige otra.")
          .count()),
    )
    .toBe(1);
});
test("un cliente no recibe el acceso al panel y Escape cierra el modal", async ({
  page,
}) => {
  const trigger = page
    .getByRole("button", { name: "Entrar", exact: true })
    .first();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await login(page);
  await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
  await expect(
    page.getByRole("button", { name: "Administrar barbería" }),
  ).toHaveCount(0);
});
test("la portada y el formulario caben en móvil, tablet y escritorio", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Pilla tu cita", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Reservar cita" });
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.keyboard.press("Escape");
  }
});
