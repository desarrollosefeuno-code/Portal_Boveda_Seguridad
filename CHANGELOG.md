# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

## [2.0.0] - 2026-11-13

Versión que corrige los hallazgos de la auditoría técnica del 13-11-2026 y adopta el Kit F1+ con un tema Matrix.

### Cambios incompatibles
- **PIN personal de 6 dígitos** en lugar del PIN compartido de 4. Cada usuario lo crea en su próximo ingreso, confirmando con su contraseña, y tiene su propio bloqueo: 5 intentos lo bloquean 15 minutos. La tabla `vault_config` queda sin uso.
- **Sesiones nuevas**: las cookies pasan a `f1v_session` y `f1v_vault` (las dos `HttpOnly`), firmadas con claves derivadas por propósito. Todas las sesiones de la v1 se invalidan.
- **Sin valores por defecto**: `MASTER_ENCRYPTION_KEY`, `JWT_SECRET` y `DATABASE_URL` son obligatorias, de 32 o más caracteres y distintas de los valores publicados. El primer admin solo se crea si se definen `DEFAULT_ADMIN_EMAIL` y `DEFAULT_ADMIN_PASSWORD` (14 o más caracteres).
- **API**: el listado ya no trae secretos; se piden con `GET /:id/reveal`. Editar exige `version`. `DELETE` envía a la papelera. Se retiró `log-action`. Usuarios: `temporaryPassword` al crear, y rol admin por solicitud aprobada.

### Seguridad
- C-01: `change-pin` exige la bóveda desbloqueada y el PIN actual, y cuenta los intentos en el mismo bloqueo.
- C-02: los contadores de intentos de PIN y login corren en transacción con `FOR UPDATE` o en una sola sentencia atómica.
- C-03: la configuración se valida al arrancar. Se separan las claves por propósito con HKDF (sesión, token de bóveda y pimienta del PIN).
- C-04: ya no se escriben contraseñas ni PIN en los logs. Las cuentas con la contraseña publicada en la v1 quedan obligadas a cambiarla.
- A-01: cada petición valida en la BD el estado, el rol y la versión de sesión. Logout, deshabilitar o cambiar la contraseña revocan la sesión al instante.
- A-02: el token de bóveda va ligado al usuario, la sesión y la época de bóveda. "Bloquear" lo revoca en el servidor. Expira tras 15 min de inactividad, con un máximo de 2 h, y ya no se guarda en `sessionStorage`.
- A-04: el listado no incluye secretos y la revelación se registra en el servidor antes de entregar el valor. Se agregan permisos de llaves por entorno para cada operador.
- A-05: la clave maestra se deriva una sola vez. El formato v2 incluye AAD e identificador de clave (`kid`) y los datos v1 se re-cifran al arrancar. Se puede rotar la clave con `MASTER_ENCRYPTION_KEY_PREVIOUS`.
- A-06: hay límites de peticiones en login, PIN, revelación y API, y bloqueo de cuenta tras 10 intentos. El mensaje y el tiempo de respuesta son iguales exista o no la cuenta.
- A-07: CORS con lista blanca (`CORS_ORIGINS`), cabecera anti-CSRF `X-F1-Vault` y control de `Origin`. El login ya no devuelve el token en el cuerpo.
- A-08: un trigger hace inmutable la bitácora. La IP se obtiene según `trust proxy`. Los registros sensibles se escriben dentro de la transacción y la operación falla si no se registran. El operador solo ve sus propios eventos.
- A-09: otorgar el rol admin requiere la aprobación de otro admin; con un solo admin se aplica directo y queda marcado en la bitácora. Nadie se cambia a sí mismo rol, estado, contraseña ni PIN, y el último admin activo no se puede quitar.
- A-10: TLS hacia PostgreSQL valida el certificado por defecto (`DATABASE_SSL`, `DATABASE_SSL_CA`).
- M-01: validación Zod de todas las entradas: UUID, largos, catálogos, fechas y URL solo http/https.
- M-02: CSP estricta sin recursos externos (fuente JetBrains Mono local), COOP/CORP, `Permissions-Policy` y `no-store` en el API.
- M-06: los secretos se ven solo 30 s, el portapapeles se vacía a los 30 s y la bóveda se bloquea por inactividad también en el navegador.
- B-01: el generador de contraseñas usa solo CSPRNG, con muestreo sin sesgo y barajado Fisher–Yates.
- Hash de contraseñas scrypt con N=2^15, r=8, p=3. Los hashes heredados se actualizan al iniciar sesión.

### Agregado
- Papelera con restauración y borrado definitivo (admin), e historial de los últimos 10 valores de cada secreto (admin).
- Control de versión al editar: si otra persona guardó antes, se avisa en vez de sobrescribir.
- "Mi cuenta": nombre, cambio de contraseña, cambio de PIN y la opción de apagar la animación.
- Cambio de contraseña obligatorio tras una contraseña temporal.
- Gestión de usuarios: contraseña temporal generada y mostrada una sola vez, reseteo de PIN, entornos permitidos, solicitudes de rol admin y estado de bloqueo.
- Aviso de llaves vencidas o por vencer en 30 días.
- Migraciones versionadas (`schema_migrations`) con candado de asesoría.
- `/api/health` consulta la BD. El arranque espera a PostgreSQL y se detiene si las migraciones fallan. Se agrega un manejador de errores del pool y cierre ordenado.
- Pruebas de integración de toda la API contra PostgreSQL en memoria (PGlite): 35 pruebas.
- Demo local en memoria: `npm run dev:demo`.

