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
test("la foto de galería se prepara, se guarda al confirmar y se conserva al recargar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const openProfile = async () => {
    await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
    await page
      .locator(".account-dropdown")
      .getByRole("button", { name: "Mi perfil", exact: true })
      .click();
  };
  await openProfile();
  const originalAvatar = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("barbercruz.demo.v1")!).profiles[0]
        .avatar,
  );
  const photo = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 600;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#324858";
    context.fillRect(0, 0, 900, 600);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const upload = {
    name: "mi-foto.png",
    mimeType: "image/png",
    buffer: Buffer.from(photo, "base64"),
  };
  await page.getByLabel("Elegir foto de perfil").setInputFiles(upload);
  await expect(page.locator(".profile-avatar-row img")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar mi perfil" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("barbercruz.demo.v1")!).profiles[0]
          .avatar,
    ),
  ).toBe(originalAvatar);
  await page.getByRole("button", { name: "Cerrar ventana" }).click();
  await openProfile();
  await expect(page.locator(".profile-avatar-row img")).toHaveCount(0);
  await page.getByLabel("Elegir foto de perfil").setInputFiles(upload);
  await expect(page.locator(".profile-avatar-row img")).toBeVisible();
  await page.getByRole("button", { name: "Guardar mi perfil" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await openProfile();
  const image = page.locator(".profile-avatar-row img");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
  await expect
    .poll(() =>
      image.evaluate((img: HTMLImageElement) => [
        img.naturalWidth,
        img.naturalHeight,
      ]),
    )
    .toEqual([512, 341]);
  await page.getByLabel("Elegir foto de perfil").setInputFiles({
    name: "imagen.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  });
  await expect(page.getByRole("alert")).toContainText("Elige una foto JPG");
  await expect(image).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
  await page.getByRole("button", { name: "Avatar ⚡" }).click();
  await expect(image).toHaveCount(0);
  await page.getByRole("button", { name: "Guardar mi perfil" }).click();
  await page.reload();
  await openProfile();
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
test("cancelar la eliminación de cuenta conserva el perfil, las citas y la sesión", async ({
  page,
}) => {
  await login(page);
  const before = await page.evaluate(() => ({
    data: localStorage.getItem("barbercruz.demo.v1"),
    session: localStorage.getItem("barbercruz.demo.session"),
  }));
  await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
  await page.getByRole("button", { name: "Mi perfil", exact: true }).click();
  await page
    .getByRole("button", { name: "Eliminar mi cuenta", exact: true })
    .click();
  const confirmation = page.getByRole("form", {
    name: "Confirmar eliminación de mi cuenta",
  });
  const finalButton = confirmation.getByRole("button", {
    name: "Eliminar definitivamente",
  });
  await expect(finalButton).toBeDisabled();
  await confirmation
    .getByLabel("Escribe ELIMINAR para confirmar")
    .fill("eliminar");
  await expect(finalButton).toBeDisabled();
  await confirmation
    .getByLabel("Escribe ELIMINAR para confirmar")
    .fill("ELIMINAR");
  await expect(finalButton).toBeEnabled();
  await confirmation
    .getByRole("button", { name: "Conservar mi cuenta" })
    .click();
  await expect(confirmation).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      data: localStorage.getItem("barbercruz.demo.v1"),
      session: localStorage.getItem("barbercruz.demo.session"),
    })),
  ).toEqual(before);
  await page.getByRole("button", { name: "Cerrar ventana" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Menú de mi cuenta" }),
  ).toBeVisible();
});
test("eliminar mi cuenta borra mis citas y puntos, cierra la sesión y conserva los demás clientes", async ({
  page,
}) => {
  await login(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("barbercruz.demo.v1")!);
    data.appointments.push({
      ...data.appointments[0],
      id: "other-customer-history",
      userId: "demo-dani",
      note: "Conservar el historial de Dani",
    });
    localStorage.setItem("barbercruz.demo.v1", JSON.stringify(data));
  });
  await page.reload();
  const booking = await selectBooking(page);
  await booking.getByRole("button", { name: "Confirmar mi cita" }).click();
  await page.getByRole("button", { name: "Ver mis citas" }).click();
  const before = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("barbercruz.demo.v1")!);
    return {
      profiles: data.profiles.filter(
        (profile: { id: string }) => profile.id !== "demo-customer",
      ),
      appointments: data.appointments.filter(
        (appointment: { userId: string }) =>
          appointment.userId !== "demo-customer",
      ),
      ownAppointments: data.appointments.filter(
        (appointment: { userId: string }) =>
          appointment.userId === "demo-customer",
      ),
    };
  });
  expect(before.ownAppointments.length).toBe(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
  await page
    .locator(".account-dropdown")
    .getByRole("button", { name: "Mi perfil", exact: true })
    .click();
  await expect(page.locator(".delete-account-section")).toContainText(
    "Tu cuenta de Google no se eliminará",
  );
  await page
    .getByRole("button", { name: "Eliminar mi cuenta", exact: true })
    .click();
  await page.getByLabel("Escribe ELIMINAR para confirmar").fill("ELIMINAR");
  await page.getByRole("button", { name: "Eliminar definitivamente" }).click();
  await expect(
    page.getByText("Tu cuenta de Barber Cruz se ha eliminado.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Menú de mi cuenta" }),
  ).toHaveCount(0);
  const after = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("barbercruz.demo.v1")!);
    return {
      profiles: data.profiles,
      appointments: data.appointments,
      session: localStorage.getItem("barbercruz.demo.session"),
    };
  });
  expect(after.profiles).toEqual(before.profiles);
  expect(after.appointments).toEqual(before.appointments);
  expect(after.session).toBeNull();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Menú de mi cuenta" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Entrar", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Probar como cliente" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No se encontró el perfil",
  );
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("barbercruz.demo.v1")!).profiles.some(
        (profile: { id: string }) => profile.id === "demo-customer",
      ),
    ),
  ).toBe(false);
});
