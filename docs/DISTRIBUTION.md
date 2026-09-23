# Distribución para Windows

Se prepararon los scripts; no se compilaron ni probaron en esta entrega.
Objetivo inicial: Windows 10/11 x64. No se anuncia soporte de ARM64 o Windows
32 bits. Las capacidades de impresión siguen siendo serial COM y ESC/POS.

## Equipo donde se construye

1. Activar Node con nvm, según .nvmrc, y utilizar pnpm 11.19.0.
2. Ejecutar `pnpm install --frozen-lockfile`.
3. Para el instalador, instalar Inno Setup 6.3 o superior desde
   https://jrsoftware.org/isdl.php, siguiendo sus términos de licencia.
   Este requisito es solo para desarrollo; el usuario final no lo necesita.

El script busca ISCC.exe en PATH y en ubicaciones habituales. Para una ubicación
personalizada, establecer en PowerShell:

```powershell
$env:INNO_SETUP_COMPILER = 'C:\ruta\Inno Setup 6\ISCC.exe'
```

No instala herramientas automáticamente. Verifica que exista el compilador antes
de empezar a construir el instalador.

## Comandos

Cerrar la aplicación anterior antes de recompilar. Desde la raíz del proyecto:

```powershell
# EXE sin consola, como antes:
pnpm build:exe

# Compila EXE y crea ZIP:
pnpm build:portable

# Compila EXE y crea instalador:
pnpm build:installer

# Compila una vez y genera ambos:
pnpm build:release
```

Los tres comandos de distribución vuelven a generar el EXE desde el código
actual. No ejecutan el servidor, pruebas ni impresiones.
La construcción puede descargar el runtime de pkg y necesita acceso a internet
si no está en caché. PowerShell se ejecuta sin cambiar la política global.

Salida para la versión 1.0.0:
- dist/release/PrinterServer-1.0.0-windows-x64-portable.zip
- dist/release/PrinterServer-1.0.0-windows-x64-setup.exe
- Un archivo .sha256 por paquete.

Los nombres/versiones se toman de package.json. Usar versiones numéricas X.Y.Z
y aumentarlas para cada entrega. El AppId del instalador es fijo y no debe
cambiar entre versiones. Los artefactos antiguos no se borran automáticamente;
distribuir solo los archivos de la versión que se acaba de generar.

## Instalación y actualización

Instalación por usuario en %LOCALAPPDATA%\Programs\Printer Server.
Acceso en el menú Inicio, escritorio opcional e inicio de sesión opcional.
El inicio automático ejecuta --background para abrir la bandeja sin navegador.
No se añaden servicios, reglas de firewall, exclusiones de antivirus ni drivers.
Los controladores se instalan por separado según el fabricante.

El usuario debe cerrar la aplicación antes de actualizar o desinstalar.
No se fuerza la terminación de procesos ni de impresiones. Instalar la siguiente
versión sobre la anterior con el mismo usuario de Windows.
No hay actualización automática ni protección contra instalar una versión anterior.

Los datos se guardan fuera de la carpeta instalada, en
%LOCALAPPDATA%\PrinterServer. El instalador NO incluye ni sobrescribe config.json,
dominios autorizados, PIN, datos de impresora o registros del equipo de desarrollo.
La desinstalación elimina programa y accesos, pero conserva la configuración.
La versión portable usa esa misma carpeta: no es un modo de datos portables.

## Verificación a cargo del usuario

Antes de distribuir a clientes, comprobar en otro equipo Windows:
- Instalación sin Node/pnpm y apertura de la bandeja y el panel.
- Selección del dispositivo real y autorización del dominio de prueba.
- Impresión desde el SaaS y bloqueo de dominios no autorizados.
- Inicio automático solo cuando se elige y sin abrir el navegador.
- Actualización con conservación de datos, salida y desinstalación.
- ZIP extraído en una carpeta nueva; sin copiar node_modules ni datos del desarrollador.

La compatibilidad de módulos nativos, PowerShell y los drivers debe comprobarse
con el hardware real. No se ha realizado esa validación como parte de esta entrega.

## Firma y procedencia

Los paquetes de este flujo no se firman digitalmente. SHA-256 permite comparar
archivos, pero no acredita al editor por sí solo. No distribuir como versión
final verificada ni recomendar desactivar SmartScreen/antivirus.

Para distribución comercial falta decidir el nombre legal del editor y el
mecanismo/certificado de firma. Firmar el EXE después de windows-gui.cjs y antes
de empaquetarlo; configurar después la firma del instalador y desinstalador en
Inno Setup. Este flujo todavía no implementa esos pasos. Cualquier firma o cambio
posterior exige recalcular los hashes de los artefactos finales.

Referencias:
- https://jrsoftware.org/ishelp/topic_setup_privilegesrequired.htm
- https://jrsoftware.org/ishelp/topic_compilercmdline.htm

