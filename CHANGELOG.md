# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

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
