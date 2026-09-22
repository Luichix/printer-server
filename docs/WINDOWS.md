# Windows: generar, instalar y actualizar Printer Server

Este documento es el procedimiento de entrega para la aplicación Windows. El código se puede editar en macOS; **la compilación se ejecuta en Windows x64**. No copies `node_modules` de la Mac.

El resultado es una aplicación con icono junto al reloj, panel en el navegador y Node.js incluido. El usuario final no necesita Node.js, npm, Git ni una consola. No es un servicio del sistema: funciona mientras el usuario tiene su sesión abierta.

## 1. Preparar la computadora de construcción

Necesitas:

- Windows 10/11 x64, con .NET Framework 4.x y Windows PowerShell 5.1 (incluidos habitualmente en esos sistemas).
- **Node.js 22 x64**, instalado desde https://nodejs.org/. Usa una versión de mantenimiento vigente de la rama 22. El proceso empaqueta exactamente la versión instalada y registra su número.
- **Inno Setup 6.3 o superior de la rama 6**, desde https://jrsoftware.org/isdl.php, para generar el instalador. No hace falta para generar solamente la versión portable.
- Git si vas a clonar; también puedes descargar y extraer el ZIP del repositorio de GitHub.
- Internet durante la construcción para instalar dependencias y descargar el runtime oficial de Node.js.

Cierra y vuelve a abrir PowerShell después de instalar Node.js. Confirma:

```powershell
node --version
node -p process.arch
npm.cmd --version
```

Debes obtener `v22.x.x` y `x64`. No ejecutes la generación desde WSL ni con Node ARM64. El primer alcance de distribución es Windows x64.

## 2. Descargar el código y generar

Clona el repositorio o descarga su ZIP. Abre PowerShell en la carpeta que contiene `package.json`:

```powershell
npm.cmd run build:windows
```

El comando ya ejecuta las instalaciones y las pruebas; no necesitas ejecutar `npm install` previamente. Usar `npm.cmd` evita el bloqueo de `npm.ps1` por la política de ejecución de PowerShell. La política `Bypass` del proceso de construcción se aplica solamente a ese proceso, no cambia la política permanente del equipo.

Si Inno Setup está en una ubicación diferente:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1 -IsccPath 'C:\Herramientas\Inno Setup 6\ISCC.exe'
```

Para obtener únicamente la versión portable:

```powershell
npm.cmd run build:windows:portable
```

El proceso:

1. Instala las versiones exactas de `package-lock.json` y ejecuta las pruebas.
2. Descarga el ZIP oficial de Node.js para Windows x64, de la misma versión que se está usando para construir, y compara su SHA256 con el listado oficial descargado por HTTPS.
3. Instala las dependencias en una carpeta temporal limpia de Windows.
4. Comprueba que el módulo serial puede cargarse con el runtime incluido.
5. Compila el lanzador de escritorio con el compilador de .NET Framework.
6. Genera el ZIP portable y, si se solicitó, el instalador.
7. Escribe las sumas SHA256 de los artefactos y elimina su carpeta temporal.

Si una instalación, prueba o compilación falla, el comando termina con error. No distribuyas artefactos de una ejecución fallida: pueden quedar archivos de una ejecución anterior con el mismo número de versión.

## 3. Archivos generados

Para la versión `0.1.0`:

```text
 dist/windows/0.1.0/
   PrinterServer-0.1.0-windows-x64-setup.exe
   PrinterServer-0.1.0-windows-x64-portable.zip
   SHA256SUMS.txt
```

El instalador solo aparece si no usaste la opción portable. Dentro del portable:

```text
 PrinterServer/
   PrinterServer.exe
   app/                  Código y dependencias
   runtime/              node.exe y su licencia
   build-info.json       Versión, fecha y huella del lockfile
   LEEME-WINDOWS.md       Este documento
