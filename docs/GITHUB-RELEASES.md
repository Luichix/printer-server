# Publicar descargas en GitHub

Repositorio: https://github.com/Luichix/printer-server

El README muestra los enlaces. La automatización está en
.github/workflows/release-windows.yml, no en el README.

## Costos y alcance

La configuración usa windows-2022 estándar de GitHub Actions. Las compilaciones
en runners estándar son gratuitas para repositorios públicos según la política
actual de GitHub. No usa GitHub Packages, Git LFS, runners grandes ni un equipo
propio. No guarda artefactos ni cachés de Actions; adjunta los paquetes a Releases.
Si el repositorio pasa a privado o cambias los runners, revisa las condiciones.

Las Releases publicadas y sus archivos son públicos. Los borradores solo son
visibles para usuarios con acceso apropiado al repositorio. No subas secretos,
datos de clientes ni configuraciones locales al código o a los paquetes.

## Primera entrega

1. Guardar en un commit y subir todos los cambios necesarios de código,
   configuración y empaquetado, incluido el workflow y pnpm-lock.yaml.
   No añadir node_modules, config.json ni archivos generados de dist/.
2. Comprobar que package.json tenga la versión que quieres publicar: por ejemplo 1.0.0.
3. Crear una etiqueta en ese commit y subirla:

```powershell
git tag -a v1.0.0 -m "Printer Server 1.0.0"
git push origin v1.0.0
```

Un commit normal NO inicia la compilación. Subir una etiqueta vX.Y.Z sí.
Debe coincidir con package.json. No reutilizar etiquetas de versiones publicadas.

4. En GitHub, abrir Actions y seguir «Preparar release de Windows».
5. Al terminar, abrir Releases: habrá un borrador con ZIP, instalador y hashes.
6. Descargar y comprobar los paquetes. Editar las notas y pulsar Publish release.
   El enlace /releases/latest solo funcionará al existir una release publicada
   que GitHub considere la última. Antes, usar /releases para ver el estado.

Para entregas posteriores, actualizar version en package.json, guardar y subir
el cambio, y repetir con otra etiqueta (por ejemplo v1.0.1).

## Qué hace GitHub

Prepara Node según .nvmrc, pnpm 11.19.0, instala con --frozen-lockfile y ejecuta
pnpm build:release. El entorno Windows ya incluye Inno Setup; no necesitas
instalarlo localmente si solo construyes con este flujo.

Usa GITHUB_TOKEN temporal para adjuntar archivos. No necesitas crear un token
personal ni guardar tu contraseña. El permiso contents:write está limitado al
trabajo que prepara la release. No hay ejecuciones desde pull requests.

No ejecuta pruebas ni arranca la aplicación. Crear paquetes no confirma que
funcionen con los dispositivos del cliente. Los binarios siguen sin firma digital.

## Si falla

Consultar el paso fallido en Actions. Un error de compilación no publica una
release. Si falló al subir archivos, puede quedar un borrador incompleto:
volver a ejecutar el workflow completa/sustituye sus cuatro adjuntos.
Nunca reemplaza archivos de una release publicada.

Si la política de la organización bloquea Actions o contents:write, el dueño
del repositorio debe habilitar lo necesario. Si cambia la imagen de GitHub y
desaparece Inno Setup, el empaquetado falla con instrucciones para localizar ISCC.

## Enlaces

- Descargas: https://github.com/Luichix/printer-server/releases
- Última publicación: https://github.com/Luichix/printer-server/releases/latest
- Compilaciones: https://github.com/Luichix/printer-server/actions

Referencias:
https://docs.github.com/en/billing/concepts/product-billing/github-actions
https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases

