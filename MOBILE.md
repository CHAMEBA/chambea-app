# CHAMBEA móvil

Rama de desarrollo: `development/capacitor-mobile`. No cambia la aplicación publicada ni la rama principal. Capacitor 8.5.3 comparte el `index.html` existente entre web, Android e iOS, sin cambios visuales. `npm run build` copia ese archivo a `www`; `npm run mobile:sync` copia los recursos a los proyectos nativos. Edita la fuente original, no las copias generadas. Los recursos nativos predeterminados de Capacitor son provisionales: los iconos y pantallas de arranque definitivos requieren aprobación y recursos de marca; no se sustituyeron recursos existentes.

## Desarrollo y compilación en la nube

Usa Node 22 o superior y `npm ci`, después `npm run mobile:sync`.

Las versiones de Capacitor y el lockfile están fijados. El override `xcode → uuid 11.1.1` elimina una vulnerabilidad de la dependencia de desarrollo; la sincronización y el análisis del proyecto Xcode se comprobaron con esa versión. No altera las dependencias que ejecuta la aplicación.

Android: Java 21, SDK 36, build-tools 36.0.0; Android mínimo 7.0 (API 24). `npm run android:debug` genera `android/app/build/outputs/apk/debug/app-debug.apk`. El APK usa la firma automática de depuración, no necesita una clave privada de distribución y no sirve para publicar en las tiendas.

El workflow `.github/workflows/mobile-build.yml` compila Android y ejecuta lint, conserva el APK durante 14 días y compila iOS para simulador sin firma. Se activa al subir esta rama, en los pull requests relevantes y manualmente desde Actions. No publica ni despliega. Cuando la rama esté en GitHub, abre Actions → Mobile test builds → ejecución correcta → artefacto `chambea-android-debug`; descarga el ZIP y extrae el APK. En el teléfono Android se necesita permitir instalaciones desde esa fuente. Ningún IDE debe instalarse en tu computadora. GitHub Actions debe estar habilitado y disponer de cuota, especialmente para macOS en repositorios privados.

## Firebase y pruebas en teléfonos

Se conserva el SDK web de Firebase y su configuración pública existente; no se añadieron credenciales privadas. El SDK sigue descargándose de `www.gstatic.com`, por lo que autenticación y perfiles requieren Internet. Las solicitudes se guardan en localStorage del WebView: no se transfieren automáticamente desde un navegador ni entre dispositivos.

Probar en dispositivos: navegación, búsqueda, teclado, áreas seguras, botón Atrás en Android, solicitudes tras reiniciar, y con una cuenta de prueba autorizada, inicio de sesión y lectura/guardado del perfil. No se han validado estas operaciones en teléfonos. No habilitar lecturas públicas de Firestore para resolver errores de permisos. Esta versión conserva autenticación por correo y contraseña, sin añadir flujos OAuth o autenticación nativa.

## iPhone y TestFlight

Proyecto `ios/App/App.xcodeproj`, dependencias mediante Swift Package Manager; mínimo iOS 15. El identificador provisional es `com.chambea.app` en ambas plataformas: confirmar disponibilidad y titularidad antes de registrar la aplicación. La compilación para simulador no produce una versión instalable por TestFlight.

Para TestFlight faltan: membresía Apple Developer, aplicación e identificador en App Store Connect, equipo de firma y perfiles de distribución, icono aprobado, versiones y número de compilación, información de privacidad y declaración de cifrado. Se necesita un runner macOS con una versión de Xcode/SDK aceptada por Apple al distribuir. Luego se crea un archive Release para dispositivo, se firma, exporta y sube a App Store Connect, donde Apple procesa la compilación; testers externos pueden requerir revisión beta.

La firma y carga se deben configurar en un gestor seguro de secretos/CI o servicio de compilación autorizado, nunca en archivos del repositorio ni por chat. Este workflow no archiva, firma, carga a TestFlight ni publica en App Store o Google Play. Revisar los requisitos de las tiendas y probar en dispositivos antes de distribuir esta envoltura web.

## Resultados comprobados en este entorno

- `npm ci`, build web y sincronización Android/iOS: correctos. Se comprobó igualdad exacta con el HTML original, también dentro del APK.
- `npm audit`: cero vulnerabilidades tras el override de desarrollo documentado arriba.
- Android: `assembleDebug lintDebug` completó correctamente con SDK 36, build-tools 36.0.0, Gradle 8.14.3 y un JDK 21 completo. APK de aproximadamente 4 MB, firma v2 comprobada con `apksigner verify`.
- Lint de la aplicación: cero errores y 14 advertencias de la plantilla (recursos sin uso, iconos, splash y orden del manifiesto). Se conservaron los recursos para no introducir cambios visuales sin aprobación. Capacitor incorpora su propio baseline de lint; no se añadieron exclusiones para forzar la aprobación.
- Los fallos iniciales de Android fueron del entorno: Java no usaba el proxy y el Java preinstalado era un runtime sin compilador. Se corrigieron usando el proxy con su CA confiable y un JDK completo, sin desactivar TLS. Las descargas de herramientas se verificaron contra checksums oficiales. Las herramientas se instalaron fuera del repositorio, únicamente en la máquina en la nube.
- iOS: proyecto, plist y sincronización verificados; no se ejecutó Xcode porque el entorno es Linux. El job macOS prepara esa comprobación, sin firma.
- La rama se subió a GitHub. No se pudo consultar el resultado de Actions mediante la API (`Forbidden`), por lo que no se afirma que los jobs remotos hayan pasado. Revisar su resultado en la pestaña Actions y descargar el artefacto cuando Android termine correctamente.
- Pendientes: pruebas en teléfonos, autenticación con una cuenta de prueba y permisos de perfiles Firebase desde los WebViews, confirmación del identificador y recursos de marca, y firma/distribución iOS. No se realizaron escrituras en Firebase ni publicaciones.