```

**No copies solamente `PrinterServer.exe`**: necesita `app` y `runtime` a su lado. Para entregar a usuarios, utiliza el instalador o el ZIP completo. `dist` y `node_modules` están excluidos de Git; sube los archivos de distribución a una Release de GitHub si deseas publicarlos, no al código fuente.

Los binarios no se firman digitalmente en este proceso. Windows puede mostrar una advertencia de editor desconocido. Para distribución comercial, incorpora firma de código con un certificado propio; no es necesario desactivar antivirus ni SmartScreen.

## 4. Instalar y configurar en el equipo de caja

1. Instala el controlador oficial de la impresora. En esta etapa debe aparecer como puerto COM; una cola de impresión USB de Windows por sí sola no es compatible.
2. Ejecuta `PrinterServer-<version>-windows-x64-setup.exe` desde la cuenta Windows que usará la caja. El instalador trabaja por usuario, sin pedir elevación; la instalación del controlador sí puede requerir permisos de administrador.
3. Opcionalmente marca **Crear acceso directo en el escritorio** e **Iniciar al entrar en Windows**.
4. Abre Printer Server. Aparecerá un icono en el área de notificación y se abrirá http://127.0.0.1:4000.
5. Agrega la impresora, elige el puerto COM y la velocidad, guarda y realiza una prueba.
6. En **Conectar una aplicación web**, escribe los orígenes exactos autorizados, uno por línea, y guarda. Ejemplo: `https://pos.ejemplo.com`. No incluyas rutas ni barra final.
7. Obtén la credencial desde el panel y configura la integración web de ese equipo. La web debe enviar el encabezado `Authorization: Bearer <credencial>` y un `jobId` estable para cada impresión.

Los orígenes guardados se aplican inmediatamente y persisten. `PRINTER_ALLOWED_ORIGINS` sigue disponible para ejecución por consola y se combina con la lista guardada; para retirar un origen que viene del entorno hay que quitar esa variable y reiniciar.

El lanzador Windows usa el puerto **4000** y `%LOCALAPPDATA%\PrinterServer` para los datos. El modo por consola (`npm start`) permite personalizar esas rutas mediante las variables documentadas en el README principal.

La credencial de esta etapa autoriza la instalación completa. Todavía no hay vinculación por negocio, permisos por usuario ni aislamiento multitenant.

### Uso diario

- Doble clic en el icono junto al reloj: abrir el panel.
- Menú del icono → **Abrir configuracion**: volver al panel.
- Menú → **Abrir carpeta de datos y registro**: abrir los datos y `agent.log`.
- Menú → **Salir**: detener el agente y cerrar las conexiones. Espera a que desaparezca el icono antes de actualizar.
- Cerrar la pestaña del navegador **no detiene** el agente.
- Si activaste el inicio con Windows, se inicia en segundo plano sin abrir una pestaña cada vez.
- Volver a abrir el acceso directo utiliza la instancia existente y abre el panel.

Si usas la versión portable, extrae el ZIP completo a una carpeta y abre `PrinterServer.exe`. No se registra automáticamente en el inicio de Windows ni crea accesos directos. No ejecutes simultáneamente el portable y la versión instalada.

## 5. Datos, actualización y desinstalación

El programa se instala en:

```text
%LOCALAPPDATA%\Programs\PrinterServer
```

Los datos se guardan por separado en:

```text
%LOCALAPPDATA%\PrinterServer
  state.json        Impresoras, credencial, aplicaciones autorizadas e historial
  agent.lock        Bloqueo de instancia mientras el agente está abierto
  agent.log         Diagnóstico del lanzador y servidor
```

Actualizar o desinstalar no borra estos datos. Para una copia de seguridad consistente, cierra el agente y copia `state.json` a una ubicación privada; contiene una credencial. No lo subas al repositorio ni lo adjuntes públicamente a reportes.

### Publicar una nueva versión

1. Modifica el código, documentación y pruebas.
2. Cambia la versión desde la raíz del proyecto, por ejemplo:

   ```powershell
   npm.cmd version patch --no-git-tag-version
   ```

   Esto actualiza `package.json` y `package-lock.json`. Usa versiones `X.Y.Z`, sin sufijos. No cambies el `AppId` del instalador: permite reconocer las actualizaciones como la misma aplicación.
3. Sube los cambios del código a GitHub con tu flujo habitual.
4. En Windows, descarga esa revisión exacta y ejecuta `npm.cmd run build:windows`.
5. Completa la prueba manual descrita abajo y conserva el instalador anterior para recuperación.
6. Distribuye el instalador nuevo junto con su versión y SHA256. Generar de nuevo la misma versión reemplaza sus archivos en `dist`; incrementa la versión para cada entrega.
7. En la caja: termina las impresiones, selecciona **Salir**, respalda `state.json` y ejecuta el instalador nuevo **con la misma cuenta Windows y en la misma carpeta**. Se conservan impresoras y credencial.
8. Abre el agente y realiza un ticket de prueba.

