# Aplicación de escritorio para Windows

Esta etapa añade bandeja, instancia única, preferencias y registros. El código
está preparado, pero no se han ejecutado pruebas ni recompilado el ejecutable.

## Generar la nueva versión

Cierra la versión anterior (consola o menú Salir) antes de reemplazar el archivo.

```powershell
nvm use 24.19.0
pnpm install --frozen-lockfile
pnpm build:exe
```

Salida: `dist/windows/printer-server.exe`. El comando incluye el script que
marca el ejecutable como aplicación gráfica de Windows. No se abre una consola.
Ese paso debe realizarse antes de firmar digitalmente el archivo.

La bandeja utiliza Windows PowerShell 5.1 y Windows Forms del equipo. No añade
paquetes npm. El script se incluye en el ejecutable y se extrae en la carpeta
de datos al arrancar. Una política corporativa que bloquee PowerShell, scripts
o Windows Forms puede impedir el inicio. No se modifican políticas globales ni
se solicitan permisos de administrador: Bypass se aplica solo al proceso hijo.

## Uso

- Doble clic en el icono de bandeja: abrir el panel web.
- Abrir centro de impresión: abrir el navegador.
- Ver estado: consultar si el servicio y la impresora están conectados.
- Editar configuración: abrir config.json en Bloc de notas. Guardar, salir y
  volver a abrir el programa para aplicar cambios.
- Abrir carpeta de registros: consultar errores y eventos.
- Salir: detener servidor, liberar el puerto serial y cerrar la bandeja.

Cerrar la pestaña del navegador no cierra el servidor. Windows puede colocar
el icono en el menú de iconos ocultos junto al reloj. En esta etapa se utiliza
el icono estándar de aplicación de Windows.

Abrir otra copia, aunque esté en otra carpeta, solicita abrir el panel de la
instancia existente para el mismo usuario. Las versiones antiguas sin esta
función deben cerrarse manualmente. La instancia única no depende del puerto
configurado ni deja un archivo de bloqueo después de una salida.

Con `pnpm start` se conserva la consola para desarrollo. Para activar también
la bandeja en desarrollo:

```powershell
$env:PRINTER_TRAY = 'true'
pnpm start
```

## Configuración persistente

Ubicación: `%LOCALAPPDATA%\PrinterServer\config.json`.

```json
{
  "port": 4000,
  "openBrowser": true,
  "allowedOrigins": [],
  "printer": null
}
```

Al conectar correctamente desde el panel, se guardan el puerto COM y la
velocidad. Se intenta reconectar al arrancar. Si la impresora no está
disponible, el servicio permanece abierto para conectarla manualmente.
Actualizar puertos también consulta la conexión actual.

Los orígenes deben ser exactos, por ejemplo `https://pos.example.com`, sin
barra final ni rutas. No se aceptan comodines. No hay todavía autenticación de
clientes ni aislamiento por tenant.

Las variables PORT, ALLOWED_ORIGINS y OPEN_BROWSER tienen prioridad durante
esa ejecución; no sobrescriben las preferencias guardadas.
Un JSON inválido detiene el inicio con un aviso; no se reemplaza silenciosamente.
Puedes corregirlo desde el Explorador y reiniciar el programa.

## Registros

Ubicación: `%LOCALAPPDATA%\PrinterServer\logs\printer-server.log`.
Rotación al superar aproximadamente 2 MiB, con una copia anterior `.1`.
Incluyen arranque, conexión, envío y errores, sin registrar deliberadamente
el contenido del ticket. No se envían a servicios externos.

Si la bandeja no puede iniciar o se cierra inesperadamente, el programa
informa del fallo y se detiene para no dejar un servidor oculto sin controles.
Durante el cierre se permite terminar operaciones pendientes, con un límite
de cinco segundos. Evita salir mientras se imprime.

## Alcance de esta entrega

No incluye instalador, inicio automático con Windows, firma digital,
actualizador, autenticación, etiquetas ni nuevos transportes de impresión.
El ejecutable es transportable, pero sus preferencias permanecen en el perfil
del usuario, no junto al archivo EXE. Los archivos nativos extraídos por pkg
pueden utilizar además su propia caché.

Referencias de implementación:
- https://learn.microsoft.com/en-us/windows/win32/debug/pe-format
- https://learn.microsoft.com/en-us/dotnet/desktop/winforms/controls/how-to-associate-a-shortcut-menu-with-a-windows-forms-notifyicon-component


## Sitios autorizados desde el panel

En la columna de impresoras, abrir **Sitios autorizados**. Pegar la URL del SaaS
y pulsar Autorizar. Se guarda solo el origen exacto (protocolo, dominio y puerto),
sin rutas: autorizar /admin también autoriza las demás páginas del mismo origen.
No incluye otros subdominios. Se exige HTTPS, excepto HTTP de loopback para desarrollo.
No admite comodines ni credenciales incluidas en la URL.

Los cambios hechos aquí se persisten en config.json y se aplican inmediatamente,
sin reiniciar ni recompilar. Los permisos existentes se conservan. Quitar un sitio
bloquea solicitudes futuras; no cancela trabajos ya aceptados ni elimina sus datos.
El campo path de impresión no cambia la impresora seleccionada.

GET/POST /settings/sites y POST /settings/sites/remove están reservados al panel local,
con la misma protección que listar o seleccionar impresoras. La web autorizada
para imprimir no puede consultar ni modificar la lista de sitios.

Si ALLOWED_ORIGINS está definida en el entorno, la lista se muestra en solo lectura:
retirar la variable y reiniciar para volver a administrar el archivo desde el panel.
Los cambios manuales en config.json todavía requieren reinicio.

Esta entrega no añade credenciales, autenticación por usuario/tenant, cancelación de
cola ni prevención de duplicados. No se ejecutaron pruebas ni se generó un EXE.