### Cambiado
- Interfaz reconstruida con el **Kit F1+ UI 1.6.0** (copiado sin editar en `src/components/f1-ui/`) y un **tema Matrix**: tokens `--f1-*` redefinidos (negro y verde fósforo, contraste AA verificado), JetBrains Mono, lluvia de caracteres de fondo que se puede apagar y respeta "reducir movimiento", y líneas de monitor. Cabecera fija, barra inferior en el celular, modales y confirmaciones del kit en lugar de `window.confirm`, y spinner corporativo solo en cargas de bloque.
- Las rutas de contraseñas y llaves se unificaron en un solo módulo (`itemRoutes.ts`). Editar ya no borra los datos adicionales de una llave (M-04).
- La bitácora pagina con una sola consulta (`COUNT(*) OVER()`) y escapa los comodines de la búsqueda. Se crearon índices parciales para el orden del listado y se quitaron los redundantes.
- Se retiraron las dependencias `cors`, `clsx` y `tailwind-merge` y las fuentes de Google. Se agregaron `zod` y `@fontsource-variable/jetbrains-mono`.

### Eliminado
- El formulario señuelo y el "watchdog" anti-autocompletado: se reemplazan por `autocomplete` correcto en cada campo.

## [1.0.0] - 2026-11-10

### Agregado
- **Lanzamiento Inicial de F1 KeyVault & Fortress (`Portal_Boveda_Seguridad`)**:
  - Portal corporativo autónomo e independiente para la gestión y resguardo ultra-seguro de credenciales y secretos de infraestructura.
- **Separación Arquitectónica de Secretos**:
  - **Módulo 1: Contraseñas de Portales y Accesos Web**:
    - Almacenamiento seguro de credenciales para plataformas web, sistemas de clientes, SaaS, correos y paneles de administración.
    - Soporte para URL con lanzamiento rápido, usuario/correo, contraseña cifrada, campos adicionales ilimitados (RUT, Clave secundaria, Preguntas secretas), notas seguras, favoritos y etiquetas.
  - **Módulo 2: Llaves, Tokens y Secretos Técnicos**:
    - Almacenamiento especializado para `API_KEY` (Webhooks y llaves de integración), `TOKEN` (Bearer tokens, JWT), `SSH_KEY` (Claves públicas y privadas para servidores), `DATABASE` (Cadenas DSN y contraseñas de BD), `PIN_CODE` (PINs numéricos para acceso físico a recintos o tarjetas) y `CERTIFICATE` (Certificados SSL y licencias).
    - Clasificación por entorno (`Producción`, `Staging`, `QA`, `Desarrollo`), identificación técnica y fecha de expiración/renovación.
- **Cifrado y Seguridad de Grado Militar (AES-256-GCM + scrypt)**:
  - Todo dato sensible se cifra antes de persistir en PostgreSQL utilizando **AES-256-GCM** con clave derivada mediante `scrypt`, vector de inicialización (IV) de 12 bytes único por registro y etiqueta de autenticación (AuthTag) de 16 bytes.
  - Detección inmediata y rechazo ante cualquier intento de manipulación o adulteración del ciphertext.
- **Doble Factor de Seguridad (Login + PIN de 4 Dígitos)**:
  - Autenticación inicial de usuario con email y contraseña hasheada mediante `scrypt` y tokens JWT firmados en cookies HttpOnly.
  - Desbloqueo verbal de la bóveda mediante PIN numérico maestro de 4 dígitos validado en tiempo constante (`crypto.timingSafeEqual`).
  - Protección anti-fuerza bruta: bloqueo automático por 15 minutos al superar 5 intentos fallidos consecutivos (`429 Too Many Requests`).
  - Sesiones efímeras de bóveda con expiración automática de 15 minutos por inactividad y botón de bloqueo instantáneo.
- **Blindaje Total Anti-Autocompletado de Navegadores**:
  - Implementación multicapa que neutraliza la inyección involuntaria de credenciales personales por parte de Chrome y Edge: casillas de PIN y buscadores con `autoComplete="one-time-code"`, formulario señuelo invisible (*Decoy Trap*), modo `readOnly` dinámico hasta interacción activa y watchdog nativo por `useRef`.
- **Bitácora Inmutable de Auditoría**:
  - Registro pormenorizado de inicios de sesión, desbloqueos, fallos de PIN, revelación de contraseñas, copiado al portapapeles y modificaciones con marca de tiempo, usuario, dirección IP y user agent.
- **Gestión de Usuarios y Roles**:
  - Módulo administrativo para crear colaboradores, asignar roles (`admin` u `operator`), resetear contraseñas y habilitar o deshabilitar cuentas.
- **Preparado para Despliegue en Railway**:
  - Servidor Express empaquetado con Vite + Node.js en TypeScript.
  - Migración automática de tablas al iniciar (`ensureDatabaseSchema`) conectando a PostgreSQL mediante `DATABASE_URL`.
  - Configuración nativa con `railway.json`, `Procfile` y endpoint de salud `/api/health`.

