# Sonora MCP

Servidor **[MCP](https://modelcontextprotocol.io) de Spotify**, pequeño y centrado en seguridad. Pídele a tu
asistente de IA qué está sonando, busca en el catálogo y (opcionalmente) reproduce o pausa música.

- **OAuth Authorization Code + PKCE, sin Client Secret.**
- **Mínimo privilegio**: el modo `read-only` (por defecto) pide solo dos scopes de lectura. Las herramientas de escritura **no se registran** salvo en modo `playback`.
- **Tokens fuera del repo**: `~/.config/sonora-mcp/` (directorio `0700`, archivo `0600`, escritura atómica, refresh automático).
- **Sin telemetría**; solo `accounts.spotify.com` y `api.spotify.com`.

## Instalación (desde el código fuente)

```bash
git clone https://github.com/encodi/sonora-mcp.git && cd sonora-mcp
npm ci && npm run build        # requiere Node >= 24
```

## Crear la app en Spotify

1. Entra a <https://developer.spotify.com/dashboard> → **Create app**.
2. En **Redirect URIs** agrega **exactamente** `http://127.0.0.1:8888/callback` (usa `127.0.0.1`, no `localhost`).
3. API a usar: **Web API**. Guarda.
4. Copia el **Client ID** (Settings). No necesitas el Client Secret.
5. En **User management** asegúrate de que tu cuenta esté en la lista (Development Mode: máx. 5 usuarios; el dueño de la app necesita **Premium**).

## Login y uso

```bash
export SPOTIFY_CLIENT_ID=<tu client id>
node dist/index.js login                 # solo lectura
node dist/index.js login --mode playback # habilita play/pause
node dist/index.js status | logout
```

Configuración del cliente MCP (rutas absolutas):

```json
{
  "mcpServers": {
    "sonora": {
      "command": "node",
      "args": ["/ruta/absoluta/sonora-mcp/dist/index.js"],
      "env": { "SPOTIFY_CLIENT_ID": "<tu client id>", "SONORA_MODE": "read-only" }
    }
  }
}
```

Más detalles (variables, seguridad, roadmap) en el [README en inglés](README.md).
Licencia MIT © 2026 Enrique Coronado.