No es necesario desinstalar antes de actualizar. El instalador pide cerrar el lanzador si sigue abierto y reemplaza las carpetas de código/runtime para no conservar dependencias obsoletas. Si ejecutabas `npm start` manualmente, debes detenerlo también.

Para actualizar el portable, cierra la aplicación y extrae la nueva versión en una carpeta nueva; evita superponer versiones. Los datos siguen estando fuera de esa carpeta.

Las versiones actuales usan el formato de datos `version: 1`. Si una versión futura cambia el formato, deberá incorporar una migración y documentar su compatibilidad. Para volver a una versión anterior tras un cambio de formato, usa el respaldo compatible; no sustituyas un archivo de datos a ciegas con el agente abierto.

Desinstala desde **Configuración → Aplicaciones**. Se eliminan los archivos de programa y el inicio automático registrado; los datos se conservan. Para borrar también la configuración, después de cerrar/desinstalar elimina manualmente la carpeta de datos, solo si ya no la necesitas.

## 6. Prueba manual antes de entregar una versión

La construcción en Windows y esta prueba física son necesarias; no pueden certificarse desde macOS.

- Generar el instalador sin errores y ejecutarlo en una cuenta estándar.
- Probar en un equipo sin Node.js instalado para confirmar que usa el runtime incluido.
- Abrir por acceso directo y verificar el icono, el panel y la detección COM.
- Guardar una impresora, salir y volver a abrir: debe conservarla y reconectar.
- Probar texto, tildes, corte y gaveta; la gaveta solo debe abrir si se solicita.
- Enviar dos solicitudes con el mismo `jobId`: debe salir un solo ticket.
- Desconectar el cable y comprobar que se comunica el error; un resultado incierto no debe reimprimirse automáticamente.
- Probar la web HTTPS real, su credencial y el permiso de acceso local del navegador.
- Probar **Salir**, segundo inicio y, si se habilitó, inicio de sesión de Windows.
- Instalar una versión posterior y comprobar que conserva impresoras, orígenes y credencial.

## 7. Problemas frecuentes

| Situación | Qué revisar |
| --- | --- |
| No se encuentra Node o npm | Reabre PowerShell y verifica que Node 22 x64 esté instalado y en PATH. |
| `npm.ps1` está bloqueado | Usa `npm.cmd` como en los comandos de este documento. |
| No se encuentra Inno Setup | Instala Inno Setup 6.3+ o usa `-IsccPath`; para ZIP solamente usa el comando portable. |
| No se puede descargar Node/dependencias | Revisa la conexión, proxy y acceso a nodejs.org y registry.npmjs.org. No omitas la comprobación SHA256. |
| Falla la carga del módulo serial | Confirma Node 22 x64 y ejecuta la generación en Windows. No reutilices `node_modules` de otra plataforma. |
| El agente no inicia | Abre `%LOCALAPPDATA%\PrinterServer\agent.log`; revisa si otra aplicación ocupa el puerto 4000. |
| Bloqueo de instancia | Cierra otras instancias. Un bloqueo de un proceso terminado se recupera al iniciar. No borres el bloqueo con un agente activo. |
| No aparecen puertos COM | Revisa cable, controlador y Administrador de dispositivos. USB directo/colas de Windows no están implementados. |
| La web recibe 401/403 | Verifica credencial y origen exacto autorizado. Cambiar de protocolo, subdominio o puerto cambia el origen. |
| Aparece enviado pero no sale papel | `sent` confirma entrega al puerto, no salida física. Revisa papel, velocidad, protocolo y equipo. |

No se incluyen actualizaciones automáticas, firma digital, impresión de etiquetas, USB directo ni instalación de controladores. La app permite preparar futuras versiones sin cambiar el flujo básico de generación.

Referencias de construcción: [mutex del instalador](https://jrsoftware.org/ishelp/topic_setup_appmutex.htm), [instalación por usuario](https://jrsoftware.org/ishelp/topic_setup_privilegesrequired.htm).
