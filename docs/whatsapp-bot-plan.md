# Plan: bot de WhatsApp para Qwen Studio

> Estado: **planificación**, sin implementar. Pendiente de decidir el canal, en qué chats o grupos corre y quién puede usarlo.

## Idea central
WhatsApp ya ofrece casi todo lo que tiene el editor web:

| Gesto en WhatsApp | Equivale a |
|---|---|
| Responder a un mensaje | "Edita esta imagen" |
| Lápiz de WhatsApp (círculo rojo) | Modo anotación de Qwen-Image 2.1 |
| Álbum de fotos | Imágenes de referencia |
| @menciones | Elegir personas registradas |
| Stickers | Mensaje nativo, sin conversión |

El bot no necesita una interfaz propia. Traduce esos gestos a los trabajos que ya expone la API de la app: `t2i`, `edit`, `sticker_*`, `meme`, `group`, `upscale`, `enhance` y rerun (variante o final).

## Qué puede hacer el usuario
| En WhatsApp | Qué hace el bot | Trabajo de la API |
|---|---|---|
| `/imagen un perezoso surfeando en Limón` | Mejora el prompt automáticamente (GTX 1070) y genera en calidad "Rápida" | `enhance` → `t2i` |
| Responde a una imagen: "ponele lentes de sol" | Edita esa imagen | `edit` (con `enhance` I2I) |
| Dibuja un círculo con el lápiz de WhatsApp: "cambiá lo del círculo por un gato" | Modo anotación. Si la imagen la mandó el bot, usa su original limpio como `<image1>` | `edit` anotación |
| Álbum + "ponele esta camisa a la persona de la foto 1" | Hasta 3 referencias | `edit` |
| Foto con `/sticker` o `/sticker un tucán feliz` | Sticker transparente real, enviado como **sticker nativo** (WebP 512) | `sticker_extract` / `sticker_generate` |
| Responde **"otra"**, **"final"** o **"hd"** | Otra variante (reusa la caché, es más rápida), render final a 30 pasos con la misma semilla, o ampliación 2× | rerun `variant` / `final`, `upscale` |
| `/meme` respondiendo a un meme + `@Ana` | Pone la cara de Ana en el meme usando su foto registrada | `meme` |
| `@Ana @Luis en una batalla medieval` | Foto grupal con las fotos registradas | `group` |

## Registro de personas y consentimiento (obligatorio)
- `/registrarme`: el bot pide 1–3 selfies y un **"ACEPTO"** explícito. Guarda teléfono, fotos y fecha del consentimiento.
- `/borrarme`: elimina todos sus datos.
- Solo se pueden usar en meme o foto grupal las personas registradas. Si alguien @menciona a una persona no registrada, el bot se niega.
- Las @menciones llegan como número de teléfono, así que el registro mapea número → fotos directamente.
- Se reusan el filtro de contenido (nada sexual, humillante ni con menores) y la retención de 24 h. Las fotos de rostros son datos personales según la **Ley 8968** de Costa Rica.

## Detalles que marcan la diferencia
- **Cola:** hay una sola RTX 3060, así que el bot contesta de inmediato ("En cola, posición 2, ~2 min") y después manda el resultado. Tiene límites por usuario (por ejemplo, 10 imágenes por hora) y por grupo.
- **Compresión:** WhatsApp convierte las imágenes a JPEG y les quita la transparencia. Los resultados final y HD se mandan como **documento** (PNG sin pérdida); los rápidos, como imagen normal.
- **Velocidad:** calidad "Rápida" por defecto; "final" o "hd" cuando alguien quiere quedarse con un resultado. Es el mismo flujo de borrador → final de la app web.

## Arquitectura
```
WhatsApp ──► bot (contenedor Node, sin GPU) ──► http://app:3000/api ──► ComfyUI (3060) / llama.cpp (1070)
               │
               └─ SQLite propio: usuarios, consentimientos, fotos, grupos, mensaje ↔ trabajo
```
- Contenedor nuevo `bot` en `docker-compose.yml`, que solo habla con la API de la app. No agrega carga ni lógica de modelos.
- Guarda qué trabajo generó cada mensaje, para saber a qué imagen se refiere una respuesta ("otra", "final", ediciones).
- No publica puertos. Con Baileys solo necesita conexión saliente; con la Cloud API necesita un webhook público (sirve el Cloudflare Tunnel que ya existe).
- Adaptador de canal: una interfaz común (recibir mensaje, enviar imagen, sticker o documento) para poder cambiar de Baileys a Cloud API sin reescribir el bot.

## La decisión grande: el canal
| | **Baileys** (no oficial) | **WhatsApp Cloud API** (oficial) |
|---|---|---|
| Grupos | ✅ Funciona en grupos normales | ❌ Sobre todo chats 1 a 1 (Meta abrió un soporte de grupos limitado; hay que verificarlo) |
| Configuración | Escanear un QR con un número secundario | Cuenta Business, verificación y webhook público |
| Riesgo | **El número puede ser baneado**; va contra los términos de WhatsApp | Estable y legal; costo por conversación |

**Recomendación:** Baileys con un **número secundario** para uso personal con amigos, detrás del adaptador de canal. Con la Qwen Research License tampoco es para monetizar.

## Fases
1. **MVP** (chat 1 a 1 o un grupo de prueba): `/imagen` con mejora automática, responder para editar, círculos, stickers, "otra", "final" y "hd", y mensajes de cola.
2. **Personas:** registro y consentimiento, `/meme` y fotos grupales con @menciones.
3. **Lenguaje natural:** entender "hacé un sticker de esto" sin comandos (un LLM pequeño que clasifique la intención), configuración por grupo y comandos de administrador.

## Decisiones pendientes
1. Canal: Baileys con número secundario, o Cloud API.
2. En qué chats o grupos corre.
3. Quién puede usarlo: todos en el grupo o una lista de permitidos.

## Riesgos
- Baneo del número (Baileys).
- Carga de la GPU si varios grupos lo usan a la vez: una sola 3060 procesa un trabajo a la vez.
- Uso de rostros de personas reales: requiere consentimiento registrado y filtro de contenido.
- Licencia de Qwen-Image 2.1: no es para uso comercial sin revisarla.
