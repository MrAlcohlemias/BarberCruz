# Barber Cruz

Web de reservas en español con tema oscuro en negro y gris, diseñada para móvil e instalable como aplicación en la pantalla de inicio. Incluye una portada, perfiles con foto de la galería o avatar, reservas, historial, Club Cruz y un panel para el barbero.

El corte inicial cuesta **7 €** y dura **45 minutos**. Tras **7 cortes pagados completados**, el cliente puede reservar un corte gratis. Los horarios iniciales son un ejemplo editable: lunes a sábado de 10:00 a 20:00, domingo cerrado.

## Arrancar

Requiere Node.js 22.12 o posterior; el entorno preparado usa Node.js 24.

```sh
cd /workspace/BarberCruz
npm ci
npm run dev
```

Sin configuración de Supabase se abre una **demo local claramente identificada**. Pulsa **Entrar → Probar como cliente**. El acceso **Explorar el panel de administración** existe únicamente en desarrollo local; está desactivado en las compilaciones publicadas. Para administrar la web publicada hace falta una cuenta real de Supabase. Los datos de prueba se conservan en ese navegador; no son reservas reales ni se comparten con otros móviles. El cliente de demo comienza con tres cortes anteriores de ejemplo. Puedes restablecerlos desde **Privacidad → Borrar datos de esta demo**.

## Cuentas y reservas reales

Sigue [la guía de Supabase y Google](supabase/README.md): crea el proyecto, ejecuta [schema.sql](supabase/schema.sql), activa Google y configura las dos variables públicas de [.env.example](.env.example). Crea la cuenta de tu amigo con correo y contraseña en Supabase (o usa su cuenta Google) y dale el rol de administrador desde el SQL Editor. El formulario **Acceso de administrador** comprueba su cuenta y el rol en la base de datos. Desde **Mi perfil** podrá cambiar su contraseña. Al conectar Supabase desaparecen los accesos de demostración.

No incluyas secretos OAuth ni claves `service_role` en variables `VITE_`. El navegador utiliza la clave pública del proyecto; las políticas de la base de datos protegen los perfiles y las citas. Las reservas se validan de forma atómica en PostgreSQL para evitar solapes y canjes duplicados.

## Publicar

1. Guarda el proyecto en el repositorio y conéctalo a un alojamiento compatible con Vite, por ejemplo Vercel.
2. Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en ese alojamiento.
3. Compila con `npm run build`; la carpeta publicada es `dist`. [vercel.json](vercel.json) incluye la configuración necesaria para Vercel.
4. Configura el dominio HTTPS final en las URL de redirección de Supabase y comprueba el acceso con dos cuentas de Google distintas.
5. Tu amigo debe revisar sus horarios en **Horarios**, ajustar los turnos y bloquear descansos o días en que no puede atender. La agenda utiliza hora de Madrid.

La publicación y el Google OAuth real requieren un proyecto Supabase y un alojamiento que aún no están conectados a este entorno. La versión local y las pruebas de PostgreSQL no sustituyen esa comprobación final.

## Instalar en el móvil

En el dominio HTTPS publicado, pulsa **Instalar la app** cuando el navegador lo permita. En iPhone: abre Safari → Compartir → Añadir a pantalla de inicio. En Android: menú de Chrome → Instalar aplicación o Añadir a pantalla de inicio.

El manifiesto, los iconos y el service worker permiten abrir la web en modo aplicación. Solo se guarda la interfaz pública para acceso sin conexión; las respuestas de autenticación y de la base de datos no se guardan en la caché del service worker. Las reservas reales necesitan internet. Las actualizaciones se aplican al volver a abrir la app cuando termina de actualizarse el service worker.

## Comprobar

```sh
npm test
npm run test:e2e
npm run build
```

Las pruebas unitarias comprueban horarios, zona horaria, duración, solapes, cancelaciones y fidelidad. Las pruebas de navegador ejecutan reservas, persistencia, edición de perfil, administración, canjes y reservas simultáneas en dos pestañas de la demo. Usan Chromium instalado en este entorno; en otra máquina, puedes instalarlo con `npx playwright install chromium` o indicar su ruta mediante `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Estas pruebas requieren la demo local; no las ejecutes contra una web de clientes.

La lógica SQL se comprobó también en PostgreSQL 17 con roles anónimo, cliente y administrador, incluidas reservas simultáneas. La comprobación real con Google sigue pendiente de conectar el proyecto.

## Uso del panel

- **Agenda → Editar cita:** cambia la fecha, hora o notas de una cita pendiente cuando el cliente pida otro hueco. La edición conserva precio y duración y comprueba los horarios ocupados. También puedes cancelar y marcar como realizados los cortes que ya han terminado. Un corte normal completado añade un sello; no se procesan pagos en la web.
- **Servicios:** modifica nombre, descripción, precio y duración. Las citas conservan su duración y precio originales.
- **Horarios:** configura cada día o aplica turnos de mañana/tarde, define antelación y bloquea intervalos concretos. Cambiar el horario no cancela las citas ya confirmadas.
- **Club Cruz:** siete cortes pagados dan derecho al siguiente gratis. Al reservar un regalo queda apartado; si cancelas, se recupera. Los cortes gratuitos no suman sellos.

En **Mi perfil → Elegir de la galería**, puedes seleccionar una foto JPG, PNG o WebP de hasta 10 MB y ver una vista previa. Se reduce a un máximo de 512 píxeles por lado, se convierte a JPEG sin los metadatos originales y solo se guarda al confirmar el perfil. En la versión conectada, Supabase Storage guarda las fotos en un bucket privado: pueden verlas su propietario y el barbero. En la demo solo se conservan en ese navegador.

La fotografía de portada es una imagen de ambiente generada para el diseño; no representa a tu amigo ni su habitación. Puede sustituirse por una fotografía real en `public/barber-hero.png`. El enlace de Instagram corresponde a **@_barbercruz_**.

La página de privacidad explica el uso básico de los datos y remite a Instagram para solicitar su eliminación. Antes de compartir la web, completa la información del responsable y su canal de contacto con los datos reales del barbero.
